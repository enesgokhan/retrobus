-- Hiding something has to actually take it away.
--
-- `cards_select` and `feedback_select` both stopped at "is this stage open to
-- you yet?" and said nothing about `hidden`. So a hidden row was still SELECTed
-- into every passenger's browser and removed only in JavaScript:
--
--   BoardStage.tsx:133         cards.filter((c) => isHost || !c.hidden)
--   FeedbackWallStage.tsx:209  items.filter((i) => isHost || !i.hidden)
--
-- The data had already arrived. Anyone with devtools open — or anyone reading
-- the network tab, or a browser extension — could read a card the host had
-- just taken down. On the feedback wall that is anonymous writing about a named
-- teammate, taken down precisely because it should not be up, and it is the
-- single most sensitive thing this application stores.
--
-- The host keeps seeing hidden rows, because the host is the one who has to be
-- able to put them back.

drop policy if exists cards_select on public.cards;
create policy cards_select on public.cards
  for select to authenticated using (
    auth_member_id() is not null
    and (not hidden or auth_is_host())
    and exists (
      select 1 from stages s
      where s.id = cards.stage_id
        and (
          s.state in ('revealed', 'closed')
          or coalesce(s.config ->> 'reveal', 'batch') = 'live'
          or auth_is_host()
        )
    )
  );

drop policy if exists feedback_select on public.feedback_items;
create policy feedback_select on public.feedback_items
  for select to authenticated using (
    auth_member_id() is not null
    and (not hidden or auth_is_host())
    and exists (
      select 1 from stages s
      where s.id = feedback_items.stage_id and s.state in ('revealed', 'closed')
    )
  );
