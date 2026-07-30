-- Retrobüs 0001 — spine: members, identity, meetings, stages, participation ledger.
--
-- IDENTITY MODEL
--   Supabase signs JWTs with an asymmetric (ES256) key we cannot sign with, so
--   we do NOT mint our own tokens. Instead:
--     1. the browser gets a real Supabase token via anonymous sign-in
--     2. it calls claim_member(name, code), which verifies the 6-digit code and
--        links that anonymous auth user to a Retrobüs member
--     3. RLS resolves identity through member_links
--
--   CONSEQUENCE (important): anonymous sign-in means ANY visitor can hold the
--   `authenticated` role. "Authenticated" therefore does NOT mean "member", and
--   every policy below requires a real member link — never `using (true)`.

-- ---------- tables ----------

create table public.members (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (length(trim(display_name)) between 1 and 40),
  -- bcrypt (pgcrypto); null until the host assigns a code
  code_hash text,
  code_set boolean generated always as (code_hash is not null) stored,
  is_host boolean not null default false,
  created_at timestamptz not null default now()
);
-- login matches on name case-insensitively, so names must be unique that way
create unique index members_display_name_key on public.members (lower(display_name));

-- Maps a Supabase (anonymous) auth user onto a member. One device/browser
-- session = one row. Re-logging in as someone else overwrites the link.
create table public.member_links (
  auth_uid uuid primary key references auth.users (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  linked_at timestamptz not null default now()
);
create index member_links_member_idx on public.member_links (member_id);

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

-- ---------- identity helpers ----------
-- SECURITY DEFINER so policies can call them without recursing into
-- member_links' own RLS.

create or replace function public.auth_member_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select member_id from member_links where auth_uid = auth.uid()
$$;

create or replace function public.auth_is_host()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select m.is_host
       from member_links l join members m on m.id = l.member_id
      where l.auth_uid = auth.uid()),
    false)
$$;

grant execute on function public.auth_member_id() to anon, authenticated;
grant execute on function public.auth_is_host() to anon, authenticated;

-- ---------- login ----------

-- Verifies name + 6-digit code and links the caller's anonymous auth user.
--
-- Returns a status OBJECT rather than raising on bad credentials: raising would
-- roll back the transaction and discard the failed-attempt counter we just
-- wrote, silently defeating the rate limit.
--
-- Returns jsonb, not `table (...)`, deliberately: OUT parameters named after
-- table columns (display_name, member_id, is_host) become PL/pgSQL variables
-- that shadow those columns and make every query ambiguous (42702).
create or replace function public.claim_member(p_name text, p_code text)
returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_member members;
  v_att login_attempts;
  v_window constant interval := interval '15 minutes';
  v_max constant int := 5;
  v_fresh boolean;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'no_session');
  end if;
  if p_name is null or btrim(p_name) = '' or p_code !~ '^\d{6}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  select m.* into v_member from members m where lower(m.display_name) = lower(btrim(p_name));
  if not found then
    -- same answer as a wrong code, so the roster can't be probed by name
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  if v_member.code_hash is null then
    return jsonb_build_object('ok', false, 'reason', 'no_code');
  end if;

  select la.* into v_att from login_attempts la where la.member_id = v_member.id;
  if found and v_att.fail_count >= v_max and now() - v_att.window_start < v_window then
    return jsonb_build_object(
      'ok', false,
      'reason', 'locked',
      'retry_after_s', ceil(extract(epoch from (v_window - (now() - v_att.window_start))))::int
    );
  end if;

  if crypt(p_code, v_member.code_hash) <> v_member.code_hash then
    -- start a new window if the old one has aged out, else increment in place
    v_fresh := (v_att.member_id is null) or (now() - v_att.window_start >= v_window);
    insert into login_attempts as la (member_id, window_start, fail_count)
    values (v_member.id, now(), 1)
    on conflict (member_id) do update
      set window_start = case when v_fresh then now() else la.window_start end,
          fail_count   = case when v_fresh then 1 else la.fail_count + 1 end;
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  delete from login_attempts la where la.member_id = v_member.id;

  insert into member_links (auth_uid, member_id)
  values (auth.uid(), v_member.id)
  on conflict (auth_uid) do update
    set member_id = excluded.member_id, linked_at = now();

  return jsonb_build_object(
    'ok', true,
    'member_id', v_member.id,
    'display_name', v_member.display_name,
    'is_host', v_member.is_host
  );
end;
$$;
grant execute on function public.claim_member(text, text) to anon, authenticated;

-- Who am I? Used on page load to restore the session.
create or replace function public.current_member()
returns table (id uuid, display_name text, is_host boolean)
language sql stable security definer
set search_path = public
as $$
  select m.id, m.display_name, m.is_host
  from member_links l join members m on m.id = l.member_id
  where l.auth_uid = auth.uid()
$$;
grant execute on function public.current_member() to authenticated;

-- Host assigns/rotates a member's 6-digit code. The only write path to code_hash.
create or replace function public.set_member_code(p_member_id uuid, p_code text)
returns void
language plpgsql security definer
set search_path = public, extensions
as $$
begin
  if not auth_is_host() then
    raise exception 'host only' using errcode = '42501';
  end if;
  if p_code !~ '^\d{6}$' then
    raise exception 'code must be exactly 6 digits' using errcode = '22023';
  end if;
  update members set code_hash = crypt(p_code, gen_salt('bf', 10)) where id = p_member_id;
  if not found then
    raise exception 'unknown member' using errcode = 'P0002';
  end if;
  -- a fresh code also clears any lockout
  delete from login_attempts where login_attempts.member_id = p_member_id;
end;
$$;
grant execute on function public.set_member_code(uuid, text) to authenticated;

-- ---------- ledger primitive ----------

-- Called from SECURITY DEFINER feature RPCs inside the same transaction as their
-- content insert: raises if the caller would exceed p_max, else bumps the count.
create or replace function public.bump_participation(
  p_stage_id uuid,
  p_action_key text,
  p_max int,
  p_add int default 1
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_member uuid := auth_member_id();
  v_new int;
begin
  if v_member is null then
    raise exception 'not a member' using errcode = '28000';
  end if;
  if p_add < 1 then
    raise exception 'invalid increment';
  end if;

  insert into participation as p (stage_id, member_id, action_key, count)
  values (p_stage_id, v_member, p_action_key, p_add)
  on conflict (stage_id, member_id, action_key)
  do update set count = p.count + excluded.count
  returning p.count into v_new;

  if v_new > p_max then
    raise exception 'limit reached' using errcode = 'P0001';
  end if;
end;
$$;
revoke execute on function public.bump_participation(uuid, text, int, int) from public, anon, authenticated;

-- Guard: only open stages accept submissions.
create or replace function public.assert_stage_open(p_stage_id uuid)
returns void
language plpgsql stable security definer
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
-- Every policy demands a real member link. `authenticated` alone is not enough,
-- because anonymous sign-in hands that role to any visitor.

alter table public.members enable row level security;
alter table public.member_links enable row level security;
alter table public.login_attempts enable row level security;
alter table public.meetings enable row level security;
alter table public.stages enable row level security;
alter table public.participation enable row level security;

-- members: roster visible to members; code_hash never selectable (no column grant).
revoke all on public.members from anon, authenticated;
grant select (id, display_name, is_host, created_at, code_set) on public.members to authenticated;
grant insert (display_name), update (display_name) on public.members to authenticated;

create policy members_select on public.members
  for select to authenticated using (auth_member_id() is not null);
create policy members_insert_host on public.members
  for insert to authenticated with check (auth_is_host());
create policy members_update_host on public.members
  for update to authenticated using (auth_is_host()) with check (auth_is_host());

-- member_links: you may read your own link; writes only via claim_member.
revoke all on public.member_links from anon, authenticated;
grant select on public.member_links to authenticated;

create policy member_links_select_own on public.member_links
  for select to authenticated using (auth_uid = auth.uid());

-- login_attempts: service-role only. No grants, no policies.
revoke all on public.login_attempts from anon, authenticated;

-- meetings / stages: readable by members, writable by the host.
revoke all on public.meetings from anon, authenticated;
grant select on public.meetings to authenticated;
grant insert (title, status, active_stage_id), update (title, status, active_stage_id), delete
  on public.meetings to authenticated;

create policy meetings_select on public.meetings
  for select to authenticated using (auth_member_id() is not null);
create policy meetings_insert_host on public.meetings
  for insert to authenticated with check (auth_is_host());
create policy meetings_update_host on public.meetings
  for update to authenticated using (auth_is_host()) with check (auth_is_host());
-- without this the host can never discard a test meeting; deletes just affect
-- zero rows silently, which is how this omission was found
create policy meetings_delete_host on public.meetings
  for delete to authenticated using (auth_is_host());

revoke all on public.stages from anon, authenticated;
grant select on public.stages to authenticated;
grant insert (meeting_id, kind, title, order_index, config, state),
      update (title, order_index, config, state, opened_at, timer_ends_at, timer_remaining_s),
      delete
  on public.stages to authenticated;

create policy stages_select on public.stages
  for select to authenticated using (auth_member_id() is not null);
create policy stages_insert_host on public.stages
  for insert to authenticated with check (auth_is_host());
create policy stages_update_host on public.stages
  for update to authenticated using (auth_is_host()) with check (auth_is_host());
create policy stages_delete_host on public.stages
  for delete to authenticated using (auth_is_host());

-- participation: you see only your own ledger ("2 hakkın kaldı").
revoke all on public.participation from anon, authenticated;
grant select on public.participation to authenticated;

create policy participation_select_own on public.participation
  for select to authenticated using (member_id = auth_member_id());

-- ---------- realtime ----------

alter publication supabase_realtime add table public.meetings;
alter publication supabase_realtime add table public.stages;
