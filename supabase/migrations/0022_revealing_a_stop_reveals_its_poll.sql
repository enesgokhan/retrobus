-- Revealing a stop has to reveal what is on it.
--
-- The console has one big button. On an open stop it says "Sonuçları aç", and
-- it sets `stages.state = 'revealed'`. PollStage was taught to honour that:
--
--   PollStage.tsx:116  const stageRevealed = stage.state === 'revealed' || 'closed'
--   PollStage.tsx:118  const showResults = poll.state === … || stageRevealed
--
-- but this policy was not. It asked only about the POLL's own state, which
-- that button never touches. Measured, through the real write path
-- (`test/reveal-poll-test.mjs`): two people vote, the host presses the button,
-- and every passenger's query returns 0 of 2 rows while the screen is in
-- results mode. Nobody sees an error — they see 0%, and the honest reading of
-- 0% is "nobody voted". A retrospective that reports the wrong answer with a
-- straight face is worse than one that admits it is broken.
--
-- Two places held separate opinions about one decision, which is the same
-- fault as the hidden rows in 0021, running the other way: there the interface
-- hid what the database had already sent, here it shows what the database
-- withholds.
--
-- The left join matters: a poll can sit in the prep bank with `stage_id` null.
-- An inner join would drop those rows and make a bank poll unreadable to its
-- own author, so a null stage leaves the decision to the poll's own state.

drop policy if exists poll_responses_select on public.poll_responses;
create policy poll_responses_select on public.poll_responses
  for select to authenticated using (
    auth_member_id() is not null
    and exists (
      select 1
      from polls p
      left join stages s on s.id = p.stage_id
      where p.id = poll_responses.poll_id
        and (
          p.state in ('revealed', 'closed')
          or p.reveal = 'live'
          or s.state in ('revealed', 'closed')
          or auth_is_host()
        )
    )
  );
