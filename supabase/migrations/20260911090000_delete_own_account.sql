-- In-app account deletion.
--
-- Apple guideline 5.1.1(v) and Google Play's data-deletion policy both require
-- that an app which lets a person CREATE an account also lets them DELETE it
-- from inside the app. Grovepad offers email/password and OAuth sign-up, so
-- this is a submission blocker, not a nicety.
--
-- Deleting the auth.users row is almost the whole job: every table that holds
-- personal data references it `on delete cascade` (cloud documents, canvases
-- and their members, presence, comments, subscriptions). Two things do not
-- follow automatically and are handled deliberately here.
--
--   Storage. board-media objects are keyed by path, not by a foreign key, so
--   nothing in storage cascades. Their names are '<canvas id>/<owner uid>/...'
--   (see 20260812120000_board_media_owner_namespace.sql), which is what the
--   second path segment matches below. Without this, deleting an account would
--   leave every uploaded image behind — unreachable, because RLS keys on that
--   same segment, but not deleted, which is not what the person asked for.
--
--   Billing. public.billing_events references auth.users `on delete set null`
--   on purpose. A merchant of record has to keep the transaction record for tax
--   and accounting; setting the column null de-identifies the row instead of
--   destroying the ledger. Nothing personal survives in it.
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user_id uuid := (select auth.uid());
begin
  if target_user_id is null then
    raise exception 'delete_own_account requires an authenticated caller';
  end if;

  delete from storage.objects
  where bucket_id = 'board-media'
    and (storage.foldername(name))[2] = target_user_id::text;

  delete from auth.users where id = target_user_id;
end;
$$;

-- The caller is only ever allowed to delete themselves: the function reads
-- auth.uid() and takes no argument, so there is no id for a caller to forge.
revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;
