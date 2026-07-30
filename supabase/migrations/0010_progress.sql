-- Retrobüs 0010 — submission progress counts.
--
-- The host needs to know when to move on ("7/9 yazdı"), but `participation` is
-- readable only for your own rows — deliberately, since it is the per-person
-- ledger. A COUNT reveals no identities, so exposing just the number is safe and
-- is what every retro tool shows.
--
-- Guard: returns a count only, never member ids, and requires membership.

create or replace function public.stage_progress(p_stage_id uuid, p_action_key text)
returns int
language sql stable security definer
set search_path = public
as $$
  select case
    when auth_member_id() is null then 0
    else (
      select count(distinct p.member_id)::int
      from participation p
      where p.stage_id = p_stage_id
        and p.action_key = p_action_key
        and p.count > 0
    )
  end
$$;
revoke all on function public.stage_progress(uuid, text) from public, anon;
grant execute on function public.stage_progress(uuid, text) to authenticated;

-- How many people have logged in at all — the denominator for "7/9".
-- Again a count only.
create or replace function public.active_member_count()
returns int
language sql stable security definer
set search_path = public
as $$
  select case
    when auth_member_id() is null then 0
    else (select count(distinct l.member_id)::int from member_links l)
  end
$$;
revoke all on function public.active_member_count() from public, anon;
grant execute on function public.active_member_count() to authenticated;
