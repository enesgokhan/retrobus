-- Retrobüs 0012 — Wavelength as the real game.
--
-- What was built: individual dials, distance-banded points per person, psychic
-- scored on the room average. Pleasant, but not Wavelength.
--
-- The actual game (CMYK rulebook):
--   1. The active team's psychic sees a hidden target on a spectrum and gives
--      one clue.
--   2. THE ACTIVE TEAM converges on ONE dial position.
--   3. Score 4 / 3 / 2 by which band of the target the dial lands in.
--   4. THE OPPOSING TEAM then bets whether the true centre is LEFT or RIGHT of
--      that dial, for 1 more point.
--   So both teams score every round — which is the point: without step 4 half
--   the room sits idle watching.
--
-- Remote adaptation, stated honestly: instead of arguing one physical dial,
-- every active-team member sets their own dial and the team's dial is the
-- MEDIAN. That keeps everyone participating (better on a video call than one
-- person dragging while others shout) while still producing the single team
-- position the rules need. Everything after that is the real game.

alter table public.wave_rounds
  add column if not exists active_team text not null default 'a'
    check (active_team in ('a', 'b'));
alter table public.wave_rounds
  drop constraint if exists wave_rounds_phase_check;
alter table public.wave_rounds
  add constraint wave_rounds_phase_check
  check (phase in ('clue', 'guess', 'bet', 'revealed'));
-- the team dial, computed when guessing closes
alter table public.wave_rounds add column if not exists team_dial int
  check (team_dial is null or team_dial between 0 and 100);

-- The opposing team's left/right bet.
create table if not exists public.wave_bets (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.wave_rounds (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  side text not null check (side in ('left', 'right')),
  unique (round_id, member_id)
);
create index if not exists wave_bets_round_idx on public.wave_bets (round_id);

alter table public.wave_bets enable row level security;
revoke all on public.wave_bets from anon, authenticated;
grant select on public.wave_bets to authenticated;
create policy wave_bets_select on public.wave_bets
  for select to authenticated using (
    member_id = auth_member_id()
    or exists (
      select 1 from wave_rounds r
      where r.id = wave_bets.round_id and r.phase = 'revealed'
    )
  );

-- Teams live in stages.config.teams as { member_id: 'a' | 'b' }, so no extra
-- table and the host can reshuffle freely before a round starts.
create or replace function public.wave_team_of(p_stage_id uuid, p_member uuid)
returns text
language sql stable security definer
set search_path = public
as $$
  select s.config -> 'teams' ->> p_member::text from stages s where s.id = p_stage_id
$$;
revoke all on function public.wave_team_of(uuid, uuid) from public, anon;
grant execute on function public.wave_team_of(uuid, uuid) to authenticated;

create or replace function public.start_wave_round(
  p_stage_id uuid, p_left text, p_right text, p_psychic uuid
)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_order int;
  v_team text;
begin
  if not auth_is_host() then raise exception 'host only' using errcode = '42501'; end if;
  if p_psychic is null then raise exception 'pick a psychic' using errcode = 'P0003'; end if;

  -- the psychic's own team is the active team
  v_team := coalesce(wave_team_of(p_stage_id, p_psychic), 'a');

  select coalesce(max(r.order_index), 0) + 1 into v_order
    from wave_rounds r where r.stage_id = p_stage_id;

  insert into wave_rounds (stage_id, left_label, right_label, psychic_member_id, order_index, active_team)
  values (p_stage_id, trim(p_left), trim(p_right), p_psychic, v_order, v_team)
  returning id into v_id;

  -- kept away from the extremes so a clue is actually possible
  insert into wave_targets (round_id, target)
  values (v_id, 8 + floor(random() * 85)::int);

  return v_id;
end;
$$;
grant execute on function public.start_wave_round(uuid, text, text, uuid) to authenticated;

-- Only the ACTIVE team dials (the rules); the psychic never guesses.
create or replace function public.guess_wave(p_round_id uuid, p_value int)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_member uuid := auth_member_id();
  v_round wave_rounds;
  v_team text;
begin
  if v_member is null then raise exception 'not a member' using errcode = '28000'; end if;
  if p_value not between 0 and 100 then
    raise exception 'value must be 0..100' using errcode = 'P0003';
  end if;
  select r.* into v_round from wave_rounds r where r.id = p_round_id;
  if not found then raise exception 'unknown round' using errcode = 'P0002'; end if;
  if v_round.phase <> 'guess' then raise exception 'not guessing' using errcode = 'P0002'; end if;
  if v_round.psychic_member_id = v_member then
    raise exception 'the psychic does not guess' using errcode = 'P0004';
  end if;

  v_team := coalesce(wave_team_of(v_round.stage_id, v_member), 'a');
  if v_team <> v_round.active_team then
    raise exception 'only the active team sets the dial' using errcode = 'P0013';
  end if;

  insert into wave_guesses (round_id, member_id, value)
  values (p_round_id, v_member, p_value)
  on conflict (round_id, member_id) do update set value = excluded.value;
end;
$$;
grant execute on function public.guess_wave(uuid, int) to authenticated;

-- Host closes the dial: fixes the team dial at the MEDIAN and opens betting.
create or replace function public.close_wave_dial(p_round_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_round wave_rounds;
  v_dial int;
begin
  if not auth_is_host() then raise exception 'host only' using errcode = '42501'; end if;
  select r.* into v_round from wave_rounds r where r.id = p_round_id;
  if not found then raise exception 'unknown round' using errcode = 'P0002'; end if;
  if v_round.phase <> 'guess' then raise exception 'not guessing' using errcode = 'P0002'; end if;

  select percentile_cont(0.5) within group (order by g.value)::int into v_dial
  from wave_guesses g where g.round_id = p_round_id;

  if v_dial is null then
    raise exception 'nobody has set a dial yet' using errcode = 'P0014';
  end if;

  update wave_rounds set team_dial = v_dial, phase = 'bet' where id = p_round_id;
  return jsonb_build_object('ok', true, 'team_dial', v_dial);
end;
$$;
grant execute on function public.close_wave_dial(uuid) to authenticated;

-- The opposing team bets which side of the team dial the true centre lies on.
create or replace function public.bet_wave(p_round_id uuid, p_side text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_member uuid := auth_member_id();
  v_round wave_rounds;
  v_team text;
begin
  if v_member is null then raise exception 'not a member' using errcode = '28000'; end if;
  if p_side not in ('left', 'right') then
    raise exception 'side must be left or right' using errcode = 'P0003';
  end if;
  select r.* into v_round from wave_rounds r where r.id = p_round_id;
  if not found then raise exception 'unknown round' using errcode = 'P0002'; end if;
  if v_round.phase <> 'bet' then raise exception 'not betting' using errcode = 'P0002'; end if;

  v_team := coalesce(wave_team_of(v_round.stage_id, v_member), 'a');
  if v_team = v_round.active_team then
    raise exception 'only the opposing team bets' using errcode = 'P0015';
  end if;

  insert into wave_bets (round_id, member_id, side)
  values (p_round_id, v_member, p_side)
  on conflict (round_id, member_id) do update set side = excluded.side;
end;
$$;
grant execute on function public.bet_wave(uuid, text) to authenticated;

-- Reveal and score, following the rulebook's bands.
--   team dial within 5 of centre  -> 4 points  (1000)
--   within 12                     -> 3 points  ( 750)
--   within 20                     -> 2 points  ( 500)
--   else                          -> 0
-- Awarded to every active-team member AND the psychic (they share the result).
-- Opposing team: +250 each for calling the correct side.
create or replace function public.reveal_wave(p_round_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_round wave_rounds;
  v_target int;
  v_meeting uuid;
  v_dial int;
  v_dist int;
  v_band int;
  v_points int;
  v_correct_side text;
  v_bets_right int := 0;
begin
  if not auth_is_host() then raise exception 'host only' using errcode = '42501'; end if;
  select r.* into v_round from wave_rounds r where r.id = p_round_id;
  if not found then raise exception 'unknown round' using errcode = 'P0002'; end if;
  if v_round.phase = 'revealed' then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  select t.target into v_target from wave_targets t where t.round_id = p_round_id;
  select s.meeting_id into v_meeting from stages s where s.id = v_round.stage_id;

  -- if the host reveals straight from 'guess', fix the dial now
  v_dial := v_round.team_dial;
  if v_dial is null then
    select percentile_cont(0.5) within group (order by g.value)::int into v_dial
    from wave_guesses g where g.round_id = p_round_id;
  end if;

  if v_dial is not null then
    v_dist := abs(v_dial - v_target);
    v_band := case when v_dist <= 5 then 4 when v_dist <= 12 then 3 when v_dist <= 20 then 2 else 0 end;
    v_points := v_band * 250;

    if v_points > 0 then
      -- every active-team member plus the psychic
      insert into scores (meeting_id, stage_id, member_id, points, reason)
      select v_meeting, v_round.stage_id, m.id, v_points, 'wave_team'
      from members m
      where exists (select 1 from member_links l where l.member_id = m.id)
        and (
          m.id = v_round.psychic_member_id
          or coalesce(wave_team_of(v_round.stage_id, m.id), 'a') = v_round.active_team
        );
    end if;

    -- the counter-bet
    v_correct_side := case when v_target < v_dial then 'left' else 'right' end;
    insert into scores (meeting_id, stage_id, member_id, points, reason)
    select v_meeting, v_round.stage_id, b.member_id, 250, 'wave_bet'
    from wave_bets b
    where b.round_id = p_round_id and b.side = v_correct_side;
    select count(*) into v_bets_right from wave_bets b
      where b.round_id = p_round_id and b.side = v_correct_side;
  end if;

  update wave_rounds set phase = 'revealed', team_dial = v_dial where id = p_round_id;

  return jsonb_build_object(
    'ok', true,
    'target', v_target,
    'team_dial', v_dial,
    'band', coalesce(v_band, 0),
    'points', coalesce(v_points, 0),
    'correct_side', v_correct_side,
    'bets_correct', v_bets_right
  );
end;
$$;
grant execute on function public.reveal_wave(uuid) to authenticated;

alter publication supabase_realtime add table public.wave_bets;
