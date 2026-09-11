// ---------------------------------------------------------------------------
// The account Worker — Sign in with Apple token revocation on account deletion.
//
// Its own deployment, like billing and the Canvas relay. It holds the Sign in
// with Apple private key and talks only to Supabase (to confirm who is asking)
// and appleid.apple.com. It deliberately never holds the Supabase service_role
// key: deleting the account itself stays in the database's delete_own_account()
// function, called by the signed-in person after revocation succeeds.
//
// Deployed by `npm run deploy:account` from wrangler.account.toml, which routes
// only /api/account/*.
// ---------------------------------------------------------------------------

import {
  accountRoute,
  handleNativeRevoke,
  handleWebCallback,
  handleWebStart,
  preflight,
  type AccountEnv,
} from './account/appleRevoke'

export default {
  async fetch(request: Request, env: AccountEnv): Promise<Response> {
    const route = accountRoute(new URL(request.url).pathname)
    if (route && route !== 'web-callback' && request.method === 'OPTIONS') return preflight(request, env)
    if (route === 'native-revoke') return handleNativeRevoke(request, env)
    if (route === 'web-start') return handleWebStart(request, env)
    if (route === 'web-callback') return handleWebCallback(request, env)
    return Response.json(
      { error: 'Not found.' },
      { status: 404, headers: { 'Cache-Control': 'no-store, max-age=0' } },
    )
  },
}
