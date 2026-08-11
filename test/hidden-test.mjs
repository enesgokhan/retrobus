// Hiding something must take it away, not merely stop drawing it.
//
// `cards_select` and `feedback_select` used to check only "is this stage open
// to you yet?" and said nothing about `hidden`. So a row the host took down was
// still SELECTed into every passenger's browser and removed in JavaScript:
//
//   BoardStage.tsx         cards.filter((c) => isHost || !c.hidden)
//   FeedbackWallStage.tsx  items.filter((i) => isHost || !i.hidden)
//
// The data had already arrived. On the feedback wall that is anonymous writing
// about a named teammate, taken down precisely because it should not be up.
//
// This asserts at the PAYLOAD level — what the database hands a passenger —
// because "absent from the screen" was exactly the property that already held
// while the leak was wide open.
//
// Every absence check here is paired with a CONTROL that proves the query can
// see a row when it is allowed to. Six checks in this codebase have reported
// success while measuring nothing; an absence assertion without a control is
// how that happens.
import { hostClient, testMembers } from './_clients.mjs'

let problems = 0
const bad = (m) => { problems++; console.log(`  ✗ ${m}`) }
const ok = (m) => console.log(`  ✓ ${m}`)

const api = await hostClient()
const { clients, idOf } = await testMembers(api, 1)
const guest = clients.Test1

await api.from('meetings').delete().eq('title', 'Hidden')
const { data: meeting } = await api
  .from('meetings')
  .insert({ title: 'Hidden', status: 'live' })
  .select()
  .single()

// ---------------------------------------------------------------- cards ---
console.log('\n-- a hidden card must not reach a passenger --')
{
  const { data: stage } = await api
    .from('stages')
    .insert({
      meeting_id: meeting.id,
      kind: 'board',
      title: 'Gizli Kart',
      order_index: 1,
      // live reveal so the passenger is entitled to the stage's cards at all;
      // otherwise this would pass for the wrong reason
      config: { reveal: 'live' },
      state: 'open',
    })
    .select()
    .single()

  // written through the real writer, not seeded
  for (const body of ['gorunur-kart', 'gizlenecek-kart']) {
    const { error } = await guest.rpc('submit_card', {
      p_stage_id: stage.id, p_body: body, p_column_key: null, p_max: 20,
    })
    if (error) bad(`could not write "${body}": ${error.message}`)
  }

  const { data: all } = await api.from('cards').select('id, body').eq('stage_id', stage.id)
  const target = (all ?? []).find((c) => c.body === 'gizlenecek-kart')
  if (!target) {
    bad('setup: the card to hide was never written — this test proves nothing')
  } else {
    const { error: hErr } = await api.from('cards').update({ hidden: true }).eq('id', target.id)
    if (hErr) bad(`host could not hide the card: ${hErr.message}`)

    const { data: seen } = await guest.from('cards').select('id, body').eq('stage_id', stage.id)
    const bodies = (seen ?? []).map((c) => c.body)

    // CONTROL first: if the passenger cannot see the VISIBLE card either, the
    // absence of the hidden one says nothing at all.
    if (!bodies.includes('gorunur-kart')) {
      bad(`CONTROL FAILED: passenger sees no visible card either (${bodies.length} rows) — this check cannot detect a leak`)
    } else {
      ok('control: the passenger receives the visible card')
      if (bodies.includes('gizlenecek-kart')) {
        bad('LEAK: the hidden card was delivered to the passenger')
      } else ok('the hidden card never reaches the passenger')
    }

    // and the host still gets it, or hiding would be irreversible
    const { data: hostSees } = await api.from('cards').select('body').eq('stage_id', stage.id)
    if (!(hostSees ?? []).map((c) => c.body).includes('gizlenecek-kart')) {
      bad('the host cannot see the hidden card — it could never be un-hidden')
    } else ok('the host still sees it, so it can be put back')
  }
}

// ------------------------------------------------------------- feedback ---
console.log('\n-- a hidden feedback item must not reach a passenger --')
{
  const { data: stage } = await api
    .from('stages')
    .insert({
      meeting_id: meeting.id,
      kind: 'feedback_wall',
      title: 'Gizli Geri Bildirim',
      order_index: 2,
      config: {},
      state: 'open',
    })
    .select()
    .single()

  // write ABOUT the host, so the guest is not writing about themselves
  const target = idOf('Enes')
  for (const body of ['gorunur-not', 'gizlenecek-not']) {
    const { error } = await guest.rpc('submit_feedback', {
      p_stage_id: stage.id, p_target_member_id: target, p_kind: 'kudos', p_body: body,
    })
    if (error) bad(`could not write "${body}": ${error.message}`)
  }

  // the wall is batch-revealed; nothing is readable before that
  await api.from('stages').update({ state: 'revealed' }).eq('id', stage.id)

  const { data: all } = await api
    .from('feedback_items')
    .select('id, body')
    .eq('stage_id', stage.id)
  const toHide = (all ?? []).find((i) => i.body === 'gizlenecek-not')
  if (!toHide) {
    bad('setup: the feedback item to hide was never written — this test proves nothing')
  } else {
    await api.from('feedback_items').update({ hidden: true }).eq('id', toHide.id)

    const { data: seen } = await guest
      .from('feedback_items')
      .select('id, body')
      .eq('stage_id', stage.id)
    const bodies = (seen ?? []).map((i) => i.body)

    if (!bodies.includes('gorunur-not')) {
      bad(`CONTROL FAILED: passenger sees no visible feedback either (${bodies.length} rows) — this check cannot detect a leak`)
    } else {
      ok('control: the passenger receives the visible note')
      if (bodies.includes('gizlenecek-not')) {
        bad('LEAK: the hidden feedback item was delivered to the passenger')
      } else ok('the hidden note never reaches the passenger')
    }
  }
}

await api.from('meetings').delete().eq('id', meeting.id)
console.log(problems ? `\n${problems} CHECK(S) FAILED` : '\nALL CHECKS PASSED')
process.exit(problems ? 1 : 0)
