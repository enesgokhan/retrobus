-- Retrobüs 0003 — icebreakers, team temperature, feedback wall, scores, avatars.
--
-- Reuses `cards` (0002) wherever the mechanic is "submit short text, maybe vote":
--   * wordcloud   -> cards, one per person, aggregated client-side by lower(body)
--   * AMA         -> cards + dot voting, so the room surfaces the best questions
-- New tables exist only where the mechanic genuinely differs.
--
-- Anonymity rules from 0002 continue to apply: feedback_items and
-- health_responses carry NO author and NO precise timestamp, only sort_seed.
-- two_truths_* is deliberately NOT anonymous — knowing whose statements these
-- are is the entire game.

-- ---------- avatars ----------

alter table public.members add column avatar text
  check (avatar is null or length(avatar) between 1 and 8);
grant update (avatar) on public.members to authenticated;

-- Members may set their OWN avatar (the host policy already covers everyone).
create policy members_update_own_avatar on public.members
  for update to authenticated
  using (id = auth_member_id())
  with check (id = auth_member_id());

-- current_member now carries the avatar too
drop function if exists public.current_member();
create or replace function public.current_member()
returns table (id uuid, display_name text, is_host boolean, avatar text)
language sql stable security definer
set search_path = public
as $$
  select m.id, m.display_name, m.is_host, m.avatar
  from member_links l join members m on m.id = l.member_id
  where l.auth_uid = auth.uid()
$$;
grant execute on function public.current_member() to authenticated;

-- ---------- let members rotate their own code ----------
-- The host assigns the initial code; without this, a host cannot even change
-- their own, leaving a known code live on a public URL.
create or replace function public.change_my_code(p_current text, p_new text)
returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_member members;
begin
  select m.* into v_member from members m where m.id = auth_member_id();
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_member');
  end if;
  if p_new !~ '^\d{6}$' then
    return jsonb_build_object('ok', false, 'reason', 'bad_format');
  end if;
  -- knowing the current code is required, so a borrowed unlocked phone cannot
  -- lock the real owner out
  if v_member.code_hash is not null
     and crypt(coalesce(p_current, ''), v_member.code_hash) <> v_member.code_hash then
    return jsonb_build_object('ok', false, 'reason', 'wrong_current');
  end if;
  update members set code_hash = crypt(p_new, gen_salt('bf', 10)) where id = v_member.id;
  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.change_my_code(text, text) to authenticated;

-- ---------- scores (meta-leaderboard) ----------
-- Not anonymous: a leaderboard by name is the point.

create table public.scores (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  stage_id uuid references public.stages (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  points int not null,
  reason text,
  created_at timestamptz not null default now()
);
create index scores_meeting_idx on public.scores (meeting_id);
create index scores_member_idx on public.scores (member_id);

alter table public.scores enable row level security;
revoke all on public.scores from anon, authenticated;
grant select on public.scores to authenticated;

-- Visible to members, but the standings stay hidden until the host reveals the
-- leaderboard stage — suspense is the point, so this is a feature not an oversight.
create policy scores_select on public.scores
  for select to authenticated using (auth_member_id() is not null);

-- ---------- two truths and a lie ----------

create table public.two_truths_entries (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.stages (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  s1 text not null check (length(trim(s1)) between 1 and 200),
  s2 text not null check (length(trim(s2)) between 1 and 200),
  s3 text not null check (length(trim(s3)) between 1 and 200),
  revealed boolean not null default false,
  unique (stage_id, member_id)
);
create index tt_entries_stage_idx on public.two_truths_entries (stage_id);

-- Which statement is the lie. Separate table so RLS can hide it until reveal —
-- column-level grants cannot be made conditional. Same pattern the codenames
-- key card will use.
create table public.two_truths_keys (
  entry_id uuid primary key references public.two_truths_entries (id) on delete cascade,
  lie_index int not null check (lie_index between 1 and 3)
);

create table public.two_truths_guesses (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.two_truths_entries (id) on delete cascade,
  guesser_member_id uuid not null references public.members (id) on delete cascade,
  guess_index int not null check (guess_index between 1 and 3),
  unique (entry_id, guesser_member_id)
);
create index tt_guesses_entry_idx on public.two_truths_guesses (entry_id);

-- Submit your own three statements.
create or replace function public.submit_two_truths(
  p_stage_id uuid, p_s1 text, p_s2 text, p_s3 text, p_lie_index int
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_member uuid := auth_member_id();
  v_entry uuid;
begin
  if v_member is null then raise exception 'not a member' using errcode = '28000'; end if;
  if p_lie_index not between 1 and 3 then
    raise exception 'lie_index must be 1..3' using errcode = 'P0003';
  end if;
  perform assert_stage_open(p_stage_id);

  insert into two_truths_entries (stage_id, member_id, s1, s2, s3)
  values (p_stage_id, v_member, trim(p_s1), trim(p_s2), trim(p_s3))
  on conflict (stage_id, member_id) do update
    set s1 = excluded.s1, s2 = excluded.s2, s3 = excluded.s3, revealed = false
  returning id into v_entry;

  insert into two_truths_keys (entry_id, lie_index)
  values (v_entry, p_lie_index)
  on conflict (entry_id) do update set lie_index = excluded.lie_index;
end;
$$;
grant execute on function public.submit_two_truths(uuid, text, text, text, int) to authenticated;

-- Guess someone else's lie. One guess per entry per person; no self-guessing.
create or replace function public.guess_two_truths(p_entry_id uuid, p_guess_index int)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_member uuid := auth_member_id();
  v_entry two_truths_entries;
begin
  if v_member is null then raise exception 'not a member' using errcode = '28000'; end if;
  if p_guess_index not between 1 and 3 then
    raise exception 'guess must be 1..3' using errcode = 'P0003';
  end if;

  select e.* into v_entry from two_truths_entries e where e.id = p_entry_id;
  if not found then raise exception 'unknown entry' using errcode = 'P0002'; end if;
  if v_entry.revealed then raise exception 'already revealed' using errcode = 'P0002'; end if;
  if v_entry.member_id = v_member then
    raise exception 'cannot guess your own' using errcode = 'P0004';
  end if;

  insert into two_truths_guesses (entry_id, guesser_member_id, guess_index)
  values (p_entry_id, v_member, p_guess_index)
  on conflict (entry_id, guesser_member_id) do update set guess_index = excluded.guess_index;
end;
$$;
grant execute on function public.guess_two_truths(uuid, int) to authenticated;

-- Host reveals one entry: exposes the lie and awards points.
--   +2 per correct guess, +1 to the author for each person fooled.
create or replace function public.reveal_two_truths(p_entry_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_entry two_truths_entries;
  v_lie int;
  v_meeting uuid;
  v_correct int;
  v_fooled int;
begin
  if not auth_is_host() then raise exception 'host only' using errcode = '42501'; end if;

  select e.* into v_entry from two_truths_entries e where e.id = p_entry_id;
  if not found then raise exception 'unknown entry' using errcode = 'P0002'; end if;
  if v_entry.revealed then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  select k.lie_index into v_lie from two_truths_keys k where k.entry_id = p_entry_id;
  select s.meeting_id into v_meeting from stages s where s.id = v_entry.stage_id;

  select count(*) filter (where g.guess_index = v_lie),
         count(*) filter (where g.guess_index <> v_lie)
    into v_correct, v_fooled
  from two_truths_guesses g where g.entry_id = p_entry_id;

  -- correct guessers
  insert into scores (meeting_id, stage_id, member_id, points, reason)
  select v_meeting, v_entry.stage_id, g.guesser_member_id, 2, 'two_truths_correct'
  from two_truths_guesses g
  where g.entry_id = p_entry_id and g.guess_index = v_lie;

  -- author, one point per person fooled
  if v_fooled > 0 then
    insert into scores (meeting_id, stage_id, member_id, points, reason)
    values (v_meeting, v_entry.stage_id, v_entry.member_id, v_fooled, 'two_truths_fooled');
  end if;

  update two_truths_entries set revealed = true where id = p_entry_id;

  return jsonb_build_object(
    'ok', true, 'lie_index', v_lie, 'correct', v_correct, 'fooled', v_fooled
  );
end;
$$;
grant execute on function public.reveal_two_truths(uuid) to authenticated;

alter table public.two_truths_entries enable row level security;
alter table public.two_truths_keys enable row level security;
alter table public.two_truths_guesses enable row level security;

revoke all on public.two_truths_entries from anon, authenticated;
grant select on public.two_truths_entries to authenticated;
create policy tt_entries_select on public.two_truths_entries
  for select to authenticated using (auth_member_id() is not null);

-- The lie is readable by its author (so they can check what they submitted) and
-- by everyone once the host reveals that entry. Never otherwise.
revoke all on public.two_truths_keys from anon, authenticated;
grant select on public.two_truths_keys to authenticated;
create policy tt_keys_select on public.two_truths_keys
  for select to authenticated using (
    exists (
      select 1 from two_truths_entries e
      where e.id = two_truths_keys.entry_id
        and (e.member_id = auth_member_id() or e.revealed)
    )
  );

-- Guesses stay hidden until the entry is revealed, so nobody copies the room.
revoke all on public.two_truths_guesses from anon, authenticated;
grant select on public.two_truths_guesses to authenticated;
create policy tt_guesses_select on public.two_truths_guesses
  for select to authenticated using (
    guesser_member_id = auth_member_id()
    or exists (
      select 1 from two_truths_entries e
      where e.id = two_truths_guesses.entry_id and (e.revealed or auth_is_host())
    )
  );

-- ---------- team temperature (health check) ----------
-- Anonymous: no member column at all. Dimensions live in stages.config.
-- rating 1 = kırmızı, 2 = sarı, 3 = yeşil.

create table public.health_responses (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.stages (id) on delete cascade,
  dimension_key text not null,
  rating int not null check (rating between 1 and 3),
  sort_seed double precision not null default random()
);
create index health_stage_idx on public.health_responses (stage_id);

create or replace function public.submit_health(p_stage_id uuid, p_dimension_key text, p_rating int)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if p_rating not between 1 and 3 then
    raise exception 'rating must be 1..3' using errcode = 'P0003';
  end if;
  perform assert_stage_open(p_stage_id);
  -- one rating per person per dimension
  perform bump_participation(p_stage_id, 'health:' || p_dimension_key, 1);
  insert into health_responses (stage_id, dimension_key, rating)
  values (p_stage_id, p_dimension_key, p_rating);
end;
$$;
grant execute on function public.submit_health(uuid, text, int) to authenticated;

alter table public.health_responses enable row level security;
revoke all on public.health_responses from anon, authenticated;
grant select on public.health_responses to authenticated;

create policy health_select on public.health_responses
  for select to authenticated using (
    auth_member_id() is not null
    and exists (
      select 1 from stages s
      where s.id = health_responses.stage_id
        and (s.state in ('revealed', 'closed') or auth_is_host())
    )
  );

-- ---------- feedback wall + kudos ----------
-- Anonymous. Batch reveal: nothing is readable until the host reveals the stage,
-- which also defeats "who went quiet to type" correlation on a video call.

create table public.feedback_items (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.stages (id) on delete cascade,
  target_member_id uuid not null references public.members (id) on delete cascade,
  kind text not null check (kind in ('strength', 'growth', 'kudos')),
  body text not null check (length(trim(body)) between 1 and 500),
  sort_seed double precision not null default random(),
  hidden boolean not null default false
);
create index feedback_stage_idx on public.feedback_items (stage_id, sort_seed);
create index feedback_target_idx on public.feedback_items (target_member_id);

create or replace function public.submit_feedback(
  p_stage_id uuid, p_target_member_id uuid, p_kind text, p_body text
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_member uuid := auth_member_id();
begin
  if v_member is null then raise exception 'not a member' using errcode = '28000'; end if;
  if p_kind not in ('strength', 'growth', 'kudos') then
    raise exception 'bad kind' using errcode = 'P0003';
  end if;
  if p_target_member_id = v_member then
    raise exception 'cannot write about yourself' using errcode = 'P0004';
  end if;
  perform assert_stage_open(p_stage_id);
  -- free choice of who to write about, capped per target so nobody gets piled on
  perform bump_participation(p_stage_id, 'fb:' || p_target_member_id || ':' || p_kind, 2);

  insert into feedback_items (stage_id, target_member_id, kind, body)
  values (p_stage_id, p_target_member_id, p_kind, trim(p_body));
end;
$$;
grant execute on function public.submit_feedback(uuid, uuid, text, text) to authenticated;

alter table public.feedback_items enable row level security;
revoke all on public.feedback_items from anon, authenticated;
grant select on public.feedback_items to authenticated;
grant update (hidden) on public.feedback_items to authenticated;

-- Readable only once revealed. The host is deliberately NOT exempt here: there
-- is no grouping step to justify early access, and the team was told the wall
-- appears all at once.
create policy feedback_select on public.feedback_items
  for select to authenticated using (
    auth_member_id() is not null
    and exists (
      select 1 from stages s
      where s.id = feedback_items.stage_id and s.state in ('revealed', 'closed')
    )
  );
create policy feedback_update_host on public.feedback_items
  for update to authenticated using (auth_is_host()) with check (auth_is_host());

-- ---------- realtime ----------

alter publication supabase_realtime add table public.scores;
alter publication supabase_realtime add table public.two_truths_entries;
alter publication supabase_realtime add table public.two_truths_guesses;
alter publication supabase_realtime add table public.health_responses;
alter publication supabase_realtime add table public.feedback_items;
