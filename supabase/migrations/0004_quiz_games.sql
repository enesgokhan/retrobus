-- Retrobüs 0004 — quiz engine, Fibbage, Rank These, meta-leaderboard.
--
-- Scoring is computed SERVER-SIDE only, in host-only SECURITY DEFINER functions.
-- Clients never insert into `scores`; if they could, the leaderboard would be a
-- suggestion rather than a record.
--
-- Correct answers are held in side tables (quiz_keys) with RLS, the same pattern
-- as two_truths_keys: column grants cannot be conditional, so "hidden until the
-- host reveals" has to be a row the policy can gate.

-- ---------- quiz ----------

create table public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  -- null while it sits in the bank; set when attached to a stage
  stage_id uuid references public.stages (id) on delete cascade,
  meeting_id uuid references public.meetings (id) on delete cascade,
  kind text not null check (kind in ('choice', 'number')),
  prompt text not null check (length(trim(prompt)) between 1 and 400),
  -- ['Ankara','İstanbul',...]; empty for 'number'
  options jsonb not null default '[]'::jsonb,
  order_index int not null default 1,
  time_limit_s int not null default 25 check (time_limit_s between 5 and 300),
  base_points int not null default 1000 check (base_points between 1 and 10000),
  state text not null default 'draft' check (state in ('draft', 'open', 'revealed', 'closed')),
  opened_at timestamptz,
  created_at timestamptz not null default now()
);
create index quiz_q_stage_idx on public.quiz_questions (stage_id, order_index);

-- The answer. Hidden until that question is revealed.
create table public.quiz_keys (
  question_id uuid primary key references public.quiz_questions (id) on delete cascade,
  -- index into options for 'choice'
  correct_index int,
  -- the true value for 'number'
  correct_number numeric
);

-- Answers are attributed on purpose: the leaderboard is by name.
create table public.quiz_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.quiz_questions (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  choice_index int,
  number_value numeric,
  -- milliseconds from the question opening; drives speed weighting
  elapsed_ms int not null check (elapsed_ms >= 0),
  unique (question_id, member_id)
);
create index quiz_a_question_idx on public.quiz_answers (question_id);

-- Answer a question. Server stamps elapsed time from opened_at so a client
-- cannot claim it answered instantly.
create or replace function public.answer_quiz(
  p_question_id uuid, p_choice_index int default null, p_number numeric default null
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_member uuid := auth_member_id();
  v_q quiz_questions;
  v_elapsed int;
begin
  if v_member is null then raise exception 'not a member' using errcode = '28000'; end if;

  select q.* into v_q from quiz_questions q where q.id = p_question_id;
  if not found then raise exception 'unknown question' using errcode = 'P0002'; end if;
  if v_q.state <> 'open' then raise exception 'question not open' using errcode = 'P0002'; end if;

  if v_q.kind = 'choice' then
    if p_choice_index is null
       or p_choice_index < 0
       or p_choice_index >= jsonb_array_length(v_q.options) then
      raise exception 'choice out of range' using errcode = 'P0003';
    end if;
  else
    if p_number is null then raise exception 'number required' using errcode = 'P0003'; end if;
  end if;

  -- clamp so a slow network cannot produce a negative or absurd bonus
  v_elapsed := greatest(0, least(
    (extract(epoch from (now() - coalesce(v_q.opened_at, now()))) * 1000)::int,
    v_q.time_limit_s * 1000
  ));

  insert into quiz_answers (question_id, member_id, choice_index, number_value, elapsed_ms)
  values (p_question_id, v_member, p_choice_index, p_number, v_elapsed)
  on conflict (question_id, member_id) do nothing; -- first answer is final
end;
$$;
grant execute on function public.answer_quiz(uuid, int, numeric) to authenticated;

-- Host reveals a question and awards points.
--   choice: base * (1 - 0.5 * elapsed/limit), so speed matters but never halves
--           the value of simply being right
--   number: ranked by absolute distance; ties share a rank
create or replace function public.reveal_quiz(p_question_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_q quiz_questions;
  v_key quiz_keys;
  v_meeting uuid;
  v_awarded int := 0;
begin
  if not auth_is_host() then raise exception 'host only' using errcode = '42501'; end if;

  select q.* into v_q from quiz_questions q where q.id = p_question_id;
  if not found then raise exception 'unknown question' using errcode = 'P0002'; end if;
  if v_q.state in ('revealed', 'closed') then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  select k.* into v_key from quiz_keys k where k.question_id = p_question_id;
  select coalesce(v_q.meeting_id, s.meeting_id) into v_meeting
  from stages s where s.id = v_q.stage_id;

  if v_q.kind = 'choice' then
    insert into scores (meeting_id, stage_id, member_id, points, reason)
    select v_meeting, v_q.stage_id, a.member_id,
           greatest(1, round(v_q.base_points *
             (1 - 0.5 * least(a.elapsed_ms::numeric / (v_q.time_limit_s * 1000), 1)))::int),
           'quiz_correct'
    from quiz_answers a
    where a.question_id = p_question_id and a.choice_index = v_key.correct_index;
    select count(*) into v_awarded from quiz_answers a
      where a.question_id = p_question_id and a.choice_index = v_key.correct_index;
  else
    -- closest wins; 1st gets full, 2nd 60%, 3rd 30%
    insert into scores (meeting_id, stage_id, member_id, points, reason)
    select v_meeting, v_q.stage_id, ranked.member_id,
           case ranked.rnk when 1 then v_q.base_points
                           when 2 then (v_q.base_points * 0.6)::int
                           when 3 then (v_q.base_points * 0.3)::int end,
           'quiz_closest'
    from (
      select a.member_id,
             dense_rank() over (order by abs(a.number_value - v_key.correct_number)) as rnk
      from quiz_answers a
      where a.question_id = p_question_id and a.number_value is not null
    ) ranked
    where ranked.rnk <= 3;
    select count(*) into v_awarded from quiz_answers a where a.question_id = p_question_id;
  end if;

  update quiz_questions set state = 'revealed' where id = p_question_id;
  return jsonb_build_object('ok', true, 'awarded', v_awarded);
end;
$$;
grant execute on function public.reveal_quiz(uuid) to authenticated;

-- Opening a question must stamp opened_at server-side (it anchors the timer).
create or replace function public.open_quiz(p_question_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not auth_is_host() then raise exception 'host only' using errcode = '42501'; end if;
  update quiz_questions
     set state = 'open', opened_at = now()
   where id = p_question_id and state = 'draft';
  if not found then raise exception 'question not in draft' using errcode = 'P0002'; end if;
end;
$$;
grant execute on function public.open_quiz(uuid) to authenticated;

alter table public.quiz_questions enable row level security;
alter table public.quiz_keys enable row level security;
alter table public.quiz_answers enable row level security;

revoke all on public.quiz_questions from anon, authenticated;
grant select on public.quiz_questions to authenticated;
grant insert (stage_id, meeting_id, kind, prompt, options, order_index, time_limit_s, base_points, state),
      update (stage_id, prompt, options, order_index, time_limit_s, base_points, state), delete
  on public.quiz_questions to authenticated;

-- draft questions are the host's private bank
create policy quiz_q_select on public.quiz_questions
  for select to authenticated using (
    auth_member_id() is not null and (state <> 'draft' or auth_is_host())
  );
create policy quiz_q_insert_host on public.quiz_questions
  for insert to authenticated with check (auth_is_host());
create policy quiz_q_update_host on public.quiz_questions
  for update to authenticated using (auth_is_host()) with check (auth_is_host());
create policy quiz_q_delete_host on public.quiz_questions
  for delete to authenticated using (auth_is_host());

-- the answer: only after that question is revealed. Not even the host early —
-- they author it, so they already know, and this keeps one rule for everyone.
revoke all on public.quiz_keys from anon, authenticated;
grant select on public.quiz_keys to authenticated;
grant insert (question_id, correct_index, correct_number), update (correct_index, correct_number)
  on public.quiz_keys to authenticated;

create policy quiz_keys_select on public.quiz_keys
  for select to authenticated using (
    exists (
      select 1 from quiz_questions q
      where q.id = quiz_keys.question_id and q.state in ('revealed', 'closed')
    )
  );
create policy quiz_keys_write_host on public.quiz_keys
  for insert to authenticated with check (auth_is_host());
create policy quiz_keys_update_host on public.quiz_keys
  for update to authenticated using (auth_is_host()) with check (auth_is_host());

-- answers: your own always; everyone's once revealed (so the room sees who got it)
revoke all on public.quiz_answers from anon, authenticated;
grant select on public.quiz_answers to authenticated;

create policy quiz_answers_select on public.quiz_answers
  for select to authenticated using (
    member_id = auth_member_id()
    or exists (
      select 1 from quiz_questions q
      where q.id = quiz_answers.question_id and q.state in ('revealed', 'closed')
    )
  );

-- ---------- Fibbage ----------
-- One prompt with a real answer; everyone invents a lie; then everyone picks
-- from the shuffled pool. Points for guessing right AND for fooling people.

create table public.fibbage_rounds (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.stages (id) on delete cascade,
  prompt text not null check (length(trim(prompt)) between 1 and 400),
  truth text not null check (length(trim(truth)) between 1 and 200),
  -- lie | guess | revealed
  phase text not null default 'lie' check (phase in ('lie', 'guess', 'revealed')),
  order_index int not null default 1
);
create index fib_round_stage_idx on public.fibbage_rounds (stage_id, order_index);

create table public.fibbage_lies (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.fibbage_rounds (id) on delete cascade,
  author_member_id uuid not null references public.members (id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 200),
  sort_seed double precision not null default random(),
  unique (round_id, author_member_id)
);
create index fib_lies_round_idx on public.fibbage_lies (round_id);

create table public.fibbage_picks (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.fibbage_rounds (id) on delete cascade,
  picker_member_id uuid not null references public.members (id) on delete cascade,
  -- exactly one of these
  lie_id uuid references public.fibbage_lies (id) on delete cascade,
  picked_truth boolean not null default false,
  unique (round_id, picker_member_id)
);
create index fib_picks_round_idx on public.fibbage_picks (round_id);

create or replace function public.submit_fib_lie(p_round_id uuid, p_body text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_member uuid := auth_member_id();
  v_round fibbage_rounds;
begin
  if v_member is null then raise exception 'not a member' using errcode = '28000'; end if;
  select r.* into v_round from fibbage_rounds r where r.id = p_round_id;
  if not found then raise exception 'unknown round' using errcode = 'P0002'; end if;
  if v_round.phase <> 'lie' then raise exception 'not accepting lies' using errcode = 'P0002'; end if;
  -- a lie identical to the truth would make the round unwinnable
  if lower(trim(p_body)) = lower(trim(v_round.truth)) then
    raise exception 'that is the truth' using errcode = 'P0005';
  end if;

  insert into fibbage_lies (round_id, author_member_id, body)
  values (p_round_id, v_member, trim(p_body))
  on conflict (round_id, author_member_id) do update set body = excluded.body;
end;
$$;
grant execute on function public.submit_fib_lie(uuid, text) to authenticated;

create or replace function public.pick_fib(p_round_id uuid, p_lie_id uuid, p_truth boolean)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_member uuid := auth_member_id();
  v_round fibbage_rounds;
  v_owner uuid;
begin
  if v_member is null then raise exception 'not a member' using errcode = '28000'; end if;
  select r.* into v_round from fibbage_rounds r where r.id = p_round_id;
  if not found then raise exception 'unknown round' using errcode = 'P0002'; end if;
  if v_round.phase <> 'guess' then raise exception 'not accepting picks' using errcode = 'P0002'; end if;

  if p_truth then
    p_lie_id := null;
  else
    if p_lie_id is null then raise exception 'pick something' using errcode = 'P0003'; end if;
    select l.author_member_id into v_owner from fibbage_lies l
      where l.id = p_lie_id and l.round_id = p_round_id;
    if v_owner is null then raise exception 'unknown lie' using errcode = 'P0002'; end if;
    if v_owner = v_member then
      raise exception 'cannot pick your own lie' using errcode = 'P0004';
    end if;
  end if;

  insert into fibbage_picks (round_id, picker_member_id, lie_id, picked_truth)
  values (p_round_id, v_member, p_lie_id, coalesce(p_truth, false))
  on conflict (round_id, picker_member_id)
  do update set lie_id = excluded.lie_id, picked_truth = excluded.picked_truth;
end;
$$;
grant execute on function public.pick_fib(uuid, uuid, boolean) to authenticated;

-- Reveal: +1000 for finding the truth, +500 to a liar per person they fooled.
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
begin
  if not auth_is_host() then raise exception 'host only' using errcode = '42501'; end if;
  select r.* into v_round from fibbage_rounds r where r.id = p_round_id;
  if not found then raise exception 'unknown round' using errcode = 'P0002'; end if;
  if v_round.phase = 'revealed' then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  select s.meeting_id into v_meeting from stages s where s.id = v_round.stage_id;

  insert into scores (meeting_id, stage_id, member_id, points, reason)
  select v_meeting, v_round.stage_id, p.picker_member_id, 1000, 'fib_found_truth'
  from fibbage_picks p where p.round_id = p_round_id and p.picked_truth;
  select count(*) into v_found from fibbage_picks p
    where p.round_id = p_round_id and p.picked_truth;

  insert into scores (meeting_id, stage_id, member_id, points, reason)
  select v_meeting, v_round.stage_id, l.author_member_id, 500 * count(p.id), 'fib_fooled'
  from fibbage_lies l
  join fibbage_picks p on p.lie_id = l.id
  where l.round_id = p_round_id
  group by l.author_member_id
  having count(p.id) > 0;
  select count(*) into v_fooled from fibbage_picks p
    where p.round_id = p_round_id and p.lie_id is not null;

  update fibbage_rounds set phase = 'revealed' where id = p_round_id;
  return jsonb_build_object('ok', true, 'found_truth', v_found, 'fooled', v_fooled);
end;
$$;
grant execute on function public.reveal_fib(uuid) to authenticated;

alter table public.fibbage_rounds enable row level security;
alter table public.fibbage_lies enable row level security;
alter table public.fibbage_picks enable row level security;

revoke all on public.fibbage_rounds from anon, authenticated;
grant select on public.fibbage_rounds to authenticated;
grant insert (stage_id, prompt, truth, phase, order_index), update (prompt, truth, phase, order_index), delete
  on public.fibbage_rounds to authenticated;

-- The truth column is inside this row, so the row itself must stay hidden while
-- lies are being written. Only the host (who authored it) sees it early.
create policy fib_rounds_select on public.fibbage_rounds
  for select to authenticated using (
    auth_member_id() is not null and (phase <> 'lie' or auth_is_host())
  );
create policy fib_rounds_insert_host on public.fibbage_rounds
  for insert to authenticated with check (auth_is_host());
create policy fib_rounds_update_host on public.fibbage_rounds
  for update to authenticated using (auth_is_host()) with check (auth_is_host());
create policy fib_rounds_delete_host on public.fibbage_rounds
  for delete to authenticated using (auth_is_host());

-- Lies: bodies are visible during guessing, but WHO WROTE WHAT is the whole
-- game, so author_member_id gets NO column grant at all. A row policy cannot
-- protect a single column — it decides whole rows — so gating authorship has to
-- be done with column privileges plus the fib_authorship() RPC below.
revoke all on public.fibbage_lies from anon, authenticated;
grant select (id, round_id, body, sort_seed) on public.fibbage_lies to authenticated;

create policy fib_lies_select on public.fibbage_lies
  for select to authenticated using (
    auth_member_id() is not null
    and exists (
      select 1 from fibbage_rounds r
      where r.id = fibbage_lies.round_id and r.phase in ('lie', 'guess', 'revealed')
    )
  );

-- Authorship: always your own (so a reload still knows which lie is yours),
-- everyone's only once the round is revealed.
create or replace function public.fib_authorship(p_round_id uuid)
returns table (lie_id uuid, author_member_id uuid)
language sql stable security definer
set search_path = public
as $$
  select l.id, l.author_member_id
  from fibbage_lies l
  join fibbage_rounds r on r.id = l.round_id
  where l.round_id = p_round_id
    and auth_member_id() is not null
    and (r.phase = 'revealed' or l.author_member_id = auth_member_id())
$$;
grant execute on function public.fib_authorship(uuid) to authenticated;

revoke all on public.fibbage_picks from anon, authenticated;
grant select on public.fibbage_picks to authenticated;

create policy fib_picks_select on public.fibbage_picks
  for select to authenticated using (
    picker_member_id = auth_member_id()
    or exists (
      select 1 from fibbage_rounds r
      where r.id = fibbage_picks.round_id and r.phase = 'revealed'
    )
  );

-- ---------- Rank These ----------
-- Everyone secretly orders a list; reveal shows how similar the room is.

create table public.rank_items (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.stages (id) on delete cascade,
  label text not null check (length(trim(label)) between 1 and 100),
  order_index int not null default 1
);
create index rank_items_stage_idx on public.rank_items (stage_id, order_index);

-- Anonymous: no member column. One submission per person via the ledger.
create table public.rank_submissions (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.stages (id) on delete cascade,
  -- ordered array of rank_items.id, best first
  ordering jsonb not null,
  sort_seed double precision not null default random()
);
create index rank_subs_stage_idx on public.rank_submissions (stage_id);

create or replace function public.submit_ranking(p_stage_id uuid, p_ordering jsonb)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_expected int;
begin
  perform assert_stage_open(p_stage_id);
  select count(*) into v_expected from rank_items i where i.stage_id = p_stage_id;
  if jsonb_array_length(p_ordering) <> v_expected then
    raise exception 'ranking must cover every item' using errcode = 'P0003';
  end if;
  -- every id must belong to this stage, and none may repeat
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

  perform bump_participation(p_stage_id, 'ranking', 1);
  insert into rank_submissions (stage_id, ordering) values (p_stage_id, p_ordering);
end;
$$;
grant execute on function public.submit_ranking(uuid, jsonb) to authenticated;

alter table public.rank_items enable row level security;
alter table public.rank_submissions enable row level security;

revoke all on public.rank_items from anon, authenticated;
grant select on public.rank_items to authenticated;
grant insert (stage_id, label, order_index), update (label, order_index), delete
  on public.rank_items to authenticated;

create policy rank_items_select on public.rank_items
  for select to authenticated using (auth_member_id() is not null);
create policy rank_items_insert_host on public.rank_items
  for insert to authenticated with check (auth_is_host());
create policy rank_items_update_host on public.rank_items
  for update to authenticated using (auth_is_host()) with check (auth_is_host());
create policy rank_items_delete_host on public.rank_items
  for delete to authenticated using (auth_is_host());

revoke all on public.rank_submissions from anon, authenticated;
grant select on public.rank_submissions to authenticated;

create policy rank_subs_select on public.rank_submissions
  for select to authenticated using (
    auth_member_id() is not null
    and exists (
      select 1 from stages s
      where s.id = rank_submissions.stage_id and s.state in ('revealed', 'closed')
    )
  );

-- ---------- leaderboard ----------
-- Aggregated server-side so a client cannot invent standings.

create or replace function public.leaderboard(p_meeting_id uuid)
returns table (member_id uuid, display_name text, avatar text, points bigint)
language sql stable security definer
set search_path = public
as $$
  select m.id, m.display_name, m.avatar, coalesce(sum(s.points), 0)::bigint as points
  from members m
  left join scores s on s.member_id = m.id and s.meeting_id = p_meeting_id
  where exists (select 1 from member_links l where l.member_id = m.id)
     or exists (select 1 from scores s2 where s2.member_id = m.id and s2.meeting_id = p_meeting_id)
  group by m.id, m.display_name, m.avatar
  order by points desc, m.display_name
$$;
grant execute on function public.leaderboard(uuid) to authenticated;

-- ---------- realtime ----------

alter publication supabase_realtime add table public.quiz_questions;
alter publication supabase_realtime add table public.quiz_answers;
alter publication supabase_realtime add table public.fibbage_rounds;
alter publication supabase_realtime add table public.fibbage_lies;
alter publication supabase_realtime add table public.fibbage_picks;
alter publication supabase_realtime add table public.rank_items;
alter publication supabase_realtime add table public.rank_submissions;
