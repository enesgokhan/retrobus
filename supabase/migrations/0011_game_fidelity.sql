-- Retrobüs 0011 — bring the games in line with their real rules.
--
-- Every change below traces to published rules, not taste:
--
-- CODENAMES (official rulebook)
--   * a clue may not be a codename still visible on the board
--   * the team MUST make at least one guess before passing
--   * count 0 / "unlimited" means guess freely until wrong
--
-- FIBBAGE (Jackbox)
--   * duplicate lies are not allowed — two identical lies split the fooling
--     credit and make the vote incoherent
--   * later rounds are worth more (x2, x3)
--
-- WAVELENGTH (CMYK rulebook) — the big one. The real game is TEAM vs TEAM:
--   the psychic's team converges on ONE dial and scores 4/3/2 by band, then the
--   OPPOSING team bets left or right of that dial for 1 more point, so both
--   teams score every round. What was built was a co-op variant with individual
--   dials and no counter-bet, which left half the room idle.
--
-- RANK THESE (Herd Mentality family)
--   * scoring for agreeing with the group turns a survey into a game. That
--     requires knowing who submitted, so these submissions become NAMED — a
--     deliberate departure from the anonymous default, because rankings of fast
--     food carry no sensitivity and a game needs a scoreboard.

-- ============ CODENAMES ============

create or replace function public.cn_clue(p_game_id uuid, p_word text, p_count int)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_member uuid := auth_member_id();
  v_game cn_games;
  v_player cn_players;
  v_clue text := btrim(p_word);
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
  -- -1 encodes "unlimited"; 0 is the rulebook's "zero" clue, also unlimited
  if p_count < -1 or p_count > 9 then raise exception 'bad count' using errcode = 'P0003'; end if;
  if v_clue = '' or v_clue ~ '\s' then
    raise exception 'clue must be a single word' using errcode = 'P0009';
  end if;

  -- OFFICIAL RULE: the clue cannot be a codename still visible on the board.
  -- Revealed cards are fair game, which is why this checks `not revealed`.
  if exists (
    select 1 from cn_cards c
    where c.game_id = p_game_id and not c.revealed
      and lower(c.word) = lower(v_clue)
  ) then
    raise exception 'clue is a word on the board' using errcode = 'P0010';
  end if;

  update cn_games
     set clue_word = v_clue,
         clue_count = p_count,
         -- count + 1 guesses; 0 and unlimited both mean "until wrong" (99)
         guesses_left = case when p_count <= 0 then 99 else p_count + 1 end,
         guesses_made = 0
   where id = p_game_id;
end;
$$;
grant execute on function public.cn_clue(uuid, text, int) to authenticated;

-- track guesses made this turn so `pass` can require at least one
alter table public.cn_games add column if not exists guesses_made int not null default 0;

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
  if v_game.clue_word is null then
    raise exception 'wait for a clue' using errcode = 'P0002';
  end if;
  -- OFFICIAL RULE: operatives must always make at least one guess.
  if v_game.guesses_made < 1 then
    raise exception 'must guess at least once before passing' using errcode = 'P0011';
  end if;

  update cn_games
     set turn = case when v_game.turn = 'red' then 'blue' else 'red' end,
         clue_word = null, clue_count = null, guesses_left = 0, guesses_made = 0
   where id = p_game_id;
end;
$$;
grant execute on function public.cn_pass(uuid) to authenticated;

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
  update cn_games set guesses_made = guesses_made + 1 where id = v_game.id;

  if v_role = 'assassin' then
    update cn_games set phase = 'done', winner = v_other, win_reason = 'assassin', guesses_left = 0
      where id = v_game.id;
    return jsonb_build_object('role', v_role, 'ended', true, 'winner', v_other);
  end if;

  if v_role = v_game.turn then
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
       set turn = v_other, clue_word = null, clue_count = null, guesses_left = 0, guesses_made = 0
     where id = v_game.id;
  end if;

  return jsonb_build_object('role', v_role, 'ended', false, 'turn_ended', v_end_turn);
end;
$$;
grant execute on function public.cn_guess(uuid) to authenticated;

-- ============ FIBBAGE ============

alter table public.fibbage_rounds add column if not exists multiplier numeric not null default 1
  check (multiplier in (1, 2, 3));

create or replace function public.submit_fib_lie(p_round_id uuid, p_body text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_member uuid := auth_member_id();
  v_round fibbage_rounds;
  v_body text := btrim(p_body);
begin
  if v_member is null then raise exception 'not a member' using errcode = '28000'; end if;
  select r.* into v_round from fibbage_rounds r where r.id = p_round_id;
  if not found then raise exception 'unknown round' using errcode = 'P0002'; end if;
  if v_round.phase <> 'lie' then raise exception 'not accepting lies' using errcode = 'P0002'; end if;
  if lower(v_body) = lower(btrim(v_round.truth)) then
    raise exception 'that is the truth' using errcode = 'P0005';
  end if;
  -- JACKBOX RULE: no duplicate lies. Two identical lies split the fooling
  -- credit and make the vote incoherent, so the second person must think again.
  if exists (
    select 1 from fibbage_lies l
    where l.round_id = p_round_id
      and l.author_member_id <> v_member
      and lower(l.body) = lower(v_body)
  ) then
    raise exception 'someone already wrote that lie' using errcode = 'P0012';
  end if;

  insert into fibbage_lies (round_id, author_member_id, body)
  values (p_round_id, v_member, v_body)
  on conflict (round_id, author_member_id) do update set body = excluded.body;
end;
$$;
grant execute on function public.submit_fib_lie(uuid, text) to authenticated;

create or replace function public.reveal_fib(p_round_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_round fibbage_rounds;
  v_meeting uuid;
  v_found int;
  v_fooled int;
  v_mult numeric;
begin
  if not auth_is_host() then raise exception 'host only' using errcode = '42501'; end if;
  select r.* into v_round from fibbage_rounds r where r.id = p_round_id;
  if not found then raise exception 'unknown round' using errcode = 'P0002'; end if;
  if v_round.phase = 'revealed' then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  select s.meeting_id into v_meeting from stages s where s.id = v_round.stage_id;
  v_mult := v_round.multiplier;

  -- Jackbox: 1000 for finding the truth, 500 per person fooled, scaled by the
  -- round multiplier so later rounds matter more.
  insert into scores (meeting_id, stage_id, member_id, points, reason)
  select v_meeting, v_round.stage_id, p.picker_member_id, (1000 * v_mult)::int, 'fib_found_truth'
  from fibbage_picks p where p.round_id = p_round_id and p.picked_truth;
  select count(*) into v_found from fibbage_picks p
    where p.round_id = p_round_id and p.picked_truth;

  insert into scores (meeting_id, stage_id, member_id, points, reason)
  select v_meeting, v_round.stage_id, l.author_member_id, (500 * v_mult * count(p.id))::int, 'fib_fooled'
  from fibbage_lies l
  join fibbage_picks p on p.lie_id = l.id
  where l.round_id = p_round_id
  group by l.author_member_id
  having count(p.id) > 0;
  select count(*) into v_fooled from fibbage_picks p
    where p.round_id = p_round_id and p.lie_id is not null;

  update fibbage_rounds set phase = 'revealed' where id = p_round_id;
  return jsonb_build_object(
    'ok', true, 'found_truth', v_found, 'fooled', v_fooled, 'multiplier', v_mult
  );
end;
$$;
grant execute on function public.reveal_fib(uuid) to authenticated;

grant insert (stage_id, prompt, truth, phase, order_index, multiplier),
      update (prompt, truth, phase, order_index, multiplier)
  on public.fibbage_rounds to authenticated;

-- ============ RANK THESE ============
-- Becomes a scored game: points for agreeing with the group (Herd Mentality).
-- That needs identity, so submissions are now NAMED. Stated plainly rather than
-- quietly: rankings of fast food are not sensitive, and a game needs a scoreboard.

alter table public.rank_submissions add column if not exists member_id uuid
  references public.members (id) on delete cascade;
create unique index if not exists rank_subs_one_per_person
  on public.rank_submissions (stage_id, member_id);

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
end;
$$;
grant execute on function public.submit_ranking(uuid, jsonb) to authenticated;

-- Score agreement with the group: for each item, distance between your position
-- and the group's average position. Closer to the herd scores more.
create or replace function public.reveal_ranking(p_stage_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_meeting uuid;
  v_n int;
  v_items int;
begin
  if not auth_is_host() then raise exception 'host only' using errcode = '42501'; end if;
  select s.meeting_id into v_meeting from stages s where s.id = p_stage_id;
  select count(*) into v_n from rank_submissions where stage_id = p_stage_id;
  select count(*) into v_items from rank_items where stage_id = p_stage_id;
  if v_n = 0 then return jsonb_build_object('ok', true, 'scored', 0); end if;

  if exists (select 1 from scores where stage_id = p_stage_id and reason = 'rank_herd') then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  with positions as (
    select s.member_id, e.value::uuid as item_id, (e.ordinality - 1)::numeric as pos
    from rank_submissions s,
         jsonb_array_elements_text(s.ordering) with ordinality as e(value, ordinality)
    where s.stage_id = p_stage_id and s.member_id is not null
  ),
  consensus as (
    select item_id, avg(pos) as avg_pos from positions group by item_id
  ),
  deviation as (
    select p.member_id, sum(abs(p.pos - c.avg_pos)) as total_dev
    from positions p join consensus c on c.item_id = p.item_id
    group by p.member_id
  ),
  -- worst possible deviation, used to normalise into points
  bounds as (
    select greatest(max(total_dev), 0.0001) as worst from deviation
  )
  insert into scores (meeting_id, stage_id, member_id, points, reason)
  select v_meeting, p_stage_id, d.member_id,
         -- 1000 for perfect agreement with the herd, floor of 100
         greatest(100, round(1000 * (1 - d.total_dev / b.worst))::int),
         'rank_herd'
  from deviation d cross join bounds b;

  update stages set state = 'revealed' where id = p_stage_id;
  return jsonb_build_object('ok', true, 'scored', v_n, 'items', v_items);
end;
$$;
grant execute on function public.reveal_ranking(uuid) to authenticated;

-- submissions stay hidden until reveal, then everyone sees who ranked what
drop policy if exists rank_subs_select on public.rank_submissions;
create policy rank_subs_select on public.rank_submissions
  for select to authenticated using (
    member_id = auth_member_id()
    or (
      auth_member_id() is not null
      and exists (
        select 1 from stages s
        where s.id = rank_submissions.stage_id and s.state in ('revealed', 'closed')
      )
    )
  );
