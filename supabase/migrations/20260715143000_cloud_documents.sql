set lock_timeout = '10s';
set statement_timeout = '2min';

-- Retain the legacy monolithic row during the compatibility window. New
-- clients dual-write it while board_indexes + canvas_docs are authoritative.
create table if not exists public.boards (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default clock_timestamp()
);

update public.boards
set updated_at = clock_timestamp()
where updated_at is null;

alter table public.boards
  alter column updated_at set default clock_timestamp(),
  alter column updated_at set not null;

create table if not exists public.board_indexes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  doc jsonb not null,
  meta jsonb not null default '{}'::jsonb,
  checksum text not null check (checksum ~ '^[0-9a-f]{64}$'),
  rev bigint not null default 1 check (rev > 0),
  updated_at timestamptz not null default clock_timestamp(),
  constraint board_indexes_format_check check (doc->>'format' = 'grovepad-board-index')
);

create table if not exists public.canvas_docs (
  user_id uuid not null references auth.users(id) on delete cascade,
  canvas_id text not null,
  body bytea not null,
  meta jsonb not null default '{}'::jsonb,
  checksum text not null check (checksum ~ '^[0-9a-f]{64}$'),
  rev bigint not null default 1 check (rev > 0),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, canvas_id),
  constraint canvas_docs_id_check check (length(canvas_id) between 1 and 256),
  constraint canvas_docs_encoding_check check (meta->>'encoding' in ('gzip', 'identity'))
);

create table if not exists public.board_revisions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  document_kind text not null check (document_kind in ('board-index', 'canvas')),
  document_id text not null,
  rev bigint not null check (rev > 0),
  checksum text not null check (checksum ~ '^[0-9a-f]{64}$'),
  payload jsonb,
  body bytea,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  constraint board_revisions_body_check check (
    (document_kind = 'board-index' and payload is not null and body is null) or
    (document_kind = 'canvas' and payload is null and body is not null)
  ),
  unique (user_id, document_kind, document_id, rev)
);

create index if not exists canvas_docs_user_updated_idx
  on public.canvas_docs (user_id, updated_at desc);
create index if not exists board_revisions_lookup_idx
  on public.board_revisions (user_id, document_kind, document_id, rev desc);

create or replace function public.grovepad_stamp_legacy_board()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.data is distinct from old.data then
    new.updated_at := clock_timestamp();
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;

drop trigger if exists grovepad_stamp_legacy_board on public.boards;
create trigger grovepad_stamp_legacy_board
before insert or update on public.boards
for each row execute function public.grovepad_stamp_legacy_board();

create or replace function public.grovepad_stamp_cloud_document()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.rev := 1;
    new.updated_at := clock_timestamp();
  elsif new.checksum is distinct from old.checksum then
    new.rev := old.rev + 1;
    new.updated_at := clock_timestamp();
  elsif tg_table_name = 'board_indexes' then
    -- The index update is the commit marker for the preceding legacy/canvas
    -- writes. An unchanged index gets a fresh server timestamp but no revision.
    new.rev := old.rev;
    new.updated_at := clock_timestamp();
  else
    new.rev := old.rev;
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;

drop trigger if exists grovepad_stamp_board_index on public.board_indexes;
create trigger grovepad_stamp_board_index
before insert or update on public.board_indexes
for each row execute function public.grovepad_stamp_cloud_document();

drop trigger if exists grovepad_stamp_canvas_doc on public.canvas_docs;
create trigger grovepad_stamp_canvas_doc
before insert or update on public.canvas_docs
for each row execute function public.grovepad_stamp_cloud_document();

create or replace function public.grovepad_archive_cloud_document()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  archive_kind text;
  archive_id text;
begin
  if tg_op = 'UPDATE' and new.checksum is not distinct from old.checksum then
    return new;
  end if;

  if tg_table_name = 'board_indexes' then
    archive_kind := 'board-index';
    archive_id := 'board-index';
    insert into public.board_revisions (
      user_id, document_kind, document_id, rev, checksum, payload, meta
    ) values (
      new.user_id, archive_kind, archive_id, new.rev, new.checksum, new.doc, new.meta
    );
  else
    archive_kind := 'canvas';
    archive_id := new.canvas_id;
    insert into public.board_revisions (
      user_id, document_kind, document_id, rev, checksum, body, meta
    ) values (
      new.user_id, archive_kind, archive_id, new.rev, new.checksum, new.body, new.meta
    );
  end if;

  delete from public.board_revisions
  where id in (
    select id
    from public.board_revisions
    where user_id = new.user_id
      and document_kind = archive_kind
      and document_id = archive_id
    order by rev desc
    offset 30
  );
  return new;
end;
$$;

drop trigger if exists grovepad_archive_board_index on public.board_indexes;
create trigger grovepad_archive_board_index
after insert or update on public.board_indexes
for each row execute function public.grovepad_archive_cloud_document();

drop trigger if exists grovepad_archive_canvas_doc on public.canvas_docs;
create trigger grovepad_archive_canvas_doc
after insert or update on public.canvas_docs
for each row execute function public.grovepad_archive_cloud_document();

-- Replace every legacy policy on Grovepad-owned tables. PostgreSQL combines
-- permissive policies with OR, so leaving an old broad policy in place would
-- defeat a new restrictive owner policy.
do $$
declare
  target_table text;
  existing_policy record;
begin
  foreach target_table in array array['boards', 'board_indexes', 'canvas_docs', 'board_revisions']
  loop
    for existing_policy in
      select policyname
      from pg_policies
      where schemaname = 'public' and tablename = target_table
    loop
      execute format('drop policy %I on public.%I', existing_policy.policyname, target_table);
    end loop;
  end loop;
end;
$$;

alter table public.boards enable row level security;
alter table public.board_indexes enable row level security;
alter table public.canvas_docs enable row level security;
alter table public.board_revisions enable row level security;

create policy grovepad_boards_owner_all
on public.boards for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy grovepad_board_indexes_owner_all
on public.board_indexes for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy grovepad_canvas_docs_owner_all
on public.canvas_docs for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy grovepad_board_revisions_owner_select
on public.board_revisions for select to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.boards from anon;
revoke all on table public.board_indexes from anon;
revoke all on table public.canvas_docs from anon;
revoke all on table public.board_revisions from anon;

grant select, insert, update, delete on table public.boards to authenticated;
grant select, insert, update, delete on table public.board_indexes to authenticated;
grant select, insert, update, delete on table public.canvas_docs to authenticated;
grant select on table public.board_revisions to authenticated;

revoke all on function public.grovepad_stamp_legacy_board() from public, anon, authenticated;
revoke all on function public.grovepad_stamp_cloud_document() from public, anon, authenticated;
revoke all on function public.grovepad_archive_cloud_document() from public, anon, authenticated;
