-- Billing webhook receipts.
--
-- A webhook provider retries. Standard Webhooks gives every delivery a stable
-- `webhook-id`, and the same id may legitimately arrive several times: a
-- timeout on our side, a redeploy mid-request, a provider replay. Writing the
-- subscription row twice is harmless on its own, but "already handled" has to
-- be answerable to make the handler honestly idempotent, and to make a
-- duplicate refund or a replayed cancel a no-op rather than a surprise.
--
-- Only the service role touches this table. RLS is enabled with no policies at
-- all, which is the strongest statement available: every ordinary client,
-- authenticated or not, sees nothing and can write nothing.

set lock_timeout = '10s';
set statement_timeout = '2min';

create table if not exists public.billing_events (
  -- The provider's `webhook-id` header. Primary key IS the idempotency guard:
  -- a second delivery of the same id fails the insert, and that failure is the
  -- signal to skip, not an error to report.
  event_id text primary key check (length(event_id) between 1 and 256),
  event_type text not null check (length(event_type) between 1 and 128),
  -- Which account the event resolved to, when it resolved to one. Null for an
  -- event we accepted but could not match, which is a case worth being able to
  -- find later rather than silently dropping.
  user_id uuid references auth.users(id) on delete set null,
  polar_subscription_id text,
  -- Kept for support: "what exactly did they send us on the 3rd" is otherwise
  -- unanswerable, and a billing dispute is precisely when it gets asked.
  payload jsonb,
  received_at timestamptz not null default clock_timestamp()
);

create index if not exists billing_events_received_idx
  on public.billing_events (received_at desc);

create index if not exists billing_events_user_idx
  on public.billing_events (user_id, received_at desc)
  where user_id is not null;

alter table public.billing_events enable row level security;

-- Deliberately no policies. The service role bypasses RLS; nobody else has any
-- access whatsoever, including reading their own billing events.
