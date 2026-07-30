-- Retrobüs 0002 — the discussion hour: cards (boards / lean coffee / suggestions),
-- dot voting, actions, polls.
--
-- ANONYMITY CONTRACT (do not break):
--   * cards, votes and poll_responses carry NO author column when the stage is
--     anonymous, and NO precise timestamp — only `sort_seed` (random), which is
--     also the ONLY ordering ever used for display.
--   * Per-person limits live in `participation` (0001), which shares no key with
--     these rows. Content insert + ledger bump happen in one SECURITY DEFINER
--     transaction, so authorship cannot be recovered by any join.
--   * Named boards are the explicit exception: `author_member_id` is filled only
--     when the stage config says identity = 'named'.
--
-- Every policy here also requires `auth_member_id() is not null`: anonymous
-- sign-in (see 0001) gives any visitor the `authenticated` role, so that role
-- by itself proves nothing.

-- ---------- cards: boards, lean coffee topics, suggestions ----------

create table public.cards (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.stages (id) on delete cascade,
  -- board column key ('ground'/'pains'/…); null for lean_coffee & suggestions
  column_key text,
  body text not null check (length(trim(body)) between 1 and 500),
  -- filled ONLY on stages configured identity='named'
  author_member_id uuid references public.members (id) on delete set null,
  -- random display order; never order by id or a timestamp
  sort_seed double precision not null default random(),
  -- host groups duplicates under a parent card
  group_parent_id uuid references public.cards (id) on delete set null,
  -- host can hide a card live (safety valve on the feedback wall / any board)
  hidden boolean not null default false,
  created_day date not null default current_date -- coarse; never exposes submission order
);
create index cards_stage_idx on public.cards (stage_id, sort_seed);

-- ---------- dot voting ----------

-- One row per dot. Carries the target only — never a voter.
create table public.votes (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.stages (id) on delete cascade,
  card_id uuid not null references public.cards (id) on delete cascade
);
create index votes_stage_idx on public.votes (stage_id);
create index votes_card_idx on public.votes (card_id);

-- ---------- actions (deliberately NOT anonymous) ----------

create table public.actions (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  source_card_id uuid references public.cards (id) on delete set null,
  body text not null check (length(trim(body)) between 1 and 500),
  owner_member_id uuid references public.members (id) on delete set null,
  done boolean not null default false,
  created_at timestamptz not null default now()
);
create index actions_meeting_idx on public.actions (meeting_id);

-- ---------- polls ----------

create table public.polls (
  id uuid primary key default gen_random_uuid(),
  -- null while the poll sits in the prep bank, set when fired at a stage
  stage_id uuid references public.stages (id) on delete cascade,
  meeting_id uuid references public.meetings (id) on delete cascade,
  question text not null check (length(trim(question)) between 1 and 300),
  kind text not null check (kind in ('single', 'multi', 'scale5', 'scale10')),
  -- ['Evet','Hayır']; empty for scale kinds
  options jsonb not null default '[]'::jsonb,
  -- hidden until the host reveals, or live bars
  reveal text not null default 'batch' check (reveal in ('batch', 'live')),
  state text not null default 'draft' check (state in ('draft', 'open', 'revealed', 'closed')),
  created_at timestamptz not null default now()
);
create index polls_stage_idx on public.polls (stage_id);
create index polls_meeting_idx on public.polls (meeting_id);

-- Anonymous responses: no voter column, no timestamp.
create table public.poll_responses (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls (id) on delete cascade,
  -- index into polls.options for single/multi; 1..5 or 1..10 for scales
  choice int not null,
  sort_seed double precision not null default random()
);
create index poll_responses_poll_idx on public.poll_responses (poll_id);

-- ---------- submission RPCs (the only write path for anonymous content) ----------

-- Board / lean-coffee / suggestion card. Honors the stage's identity config:
-- named stages record the author, anonymous stages provably cannot.
create or replace function public.submit_card(
  p_stage_id uuid,
  p_body text,
  p_column_key text default null,
  p_max int default 20
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_named boolean;
begin
  perform assert_stage_open(p_stage_id);
  perform bump_participation(p_stage_id, 'card', p_max);

  select coalesce(config ->> 'identity', 'anon') = 'named'
    into v_named
  from stages where id = p_stage_id;

  insert into cards (stage_id, column_key, body, author_member_id)
  values (
    p_stage_id,
    p_column_key,
    trim(p_body),
    case when v_named then auth_member_id() else null end
  );
end;
$$;

-- Spend one dot on a card. The stage's config.dots caps the total per person.
--
-- Votable in 'open' AND 'revealed', unlike submit_card which is 'open' only:
-- the room writes cards while the stage is open, then votes on them once the
-- host reveals. Requiring 'open' here made voting impossible in the very phase
-- it exists for.
create or replace function public.cast_dot(p_card_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stage uuid;
  v_dots int;
  v_state text;
begin
  select c.stage_id, coalesce((s.config ->> 'dots')::int, 3), s.state
    into v_stage, v_dots, v_state
  from cards c join stages s on s.id = c.stage_id
  where c.id = p_card_id;

  if v_stage is null then
    raise exception 'unknown card' using errcode = 'P0002';
  end if;
  if v_state not in ('open', 'revealed') then
    raise exception 'voting closed' using errcode = 'P0002';
  end if;

  perform bump_participation(v_stage, 'dot', v_dots);

  insert into votes (stage_id, card_id) values (v_stage, p_card_id);
end;
$$;

-- Answer a poll. For 'multi', call once per selected choice; the ledger cap is
-- the number of options so a voter can pick several but not stuff the box.
create or replace function public.submit_poll_response(p_poll_id uuid, p_choice int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
  v_options int;
  v_state text;
  v_stage uuid;
  v_action text;
begin
  select kind, jsonb_array_length(options), state, stage_id
    into v_kind, v_options, v_state, v_stage
  from polls where id = p_poll_id;

  if v_kind is null then
    raise exception 'unknown poll' using errcode = 'P0002';
  end if;
  if v_state <> 'open' then
    raise exception 'poll not open' using errcode = 'P0002';
  end if;

  -- validate the choice against the poll's own shape
  if v_kind in ('single', 'multi') then
    if p_choice < 0 or p_choice >= v_options then
      raise exception 'choice out of range' using errcode = 'P0003';
    end if;
  elsif v_kind = 'scale5' then
    if p_choice < 1 or p_choice > 5 then
      raise exception 'choice out of range' using errcode = 'P0003';
    end if;
  elsif v_kind = 'scale10' then
    if p_choice < 1 or p_choice > 10 then
      raise exception 'choice out of range' using errcode = 'P0003';
    end if;
  end if;

  -- An open poll must be attached to a stage: the ledger is keyed by stage, so a
  -- stage-less poll would have no per-person cap at all.
  if v_stage is null then
    raise exception 'poll not attached to a stage' using errcode = 'P0002';
  end if;

  -- 'single'/scales: one answer per person, keyed by poll.
  -- 'multi': one answer per OPTION, so several options are allowed but the same
  -- option cannot be sent twice. Either way the cap on each key is 1.
  v_action := case when v_kind = 'multi' then 'poll:' || p_poll_id || ':' || p_choice
                   else 'poll:' || p_poll_id end;
  perform bump_participation(v_stage, v_action, 1);

  insert into poll_responses (poll_id, choice) values (p_poll_id, p_choice);
end;
$$;

grant execute on function public.submit_card(uuid, text, text, int) to authenticated;
grant execute on function public.cast_dot(uuid) to authenticated;
grant execute on function public.submit_poll_response(uuid, int) to authenticated;

-- ---------- RLS ----------

alter table public.cards enable row level security;
alter table public.votes enable row level security;
alter table public.actions enable row level security;
alter table public.polls enable row level security;
alter table public.poll_responses enable row level security;

-- cards: readable once the host reveals (batch) or immediately (live);
-- inserts go exclusively through submit_card.
revoke all on public.cards from anon, authenticated;
grant select on public.cards to authenticated;
grant update (column_key, group_parent_id, hidden) on public.cards to authenticated;
grant delete on public.cards to authenticated;

create policy cards_select on public.cards
  for select to authenticated using (
    auth_member_id() is not null
    and exists (
      select 1 from stages s
      where s.id = cards.stage_id
        and (
          s.state in ('revealed', 'closed')
          or coalesce(s.config ->> 'reveal', 'batch') = 'live'
          or auth_is_host()
        )
    )
  );
create policy cards_update_host on public.cards
  for update to authenticated using (auth_is_host()) with check (auth_is_host());
create policy cards_delete_host on public.cards
  for delete to authenticated using (auth_is_host());

-- votes: tallies are visible with the cards; individual rows reveal nothing.
revoke all on public.votes from anon, authenticated;
grant select on public.votes to authenticated;

create policy votes_select on public.votes
  for select to authenticated using (
    auth_member_id() is not null
    and exists (
      select 1 from stages s
      where s.id = votes.stage_id
        and (s.state in ('revealed', 'closed')
             or coalesce(s.config ->> 'reveal', 'batch') = 'live'
             or auth_is_host())
    )
  );

-- actions: everyone sees them (they are commitments), host maintains them.
revoke all on public.actions from anon, authenticated;
grant select on public.actions to authenticated;
grant insert (meeting_id, source_card_id, body, owner_member_id),
      update (body, owner_member_id, done), delete
  on public.actions to authenticated;

create policy actions_select on public.actions
  for select to authenticated using (auth_member_id() is not null);
create policy actions_insert_host on public.actions
  for insert to authenticated with check (auth_is_host());
create policy actions_update_host on public.actions
  for update to authenticated using (auth_is_host()) with check (auth_is_host());
create policy actions_delete_host on public.actions
  for delete to authenticated using (auth_is_host());

-- polls: draft bank is host-only; open/revealed polls are visible to all.
revoke all on public.polls from anon, authenticated;
grant select on public.polls to authenticated;
grant insert (stage_id, meeting_id, question, kind, options, reveal, state),
      update (stage_id, question, kind, options, reveal, state), delete
  on public.polls to authenticated;

create policy polls_select on public.polls
  for select to authenticated using (
    auth_member_id() is not null and (state <> 'draft' or auth_is_host())
  );
create policy polls_insert_host on public.polls
  for insert to authenticated with check (auth_is_host());
create policy polls_update_host on public.polls
  for update to authenticated using (auth_is_host()) with check (auth_is_host());
create policy polls_delete_host on public.polls
  for delete to authenticated using (auth_is_host());

-- poll_responses: readable only once revealed (or live), so early votes can't
-- anchor the room. Writes go exclusively through submit_poll_response.
revoke all on public.poll_responses from anon, authenticated;
grant select on public.poll_responses to authenticated;

create policy poll_responses_select on public.poll_responses
  for select to authenticated using (
    auth_member_id() is not null
    and exists (
      select 1 from polls p
      where p.id = poll_responses.poll_id
        and (p.state in ('revealed', 'closed') or p.reveal = 'live' or auth_is_host())
    )
  );

-- ---------- realtime ----------

alter publication supabase_realtime add table public.cards;
alter publication supabase_realtime add table public.votes;
alter publication supabase_realtime add table public.actions;
alter publication supabase_realtime add table public.polls;
alter publication supabase_realtime add table public.poll_responses;
