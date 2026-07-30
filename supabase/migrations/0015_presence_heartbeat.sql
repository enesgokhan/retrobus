-- Retrobüs 0015 — presence that does not need a WebSocket.
--
-- THE BUG: presence was built purely from Realtime presence state, so on a
-- network where the WebSocket cannot be established (a corporate proxy refusing
-- the upgrade — which is the author's own network) the set came back empty and
-- the console rendered "0/1 odada" while the host was plainly looking at the
-- page. Nothing added the viewer to their own presence set.
--
-- Fix in two parts. The client now always counts itself (see usePresence), and
-- "who else is here" is backed by a heartbeat written over plain HTTP so it works
-- with realtime completely unavailable.

alter table public.member_links add column if not exists last_seen timestamptz not null default now();
create index if not exists member_links_last_seen_idx on public.member_links (last_seen desc);

-- Called every ~20s by each client. Cheap: one indexed update of your own row.
create or replace function public.touch_presence()
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  update member_links set last_seen = now() where auth_uid = auth.uid();
end;
$$;
revoke all on function public.touch_presence() from public, anon;
grant execute on function public.touch_presence() to authenticated;

-- Who has been seen recently. Returns member ids only — no timestamps, so this
-- cannot be used to reconstruct who was active when.
create or replace function public.present_members(p_within_seconds int default 60)
returns table (member_id uuid)
language sql stable security definer
set search_path = public
as $$
  select distinct l.member_id
  from member_links l
  where auth_member_id() is not null
    and l.last_seen > now() - make_interval(secs => greatest(p_within_seconds, 5))
$$;
revoke all on function public.present_members(int) from public, anon;
grant execute on function public.present_members(int) to authenticated;
