-- Closes the remaining authorization gaps around canvas collaboration.
--
-- 1. Canvas-id squatting. `ensure_canvas_collaboration` inserted
--    `owner_id = auth.uid()` before making any authorization decision, on a
--    client-supplied primary key. Whoever called it first owned the row. That
--    was catastrophic while every install seeded the same root canvas id, and it
--    stays wrong afterwards: an id is guessable to anyone it was ever shared
--    with, and deleting a collaboration used to free its id for re-claiming by a
--    removed collaborator.
-- 2. Account enumeration. `set_canvas_member_role` distinguished "no such
--    account" from every other failure, turning canvas owners into an oracle
--    over `auth.users`.
-- 3. No way to remove a collaborator: `canvas_members` had no DELETE policy and
--    no RPC that deletes a row, so revocation was all-or-nothing.
-- 4. `has_air_entitlement(uuid)` accepted any account id from any caller,
--    disclosing other people's billing state past the subscriptions RLS.

set lock_timeout = '10s';
set statement_timeout = '2min';

-- A retired canvas id is never re-usable by a different account. Without this,
-- an owner who stops sharing hands the id back to the namespace, and the next
-- caller — including the collaborator they just removed — can register it and
-- inherit every device that still points at it.
create table if not exists public.canvas_collaboration_tombstones (
  canvas_id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  retired_at timestamptz not null default clock_timestamp()
);

alter table public.canvas_collaboration_tombstones enable row level security;
-- No policy: the table is consulted only from security-definer functions, and
-- nothing outside them has any business reading or writing it.
revoke all on public.canvas_collaboration_tombstones from public, anon, authenticated;

create or replace function public.ensure_canvas_collaboration(p_canvas_id text, p_name text)
returns public.canvas_member_role
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  inserted_count integer;
  effective_role public.canvas_member_role;
  tombstoned_owner uuid;
begin
  if current_user_id is null then raise insufficient_privilege; end if;
  if length(p_canvas_id) not between 1 and 256 or length(btrim(p_name)) not between 1 and 256 then
    raise exception 'invalid canvas metadata' using errcode = '22023';
  end if;

  -- The id every pre-2026-08 install used for its root canvas. It is not
  -- ownable by anybody: thousands of unrelated boards answer to it, so
  -- registering it would attach all of them to one account. Clients mint a
  -- fresh id and migrate off it on load.
  if p_canvas_id = 'canvas-origin' then
    raise exception 'this canvas needs to be re-created before it can be shared'
      using errcode = '22023';
  end if;

  select owner_id into tombstoned_owner
  from public.canvas_collaboration_tombstones
  where canvas_id = p_canvas_id;
  if tombstoned_owner is not null and tombstoned_owner is distinct from current_user_id then
    raise insufficient_privilege;
  end if;

  insert into public.canvas_collaborations (canvas_id, owner_id, name)
  values (p_canvas_id, current_user_id, btrim(p_name))
  on conflict (canvas_id) do nothing;
  get diagnostics inserted_count = row_count;

  if inserted_count = 1 then
    insert into public.canvas_members (canvas_id, user_id, role)
    values (p_canvas_id, current_user_id, 'owner');
    delete from public.canvas_collaboration_tombstones where canvas_id = p_canvas_id;
  end if;

  effective_role := public.canvas_role(p_canvas_id);
  if effective_role is null then raise insufficient_privilege; end if;
  return effective_role;
end;
$$;

create or replace function public.delete_canvas_collaboration(p_canvas_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if public.canvas_role(p_canvas_id) is distinct from 'owner' then raise insufficient_privilege; end if;
  insert into public.canvas_collaboration_tombstones (canvas_id, owner_id)
  values (p_canvas_id, current_user_id)
  on conflict (canvas_id) do update set owner_id = excluded.owner_id,
                                        retired_at = clock_timestamp();
  delete from public.canvas_collaborations where canvas_id = p_canvas_id;
end;
$$;

-- Every failure below the owner check now reports the same thing. An owner
-- learns whether the invite landed, never whether an address is registered.
create or replace function public.set_canvas_member_role(
  p_canvas_id text,
  p_email text,
  p_role public.canvas_member_role
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user_id uuid;
begin
  if public.canvas_role(p_canvas_id) is distinct from 'owner' then raise insufficient_privilege; end if;
  if p_role = 'owner' then
    raise exception 'ownership transfer is not supported by this operation' using errcode = '22023';
  end if;
  select id into target_user_id from auth.users where lower(email) = lower(btrim(p_email));
  if target_user_id is null or target_user_id = (select auth.uid()) then
    raise exception 'that person cannot be added to this canvas' using errcode = '22023';
  end if;
  insert into public.canvas_members (canvas_id, user_id, role)
  values (p_canvas_id, target_user_id, p_role)
  on conflict (canvas_id, user_id) do update set role = excluded.role;
end;
$$;

-- Removing one collaborator without tearing down the whole collaboration. The
-- owner cannot remove themselves: a canvas with no owner can never be shared,
-- unshared, or deleted again.
create or replace function public.remove_canvas_member(p_canvas_id text, p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user_id uuid;
begin
  if public.canvas_role(p_canvas_id) is distinct from 'owner' then raise insufficient_privilege; end if;
  select id into target_user_id from auth.users where lower(email) = lower(btrim(p_email));
  if target_user_id is null or target_user_id = (select auth.uid()) then
    raise exception 'that person cannot be removed from this canvas' using errcode = '22023';
  end if;
  delete from public.canvas_members
  where canvas_id = p_canvas_id and user_id = target_user_id;
end;
$$;

revoke all on function public.remove_canvas_member(text, text) from public, anon;
grant execute on function public.remove_canvas_member(text, text) to authenticated;

-- A comment could previously be moved to another canvas on update, because the
-- policy pinned the author but not the row's canvas.
drop policy if exists canvas_comments_author_update on public.canvas_comments;
create policy canvas_comments_author_update on public.canvas_comments
for update to authenticated
using (author_id = (select auth.uid()) and public.is_canvas_member(canvas_id))
with check (
  author_id = (select auth.uid())
  and public.canvas_role(canvas_id) in ('owner', 'editor', 'commenter')
);

-- Billing state is nobody else's business. The argument existed so the webhook
-- could ask about an arbitrary account, but the webhook runs as service_role and
-- bypasses RLS anyway, so `authenticated` only ever needs to ask about itself.
-- An earlier draft of this migration created the function under the tier's
-- old name. Nothing references it; remove it wherever that draft ran.
drop function if exists public.has_plus_entitlement(uuid);

create or replace function public.has_air_entitlement(p_user_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.subscriptions s
    where s.user_id = coalesce(p_user_id, (select auth.uid()))
      and (
        s.user_id = (select auth.uid())
        or (select auth.jwt() ->> 'role') = 'service_role'
      )
      and s.status in ('trialing', 'active', 'past_due', 'canceled')
      and (
        s.current_period_end is null
        or s.current_period_end + interval '7 days' > now()
      )
  );
$$;

revoke all on function public.has_air_entitlement(uuid) from public, anon;
grant execute on function public.has_air_entitlement(uuid) to authenticated;
grant execute on function public.has_air_entitlement(uuid) to service_role;
