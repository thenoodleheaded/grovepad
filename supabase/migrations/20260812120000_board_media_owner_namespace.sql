-- Security fix: board media was addressed as `<canvas_id>/<blob_key>`, and
-- `can_access_canvas_media()` decided who could touch it by asking whether the
-- caller had a `public.canvas_docs` row for that canvas id.
--
-- Both halves of that were wrong, and together they were a cross-tenant breach:
--
--   * `canvas_docs` is keyed `(user_id, canvas_id)` and its RLS lets a caller
--     write their own rows freely, so the authorization fact was one the
--     attacker asserts about themselves. A row you write for yourself can never
--     decide what you may read.
--   * every install seeds its root canvas with the same literal id, so all
--     tenants' default boards collapsed into one storage folder. Every signed-in
--     account satisfied the check for every other account's media, and the
--     write/replace/delete policies reused the same predicate — so this was
--     read, overwrite and delete, not merely disclosure.
--
-- The path now carries the uploader's identity: `<canvas_id>/<user_id>/<key>`.
-- Identity in the path is a fact the server controls, so the policies no longer
-- have to trust a table the caller can write:
--
--   read    your own bytes, or any bytes on a canvas you are a member of
--   write   only under your own user id, and only bytes you own
--
-- That holds even when two accounts share a canvas id, which is what makes it
-- the durable fix rather than a patch on the symptom.

set lock_timeout = '10s';
set statement_timeout = '2min';

-- Legacy two-segment objects (`<canvas_id>/<blob_key>`) no longer match any
-- policy, so they become unreachable to every role except service_role the
-- moment this runs — which is the point: those are exactly the bytes that were
-- cross-readable. They are deliberately NOT deleted here. Media is written to
-- the device before it is ever uploaded, so the local copy is authoritative and
-- `startMediaSync()`'s reconcile sweep re-uploads under the new path on next
-- load. Purge the orphans from a service-role job once telemetry shows the
-- fleet has re-synced; deleting user bytes inside a migration is not a call
-- this file should make.

create or replace function public.can_read_canvas_media(
  p_canvas_id text,
  p_owner_segment text
)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select
    -- Your own bytes. This is the only branch a private canvas ever uses, and
    -- it is why a colliding canvas id can no longer leak anything: the segment
    -- is compared against the caller's own uid, not looked up in a table.
    p_owner_segment = (select auth.uid())::text
    -- Somebody else's bytes on a canvas you were actually invited to. Requires
    -- a real `canvas_members` row, which only a registered collaboration has.
    or public.is_canvas_member(p_canvas_id)
$function$;

revoke all on function public.can_read_canvas_media(text, text) from public, anon;
grant execute on function public.can_read_canvas_media(text, text) to authenticated;

drop policy if exists "board media read" on storage.objects;
create policy "board media read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'board-media'
    and public.can_read_canvas_media(
      (storage.foldername(name))[1],
      (storage.foldername(name))[2]
    )
  );

-- Writes are deliberately narrower than reads. A viewer or commenter on a
-- shared canvas could previously overwrite and delete the owner's pictures,
-- because every policy shared the read predicate. Now the owner segment must be
-- the caller: you may only ever create, replace or remove your own bytes, on
-- any canvas, and no role check can widen that.
drop policy if exists "board media write" on storage.objects;
create policy "board media write"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'board-media'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

drop policy if exists "board media replace" on storage.objects;
create policy "board media replace"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'board-media'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'board-media'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

drop policy if exists "board media delete" on storage.objects;
create policy "board media delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'board-media'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

-- Retired rather than left callable: it is the vulnerable predicate, and a
-- copy left in place invites the next policy to reach for it.
drop function if exists public.can_access_canvas_media(text);
