-- Retrobüs 0020 — joining by room code, the way Kahoot does it.
--
-- Until now every passenger had to be created by the host in advance and given
-- a personal six-digit code. That works for one evening with nine friends whose
-- names you know; it does not work for anyone else, and it is the single
-- biggest obstacle to this being usable by someone who is not the author.
--
-- So: a meeting carries a short room code. The host shows it (and a QR of it)
-- on the shared screen, a person opens the link, types their own name, and they
-- are in. Pre-assigned codes still work exactly as before — the two paths
-- coexist, because a named invite is genuinely nicer for people you know.
--
-- WHAT JOINING DOES AND DOES NOT GRANT
--   * It creates an ordinary member. Never a host — is_host is not settable
--     through this path at all, so possession of the room code can never
--     escalate to control of the meeting.
--   * It never touches an existing member. A second person typing "Ali" gets
--     their own row; they cannot adopt Ali's identity, and the host can see and
--     remove duplicates. The trade-off is that clearing your browser makes you
--     a new passenger, which is also how Kahoot behaves.
--   * The same anonymous session always resolves to the same member, so a
--     refresh or a reconnect rejoins rather than duplicating.
--
-- The code is six characters from a 32-letter alphabet with the ambiguous ones
-- removed (no O/0, no I/1), which is ~10^9 combinations — not a secret, but far
-- past guessing for something that is only live for one evening.

alter table public.meetings
  add column if not exists join_code text,
  add column if not exists join_open boolean not null default true;

create unique index if not exists meetings_join_code_key
  on public.meetings (join_code) where join_code is not null;

/** A room code that cannot be misread aloud or mistyped from a screen. */
create or replace function public.gen_join_code()
returns text
language plpgsql volatile
set search_path = public
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_tries int := 0;
begin
  loop
    v_code := '';
    for _ in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from meetings where join_code = v_code);
    v_tries := v_tries + 1;
    if v_tries > 50 then raise exception 'could not allocate a join code'; end if;
  end loop;
  return v_code;
end;
$$;
revoke all on function public.gen_join_code() from public, anon, authenticated;

-- Every meeting gets one, including the ones that already exist.
create or replace function public.meetings_set_join_code()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.join_code is null then new.join_code := gen_join_code(); end if;
  return new;
end;
$$;

drop trigger if exists meetings_join_code on public.meetings;
create trigger meetings_join_code
  before insert on public.meetings
  for each row execute function public.meetings_set_join_code();

update public.meetings set join_code = gen_join_code() where join_code is null;

-- The host may open and close the door; the column grant is theirs alone
-- because meetings_update_host already gates every write to this table.
grant select (id, title, status, active_stage_id, frozen, frozen_note, welcome_note,
              created_at, join_code, join_open)
  on public.meetings to authenticated;
grant update (join_open) on public.meetings to authenticated;

-- ---------------------------------------------------------------- joining
/**
 * Join the live meeting with `p_code`, as `p_name`.
 *
 * SECURITY DEFINER because members_insert_host quite rightly refuses ordinary
 * members the right to create members — this is the one narrow, audited hole in
 * that rule, and everything it does is fixed here rather than taken from the
 * caller. In particular is_host is never set.
 */
create or replace function public.join_meeting(p_code text, p_name text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_meeting meetings;
  v_name text := btrim(coalesce(p_name, ''));
  v_existing uuid;
  v_count int;
  v_member_id uuid;
begin
  -- an anonymous session is still a session; without one there is nobody to link
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'no_session');
  end if;

  select * into v_meeting from meetings
   where join_code = upper(btrim(coalesce(p_code, '')))
     and status = 'live';
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_code');
  end if;
  if not v_meeting.join_open then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;

  -- this session already belongs to someone: rejoin, never duplicate
  select member_id into v_existing from member_links where auth_uid = v_uid limit 1;
  if v_existing is not null then
    update member_links set last_seen = now() where auth_uid = v_uid;
    return jsonb_build_object('ok', true, 'member_id', v_existing, 'rejoined', true);
  end if;

  if length(v_name) < 1 or length(v_name) > 40 then
    return jsonb_build_object('ok', false, 'reason', 'bad_name');
  end if;

  -- a room that fills up beyond any plausible evening is a sign of abuse, not
  -- of popularity; refuse rather than let one link create unbounded rows
  select count(*) into v_count from members;
  if v_count >= 200 then
    return jsonb_build_object('ok', false, 'reason', 'full');
  end if;

  -- Names are unique (case-insensitively) because they are how the room tells
  -- each other apart. Say so plainly and let them pick another: silently
  -- renaming somebody to "Ali 2" is worse than asking.
  if exists (select 1 from members m where lower(m.display_name) = lower(v_name)) then
    return jsonb_build_object('ok', false, 'reason', 'name_taken');
  end if;

  begin
    insert into members (display_name, is_host) values (v_name, false)
    returning id into v_member_id;
  exception when unique_violation then
    -- two people typing the same name in the same instant
    return jsonb_build_object('ok', false, 'reason', 'name_taken');
  end;
  insert into member_links (member_id, auth_uid) values (v_member_id, v_uid);

  return jsonb_build_object('ok', true, 'member_id', v_member_id, 'rejoined', false);
end;
$$;
revoke all on function public.join_meeting(text, text) from public, anon;
grant execute on function public.join_meeting(text, text) to authenticated;

-- ------------------------------------------------------------ public peek
/**
 * What a not-yet-member may know before they type their name: only that the
 * code is live and what the evening is called. Nothing about who is in the room.
 */
create or replace function public.peek_meeting(p_code text)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare v_meeting meetings;
begin
  select * into v_meeting from meetings
   where join_code = upper(btrim(coalesce(p_code, ''))) and status = 'live';
  if not found then return jsonb_build_object('ok', false); end if;
  return jsonb_build_object('ok', true, 'title', v_meeting.title, 'open', v_meeting.join_open);
end;
$$;
revoke all on function public.peek_meeting(text) from public, anon;
grant execute on function public.peek_meeting(text) to authenticated;
