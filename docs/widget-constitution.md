# The Grovepad Widget Constitution

*Binding for every new `ModuleType` proposed for the registry. This document governs what widgets ARE; the [glass constitution](widget-glass-constitution.md) governs what they look like.*

Grovepad is a personal operating surface: an infinite spatial canvas where typed cards wire into each other through a deterministic dependency graph. Every new widget must serve that network — either as a useful node inside it, or as a self-contained tool meaningfully better than assembling the same thing from existing pieces. The registry already contains 100+ types; every new one permanently grows the picker, interpreter, field registry, renderer maps, and persistence schema. A widget that adds nothing is permanent debt.

## Article II — Consolidation or novelty

A widget must either **(A)** consolidate a domain that would otherwise need 2–3 separate cards, or **(B)** introduce behaviour that cannot be composed from existing primitives. The test is not "could you technically build this from other widgets?" but "would composing it create meaningfully worse UX?"

Fails automatically: exact duplicates with cosmetic differences, presets of existing widgets (`pomodoro` is a `timer` preset), pure decorations with no state or I/O, and renames of existing types. Ship those as presets, templates, or extensions of the existing widget.

## Article III — Wire graph citizenship

A widget must not be a dead-end by design. If it computes a total, count, status, or boolean, that value belongs in the field registry as a source port. There is no minimum field count — only the question "has every meaningful piece of computed state been exposed?"

Structural exceptions (`canvas_node`, `sketchpad`) are exempt because their value is spatial or creative, not computational. Any new exemption claim needs an equally clear purpose.

### III.1 — Inputs get the same discipline

No minimum input count; many widgets are legitimate sinks whose own UI is the input mechanism. The failure mode is a widget with an obvious, single, wire-driven action that is simply missing — most commonly "append one record from an incoming value". List-shaped widgets should expose an `add_item` command unless their record shape is genuinely ambiguous (e.g. `pros_cons` has two arrays):

```ts
{
  key: 'add_item',
  label: 'Add <thing> from wire',
  acceptsPayload: true,
  run: (data, payload) => ({
    items: [...data.items, { id: crypto.randomUUID(), label: text(payload ?? '').trim() || 'New <thing>', done: false }],
  }),
}
```

Default to a sensible non-empty label; coerce payloads with the tolerant `text()`/`num()`/`bool()` helpers so a wrong raw type never throws.

### III.2 — Payload-carrying trigger wires

`CommandDescriptor.run` receives an optional second argument: the source field's current value through the wire's transform. Commands that ignore it need no change; commands that use it set `acceptsPayload: true` so the inspector offers a payload transform.

### III.3 — Semantic unit tags (advisory, never gating)

A `FieldDescriptor` may carry `unit?: SemanticUnit` (`percent | ratio | currency | count | duration_s | date_iso | none`). It never blocks a connection — wiring stays fully promiscuous. It only prefills a new value wire's transform via `suggestTransform(fromUnit, toUnit)` in `src/types/circuit.ts` when one obviously-correct conversion exists. Atlas-family fields infer units from key naming (`*_pct`, `*_count`, …); tag new fields when a unit clearly applies, and an untagged field is not a violation.

### III.4 — Port-rail geometry

Inputs leave the left edge; outputs leave the right. Ports distribute evenly across the usable side within corner clearances; dense rails compress, never overflow or cluster. The visible dot, hover target, drop hit-test, and wire endpoint must share one pure geometry source (`src/utils/portGeometry.ts`). Port palette: number blue, boolean green, text violet, series amber, trigger rose. Hover targets may extend invisibly but never move the drawn endpoint or steal content interaction at rest.

### Field quality rules

- **Source fields must be derived** — computed, aggregated, or state-derived values, not verbatim re-exports of user-typed strings.
- **Writable fields must accept coerced values safely** and never break on the wrong type.
- **Command targets must be idempotent** — the engine may fire the same command multiple times per wave.

## Article IV — Redundancy gate

If a proposal differs from an existing widget only by default values, labels, a layout rearrangement, or removed features, extend the existing widget instead. Test: "could an experienced user achieve this by customizing an existing widget's settings?" If yes — extend, do not add.

## Article V — Actually useful

A widget must target a real, recurring friction, answerable in one sentence: "who specifically is this for, and what stops them from doing it today?" Novelty, aesthetics, or technical impressiveness are not sufficient.

## Article VI — Discoverability floor

A widget must be findable through at least one of: the thought interpreter (≥2 natural phrases), a scenario archetype recommendation, or picker search (label/description containing words users would type). The `description` is a verb-phrase of ≤10 words saying what it does.

## Article VII — Data schema hygiene

`defaultData()` must be immediately renderable, JSON-serializable, and survive persistence roundtrips:

1. No `undefined` values; `null` only for explicitly nullable fields.
2. All item IDs via `crypto.randomUUID()`.
3. Dates as ISO 8601 strings; epoch numbers only for transient runtime state.
4. No circular references.
5. Flat over nested — prefer arrays of objects to deep trees.
6. Non-empty starter content — a blank-on-creation card is bad first-impression UX.

## Article VIII — Performance contract

| Rule | Detail |
|:---|:---|
| No `backdrop-filter` | Prohibited in widget bodies — compositing layer explosion on dense canvases |
| No per-widget timers | Use `useSharedClock` for time-driven updates |
| No layout thrashing | Renderers must not read DOM geometry during render |
| Fast field getters | `get()` must not stall a 32-hop propagation wave |

## Article IX — Nomenclature

Concrete nouns, ≤3 words in `label`, ≤10 words in `description`, no "Widget"/"Card" suffix, `snake_case` type keys.

## Article X — Pack gating

Structure, Notes, Planning, Data, and Automation widgets are never gated (automation is wire-graph connective tissue). Study is ungated in v1. Life-domain and Specialist widgets are always gated behind their pack. If a widget would feel bizarre on a student's exam-prep canvas, it belongs in a pack.

## Article XI — Proposal requirements

Before code, a proposal answers: the friction (one sentence), why composing existing widgets is worse, one concrete wire story (source → target, type), the redundancy check against the nearest existing types, the `XData` interface with `defaultData()`, and the field list.

## Article XII — Registry fit check

Before merging: no type-key collision, sensible category placement, accent distinct from adjacent widgets in category, grid-aligned `defaultSize`, renderer registered in exactly one family map, fields in `fields.ts` (or `fields/expansion.ts`), registry entry in `registry.ts` (or `registry/expansion.ts`).

### Article XII.1 — Content-safe sizing and dead zones

A widget may only expose sizes at which its interface remains valid. A **dead zone** is any size where content overlaps, clips, becomes unusable, or turns mostly into empty glass. Resize logic must prevent dead zones; CSS may not merely hide their symptoms.

Five invariants are binding at every released size:

1. **No overlap or occlusion.** Islands do not intersect; a chart never paints over a sibling control.
2. **No clipping.** Every island stays inside the content backplate.
3. **Functional text stays whole.** Labels, button names, dates, currency, and status values neither ellipsize nor break inside a word. Free user prose may truncate only when the full value stays accessible.
4. **Controls remain controls.** At least a 28px hit height, and the element hit at its visual center.
5. **No decorative inflation.** A card may not grow along an axis its content cannot use; visible content should occupy roughly ≥55% of available height.

**Ownership and authority.** The registry declares a safe fallback `sizing` window (protects creation, hydration, unmounted cards). A mounted renderer reports a content-derived floor that may raise but never loosen the registry minimum. The board store is the final clamp for every resize path — gesture and programmatic resizes obey the same merged floor and ceiling. Control-only cards set `autoHeight` (width-only gesture).

**Dynamic re-flooring.** Content changes recalculate the floor immediately; a card below the new floor grows to it, a card above does not move. Shrinking is always a user action. Iconified cards retain a dormant full size that data arrival may grow; expansion rechecks it against estimates immediately and the mounted floor once present.

**One full-card composition.** Resizing within the full state changes room, not layout — no partial compact layouts. At the floor, resizing clamps to a rubber band that shows the pull and releases back to the limit; the stored size never leaves the legal window.

**The outline is the affordance.** There is no corner grip. The stretch of border nearest the pointer thickens, and both stretches do where two sides meet — that corner arming is how a diagonal, square-preserving drag is expressed. A drag moves only the sides it grabbed; the opposite sides stay pinned, so a gesture never grows a widget out of its own centre.

**Where a state change may happen.** Only from what is on screen. An opened full card resizes and never changes state — a card being worked in cannot be lost to a pull. A resting tile is sized by its content, so its gesture is state-only: a diagonal crush inward past a deliberate corner threshold on both axes turns it into an icon, and anything else is elastic. An icon is one square scaled continuously across a single grid cell — from 2×2 up to 3×3 — while a corner is held, with no live detents; only release snaps its geometry to the nearest 2×2 or 3×3 grid square. Those are sizes, never separate states. It restores the full card only on growth: a diagonal pull past the 3×3 ceiling lets go. Shrinking never escapes — a crush is not a request for the card — and pulling below 2×2 only stretches a band that clamps back. **2×2 is the floor for anything icon-shaped anywhere in the app** — the icon scale state and the bare-icon resting face share it, and no surface may render a one-cell icon: it is too small to read and too small to aim at. Every state change re-centres the new box on the box it replaced, so a round trip is exactly reversible. There is no intermediate name-pill state.

**Charts and aspect-bound visuals.** Siblings claim minimum space first; the chart gets the remaining rectangle. Radial/square-lattice visuals use the smaller remaining axis and keep aspect — never size from the whole card and cover siblings.

**Calibration gate.** For a new or materially changed renderer, test worst-case data (long functional labels, max digits, formatted dates, populated rows, one long user word). Shrink each axis until the first invariant would fail; place the fallback floor on the next 4px sub-grid step.

## Article XIII — Pencil and ink interaction

Sketchpad is the lightweight native-ink surface; Excalidraw remains the fullscreen diagram editor. Mouse and Pencil draw; fingers remain reserved for navigation and palm rejection, so Pencil contact can never unexpectedly write on the bare board.

1. Pencil and mouse may ink; touch never creates a stroke. A touch landing inside an active ink surface is rejected as a palm. Canvas pinch/pan remains available outside that surface.
2. Pointer samples use coalesced events when available, fall back when the browser returns an empty coalesced batch, and repaint at most once per animation frame. React/store state updates once per completed gesture, never per point.
3. Pressure changes visible stroke width. Completed points are simplified in x/y/pressure space before persistence, and normalized coordinates keep ink aligned through widget resizing.
4. Every draw, erase, or clear gesture owns one non-coalesced Undo step. Pointer cancel discards the entire in-progress gesture.
5. Pencil hover may show a cursor preview or the shared magnetic card response, but hover must not write React state, run an idle animation, or activate while the Pencil is touching.
6. Apple Scribble remains operating-system-owned: Pencil contact on a text entry must reach the input without first moving the card. Text controls retain text selection and the standard caret.
