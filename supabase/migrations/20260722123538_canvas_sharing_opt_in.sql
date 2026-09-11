-- Sharing is opt-in per canvas. Turning it back off must actually revoke
-- access rather than merely stop the local client syncing, so the owner can
-- delete the whole collaboration. Every collaboration table references
-- canvas_collaborations with on delete cascade, so removing this one row drops
-- the membership list, the CRDT document and update log, and the comments with
-- it. The owner's local board is untouched: this only removes the server copy.
create or replace function public.delete_canvas_collaboration(p_canvas_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.canvas_role(p_canvas_id) <> 'owner' then raise insufficient_privilege; end if;
  delete from public.canvas_collaborations where canvas_id = p_canvas_id;
end;
$$;

revoke all on function public.delete_canvas_collaboration(text) from public, anon;
grant execute on function public.delete_canvas_collaboration(text) to authenticated;;
