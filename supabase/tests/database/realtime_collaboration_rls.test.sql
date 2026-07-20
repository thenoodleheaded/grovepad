begin;

create extension if not exists pgtap with schema extensions;
select plan(10);

select has_table('public', 'canvas_collaborations', 'collaboration canvas table exists');
select has_table('public', 'canvas_members', 'membership table exists');
select has_table('public', 'canvas_crdt_documents', 'compacted CRDT table exists');
select has_table('public', 'canvas_crdt_updates', 'durable CRDT log exists');
select has_table('public', 'canvas_comments', 'comment table exists');

insert into auth.users (id, email) values
  ('33333333-3333-3333-3333-333333333333', 'owner@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'viewer@example.com');

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

select * from finish();
rollback;

