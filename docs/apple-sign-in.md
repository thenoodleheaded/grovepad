# Sign in with Apple

Grovepad offers Apple sign-in two ways:

- **iPhone / iPad app** — Apple's own sheet (Face ID). The app cannot use a web
  redirect: its page lives at `tauri://localhost`, which no provider will
  redirect back to. [NativeAuthPlugin.swift](../src-tauri/plugins/native-auth/ios/Sources/NativeAuthPlugin.swift)
  returns Apple's ID token and [appleSignIn.ts](../src/lib/appleSignIn.ts)
  redeems it with `supabase.auth.signInWithIdToken`. Google is hidden in the
  app for the same redirect reason.
- **Website (grovepad.app)** — the normal Supabase web redirect.

The code is done. It only works once the three account steps below are complete.

## Values used everywhere

| Thing | Value |
|---|---|
| Team ID | `4BV47RN242` |
| App ID (bundle ID) | `app.grovepad` |
| Services ID (website sign-in) | `app.grovepad.web` |
| Supabase project | `ijzmhkyhjptaitfxjlcu` |
| Apple return URL | `https://ijzmhkyhjptaitfxjlcu.supabase.co/auth/v1/callback` |
| Sign in with Apple Key ID | `837TD7W9X8` (the `.p8` file is kept outside the repo — never commit it) |
| Current web secret expires | **10 March 2027** — generate a new one before then |

## 1. Apple Developer — turn it on for the app

1. [Identifiers](https://developer.apple.com/account/resources/identifiers/list) → click **app.grovepad**.
2. Tick **Sign in with Apple** → leave it as a primary App ID → **Save**.

Without this the native sheet fails with error 1000 and the build cannot be signed.

## 2. Apple Developer — website sign-in

1. Identifiers → **+** → **Services IDs** → Continue.
2. Description `Grovepad Web`, identifier `app.grovepad.web` → Register.
3. Open it, tick **Sign in with Apple** → **Configure**:
   - Primary App ID: `app.grovepad`
   - Domains: `ijzmhkyhjptaitfxjlcu.supabase.co` and `grovepad.app`
   - Return URL: `https://ijzmhkyhjptaitfxjlcu.supabase.co/auth/v1/callback`
4. Save → Continue → Save.
5. [Keys](https://developer.apple.com/account/resources/authkeys/list) → **+** → name `Grovepad Sign in with Apple`,
   tick **Sign in with Apple** → Configure → primary App ID `app.grovepad` → Register.
6. **Download the `.p8` file.** Apple lets you download it once. Note the **Key ID**.

## 3. Supabase — enable the Apple provider

1. Dashboard → **Authentication → Sign In / Providers → Apple** → enable.
2. **Client IDs**: `app.grovepad.web,app.grovepad`
   (the Services ID for the website, the bundle ID for the native app).
3. **Secret Key (for OAuth)**: a JWT signed with the `.p8` key. Supabase's
   Apple guide links a generator; it needs the Team ID, Key ID, Services ID and
   the `.p8` contents. **It expires after at most 6 months** — put a renewal
   reminder in your calendar, or website Apple sign-in silently stops working.
   (The native app sign-in does not use this secret.)
4. **Authentication → URL Configuration**: make sure `https://grovepad.app` is
   in the redirect URL list.

## Account deletion revokes Apple sign-in

Apple requires apps that offer Sign in with Apple to revoke the person's Apple
token when they delete their account. Grovepad does this without ever storing
an Apple token: the person confirms with Apple at the moment of deletion, and
the account Worker trades that one-time code for a token and revokes it.

- **iPhone / iPad app** — Apple's sheet appears; the app sends the code to
  `POST /api/account/apple/revoke`, then deletes the account.
- **Website** — Grovepad sends the person to Apple; Apple posts back to
  `/api/account/apple/callback`, which revokes and returns them to Grovepad,
  where the deletion finishes.

If the person cancels at Apple, or Apple is unreachable, **nothing is deleted**
and their boards stay safe. Accounts that never used Apple skip this entirely.

Code: [appleRevoke.ts](../worker/account/appleRevoke.ts) (the Worker) and
[wrangler.account.toml](../wrangler.account.toml).

### Setup (once)

1. **Apple Developer** → Identifiers → Services IDs → **app.grovepad.web** →
   Sign in with Apple → Configure → add this Return URL next to the Supabase one:
   `https://grovepad.app/api/account/apple/callback`
2. **Worker secrets** — in Terminal, in the project folder, run each and paste
   the value when asked:
   - `npx wrangler secret put APPLE_PRIVATE_KEY --config wrangler.account.toml`
     → the whole contents of `AuthKey_837TD7W9X8.p8`
   - `npx wrangler secret put ACCOUNT_STATE_SECRET --config wrangler.account.toml`
     → any long random string
   - `npx wrangler secret put SUPABASE_ANON_KEY --config wrangler.account.toml`
     → Supabase → Settings → API → the anon/publishable key
3. **Deploy** — `npm run deploy:account`, then `npm run deploy` for the website.

The Worker makes a fresh short-lived Apple secret for every request, so unlike
the Supabase website secret it never needs renewing.
