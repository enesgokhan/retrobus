-- Retrobüs 0018 — Fibbage: close the two side channels around the opaque options.
--
-- 0017 handed the options back with is_truth = null during the guess phase, on
-- the theory that a client which is never told which one is true cannot cheat.
-- An adversarial review found two independent ways through, and both are one
-- line of console work, not an exotic attack:
--
-- 1. SET SUBTRACTION. fib_options returned each lie under its REAL primary key
--    (fibbage_lies.id), while the truth got a random token. fibbage_lies is
--    independently readable — 0004 grants select(id, ...) and its policy admits
--    the guess phase — so the one opt_id that does NOT appear in
--    `select id from fibbage_lies` is the truth. No timing, no probing.
--
-- 2. THE PICK ANSWERED THE QUESTION. pick_fib_option resolved the token
--    server-side and stored the verdict in fibbage_picks.picked_truth, a row
--    the picker may read back (0004: fib_picks_select allows
--    picker_member_id = auth_member_id() in every phase), and it upserts — so a
--    passenger could try every option in turn and read the boolean each time.
--    Worse, no tooling was needed: picking a lie highlighted that card, picking
--    the truth highlighted nothing, so "nothing lit up" announced the answer.
--
-- The fix is to stop clients reading these tables at all. Everything a screen
-- needs now comes from two functions that answer according to the phase, and
-- every option — lie or truth — travels under a per-round token that means
-- nothing anywhere else.

-- ---------------------------------------------------------------- tokens
alter table public.fibbage_lies
  add column if not exists opt_token uuid not null default gen_random_uuid();

-- Nothing outside a SECURITY DEFINER function reads these any more.
revoke select on public.fibbage_lies from authenticated;
revoke select on public.fibbage_picks from authenticated;

-- ---------------------------------------------------------------- options
-- Every option under a token that is meaningless outside this round, so the
-- lie ids can no longer be diffed against anything.
-- (The shape changes, so the old one has to go first.)
drop function if exists public.fib_options(uuid);
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
    select
      l.opt_token,
      l.body,
      case when v_revealed then false else null end,
      -- you must know your own lie so the UI can stop you picking it; that is
      -- knowledge you already have, since you wrote it
      l.author_member_id = v_member,
      case when v_revealed then m.display_name else null end
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
    where k.round_id = p_round_id;
end;
$$;
revoke all on function public.fib_options(uuid) from public, anon;
grant execute on function public.fib_options(uuid) to authenticated;

-- ---------------------------------------------------------------- picking
create or replace function public.pick_fib_option(p_round_id uuid, p_opt_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_member uuid := auth_member_id();
  v_phase text;
  v_is_truth boolean;
  v_lie fibbage_lies;
begin
  if v_member is null then raise exception 'not a member' using errcode = '28000'; end if;
  select r.phase into v_phase from fibbage_rounds r where r.id = p_round_id;
  if v_phase is distinct from 'guess' then raise exception 'not guessing' using errcode = 'P0002'; end if;

  -- One pick per person per round. The upsert that used to be here let a
  -- passenger walk every option while reading the verdict back.
  if exists (
    select 1 from fibbage_picks
    where round_id = p_round_id and picker_member_id = v_member
  ) then
    raise exception 'already picked' using errcode = 'P0005';
  end if;

  v_is_truth := exists (
    select 1 from fibbage_keys k where k.round_id = p_round_id and k.truth_token = p_opt_id
  );
  if not v_is_truth then
    select l.* into v_lie from fibbage_lies l
    where l.round_id = p_round_id and l.opt_token = p_opt_id;
    if not found then raise exception 'unknown option' using errcode = 'P0002'; end if;
    if v_lie.author_member_id = v_member then
      raise exception 'cannot pick your own lie' using errcode = 'P0005';
    end if;
  end if;

  insert into fibbage_picks (round_id, picker_member_id, lie_id, picked_truth, picked_token)
  values (p_round_id, v_member, case when v_is_truth then null else v_lie.id end, v_is_truth, p_opt_id);
end;
$$;
revoke all on function public.pick_fib_option(uuid, uuid) from public, anon;
grant execute on function public.pick_fib_option(uuid, uuid) to authenticated;

alter table public.fibbage_picks
  add column if not exists picked_token uuid;

-- ---------------------------------------------------------------- state
-- What the screen may know, decided here rather than by column grants (which
-- cannot vary by phase). During the guess it returns only your OWN choice, as a
-- token — never whether it was right. At the reveal it returns everything.
create or replace function public.fib_state(p_round_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_member uuid := auth_member_id();
  v_phase text;
  v_mine uuid;
  v_total int;
  v_takers jsonb;
begin
  if v_member is null then raise exception 'not a member' using errcode = '28000'; end if;
  select r.phase into v_phase from fibbage_rounds r where r.id = p_round_id;
  if v_phase is null then return jsonb_build_object('phase', null); end if;

  select p.picked_token into v_mine from fibbage_picks p
   where p.round_id = p_round_id and p.picker_member_id = v_member;
  select count(*) into v_total from fibbage_picks p where p.round_id = p_round_id;

  if v_phase = 'revealed' then
    select coalesce(jsonb_object_agg(t.tok, t.names), '{}'::jsonb) into v_takers
    from (
      select p.picked_token::text as tok, jsonb_agg(m.display_name order by m.display_name) as names
      from fibbage_picks p join members m on m.id = p.picker_member_id
      where p.round_id = p_round_id and p.picked_token is not null
      group by p.picked_token
    ) t;
  else
    v_takers := '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'phase', v_phase,
    'my_pick', v_mine,
    'picked_count', v_total,
    'takers', v_takers
  );
end;
$$;
revoke all on function public.fib_state(uuid) from public, anon;
grant execute on function public.fib_state(uuid) to authenticated;

-- fib_authorship existed to hand out lie ids; fib_options now carries authorship
-- itself, at the reveal and never before.
drop function if exists public.fib_authorship(uuid);

-- Your own lie, and how many have been written. The screen showed both by
-- reading the whole table; neither needs that.
create or replace function public.fib_my_lie(p_round_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_member uuid := auth_member_id();
  v_body text;
  v_n int;
begin
  if v_member is null then raise exception 'not a member' using errcode = '28000'; end if;
  select l.body into v_body from fibbage_lies l
   where l.round_id = p_round_id and l.author_member_id = v_member;
  select count(*) into v_n from fibbage_lies l where l.round_id = p_round_id;
  return jsonb_build_object('body', v_body, 'written', coalesce(v_n, 0));
end;
$$;
revoke all on function public.fib_my_lie(uuid) from public, anon;
grant execute on function public.fib_my_lie(uuid) to authenticated;
