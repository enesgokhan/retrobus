-- Retrobüs 0017 — Fibbage: the truth has to be pickable, without being readable.
--
-- 0016 fixed half of a bug and created the other half. It moved the truth into
-- fibbage_keys so the PROMPT would be readable during the lie phase, then gated
-- the key on `auth_is_host() or phase = 'revealed'`. But the guess phase is
-- exactly when the truth must appear on screen, mixed in among the lies. So:
--
--   * every passenger was shown only the lies and asked "which is the truth?"
--   * the +1000 'found the truth' award became unreachable for the whole room
--   * the host, exempt from the policy, saw one MORE option than anyone else —
--     including on the shared /sunum screen, so the room could see an option
--     that was on nobody's phone
--
-- The same bug, displaced by one phase. The lesson is that "can this role read
-- it?" has to be asked for every phase, not just the one being fixed.
--
-- Simply opening the key during 'guess' would work and is what a quick fix would
-- do — but then the answer sits in a JSON response with the field literally
-- named "truth", so anyone who opens devtools wins every round. Instead the
-- options are assembled server-side and handed back opaque: each carries a
-- random id, and which one is true is not stated until the reveal.

alter table public.fibbage_keys
  add column if not exists truth_token uuid not null default gen_random_uuid(),
  add column if not exists sort_seed numeric not null default random();

-- Lies and the truth as one indistinguishable list.
--
-- Returns is_truth only once the round is revealed; during 'guess' every row
-- looks the same, so the payload gives nothing away.
create or replace function public.fib_options(p_round_id uuid)
returns table (opt_id uuid, body text, is_truth boolean)
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
  -- nothing to show while people are still writing
  if v_phase = 'lie' then return; end if;
  v_revealed := v_phase = 'revealed';

  return query
    select l.id, l.body, case when v_revealed then false else null end
    from fibbage_lies l where l.round_id = p_round_id
  union all
    select k.truth_token, k.truth, case when v_revealed then true else null end
    from fibbage_keys k where k.round_id = p_round_id;
end;
$$;
revoke all on function public.fib_options(uuid) from public, anon;
grant execute on function public.fib_options(uuid) to authenticated;

-- Picking by opaque id. The client cannot tell which token is the truth, so it
-- cannot tell us either — the mapping happens here.
create or replace function public.pick_fib_option(p_round_id uuid, p_opt_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_member uuid := auth_member_id();
  v_phase text;
  v_is_truth boolean;
  v_lie_id uuid;
begin
  if v_member is null then raise exception 'not a member' using errcode = '28000'; end if;
  select r.phase into v_phase from fibbage_rounds r where r.id = p_round_id;
  if v_phase is distinct from 'guess' then raise exception 'not guessing' using errcode = 'P0002'; end if;

  v_is_truth := exists (
    select 1 from fibbage_keys k where k.round_id = p_round_id and k.truth_token = p_opt_id
  );
  if not v_is_truth then
    select l.id into v_lie_id from fibbage_lies l
    where l.round_id = p_round_id and l.id = p_opt_id;
    if v_lie_id is null then raise exception 'unknown option' using errcode = 'P0002'; end if;
    if exists (
      select 1 from fibbage_lies l
      where l.id = v_lie_id and l.author_member_id = v_member
    ) then
      raise exception 'cannot pick your own lie' using errcode = 'P0005';
    end if;
  end if;

  insert into fibbage_picks (round_id, picker_member_id, lie_id, picked_truth)
  values (p_round_id, v_member, v_lie_id, v_is_truth)
  on conflict (round_id, picker_member_id)
  do update set lie_id = excluded.lie_id, picked_truth = excluded.picked_truth;
end;
$$;
revoke all on function public.pick_fib_option(uuid, uuid) from public, anon;
grant execute on function public.pick_fib_option(uuid, uuid) to authenticated;

-- The key table is no longer read by the client at all during play; the host
-- still reads it while composing, and everyone may see it after the reveal.
-- Keeping the policy as-is is now correct rather than accidental.

-- ---------------------------------------------------------------------------
-- Rank These: "your ranking is saved" reverted to the form within seconds.
--
-- RankStage decides whether you have submitted by looking for a participation
-- row with action_key 'ranking'. 0004's submit_ranking wrote one; the 0011
-- rewrite moved to a real rank_submissions table and dropped the ledger write,
-- so the confirmation appeared optimistically and then vanished on the next
-- refetch — looking, to the person who just submitted, like it had not saved.
-- (The signature is (uuid, jsonb) — I nearly wrote a uuid[] version, which would
-- have quietly created an OVERLOAD the client never calls. Same trap as
-- submit_fib_lie. Patch the function that exists.)
create or replace function public.submit_ranking(p_stage_id uuid, p_ordering jsonb)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_member uuid := auth_member_id();
  v_expected int;
begin
  if v_member is null then raise exception 'not a member' using errcode = '28000'; end if;
  perform assert_stage_open(p_stage_id);
  select count(*) into v_expected from rank_items i where i.stage_id = p_stage_id;
  if v_expected = 0 then
    raise exception 'nothing to rank yet' using errcode = 'P0003';
  end if;
  if jsonb_array_length(p_ordering) <> v_expected then
    raise exception 'ranking must cover every item' using errcode = 'P0003';
  end if;
  if exists (
    select 1 from jsonb_array_elements_text(p_ordering) e
    where not exists (
      select 1 from rank_items i where i.id::text = e.value and i.stage_id = p_stage_id
    )
  ) then
    raise exception 'unknown item in ranking' using errcode = 'P0003';
  end if;
  if (select count(distinct e.value) from jsonb_array_elements_text(p_ordering) e) <> v_expected then
    raise exception 'duplicate item in ranking' using errcode = 'P0003';
  end if;

  insert into rank_submissions (stage_id, ordering, member_id)
  values (p_stage_id, p_ordering, v_member)
  on conflict (stage_id, member_id) do update set ordering = excluded.ordering;

  -- So the person who submitted keeps seeing that they submitted. Only on the
  -- first one: the ledger caps at 1, and a ranking may be revised — bumping
  -- unconditionally made every RESUBMIT fail with 'limit reached'.
  if not exists (
    select 1 from participation
    where stage_id = p_stage_id and member_id = v_member and action_key = 'ranking'
  ) then
    perform bump_participation(p_stage_id, 'ranking', 1);
  end if;
end;
$$;
revoke all on function public.submit_ranking(uuid, jsonb) from public, anon;
grant execute on function public.submit_ranking(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Counters the host actually needs, without handing out the contents.
--
-- The host's readiness counters read "0/8" all meeting because RLS correctly
-- hides other people's dials, bets and quiz answers until reveal — so the host
-- had no way to know whether to wait or move on. These return a COUNT only.
create or replace function public.answered_count(p_kind text, p_id uuid)
returns int
language plpgsql stable security definer
set search_path = public
as $$
declare v_n int;
begin
  if auth_member_id() is null then return 0; end if;
  if p_kind = 'wave_guess' then
    select count(*) into v_n from wave_guesses where round_id = p_id;
  elsif p_kind = 'wave_bet' then
    select count(*) into v_n from wave_bets where round_id = p_id;
  elsif p_kind = 'quiz' then
    select count(*) into v_n from quiz_answers where question_id = p_id;
  elsif p_kind = 'rank' then
    select count(*) into v_n from rank_submissions where stage_id = p_id;
  else
    return 0;
  end if;
  return coalesce(v_n, 0);
end;
$$;
revoke all on function public.answered_count(text, uuid) from public, anon;
grant execute on function public.answered_count(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- stage_progress() was a counting oracle over the anonymity ledger.
--
-- It is SECURITY DEFINER, granted to every member, and took an ARBITRARY
-- action_key. The keys are not opaque — the feedback wall writes
-- 'fb:<target_member_id>' — so anyone could count how many people had written
-- about a named colleague, which the wall exists to keep private. It now
-- accepts only the fixed set of keys the UI actually asks about.
create or replace function public.stage_progress(p_stage_id uuid, p_action_key text)
returns int
language plpgsql stable security definer
set search_path = public
as $$
declare v_n int;
begin
  if auth_member_id() is null then return 0; end if;
  -- an arbitrary key would turn this into a lookup of who wrote about whom
  if p_action_key not in ('card', 'vote', 'ranking', 'health', 'mission', 'wordcloud', 'suggestion', 'feedback') then
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

-- ---------------------------------------------------------------------------
-- A host escape for a stalled Codenames turn.
--
-- cn_pass deliberately refuses anyone who is not an operative on the team whose
-- turn it is, and additionally requires that they have already guessed once
-- (the official rule). Both are right for players — and together they mean a
-- stalled turn cannot be unstuck by anyone at all: if that team's operative has
-- closed their laptop, the game simply stops, in front of everyone. The host is
-- trusted to run the meeting, so the host gets a pass that ignores both rules.
create or replace function public.cn_host_pass(p_game_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare v_game cn_games;
begin
  if not auth_is_host() then raise exception 'host only' using errcode = '42501'; end if;
  select g.* into v_game from cn_games g where g.id = p_game_id;
  if not found then raise exception 'unknown game' using errcode = 'P0002'; end if;
  if v_game.phase <> 'playing' then raise exception 'not playing' using errcode = 'P0002'; end if;

  update cn_games
     set turn = case when v_game.turn = 'red' then 'blue' else 'red' end,
         clue_word = null, clue_count = null, guesses_left = 0, guesses_made = 0
   where id = p_game_id;
end;
$$;
revoke all on function public.cn_host_pass(uuid) from public, anon;
grant execute on function public.cn_host_pass(uuid) to authenticated;
