-- Revision numbering must continue past archived history, not restart at 1.
--
-- board_revisions rows outlive the canvas_docs row they came from: deleting a
-- canvas leaves its history behind (only a user delete cascades). The insert
-- branch of the stamp trigger set rev := 1 unconditionally, so re-creating a
-- canvas with a previously used id archived a second rev 1 and violated
-- board_revisions_user_id_document_kind_document_id_rev_key. PostgREST maps
-- that to 409, the whole push aborts, the client never stamps a successful
-- sync, and every reload re-opens the local/cloud conflict prompt.
--
-- Fix: seed a fresh document's rev from the highest rev already archived for
-- that (user, kind, document id), and make the archive insert non-fatal so a
-- history write can never again block the board write it is recording.
create or replace function public.grovepad_stamp_cloud_document()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  archive_kind text;
  archive_id text;
  archived_rev bigint;
begin
  if tg_op = 'INSERT' then
    if tg_table_name = 'board_indexes' then
      archive_kind := 'board-index';
      archive_id := 'board-index';
    else
      archive_kind := 'canvas';
      archive_id := new.canvas_id;
    end if;
    select max(rev) into archived_rev
    from public.board_revisions
    where user_id = new.user_id
      and document_kind = archive_kind
      and document_id = archive_id;
    new.rev := coalesce(archived_rev, 0) + 1;
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
  if tg_table_name = 'board_indexes' then
    archive_kind := 'board-index';
    archive_id := 'board-index';
    insert into public.board_revisions (
      user_id, document_kind, document_id, rev, checksum, payload, meta
    ) values (
      new.user_id, archive_kind, archive_id, new.rev, new.checksum, new.doc, new.meta
    )
    on conflict (user_id, document_kind, document_id, rev) do nothing;
  else
    archive_kind := 'canvas';
    archive_id := new.canvas_id;
    insert into public.board_revisions (
      user_id, document_kind, document_id, rev, checksum, body, meta
    ) values (
      new.user_id, archive_kind, archive_id, new.rev, new.checksum, new.body, new.meta
    )
    on conflict (user_id, document_kind, document_id, rev) do nothing;
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
revoke all on function public.grovepad_stamp_cloud_document() from public, anon, authenticated;
revoke all on function public.grovepad_archive_cloud_document() from public, anon, authenticated;
