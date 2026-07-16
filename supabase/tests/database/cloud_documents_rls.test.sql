begin;

create extension if not exists pgtap with schema extensions;
select plan(14);

select has_table('public', 'board_indexes', 'board index table exists');
select has_table('public', 'canvas_docs', 'canvas document table exists');
select has_table('public', 'board_revisions', 'revision receipt table exists');

select policies_are(
  'public', 'boards',
  array['grovepad_boards_owner_all'],
  'legacy board has only the owner policy'
);
select policies_are(
  'public', 'board_indexes',
  array['grovepad_board_indexes_owner_all'],
  'board indexes have only the owner policy'
);
select policies_are(
  'public', 'canvas_docs',
  array['grovepad_canvas_docs_owner_all'],
  'canvas docs have only the owner policy'
);
select policies_are(
  'public', 'board_revisions',
  array['grovepad_board_revisions_owner_select'],
  'revisions expose only the owner read policy'
);

-- Seed two rollback-only tenants without depending on the current auth.users column set.
insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');
set local session_replication_role = replica;
insert into public.boards (user_id, data) values
  ('11111111-1111-1111-1111-111111111111', '{"format":"grovepad-board","v":2}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', '{"format":"grovepad-board","v":2}'::jsonb);
insert into public.board_indexes (user_id, doc, checksum) values
  ('11111111-1111-1111-1111-111111111111', '{"format":"grovepad-board-index"}'::jsonb, repeat('a', 64)),
  ('22222222-2222-2222-2222-222222222222', '{"format":"grovepad-board-index"}'::jsonb, repeat('a', 64));
insert into public.canvas_docs (user_id, canvas_id, body, meta, checksum) values
  ('11111111-1111-1111-1111-111111111111', 'canvas-a', decode('00', 'hex'), '{"encoding":"identity"}'::jsonb, repeat('a', 64)),
  ('22222222-2222-2222-2222-222222222222', 'canvas-b', decode('00', 'hex'), '{"encoding":"identity"}'::jsonb, repeat('a', 64));
set local session_replication_role = origin;

set local role authenticated;
set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';

select results_eq(
  'select count(*) from public.boards',
  array[1::bigint],
  'authenticated users see only their legacy row'
);
select results_eq(
  'select count(*) from public.board_indexes',
  array[1::bigint],
  'authenticated users see only their board index'
);
select results_eq(
  'select count(*) from public.canvas_docs',
  array[1::bigint],
  'authenticated users see only their canvas documents'
);
select results_eq(
  $$update public.canvas_docs
    set checksum = repeat('c', 64)
    where user_id = '22222222-2222-2222-2222-222222222222'
    returning canvas_id$$,
  $$values ('never-visible'::text) limit 0$$,
  'a user cannot update another tenant canvas'
);
select lives_ok(
  $$update public.canvas_docs
    set checksum = repeat('b', 64)
    where user_id = '11111111-1111-1111-1111-111111111111'$$,
  'a user can update their own canvas'
);
select results_eq(
  'select count(*) from public.board_revisions',
  array[1::bigint],
  'an owned canvas update creates one readable revision receipt'
);

reset role;
set local role anon;
set local "request.jwt.claim.sub" = '';
select throws_ok(
  'select count(*) from public.boards',
  '42501',
  'permission denied for table boards',
  'anonymous users have no board table privileges'
);

select * from finish();
rollback;
