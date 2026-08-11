import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { liveChannel } from '../lib/realtime'
import { submitPollResponse, type Poll, type SubmitError } from '../lib/anon'
import StageHeader from '../components/StageHeader'
import Empty from '../components/ui/Empty'
import Alert from '../components/ui/Alert'
import type { Stage } from '../lib/types'
import Icon from '../components/ui/Icon'

const ERR: Record<SubmitError, string> = {
  limit: 'Bu ankete zaten cevap verdin.',
  not_open: 'Anket şu an kapalı.',
  range: 'Geçersiz seçim.',
  auth: 'Oturumun düşmüş, tekrar giriş yap.',
  unknown: 'Gönderilemedi, tekrar dene.',
}

/** Anket durağı — aynı durakta birden fazla anket sırayla açılabilir. */
export default function PollStage({ stage, presenter = false }: { stage: Stage; presenter?: boolean }) {
  const { member } = useAuth()
  const isHost = member?.is_host ?? false
  const sb = supabase
  const [polls, setPolls] = useState<Poll[]>([])
  const [responses, setResponses] = useState<Record<string, number[]>>({})
  const [answered, setAnswered] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!member) return
    let cancelled = false

    async function load() {
      const { data } = await sb
        .from('polls')
        .select('id, stage_id, meeting_id, question, kind, options, reveal, state')
        .eq('stage_id', stage.id)
        .neq('state', 'draft')
        .order('created_at')
      if (cancelled) return
      const list = (data as Poll[]) ?? []
      setPolls(list)

      // Tallies for whichever polls we are allowed to read (RLS enforces this).
      const ids = list.map((p) => p.id)
      if (ids.length) {
        const { data: rows } = await sb.from('poll_responses').select('poll_id, choice').in('poll_id', ids)
        if (cancelled) return
        const byPoll: Record<string, number[]> = {}
        for (const r of (rows as { poll_id: string; choice: number }[]) ?? []) {
          ;(byPoll[r.poll_id] ??= []).push(r.choice)
        }
        setResponses(byPoll)
      } else {
        setResponses({})
      }

      // Which of these we have already answered, read from our own ledger.
      //
      // `answered` used to be set in one place only: the moment a click
      // succeeded. It lived in component state and nothing restored it, so a
      // reload — or a tab switch, or the remount that follows a reconnect —
      // offered every poll again as if untouched. The database is not fooled;
      // `bump_participation` caps the key at one and raises. The cost is worse
      // than a wrong tally: the app invites you to do something and then tells
      // you off for doing it, and on a shared call the natural reading is that
      // your first vote never landed.
      //
      // The ledger is per-member and `participation_select_own` restricts it to
      // your own rows, so this reads your history and nobody else's. It is the
      // same source HealthCheckStage already uses for the same question.
      const { data: ledger } = await sb
        .from('participation')
        .select('action_key, count')
        .eq('stage_id', stage.id)
      if (cancelled) return
      const mine: Record<string, boolean> = {}
      for (const row of (ledger as { action_key: string; count: number }[]) ?? []) {
        if (!row.action_key.startsWith('poll:') || row.count < 1) continue
        // 'poll:<id>' for single and the scales, 'poll:<id>:<choice>' for multi
        const [, id, choice] = row.action_key.split(':')
        mine[choice === undefined ? id : `${id}:${choice}`] = true
      }
      setAnswered(mine)
    }
    load()
    const channel = liveChannel(`poll-stage-${stage.id}`, ['polls', 'poll_responses', 'stages'], load)

    return () => {
      cancelled = true
      sb.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member, stage.id])

  async function answer(poll: Poll, choice: number) {
    setError(null)
    const err = await submitPollResponse(sb, poll.id, choice)
    if (err) setError(ERR[err])
    else
      setAnswered((a) => ({
        ...a,
        [poll.kind === 'multi' ? `${poll.id}:${choice}` : poll.id]: true,
      }))
  }

  if (!polls.length) {
    return (
      <Empty
        icon={<Icon name="poll" size={44} />}
        title={isHost ? 'Henüz anket yok' : 'Anket bekleniyor'}
        body={
          isHost
            ? 'Konsoldaki durak ayarlarından bir soru ekle — herkesin ekranında belirir.'
            : 'Birazdan bir soru gelecek.'
        }
      />
    )
  }

  const openPolls = polls.filter((x) => x.state === 'open')
  const allAnswered = openPolls.length > 0 && openPolls.every((x) => answered[x.id])

  return (
    <div className="w-full max-w-4xl flex-1 flex flex-col gap-4">
      <StageHeader
        phase={openPolls.length ? 'Oylama' : 'Sonuçlar'}
        instruction={
          !openPolls.length ? 'Sonuçlara bak.'
          : allAnswered ? 'Cevapladın — diğerlerini bekliyoruz.'
          : 'Bir seçenek işaretle.'
        }
        waiting={!openPolls.length ? false : allAnswered}
        progress={polls.length > 1 ? `${polls.length} anket` : null}
        presenter={presenter}
      />

      {error && (
        <Alert>{error}</Alert>
      )}
      {polls.map((poll) => {
        const tally = responses[poll.id] ?? []
        // The console's big "Sonuçları aç" sets the STAGE to revealed; each poll
        // also has its own state, and only that was consulted — so the host
        // pressed the most obvious button in the app and the room's screen still
        // read "Sonuçlar kapanışta açılacak".
        const stageRevealed = stage.state === 'revealed' || stage.state === 'closed'
        const showResults =
          poll.state === 'revealed' || poll.state === 'closed' || poll.reveal === 'live' || stageRevealed
        const scaleMax = poll.kind === 'scale5' ? 5 : poll.kind === 'scale10' ? 10 : 0
        const labels = scaleMax
          ? Array.from({ length: scaleMax }, (_, i) => String(i + 1))
          : poll.options
        const offset = scaleMax ? 1 : 0
        const isDone = answered[poll.id] === true

        return (
          <section key={poll.id} className="card flex flex-col gap-3">
            <h3 className={presenter ? 'text-title-1' : 'text-headline'}>{poll.question}</h3>

            <div className={scaleMax ? 'flex flex-wrap gap-2' : 'flex flex-col gap-2'}>
              {labels.map((label, i) => {
                const choice = i + offset
                const count = tally.filter((c) => c === choice).length
                const pct = tally.length ? Math.round((count / tally.length) * 100) : 0
                // A multi-choice poll caps each OPTION at one, not the poll, so
                // it is the option that has to know it has been used.
                const optionDone =
                  poll.kind === 'multi' && answered[`${poll.id}:${choice}`] === true
                const canAnswer = poll.state === 'open' && !isDone && !optionDone && !presenter

                return (
                  <button
                    key={choice}
                    className={[
                      'relative overflow-hidden rounded-lg border border-sep text-left font-semibold',
                      scaleMax ? 'px-5 py-3 min-w-14 text-center' : 'px-4 py-3',
                      canAnswer ? 'hover:border-coral' : 'cursor-default',
                    ].join(' ')}
                    onClick={() => canAnswer && answer(poll, choice)}
                    disabled={!canAnswer}
                  >
                    {showResults && (
                      <span
                        className="absolute inset-y-0 left-0 bg-amber-soft"
                        style={{ width: `${pct}%` }}
                        aria-hidden
                      />
                    )}
                    <span className="relative flex items-center justify-between gap-3">
                      <span>{label}</span>
                      {showResults && (
                        <span className="text-subhead text-label-2 tabular-nums">
                          {count} · {pct}%
                        </span>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>

            <p className="text-footnote font-semibold text-label-2">
              {poll.state === 'open'
                ? isDone
                  ? 'Cevabın kaydedildi.'
                  : poll.reveal === 'batch'
                    ? 'Sonuçlar kapanışta açılacak.'
                    : 'Sonuçlar canlı.'
                : showResults
                  ? `${tally.length} cevap`
                  : 'Kapalı.'}
            </p>
          </section>
        )
      })}
    </div>
  )
}
