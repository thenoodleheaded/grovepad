# Widget Scaling Tiers + Subpanel Breakdown — Design Notes

*Planning document, not yet implemented. This is step 1 (survey + sizing) before any per-widget visual redesign work begins. Nothing in this file changes runtime behavior.*

`GRID_SIZE = 40px` (`C` in registry.ts). Heights are expressed in cells (`×C`); widths are px, following the existing registry convention where only height is grid-locked.

---

## 0. Relationship to existing systems (read this first)

Two systems already exist that overlap in *name* but not in *purpose* with what's being asked for here. Keeping them straight matters:

| Existing system | What it is | Where |
|---|---|---|
| **Render mode** (`detail` / `map`) | A **performance** proxy swap below 25% zoom. Below threshold, the whole widget body is replaced by a cheap icon+name button so thousands of cards don't tank frame rate. It is zoom-driven, global, and not per-widget-authored. | `canvasDensity.ts`, `WidgetProxy.tsx` |
| **Collapse-to-pill** (`widget.collapsed`) | A **user-toggleable** one-line pill (~1.5 cells tall, width hugs the title) that already exists per-widget. `expandedSize` is stashed so re-expanding restores the prior size. | `useWidgetStore.ts`, `WidgetCard.tsx` |

Mapping the six requested tiers onto these:

| # | Tier (user's spec) | Status | Maps to |
|---|---|---|---|
| 1 | **Created** — size on first spawn | Exists today (`defaultSize` per registry entry), but was authored ad hoc, not against these tiers. Needs a pass. | `WIDGET_REGISTRY[type].defaultSize` |
| 2 | **Average** — the normal working size | Doesn't exist as a named concept yet — today "average" is just whatever the user drags it to. Needs definition per widget (this doc defines it). | New: a documented target, used as the size a "reset size" action or a smart-fit action would snap to. |
| 3 | **Expanded huge** — max detail, hard ceiling | Doesn't exist — resize is currently free-form/unbounded. Needs a `maxSize` cap added to the registry and enforced in the resize drag handler. | New registry field + resize clamp |
| 4 | **Mini** — compacted but still content-bearing | **New concept.** Distinct from map-mode's cheap proxy — this is a real, still-interactive, content-dense layout (think "the widget, but abbreviated": fewer rows shown, stat-only view, etc.), user-toggleable like collapse-to-pill is. Needs its own state flag and a per-widget abbreviated render path. | New: `widget.mini` state + per-widget compact renderer |
| 5 | **One-cell pill** — icon + name, width hugs content | **Already exists** — this is `widget.collapsed`. No new work beyond auditing that every widget's title truncates sanely at that width. | `collapsed` state |
| 6 | **Icon only** | **Already exists** — this is the map-mode `WidgetProxy` (icon + name filling the footprint, from the zoom-threshold work). Note: it currently always shows the name too, not "just the icon" literally. If a stricter icon-only look is wanted at the smallest footprints, that's a small follow-up to `WidgetProxy.css`, not a per-widget concern. | `WidgetProxy` (map mode) |

**So the real net-new work per widget, from this doc, is tiers 1–4** (created / average / expanded-max / mini) plus the subpanel breakdown decision. Tiers 5 and 6 are system-level, already built, and don't need per-widget sizing — just a per-widget title-length sanity check, called out below only where a name is unusually long.

---

## 1. The Subpanel Breakdown System (shared mechanics)

For widgets whose content is naturally heterogeneous (a stat readout *and* a list, two parallel columns, four quadrants, a chain of stages), break the single monolithic card body into **multiple independent glass sub-panels**, glued close together, that read as one widget.

### Mechanics

- **Gap between panels: `0.1 cell` = 4px.** Panels sit close enough to read as fused, not as separate cards.
- **Each panel is its own squircle** — same superellipse/rounded-corner treatment as a standalone card gets today (`rounded-[26px]`-equivalent, scaled to the panel's own size — smaller panels get a proportionally smaller radius so they don't look over-rounded, e.g. `clamp(10px, panel-size * 0.18, 26px)`).
- **Each panel gets its own glass backing** — same frosted/gradient treatment as `.gp-widget-content` today, independently, so panels read as separate physical plates rather than one plate with internal dividers.
- **A single shared outline binds them.** A dashed/dotted stroke traces the *union* of all sub-panel boundaries (not a rectangle around the bounding box — it should hug the actual silhouette, so an L-shaped or plus-shaped cluster reads as that shape, not as a rectangle with dead space). Implementation note for later: this is naturally an SVG path around the polygon union of panel rects, redrawn on layout change — same category of problem `groupGeometry.ts` already solves for group hulls, worth reusing that math rather than inventing a second convex-hull/outline system.
- **Overall widget shape is no longer required to be rectangular.** A widget's `size` (for layout/culling/hit-testing purposes) becomes the bounding box of its panel cluster, but the *visual* silhouette can be non-rectangular (L, plus, staggered columns). Relation-line anchoring (`standoffBorderPoint`) should target the nearest panel edge, not the bounding-box edge, once implemented.
- **Panels within one widget can differ in size** (e.g. a small stat-readout panel above a larger list panel) — the grid the panels lay out on is the same `0.1 cell` gap grid, but individual panel spans are widget-specific.

### When to use it (the actual editorial judgment)

Only break a widget down if it has **two or more genuinely distinct information roles** that currently get visually flattened together. The test: *if you covered one part with your thumb, would the other part still make complete sense on its own?* If yes, they're panel candidates. Don't split a widget just to split it — most list-only or single-purpose widgets (checklist, notes, calendar, sliders) stay single-panel; forcing a split there adds visual noise for nothing.

Recurring patterns found across the census below (so the same shape gets reused, not reinvented per widget):

- **Stat header + list body** (2 panels, stacked) — a small readout panel (total, count, computed result) glued above a larger scrollable list panel. Very common (budget, timesheet, grade_calc, gpa, debt_payoff, expense_split, okr, subscriptions, invoices, inventory, risk_register, medications).
- **N parallel columns** (N panels, side by side) — kanban's columns, pros/cons's two columns, quadrant widgets' four quadrants, comparator/formula's operand-operator-result triplet.
- **Input → transform → output chain** (3 panels, left to right) — comparator, formula, range_mapper, unit_converter: a compact "glass terminal" strip.
- **Header + two body blocks** (L-shape, 3 panels) — cornell notes (cue column | notes column, both above a full-width summary band).

---

## 2. Per-widget census

Columns: **Breakdown** (subpanel decision), **Created** (tier 1, w×h), **Average** (tier 2, w×h), **Expanded max** (tier 3, w×h), **Mini** (tier 4, w×h — the abbreviated content view, not the pill).

Heights in cells (`×40px`); widths in px. Where "Breakdown" says "None," the widget keeps one glass body exactly like today.

### Structure

| Widget | Breakdown | Created | Average | Expanded max | Mini |
|---|---|---|---|---|---|
| `canvas_node` | None | 280×4C | 280×4C | 360×6C | 220×1.5C (name + thumbnail count badge) |
| `divider` | None | 320×2C | 320×2C | 480×2C (wider only) | n/a — dividers don't mini, they're already minimal |
| `branch_gate` | 3-panel chain: question | true-output | false-output | 320×4C | 340×4C | 420×5C | 260×2C (question text + 2 colored dots for T/F state) |

### Notes & Content

| Widget | Breakdown | Created | Average | Expanded max | Mini |
|---|---|---|---|---|---|
| `notes` | None | 320×5C | 340×6C | 480×12C | 280×2C (first line preview only) |
| `bullets` | None | 280×4C | 300×5C | 380×10C | 260×2C (item count + first item) |
| `quote` | None (quote mark is decorative, not a panel) | 320×4C | 340×4C | 460×6C | 280×2C (truncated quote only) |
| `code` | 2-panel: lang/copy header strip + code body | 360×5C | 380×7C | 560×16C | 280×2C (language chip + first line) |
| `sticky_note` | None | 260×4C | 260×4C | 360×7C | 220×1.5C |
| `checklist` | None | 280×4C | 300×5C | 380×14C | 260×2C ("2/5 done" + next open item) |
| `meeting_notes` | 3-panel stack: header (date/attendees) → notes → action items | 340×6C | 360×8C | 520×16C | 300×2.5C (date + attendee count + open-actions count) |
| `outline` | None (hierarchy is the structure, splitting it breaks the tree read) | 360×6C | 380×9C | 520×18C | 280×2C (root count) |
| `logbook` | None (entries already read as a timeline list; splitting per-entry is noisy) | 360×6C | 380×8C | 520×18C | 280×2C (latest entry + count) |
| `flashcards` | None — it's one physical card that flips, not parallel info | 300×5C | 300×5C | 380×7C | 240×2C ("N cards, showing X/N") |

### Planning & Tasks

| Widget | Breakdown | Created | Average | Expanded max | Mini |
|---|---|---|---|---|---|
| `kanban` | **N-panel columns**, one squircle per column, glued 0.1c apart | 440×6C | 480×8C | 900×16C (grows with column count) | 300×2C (column names + card counts, e.g. "To do·3 → Doing·1 → Done·2") |
| `timeline` | None (one continuous band) | 400×3C | 420×3C | 560×4C | 280×1.5C (phase labels only, no bars) |
| `pros_cons` | **2-panel columns**: pros \| cons | 340×4C | 360×6C | 520×12C | 280×2C ("3 pros / 2 cons") |
| `weekly_planner` | 7-panel columns at expanded only; unified grid below that (7 glass strips is too busy at normal size) | 320×7C | 360×8C | 700×10C (7 day panels) | 260×2C (task count this week) |
| `priority_matrix` | **4-panel quadrants**, 2×2, shared outline | 380×5C | 400×6C | 560×8C | 280×2C (per-quadrant counts) |
| `decision` | 2-panel: question header + options list | 300×5C | 320×6C | 420×9C | 260×2C (question + picked option, if any) |
| `calendar` | None (grid is the structure) | 280×6C | 300×7C | 380×8C | 240×2C (month name + marked-date count) |
| `countdown` | None | 280×3C | 280×3C | 340×4C | 220×1.5C |
| `progress` | None | 280×3C | 280×3C | 340×3C | 220×1.5C |
| `poll` | 2-panel: question header + options list | 300×5C | 320×6C | 420×9C | 260×2C (leading option + total votes) |
| `date_picker` | None | 280×4C | 280×4C | 340×5C | 220×1.5C |
| `form` | 2-panel: title strip + fields list | 400×7C | 420×9C | 560×16C | 280×2C (title + "N/M required filled") |
| `daily_agenda` | 2-panel: date/progress header + items list | 360×7C | 380×8C | 500×16C | 280×2C ("3/6 complete") |
| `process` | 2-panel: progress-bar header + steps list | 360×6C | 380×8C | 520×14C | 280×2C (active step name + %) |
| `risk_register` | 2-panel: stat header (open/highest/all-resolved) + risk list — **already visually doing this, just needs a real panel seam** | 440×6C | 460×8C | 640×16C | 300×2C (open count + highest score) |
| `decision_matrix` | 2-panel: criteria weights + options×scores grid | 440×6C | 460×8C | 640×12C | 280×2C (leading option + score) |
| `swot` | **4-panel quadrants**, 2×2, shared outline | 400×6C | 420×7C | 560×9C | 300×2C (per-quadrant counts) |

### Study & Learning

| Widget | Breakdown | Created | Average | Expanded max | Mini |
|---|---|---|---|---|---|
| `pomodoro` | None (dial is the whole point) | 260×5C | 260×5C | 320×7C | 220×2C (mm:ss + phase dot) |
| `vocab` | None | 320×5C | 340×7C | 460×16C | 260×2C ("N terms · M known") |
| `grade_calc` | 2-panel: computed-grade readout + components list | 320×5C | 340×7C | 460×12C | 260×2C (final grade only, large) |
| `gpa` | 2-panel: computed-GPA readout + courses list | 320×5C | 340×7C | 460×12C | 260×2C (GPA only, large) |
| `assignment` | None | 340×5C | 360×7C | 480×14C | 280×2C ("2 due this week") |
| `cornell` | **3-panel L-shape**: cues (left) \| notes (right), both above summary (full width) | 360×6C | 400×9C | 560×16C | 280×2C (summary line only) |
| `formula_sheet` | None | 320×5C | 340×6C | 440×12C | 260×2C (formula count) |
| `citation` | None | 340×5C | 360×7C | 480×14C | 260×2C (source count + style) |
| `study_goal` | None | 300×4C | 300×4C | 380×5C | 240×1.5C (hours logged/target) |
| `quiz` | 2-panel: prompt header + options list | 320×5C | 340×6C | 440×9C | 260×2C (prompt truncated) |
| `world_clock` | Optional N-panel rows (one glass strip per city) at expanded only | 280×4C | 300×5C | 340×8C (per-city panels) | 240×2C (2 cities inline, "+N more") |

### Data & Views

| Widget | Breakdown | Created | Average | Expanded max | Mini |
|---|---|---|---|---|---|
| `rating` | None | 260×3C | 260×3C | 300×3C | 200×1.5C |
| `calculator` | 2-panel: display readout + keypad | 240×7C | 240×7C | 280×8C | 220×1.5C (last result only) |
| `bar_chart` | 2-panel: chart canvas + data rows (rows only appear expanded) | 320×4C | 340×5C | 480×10C | 260×2C (title + bar count) |
| `line_chart` | 2-panel: chart canvas + latest/avg/max readout strip | 400×6C | 420×7C | 600×10C | 260×2C (latest value only) |
| `pie_chart` | 2-panel: donut visual + legend rows | 360×6C | 380×7C | 480×10C | 240×2C (top segment %) |
| `table` | None (it's a ledger, that's the whole point) | 360×4C | 400×6C | 640×16C | 280×2C (row count) |
| `budget` | 2-panel: total header + line items | 320×5C | 340×7C | 460×14C | 260×2C (total only, large) |
| `metrics` | None (tiles are already the unit) | 320×4C | 340×5C | 480×6C | 280×2C (first tile only) |
| `text_input` | None | 280×3C | 280×3C | 320×3C | 200×1.5C |
| `number_input` | None | 280×4C | 280×4C | 320×4C | 200×1.5C |
| `toggle` | None | 240×3C | 240×3C | 260×3C | 180×1.5C |
| `formula` | **3-panel chain**: a \| operator \| b→result | 320×5C | 340×4C (settles shorter once it's just the strip) | 380×5C | 260×1.5C (result only) |
| `unit_converter` | **3-panel chain**: from \| swap \| to | 320×5C | 340×4C | 380×5C | 260×1.5C (converted value only) |

### Tracking

| Widget | Breakdown | Created | Average | Expanded max | Mini |
|---|---|---|---|---|---|
| `goal_tracker` | 2-panel: goal header/progress + milestones list | 320×5C | 340×7C | 460×12C | 260×2C (% complete) |
| `stopwatch` | None | 240×4C | 240×4C | 300×6C | 200×1.5C (elapsed only) |
| `reading_list` | None | 320×4C | 340×6C | 460×14C | 260×2C ("2 reading, 1 queued") |
| `timer` | None | 240×4C | 240×4C | 300×5C | 200×1.5C |
| `mood_tracker` | None (7 cells is already the panel) | 300×3C | 300×3C | 360×3C | 220×1.5C (today's mood only) |
| `counter` | None | 260×4C | 260×4C | 300×4C | 180×1.5C |
| `links` | None | 300×4C | 320×6C | 420×14C | 240×2C (link count) |
| `habit` | None | 300×3C | 300×3C | 360×3C | 220×1.5C (streak only) |
| `contact` | None (already minimal) | 300×4C | 300×4C | 340×5C | 240×1.5C (name + role) |
| `status` | None | 280×3C | 280×3C | 320×3C | 200×1.5C |
| `timesheet` | 2-panel: total/rate header + entries | 400×6C | 420×8C | 560×16C | 280×2C (total hours + pay) |
| `inventory` | 2-panel: stat header (total/low-stock/all-stocked) + items — **already visually doing this** | 400×6C | 420×8C | 560×16C | 280×2C (low-stock count) |

### Media & Creative

| Widget | Breakdown | Created | Average | Expanded max | Mini |
|---|---|---|---|---|---|
| `color_palette` | None (swatch grid is already modular) | 260×4C | 280×4C | 360×6C | 220×1.5C (first 3 swatches) |
| `media` | 2-panel: image + caption strip | 320×5C | 340×7C | 480×14C | 260×2C (caption only, no image) |
| `sketchpad` | None | 360×5C | 380×6C | 560×12C | n/a — drawing surfaces don't mini meaningfully, fall back to pill at tier 5 |
| `dialog` | None (already a sequential list of boxed lines) | 360×5C | 380×7C | 520×16C | 280×2C (line count + last speaker) |
| `ai_generator` | 2-panel: prompt input + status/output | 320×4C | 340×6C | 480×12C | 260×2C (status only) |

### Automation & Logic (the "glass terminal" family — good candidates for chain-panel treatment)

| Widget | Breakdown | Created | Average | Expanded max | Mini |
|---|---|---|---|---|---|
| `clock_pulse` | 2-panel: schedule config + last-fired readout | 300×4C | 300×4C | 360×6C | 220×1.5C (next fire time) |
| `comparator` | **3-panel chain**: a \| op \| b→result | 280×4C | 300×3C | 340×4C | 220×1.5C (true/false only) |
| `aggregator` | 2-panel: slots input grid + computed result | 300×5C | 300×5C | 380×7C | 220×1.5C (result only) |
| `range_mapper` | 2-panel: input readout + bands list | 300×5C | 320×6C | 420×9C | 240×1.5C (current band emoji + label) |
| `latch` | 2-panel: current vs held readout (side by side, tiny) | 280×4C | 280×3C | 320×4C | 220×1.5C |
| `random_picker` | 2-panel: options list + result/history strip | 300×5C | 320×6C | 420×10C | 240×1.5C (current pick only) |
| `sequencer` | 2-panel: active-step readout + steps list | 320×6C | 340×7C | 460×12C | 260×1.5C (active step name) |
| `template` | None (it's already one composed sentence) | 320×4C | 320×4C | 400×5C | 260×1.5C |
| `recorder` | 2-panel: current value + sample history | 320×5C | 340×6C | 460×9C | 220×1.5C (latest sample) |
| `notifier` | 2-panel: message config + arm/status strip | 320×4C | 320×5C | 400×7C | 240×1.5C (armed dot + message truncated) |

### Life (mostly list-CRUD widgets — the "stat header + list" pattern dominates)

| Widget | Breakdown | Created | Average | Expanded max | Mini |
|---|---|---|---|---|---|
| `subscriptions` | 2-panel: monthly-total header + rows | 360×6C | 380×8C | 520×16C | 260×2C (monthly total) |
| `debt_payoff` | 2-panel: payoff summary (date, total interest) + debts list | 380×7C | 400×9C | 560×16C | 280×2C (payoff date only) |
| `expense_split` | **3-panel**: people/you selector + expenses list + settlement result | 380×7C | 400×9C | 560×18C | 280×2C ("you owe/are owed $X") |
| `invoices` | 2-panel: outstanding-total header + rows | 360×6C | 380×8C | 520×16C | 260×2C (outstanding total) |
| `meal_planner` | None (7×3 grid is the correct dense tabular pattern; per-day panels would be 7 tiny panels of noise at normal size) | 440×8C | 460×10C | 640×14C | 300×2C ("N meals planned") |
| `recipe` | **3-panel**: header (title/servings/time) + ingredients + steps | 360×7C | 380×10C | 520×18C | 280×2C (title + total time) |
| `home_maintenance` | None | 360×6C | 380×8C | 500×14C | 260×2C ("1 overdue") |
| `chore_rotation` | None | 340×6C | 340×6C | 420×8C | 260×1.5C (whose turn) |
| `renewals_vault` | 2-panel: soonest-expiry header + rows | 360×6C | 380×8C | 520×14C | 260×2C (soonest expiry) |
| `medications` | 2-panel: doses-due-today header + rows | 360×6C | 380×8C | 520×14C | 260×2C (doses remaining today) |
| `workout_plan` | 2-panel: day-tabs header + exercise list | 400×8C | 420×10C | 580×18C | 280×2C (active day + set count) |
| `job_applications` | None (stage is already a column-like status chip per row) | 400×7C | 420×9C | 600×16C | 280×2C (active pipeline count) |
| `okr` | 2-panel: objective header + key results list | 360×7C | 380×9C | 520×14C | 280×2C (overall % only) |
| `decision_journal` | None | 380×7C | 400×9C | 560×16C | 260×2C (entry count) |
| `weekly_review` | 2-panel: streak/status header + prompts list | 360×7C | 380×9C | 520×14C | 260×2C (streak only) |
| `snippet_library` | None | 360×7C | 380×9C | 520×16C | 260×2C (entry count) |
| `keep_in_touch` | 2-panel: overdue-count header + rows | 360×6C | 380×8C | 520×14C | 260×2C (overdue count) |
| `gifts_occasions` | None | 360×6C | 380×8C | 520×14C | 260×2C (next occasion) |
| `trip_itinerary` | 2-panel: trip header + day/legs list | 420×8C | 440×10C | 600×18C | 280×2C (trip name + start date) |
| `guest_list` | 2-panel: headcount header + rows | 360×7C | 380×9C | 520×14C | 260×2C ("N confirmed") |

### Specialist

| Widget | Breakdown | Created | Average | Expanded max | Mini |
|---|---|---|---|---|---|
| `game_tuner` | **3-panel row**: grip \| drift \| stability sliders, glued | 320×4C | 320×4C | 380×5C | 240×1.5C |
| `audio_player` | 2-panel: bpm/key header + signal-chain strip | 360×5C | 360×5C | 440×7C | 260×1.5C (bpm + key) |

---

## 3. Open questions / follow-ups before implementation

1. **`maxSize` cap** doesn't exist in the registry today — needs a new `WidgetDefinition.maxSize?: Size` field and enforcement in the free-form resize drag path (`resizeWidget`), or expanded-tier gets ignored.
2. **`mini` needs a new persisted flag** (`widget.mini: boolean`, mutually exclusive with `collapsed`) and each widget module needs a second, abbreviated render branch — this is real per-widget UI work, not just a size change, since mini shows *different* (reduced) content, not just a smaller version of the same layout.
3. **Shared dotted-outline-around-a-union-of-rects** is a real geometry problem, not just CSS. Recommend reusing `groupWorldBounds`/hull math from `groupGeometry.ts` rather than building a second system — group hulls and subpanel-cluster outlines are the same shape problem at different scale.
4. **Relation-line anchoring** (`RelationLines.tsx` / `standoffBorderPoint`) currently targets a widget's rectangular bounding box; once shapes go non-rectangular, anchoring should prefer the nearest actual panel edge. Flag for whoever picks up wiring once subpanels ship.
5. This doc doesn't yet cover **which specific fields go in which panel** for each multi-panel widget (e.g., exact field-by-field cue/notes/summary split for `cornell`) — that's per-widget implementation detail to write when that widget is actually built, not a sizing concern.
