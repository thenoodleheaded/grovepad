# Grovepad

Grovepad is a local-first spatial canvas for connected notes, plans, decisions, and live data. Boards can branch into nested canvases, widgets can be grouped or related, and field connections can pass values between compatible widgets.

## Run locally

```bash
npm install
npm run dev
```

Production checks:

```bash
npm run check:full
```

## Project navigation

AI assistants and contributors should start with [AGENTS.md](AGENTS.md). Codex loads it directly; [CLAUDE.md](CLAUDE.md) imports the same guide for Claude Code, so the two agents share one navigation and verification contract. The guide points to the compact [codebase map](docs/codebase-map.md), which routes common task language to source owners, UX contracts, search symbols, and targeted verification. The deeper [architecture map](docs/architecture-map.md) is reserved for cross-system reasoning.

## Product architecture

- `src/store/useWidgetStore.ts` owns board entities, history, selection, relations, groups, and field-graph commands.
- `src/store/useCanvasStore.ts` owns the camera and finite view animations.
- `src/components/canvas` contains world-space render layers and viewport interaction.
- `src/components/widgets` contains the culled widget layer, cards, and widget modules.
- `src/widgets/registry.ts` is the catalog used by creation and discovery surfaces.
- `src/utils/persistence.ts` validates, migrates, and saves local/cloud board snapshots.

High-frequency pointer and camera paths are frame-batched. Offscreen widgets and lines are culled, dense views use lightweight representations, optional parsers are loaded on demand, and decorative motion is finite or interaction-scoped so an idle board stays idle.

## Optional services

The app works in guest mode without external services.

- Supabase sync/auth: set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Document-to-map import: enter an OpenAI API key in the importer or set `VITE_OPENAI_API_KEY`.

Secrets belong in `.env.local`; never commit them.
