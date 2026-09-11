# Phase 0 findings — Grovepad inside the AI chatbots

Required output of Phase 0 in `docs/remote-mcp-apps-plan.md`. Everything protocol-related
below was fetched from live documentation on 2026-08-31, not recalled — the MCP revision
this project targets post-dates the assistant's training data.

## In plain language

Grovepad can appear *inside* Claude and ChatGPT as a real, interactive canvas. Three
things make that work: a small server at `grovepad.app/mcp` that the chatbot talks to, a
sign-in step so the server acts as you, and a stripped-down Grovepad page the chatbot
shows in a frame inside the conversation.

The single biggest thing this research changed: **we do not have to build a login system.**
Supabase — which Grovepad already uses for accounts — became a full OAuth sign-in provider,
and it explicitly supports connecting AI chatbots. That deletes the most complex, most
security-sensitive part of the original plan.

## 1. Chosen server stack

`createMcpHandler` from `agents/mcp/server` (Cloudflare), wrapping an `McpServer` from
`@modelcontextprotocol/server` v2.

- Stateless Streamable HTTP, which is what MCP revision **2026-07-28** standardizes; SSE is
  deprecated for new servers.
- It takes a `route` option (default `/mcp`) and composes inside an ordinary Worker
  `fetch`, so `wrangler.toml`'s existing `[assets]` block keeps serving the site and the
  `not_found_handling = "404-page"` behavior is untouched. MCP is an added path, not a
  replacement router.
- Per-request auth arrives as `context.http?.authInfo`. The docs carry an explicit warning:
  never log or return `authInfo.token` or `authInfo.extra.props`.

## 2. OAuth approach — Supabase is the authorization server

The plan assumed the Worker would be both authorization server and resource server, with
dynamic client registration and a hand-built consent screen. The live spec plus Supabase's
current feature set make that unnecessary and wrong.

Per the 2026-07-28 authorization spec:

- An MCP server is **only** an OAuth 2.1 *resource server*. The authorization server is
  allowed to be a separate entity.
- The MCP server **MUST** implement RFC 9728 Protected Resource Metadata — that is one
  static JSON document at `/.well-known/oauth-protected-resource` naming Supabase as the
  authorization server.
- The MCP server **MUST** validate that a token's audience is itself (RFC 8707), and
  **MUST NOT** accept or forward any other token.
- Dynamic Client Registration is **deprecated**, kept only for backwards compatibility.
  Client ID Metadata Documents (CIMD) are the direction, and Anthropic and OpenAI clients
  are moving to them.

Supabase Auth now ships OAuth 2.1 server capabilities: authorization-server metadata at
`https://<project-ref>.supabase.co/.well-known/oauth-authorization-server/auth/v1`,
mandatory PKCE, JWKS for validation, dynamic client registration behind a dashboard
toggle, and a documented MCP-authentication path. Crucially the issued access token *is* a
Supabase user token, so **ground rule 3 holds by construction**: the Worker calls Supabase
as the user and RLS is the security boundary. No service-role key is ever needed.

What this means for us:

- Grovepad writes **no** authorization-server code, no consent screen, no token mapping
  table, no client registry.
- The Worker's entire auth surface is: serve protected-resource metadata, validate the
  bearer token (audience + signature via JWKS), pass it to Supabase.
- **Owner action required, outside the repo:** enable the OAuth server in the Supabase
  dashboard under Authentication > OAuth Server. Supabase's own docs warn that open
  dynamic registration lets any client register — so require user approval and validate
  redirect URIs when enabling it.

Open item to re-check before Phase 2 ships: whether Claude's connector currently prefers
CIMD over DCR against a Supabase authorization server. It changes which dashboard toggle
matters, not the architecture.

## 3. MCP Apps linkage — exact fields

Extension identifier: **`io.modelcontextprotocol/ui`**. Shipped 2026-01-26 as the first
official MCP extension; Claude and Claude Desktop are supported hosts.

- UI resources use the **`ui://`** URI scheme and MIME type **`text/html;profile=mcp-app`**.
- A tool points at its UI through **`_meta.ui.resourceUri`**; **`_meta.ui.visibility`**
  controls whether the model, the app, or both may call it.
- The resource carries **`_meta.ui.csp`** (permitted external origins),
  **`_meta.ui.permissions`** (camera, microphone, geolocation, clipboardWrite),
  **`_meta.ui.domain`** (dedicated origin) and **`_meta.ui.prefersBorder`**.
- The frame talks to the host over postMessage carrying JSON-RPC. View to host:
  `ui/initialize`, `ui/open-link`, `ui/message`, `ui/request-display-mode`,
  `ui/update-model-context`, plus core `tools/call`, `resources/read`, `ping`.
  Host to view: `ui/notifications/tool-input`, `tool-input-partial`, `tool-result`,
  `tool-cancelled`, `size-changed`, `host-context-changed`, and `ui/resource-teardown`.
- The host declares the UI ahead of time and prefetches it — HTML is never smuggled back
  inside a tool result. Rendering is a sandboxed iframe with no access to the parent.

`_meta.ui.domain` is the field to watch for Phase 3: it may let the embed run on a
Grovepad-controlled origin, which bears directly on the iframe-storage-partitioning risk
the plan flags.

## 4. Pure-module audit (measured, not assumed)

Bundled `src/utils/persistedBoardSchema.ts` for a worker target with esbuild:

| Result | Value |
| --- | --- |
| Bundles for a Worker at all | **Yes** — no DOM or IndexedDB access at module scope |
| Total bundle | **462 KB** uncompressed |
| `skinBlueprints.generated.ts` | 148 KB (largest single input) |
| lucide-react | 223 icon modules, 86 KB |
| react | 45 KB |

Verdict per module:

- `cloudDocuments.ts` — **pure.** Types only. Import directly.
- `persistedBoardSchema.ts` — **usable but heavy.** It imports the registry only for
  `widgetDefinition(type).defaultSize` (one call site, line 172). The registry is what
  drags in React and every Lucide icon, because `WidgetDefinition.icon` and
  `WidgetSkinOption.icon` are typed `LucideIcon`.
- `cloudSync.ts` — **not importable.** It pulls the browser Supabase singleton from
  `src/lib/supabase`. The Worker must construct its own per-request client; the reusable
  logic already lives in `cloudDocuments.ts`.
- `thoughtInterpreter.ts` — same weight profile as the schema (registry-bound).

**Recommendation:** do *not* refactor the registry up front. 462 KB uncompressed is far
inside Cloudflare's limit, and splitting icons out of ten widget-definition files is a
large, risky change that buys nothing the Worker needs today. Import the canonical
serializer as-is — which is what ground rule 2 demands anyway — and revisit only if bundle
size becomes a real constraint. This reverses no rule; it just declines a refactor the
evidence does not justify.

## 5. Curated widget subset — all 15 candidates verified

Every type the plan proposed exists in the live `ModuleType` union and in `MODULE_TYPES`,
and none is marked `existing-only` (the repo currently has zero such types):

`text`, `checklist`, `table`, `outline`, `bullets`, `pros_cons`, `poll`, `habit`,
`counter`, `rating`, `toggle`, `date_picker`, `timekeeper`, `bar_chart`, `metrics`

Two naming corrections against the plan's prose: the task type is **`checklist`**, and the
chart type is **`bar_chart`**. There is no `task` or `chart` type.

## 6. What did not change

The consume-once preview/commit contract, the storage contract, RLS as the boundary,
"cloud failure never breaks local work", and the existing local stdio connector all stand
exactly as written. This document narrows *how* to build Phase 2, not *what* is allowed.
