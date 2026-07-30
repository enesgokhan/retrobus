-- Retrobüs 0008 — function-privilege hardening.
--
-- Found by auditing the live database rather than by reading the code:
--
-- 1. Postgres grants EXECUTE on new functions to PUBLIC by default, so every
--    RPC was callable by the logged-out `anon` role. Most were harmless because
--    they check auth_member_id()/auth_is_host() and bail — but two were not.
--
-- 2. leaderboard() and awards() are SECURITY DEFINER (they must be, to
--    aggregate across rows) and had NO membership check, so they bypassed RLS
--    entirely. With the publishable key sitting in the public client bundle,
--    any stranger could enumerate member names and scores. Fixed by gating both
--    on membership.
--
-- Rule going forward: SECURITY DEFINER means RLS is off, so the function must
-- re-establish the check itself. Every new one needs an explicit guard.

-- ---------- gate the two aggregate readers ----------

create or replace function public.leaderboard(p_meeting_id uuid)
returns table (member_id uuid, display_name text, avatar text, points bigint)
language sql stable security definer
set search_path = public
as $$
  select m.id, m.display_name, m.avatar, coalesce(sum(s.points), 0)::bigint as points
  from members m
  left join scores s on s.member_id = m.id and s.meeting_id = p_meeting_id
  -- SECURITY DEFINER bypasses RLS, so membership is checked explicitly here
  where auth_member_id() is not null
    and (
      exists (select 1 from member_links l where l.member_id = m.id)
      or exists (
        select 1 from scores s2
        where s2.member_id = m.id and s2.meeting_id = p_meeting_id
      )
    )
  group by m.id, m.display_name, m.avatar
  order by points desc, m.display_name
$$;

create or replace function public.awards(p_meeting_id uuid)
returns table (key text, label text, member_id uuid, display_name text, avatar text, detail text)
language sql stable security definer
set search_path = public
as $$
  -- Each branch is parenthesised: ORDER BY / LIMIT bind to the whole UNION
  -- otherwise. Each also re-checks membership, since SECURITY DEFINER means RLS
  -- is not doing it for us.
  (select 'champion', 'Retro Şampiyonu', s.member_id, m.display_name, m.avatar,
          sum(s.points)::text || ' puan'
   from scores s join members m on m.id = s.member_id
   where s.meeting_id = p_meeting_id and auth_member_id() is not null
   group by s.member_id, m.display_name, m.avatar
   having sum(s.points) > 0
   order by sum(s.points) desc
   limit 1)

  union all
  (select 'quiz', 'Quiz Ustası', s.member_id, m.display_name, m.avatar,
          sum(s.points)::text || ' puan'
   from scores s join members m on m.id = s.member_id
   where s.meeting_id = p_meeting_id and auth_member_id() is not null
     and s.reason like 'quiz%'
   group by s.member_id, m.display_name, m.avatar
   order by sum(s.points) desc
   limit 1)

  union all
  (select 'detective', 'En İyi Dedektif', s.member_id, m.display_name, m.avatar,
          count(*)::text || ' doğru tahmin'
   from scores s join members m on m.id = s.member_id
   where s.meeting_id = p_meeting_id and auth_member_id() is not null
     and s.reason in ('two_truths_correct', 'fib_found_truth')
   group by s.member_id, m.display_name, m.avatar
   order by count(*) desc
   limit 1)

  union all
  (select 'liar', 'En İyi Yalancı', s.member_id, m.display_name, m.avatar,
          sum(s.points)::text || ' puan kandırma'
   from scores s join members m on m.id = s.member_id
   where s.meeting_id = p_meeting_id and auth_member_id() is not null
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
   where st.meeting_id = p_meeting_id and auth_member_id() is not null
     and f.kind in ('strength', 'kudos')
     and not f.hidden
   group by f.target_member_id, m.display_name, m.avatar
   order by count(*) desc
   limit 1)
$$;

-- ---------- strip the default PUBLIC grant ----------

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
  end loop;
end;
$$;

-- ---------- re-grant only what clients legitimately call ----------

-- identity helpers (used inside policies; also harmless to callers)
grant execute on function public.auth_member_id() to authenticated;
grant execute on function public.auth_is_host() to authenticated;

-- login: a freshly signed-in anonymous user already holds the `authenticated`
-- role, so this does not need the `anon` grant back.
grant execute on function public.claim_member(text, text) to authenticated;
grant execute on function public.current_member() to authenticated;
grant execute on function public.change_my_code(text, text) to authenticated;
grant execute on function public.set_member_code(uuid, text) to authenticated;

-- discussion hour
grant execute on function public.submit_card(uuid, text, text, int) to authenticated;
grant execute on function public.cast_dot(uuid) to authenticated;
grant execute on function public.submit_poll_response(uuid, int) to authenticated;

-- icebreakers / temperature / feedback
grant execute on function public.submit_two_truths(uuid, text, text, text, int) to authenticated;
grant execute on function public.guess_two_truths(uuid, int) to authenticated;
grant execute on function public.reveal_two_truths(uuid) to authenticated;
grant execute on function public.submit_health(uuid, text, int) to authenticated;
grant execute on function public.submit_feedback(uuid, uuid, text, text) to authenticated;

-- quiz / fibbage / rank / standings
grant execute on function public.answer_quiz(uuid, int, numeric) to authenticated;
grant execute on function public.open_quiz(uuid) to authenticated;
grant execute on function public.reveal_quiz(uuid) to authenticated;
grant execute on function public.submit_fib_lie(uuid, text) to authenticated;
grant execute on function public.pick_fib(uuid, uuid, boolean) to authenticated;
grant execute on function public.reveal_fib(uuid) to authenticated;
grant execute on function public.fib_authorship(uuid) to authenticated;
grant execute on function public.submit_ranking(uuid, jsonb) to authenticated;
grant execute on function public.leaderboard(uuid) to authenticated;
grant execute on function public.awards(uuid) to authenticated;

-- big games
grant execute on function public.start_wave_round(uuid, text, text, uuid) to authenticated;
grant execute on function public.give_wave_clue(uuid, text) to authenticated;
grant execute on function public.guess_wave(uuid, int) to authenticated;
grant execute on function public.reveal_wave(uuid) to authenticated;
grant execute on function public.cn_join(uuid, text, boolean) to authenticated;
grant execute on function public.cn_deal(uuid, text[]) to authenticated;
grant execute on function public.cn_clue(uuid, text, int) to authenticated;
grant execute on function public.cn_guess(uuid) to authenticated;
grant execute on function public.cn_pass(uuid) to authenticated;
grant execute on function public.cn_award(uuid) to authenticated;

-- missions
grant execute on function public.assign_missions(uuid, text[]) to authenticated;
grant execute on function public.reveal_missions(uuid) to authenticated;

-- bump_participation and assert_stage_open stay unreachable from any client:
-- they are internals of the RPCs above and are deliberately NOT re-granted.
