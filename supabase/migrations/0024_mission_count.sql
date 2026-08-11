-- The host has to be able to see that the missions were dealt.
--
-- `missions_select` gives you your own mission, or any mission once revealed —
-- and the host is deliberately NOT exempt, because a host who knows the
-- assignments steers the evening without meaning to. That part is right.
--
-- What it also means is that `missions.length` in the browser is at most one:
-- the reader's own row. Two screens read it as if it were the room's:
--
--   MissionStage.tsx  `Görevleri dağıt (${missions.length} atanmış)`
--   MissionStage.tsx  'Görevler henüz dağıtılmadı.'
--
-- So the console reports "0 atanmış" after a clean deal to nine people, and the
-- shared screen tells the whole room the missions were never handed out while
-- everyone is holding one. The second is merely wrong. The first is dangerous:
-- the button beside it re-rolls, `assign_missions` deletes every unrevealed
-- mission before dealing, and a host looking at "0 atanmış" at the finale has
-- every reason to press it — losing three hours of secret missions and the
-- marks they made along the way.
--
-- A count is the smallest thing that fixes it and says nothing the room cannot
-- already work out: one mission per person who logged in. No bodies, no member
-- ids, no pairing — the assignment stays as sealed from the host as it was.

create or replace function public.mission_count(p_meeting_id uuid)
returns int
language sql stable security definer
set search_path = public
as $$
  select case
    when auth_member_id() is null then 0
    else (
      select count(*)::int from missions
      where meeting_id = p_meeting_id and not revealed
    )
  end
$$;
revoke all on function public.mission_count(uuid) from public, anon;
grant execute on function public.mission_count(uuid) to authenticated;
