# The Widget Glass — Material Constitution (Articles XIII–XIX)

*Companion to [widget-constitution.md](widget-constitution.md), which governs what widgets ARE. This document governs what widgets LOOK LIKE. Binding for every essential (non-pack) widget renderer and for the focus-mode rearrangement system.*

## Article XIII — One backplate, three elevations

A standalone widget is exactly **one piece of glass** — the backplate — in the finalized shape of its panel arrangement, tinted with a whisper of the widget's accent. A group is the deliberate composition exception: the group owns one shared E0 backplate and each member widget becomes an E1 island without its private E0 glass. Flat full-card content is thereby wrapped by the member's E1 surface; existing member islands step down to wells. Everything else is either raised on the active backplate or cut into it. Three elevations exist; there is no fourth.

| Elevation | Name | Role | Material |
|:---|:---|:---|:---|
| **E0** | Backplate | The widget's single glass plate | Existing `gp-glass` recipe; accent bloom at ~9% mix top-left; the only border; the only shadow cast to canvas |
| **E1** | Island | A content group, raised on the backplate. The unit focus mode rearranges. | Lighter fill (white 5% → 2.4% vertical gradient), 1px top catch-light, soft contact shadow. **No full border.** |
| **E−1** | Well | Sunken screen for *displayed* values (statuses, computed numbers, readouts) | Inset top shadow, faint bottom lip-light, no outer shadow. Displayed values may use deep wells; editable controls borrow the single surface of their containing field island. |

**The nesting law:** a well may sit inside an island; an island may **never** sit inside an island. One material step per nesting level.

**Repealed:** full hairline borders on interior surfaces, per-panel glass gradients, connector lines at rest, corner brackets, dashed shells, `background: none` on panelized cards.

### Recipes (dark)

```css
/* E0 — backplate (accent-infused gp-glass, unchanged in spirit) */
.gp-backplate {
  border-radius: var(--gp-r0);            /* 22px */
  padding: var(--gp-p0);                  /* 12px */
  border: 1px solid rgba(255,255,255,.085);
  background:
    radial-gradient(120% 85% at 12% -4%, color-mix(in oklab, var(--gp-widget-accent), transparent 91%), transparent 56%),
    radial-gradient(130% 100% at 14% 0%, oklch(100% 0 0 / .10), transparent 52%),
    linear-gradient(to bottom, oklch(100% 0 0 / .06), transparent 9%),
    radial-gradient(95% 65% at 90% 104%, color-mix(in oklab, var(--gp-widget-accent), transparent 94%), transparent 62%),
    linear-gradient(160deg, oklch(23.5% .006 250 / .97), oklch(11% .005 250 / .985));
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.08),
    0 30px 70px rgb(0 0 0 / .5),
    0 4px 14px rgb(0 0 0 / .3);
}

/* E1 — island */
.gp-island {
  border-radius: var(--gp-r1);            /* 10px = r0 − p0 */
  padding: var(--gp-p1);                  /* 12px */
  background: linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.024));
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.07),
    inset 0 0 0 1px rgba(255,255,255,.026),
    0 2px 4px rgb(0 0 0 / .24),
    0 10px 22px rgb(0 0 0 / .16);
}

/* E−1 — display well */
.gp-well {
  border-radius: var(--gp-r2);            /* 8px */
  background: rgba(6,8,7,.72);
  box-shadow:
    inset 0 1.5px 3px rgb(0 0 0 / .5),
    inset 0 -1px 0 rgba(255,255,255,.04),
    0 1px 0 rgba(255,255,255,.045);       /* bottom lip catch-light */
}

/* Editable field — the island owns all visible paint */
.gp-field-island {
  outline: 1px solid rgba(255,255,255,.10);
}
.gp-field-island:focus-within {
  outline-color: var(--gp-widget-accent);
}
.gp-field-island :is(input, textarea, select) {
  border: 0;
  background: transparent;
  box-shadow: none;
}
```

---

## Article XIV — Concentric geometry

Nested corners share a center point. One subtraction, applied recursively, with a floor:

```
r_child = max(r_parent − gap, 8)
```

| Token | Value | Derivation | Applies to |
|:---|:---|:---|:---|
| `--gp-r0` | 22px | chosen once | backplate, title-capsule ends |
| `--gp-p0` | 12px | chosen once | backplate padding |
| `--gp-r1` | 10px | r0 − p0 | islands, island-level buttons (e.g. "Add row") |
| `--gp-p1` | 12px | = p0 | island padding |
| `--gp-r2` | 8px | max(r1 − p1, 8) | wells, inputs, chips, keys |
| island gap | 8px | 0.2 grid cell | seams between islands (reads as engraving over one backplate) |
| min island | 32px | 0.8 grid cell | unchanged |

Nobody ever picks a radius again — the formula does.

---

## Article XV — One light source

Light enters from the **top-left, always**.

- Backplate: specular bloom at 14% / 0%, `inset 0 1px 0` white 8%.
- Raised (E1): `inset 0 1px 0` white 7%, contact shadow below.
- Sunken (E−1): inverted — inset **top** shadow, 1px light lip below the bottom edge.
- No surface may carry both a top highlight and a top inset shadow. If you cannot say whether a surface is raised or sunken, it is neither — flatten it into its parent.

---

## Article XVI — Accent restraint

At rest the accent appears in exactly three places:

1. The backplate tint (felt, not seen — ~9% mix).
2. The signature hairline along the top edge (the existing `::before` gradient, opacity ~.38).
3. **At most one hero element** — the number or status that is the widget's reason to exist.

Interaction is where the accent spends itself: focus rings, checked states, progress fills, live pulse dots. Because the resting card is quiet, the accent means something when it appears.

---

## Article XVII — Type hierarchy

Labels move **out of the boxes** and onto the island surface, above what they describe, left-aligned, one size, one weight, everywhere.

| Role | Spec |
|:---|:---|
| Label | 9.5px / 600 / +8.5% tracking / uppercase / ink 42% — above its control, never inside |
| Value | 16px / 600 / `tabular-nums` / ink 100% |
| Hero | 27px / 650 / −3% tracking / accent / **one per widget** / unit in 11.5px muted |
| Body & control text | 13px / 500 / ink 90% |

---

## Article XVIII — Focus mode: the laws of rearrangement

*Implemented 2026-07-14: double-clicking an expanded card enters focus mode
(`useFocusStore` / `FocusModeLayer`). Arrangements persist per widget in
`metadata.islandLayout` and apply to the resting card.*

Focus mode is where islands become modular: enter it on a single widget and its islands unlock for rearranging and per-island scaling.

The focused session has two explicit purposes. **Edit** leaves the renderer's
real controls interactive while the camera and the rest of the board lock;
**Arrange** exposes the island reorder and resize chrome described below. A
touch or Pencil press on a widget control enters Edit automatically. A flat
widget with no material islands also opens Edit from its focus gesture because
it has nothing legal to arrange. The session toolbar can switch purposes and
always offers an explicit Done action.

0. **The camera is pinned.** Entering focus glides the camera to frame the subject (96px margin) and locks it — no pan, no zoom, no card drags, no card resize — until exit. Escape or a single click anywhere outside the card exits, restoring the exact camera the user left. Everything that is not the subject dims to ~32% and goes inert.
   During Edit on a phone or tablet, framing uses the live `visualViewport`,
   follows the finite software-keyboard animation, and keeps the whole subject
   inside the unobscured region. Editable controls use a 16px floor there so
   iOS never performs an independent page zoom.
1. **Islands are the atoms.** Only islands move and scale. Wells, inputs, and labels reflow inside their island; text never scales — layout does.
2. **The 4px sub-grid governs.** Island size snaps to a 4px lattice. Gaps between islands are exactly 8px, always.
3. **Reordering is a flow operation, not free placement.** An island drags to a new slot among its siblings; the flow re-packs around it. Each parent is its own flow domain: rows may reorder with rows, and summary plates with summary plates, but an island never jumps across a semantic wrapper or tears a grid apart. A lone island has no reorder affordance. (Free-form XY placement with hull re-forming remains the v2 ambition; slot reordering is the shipped v1 because it can never produce an illegal arrangement.)
4. **No overlap, no orphaning.** Islands never overlap and never leave the backplate. If a resize makes the content taller than the card, the card grows (grid-snapped) — content is never clipped by its own arrangement.
5. **Size floors and ceilings are hard.** See the sizing charter (XVIII.1). Below its floor an island refuses; above its ceiling it refuses. Nothing squashes, nothing inflates past usefulness.
6. **Edit chrome lives only here.** Reorder grips and resize brackets exist only inside focus mode. The resting widget shows content and nothing else. **Panel connector lines are repealed entirely** — at rest, on hover, on selection, and in focus mode alike; the 8px seam over one shared backplate is the only ligature islands need.

### Article XVIII.1 — The island sizing charter

Not every island may be scaled, and none may be scaled arbitrarily. Every island belongs to exactly one of four behavior classes, declared by the renderer via `data-island-size` (default `free`):

| Class | May resize | Who belongs here | Why |
|:---|:---|:---|:---|
| `free` | Width and height, independently | Lists, notes, logs, tables, form stacks, text wells | Their content reflows in both axes; more room genuinely shows more content. |
| `width` | Width only | Control strips, button rows, input rows, single-line readouts | Their height is the control's height — stretching it vertically manufactures dead glass. Width still matters for cramped labels. |
| `aspect` | Proportionally, ratio locked | Pie/radar charts, calendar month grids, mood grids, sketch surfaces, any radial or square-lattice visual | A stretched circle is a lie. Geometry that encodes meaning in its proportions must scale as a photograph does, never as a textarea does. |
| `fixed` | Not at all | **Paired-outcome controls** (True/False gates, Approve/Reject), hero readouts, status strips | See the symmetry rule below. |

**The symmetry rule.** Any island whose meaning depends on *visual equality between alternatives* is `fixed`. A True button rendered twice the size of its False twin is not a layout choice — it is a thumb on the scale, an implied recommendation the widget has no business making. Paired outcomes stay pixel-identical siblings forever; if one could be enlarged the pair would need enlarging together, and that is just the parent island resizing, which is what actually happens.

**The floors and ceilings** (defaults; renderers tighten them with
`data-island-min-w/-min-h/-max-w/-max-h` from their real content contract):

| Bound | Value | Rationale |
|:---|:---|:---|
| min height | 32px | 0.8 grid cell — one readable control line; below this content squashes |
| min width | 64px absolute; content-derived in practice | The absolute floor supports compact numeric controls. Labels, selects, dates, and prose must declare the larger width their unbreakable content needs. |
| max width | the island's container | an island never escapes the backplate |
| max height | 420px | past this an island stops being a panel and starts being a monopoly; scroll inside instead |

**Clamp behavior:** a drag past a bound stops at the bound. There is no elastic overshoot or state transition; the handle simply refuses, which is how the user learns where the edge is.

**Composition beats an individual clamp.** Satisfying every island's own bounds
is insufficient if the assembled card overlaps or clips. After applying saved
sizes, the focus layer checks all outer island rectangles against the live
content box and one another. It first clamps a stale size to the current parent;
if the composition is still invalid, it drops the saved sizes and restores the
renderer's natural flow. No persisted preference outranks operability.

**Persistence:** order and per-island sizes save to `metadata.islandLayout`, keyed by `data-island` id (slot index fallback). They undo/redo as one history step per gesture, sync with the board, and survive reload. Saved sizes are revalidated whenever the card or its content box changes size, not only on focus entry. A widget the user never rearranged renders byte-identically to a fresh one — the flow container is only promoted to an ordered flex column after the first real reorder.

### Article XVIII.2 — Whole-card size charters

The island charter and the whole-card charter are one system. Registry windows
are the off-screen fallback; the mounted renderer composes a stricter live
floor from reflowing text, rows/lists, rigid grids, and controls. Complete text
width is measured before ellipsis. The store merges that floor into every
resize path. Content changes can grow a card on either axis but never
auto-shrink it. Control-only widgets are `autoHeight` and expose no meaningless
vertical resize. Radial charts remain aspect-locked after siblings reserve
their minima. Whole-card resizing clamps cleanly at the live floor. Crossing
both width and height floors by the state threshold commits one neighbouring
full/pill/icon state per gesture; single-axis movement and maximum-bound
overscale never collapse the card. Expansion restores and revalidates the
dormant full size. The invariants and calibration procedure live in Article
XII.1 of the widget constitution.

---

## Article XIX — Chrome discipline

*Ratified 2026-07-16, after an audit found double-glassed buttons, per-cell table glass, auto-glassed lone text fields, glassed chart readouts, and cursor flicker from invisible-but-hit-testable hover chrome.*

**No shared corners.** Two nested rounded elements never touch or overlap at a corner. A child's inset from its parent's edge must be at least the parent's radius; an icon badge, chip, or control sitting at a card or island's corner clears the curve with real padding, never flush geometry. This is Article XIV's concentric formula applied to content, not only to material layers.

**No solo-button islands.** A `WidgetPanel`/`.gp-subpanel` that wraps nothing but a single action (an "Add row" footer, a lone icon button) is deleted, not styled. The button renders directly in the parent's flow with no glass backing — text/icon plus a hover color change is the whole affordance.

**No double-island buttons.** A button that already sits inside a well or island never *also* paints its own background, border, or shadow. If both exist today, remove both: the button becomes a ghost (no fill at rest, a subtle hover/focus tint, identical hit area) and the wrapper stops manufacturing a second surface beneath it.

**Icon containment.** Every icon glyph and icon-badge chip stays fully inside its island's padding box at every supported size. An icon is never clipped by, nor made to overlap, a rounded corner it shares an ancestor with.

**Hover-revealed chrome is invisible *and* inert at rest.** Any element that fades in via `opacity` on hover/focus (a row delete icon, a floating card action) sets `pointer-events: none` until the revealing state is active, then `pointer-events: auto`. An invisible element that still accepts pointer events is exactly what makes the OS cursor flicker between icons as the pointer crosses its hit-box — this is a correctness bug, not a style nit, everywhere it appears.

**A table is one island.** Its cells are divider-separated regions of that single surface — hairlines between them, never independent glass panes per cell or per row.

**A lone full-card text control has no second island.** A standalone widget whose entire body is one textarea (Notes, Quote, a single-field composer) sits directly on the card's own backplate. When grouped, the widget shell itself becomes the one E1 island around that flat content; it never manufactures a nested E1 surface. The auto-detected "field island" treatment is for a control embedded among other content, not for a control that *is* the content.

**Charts and other visual/graph info panels stay flat.** Bar tracks, pie discs, plot lines, and their summary readouts never carry the standard glass elevation — no gradient fill, no lift shadow, no auto-radius. A hairline divider or the chart's own deliberate paint (a grid, an axis) is not glass and stays.

**The detach-from-group control lives in the title row**, in the same button cluster as favorite and lock — not as a separate floating button elsewhere on the card.

## Implementation notes

`WidgetPanel.tsx` is the Island component (E1 material, declared `data-island` id, reflow container). Focus mode operates on `.gp-island` elements annotated with `data-island` + `data-island-size`. GroupPlate is one `.gp-glass.gp-backplate` surface carved by `clip-path` to the **union silhouette** of member hover footprints (each card contributes half a cell above for its title row, always, and half a cell right for its button cluster *only when that cluster overflows the title row* — the same margins and the same overflow test (`widgetHasButtonOverflow`) as WidgetCard's own hover catch-all; geometry in `groupGeometry.ts`/`groupOutline.ts`). Corners round per Article XIV; interior holes fill solid; disjoint members render as separate glass islands of the same single plate. The repealed elastic convex hull stays repealed — the silhouette is the exact rectilinear union, never a stretchy wrap. Depth comes from silhouette-following `drop-shadow` filters and a stroke-only SVG hairline; glass paint itself remains CSS. The grab surface is clipped to the same silhouette, so concave notches hit-test as canvas. The group name pill carries the same action-button cluster as a widget's title row (favorite/duplicate/markdown/delete), scoped to every member at once. Performance contract: zero `backdrop-filter` and all static paint.
