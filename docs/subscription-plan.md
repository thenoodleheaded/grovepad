# Grovepad subscription plan

Decided 12 August 2026, from the Growth Book (chapters 14–17) plus the owner's decisions in session.
This document is the source of truth for what is free, what is paid, what it costs, and how the
subscription gets built. Prices and third-party fees were checked August 2026 — re-verify the week
the pricing page goes live.

## The agreement

One paid tier: **Grovepad Air**. **$59.99/year** or **$8.99/month**. Students **$19.99/year** or **$4.99/month** on an
honor-system checkbox, no proof asked. **30-day free trial, card required.** Sold through Polar
(a merchant of record — they legally sell for you and file all VAT/sales tax) on grovepad.app only.
Never a purchase button or account requirement inside the iOS app (Apple guideline 3.1.3(b) posture
from the Growth Book).

The line between tiers: **anything on the user’s own machine is free forever; Air sells things
that cost real server money.**

| Free forever | Grovepad Air |
|---|---|
| All ~70 widgets, all skins, unlimited canvases and widgets per canvas | Live sync across devices |
| Offline, guest mode, one device at a time | 10 GB attachments, 12-month version history |
| JSON + Markdown export, all importers | PDF + PNG export |
| Local AI (WebLLM), local MCP connector | Hosted MCP (future — not on the launch pricing page) |
| Home-screen widget showing local data | Cloud-updating home-screen widgets |
| *Joining* anyone's live board as a guest, always free | *Hosting* live boards: up to 10 people, 40 hours/month |
| Hosting live boards: 20 minutes per board per day | Public publishing of canvases |
| Unlisted share links (rate-limited, not indexed) | |
| No public publishing | |

### Trust rules (never violate, from the Growth Book's banned list)

- Never count local boards or widgets. No caps on anything local.
- Never make local boards read-only or non-editable when a subscription lapses.
- Never paywall JSON/Markdown export.
- Never limit devices for local use.
- Never lock widget types or skins.
- Never charge or cap guests — the host pays, guests are free.
- Free plan only ever loosens after launch, never tightens.

### Lapse policy

When Air lapses: sync, hosted multiplayer, publishing, and cloud attachments stop. Local boards
stay fully editable forever — open, edit, add, delete, export. Cloud copies are retained and
downloadable for **90 days** (in-app warnings), then deleted. Pricing-page sentence:
**"Stop paying and your boards still open offline."**

### Adopted defaults (changeable until build starts)

- Free signed-in accounts get **no sync at all** — an account exists for the trial and for boards
  shared with you (the Obsidian model; a "one free synced board" tier would re-introduce counting).
- Trial requires a card up front.
- Free multiplayer rule is measured **per board per day** (say it in one breath).
- Text co-editing syncs on commit (blur / let-go), not per keystroke.

### Parked until 50 payers

- $250 lifetime offer test (limited, once).
- Hosted-AI add-on (+$X/month on top of Air, ≥50% margin) — only if support email proves demand
  from people who won't bring their own key. No AI reselling before then; BYOK + local AI + MCP is
  the in-app AI answer.
- Polar Pro plan ($20/month, 3.8% + $0.40) — pays for itself only past ~25 new yearly sales/month.

## The money

Per sale on Polar Starter (5% + $0.50):

| Plan | Sticker | You receive | Fee % |
|---|---|---|---|
| Yearly | $59.99 | $56.49 ($4.71/mo) | 5.8% |
| Monthly | $8.99 | $8.04 | 10.6% |
| Student yearly | $19.99 | $18.49 ($1.54/mo) | 7.5% |
| Student monthly | $4.99 | $4.24 | 15.0% |

Student monthly is the weakest line here: at $4.99 the flat $0.50 alone is 10% of the sale, so
15% goes to fees before any server cost. It exists to remove a price objection, not to earn —
watch whether it cannibalises the student yearly rather than adding new payers.

Non-US cards cost 1.5% more; a dispute costs a flat $15. Polar files all VAT and US sales tax;
your own income tax on the payouts remains yours to declare.

Fixed costs ≈ **$39/month** (Supabase Pro $25, Cloudflare Workers $5, Apple Developer ~$8.25,
domain ~$1; Google Play $25 once). **Break-even: 9 yearly payers.** 90-day target from the Growth
Book: 300 signups, 100 activated, **5 payers** — the subscription's job at launch is to exist and
be honest, not to pay rent.

Per-user serving cost after the storage and multiplayer rework lands: typical payer ~$0.02/month,
heaviest realistic payer under ~$0.50/month, full 10 GB of attachments $0.15/month. The two levers
that make this true are R2's free egress and event-based multiplayer messages (below). Before the
rework, a heavy collaborator could cost ~$31/month — which is why cost engineering is sequenced
before promoting multiplayer, though not before selling sync.

## Multiplayer messaging design (decided)

Replaces the current 20-updates/second awareness loop (`AWARENESS_BROADCAST_INTERVAL_MS = 50` in
[collaborationRuntime.ts](../src/runtime/collaborationRuntime.ts)). No continuous cursor traffic.

- **Event-based widget updates only.** A message is sent when a widget actually changes: text
  committed on let-go (blur), a button on it clicked, pin state changed, open/expand state changed
  (see flag below), and other discrete state changes. Idle boards send nothing.
- **Drags stream at ~5 updates/second** (200 ms interval) while a drag is active; nothing between
  drags. The final drop position always sends.
- **Field-of-vision culling.** Live/ephemeral updates for a widget stop sending entirely when the
  widget is inside no other collaborator's viewport. Durable state changes (final repositioning,
  content commits) always send regardless — board state must converge for everyone. Requires each
  peer to share its camera rect on change (throttled, ~2/second, tiny messages).
- **Grab-locks**: one message on drag start, one on drag end, so two people can't silently fight
  over a card. Always sent (safety-relevant, 2 messages instead of thousands of cursor frames).
- **Presence**: join event, leave event, 30-second heartbeat. No continuous presence traffic.
- A repair/anti-entropy path stays (slower or on-demand, replacing today's 750 ms durable-repair
  loop) so late joiners and dropped messages converge.

> **DECIDED 12 August 2026 — open/expand state stays private.** The owner confirmed the
> existing widget rest law stands: clicking a card open is per-viewer view state and never
> syncs, so nobody's screen changes because someone else glanced at a card. Phase 6 must NOT
> broadcast open/expand. The cost difference was negligible either way, so the product contract
> won.

## Storage design (decided)

Everything byte-heavy moves to **Cloudflare R2** ($0.015/GB-month storage, $0 egress). Supabase
keeps only what must be relational: auth/accounts, canvas ownership and membership records,
entitlements, and the realtime message bus. Postgres holds pointers and permissions; R2 holds
documents.

Moves to R2: attachments and media (today in the Supabase `board-media` bucket via
[mediaSyncService.ts](../src/services/mediaSyncService.ts)), board documents, version-history
snapshots, and published-board pages (served through Cloudflare's CDN cache so a viral public
board costs ~nothing). R2 has no per-user quotas natively, so uploads pass through a Worker that
checks the 10 GB meter — attachment bytes are the one meter the plan allows, because they are the
one real bill.

## Build phases

Rough effort totals ~110–170 focused hours. Phases 0–4 are the revenue path and come first; 5–6
are the cost-engineering path, required before *promoting* multiplayer but not before *selling*
sync (at 5-payer scale the old costs are pennies). Each phase ends with a verifiable "done when."

### Phase 0 — Gates and paperwork (4–8 h, mostly waiting)

1. **Verify Polar supports you as an individual seller in your country** at
   polar.sh/docs/merchant-of-record/supported-countries (Polar takes individuals only where Stripe
   Connect Express does). **This is the single hardest gate in the whole plan — check it before
   writing any code.** If unsupported: evaluate Paddle (5% + $0.50, but sub-$10 products need
   custom pricing, which touches the $8.99 monthly), a foreign entity (adds cost/complexity), or —
   worst case — adjust plan shape to yearly-only to fit an alternative seller.
2. Open the Polar account (sandbox first). Confirm current fees (Starter 5% + $0.50 for orgs
   created after 27 May 2026).
3. Apple Developer Program ($99/yr) and App Store Small Business Program (15% rate) if not done;
   set the 50% education volume discount **before** first app submission (irreversible after).
4. Write and publish /privacy, /terms, /support, and a refund policy page — Polar checkout and
   both app stores require them, and today they're empty.
5. Working homepage precondition: the Growth Book's week-1 task (headline, description,
   screenshots) must exist before the pricing page — checkout hanging off a blank site converts
   nobody.

Done when: Polar sandbox account exists and payouts to your bank are confirmed possible; the four
legal/support pages return real HTML.

### Phase 1 — Entitlement foundation (10–15 h)

The server-side record of who has Air, and one code owner for "what does this account get."

1. Supabase migration: `subscriptions` table — user id, plan (`plus`/`plus_student`), status
   (`trialing`/`active`/`past_due`/`canceled`/`lapsed`), billing interval, current period end,
   Polar customer id, Polar subscription id, timestamps. RLS: a user reads only their own row;
   only the service role writes.
2. New module `src/subscription/entitlements.ts` — the ONE owner of entitlement truth in the app.
   Exposes derived facts (`isSubscribed`, storage quota, multiplayer limits, publish rights). Every
   future gate imports from here; no scattered `if (isSubscribed)` re-derivations.
3. Client store (small slice or extension of [useAuthStore.ts](../src/store/useAuthStore.ts))
   that fetches the row at sign-in, caches it locally, and applies an **offline grace window**
   (last-known entitlement honored ~7 days past period end) so a flight doesn't kill sync.
4. Free accounts get a well-defined default entitlement (no sync, guest access, trial-eligible).

Done when: a hand-inserted row flips `isSubscribed` in the app after sign-in, offline grace behaves,
and `npm run check` passes with new unit tests on the entitlement derivations.

### Phase 2 — Polar wiring (12–20 h)

1. Products in Polar (all four live as of 12 Aug 2026): Grovepad Air Annual $59.99, Grovepad Air $8.99/mo, Grovepad Air Annual - Student $19.99, Grovepad Air Student $4.99/mo (separate products;
   the pricing page checkbox routes to it — no verification). 30-day trial on all, card required.
2. Checkout: pricing page buttons open Polar checkout with the signed-in user's id attached
   (metadata / external customer id) so the webhook can match the purchase to the account. Signed-
   out buyers: checkout first, then an account-link step on the success page.
3. Webhook receiver — a Cloudflare Worker endpoint (fits the existing worker/ + wrangler setup):
   verifies Polar's webhook signatures, is idempotent (stores processed event ids), and writes the
   `subscriptions` table via service role on subscription created/updated/canceled/revoked, order
   paid, refund, and dispute events.
4. Customer portal: link Polar's hosted portal from Settings for cancel/card-update — you build no
   billing UI.
5. Reconciliation cron (Worker scheduled trigger): nightly compare of Polar's subscription list
   against the table, correcting drift from missed webhooks.
6. Full sandbox pass: subscribe (trial), convert, fail a payment, cancel, refund — watching the
   entitlement row flip correctly each time.

Done when: the sandbox lifecycle above works end-to-end and a real $59.99 test purchase in live mode
lands a correct row and a Polar payout entry.

### Phase 3 — Gating the cloud (15–25 h)

Enforcement lives server-side; client checks are UX, not security.

1. **Sync gate**: RLS on the cloud board tables — creating/uploading *your own* synced canvases
   requires an active entitlement; membership reads on canvases *shared with you* stay free
   (guests are never charged). [cloudSync.ts](../src/utils/cloudSync.ts) surfaces a clear
   "sync is a Air feature" state instead of erroring.
2. **Multiplayer session rules**: a session ledger (host, board, started-at, participant count).
   Free host: 20 minutes per board per day, then the session ends for everyone with a friendly
   in-canvas notice. Air host: 10 concurrent people, 40 hours/month — enforced as a circuit
   breaker (channel join refused past the ceiling), not a visible meter. Honest note: perfect
   enforcement of realtime limits is hard; ledger + join-time checks + session end broadcast is
   the right amount for this scale.
3. **Storage meter**: attachment uploads pass through a Worker that checks the user's byte total
   against 10 GB before issuing an upload URL (lands fully in Phase 5 with R2; interim Supabase
   bucket check is acceptable while payer count is tiny).
4. **Publishing gate**: publish action requires Air. Free tier has no publish surface at all.
   Unlisted share links stay free with rate limiting at the serving layer.
5. **Lapse mechanics**: entitlement expiry flips status; sync/hosting/publishing stop; a scheduled
   job marks cloud data for the 90-day retention clock and deletes after; in-app warnings at
   lapse, day 60, day 83.

Done when: a free account cannot create synced canvases or publish (verified at the API, not just
the UI); a session under a free host ends at 20 minutes; flipping a row to `lapsed` stops cloud
features while local editing remains fully intact (manual smoke).

### Phase 4 — Product surfaces (10–15 h)

1. Pricing page on grovepad.app: the tier table, the three prices, the trust sentence ("Stop
   paying and your boards still open offline"), refund policy link, student checkbox.
2. In-app: Air state in [AccountChip.tsx](../src/components/ui/AccountChip.tsx) / Settings;
   trial countdown; manage-subscription link to Polar's portal.
3. Upgrade moments at the natural walls, each one sentence and dismissible: second-device sign-in
   (sync), the 20-minute session end (hosting), publish attempt, PDF/PNG export attempt.
4. iOS ships with no account and no purchase button (v1 stays local-only per the Growth Book);
   no gating exists there until accounts arrive in a later iOS version.
5. Ten help pages + one support email with a 48-hour reply promise (Growth Book "cost of having
   customers" — written before the price goes live).

Done when: a stranger can go from the pricing page through checkout to a syncing second device
without help; every upgrade moment appears at its wall and nowhere else.

### Phase 5 — R2 storage migration (20–30 h)

1. Worker media gateway: signed upload/download URLs for R2, enforcing the same canvas ownership
   and membership rules as the current bucket policy (see supabase/migrations/
   20260729090000_board_media_objects.sql) plus the 10 GB meter.
2. Point [mediaSyncService.ts](../src/services/mediaSyncService.ts) at the gateway (local-first
   contract unchanged: local write awaited, upload queued).
3. Board documents and version-history snapshots as R2 objects; Postgres keeps pointer rows.
4. Published boards render to static pages in R2 behind Cloudflare's cache.
5. Cutover is trivial at current scale (no real users): migrate the handful of test objects, turn
   off Supabase Storage.

Done when: two-device media smoke passes through R2; a published board serves from cache (second
request never touches origin); Supabase egress stays flat while downloading a large board
repeatedly.

### Phase 6 — Multiplayer message rework (30–50 h)

Implements the messaging design section above, in
[collaborationRuntime.ts](../src/runtime/collaborationRuntime.ts) /
[supabaseCollaboration.ts](../src/collaboration/supabaseCollaboration.ts):

1. Remove the 50 ms awareness loop and cursor streaming entirely.
2. Event-based widget change messages (text commit on let-go, button clicks, pin, open — pending
   the flagged confirmation above).
3. Drag streaming at 5/second with always-sent final drop; grab-locks on drag start/end.
4. Camera-rect sharing (throttled, on change) and field-of-vision culling for ephemeral streams;
   durable changes always send.
5. Presence join/leave + 30 s heartbeat; slower/on-demand repair path replacing the 750 ms loop.
6. A deterministic test seam for message-count accounting (per AGENTS change workflow), so a
   regression that re-introduces chatty traffic fails a test, not a bill.

Done when: an idle 3-person board sends ~0 messages/minute (heartbeats only); a busy session's
measured message count is within ~2× of the design estimate; drags feel live on a second machine.

### Phase 7 — Launch and measurement (≈10 h)

1. Manual smoke additions: subscribe, lapse, resume, refund; free session end; publish gate.
2. Metrics that matter (Growth Book ch. 21): signups, activation, trial starts, trial→paid,
   monthly churn (watch monthly, not yearly), support hours/week (rule: past 6 h/week, raise the
   price).
3. Live switch: pricing page public, one real purchase, refund it, confirm the whole loop.
4. Day-90: re-run the money arithmetic with real numbers (target was 300 signups / 100 activated /
   5 payers).

## Sequencing note against the Growth Book's 90-day plan

The Book's rule stands: no new widgets or skins for 90 days. Phases 0–4 are the Book's own
"checkout" job done properly. Phases 5–6 are cost engineering, not features — they exist so the
worst-case user costs cents instead of dollars — and they can land after the first payers exist,
but must land before multiplayer or publishing is actively promoted anywhere.
