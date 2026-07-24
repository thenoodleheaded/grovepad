# The Widget Glass — Material Constitution (Articles XIII–XIX)

*Companion to [widget-constitution.md](widget-constitution.md), which governs what widgets ARE. This document governs what widgets LOOK LIKE. Binding for every essential (non-pack) widget renderer.*

## Article XIII — One backplate, three elevations

Every widget is exactly **one piece of glass** — the backplate — in the finalized shape of its panel arrangement, tinted with a whisper of the widget's accent. There is no shared or composite backplate of any kind: glued widgets each keep their own E0 glass and are joined only by the gradient weld between their facing edges (the glue law below). Everything else is either raised on the active backplate or cut into it. Three elevations exist; there is no fourth.

| Elevation | Name | Role | Material |
|:---|:---|:---|:---|
| **E0** | Backplate | The widget's single glass plate | Existing `gp-glass` recipe; accent bloom at ~9% mix top-left; the only border; the only shadow cast to canvas |
| **E1** | Island | A content group, raised on the backplate. | Lighter fill (white 5% → 2.4% vertical gradient), 1px top catch-light, soft contact shadow. **No full border.** |
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

## Article XVIII — Whole-card size charters

Registry windows are the off-screen fallback; the mounted renderer composes a
stricter live floor from reflowing text, rows/lists, rigid grids, and controls.
Complete text width is measured before ellipsis. The store merges that floor
into every resize path. Content changes can grow a card on either axis but
never auto-shrink it. Control-only widgets are `autoHeight` and expose no
meaningless vertical resize. Radial charts remain aspect-locked after siblings
reserve their minima — a stretched circle is a lie; geometry that encodes
meaning in its proportions must scale as a photograph does, never as a textarea
does. Whole-card resizing clamps cleanly at the live floor, showing the pull as
a damped rubber band rather than as a dead gesture. The band is transient paint
only: the stored model never holds a size the charter would refuse, so an
interrupted drag can leave nothing illegal behind. A resting tile crushed
diagonally past the state threshold becomes an icon; an icon is a square scaled
freely while held across one grid cell (2×2 to 3×3, never smaller than 2×2,
no live detents), then snaps to the nearest 2×2 or 3×3 square only on release,
and hands the widget back to its full card when a diagonal drag outgrows the
3×3 ceiling. The invariants and calibration procedure live in
Article XII.1 of the widget constitution.

**The symmetry rule.** Any panel whose meaning depends on *visual equality
between alternatives* keeps its alternatives pixel-identical. A True button
rendered twice the size of its False twin is not a layout choice — it is a
thumb on the scale, an implied recommendation the widget has no business
making. Paired outcomes (True/False gates, Approve/Reject) stay identical
siblings forever.

---

## Article XIX — Chrome discipline

*Ratified 2026-07-16, after an audit found double-glassed buttons, per-cell table glass, auto-glassed lone text fields, glassed chart readouts, and cursor flicker from invisible-but-hit-testable hover chrome.*

**No shared corners.** Two nested rounded elements never touch or overlap at a corner. A child's inset from its parent's edge must be at least the parent's radius; an icon badge, chip, or control sitting at a card or island's corner clears the curve with real padding, never flush geometry. This is Article XIV's concentric formula applied to content, not only to material layers.

**No solo-button islands.** A `WidgetPanel`/`.gp-subpanel` that wraps nothing but a single action (an "Add row" footer, a lone icon button) is deleted, not styled. The button renders directly in the parent's flow with no glass backing — text/icon plus a hover color change is the whole affordance.

**No double-island buttons.** A button that already sits inside a well or island never *also* paints its own background, border, or shadow. If both exist today, remove both: the button becomes a ghost (no fill at rest, a subtle hover/focus tint, identical hit area) and the wrapper stops manufacturing a second surface beneath it.

**Icon containment.** Every icon glyph and icon-badge chip stays fully inside its island's padding box at every supported size. An icon is never clipped by, nor made to overlap, a rounded corner it shares an ancestor with.

**Hover-revealed chrome is invisible *and* inert at rest.** Any element that fades in via `opacity` on hover/focus (a row delete icon, a floating card action) sets `pointer-events: none` until the revealing state is active, then `pointer-events: auto`. An invisible element that still accepts pointer events is exactly what makes the OS cursor flicker between icons as the pointer crosses its hit-box — this is a correctness bug, not a style nit, everywhere it appears.

**A table is one island.** Its cells are divider-separated regions of that single surface — hairlines between them, never independent glass panes per cell or per row.

**A lone full-card text control has no second island.** A widget whose entire body is one textarea (Notes, Quote, a single-field composer) sits directly on the card's own backplate. The auto-detected "field island" treatment is for a control embedded among other content, not for a control that *is* the content.

**Charts and other visual/graph info panels stay flat.** Bar tracks, pie discs, plot lines, and their summary readouts never carry the standard glass elevation — no gradient fill, no lift shadow, no auto-radius. A hairline divider or the chart's own deliberate paint (a grid, an axis) is not glass and stays.

## The glue law

**Glued widgets are individual cards welded edge-to-edge — there is no backplate behind them, no shared surface, no label, no color, and no group object of any kind.** Grouping is repealed in every form.

**The seam is 0.3 cells** (`GLUE_GAP`, 12px). The only thing painted between two glued widgets is the **weld**: a smooth, subtle gradient filling that seam, blending the two cards' accent colours from one to the other (`.gp-glue-seam`, `GlueSeamLayer`, geometry in `glueGeometry.ts`). Welds render *beneath* the cards with a small bleed under each edge, so they show only in the gap. Facing edges get a straight bar; diagonal neighbours get a small corner patch — together the welds trace the shape of the merge: a row of two reads as a **—**, an L-arrangement as a **Γ**, a 2×2 as a filled square. Welds carry no border, no shadow, and no `backdrop-filter`; all static paint.

**One object under the hand.** A plain drag of any glued widget moves its whole cluster rigidly; settling and collision treat the cluster as one unit whose internal seams survive every grid snap exactly. Glued widgets keep their own title capsules, buttons, and link endpoints — gluing changes how they move, never what they are.

**The option-drag law.** ⌥-drag is the only glue gesture. Dragging a widget to within one cell (`GLUE_RANGE`) of another's facing edge previews the weld at the exact spot the release will snap to (a breathing gradient between the two cards — visibly about to merge); release commits the bond at exactly `GLUE_GAP`. ⌥-dragging a glued widget further than one cell from every clustermate previews the letting-go (its welds fade, the card wears a dashed outline); release pulls it off. The preview must always equal the drop — no surprises at release.
