-- Retrobüs 0013 — Turkish-aware case folding for text comparisons.
--
-- Postgres `lower()` uses the database collation, which does not know Turkish:
--   lower('AYNI') -> 'ayni'   but the word people type is 'aynı' (dotless ı)
--   lower('İSTANBUL') -> 'i̇stanbul' (i + combining dot)
-- So two strings a Turkish reader considers identical compare as different.
--
-- Found by a test: a duplicate Fibbage lie typed in caps slipped past the
-- duplicate check. The same flaw affected the truth-vs-lie comparison and the
-- Codenames "clue is on the board" rule — both of which are game-breaking if
-- they let something through.
--
-- Only the I family is remapped. ğüşöç already have correct Unicode lowercase
-- pairs, and folding ş->s would wrongly merge genuinely different words
-- ("kuş" vs "kus").

create or replace function public.tr_fold(t text)
returns text
language sql immutable
as $$
  -- İ, I and ı all fold to i; then normal lowercasing handles the rest
  select lower(translate(coalesce(t, ''), 'İIı', 'iii'))
$$;
grant execute on function public.tr_fold(text) to authenticated;

-- ---------- apply it where a miss breaks a game ----------

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
  if tr_fold(v_body) = tr_fold(btrim(v_round.truth)) then
    raise exception 'that is the truth' using errcode = 'P0005';
  end if;
  if exists (
    select 1 from fibbage_lies l
    where l.round_id = p_round_id
      and l.author_member_id <> v_member
      and tr_fold(l.body) = tr_fold(v_body)
  ) then
    raise exception 'someone already wrote that lie' using errcode = 'P0012';
  end if;

  insert into fibbage_lies (round_id, author_member_id, body)
  values (p_round_id, v_member, v_body)
  on conflict (round_id, author_member_id) do update set body = excluded.body;
end;
$$;
grant execute on function public.submit_fib_lie(uuid, text) to authenticated;

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
  if p_count < -1 or p_count > 9 then raise exception 'bad count' using errcode = 'P0003'; end if;
  if v_clue = '' or v_clue ~ '\s' then
    raise exception 'clue must be a single word' using errcode = 'P0009';
  end if;

  -- Turkish-aware: "ELMA" must also match a board word typed "elma"
  if exists (
    select 1 from cn_cards c
    where c.game_id = p_game_id and not c.revealed
      and tr_fold(c.word) = tr_fold(v_clue)
  ) then
    raise exception 'clue is a word on the board' using errcode = 'P0010';
  end if;

  update cn_games
     set clue_word = v_clue,
         clue_count = p_count,
         guesses_left = case when p_count <= 0 then 99 else p_count + 1 end,
         guesses_made = 0
   where id = p_game_id;
end;
$$;
grant execute on function public.cn_clue(uuid, text, int) to authenticated;
