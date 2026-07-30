-- Retrobüs 0007 — Secret Mission, host freeze control, awards.

-- ---------- host freeze / panic control ----------
-- Three hours, ten people, one host: at some point a stage will go badly and
-- every screen needs to go blank immediately. Stored on the meeting so every
-- client picks it up over the same realtime channel it already listens to.
alter table public.meetings add column frozen boolean not null default false;
alter table public.meetings add column frozen_note text
  check (frozen_note is null or length(frozen_note) <= 200);

-- widen the host's update grant to cover the new columns
grant update (title, status, active_stage_id, frozen, frozen_note)
  on public.meetings to authenticated;

-- ---------- Secret Mission ----------
-- Hidden objectives that run in the background for the whole meeting and are
-- revealed at the end. Nearly free to build, and it quietly changes how the
-- entire three hours feels.

create table public.missions (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 300),
  -- set by the host at the finale
  completed boolean,
  revealed boolean not null default false,
  unique (meeting_id, member_id)
);
create index missions_meeting_idx on public.missions (meeting_id);

-- Hand out one mission per member from a supplied pool, shuffled.
create or replace function public.assign_missions(p_meeting_id uuid, p_pool text[])
returns int
language plpgsql security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if not auth_is_host() then raise exception 'host only' using errcode = '42501'; end if;
  if array_length(p_pool, 1) is null then
    raise exception 'pool is empty' using errcode = 'P0003';
  end if;

  delete from missions where meeting_id = p_meeting_id and not revealed;

  with linked as (
    -- only members who have actually logged in get a mission.
    -- DISTINCT must happen BEFORE row_number(): a member with several login
    -- sessions has several member_links rows, and `select distinct id,
    -- row_number() ...` would keep them all because the rn differs.
    select distinct m.id from members m join member_links l on l.member_id = m.id
  ),
  people as (
    select linked.id, row_number() over (order by random()) as rn from linked
  ),
  pool as (
    select p.body, row_number() over (order by random()) as rn
    from unnest(p_pool) as p(body)
  )
  insert into missions (meeting_id, member_id, body)
  select p_meeting_id, people.id,
         -- wrap around if there are more people than mission ideas
         (select body from pool where pool.rn = ((people.rn - 1) % (select count(*) from pool)) + 1)
  from people
  on conflict (meeting_id, member_id) do nothing;

  select count(*) into v_count from missions where meeting_id = p_meeting_id;
  return v_count;
end;
$$;
grant execute on function public.assign_missions(uuid, text[]) to authenticated;

-- Reveal every mission at the finale and award the ones the host marks done.
create or replace function public.reveal_missions(p_meeting_id uuid)
returns int
language plpgsql security definer
set search_path = public
as $$
declare
  v_n int;
begin
  if not auth_is_host() then raise exception 'host only' using errcode = '42501'; end if;
  update missions set revealed = true where meeting_id = p_meeting_id and not revealed;

  -- points only for missions explicitly marked completed
  insert into scores (meeting_id, stage_id, member_id, points, reason)
  select p_meeting_id, null, ms.member_id, 800, 'mission_done'
  from missions ms
  where ms.meeting_id = p_meeting_id
    and ms.completed is true
    and not exists (
      select 1 from scores s
      where s.meeting_id = p_meeting_id
        and s.member_id = ms.member_id
        and s.reason = 'mission_done'
    );

  select count(*) into v_n from missions where meeting_id = p_meeting_id;
  return v_n;
end;
$$;
grant execute on function public.reveal_missions(uuid) to authenticated;

alter table public.missions enable row level security;
revoke all on public.missions from anon, authenticated;
grant select on public.missions to authenticated;
grant update (completed) on public.missions to authenticated;

-- You always see your own mission. Everyone else's only at the reveal.
-- The host is NOT exempt: they wrote the pool, and if they could see the
-- assignment they would inevitably nudge people toward their missions.
create policy missions_select on public.missions
  for select to authenticated using (
    member_id = auth_member_id()
    or revealed
  );
create policy missions_update_host on public.missions
  for update to authenticated using (auth_is_host()) with check (auth_is_host());

-- ---------- awards ----------
-- Derived from data already collected, so this is a query rather than a feature.

create or replace function public.awards(p_meeting_id uuid)
returns table (key text, label text, member_id uuid, display_name text, avatar text, detail text)
language sql stable security definer
set search_path = public
as $$
  -- Each branch is parenthesised: ORDER BY / LIMIT bind to the whole UNION
  -- otherwise, which is a syntax error here and silently wrong elsewhere.
  (select 'champion', 'Retro Şampiyonu', s.member_id, m.display_name, m.avatar,
          sum(s.points)::text || ' puan'
   from scores s join members m on m.id = s.member_id
   where s.meeting_id = p_meeting_id
   group by s.member_id, m.display_name, m.avatar
   having sum(s.points) > 0
   order by sum(s.points) desc
   limit 1)

  union all
  (select 'quiz', 'Quiz Ustası', s.member_id, m.display_name, m.avatar,
          sum(s.points)::text || ' puan'
   from scores s join members m on m.id = s.member_id
   where s.meeting_id = p_meeting_id and s.reason like 'quiz%'
   group by s.member_id, m.display_name, m.avatar
   order by sum(s.points) desc
   limit 1)

  union all
  (select 'detective', 'En İyi Dedektif', s.member_id, m.display_name, m.avatar,
          count(*)::text || ' doğru tahmin'
   from scores s join members m on m.id = s.member_id
   where s.meeting_id = p_meeting_id
     and s.reason in ('two_truths_correct', 'fib_found_truth')
   group by s.member_id, m.display_name, m.avatar
   order by count(*) desc
   limit 1)

  union all
  (select 'liar', 'En İyi Yalancı', s.member_id, m.display_name, m.avatar,
          sum(s.points)::text || ' puan kandırma'
   from scores s join members m on m.id = s.member_id
   where s.meeting_id = p_meeting_id
     and s.reason in ('two_truths_fooled', 'fib_fooled')
   group by s.member_id, m.display_name, m.avatar
   order by sum(s.points) desc
   limit 1)

  union all
  (select 'appreciated', 'En Çok Takdir Edilen', f.target_member_id, m.display_name, m.avatar,
          count(*)::text || ' mesaj'
   from feedback_items f
   join stages st on st.id = f.stage_id
   join members m on m.id = f.target_member_id
   where st.meeting_id = p_meeting_id
     and f.kind in ('strength', 'kudos')
     and not f.hidden
   group by f.target_member_id, m.display_name, m.avatar
   order by count(*) desc
   limit 1)
$$;
grant execute on function public.awards(uuid) to authenticated;

-- ---------- realtime ----------
alter publication supabase_realtime add table public.missions;
