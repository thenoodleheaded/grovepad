-- Subscriptions: the server-side record of who has Grovepad Air.
--
-- One row per account, written only by the billing webhook running with the
-- service role. A user may read their own row and nothing else — the client
-- never writes here, because an entitlement a client can set is not an
-- entitlement.
--
-- The row is a receipt of what the payment provider told us, not a derived
-- verdict. "Does this account get Air right now" is derived in exactly two
-- places, which must agree:
--   * server: public.has_air_entitlement() below, used by RLS in later phases
--   * client: src/subscription/entitlements.ts
-- The grace window constant is duplicated in both. If you change one, change
-- the other; entitlements.test.ts pins the number so the drift is caught.

set lock_timeout = '10s';
set statement_timeout = '2min';

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null check (plan in ('air', 'air_student')),
  status text not null check (
    status in ('trialing', 'active', 'past_due', 'canceled', 'lapsed')
  ),
  billing_interval text not null check (billing_interval in ('month', 'year')),
  -- Null means the provider has not told us yet; the status is then trusted on
  -- its own. A known end date is what the grace window is measured from.
  current_period_end timestamptz,
  trial_ends_at timestamptz,
  cancel_at_period_end boolean not null default false,
  polar_customer_id text,
  polar_subscription_id text unique,
  -- Set when a plan lapses: the 90-day clock after which cloud copies are
  -- deleted. Null while the plan is live.
  cloud_retention_until timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create index if not exists subscriptions_status_period_idx
  on public.subscriptions (status, current_period_end);

create index if not exists subscriptions_retention_idx
  on public.subscriptions (cloud_retention_until)
  where cloud_retention_until is not null;

create or replace function public.grovepad_stamp_subscription()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists grovepad_stamp_subscription on public.subscriptions;
create trigger grovepad_stamp_subscription
  before insert or update on public.subscriptions
  for each row execute function public.grovepad_stamp_subscription();

alter table public.subscriptions enable row level security;

-- Read your own row. There is deliberately no insert, update or delete policy:
-- the service role bypasses RLS, so the webhook can write, and nobody else can.
drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own
  on public.subscriptions for select to authenticated
  using ((select auth.uid()) = user_id);

-- Server-side entitlement truth. Mirrors deriveEntitlements() in
-- src/subscription/entitlements.ts.
--
-- 'lapsed' is the only status that loses Air immediately. 'past_due' and
-- 'canceled' keep it until the period they already paid for runs out, plus a
-- grace window that covers dunning retries and a client that has been offline.
create or replace function public.has_air_entitlement(p_user_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.subscriptions s
    where s.user_id = coalesce(p_user_id, (select auth.uid()))
      and s.status in ('trialing', 'active', 'past_due', 'canceled')
      and (
        s.current_period_end is null
        or s.current_period_end + interval '7 days' > now()
      )
  );
$$;

revoke all on function public.has_air_entitlement(uuid) from public;
grant execute on function public.has_air_entitlement(uuid) to authenticated;
grant execute on function public.has_air_entitlement(uuid) to service_role;
