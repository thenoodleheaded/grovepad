# Google Play submission checklist

Grovepad's Android signing is fully wired (release keystore generated,
`ANDROID_KEYSTORE_BASE64`/`ANDROID_KEYSTORE_PASSWORD`/`ANDROID_KEY_ALIAS`/
`ANDROID_KEY_PASSWORD` are already in GitHub Actions secrets — see
[native-apps.md](native-apps.md)). This doc is everything left: the actual
Play Console listing, which needs your account and your words, not code.

## What this app actually does with data (verified against source, 2026-09-10)

There are no ads and no crash-reporting SDK (`rg` for Firebase, Mixpanel,
Amplitude, Sentry, Crashlytics returns nothing). There is exactly one
analytics dependency, PostHog, and it sends exactly one event —
`app_opened`, once per app start, carrying a single `surface: app | web`
property. Session recording, autocapture, heatmaps, surveys, feature flags
and exception capture are all switched off in
[`src/services/analytics.ts`](../src/services/analytics.ts), and the SDK is a
dynamic import behind a consent gate, so a user who turns usage counting off
in Settings → Data never downloads it. The Android manifest requests exactly
one permission: `INTERNET`. No camera, microphone, or contacts access anywhere
in the web code.

**Location is the exception, and it is used.** The Location widget calls
`navigator.geolocation` (`getCurrentPosition` and `watchPosition`) in
[`LocationWidget.tsx`](../src/components/widgets/modules/LocationWidget.tsx),
foreground only, and only when the user presses the widget's own control. The
resulting coordinates are board content: local always, and synced to Supabase
like any other widget value if the user is signed in. Declare location on both
stores — filing "location: not collected" would be a false privacy
declaration. iOS carries the matching
`NSLocationWhenInUseUsageDescription` purpose string; without it iOS
terminates the process instead of prompting.

| Data | Collected? | Where it goes | Required or optional |
|---|---|---|---|
| Email address | Yes, on sign-in | Supabase Auth (your project) | Required to use cloud sync/collaboration; guest mode needs none |
| Display name | Yes, if set | Supabase, shown to invited collaborators only | Optional |
| Board/note content | Yes | Local IndexedDB always; Supabase Postgres too if signed in, for sync. Shared with another person only when you explicitly invite them to that canvas (RLS-gated by role) | Sync/sharing optional — guest mode is 100% local, zero network calls |
| Live cursor/selection/camera position | Yes, while collaborating | Ephemeral Supabase Realtime presence channel; never written to a table | Only while a collaboration session is open |
| App open count | Yes, unless switched off | PostHog (`app_opened` + `surface`, plus the browser/OS/approximate-country properties PostHog adds to any event). Never board content | Optional — Settings → Data → Usage counting; off means the SDK is never loaded |
| OpenAI API key + pasted document text | Only if the user opts into "Import Document" AI parsing and supplies their own key | Directly from the user's device to `api.openai.com` — Grovepad's servers never see it | Fully optional, bring-your-own-key |

Nothing here is sold, shared with advertisers, or used for anything besides
delivering the feature the user just asked for.

## Play Console → Data safety form

Answer it in this shape (exact wording to use, mapped to Play Console's
categories):

- **Personal info → Email address**: Collected, required for account
  creation/sign-in, used for App functionality and Account management. Not
  shared with third parties. User can request deletion (see below).
- **Personal info → Name**: Collected, optional, used for App functionality
  (shown to collaborators you invite). Not shared beyond people you invite.
- **App activity → App interactions**: Collected, **optional**, used for
  Analytics. This is the `app_opened` count and nothing else. Not linked to
  the user's identity, and processed by PostHog on our behalf rather than
  shared with a third party for its own purposes.
- **App activity → User-generated content**: Collected, used for App
  functionality (cloud sync). Not shared with third parties except the
  specific people a user invites to a specific canvas.
- **Location → Approximate/Precise location**: Collected, **optional**, used
  for App functionality. Only when the user asks a Location widget for a fix;
  foreground only, never in the background. Stored as board content and
  synced only if the user is signed in. Not shared, not used for tracking or
  advertising.
- **Everything else** (financial info, health, contacts, photos, audio,
  device IDs, etc.): **Not collected.**
- **Data is encrypted in transit**: Yes (HTTPS/WSS to Supabase and, for the
  optional AI feature, to OpenAI).
- **Users can request data deletion**: Yes — describe your actual account
  deletion path once you decide it (Supabase gives you `auth.users`
  cascade-delete via RLS `on delete cascade` already wired into every
  collaboration table; if there's no in-app delete-account button yet,
  either add one before submitting or provide a support-email deletion
  process here).

## Store listing assets you still need to produce

| Asset | Spec | Notes |
|---|---|---|
| App icon | 512×512 PNG, 32-bit with alpha | Derive from `src-tauri/icons/icon.png` |
| Feature graphic | 1024×500 PNG/JPEG | Marketing banner, not in the repo — needs design |
| Phone screenshots | 2–8 images, min 320px, max 3840px per side | Capture from a real build — the canvas is the product, show it populated |
| 7-inch and 10-inch tablet screenshots | Same limits | Required since the app supports tablets |
| Short description | ≤80 characters | e.g. "A connected thinking canvas for notes, boards, and widgets" |
| Full description | ≤4000 characters | What Grovepad is, core features, mention local-first + optional cloud sync |
| Privacy policy URL | Public, reachable page | **Required** before submission — must accurately describe the table above |
| Content rating questionnaire | Answered in Play Console | No UGC moderation, no ads, no gambling — should land on "Everyone" |

## App access (for reviewers)

Google's reviewers need to be able to open and use the app. Grovepad's guest
mode covers this cleanly: reviewers can review all core canvas/widget
functionality with zero login. If you want them to also see the
collaboration/multi-user features, provide a test account's email/password
in the "App access" section of Play Console (Store presence → App content).

## Technical gates Play Console checks automatically

- **Target API level**: Tauri's Android template tracks current Play
  requirements; confirm `compileSdk`/`targetSdk` in
  `src-tauri/gen/android/app/build.gradle.kts` are current at submission
  time (Play enforces a minimum target SDK that moves roughly yearly).
- **App Bundle format**: use the `.aab` from
  `npm run tauri:android:build` (or the CI workflow), not the `.apk` — Play
  requires AAB for new listings.
- **64-bit compliance**: Tauri's Rust cross-compilation already produces
  `arm64-v8a`; the `armeabi-v7a`/`x86`/`x86_64` targets in CI cover the rest
  of Play's required ABI matrix.

## Before you submit

1. Decide on and (if missing) build an in-app "Delete my account" action, or
   a documented support-email process — the data-safety form above commits
   to one existing.
2. Write and publish the actual privacy policy page.
3. Produce the screenshots and feature graphic.
4. Push a `v*` tag once `ANDROID_KEYSTORE_*` secrets are confirmed (they
   are) to get a signed `.aab` out of CI, then upload it to a new Play
   Console release.
