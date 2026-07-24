set lock_timeout = '10s';
set statement_timeout = '2min';

-- Security fix. `public.canvas_role(...)` returns NULL for a user who is not a
-- member of the canvas at all. Three SECURITY DEFINER functions guarded
-- themselves with `<> 'owner'` / `not in ('owner', 'editor')`, and in SQL a
-- comparison against NULL yields NULL, not true — so `if NULL then raise` never
-- fired and the guard let complete strangers through. Because these functions
-- are SECURITY DEFINER they also bypass RLS, so any signed-in user who knew a
-- canvas id could grant themselves a role on it, rewrite its update log, or
-- delete the whole collaboration.
--
-- Members were always checked correctly (a real role compares normally); only
-- the non-member NULL case fell through. The RLS policies were never affected:
-- they use `= 'owner'` in USING clauses, where NULL correctly denies.
--
-- Every guard below is rewritten to be NULL-safe.

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
  if target_user_id is null then raise exception 'no account found for that email' using errcode = 'P0002'; end if;
  if target_user_id = (select auth.uid()) then
    raise exception 'the owner role cannot be changed' using errcode = '22023';
  end if;
  insert into public.canvas_members (canvas_id, user_id, role)
  values (p_canvas_id, target_user_id, p_role)
  on conflict (canvas_id, user_id) do update set role = excluded.role;
end;
$$;

create or replace function public.compact_canvas_crdt(
  p_canvas_id text,
  p_snapshot bytea,
  p_last_seq bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_last_seq bigint;
  maximum_seq bigint;
begin
  if coalesce(public.canvas_role(p_canvas_id)::text, '') not in ('owner', 'editor') then
    raise insufficient_privilege;
  end if;
  if octet_length(p_snapshot) > 16777216 then
    raise exception 'snapshot too large' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_canvas_id, 0));
  select coalesce(last_seq, 0) into current_last_seq
  from public.canvas_crdt_documents where canvas_id = p_canvas_id;
  select coalesce(max(seq), 0) into maximum_seq
  from public.canvas_crdt_updates where canvas_id = p_canvas_id;
  if p_last_seq < coalesce(current_last_seq, 0) or p_last_seq > maximum_seq then
    raise exception 'invalid compaction sequence' using errcode = '22023';
  end if;
  insert into public.canvas_crdt_documents (canvas_id, snapshot, last_seq)
  values (p_canvas_id, p_snapshot, p_last_seq)
  on conflict (canvas_id) do update
    set snapshot = excluded.snapshot,
        last_seq = excluded.last_seq,
        updated_at = clock_timestamp();
  delete from public.canvas_crdt_updates
  where canvas_id = p_canvas_id and seq <= p_last_seq;
end;
$$;

create or replace function public.delete_canvas_collaboration(p_canvas_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.canvas_role(p_canvas_id) is distinct from 'owner' then raise insufficient_privilege; end if;
  delete from public.canvas_collaborations where canvas_id = p_canvas_id;
end;
$$;
