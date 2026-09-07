// ---------------------------------------------------------------------------
// The billing Worker — a separate deployment from the Canvas relay on purpose.
//
// This Worker holds SUPABASE_SERVICE_ROLE_KEY, which bypasses every row-level
// security policy in the database. The Canvas relay, by contrast, exists to
// forward a user-supplied token to a user-supplied external host. Those two
// jobs must not share a process: a flaw in request parsing over there should
// never be within reach of the key that can rewrite anyone's subscription.
//
// Deployed by `npm run deploy:billing` from wrangler.billing.toml, which routes
// only /api/billing/* and carries the nightly reconciliation cron.
// ---------------------------------------------------------------------------

import { reconcileSubscriptions } from './billing/reconcile'
import {
  billingRoute,
  handleCheckout,
  handlePolarWebhook,
  productCatalogue,
  type BillingEnv,
} from './billing/routes'

// Every value here arrives as a Worker secret or a [vars] entry, neither of
// which the generated worker-configuration.d.ts knows about.
type BillingWorkerEnv = BillingEnv

export default {
  async fetch(request: Request, env: BillingWorkerEnv): Promise<Response> {
    const route = billingRoute(new URL(request.url).pathname)
    if (route === 'webhook') return handlePolarWebhook(request, env)
    if (route === 'checkout') return handleCheckout(request, env)
    return Response.json(
      { error: 'Not found.' },
      { status: 404, headers: { 'Cache-Control': 'no-store, max-age=0' } },
    )
  },

  /**
   * Nightly reconciliation against Polar.
   *
   * Missing configuration is not an error: a deployment without billing secrets
   * is a valid state — the free plan is the whole product — and throwing would
   * fill the logs with a failure nobody can act on.
   */
  async scheduled(
    _event: ScheduledController,
    env: BillingWorkerEnv,
    ctx: ExecutionContext,
  ): Promise<void> {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.POLAR_ACCESS_TOKEN) return
    ctx.waitUntil(
      reconcileSubscriptions({
        config: { url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY },
        catalogue: productCatalogue(env),
        polarAccessToken: env.POLAR_ACCESS_TOKEN,
        polarApiBase: env.POLAR_API_BASE,
      })
        .then((report) => {
          console.log('billing reconciliation', JSON.stringify(report))
        })
        .catch((error: unknown) => {
          console.error('billing reconciliation failed', error)
        }),
    )
  },
}
