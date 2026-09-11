# The Widget Glass — Material Constitution (Articles XIII–XIX)

*Companion to [widget-constitution.md](widget-constitution.md), which governs what widgets ARE. This document governs what widgets LOOK LIKE. Binding for every essential (non-pack) widget renderer.*

## Article XIII — One backplate, three elevations

Every widget is exactly **one piece of glass** — the backplate — in the finalized shape of its panel arrangement, tinted with a whisper of the widget's accent. There is no shared or composite backplate of any kind: glued widgets each keep their own E0 glass and are joined only by the carved gap between their facing edges and their own light pooling behind them (the glue law below). Everything else is either raised on the active backplate or cut into it. Three elevations exist; there is no fourth.

| Elevation | Name | Role | Material |
|:---|:---|:---|:---|
| **E0** | Backplate | The widget's single glass plate | Existing `gp-glass` recipe; accent bloom at ~9% mix top-left; the only border; the only shadow cast to canvas |
| **E1** | Island | A content group, raised on the backplate. | Lighter fill (`--gp-island-fill`: white 16% → 8% vertical gradient, the bottom stop always half the top), 1px top catch-light, soft contact shadow. **No full border.** |
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

/* E1 — island. ONE material, named once in tokens and worn by every island:
   .gp-island, a widget's subpanels and subdivisions, and the field islands
   auto-promoted around bare inputs. Never hand-write a second island fill. */
.gp-island {
  border-radius: var(--gp-r1);            /* 10px = r0 − p0 */
  padding: var(--gp-p1);                  /* 12px */
  background-image: var(--gp-island-fill);
  box-shadow:
    var(--gp-island-catchlight),
    var(--gp-island-ring),
    var(--gp-island-contact);
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

/* Editable field — the SAME E1 material, plus the one thing it adds: an
   outline, because that is the part that answers focus. It takes no
   --gp-island-ring; the outline already draws that edge. */
.gp-field-island {
  background-image: var(--gp-island-fill);
  box-shadow: var(--gp-island-catchlight), var(--gp-island-contact);
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

**One card open makes every other card background.** While a card is held open (the ephemeral expansion), no other card on the board answers a hover: no bloom, no lift, no magnetic tilt, no lit relation lines, no resize outline. The open card is the thing being worked in, and a neighbour lighting up as the pointer crosses it on the way there reads as if the click would land on the neighbour. Background cards keep their click — the accordion still opens the next card — they simply stop responding to the pointer merely passing over. The same rule covers any card that is present but not individually actionable, such as a member of a folded cluster (`[data-hover-inert]`).

**A table is one island.** Its cells are divider-separated regions of that single surface — hairlines between them, never independent glass panes per cell or per row.

**A lone full-card text control has no second island.** A widget whose entire body is one textarea (Notes, Quote, a single-field composer) sits directly on the card's own backplate. The auto-detected "field island" treatment is for a control embedded among other content, not for a control that *is* the content.

**Charts and other visual/graph info panels stay flat.** Bar tracks, pie discs, plot lines, and their summary readouts never carry the standard glass elevation — no gradient fill, no lift shadow, no auto-radius. A hairline divider or the chart's own deliberate paint (a grid, an axis) is not glass and stays.

## The glue law

**Glued widgets are individual cards welded edge-to-edge — there is no backplate behind them, no shared surface, no label, no color, and no group object of any kind.** Grouping is repealed in every form.

**The gap is 0.3 cells** (`GLUE_GAP`, 12px), and **nothing whatsoever is painted into it.** The gradient weld is repealed: there is no seam layer, no weld geometry, no weld material tokens, and no bridge of any kind between two glued cards. What says "these belong together" is **light on the canvas** — each card casts its own accent as a strong, tightly local pool on the board behind it (`CanvasAuraLayer`, numbers in `auraTuning.ts`), and welded neighbours sit close enough that their pools overlap and read as one mass. Because that pooled light now carries the join, a glued member is **never** dropped from the emitter set however small it reads on screen — glued cards are usually the smallest on the board, and a largest-first cut would silence exactly the widgets that must glow. The pool is strong at the source, held close to its widget (`reach` ≤ 1 of the card's longest edge), and spreads only a little past that; its radius floor is low enough that a 1×1 icon stays a small bright pool rather than being inflated into a wash.

**The alignment law.** Glued members are stored grid-aligned and **touching** (gap 0). The seam is not stored between them — each member RENDERS inset by `GLUE_HALF_GAP` (6px) on every welded edge (`glueMemberInsets`, `insetGlueRects`), so the 0.3-cell gap is carved equally from both cards and the cluster's **outer corners always land on the grid**. Widgets visibly shrink a little where they touch; their free edges never move. A weld snaps the dragged card flush against its target (touching), grid-aligned on the perpendicular axis. Settling a cluster snaps it rigidly using the member already closest to the grid as the anchor — welding a card onto a cluster never moves the cards that were not touched. The rendered gap is always exactly `GLUE_GAP`, measured from the inset boxes.

**The tree-shaper law.** The widgets that share one tree-shaper node are one bundle: committing a ghost tree welds each multi-widget node into a single glue cluster (single-widget nodes stay unglued), laid out touching so the weld renders the moment the tree appears. Nodes are separate clusters, joined to their parents by relation lines, not glue.

**The group-frame law.** A glue cluster wears a quiet frame (`GlueClusterChrome`, `.gp-group-*`): a subtle boundary line above and below the welded widgets — full cluster width, each in a reserved `GLUE_FRAME_BAND` (0.5-cell) band, unbroken from edge to edge — and a title + button row floating above the top line. The title is the cluster's own editable name (`WidgetGlue.name`, persisted; defaults to "Group"); beside it the row carries **the same static action buttons a widget's own name row has** — Complete (only when a checklist member is aboard), Favorite, Delete, each applied to every member at once; the button set is fixed, with no customize menu on cards or groups — followed by the group's own two controls: **Collapse/expand all** (`setClusterCollapsed` — iconify or restore every member and re-pack the cluster touching so it stays a grid-aligned welded block) and **Ungroup** (`unglueCluster` — dissolve the weld, delete nothing, and push the members a clear cell apart so the split is physical: cards left stored touching would keep reading, and settling, as one welded object). Losing a member is just as protective in the other direction, whether it was deleted or dragged out: the survivors close ranks — they slide back together until they weld again (`closeClusterGaps`; a folded block re-stacks) — so the widgets standing beyond a departing card are never ungrouped by someone else's exit. **Closing ranks always lands on a FACE, never a corner.** A piece that drifted diagonally clear closes along the axis it was arranged on and slides along the other only far enough to sit back over the block's face; closing both axes at once walked it in until the two corners kissed, which shares no edge, so no seam was carved and a wedge of empty canvas sat between two cards the group still framed as welded. An unpin is exactly that case — the card that was held open gives back width and height at the same moment. The card that was just acted on is the still point the others come back to. A member also holds the corner it is welded at through any footprint change of its own (pin, unpin, scale swap, rename): clustermates give way when it grows and close ranks when it shrinks, so opening and closing a card inside a group is exactly reversible instead of walking the whole group half a size difference at a time. And the widget that left leaves alone — the selection follows it, never its former clustermates. The frame names the *group*; it does not take the members' names away. **A welded member keeps its own title row**, and that row is part of the member, not of the space around it: the group's boundary lines are drawn above it, and a card welded on top of it lands above it. Members used to hide instead, which quietly made the strip read as free space — the clustermate above was packed into it and the top boundary line was drawn through where the name would have been. **Chrome is reserved space, on both sides of the law.** A widget's own floating title row is part of its boundary wherever it is actually shown, so a card is never packed into the strip where its neighbour's name and buttons are painted. **A name row NEVER sits on the glass** — resting tile, full card, and ephemerally expanded card alike float it in the one-cell strip directly above the backplate. One placement is what lets `WIDGET_TITLE_ROW` describe every state, so the space reserved above a card and the chrome painted there can never disagree; the expanded card used to carry its row inside its own backplate, and that exception was the one case the reserved strip could not describe. And the group frame does not blink out while one of its members is expanded: expansion is view-only state and the stored tiles the envelope is drawn from never move, so the frame keeps naming its own footprint underneath the raised card. The group's boundary is its frame (`clusterFrameEnvelope` — a band clear of everything its members occupy, on every side) together with its name row (`clusterTitleRowRect` — bounded to the icon, the label, and the buttons). It is two shapes, never one grown box: the empty canvas beside a short group name is ordinary board, free to hold a widget and free to be dropped on. Relations anchor off the frame and dodge the row; a cmd-drag relation lands on the group only where the group actually is. The frame is otherwise chrome only — it is not a backplate, holds no widgets, and disappears when the cluster is dissolved.

**The folded-cluster law.** Collapsed, a cluster is **one object with one pointer target**. Every member folds to a **single grid cell** and the cells stack into the closest practical square — the same balanced packing the ghost tree shaper uses for a node holding several widgets, so a bundle looks the same folded on the board as it did as a ghost. Short rows centre on whole cells, the block stays grid-aligned, and the members still touch, so the usual half-seam is still carved from every welded edge. Inside a folded cluster nothing is individually alive: no member lifts or blooms on hover, shows a resize outline, offers a port, or can be ⌥-pulled out of the collection; the pointer reads "press", and a single click anywhere unfolds the whole cluster back to the geometry the fold recorded — translated by however far the folded block has been dragged since (`foldedAt`), so a group moved while collapsed expands around where it sits now instead of rewinding to its pre-collapse spot. This single cell is the **only** exception to the 2×2 icon floor: that floor protects icons a person aims at, and nothing inside a folded cluster is ever aimed at.

A folded cluster stays whole through every membership change. Welding a widget onto a collapsed group keeps the group collapsed: the newcomer folds in, records where it came from, and the block re-stacks — it does not join full-size beside a group that quietly forgot it was folded. The reverse is just as strict: a member that LEAVES a collapsed group — pulled off, ungrouped, or left alone when the group dissolves or a delete drops it below two — is never abandoned as a sub-floor 1×1 icon. It is restored to the state it was folded from, carried to wherever the block sits now (or, if that memory is gone, to its dormant full size), because a lone cell smaller than the floor is unreadable and unaimable. Folding, re-folding, and restoring are one owner each (`refoldCollapsedCluster`, `unfoldReleasedFoldedMembers`), so a collection built by any route looks and behaves identically.

**The cluster-reflow law.** A member whose footprint changes *inside* a cluster — pinned open, scaled back to a full card, renamed into a wider tile — re-packs the cluster it belongs to. Clustermates give way by **exactly** the penetration, along the axis they are already arranged on (a card welded to your right slides further right; it is never lifted above you because that was the cheaper escape), so they end up touching again and every seam survives. The card that was just acted on holds its ground; the cluster makes room around it. Only after the cluster is internally clean does board-level settling move it against everything else.

**One object under the hand.** A plain drag of any glued widget moves its whole cluster rigidly; settling and collision treat the cluster as one unit whose internal seams survive every grid snap exactly. Glued widgets keep their own title capsules, buttons, and link endpoints — gluing changes how they move, never what they are.

**The option-drag law.** ⌥-drag is the only glue gesture. Dragging a widget to within one cell (`GLUE_RANGE`) of another's facing edge previews the bond at the exact spot the release will snap to (the target card lights up, `[data-glue-target]`); release commits the bond at exactly `GLUE_GAP`. ⌥-dragging a glued widget further than one cell from every clustermate previews the letting-go (the card wears a dashed outline); release pulls it off. The preview must always equal the drop — no surprises at release. **A card dropped squarely ON another still welds**, out to the nearest side, along the shallower penetration — putting one card on top of another is how a hand says "join these two", and a release that welds nothing is a release that pulls the member out of its group, so refusing the bond there meant a card dragged onto its own clustermate silently ungrouped itself. It matters most for the card aimed at a neighbour's visible top edge: the vertical weld rests on the CHROME edge, a title row higher, so the natural aim always lands a full row inside. That bond is last resort only and can never steal a real facing seam. **An ⌥-drag never arms drag reflow**: it is a precision welding gesture, and every other card holds perfectly still while a seam is being aimed.

**The strict-hold law.** Parent relations are **hard by default**: drawing a parent line makes that node carry its child, so a tree behaves like one load-bearing structure the moment it exists, with nothing to switch on. Dragging a node carries every parent-linked descendant with it by the same delta, and dragging any node inside a tree carries that node's own branch. `metadata.strictHold` is therefore an **opt-out**, toggled from the widget's own right-click menu — the single surface that owns the switch, carried as an icon row and hidden entirely for a node with no family to hold; a relation line's menu never offers it, because the hold belongs to the parent node and reaches every descendant inheriting from it, not to the one edge that was clicked. **The nearest explicit answer at-or-above a node decides for it**: its own beats an ancestor's, an ancestor's reaches every descendant that has not decided for itself (so releasing a node relaxes its whole branch in one reversible, undoable step, and a node inside a released branch can re-hold its own), and with nobody having decided anything the answer is hard. Every node with a family owns that switch — the menu never refuses, it only names where an inherited release was decided. Nothing about a hold is a one-way door. A **locked** node carries nobody: it cannot move, so expanding a family from it would march its children off without it. **⌥-drag breaks every coupling for that drag** — glue and family alike — moving only the grabbed card and touching no relation. A held family is movement only: arrangement stays free-form, lifecycle (delete, complete, collapse) never cascades, locked members never move, families never cross canvases, and parent cycles move as one loop instead of hanging. Strict parent edges paint one step heavier (`gp-edge-strict`) so a held tree reads as one load-bearing structure, **and they anchor top-down**: the line leaves the holding parent's **bottom half** and enters the child's **upper half**, at the closest points those halves allow (`EdgeAttach` in `edgeRoute.ts`), so a held family reads as a hierarchy at a glance while a soft link stays free to use whichever borders face each other. **Every line on the board — soft, strict, or dependency — stops 0.3 of a cell short of the card it points at, slides along the border to the nearest facing point rather than sprouting from a centre, and is drawn as ONE cubic tangent to both borders**: two ends that line up render dead straight, and no join anywhere can kink, bow sideways, or double back. The one shared closure `expandMovedWidgetIds` (widgetGraph.ts) is the single owner of "what moves together" — store moves, release settling, and the reflow preview must all pass through it.

**The generation-floor law.** A child never comes to rest as high as its parent. Every parent-linked child's top edge lands at least one **generation gap** (2 cells, the same gap the tree compaction lays down) below its parent's bottom edge, on every node on the board — not only the ones the Untangle button rearranged. The rule applies at the **drop**, never during the gesture: a card is free to be dragged anywhere, and it settles legally when it is let go, exactly as the overlap check does. It is a floor and nothing more — it only ever pushes a card **down**, only the exact distance the rule asks for, and never sideways: no card is centred over its children, no sibling is lined up with another, and arrangement stays free-form in every other respect. A pushed node takes its whole parent-linked branch with it, so tightening the top of a tree never reshuffles the shape below it. What counts as one node is what counts as one node everywhere else — a glue cluster is one rigid unit measured with its frame band and title headroom, every other card is measured at the resting footprint the settle pass separates, so the two passes agree about where a card ends. Locked cards never move, links across canvases say nothing about height, and parent cycles are bounded instead of hanging. `generationFloor.ts` owns the rule; `settleWithGenerationFloor` is the one commit path that applies it, and drawing a parent line runs it too — that is the moment a node becomes a child.
