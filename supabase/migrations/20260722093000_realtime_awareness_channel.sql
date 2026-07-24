set lock_timeout = '10s';
set statement_timeout = '2min';

-- Presence is deliberately low-frequency. Cursor, selection, editor, and
-- camera awareness use Broadcast on a separate member-only topic so viewers
-- can participate without gaining permission to publish CRDT board updates.
drop policy if exists grovepad_canvas_awareness_receive on realtime.messages;
drop policy if exists grovepad_canvas_awareness_publish on realtime.messages;

create policy grovepad_canvas_awareness_receive on realtime.messages
for select to authenticated using (
  realtime.messages.extension in ('broadcast', 'presence')
  and realtime.topic() like 'awareness:%'
  and public.is_canvas_member(substring(realtime.topic() from 11))
);

create policy grovepad_canvas_awareness_publish on realtime.messages
for insert to authenticated with check (
  realtime.messages.extension in ('broadcast', 'presence')
  and realtime.topic() like 'awareness:%'
  and public.is_canvas_member(substring(realtime.topic() from 11))
);
