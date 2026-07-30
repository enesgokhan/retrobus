-- Retrobüs 0001 — spine: members, meetings, stages, participation ledger.
-- Security model:
--   * Clients authenticate with a custom JWT minted by the `login` edge function.
--     Claims: sub = member id, member_id, is_host, role = 'authenticated'.
--   * RLS everywhere; code hashes and login throttling are service-role-only.
--   * The participation ledger enforces per-person limits for anonymous features
--     WITHOUT any link to the content rows (see bump_participation).

-- ---------- helpers ----------

create or replace function public.auth_member_id()
returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'member_id', '')::uuid
$$;

create or replace function public.auth_is_host()
returns boolean
language sql stable
as $$
  select coalesce((current_setting('request.jwt.claims', true)::jsonb ->> 'is_host')::boolean, false)
$$;

-- ---------- tables ----------

create table public.members (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (length(trim(display_name)) between 1 and 40),
  code_hash text, -- pbkdf2$<iter>$<salt>$<hash>; null until the host assigns a code
  code_set boolean generated always as (code_hash is not null) stored,
  is_host boolean not null default false,
  created_at timestamptz not null default now()
);
-- names are unique case-insensitively (login matches by name)
create unique index members_display_name_key on public.members (lower(display_name));

create table public.login_attempts (
  member_id uuid primary key references public.members (id) on delete cascade,
  window_start timestamptz not null default now(),
  fail_count int not null default 0
);

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 120),
  status text not null default 'draft' check (status in ('draft', 'live', 'done')),
  active_stage_id uuid,
  created_at timestamptz not null default now()
);

create table public.stages (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  kind text not null check (
    kind in (
      'wordcloud', 'two_truths', 'health_check', 'lean_coffee', 'board', 'poll',
      'feedback_wall', 'suggestions', 'quiz', 'codenames', 'wavelength',
      'leaderboard', 'break'
    )
  ),
  title text not null check (length(trim(title)) between 1 and 120),
  order_index int not null,
  config jsonb not null default '{}'::jsonb,
  state text not null default 'pending' check (state in ('pending', 'open', 'revealed', 'closed')),
  opened_at timestamptz,
  -- shared countdown: running => timer_ends_at set; paused => timer_remaining_s set
  timer_ends_at timestamptz,
  timer_remaining_s int check (timer_remaining_s >= 0)
);
create index stages_meeting_idx on public.stages (meeting_id, order_index);

alter table public.meetings
  add constraint meetings_active_stage_fk
  foreign key (active_stage_id) references public.stages (id) on delete set null;

-- Per-person action ledger for anonymous features. Deliberately shares NO key
-- with content tables: content rows carry no author, this table carries no content.
create table public.participation (
  stage_id uuid not null references public.stages (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  action_key text not null,
  count int not null default 0,
  primary key (stage_id, member_id, action_key)
);

-- ---------- ledger primitive ----------

-- Called from SECURITY DEFINER feature RPCs (phase 2+) inside the same
-- transaction as their content insert: raises if the caller would exceed
-- p_max for this action, otherwise bumps their counter. Atomic under
-- concurrency thanks to the upsert + row lock.
create or replace function public.bump_participation(
  p_stage_id uuid,
  p_action_key text,
  p_max int,
  p_add int default 1
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member uuid := auth_member_id();
  v_new int;
begin
  if v_member is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_add < 1 then
    raise exception 'invalid increment';
  end if;

  insert into participation (stage_id, member_id, action_key, count)
  values (p_stage_id, v_member, p_action_key, p_add)
  on conflict (stage_id, member_id, action_key)
  do update set count = participation.count + excluded.count
  returning count into v_new;

  if v_new > p_max then
    raise exception 'limit reached' using errcode = 'P0001';
  end if;
end;
$$;

-- Not callable directly by clients — only via feature RPCs.
revoke execute on function public.bump_participation(uuid, text, int, int) from public, anon, authenticated;

-- Guard: only stages that are open accept submissions. Feature RPCs call this.
create or replace function public.assert_stage_open(p_stage_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from stages where id = p_stage_id and state = 'open') then
    raise exception 'stage not open' using errcode = 'P0002';
  end if;
end;
$$;
revoke execute on function public.assert_stage_open(uuid) from public, anon, authenticated;

-- ---------- RLS ----------

alter table public.members enable row level security;
alter table public.login_attempts enable row level security;
alter table public.meetings enable row level security;
alter table public.stages enable row level security;
alter table public.participation enable row level security;

-- members: everyone logged in can see the roster, but never code_hash
-- (column-level privilege), and login_attempts is service-role-only (no policy).
revoke all on public.members from anon, authenticated;
grant select (id, display_name, is_host, created_at, code_set) on public.members to authenticated;
grant insert (display_name), update (display_name) on public.members to authenticated;

create policy members_select on public.members
  for select to authenticated using (true);
create policy members_insert_host on public.members
  for insert to authenticated with check (auth_is_host());
create policy members_update_host on public.members
  for update to authenticated using (auth_is_host()) with check (auth_is_host());
-- no delete policy: removing people (and their history) stays a service-role task

-- meetings / stages: readable by all members, writable by the host
revoke all on public.meetings from anon, authenticated;
grant select on public.meetings to authenticated;
grant insert (title, status, active_stage_id), update (title, status, active_stage_id) on public.meetings to authenticated;

create policy meetings_select on public.meetings
  for select to authenticated using (true);
create policy meetings_write_host on public.meetings
  for insert to authenticated with check (auth_is_host());
create policy meetings_update_host on public.meetings
  for update to authenticated using (auth_is_host()) with check (auth_is_host());

revoke all on public.stages from anon, authenticated;
grant select on public.stages to authenticated;
grant insert (meeting_id, kind, title, order_index, config, state),
      update (title, order_index, config, state, opened_at, timer_ends_at, timer_remaining_s),
      delete
  on public.stages to authenticated;

create policy stages_select on public.stages
  for select to authenticated using (true);
create policy stages_insert_host on public.stages
  for insert to authenticated with check (auth_is_host());
create policy stages_update_host on public.stages
  for update to authenticated using (auth_is_host()) with check (auth_is_host());
create policy stages_delete_host on public.stages
  for delete to authenticated using (auth_is_host());

-- participation: you may see only your own ledger rows ("2 hakkın kaldı");
-- all writes happen inside security-definer RPCs.
revoke all on public.participation from anon, authenticated;
grant select on public.participation to authenticated;

create policy participation_select_own on public.participation
  for select to authenticated using (member_id = auth_member_id());

-- ---------- realtime ----------

-- Meetings + stages stream to every client; feature tables opt in per phase.
alter publication supabase_realtime add table public.meetings;
alter publication supabase_realtime add table public.stages;
