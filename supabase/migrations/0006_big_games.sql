-- Retrobüs 0006 — Wavelength and Codenames TR.
--
-- Both games hinge on hidden information, and both use the same defence:
-- the secret lives in its OWN table so RLS can gate it by role, because a row
-- policy cannot protect a single column and a column grant cannot be
-- conditional. Established in 0003 (two_truths_keys) and 0004 (fibbage).
--
-- Codenames is the sharp one: if the key card reaches an operative's browser,
-- someone opens devtools and the game is over. `codenames_keys` is readable
-- ONLY by that game's spymasters, enforced in the database, not the client.

-- ============ Wavelength ============

create table public.wave_rounds (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.stages (id) on delete cascade,
  -- spectrum ends, e.g. 'soğuk' <-> 'sıcak'
  left_label text not null check (length(trim(left_label)) between 1 and 60),
  right_label text not null check (length(trim(right_label)) between 1 and 60),
  -- whoever gives the clue this round
  psychic_member_id uuid not null references public.members (id) on delete cascade,
  clue text check (clue is null or length(trim(clue)) between 1 and 120),
  -- clue | guess | revealed
  phase text not null default 'clue' check (phase in ('clue', 'guess', 'revealed')),
  order_index int not null default 1
);
create index wave_rounds_stage_idx on public.wave_rounds (stage_id, order_index);

-- The hidden target, 0..100. Readable only by the psychic until reveal.
create table public.wave_targets (
  round_id uuid primary key references public.wave_rounds (id) on delete cascade,
  target int not null check (target between 0 and 100)
);

create table public.wave_guesses (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.wave_rounds (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  value int not null check (value between 0 and 100),
  unique (round_id, member_id)
);
create index wave_guesses_round_idx on public.wave_guesses (round_id);

-- Host starts a round; the target is generated SERVER-SIDE so nobody sees it
-- travel over the wire.
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
begin
  if not auth_is_host() then raise exception 'host only' using errcode = '42501'; end if;
  select coalesce(max(r.order_index), 0) + 1 into v_order
    from wave_rounds r where r.stage_id = p_stage_id;

  insert into wave_rounds (stage_id, left_label, right_label, psychic_member_id, order_index)
  values (p_stage_id, trim(p_left), trim(p_right), p_psychic, v_order)
  returning id into v_id;

  -- kept away from the extremes so the clue is actually possible to give
  insert into wave_targets (round_id, target)
  values (v_id, 8 + floor(random() * 85)::int);

  return v_id;
end;
$$;
grant execute on function public.start_wave_round(uuid, text, text, uuid) to authenticated;

-- The psychic writes the clue, which also opens guessing.
create or replace function public.give_wave_clue(p_round_id uuid, p_clue text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_round wave_rounds;
begin
  select r.* into v_round from wave_rounds r where r.id = p_round_id;
  if not found then raise exception 'unknown round' using errcode = 'P0002'; end if;
  if v_round.psychic_member_id <> auth_member_id() then
    raise exception 'only the psychic gives the clue' using errcode = '42501';
  end if;
  if v_round.phase <> 'clue' then raise exception 'clue already given' using errcode = 'P0002'; end if;

  update wave_rounds set clue = trim(p_clue), phase = 'guess' where id = p_round_id;
end;
$$;
grant execute on function public.give_wave_clue(uuid, text) to authenticated;

create or replace function public.guess_wave(p_round_id uuid, p_value int)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_member uuid := auth_member_id();
  v_round wave_rounds;
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

  insert into wave_guesses (round_id, member_id, value)
  values (p_round_id, v_member, p_value)
  on conflict (round_id, member_id) do update set value = excluded.value;
end;
$$;
grant execute on function public.guess_wave(uuid, int) to authenticated;

-- Reveal and score by distance. The psychic earns the average of the room, so
-- giving a good clue is rewarded as much as reading one.
create or replace function public.reveal_wave(p_round_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_round wave_rounds;
  v_target int;
  v_meeting uuid;
  v_avg numeric;
begin
  if not auth_is_host() then raise exception 'host only' using errcode = '42501'; end if;
  select r.* into v_round from wave_rounds r where r.id = p_round_id;
  if not found then raise exception 'unknown round' using errcode = 'P0002'; end if;
  if v_round.phase = 'revealed' then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  select t.target into v_target from wave_targets t where t.round_id = p_round_id;
  select s.meeting_id into v_meeting from stages s where s.id = v_round.stage_id;

  insert into scores (meeting_id, stage_id, member_id, points, reason)
  select v_meeting, v_round.stage_id, g.member_id,
         case
           when abs(g.value - v_target) <= 3 then 1000
           when abs(g.value - v_target) <= 8 then 600
           when abs(g.value - v_target) <= 15 then 300
           else 0
         end,
         'wave_guess'
  from wave_guesses g
  where g.round_id = p_round_id and abs(g.value - v_target) <= 15;

  select avg(
    case
      when abs(g.value - v_target) <= 3 then 1000
      when abs(g.value - v_target) <= 8 then 600
      when abs(g.value - v_target) <= 15 then 300
      else 0
    end
  ) into v_avg
  from wave_guesses g where g.round_id = p_round_id;

  if coalesce(v_avg, 0) > 0 then
    insert into scores (meeting_id, stage_id, member_id, points, reason)
    values (v_meeting, v_round.stage_id, v_round.psychic_member_id, round(v_avg)::int, 'wave_psychic');
  end if;

  update wave_rounds set phase = 'revealed' where id = p_round_id;
  return jsonb_build_object('ok', true, 'target', v_target, 'psychic_points', round(coalesce(v_avg, 0))::int);
end;
$$;
grant execute on function public.reveal_wave(uuid) to authenticated;

alter table public.wave_rounds enable row level security;
alter table public.wave_targets enable row level security;
alter table public.wave_guesses enable row level security;

revoke all on public.wave_rounds from anon, authenticated;
grant select on public.wave_rounds to authenticated;
create policy wave_rounds_select on public.wave_rounds
  for select to authenticated using (auth_member_id() is not null);

-- THE hidden bit: only the psychic, until reveal.
revoke all on public.wave_targets from anon, authenticated;
grant select on public.wave_targets to authenticated;
create policy wave_targets_select on public.wave_targets
  for select to authenticated using (
    exists (
      select 1 from wave_rounds r
      where r.id = wave_targets.round_id
        and (r.psychic_member_id = auth_member_id() or r.phase = 'revealed')
    )
  );

-- Guesses stay private until reveal, so nobody copies the room.
revoke all on public.wave_guesses from anon, authenticated;
grant select on public.wave_guesses to authenticated;
create policy wave_guesses_select on public.wave_guesses
  for select to authenticated using (
    member_id = auth_member_id()
    or exists (
      select 1 from wave_rounds r
      where r.id = wave_guesses.round_id and r.phase = 'revealed'
    )
  );

-- ============ Codenames TR ============

create table public.cn_games (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.stages (id) on delete cascade,
  -- lobby | playing | done
  phase text not null default 'lobby' check (phase in ('lobby', 'playing', 'done')),
  -- which team is on the clock; the starting team has 9 cards
  turn text not null default 'red' check (turn in ('red', 'blue')),
  starting_team text not null default 'red' check (starting_team in ('red', 'blue')),
  -- set when the game ends
  winner text check (winner is null or winner in ('red', 'blue')),
  -- 'assassin' | 'cards'
  win_reason text,
  clue_word text,
  clue_count int check (clue_count is null or clue_count between 0 and 9),
  -- guesses remaining on the current clue
  guesses_left int not null default 0,
  created_at timestamptz not null default now()
);
create index cn_games_stage_idx on public.cn_games (stage_id);

create table public.cn_players (
  game_id uuid not null references public.cn_games (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  team text not null check (team in ('red', 'blue')),
  is_spymaster boolean not null default false,
  primary key (game_id, member_id)
);
create index cn_players_game_idx on public.cn_players (game_id);

-- The 25 words. Safe for everyone to read.
create table public.cn_cards (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.cn_games (id) on delete cascade,
  word text not null,
  position int not null check (position between 0 and 24),
  revealed boolean not null default false,
  unique (game_id, position)
);
create index cn_cards_game_idx on public.cn_cards (game_id);

-- THE KEY CARD. Which card belongs to whom.
-- Readable only by that game's spymasters, or for cards already flipped.
-- If this ever leaks, the game is pointless — hence its own table and policy.
create table public.cn_keys (
  card_id uuid primary key references public.cn_cards (id) on delete cascade,
  game_id uuid not null references public.cn_games (id) on delete cascade,
  role text not null check (role in ('red', 'blue', 'neutral', 'assassin'))
);
create index cn_keys_game_idx on public.cn_keys (game_id);

-- Join or change your seat while in the lobby.
create or replace function public.cn_join(p_game_id uuid, p_team text, p_spymaster boolean)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_member uuid := auth_member_id();
  v_phase text;
begin
  if v_member is null then raise exception 'not a member' using errcode = '28000'; end if;
  if p_team not in ('red', 'blue') then raise exception 'bad team' using errcode = 'P0003'; end if;

  select g.phase into v_phase from cn_games g where g.id = p_game_id;
  if v_phase is null then raise exception 'unknown game' using errcode = 'P0002'; end if;
  if v_phase <> 'lobby' then raise exception 'game already started' using errcode = 'P0002'; end if;

  -- one spymaster per team; first to claim it holds it
  if p_spymaster and exists (
    select 1 from cn_players p
    where p.game_id = p_game_id and p.team = p_team
      and p.is_spymaster and p.member_id <> v_member
  ) then
    raise exception 'that team already has a spymaster' using errcode = 'P0006';
  end if;

  insert into cn_players (game_id, member_id, team, is_spymaster)
  values (p_game_id, v_member, p_team, coalesce(p_spymaster, false))
  on conflict (game_id, member_id)
  do update set team = excluded.team, is_spymaster = excluded.is_spymaster;
end;
$$;
grant execute on function public.cn_join(uuid, text, boolean) to authenticated;

-- Deal a board: 25 words from the caller's list, and the key card.
-- Host only. The key is generated here and never travels to a client.
create or replace function public.cn_deal(p_game_id uuid, p_words text[])
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_game cn_games;
  v_start text;
  v_roles text[];
  v_i int;
  v_card uuid;
begin
  if not auth_is_host() then raise exception 'host only' using errcode = '42501'; end if;
  select g.* into v_game from cn_games g where g.id = p_game_id;
  if not found then raise exception 'unknown game' using errcode = 'P0002'; end if;
  if array_length(p_words, 1) < 25 then
    raise exception 'need at least 25 words' using errcode = 'P0003';
  end if;
  if not exists (select 1 from cn_players p where p.game_id = p_game_id and p.team = 'red' and p.is_spymaster)
     or not exists (select 1 from cn_players p where p.game_id = p_game_id and p.team = 'blue' and p.is_spymaster) then
    raise exception 'both teams need a spymaster' using errcode = 'P0007';
  end if;

  delete from cn_cards where game_id = p_game_id; -- cascades to cn_keys

  v_start := case when random() < 0.5 then 'red' else 'blue' end;

  -- 9 for the starting team, 8 for the other, 7 neutral, 1 assassin.
  -- array_fill rather than `v_roles || 'neutral'`: an untyped literal on the
  -- right of || makes Postgres pick anyarray||anyarray and try to parse it as
  -- an array literal ("malformed array literal: neutral").
  v_roles := array_fill(v_start::text, array[9])
          || array_fill((case when v_start = 'red' then 'blue' else 'red' end)::text, array[8])
          || array_fill('neutral'::text, array[7])
          || array['assassin'::text];

  -- shuffle roles against shuffled words
  with shuffled_words as (
    select w.word, row_number() over (order by random()) - 1 as pos
    from unnest(p_words[1:25]) as w(word)
  ),
  shuffled_roles as (
    select r.role, row_number() over (order by random()) - 1 as pos
    from unnest(v_roles) as r(role)
  ),
  inserted as (
    insert into cn_cards (game_id, word, position)
    select p_game_id, sw.word, sw.pos from shuffled_words sw
    returning id, position
  )
  insert into cn_keys (card_id, game_id, role)
  select i.id, p_game_id, sr.role
  from inserted i join shuffled_roles sr on sr.pos = i.position;

  update cn_games
     set phase = 'playing', starting_team = v_start, turn = v_start,
         winner = null, win_reason = null, clue_word = null, clue_count = null, guesses_left = 0
   where id = p_game_id;
end;
$$;
grant execute on function public.cn_deal(uuid, text[]) to authenticated;

-- Spymaster gives a clue: one word plus a count.
create or replace function public.cn_clue(p_game_id uuid, p_word text, p_count int)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_member uuid := auth_member_id();
  v_game cn_games;
  v_player cn_players;
begin
  select g.* into v_game from cn_games g where g.id = p_game_id;
  if not found then raise exception 'unknown game' using errcode = 'P0002'; end if;
  if v_game.phase <> 'playing' then raise exception 'not playing' using errcode = 'P0002'; end if;

  select p.* into v_player from cn_players p
    where p.game_id = p_game_id and p.member_id = v_member;
  if not found or not v_player.is_spymaster then
    raise exception 'only a spymaster gives clues' using errcode = '42501';
  end if;
  if v_player.team <> v_game.turn then
    raise exception 'not your turn' using errcode = 'P0008';
  end if;
  if v_game.clue_word is not null then
    raise exception 'clue already given this turn' using errcode = 'P0002';
  end if;
  if p_count < 0 or p_count > 9 then raise exception 'bad count' using errcode = 'P0003'; end if;

  -- the classic rule: count + 1 guesses
  update cn_games
     set clue_word = trim(p_word), clue_count = p_count, guesses_left = p_count + 1
   where id = p_game_id;
end;
$$;
grant execute on function public.cn_clue(uuid, text, int) to authenticated;

-- An operative flips a card. Resolves turn changes and endings server-side, so
-- the outcome cannot be argued with by a client.
create or replace function public.cn_guess(p_card_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_member uuid := auth_member_id();
  v_card cn_cards;
  v_game cn_games;
  v_player cn_players;
  v_role text;
  v_other text;
  v_left int;
  v_end_turn boolean := false;
begin
  select c.* into v_card from cn_cards c where c.id = p_card_id;
  if not found then raise exception 'unknown card' using errcode = 'P0002'; end if;
  if v_card.revealed then raise exception 'already revealed' using errcode = 'P0002'; end if;

  select g.* into v_game from cn_games g where g.id = v_card.game_id;
  if v_game.phase <> 'playing' then raise exception 'not playing' using errcode = 'P0002'; end if;
  if v_game.clue_word is null then raise exception 'wait for a clue' using errcode = 'P0002'; end if;

  select p.* into v_player from cn_players p
    where p.game_id = v_game.id and p.member_id = v_member;
  if not found then raise exception 'not in this game' using errcode = '42501'; end if;
  if v_player.is_spymaster then
    raise exception 'spymasters do not guess' using errcode = '42501';
  end if;
  if v_player.team <> v_game.turn then raise exception 'not your turn' using errcode = 'P0008'; end if;

  select k.role into v_role from cn_keys k where k.card_id = p_card_id;
  v_other := case when v_game.turn = 'red' then 'blue' else 'red' end;

  update cn_cards set revealed = true where id = p_card_id;

  if v_role = 'assassin' then
    update cn_games set phase = 'done', winner = v_other, win_reason = 'assassin', guesses_left = 0
      where id = v_game.id;
    return jsonb_build_object('role', v_role, 'ended', true, 'winner', v_other);
  end if;

  if v_role = v_game.turn then
    -- right guess: does that finish the team's cards?
    select count(*) into v_left
    from cn_keys k join cn_cards c on c.id = k.card_id
    where k.game_id = v_game.id and k.role = v_game.turn and not c.revealed;

    if v_left = 0 then
      update cn_games set phase = 'done', winner = v_game.turn, win_reason = 'cards', guesses_left = 0
        where id = v_game.id;
      return jsonb_build_object('role', v_role, 'ended', true, 'winner', v_game.turn);
    end if;

    update cn_games set guesses_left = greatest(guesses_left - 1, 0) where id = v_game.id;
    select g.guesses_left into v_left from cn_games g where g.id = v_game.id;
    if v_left = 0 then v_end_turn := true; end if;
  else
    -- wrong guess ends the turn; if it belonged to the other team, check their win
    if v_role = v_other then
      select count(*) into v_left
      from cn_keys k join cn_cards c on c.id = k.card_id
      where k.game_id = v_game.id and k.role = v_other and not c.revealed;
      if v_left = 0 then
        update cn_games set phase = 'done', winner = v_other, win_reason = 'cards', guesses_left = 0
          where id = v_game.id;
        return jsonb_build_object('role', v_role, 'ended', true, 'winner', v_other);
      end if;
    end if;
    v_end_turn := true;
  end if;

  if v_end_turn then
    update cn_games
       set turn = v_other, clue_word = null, clue_count = null, guesses_left = 0
     where id = v_game.id;
  end if;

  return jsonb_build_object('role', v_role, 'ended', false, 'turn_ended', v_end_turn);
end;
$$;
grant execute on function public.cn_guess(uuid) to authenticated;

-- A team may stop guessing early.
create or replace function public.cn_pass(p_game_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_member uuid := auth_member_id();
  v_game cn_games;
  v_player cn_players;
begin
  select g.* into v_game from cn_games g where g.id = p_game_id;
  if not found then raise exception 'unknown game' using errcode = 'P0002'; end if;
  select p.* into v_player from cn_players p
    where p.game_id = p_game_id and p.member_id = v_member;
  if not found or v_player.team <> v_game.turn or v_player.is_spymaster then
    raise exception 'not your call' using errcode = '42501';
  end if;
  update cn_games
     set turn = case when v_game.turn = 'red' then 'blue' else 'red' end,
         clue_word = null, clue_count = null, guesses_left = 0
   where id = p_game_id;
end;
$$;
grant execute on function public.cn_pass(uuid) to authenticated;

-- Award the winning team at the end (flat, since it is a team game).
create or replace function public.cn_award(p_game_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_game cn_games;
  v_meeting uuid;
begin
  if not auth_is_host() then raise exception 'host only' using errcode = '42501'; end if;
  select g.* into v_game from cn_games g where g.id = p_game_id;
  if v_game.winner is null then raise exception 'no winner yet' using errcode = 'P0002'; end if;
  if exists (select 1 from scores s where s.stage_id = v_game.stage_id and s.reason = 'codenames_win') then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  select s.meeting_id into v_meeting from stages s where s.id = v_game.stage_id;
  insert into scores (meeting_id, stage_id, member_id, points, reason)
  select v_meeting, v_game.stage_id, p.member_id, 1500, 'codenames_win'
  from cn_players p where p.game_id = p_game_id and p.team = v_game.winner;

  return jsonb_build_object('ok', true, 'winner', v_game.winner);
end;
$$;
grant execute on function public.cn_award(uuid) to authenticated;

alter table public.cn_games enable row level security;
alter table public.cn_players enable row level security;
alter table public.cn_cards enable row level security;
alter table public.cn_keys enable row level security;

revoke all on public.cn_games from anon, authenticated;
grant select on public.cn_games to authenticated;
grant insert (stage_id), delete on public.cn_games to authenticated;
create policy cn_games_select on public.cn_games
  for select to authenticated using (auth_member_id() is not null);
create policy cn_games_insert_host on public.cn_games
  for insert to authenticated with check (auth_is_host());
create policy cn_games_delete_host on public.cn_games
  for delete to authenticated using (auth_is_host());

revoke all on public.cn_players from anon, authenticated;
grant select on public.cn_players to authenticated;
create policy cn_players_select on public.cn_players
  for select to authenticated using (auth_member_id() is not null);

revoke all on public.cn_cards from anon, authenticated;
grant select on public.cn_cards to authenticated;
create policy cn_cards_select on public.cn_cards
  for select to authenticated using (auth_member_id() is not null);

-- ***** the one that matters *****
-- Spymasters of this game see the whole key. Everyone else sees only the roles
-- of cards already flipped. No client-side filtering is trusted for this.
revoke all on public.cn_keys from anon, authenticated;
grant select on public.cn_keys to authenticated;
create policy cn_keys_select on public.cn_keys
  for select to authenticated using (
    exists (
      select 1 from cn_players p
      where p.game_id = cn_keys.game_id
        and p.member_id = auth_member_id()
        and p.is_spymaster
    )
    or exists (
      select 1 from cn_cards c
      where c.id = cn_keys.card_id and c.revealed
    )
    or exists (
      select 1 from cn_games g
      where g.id = cn_keys.game_id and g.phase = 'done'
    )
  );

-- ---------- realtime ----------

alter publication supabase_realtime add table public.wave_rounds;
alter publication supabase_realtime add table public.wave_guesses;
alter publication supabase_realtime add table public.cn_games;
alter publication supabase_realtime add table public.cn_players;
alter publication supabase_realtime add table public.cn_cards;
