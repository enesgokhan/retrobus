-- Retrobüs 0016 — make Fibbage playable, and let the host remove a passenger.
--
-- BUG 1 (critical): Fibbage could not be played by anyone except the host.
--
-- The round row holds the prompt AND the truth, so to keep the truth secret
-- while lies are being written, 0004 hid the whole row:
--
--   using (auth_member_id() is not null and (phase <> 'lie' or auth_is_host()))
--
-- That hides the prompt too — and the prompt is the one thing every player must
-- read in order to write a lie. Passengers sat on "Şoför turu hazırlıyor…" for
-- the entire lie phase and never got an input box. Only the host, exempted by
-- that policy, could write anything. Found by playing the game through four
-- browsers instead of asserting against the host's own view.
--
-- The fix is the pattern every other secret in this app already uses — quiz_keys,
-- two_truths_keys, wave_targets, cn_keys: the secret lives in its own table with
-- its own policy, so the row everyone needs stays readable. Fibbage was the one
-- game that got this wrong.
--
-- BUG 2: members had no delete policy and two foreign keys blocked deletion
-- anyway, so a passenger added by mistake — a typo'd name — was permanent.

-- ---------------------------------------------------------------- fibbage
create table if not exists public.fibbage_keys (
  round_id uuid primary key references public.fibbage_rounds(id) on delete cascade,
  truth text not null
);

insert into public.fibbage_keys (round_id, truth)
select id, truth from public.fibbage_rounds
on conflict (round_id) do nothing;

alter table public.fibbage_rounds drop column if exists truth;

alter table public.fibbage_keys enable row level security;
revoke all on public.fibbage_keys from anon, authenticated;
grant select on public.fibbage_keys to authenticated;

-- Readable once the round is revealed — or by the host, who wrote it.
create policy fib_keys_select on public.fibbage_keys
  for select to authenticated using (
    auth_member_id() is not null
    and (auth_is_host() or exists (
      select 1 from fibbage_rounds r where r.id = round_id and r.phase = 'revealed'
    ))
  );

-- The round itself is now plain public knowledge inside the meeting.
drop policy if exists fib_rounds_select on public.fibbage_rounds;
create policy fib_rounds_select on public.fibbage_rounds
  for select to authenticated using (auth_member_id() is not null);

-- The host no longer inserts the round directly, because prompt and truth now
-- live in two tables and must land together or not at all.
revoke insert on public.fibbage_rounds from authenticated;

create or replace function public.create_fibbage_round(
  p_stage_id uuid, p_prompt text, p_truth text, p_multiplier numeric default 1
) returns uuid
language plpgsql security definer
set search_path = public
as $$
declare v_id uuid; v_order int;
begin
  if not auth_is_host() then raise exception 'host only' using errcode = '42501'; end if;
  if coalesce(trim(p_prompt), '') = '' or coalesce(trim(p_truth), '') = '' then
    raise exception 'prompt and truth required' using errcode = 'P0002';
  end if;

  select coalesce(max(order_index), 0) + 1 into v_order
  from fibbage_rounds where stage_id = p_stage_id;

  insert into fibbage_rounds (stage_id, prompt, phase, order_index, multiplier)
  values (p_stage_id, trim(p_prompt), 'lie', v_order, greatest(p_multiplier, 1))
  returning id into v_id;

  insert into fibbage_keys (round_id, truth) values (v_id, trim(p_truth));
  return v_id;
end;
$$;
revoke all on function public.create_fibbage_round(uuid, text, text, numeric) from public, anon;
grant execute on function public.create_fibbage_round(uuid, text, text, numeric) to authenticated;

-- submit_fib_lie compared the incoming lie against v_round.truth, which no
-- longer exists on that row. It reads the key table instead — being SECURITY
-- DEFINER it can, while the player still cannot.
--
-- (Note to self: there is no submit_fibbage_lie. I patched a plausibly-named
-- function first and the browser kept returning 400 while a direct call to the
-- one I had "fixed" passed. The name the client calls is the only one that
-- counts — this is submit_fib_lie, last defined in 0013.)
create or replace function public.submit_fib_lie(p_round_id uuid, p_body text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_member uuid := auth_member_id();
  v_round fibbage_rounds;
  v_truth text;
  v_body text := btrim(p_body);
begin
  if v_member is null then raise exception 'not a member' using errcode = '28000'; end if;
  select r.* into v_round from fibbage_rounds r where r.id = p_round_id;
  if not found then raise exception 'unknown round' using errcode = 'P0002'; end if;
  if v_round.phase <> 'lie' then raise exception 'not accepting lies' using errcode = 'P0002'; end if;

  select k.truth into v_truth from fibbage_keys k where k.round_id = p_round_id;

  if tr_fold(v_body) = tr_fold(btrim(coalesce(v_truth, ''))) then
    raise exception 'that is the truth' using errcode = 'P0005';
  end if;
  if exists (
    select 1 from fibbage_lies l
    where l.round_id = p_round_id
      and l.author_member_id <> v_member
      and tr_fold(l.body) = tr_fold(v_body)
  ) then
    raise exception 'someone already wrote that lie' using errcode = 'P0012';
  end if;

  insert into fibbage_lies (round_id, author_member_id, body)
  values (p_round_id, v_member, v_body)
  on conflict (round_id, author_member_id) do update set body = excluded.body;
end;
$$;
revoke all on function public.submit_fib_lie(uuid, text) from public, anon;
grant execute on function public.submit_fib_lie(uuid, text) to authenticated;

-- ---------------------------------------------------------------- members
-- Deleting a passenger must not be blocked by work they left behind. Both of
-- these columns are nullable and only ever hold an attribution, so releasing
-- them is right: the card stays on the board, it just stops being anyone's.
alter table public.cards drop constraint if exists cards_author_member_id_fkey;
alter table public.cards add constraint cards_author_member_id_fkey
  foreign key (author_member_id) references public.members(id) on delete set null;

alter table public.actions drop constraint if exists actions_owner_member_id_fkey;
alter table public.actions add constraint actions_owner_member_id_fkey
  foreign key (owner_member_id) references public.members(id) on delete set null;

-- The host can remove a passenger, but never themselves — locking yourself out
-- of your own meeting from the admin screen should not be one click away.
create policy members_delete_host on public.members
  for delete to authenticated using (auth_is_host() and id <> auth_member_id() and not is_host);

-- A policy is not a privilege: without this grant the delete is refused before
-- the policy is ever consulted.
grant delete on public.members to authenticated;

-- The client subscribes to fibbage_keys, and a binding to an unpublished table
-- silently kills every other binding on the same channel — the fault that once
-- looked like "data not loading until refresh". Publish it.
alter publication supabase_realtime add table public.fibbage_keys;
