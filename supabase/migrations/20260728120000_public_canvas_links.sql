set lock_timeout = '10s';
set statement_timeout = '2min';

-- Public means link-visible to authenticated Grovepad accounts. Anonymous
-- database access stays revoked. Explicit membership always wins, so an email
-- the owner assigns as Editor can write while every other link visitor gets
-- the effective Viewer role.
alter table public.canvas_collaborations
add column if not exists is_public boolean not null default false;

create or replace function public.can_view_canvas(p_canvas_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.canvas_collaborations collaboration
    where collaboration.canvas_id = p_canvas_id
      and (
        collaboration.is_public
        or exists (
          select 1
          from public.canvas_members member
          where member.canvas_id = collaboration.canvas_id
            and member.user_id = (select auth.uid())
        )
      )
  )
$$;

create or replace function public.canvas_role(p_canvas_id text)
returns public.canvas_member_role
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select member.role
      from public.canvas_members member
      where member.canvas_id = p_canvas_id
        and member.user_id = (select auth.uid())
    ),
    (
      select 'viewer'::public.canvas_member_role
      from public.canvas_collaborations collaboration
      where collaboration.canvas_id = p_canvas_id
        and collaboration.is_public
        and (select auth.uid()) is not null
    )
  )
$$;

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
begin
  if current_user_id is null then raise insufficient_privilege; end if;
  if length(p_canvas_id) not between 1 and 256 or length(btrim(p_name)) not between 1 and 256 then
    raise exception 'invalid canvas metadata' using errcode = '22023';
  end if;

  insert into public.canvas_collaborations (canvas_id, owner_id, name)
  values (p_canvas_id, current_user_id, btrim(p_name))
  on conflict (canvas_id) do nothing;
  get diagnostics inserted_count = row_count;

  if inserted_count = 1 then
    insert into public.canvas_members (canvas_id, user_id, role)
    values (p_canvas_id, current_user_id, 'owner');
  end if;

  effective_role := public.canvas_role(p_canvas_id);
  if effective_role is null then raise insufficient_privilege; end if;
  return effective_role;
end;
$$;

create or replace function public.set_canvas_public_access(
  p_canvas_id text,
  p_is_public boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.canvas_role(p_canvas_id) is distinct from 'owner' then raise insufficient_privilege; end if;
  update public.canvas_collaborations
  set is_public = p_is_public,
      updated_at = clock_timestamp()
  where canvas_id = p_canvas_id;
end;
$$;

drop policy if exists canvas_collaborations_member_select on public.canvas_collaborations;
create policy canvas_collaborations_viewer_select on public.canvas_collaborations
for select to authenticated using (public.can_view_canvas(canvas_id));

drop policy if exists canvas_crdt_documents_member_select on public.canvas_crdt_documents;
create policy canvas_crdt_documents_viewer_select on public.canvas_crdt_documents
for select to authenticated using (public.can_view_canvas(canvas_id));

drop policy if exists canvas_crdt_updates_member_select on public.canvas_crdt_updates;
create policy canvas_crdt_updates_viewer_select on public.canvas_crdt_updates
for select to authenticated using (public.can_view_canvas(canvas_id));

drop policy if exists canvas_comments_member_select on public.canvas_comments;
create policy canvas_comments_viewer_select on public.canvas_comments
for select to authenticated using (public.can_view_canvas(canvas_id));

drop policy if exists grovepad_canvas_member_receive on realtime.messages;
create policy grovepad_canvas_member_receive on realtime.messages
for select to authenticated using (
  realtime.topic() like 'canvas:%'
  and public.can_view_canvas(substring(realtime.topic() from 8))
);

drop policy if exists grovepad_canvas_member_presence on realtime.messages;
create policy grovepad_canvas_member_presence on realtime.messages
for insert to authenticated with check (
  realtime.messages.extension = 'presence'
  and realtime.topic() like 'canvas:%'
  and public.can_view_canvas(substring(realtime.topic() from 8))
);

drop policy if exists grovepad_canvas_awareness_receive on realtime.messages;
create policy grovepad_canvas_awareness_receive on realtime.messages
for select to authenticated using (
  realtime.messages.extension in ('broadcast', 'presence')
  and realtime.topic() like 'awareness:%'
  and public.can_view_canvas(substring(realtime.topic() from 11))
);

drop policy if exists grovepad_canvas_awareness_publish on realtime.messages;
create policy grovepad_canvas_awareness_publish on realtime.messages
for insert to authenticated with check (
  realtime.messages.extension in ('broadcast', 'presence')
  and realtime.topic() like 'awareness:%'
  and public.can_view_canvas(substring(realtime.topic() from 11))
);

revoke all on function public.can_view_canvas(text) from public, anon;
revoke all on function public.set_canvas_public_access(text, boolean) from public, anon;
grant execute on function public.can_view_canvas(text) to authenticated;
grant execute on function public.set_canvas_public_access(text, boolean) to authenticated;
