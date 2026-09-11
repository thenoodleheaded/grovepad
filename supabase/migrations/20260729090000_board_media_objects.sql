-- Board media objects.
--
-- Media never inlines into board JSON, so a picture dropped on one device used
-- to exist only on that device. This bucket is the courier: one private object
-- per blob key, addressed as <canvas_id>/<blob_key>, written after the local
-- copy is already safe and read only when a device is missing the local copy.
--
-- Access mirrors the canvas itself — the owner of the canvas document, the
-- owner of a shared canvas, or an invited member. There is no public read, so
-- removing a member removes their access to the pictures in the same act.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'board-media',
  'board-media',
  false,
  26214400, -- 25 MiB; the client refuses anything larger before it uploads
  array['image/*', 'video/*', 'audio/*', 'application/pdf']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- A private canvas has no membership rows at all — its owner is known only by
-- the canvas document they sync — so ownership and membership are both asked.
create or replace function public.can_access_canvas_media(p_canvas_id text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select
    public.is_canvas_member(p_canvas_id)
    or exists (
      select 1 from public.canvas_docs
      where canvas_id = p_canvas_id and user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.canvas_collaborations
      where canvas_id = p_canvas_id and owner_id = (select auth.uid())
    )
$function$;

revoke all on function public.can_access_canvas_media(text) from public;
grant execute on function public.can_access_canvas_media(text) to authenticated;

drop policy if exists "board media read" on storage.objects;
create policy "board media read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'board-media'
    and public.can_access_canvas_media((storage.foldername(name))[1])
  );

drop policy if exists "board media write" on storage.objects;
create policy "board media write"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'board-media'
    and public.can_access_canvas_media((storage.foldername(name))[1])
  );

drop policy if exists "board media replace" on storage.objects;
create policy "board media replace"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'board-media'
    and public.can_access_canvas_media((storage.foldername(name))[1])
  )
  with check (
    bucket_id = 'board-media'
    and public.can_access_canvas_media((storage.foldername(name))[1])
  );

drop policy if exists "board media delete" on storage.objects;
create policy "board media delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'board-media'
    and public.can_access_canvas_media((storage.foldername(name))[1])
  );
