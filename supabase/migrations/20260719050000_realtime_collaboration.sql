set lock_timeout = '10s';
set statement_timeout = '2min';

create type public.canvas_member_role as enum ('owner', 'editor', 'commenter', 'viewer');

create table public.canvas_collaborations (
  canvas_id text primary key check (length(canvas_id) between 1 and 256),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 256),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create table public.canvas_members (
  canvas_id text not null references public.canvas_collaborations(canvas_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.canvas_member_role not null,
  joined_at timestamptz not null default clock_timestamp(),
  primary key (canvas_id, user_id)
);

create table public.canvas_crdt_documents (
  canvas_id text primary key references public.canvas_collaborations(canvas_id) on delete cascade,
  snapshot bytea not null,
  last_seq bigint not null default 0 check (last_seq >= 0),
  updated_at timestamptz not null default clock_timestamp()
);

create table public.canvas_crdt_updates (
  seq bigint generated always as identity primary key,
  canvas_id text not null references public.canvas_collaborations(canvas_id) on delete cascade,
  update_id uuid not null,
  sender_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  payload bytea not null check (octet_length(payload) between 1 and 8388608),
  created_at timestamptz not null default clock_timestamp(),
  unique (canvas_id, update_id)
);

create index canvas_crdt_updates_canvas_sequence_idx
  on public.canvas_crdt_updates (canvas_id, seq);

create table public.canvas_comments (
  id uuid primary key default gen_random_uuid(),
  canvas_id text not null references public.canvas_collaborations(canvas_id) on delete cascade,
  author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  parent_id uuid,
  widget_id text,
  body text not null check (length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (canvas_id, id),
  foreign key (canvas_id, parent_id) references public.canvas_comments(canvas_id, id) on delete cascade
);

create index canvas_comments_canvas_created_idx
  on public.canvas_comments (canvas_id, created_at);

create or replace function public.canvas_role(p_canvas_id text)
returns public.canvas_member_role
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.canvas_members
  where canvas_id = p_canvas_id and user_id = (select auth.uid())
$$;

create or replace function public.is_canvas_member(p_canvas_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.canvas_members
    where canvas_id = p_canvas_id and user_id = (select auth.uid())
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
  member_role public.canvas_member_role;
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

  select role into member_role
  from public.canvas_members
  where canvas_id = p_canvas_id and user_id = current_user_id;
  if member_role is null then raise insufficient_privilege; end if;
  return member_role;
end;
$$;

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
  if public.canvas_role(p_canvas_id) <> 'owner' then raise insufficient_privilege; end if;
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
  if public.canvas_role(p_canvas_id) not in ('owner', 'editor') then raise insufficient_privilege; end if;
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

alter table public.canvas_collaborations enable row level security;
alter table public.canvas_members enable row level security;
alter table public.canvas_crdt_documents enable row level security;
alter table public.canvas_crdt_updates enable row level security;
alter table public.canvas_comments enable row level security;

create policy canvas_collaborations_member_select on public.canvas_collaborations
for select to authenticated using (public.is_canvas_member(canvas_id));
create policy canvas_collaborations_owner_update on public.canvas_collaborations
for update to authenticated using (public.canvas_role(canvas_id) = 'owner')
with check (public.canvas_role(canvas_id) = 'owner');

create policy canvas_members_member_select on public.canvas_members
for select to authenticated using (public.is_canvas_member(canvas_id));

create policy canvas_crdt_documents_member_select on public.canvas_crdt_documents
for select to authenticated using (public.is_canvas_member(canvas_id));

create policy canvas_crdt_updates_member_select on public.canvas_crdt_updates
for select to authenticated using (public.is_canvas_member(canvas_id));
create policy canvas_crdt_updates_editor_insert on public.canvas_crdt_updates
for insert to authenticated with check (
  sender_id = (select auth.uid()) and public.canvas_role(canvas_id) in ('owner', 'editor')
);

create policy canvas_comments_member_select on public.canvas_comments
for select to authenticated using (public.is_canvas_member(canvas_id));
create policy canvas_comments_commenter_insert on public.canvas_comments
for insert to authenticated with check (
  author_id = (select auth.uid()) and public.canvas_role(canvas_id) in ('owner', 'editor', 'commenter')
);
create policy canvas_comments_author_update on public.canvas_comments
for update to authenticated using (author_id = (select auth.uid()))
with check (author_id = (select auth.uid()) and public.canvas_role(canvas_id) in ('owner', 'editor', 'commenter'));
create policy canvas_comments_author_or_owner_delete on public.canvas_comments
for delete to authenticated using (
  author_id = (select auth.uid()) or public.canvas_role(canvas_id) = 'owner'
);

drop policy if exists grovepad_canvas_member_receive on realtime.messages;
drop policy if exists grovepad_canvas_editor_broadcast on realtime.messages;
drop policy if exists grovepad_canvas_member_presence on realtime.messages;
create policy grovepad_canvas_member_receive on realtime.messages
for select to authenticated using (
  realtime.topic() like 'canvas:%'
  and public.is_canvas_member(substring(realtime.topic() from 8))
);
create policy grovepad_canvas_editor_broadcast on realtime.messages
for insert to authenticated with check (
  realtime.messages.extension = 'broadcast'
  and realtime.topic() like 'canvas:%'
  and public.canvas_role(substring(realtime.topic() from 8)) in ('owner', 'editor')
);
create policy grovepad_canvas_member_presence on realtime.messages
for insert to authenticated with check (
  realtime.messages.extension = 'presence'
  and realtime.topic() like 'canvas:%'
  and public.is_canvas_member(substring(realtime.topic() from 8))
);

revoke all on public.canvas_collaborations, public.canvas_members,
  public.canvas_crdt_documents, public.canvas_crdt_updates, public.canvas_comments from anon;
grant select, update(name) on public.canvas_collaborations to authenticated;
grant select on public.canvas_members to authenticated;
grant select on public.canvas_crdt_documents to authenticated;
grant select, insert on public.canvas_crdt_updates to authenticated;
grant select, insert, update, delete on public.canvas_comments to authenticated;
grant usage, select on sequence public.canvas_crdt_updates_seq_seq to authenticated;

revoke all on function public.canvas_role(text) from public, anon;
revoke all on function public.is_canvas_member(text) from public, anon;
revoke all on function public.ensure_canvas_collaboration(text, text) from public, anon;
revoke all on function public.set_canvas_member_role(text, text, public.canvas_member_role) from public, anon;
revoke all on function public.compact_canvas_crdt(text, bytea, bigint) from public, anon;
grant execute on function public.canvas_role(text) to authenticated;
grant execute on function public.is_canvas_member(text) to authenticated;
grant execute on function public.ensure_canvas_collaboration(text, text) to authenticated;
grant execute on function public.set_canvas_member_role(text, text, public.canvas_member_role) to authenticated;
grant execute on function public.compact_canvas_crdt(text, bytea, bigint) to authenticated;
