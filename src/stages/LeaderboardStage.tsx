import { useEffect, useState } from 'react'
import { useLeaderboard } from '../lib/useLeaderboard'
import { fireConfetti } from '../lib/celebrate'
import Empty from '../components/ui/Empty'
import type { Stage } from '../lib/types'
import Icon from '../components/ui/Icon'

const PODIUM = ['🥇', '🥈', '🥉']

/**
 * Şampiyonluk tablosu.
 * Sıralama toplantı boyunca gizli tutulur; burada aşağıdan yukarıya doğru
 * açılır — gerilim işin bütün amacı.
 */
export default function LeaderboardStage({ stage, presenter = false }: { stage: Stage; presenter?: boolean }) {
  const rows = useLeaderboard(stage.meeting_id)
  const revealed = stage.state === 'revealed' || stage.state === 'closed'
  // how many places are shown, counting up from last
  const [shown, setShown] = useState(0)

  useEffect(() => {
    // Guard on rows too: a presenter tab opened AFTER the host revealed mounts
    // with an empty board, fires confetti into a blank gold page, and then
    // replays the whole reveal when the rows arrive.
    if (!revealed || !rows.length) {
      setShown(0)
      return
    }
    // An accelerando, not a metronome: the last three places get progressively
    // more room, and first place gets a hold before it lands.
    const delayFor = (placesLeft: number) =>
      placesLeft === 1 ? 2600 : placesLeft === 2 ? 1600 : placesLeft === 3 ? 1100 : 550

    let n = 0
    let timer: ReturnType<typeof setTimeout>
    let burst: ReturnType<typeof setTimeout>
    const step = () => {
      n += 1
      setShown(n)
      if (n >= rows.length) {
        // Celebrate a result, never an empty table. If the games were skipped
        // for time every score is zero, the caption says exactly that, and
        // confetti over it reads as the app not understanding its own evening.
        if (rows.some((r) => r.points > 0)) {
          // let the room read the name before the screen fills with paper
          burst = setTimeout(fireConfetti, 500)
        }
        return
      }
      timer = setTimeout(step, delayFor(rows.length - n))
    }
    timer = setTimeout(step, delayFor(rows.length))
    return () => {
      clearTimeout(timer)
      clearTimeout(burst)
    }
  }, [revealed, rows.length])

  if (!revealed) {
    return (
      <Empty
        size={presenter ? 'lg' : 'md'}
        icon={<Icon name="leaderboard" size={44} />}
        title="Sıralama gizli"
        body={
          <>
            Akşam boyunca toplanan puanlar burada, sondan başa doğru açılacak.
            {rows.length > 0 && ` ${rows.length} kişi sırada.`}
          </>
        }
        hint="Sonuçlar açıldığında herkesin ekranında aynı anda görünür."
      />
    )
  }

  // build bottom-up so the winner lands last
  const ordered = [...rows]
  const visibleFromIndex = Math.max(0, ordered.length - shown)
  const champion = ordered[0]
  const championIn = shown >= ordered.length
  // Nobody scored: crowning whoever happens to sort first is worse than
  // crowning nobody. This happens whenever the games get skipped for time.
  const anyPoints = ordered.some((r) => r.points > 0)
  // A real tie at the top should say so rather than picking one silently.
  const topScore = champion?.points ?? 0
  const cochampions = ordered.filter((r) => r.points === topScore && topScore > 0)

  const rest = ordered.slice(anyPoints ? Math.max(1, cochampions.length) : 0)
  const restOffset = anyPoints ? Math.max(1, cochampions.length) : 0

  return (
    <div className={['w-full mx-auto flex-1 flex flex-col gap-5', presenter ? 'max-w-4xl' : 'max-w-3xl'].join(' ')}>
      {/* First place is not fourth place with a 5% scale on it. The whole
          screen is one moment, so the champion gets a surface of its own, the
          top of the ramp, and the only colour on the page. */}
      {champion && anyPoints && (
        <div
          className={[
            'card-tinted flex flex-col items-center gap-2 text-center',
            'transition-all duration-700 ease-out',
            presenter ? 'py-12' : 'py-9',
            championIn ? 'opacity-100 scale-100' : 'opacity-0 scale-95',
          ].join(' ')}
        >
          {/* every co-champion gets their own face; printing two names under one
              person's avatar quietly demoted the other one */}
          <div className="flex items-end justify-center gap-3 leading-none" aria-hidden>
            {(cochampions.length > 1 ? cochampions : [champion]).map((c) => (
              <span
                key={c.member_id}
                className={presenter ? 'text-[7rem] leading-none' : 'text-7xl leading-none'}
              >
                {c.avatar || '🙂'}
              </span>
            ))}
          </div>
          <div className={['text-balance px-4', presenter ? 'text-display' : 'text-title-1'].join(' ')}>
            {cochampions.length > 1
              ? cochampions.map((c) => c.display_name).join(' & ')
              : champion.display_name}
          </div>
          <div
            className={['nums text-(--tint) leading-none', presenter ? 'text-[7rem]' : 'text-display'].join(
              ' ',
            )}
          >
            {champion.points}
          </div>
          <div className="eyebrow text-label-2">
            {cochampions.length > 1 ? `${cochampions.length} kişi berabere` : 'Şampiyon'}
          </div>
        </div>
      )}

      {/* Everyone else, as one table. Fifteen individually-bordered cards with
          offset shadows read as fifteen buttons; a scoreboard is a list. */}
      {rest.length > 0 && (
        <div className="list-group">
          {rest.map((r, idx) => {
            const i = idx + restOffset
            const place = i + 1
            const visible = i >= visibleFromIndex
            return (
              <div
                key={r.member_id}
                className={[
                  'list-row transition-all duration-500 ease-out',
                  presenter ? 'py-5' : 'py-3.5',
                  visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2',
                ].join(' ')}
              >
                <span
                  className={[
                    'shrink-0 text-center nums text-label-3',
                    presenter ? 'w-16 text-title-2' : 'w-10 text-title-3',
                  ].join(' ')}
                  aria-hidden
                >
                  {/* a medal next to a zero is a promise the evening did not keep */}
                  {anyPoints ? (PODIUM[i] ?? place) : place}
                </span>
                <span className={presenter ? 'text-5xl' : 'text-3xl'} aria-hidden>
                  {r.avatar || '🙂'}
                </span>
                <span
                  className={['flex-1 min-w-0 truncate', presenter ? 'text-title-1' : 'text-title-3'].join(
                    ' ',
                  )}
                >
                  {r.display_name}
                </span>
                <span
                  className={['nums shrink-0', presenter ? 'text-title-1' : 'text-title-2'].join(' ')}
                >
                  {r.points}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {!anyPoints && championIn && (
        <p className="text-center text-subhead text-label-2">
          Bu akşam puan toplanmadı — tablo eşit.
        </p>
      )}

      {shown < ordered.length && (
        <p className="text-center text-footnote text-label-3 animate-pulse">açılıyor…</p>
      )}
    </div>
  )
}
