-- The shared screen may count who has answered the health check — and only that.
--
-- While the room fills in the six-dimension health check, the projected screen
-- had nothing on it. The controls are hidden in presenter mode, correctly —
-- nobody votes on a projector — and nothing took their place, so six labels sat
-- there for three minutes of a three-hour meeting. It reads as a screen that
-- has stopped working, and it takes from the host the one thing they need,
-- which is knowing when to move on.
--
-- The fix is a per-dimension count of PEOPLE, which is what `stage_progress`
-- already does for the board. It returned 0 here because 0017 restricted it to
-- an allow-list, and that restriction is right and stays: the function is a
-- counting oracle over the anonymity ledger, and the feedback wall writes
-- 'fb:<member_id>', so an arbitrary key would let anyone count how many people
-- wrote about a named colleague.
--
-- So the question is only whether 'health:<dimension>' belongs on the list, and
-- the shape of the key answers it. Compare the three classes:
--
--   'card' / 'dot'          suffix is nothing. Counted. Already allowed.
--   'health:<dimension>'    suffix names a QUESTION.
--   'fb:<member_id>:<kind>' suffix names a PERSON.        Refused, permanently.
--   'poll:<id>:<choice>'    suffix names an ANSWER.       Refused, permanently.
--
-- Counting 'health:speed' says how many people answered the speed question. It
-- cannot say who, and it cannot say what they said — the ratings live in
-- health_responses, which stays sealed by its own policy until the host reveals
-- the stop. That is the same disclosure the board already makes, and strictly
-- less than the poll keys would, which is why those two stay out.
--
-- A prefix rather than six literals, because the host can name their own
-- dimensions in the stop's config. The suffix is a question's name in every
-- case; a host who put a member id there would be leaking to themselves, and
-- passengers cannot write config at all.

create or replace function public.stage_progress(p_stage_id uuid, p_action_key text)
returns int
language plpgsql stable security definer
set search_path = public
as $$
declare v_n int;
begin
  if auth_member_id() is null then return 0; end if;
  -- an arbitrary key would turn this into a lookup of who wrote about whom
  if p_action_key not in ('card', 'dot', 'ranking')
     and p_action_key not like 'health:%' then
    return 0;
  end if;
  select count(distinct member_id) into v_n
  from participation
  where stage_id = p_stage_id and action_key = p_action_key;
  return coalesce(v_n, 0);
end;
$$;
revoke all on function public.stage_progress(uuid, text) from public, anon;
grant execute on function public.stage_progress(uuid, text) to authenticated;
