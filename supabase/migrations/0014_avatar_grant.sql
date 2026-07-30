-- Retrobüs 0014 — the avatar grant, and the host-authored welcome message.
--
-- THE BUG: 0003 added `members.avatar` and granted `update (avatar)` so people
-- could set their own, but never granted `select (avatar)`. Nine client queries
-- select it directly from `members`, so each returned 42501 and handed the
-- caller an EMPTY member list. Consequences, all silent:
--
--   * Codenames lobby showed no players — teams could not be seated
--   * Wavelength could not assign teams at all
--   * Fibbage / Quiz / TwoTruths / Mission / Rank rendered every name as "—"
--   * Yearbook had no names
--   * PresenceBar rendered nothing (it returns null on an empty roster)
--
-- This is what "the games aren't properly being set up" was. Nothing about an
-- avatar is secret — it exists to be looked at — so the fix is simply the
-- missing grant. `code_hash` remains the only column without SELECT.
--
-- Pinned by test/grants-test.mjs, which reads the client's own select() calls
-- out of src/ and checks each column against has_column_privilege. It failed on
-- exactly these nine sites before this migration.

grant select (avatar) on public.members to authenticated;

-- ---------- host-authored welcome message ----------
-- Shown once to each person after they join. The words are Enes's; the app only
-- carries them.
alter table public.meetings add column if not exists welcome_note text
  check (welcome_note is null or length(welcome_note) <= 1000);

grant update (title, status, active_stage_id, frozen, frozen_note, welcome_note)
  on public.meetings to authenticated;
grant insert (title, status, active_stage_id, welcome_note)
  on public.meetings to authenticated;

-- ---------- introspection helper for the grants guard ----------
-- Host-only, read-only. Lets the test ask the database what `authenticated` may
-- actually read, rather than trusting the migrations to have said so.
create or replace function public.selectable_columns()
returns table (table_name text, column_name text)
language sql stable security definer
set search_path = public, pg_catalog, information_schema
as $$
  select c.table_name::text, c.column_name::text
  from information_schema.columns c
  where c.table_schema = 'public'
    and auth_is_host()
    and has_column_privilege(
      'authenticated', ('public.' || c.table_name)::regclass, c.column_name, 'SELECT'
    )
$$;
revoke all on function public.selectable_columns() from public, anon;
grant execute on function public.selectable_columns() to authenticated;
