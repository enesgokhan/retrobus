-- Retrobüs 0019 — two corrections found by reviewing 0017 and 0018.
--
-- 1. THE VOTING COUNTER READ ZERO ALL PHASE.
--
-- 0017 restricted stage_progress to an allow-list, because it took an arbitrary
-- action_key and the feedback wall writes 'fb:<member_id>' — so anyone could
-- count how many people had written about a named colleague. The restriction was
-- right; the list was written from memory and got the key wrong. It permits
-- 'vote', but the key cast_dot actually writes is 'dot' (0002_discussion.sql:155),
-- so the board's "kim oyladı" progress sat at 0 for the whole voting phase and
-- the host had no idea when the room had finished.
--
-- The list is now exactly the three keys anything writes — card, dot, ranking —
-- verified against every bump_participation call in the migrations. Poll keys
-- ('poll:<id>:<choice>') stay out on purpose: counting those before the reveal
-- would leak the running result of a poll that is supposed to be closed.
create or replace function public.stage_progress(p_stage_id uuid, p_action_key text)
returns int
language plpgsql stable security definer
set search_path = public
as $$
declare v_n int;
begin
  if auth_member_id() is null then return 0; end if;
  -- an arbitrary key would turn this into a lookup of who wrote about whom
  if p_action_key not in ('card', 'dot', 'ranking') then
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

-- 2. THE TRUTH WAS ALWAYS THE LAST ROW.
--
-- fib_options builds its result with `union all`: lies first, then the truth.
-- Postgres appends in branch order, so the raw response was reliably
-- [lie, lie, lie, truth] — position N is the answer, whatever the client then
-- does with it. The UI shuffles by hashing the token, so screens were fine, but
-- anyone reading the network response got it for free.
--
-- Ordering by the token itself is a stable shuffle: it is random per round, it
-- is the same for everybody (so the room can talk about "the third one"), and it
-- carries no information about which row came from which branch.
create or replace function public.fib_options(p_round_id uuid)
returns table (opt_id uuid, body text, is_truth boolean, is_mine boolean, author text)
language plpgsql security definer
set search_path = public
as $$
declare
  v_member uuid := auth_member_id();
  v_phase text;
  v_revealed boolean;
begin
  if v_member is null then raise exception 'not a member' using errcode = '28000'; end if;
  select r.phase into v_phase from fibbage_rounds r where r.id = p_round_id;
  if v_phase is null then raise exception 'unknown round' using errcode = 'P0002'; end if;
  if v_phase = 'lie' then return; end if;
  v_revealed := v_phase = 'revealed';

  return query
  select * from (
    select
      l.opt_token as opt_id,
      l.body,
      case when v_revealed then false else null end as is_truth,
      l.author_member_id = v_member as is_mine,
      case when v_revealed then m.display_name else null end as author
    from fibbage_lies l
    join members m on m.id = l.author_member_id
    where l.round_id = p_round_id
    union all
    select
      k.truth_token,
      k.truth,
      case when v_revealed then true else null end,
      false,
      case when v_revealed then 'GERÇEK' else null end
    from fibbage_keys k
    where k.round_id = p_round_id
  ) opts
  order by opts.opt_id;
end;
$$;
revoke all on function public.fib_options(uuid) from public, anon;
grant execute on function public.fib_options(uuid) to authenticated;
