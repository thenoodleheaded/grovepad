# The Grovepad Circuit Engine

**The constitution of the wiring layer — category thesis, market analysis,
architecture, semantics, UX laws, and extension guide.**

> Status: shipped. This document is normative: when code and document
> disagree, one of them is a bug and this document decides which.

---

## Part I — The category thesis

### 1. What Grovepad is now

Grovepad is a **Computational Spatial Canvas**: an infinite spatial canvas
where every card is a *live instrument* — not a note about a value, but the
value itself — and where any value can be **wired** into any other. A counter
can drive a progress bar. A finished checklist can start a timer. A button on
the canvas can run a sandboxed script whose output lands in a note. The board
is simultaneously the document, the database, and the program.

That combination does not exist elsewhere. Every neighboring product owns two
of the three ingredients and structurally cannot acquire the third:

| | Spatial freedom | Live data in cards | User-wirable computation |
|---|---|---|---|
| **Miro / FigJam / Figma canvas** | ✅ world-class | ❌ stickers are dead ink | ❌ none |
| **Obsidian Canvas / Heptabase** | ✅ | ❌ text files on a plane | ❌ none |
| **n8n / Make / Zapier Canvas** | ⚠️ graph layout, not a living space | ⚠️ data exists only during a run | ✅ but for engineers |
| **Notion / Coda** | ❌ documents, not space | ✅ formulas over tables | ⚠️ formula language, no wires, no space |
| **Grovepad** | ✅ | ✅ ~130 live widget types | ✅ drag a wire, pick a transform |

### 2. Why each competitor class is ten steps behind

**Visual backend builders (n8n, Make, Zapier Canvas).** Their graph is a
*deployment artifact*: nodes are configuration for a server-side run that
happens later, invisibly. Data flows through the graph only while a run
executes; the canvas itself is dead between runs. They are built for
integrations engineers, priced per-execution, and hostile to "daily life"
use. Grovepad's circuit is **always live**: the wire between your habit
tracker and your reward counter carries state *right now*, locally, at
60 fps, with undo. There is no "run", no execution quota, no deploy step —
the board *is* the running program. A backend builder cannot become this
without discarding its execution model; Grovepad already has webhooks, HTTP,
queues, and script blocks as canvas citizens for the cases where you do want
integration behavior.

**Spatial note-taking (Obsidian Canvas, Heptabase).** Their unit is prose.
Cards connect with meaning-lines that *humans* interpret; no arrow ever
moves data. They win at reading and thinking, and they stop there: a
Heptabase card cannot count, gate, schedule, or fire. Grovepad keeps the
thinking-canvas feel (quiet cards, relations, groups, mind-map import) and
adds a second, computational nervous system underneath — invisible until
summoned, so the note-taking experience is never taxed for the power.

**Spatial whiteboards (Miro, FigJam).** Collaboration theater at enormous
scale, but every object is pigment. The instant a workshop ends, a Miro
board starts decaying, because nothing on it is alive. Grovepad boards
*appreciate*: the dashboard you wired in January is still computing in June.

### 3. The moat, concretely

1. **The field registry** (`src/widgets/fields.ts`): ~130 widget types
   already expose typed, readable/writable fields and one-shot commands.
   Every new widget automatically becomes a circuit citizen. Competitors
   would need to retrofit typed ports onto content that was never modeled.
2. **Local-first reactive semantics**: propagation is synchronous,
   deterministic, undoable, and free. No server, no quota, no latency.
3. **The UX position**: n8n-class capability behind Heptabase-class calm.
   The engine is invisible until you hover a card or press `W`.
4. **Acquisition surface**: to a Figma/Notion/Miro acquirer, Grovepad is the
   missing third ingredient they each lack, already integrated with cloud
   sync, undo, and a 130-widget catalog.

---

## Part II — Architecture

### 4. The three graphs of Grovepad

A board now carries three orthogonal edge sets over the same widgets:

| Graph | Record | Meaning | Carries data? |
|---|---|---|---|
| Relations | `relations` | Human meaning (parent, cousin, conflict) | No |
| Dependencies | `relations` with `type: 'blocker'` | Scheduling truth: X before Y (critical path, blocked-state dimming) | No |
| **Circuit** | `connections` | **Machine behavior: values flow, events fire** | **Yes** |

They deliberately do not merge. A dependency says *"the essay blocks the
submission"*; a wire says *"the essay's word count IS the progress bar's
value"*. Different verbs, different lines, different physics.

### 5. Data model (`src/types/circuit.ts`)

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

- **Value wire** — a live binding. Source field changes → value passes
  through the transform → written into the target field. The target's
  setter coerces types (the registry's `num`/`text`/`bool` tolerance), so a
  boolean can feed a counter and a number can feed a note.
- **Trigger wire** — an event edge. The engine watches the source field and
  fires a command (`reset`, `increment`, `check_all`, `execute`, …) when the
  configured edge occurs. First observation is always a baseline, never a
  fire. The command receives the source's current (transformed) value as an
  optional second argument — `CommandDescriptor.run(data, payload?)` — so a
  single wire can both fire an action and hand it something to act on (e.g.
  `text_input.value → checklist.add_item` appends one task per wire, no
  staging field required). Commands that don't read `payload` are unaffected;
  ones that do set `acceptsPayload: true` so the wire inspector offers a
  transform for the payload, not just for value wires.

**Transforms** are the no-code computation layer riding on value wires (and,
via the payload above, on trigger wires whose command wants one):
`identity · scale · offset · clamp · map_range · round · invert · threshold
· format`. Each is total — never throws, never emits NaN/Infinity
(`src/engine/transforms.ts`). Anything heavier belongs in a **Script Block**
widget wired inline (sandboxed Web Worker, hard timeout), which is the
power-user escape hatch by design: wires stay auditable at a glance, scripts
are explicit boxes on the board.

**Semantic unit tags** ride on top of `FieldValueType`, purely advisory:
`FieldDescriptor.unit?: 'percent' | 'ratio' | 'currency' | 'count' |
'duration_s' | 'date_iso' | 'none'`. They never gate a connection — the
patchbay stays fully promiscuous — but the instant a value wire connects two
tagged ports, `suggestTransform(fromUnit, toUnit)` prefills the new
connection's transform instead of defaulting to identity (a `ratio` output
into a `percent` input arrives pre-scaled by 100). The matrix only covers
pairs with one obviously-correct answer; an unmatched pair gets no
suggestion, never a wrong one. See `docs/widget-constitution.md` Article
III.1–III.3 for the full reasoning and the `add_item` widget recipe this
unlocked.

**Connections are structural board state.** They persist in the v2 board
payload, sync through Supabase, participate in undo snapshots, clone with
`duplicateWidgets` (a wired cluster duplicates as a working circuit), and
cascade-delete with their endpoints. Untrusted payloads pass
`isValidConnectionShape` plus endpoint-existence checks before loading.

### 6. The four laws of propagation (`src/engine/circuitEngine.ts`)

The previous wiring engine died of half-bakedness, so the rebuild is
organized around four laws that make every hard case boring:

1. **SINGLE FIRE.** Within one wave, each connection delivers at most once.
   A wave therefore terminates in ≤ |connections| firings — cycles included —
   with no graph analysis, no topological sort, no special cases.
2. **CHANGE ONLY.** A connection fires only when its transformed source
   value differs from the last value it delivered (per-connection delivery
   memory). Stable circuits reach a fixpoint and go completely silent;
   re-running a wave over unchanged state is a no-op *by construction*.
3. **BATCHED COMMIT.** All writes of a wave land in **one** store update
   (`applyWireWrites`) with **no undo entry**. Deliveries are consequences
   of the edit that seeded the wave, so a single ⌘Z rewinds cause and
   effects together. (Verified live: undo of a counter edit also rewinds the
   progress bar it fed; redo restores both; no oscillation.)
4. **LOOP DAMPING.** Genuinely oscillating circuits (A increments B, B
   increments A) may ring for a bounded burst (`BURST_LIMIT = 24` waves),
   then the wires that fired last are *damped*: silenced, flagged red in the
   UI with a re-arm affordance, and announced with a toast. A wiring mistake
   can never freeze the canvas. Editing any wire clears damping — the user
   is fixing it.

**Additional invariants:**

- **Single-writer rule.** A target field accepts at most one incoming value
  wire; drawing a second one replaces the first. This is what makes
  propagation deterministic — no last-writer-wins races, ever. (Trigger
  wires may fan in; commands commute sanely.)
- **Baseline on load.** At startup and board load, delivery memory is
  initialized to current values *without firing*. A reload never replays
  triggers or clobbers data. Heuristic: `widgets` and `connections` changing
  in the same tick = load/undo → baseline; `connections` alone = the user
  drew a wire → deliver immediately (instant feedback).
- **Immediate delivery on creation.** A new value wire syncs its target the
  moment it's drawn. The circuit teaches itself.

**The driver** is a flattened loop over a Zustand subscription: the engine's
own batched commit re-notifies the subscription, a re-entry guard bounces
it, and the loop picks up the new state on its next pass — no recursion, no
timers, no missed changes. Change detection compares `widget.data`
references *only for widgets that have outgoing wires* (O(sources), not
O(widgets)); a board with zero connections pays two pointer comparisons per
store change. Time-sensitive source fields (countdowns, due dates) re-read
on a 30 s visibility-aware heartbeat that exits immediately when no such
wires exist.

### 7. Automation Core widgets as engine citizens

The 49 automation shells (loop, queue, state machine, webhook, script block,
widget creator, …) share one envelope (`AutomationCoreData`) with `input`,
`output`, `enabled`, `running`, `count`, `last_error` as wireable fields.
The async half lives in `src/engine/automationExecutor.ts` — **store level,
not component level** — so a trigger wire can execute a widget that is
scrolled offscreen, culled, or on another canvas. The Execute button calls
the same function; manual and wired runs are indistinguishable.

A trigger wire carrying `execute` into an automation widget routes to the
executor instead of the pure passthrough command. Async results write back
through `applyWireWrites`, re-entering propagation — so chains compose:

```
Manual Trigger ──count/change──▶ Script Block ──output──▶ Notes
                                (Web Worker, 3 s timeout)
```

Executor guarantees: per-widget in-flight lock (no concurrent
self-execution), disabled widgets are inert, stateful types (queue, stack,
mutex, approval gate) map Execute onto their pure commands.

### 8. Persistence, sync, undo

- `PersistedBoard.connections` — absent in older boards, parses to `{}`;
  strictly validated on load (shape, endpoint existence).
- History snapshots carry `connections` by reference — an undo step costs
  pointers, following the existing snapshot discipline.
- Cloud sync inherits everything: the board diff/conflict flow compares the
  full snapshot, connections included.
- Cascades: widget delete, workspace delete, canvas-branch delete, and
  board-load validation all drop wires whose endpoints vanished.

---

## Part III — The UX laws

### 9. Quiet by default, summoned by intent

The engine must never tax the note-taking experience:

- **Rest state: zero pixels, zero cost.** Port rails don't mount at all
  until a card is hovered, a wire drag is in flight, or Circuit Mode is on.
- **Hover a card** → its ports fade in. Right rail = outputs (everything
  readable), left rail = inputs (settable fields as circles, commands as
  rose diamonds). Geometry is pure math over widget state
  (`src/utils/portGeometry.ts`) — the rail overlay, wire layer, and drop
  hit-testing share it, so a wire always lands exactly on its dot, at any
  zoom, with no DOM measurement.
- **Drag from an output port** → a live ghost wire follows the cursor;
  compatible input ports glow as you pass. Drop on a port to bind it; drop
  anywhere on a card to get the **field picker** ("Set a value / Trigger an
  action"); drop on canvas to cancel.
- **`W` / toolbar ⚡ = Circuit Mode.** The whole live graph illuminates:
  all ports labeled, wires at full strength, live value chips at wire
  midpoints, cards slightly desaturated. The same board, seen as its engine
  room.

### 10. The color language

One hue per value flavor, shared by ports, wires, chips, and the inspector:

| Signal | Color |
|---|---|
| number | sky `#38bdf8` |
| boolean | emerald `#34d399` |
| text | violet `#c084fc` |
| series | amber `#fbbf24` |
| trigger/event | rose `#fb7185`, dashed |
| disabled wire | gray, dotted |
| damped wire | red + `!` chip |

Deliveries render as a one-shot bright dash sweeping source → target
(900 ms, `gp-wire-fire`), keyed by fire timestamp — the circuit visibly
*thinks*. All animation is one-shot or hover-scoped; idle canvases animate
nothing (`prefers-reduced-motion` honored throughout).

### 11. The wire inspector

Click any wire: a popover shows `Source·Field → Target·Field`, the kind, a
transform picker with inline parameters (value wires), an edge picker
(trigger wires), enable/disable, delete, and — when the loop breaker has
tripped — the damping notice with one-tap re-arm.

### 12. Performance guarantees

The canvas's perf discipline (quantized culling, far-zoom LOD, no idle
animation) extends to the circuit:

- Wire layer uses the same quantized-view culling and corridor tests as
  relation/dependency lines, with a render budget before viewport-only
  culling kicks in.
- Port rails render only for hovered/dragging/circuit-mode cards; per-card
  Zustand selectors return primitives so a wire drag re-renders two cards,
  not two hundred.
- Engine cost is O(changed connected sources); value chips render only in
  Circuit Mode under an edge budget.

---

## Part IV — Reference

### 13. Circuit cookbook

| Circuit | Wiring |
|---|---|
| Habit fuel gauge | `habit.streak ──map_range(0..7 → 0..100)──▶ progress.percent` |
| Reward gate | `checklist.all_done ──rising──▶ timer.reset` |
| Daily reset button | `manual_trigger.count ──change──▶ checklist.uncheck_all` |
| Study dashboard | `study_goal.percent ──▶ metrics.value_1`, `grade_calc.passing ──▶ toggle.value` |
| Scripted pipeline | `manual_trigger ──execute──▶ script_block ──output──▶ notes.text` |
| API monitor | `clock/manual ──execute──▶ http_request ──output──▶ code.code` |
| Deadline lamp | `date_picker.is_due ──▶ toggle.value` (re-checked on the heartbeat) |
| Kanban → burndown | `kanban.done_count ──▶ line_chart` via `metrics` |

### 14. Extending the engine

**New widget = automatic citizen.** Add field descriptors (and optionally
commands) to the registry; ports, wires, picker, persistence, and engine all
follow. Rules: getters fast and total; setters tolerant (coerce, clamp);
derived fields omit `set` (source-only); wall-clock fields get
`timeSensitive: true`.

**New transform**: extend the `WireTransform` union, `defaultTransform`,
labels/hints, `applyTransform`, `isValidTransform`, one test. Keep it total.

**Invariants that must survive any change** (enforced by
`src/engine/circuitEngine.test.ts` and `src/store/connectionLifecycle.test.ts`):

1. A wave over unchanged state writes nothing.
2. Each connection fires ≤ once per wave; cycles terminate.
3. Baseline mode never writes and never fires triggers.
4. One incoming value wire per target field.
5. Deleting a widget deletes its wires; undo restores both.
6. Transforms never emit NaN/Infinity.
7. Engine writes never create undo entries.

### 15. Roadmap seams (designed for, not built)

- **Wire-through-group ports**: aggregate rails on group plates.
- **Cross-canvas wires**: `canvas_node` widgets proxying inner fields
  upward — circuits as reusable "chips" (the subroutine widget's destiny).
- **Circuit templates**: the cookbook as one-tap instantiations via
  `template_instantiator`.
- **AI wiring**: the local interpreter already builds widgets from prose;
  teaching it `connections` turns "make the checklist reset every morning
  and light the lamp when I'm done" into a wired circuit. This is the
  moment the moat becomes generational.

---

*This engine was rebuilt correctness-first after its predecessor was removed
for half-bakedness. The four laws in §6 are the reason the failure modes of
v1 — stale values, runaway loops, broken undo — are now structurally
impossible rather than carefully avoided.*
