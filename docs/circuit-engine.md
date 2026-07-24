# The Grovepad Circuit Engine

**The constitution of the wiring layer — architecture, semantics, UX laws, and extension guide.**

> Status: shipped. This document is normative: when code and document disagree, one of them is a bug and this document decides which.

## The three graphs of Grovepad

A board carries three orthogonal edge sets over the same widgets:

| Graph | Record | Meaning | Carries data? |
|---|---|---|---|
| Relations | `relations` | Human meaning (parent, cousin, conflict) | No |
| Dependencies | `relations` with `type: 'blocker'` | Scheduling truth: X before Y | No |
| **Circuit** | `connections` | **Machine behavior: values flow, events fire** | **Yes** |

They deliberately do not merge. A dependency says *"the essay blocks the submission"*; a wire says *"the essay's word count IS the progress bar's value"*. Different verbs, different lines, different physics.

## Data model (`src/types/circuit.ts`)

```ts
interface Connection {
  id: string
  fromId: string        // source widget
  fromField: string     // readable field key in its registry
  toId: string          // target widget
  kind: 'value' | 'trigger'
  toField?: string      // value wires: settable target field
  command?: FieldCommand// trigger wires: one-shot command to run
  edge?: 'rising' | 'falling' | 'change'
  transform?: WireTransform
  enabled: boolean
}
```

- **Value wire** — a live binding. Source change → transform → written into the target field. The target's setter coerces types (`num`/`text`/`bool` tolerance), so a boolean can feed a counter and a number can feed a note.
- **Trigger wire** — an event edge. The engine watches the source field and fires a command when the configured edge occurs. First observation is always a baseline, never a fire. The command receives the source's current transformed value as an optional second argument (`CommandDescriptor.run(data, payload?)`), so one wire can both fire an action and hand it data. Commands that read the payload set `acceptsPayload: true` so the inspector offers a payload transform.

**Transforms** (`src/engine/transforms.ts`) are the no-code computation layer: `identity · scale · offset · clamp · map_range · round · invert · threshold · format`. Each is total — never throws, never emits NaN/Infinity. Anything heavier belongs in a Script Block widget (sandboxed Web Worker, hard timeout) — wires stay auditable at a glance, scripts are explicit boxes on the board.

**Semantic unit tags** are advisory only; see widget constitution Article III.3. They never gate a connection — they only prefill a new wire's transform when one obviously-correct conversion exists.

**Connections are structural board state.** They persist in the v2 payload, sync through Supabase, participate in undo snapshots, clone with `duplicateWidgets`, and cascade-delete with their endpoints. Untrusted payloads pass `isValidConnectionShape` plus endpoint-existence checks before loading.

## The four laws of propagation (`src/engine/circuitEngine.ts`)

1. **SINGLE FIRE.** Within one wave, each connection delivers at most once. A wave terminates in ≤ |connections| firings — cycles included — with no graph analysis or topological sort.
2. **CHANGE ONLY.** A connection fires only when its transformed source value differs from the last value it delivered (per-connection delivery memory). Stable circuits reach a fixpoint and go silent; re-running a wave over unchanged state is a no-op by construction.
3. **BATCHED COMMIT.** All writes of a wave land in one store update (`applyWireWrites`) with no undo entry. Deliveries are consequences of the edit that seeded the wave, so a single ⌘Z rewinds cause and effects together.
4. **LOOP DAMPING.** Oscillating circuits may ring for a bounded burst (24 waves), then the wires that fired last are damped: silenced, flagged red with a re-arm affordance, announced with a toast. A wiring mistake can never freeze the canvas. Editing any wire clears damping.

**Additional invariants:**

- **Single-writer rule.** A target field accepts at most one incoming value wire; drawing a second replaces the first. Trigger wires may fan in.
- **Baseline on load.** At startup/board load, delivery memory initializes to current values *without firing*. Heuristic: `widgets` and `connections` changing in the same tick = load/undo → baseline; `connections` alone = user drew a wire → deliver immediately.
- **Immediate delivery on creation.** A new value wire syncs its target the moment it's drawn.

**The driver** is a flattened loop over a Zustand subscription: the engine's own batched commit re-notifies the subscription, a re-entry guard bounces it, and the loop picks up new state on its next pass — no recursion, no timers. Change detection compares `widget.data` references only for widgets with outgoing wires (O(sources)); a board with zero connections pays two pointer comparisons per store change. Time-sensitive source fields re-read on a 30 s visibility-aware heartbeat that exits when no such wires exist.

## Automation Core widgets as engine citizens

The automation shells (loop, queue, state machine, webhook, script block, widget creator, …) share one envelope (`AutomationCoreData`) with `input`, `output`, `enabled`, `running`, `count`, `last_error` as wireable fields. The async half lives in `src/engine/automationExecutor.ts` — store level, not component level — so a trigger wire can execute a widget that is offscreen, culled, or on another canvas. The Execute button calls the same function; manual and wired runs are indistinguishable.

A trigger wire carrying `execute` into an automation widget routes to the executor. Async results write back through `applyWireWrites`, re-entering propagation, so chains compose. Executor guarantees: per-widget in-flight lock, disabled widgets are inert, stateful types map Execute onto their pure commands.

## Persistence, sync, undo

- `PersistedBoard.connections` — absent in older boards, parses to `{}`; strictly validated on load.
- History snapshots carry `connections` by reference — an undo step costs pointers.
- Cloud sync compares the full snapshot, connections included.
- Widget delete, workspace delete, canvas-branch delete, and board-load validation all drop wires whose endpoints vanished.

## UX laws

**Quiet by default, summoned by intent.** The engine must never tax the note-taking experience:

- **Rest state: zero pixels, zero cost.** Port rails don't mount until a card is hovered, a wire drag is in flight, or Circuit Mode is on.
- **Hover a card** → ports fade in. Right rail = outputs, left rail = inputs (settable fields as circles, commands as rose diamonds). Geometry is pure math (`src/utils/portGeometry.ts`) shared by rail, wire layer, and drop hit-testing — a wire always lands exactly on its dot, at any zoom, with no DOM measurement.
- **Drag from an output** → live ghost wire; compatible inputs glow. Drop on a port to bind; drop on a card for the field picker; drop on canvas to cancel.
- **`W` / toolbar ⚡ = Circuit Mode.** The live graph illuminates: ports labeled, wires at full strength, live value chips at midpoints, cards slightly desaturated.

**Color language** — one hue per value flavor, shared by ports, wires, chips, inspector: number sky `#38bdf8`, boolean emerald `#34d399`, text violet `#c084fc`, series amber `#fbbf24`, trigger rose `#fb7185` dashed, disabled gray dotted, damped red + `!` chip. Deliveries render as a one-shot bright dash sweeping source → target (900 ms, keyed by fire timestamp). All animation is one-shot or hover-scoped; idle canvases animate nothing; `prefers-reduced-motion` honored throughout.

**Wire inspector** — click any wire: `Source·Field → Target·Field`, kind, transform picker with inline parameters (value wires), edge picker (trigger wires), enable/disable, delete, and the damping notice with one-tap re-arm.

**Performance** — every wire on the active canvas renders; port rails render only for hovered/dragging/circuit-mode cards; engine cost is O(changed connected sources); value chips render only in Circuit Mode under an edge budget.

## Extending the engine

**New widget = automatic citizen.** Add field descriptors (and optionally commands) to the registry; ports, wires, picker, persistence, and engine all follow. Rules: getters fast and total; setters tolerant (coerce, clamp); derived fields omit `set`; wall-clock fields get `timeSensitive: true`.

**New transform:** extend the `WireTransform` union, `defaultTransform`, labels/hints, `applyTransform`, `isValidTransform`, one test. Keep it total.

**Invariants that must survive any change** (enforced by `circuitEngine.test.ts` and `connectionLifecycle.test.ts`):

1. A wave over unchanged state writes nothing.
2. Each connection fires ≤ once per wave; cycles terminate.
3. Baseline mode never writes and never fires triggers.
4. One incoming value wire per target field.
5. Deleting a widget deletes its wires; undo restores both.
6. Transforms never emit NaN/Infinity.
7. Engine writes never create undo entries.
