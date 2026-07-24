begin;

create extension if not exists pgtap with schema extensions;
select plan(17);

select has_table('public', 'canvas_collaborations', 'collaboration canvas table exists');
select has_table('public', 'canvas_members', 'membership table exists');
select has_table('public', 'canvas_crdt_documents', 'compacted CRDT table exists');
select has_table('public', 'canvas_crdt_updates', 'durable CRDT log exists');
select has_table('public', 'canvas_comments', 'comment table exists');

insert into auth.users (id, email) values
  ('33333333-3333-3333-3333-333333333333', 'owner@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'viewer@example.com'),
  ('55555555-5555-5555-5555-555555555555', 'stranger@example.com');

set local role authenticated;
set local "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
select is(
  public.ensure_canvas_collaboration('shared-a', 'Shared canvas')::text,
  'owner',
  'first authenticated user becomes owner'
);
select lives_ok(
  $$select public.set_canvas_member_role('shared-a', 'viewer@example.com', 'viewer')$$,
  'owner can invite a viewer'
);
select lives_ok(
  $$insert into public.canvas_crdt_updates (canvas_id, update_id, payload)
    values ('shared-a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', decode('01', 'hex'))$$,
  'owner can append a CRDT update'
);

set local "request.jwt.claim.sub" = '44444444-4444-4444-4444-444444444444';
select results_eq(
  $$select count(*) from public.canvas_crdt_updates where canvas_id = 'shared-a'$$,
  array[1::bigint],
  'viewer can cold-start from durable updates'
);
select throws_ok(
  $$insert into public.canvas_crdt_updates (canvas_id, update_id, payload)
    values ('shared-a', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', decode('02', 'hex'))$$,
  '42501',
  null,
  'viewer cannot mutate the CRDT log'
);

select throws_ok(
  $$select public.delete_canvas_collaboration('shared-a')$$,
  '42501',
  null,
  'a non-owner member cannot stop sharing the canvas'
);

-- canvas_role returns NULL for a complete stranger, and `NULL <> 'owner'` is
-- NULL rather than true, so an inequality guard would let them straight past.
-- These functions are SECURITY DEFINER and bypass RLS, so the guard is the
-- only thing standing between a stranger and someone else's canvas.
set local "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555555';
select throws_ok(
  $$select public.delete_canvas_collaboration('shared-a')$$,
  '42501',
  null,
  'a non-member cannot delete a canvas collaboration'
);
select throws_ok(
  $$select public.set_canvas_member_role('shared-a', 'viewer@example.com', 'editor')$$,
  '42501',
  null,
  'a non-member cannot grant themselves a role on a canvas'
);
select throws_ok(
  $$select public.compact_canvas_crdt('shared-a', decode('01', 'hex'), 1)$$,
  '42501',
  null,
  'a non-member cannot rewrite a canvas update log'
);

set local "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
select lives_ok(
  $$select public.delete_canvas_collaboration('shared-a')$$,
  'owner can stop sharing the canvas'
);
select results_eq(
  $$select count(*) from public.canvas_members where canvas_id = 'shared-a'$$,
  array[0::bigint],
  'stopping sharing revokes every invited member'
);
select results_eq(
  $$select count(*) from public.canvas_crdt_updates where canvas_id = 'shared-a'$$,
  array[0::bigint],
  'stopping sharing deletes the server copy of the board'
);

select * from finish();
rollback;

