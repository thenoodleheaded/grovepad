# Grovepad inside the AI apps — remote MCP server + MCP Apps canvas

**Implementation plan. Read this whole document before writing any code.**

## Mission

Make Grovepad open *inside* Claude, ChatGPT, and other MCP-capable AI hosts as an
interactive canvas, so the AI answers in Grovepad widgets instead of scrolling text.
The user's own AI subscription pays for all inference. Grovepad pays only for hosting
(Cloudflare Worker + Supabase, both already in production).

Three deliverables, in dependency order:

1. **A remote MCP server** at `https://grovepad.app/mcp` (Cloudflare Worker,
   Streamable HTTP, OAuth) exposing widget-native tools whose inputs are validated
   Grovepad widget JSON.
2. **An MCP Apps UI** — an embeddable Grovepad canvas view the AI host renders in an
   iframe inside the conversation, showing the user's real board live.
3. **Host onboarding** — working as a Claude custom connector first, then ChatGPT
   Apps SDK, then Gemini's custom MCP URL.

The existing **local** stdio connector (`scripts/grovepad-mcp.mjs` + loopback bridge)
stays untouched and working. The remote server is a sibling, not a replacement.

## Non-negotiable ground rules

These come from the repo's own contracts. Violating any of them is a failed
implementation even if the feature works.

1. **Preview-then-commit, consume-once.** Every write tool follows the pattern
   established by `preview_tree`/`commit_tree` (`docs/mcp-connector.md`,
   `src/store/useMcpConnectorStore.ts`): a preview validates and returns an id, a
   commit consumes it exactly once, a lost response can never double-apply. No tool
   ever accepts arbitrary persisted board JSON.
2. **The storage contract is law.** `docs/storage-format-plan.md` binds every write:
   v2 self-describing format, unknown fields preserved, old code never overwrites
   newer data, migrations append-only, media never inlined. Server-side writes go
   through the same canonical serializer/normalizer as every other transport.
3. **RLS is the security boundary.** The Worker authenticates the user and calls
   Supabase *as that user* (anon key + user JWT) so Row Level Security enforces
   access. The Supabase service-role key must never be needed for board reads/writes;
   if you find yourself reaching for it, the design is wrong.
4. **Cloud failure never breaks local work.** Nothing in this project may add a
   network dependency to the local app experience.
5. **Canvas access follows existing DB policy** — owner plus invited members (plus
   the existing public-link machinery in
   `supabase/migrations/20260728120000_public_canvas_links.sql`). This project adds
   no new sharing semantics.
6. **Follow `AGENTS.md`**: route via `docs/codebase-map.md`, smallest coherent
   change, deterministic test seams before browser testing, update the codebase map
   when files/owners change, verification ladder (`npm run check`,
   `npm run check:full`) at the gates named below.
7. **Explain plainly.** The owner is not a professional engineer. Every progress
   report leads with what changed in everyday language.

## Phase 0 — Research before code (do not skip)

The MCP spec, MCP Apps extension, and ChatGPT Apps SDK all post-date your training
data or changed after it. **Fetch the live documentation before writing any
protocol code.** Do not implement from memory.

Fetch and read:

- MCP spec **2026-07-28** (stateless core, OAuth 2.0/OIDC authorization, versioned
  extensions): `https://modelcontextprotocol.io/specification/2026-07-28` and its
  authorization + transports pages.
- **MCP Apps extension** (server-shipped interactive HTML UIs): the extension page
  under the same spec site — exact resource mime types, `_meta` fields linking tools
  to UI resources, and the iframe↔host bridge API. Get field names from the spec,
  not from blog posts.
- **MCP TypeScript SDK** current major (`github.com/modelcontextprotocol/typescript-sdk`)
  — Streamable HTTP server transport on non-Node runtimes (Cloudflare Workers).
- **Cloudflare's MCP tooling**: the `agents` SDK / `McpAgent` and
  `@cloudflare/workers-oauth-provider` (`developers.cloudflare.com/agents/`). Decide
  whether to build on these or on the bare MCP SDK; prefer whichever gets OAuth +
  Streamable HTTP with the least custom protocol code, and record the decision in
  the PR description.
- **ChatGPT Apps SDK** (`developers.openai.com/apps-sdk`) — only skim now; it is
  Phase 4. Confirm it consumes standard MCP + MCP Apps so Phases 1–3 don't fork.

Repo reconnaissance (read, don't modify):

- `scripts/grovepad-mcp.mjs`, `scripts/mcp/grovepadBridge.mjs`,
  `src/runtime/mcpBridgeRuntime.ts`, `src/store/useMcpConnectorStore.ts`,
  `src/mcp/treeContract.ts` (+ test) — the existing tool surface, validation style,
  and consume-once semantics you will mirror.
- `src/utils/persistedBoardSchema.ts`, `src/utils/cloudSync.ts`,
  `src/utils/cloudDocuments.ts` (checksum-diffed per-canvas writes),
  `supabase/migrations/20260730120000_board_revision_rev_continuity.sql` — the cloud
  write protocol the Worker must speak.
- `src/widgets/registry.ts`, `src/widgets/fields.ts`, `src/widgets/contracts/` —
  the widget vocabulary the tool schemas will be derived from.
- `src/collaboration/` (`yjsCanvas.ts`, `supabaseCollaboration.ts`,
  `canvasStoreBridge.ts`) — the realtime transport the embed view reuses.
- **Worker-compatibility audit:** determine which of the above modules are pure
  TypeScript (no DOM, no IndexedDB, no Zustand side effects) and can be imported by
  a Cloudflare Worker directly. Where a module mixes pure logic with browser
  concerns, extract the pure core into a shared module rather than duplicating
  logic. List the verdict per module before starting Phase 1.

**Phase 0 output:** a short written summary (in the PR/commit description or a
`docs/` note) of: chosen server stack, OAuth approach, exact MCP Apps linkage
fields, and the pure-module audit. Get the owner's OK on the OAuth approach before
Phase 2 (it involves creating things outside the repo — see "Owner decision
points").

## Target architecture

```
AI host (Claude / ChatGPT / Gemini)
 │  MCP over Streamable HTTP + OAuth        ┌───────────────────────────────┐
 ├──────────────────────────────────────────► Cloudflare Worker grovepad.app │
 │                                          │  /mcp  – MCP server (tools +  │
 │  iframe (MCP Apps UI resource)           │         MCP Apps resources)   │
 ├──────────────────────────────────────────►  /authorize /token – OAuth    │
 │                                          │  static assets (existing site)│
 ▼                                          └──────────────┬────────────────┘
Embedded canvas view (slim Grovepad build,                 │ Supabase as the
served from grovepad.app, signed in as the user)           │ user (JWT + RLS)
 │        ▲                                                ▼
 │        └── realtime (existing collaboration transport) ──┐
 └── reads/writes the same cloud documents ────────────► Supabase
                                                        (cloud_documents,
                                                         revisions, auth)
```

Key property: the Worker and the user's open Grovepad app are **two clients of the
same cloud documents**, speaking the same checksum/revision protocol
(`cloudDocuments.ts` semantics + revision-continuity migration). The existing
`cloudSync.ts` reconciliation already handles a remote writer; the embed view gets
live updates through the existing collaboration/realtime path where available and
cloud-document polling as fallback.

## Phase 1 — The widget-plan contract (pure, fully testable, no network)

Create `src/mcp/widgetPlanContract.ts` (+ `.test.ts`), modeled directly on
`treeContract.ts`. This is the "Grovepad language" the AI speaks.

- **Curated widget subset.** Start with roughly 15 types chosen from the registry
  where AI answers land naturally — candidates: note, task/checklist, table,
  outline, bullet list, pros-cons, poll, habit, counter, rating, toggle, date,
  time/timer, chart, metrics. Derive each type's allowed content fields from the
  actual registry/field definitions found in Phase 0 — do not invent field names.
  The subset is an explicit allowlist constant; everything else is rejected with a
  message that names the allowed types.
- **A `WidgetPlan`** describes: widgets (type, content fields, optional grid
  position, optional parent link), relations, and circuit wires between planned
  widgets (validated against the port/field contracts). Positions are optional —
  when absent, layout reuses the existing thought-plan placement + settling path
  the tree connector already uses (`thoughtPlanFromMcpTree` is the pattern;
  generalize, don't fork).
- **Bounds, like the tree contract has:** max widgets per plan, max text lengths,
  max wires, max depth. Pick limits consistent with `MCP_TREE_LIMITS` and document
  them in the contract file.
- **Normalization is total:** any input either normalizes to a valid plan or
  returns a structured, AI-readable error (the model will read these errors and
  retry — write them as instructions, e.g. "`checklist.items[3].label` exceeds 200
  characters").
- **A JSON Schema export** for each tool input, generated from or checked against
  the contract, because MCP tools declare JSON Schema. A test must fail if the
  schema and the normalizer drift apart.
- **Server-side apply:** a pure function that takes a current canvas document
  (v2 format) + a normalized plan and returns the updated document — preserving
  unknown fields, producing the same semantic document the app would (this is
  where the Phase 0 pure-module audit pays off; reuse the canonical
  serializer/normalizer, never a hand-rolled JSON edit). Fixture tests: apply a
  plan to a frozen v2 fixture board and snapshot the result; adversarial fixtures
  for unknown widgets/fields surviving the write.

**Gate:** `npm run check` green. This phase touches no network and ships value even
if later phases stall (the local connector can adopt the same contract later).

## Phase 2 — Remote MCP server on the existing Worker

Extend the deployment in `wrangler.toml` (currently assets-only serving `./dist`)
with a Worker script. Static site behavior must not change: the Worker handles
`/mcp`, `/authorize`, `/token`, `/.well-known/*` (whatever the chosen OAuth layout
needs) and falls through to assets for everything else. Mind the existing 404
handling note in `wrangler.toml`.

- **Transport:** Streamable HTTP per MCP 2026-07-28, stateless core. Use the SDK /
  Cloudflare tooling chosen in Phase 0.
- **Auth:** OAuth per the MCP spec, with Supabase as the identity provider. The
  expected shape (verify in Phase 0): the Worker is the OAuth
  authorization+resource server (dynamic client registration + PKCE for MCP
  clients); its `/authorize` page has the user sign in with their existing Grovepad
  Supabase account and consent; tokens issued to the MCP client map server-side to
  the user's Supabase session/JWT so every Supabase call runs under RLS as that
  user. Secrets go in Worker secrets (`wrangler secret`), never in the repo.
- **Tools** (all inputs validated by the Phase 1 contract; all responses include
  human-readable summaries the model can echo):
  - `grovepad_status` — who am I, limits, boards summary.
  - `list_canvases` — id, name, workspace, shared state (RLS-scoped).
  - `read_canvas` — bounded outline: widgets with type, title/text excerpts,
    positions, relations, wires. Reuse `canvasOutline` bounds philosophy (caps on
    cards and text; never raw board JSON).
  - `create_canvas` — new private canvas in a named workspace.
  - `preview_widgets` — validates a `WidgetPlan`, stores a short-TTL preview
    (Worker KV or a Supabase table — decide in Phase 0; must survive stateless
    requests), returns preview id + a human-readable placement summary.
  - `commit_widgets` — consumes the preview once, applies the plan server-side to
    the cloud document with revision continuity, returns created ids;
    `alreadyCommitted` semantics identical to the tree connector.
  - `update_widgets` / `remove_widgets` — same preview/commit pattern, restricted
    to the curated subset and bounded batch sizes. Removal previews must name what
    will be deleted in plain language.
- **Safety rails:** per-user rate limits on write tools; plan size caps; all writes
  audit-logged (who, when, canvas, tool) in a Supabase table; a kill switch (Worker
  env var) that disables write tools without a deploy.
- **Local dev + tests:** contract tests run in Vitest; transport/auth get
  `wrangler dev` integration smoke scripts. Add an npm script (e.g.
  `mcp:remote:dev`) and document manual verification: connect Claude Code to the
  local `wrangler dev` URL as a custom MCP server and run status → list → read →
  preview → commit → verify in the app → Undo in the app.

**Gate:** `npm run check` green; a real end-to-end commit performed against a
throwaway canvas via Claude (custom connector or Claude Code MCP), verified inside
the app, and undone cleanly. **Do not deploy to production `grovepad.app` without
the owner saying so.**

## Phase 3 — MCP Apps: the canvas inside the chat

- **Embed entry point:** a second Vite entry (e.g. `embed.html` → `src/embed/`)
  that renders a single canvas — the real `CanvasViewport` + widget renderers, not
  a re-implementation — in a reduced shell: no workspace nav, no settings, no tab
  row; the glass aesthetic stays. Honor the existing ownership rules (camera via
  public actions, etc.). Keep bundle weight in mind but do not fork renderers.
- **Session in the iframe:** the embed authenticates as the same user. Investigate
  in Phase 0 what the MCP Apps spec provides for passing auth/context into the
  iframe; if nothing usable, the embed does its own Supabase sign-in once (iframe
  storage is partitioned — a visible "sign in to Grovepad" card inside the frame is
  the acceptable fallback; never pass tokens through URLs).
- **Live state:** the embed subscribes through the existing collaboration/realtime
  machinery where the canvas has it, with cloud-document refresh as fallback, so a
  `commit_widgets` from the model appears on the canvas within a beat. Edits made
  by the user in the embed flow through the same write paths as the app (it *is*
  the app), so undo/persistence/collaboration guards all hold.
- **MCP Apps wiring on the server:** declare the UI resource and link the relevant
  tools to it exactly per the spec fields confirmed in Phase 0. Preview results
  should render *in the canvas UI* (the dashed-blueprint + Add/Dismiss pill pattern
  from `McpPreviewLayer.tsx` is the design precedent — reuse or adapt it) so the
  approve moment lives on the canvas, keeping the consume-once contract shared
  between the model's `commit_widgets` and the user's Add button.
- **Host bridge:** implement the iframe↔host messaging the spec defines (receiving
  tool results/context; sending user intents back as messages or tool calls). Keep
  the bridge in one module (`src/embed/hostBridge.ts`) with a test seam.

**Gate:** in Claude (claude.ai custom connector), a full conversation works: ask
for a plan → canvas card appears in-chat → preview renders as blueprint → user taps
Add → widgets are real → same board opens in the normal app with the same content.
`npm run check:full` green (this phase adds a production bundle entry).

## Phase 4 — Host onboarding

- **Claude:** already covered by Phases 2–3 (custom connector by URL). Write a
  short user-facing doc (`docs/remote-mcp-connector.md`) with connect steps,
  mirroring the tone of `docs/mcp-connector.md`, and cross-link both docs.
- **ChatGPT:** follow the live Apps SDK docs — developer-mode testing first, then
  (owner's call) directory submission. Expect host-specific metadata/manifest and
  design-guideline tweaks, not protocol forks; if the Apps SDK requires divergent
  behavior, isolate it behind the same server (capability detection), never a
  second server.
- **Gemini:** verify the current custom-MCP support (it was Spark-gated mid-2026);
  document what works, don't build Gemini-specific code speculatively.

## Phase 5 — Hardening and closure

- Review RLS on any new tables (previews, audit log) — deny-by-default.
- Abuse pass: oversized plans, prompt-injected tool calls attempting other users'
  canvas ids (must fail via RLS without revealing existence), replayed commits,
  expired previews. Add tests for each.
- `docs/codebase-map.md`: add/extend the MCP row(s) for every new file and owner,
  in the same change as the code (repo rule).
- Update `docs/mcp-connector.md` to name the local/remote split.
- Final `npm run check:full` + the manual smoke items touched (persistence,
  collaboration, MCP).

## Owner decision points — ask, don't guess

Stop and ask the owner (plain language, with a recommendation) when you reach:

1. **OAuth approach** (end of Phase 0) — it may require creating a Supabase OAuth
   redirect config and Worker secrets.
2. **Production deploy** of the Worker changes to grovepad.app (end of Phase 2).
3. **Anything requiring accounts/submissions outside the repo** — Cloudflare KV
   namespaces, ChatGPT developer platform, directory submissions.
4. **The curated widget subset** (present the proposed list with one-line reasons
   before locking the contract).
5. Any place where a ground rule and a host requirement conflict.

## Explicit non-goals

- No server-held AI API keys, no proxying model calls, no per-user model billing —
  the AI host's subscription does the inference. (A separate BYOK/in-app chat idea
  exists but is **not** this project.)
- No new sharing/permission semantics; no public-write canvases.
- No monetization through the chat hosts (external checkout on grovepad.app remains
  the only purchase path).
- No changes to the local stdio connector beyond, at most, adopting the shared
  widget-plan contract.
- No CRDT/merge redesign — the Worker is just another well-behaved cloud-documents
  client.

## Risks to keep in view

- **Spec drift:** MCP Apps is young; pin SDK versions, isolate protocol code so a
  spec bump is a contained change.
- **Two writers, one board:** the Worker committing while the app is open must go
  through revision continuity; test the open-app-plus-remote-commit path
  explicitly, including offline app → later reconcile.
- **Embed weight:** if the full canvas bundle is too heavy for the iframe, trim by
  code-splitting the embed entry — never by forking renderers.
- **Iframe storage partitioning** may make the fallback sign-in step mandatory;
  design the embed's signed-out state as a first-class screen, not an error.
