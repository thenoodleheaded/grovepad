# Widget Instrument Redesign — 20 Essential Widgets, Rebuilt as Distinct Mini-Instruments

*Design plan only — no code. Companion to the accent-infusion rework already shipped.*

> **⚠ Post-implementation verdict (2026-07-11): the material metaphors below are
> SUPERSEDED.** Prototyping showed simulated materials (paper, felt, brass,
> ledger cream, handwriting fonts) read as cheap against the app's dark glass.
> What survived is the *mechanics*: big pressable controls, objects-as-state
> (book spines), segmented displays, flip tiles, light wells. The going-forward
> rule — **keep the mechanic, discard the material**:
> 1. One material only: the app's existing dark glass. Concepts are expressed
>    through geometry, depth, and light — never simulated surfaces.
> 2. Two depth levels, built from the existing vocabulary: *recessed* (darker
>    fill + inset shadow + inner hairline) and *raised* (gp-glass gradient +
>    top sheen + drop shadow).
> 3. Color = the neutral scale + `--gp-widget-accent`, applied as light (glow,
>    fill, edge-light via color-mix), never as pigment.
> 4. Type = Clash Display + the existing mono. "Display" looks (LED, boards)
>    are built from geometry and opacity, not fonts.
> 5. Glow is faked by duplicating geometry at low alpha underneath — never
>    CSS blur filters.
> 6. Motion = existing tokens, one-shot on state change; driven animation only
>    while the instrument is actively running.
>
> The five reference translations under this formula (Timer, Pomodoro, Reading
> List, Habit, Countdown) are specced in the conversation of 2026-07-11; use
> them as the template for translating any other Part I–III concept.

## 1. The problem, precisely

Every widget interior today is built from the same four parts: a mono-caps micro-label,
a dark squircle input, a row of squircle buttons, and a hairline divider. That idiom is
clean, but it means **the widgets differ only in arrangement, never in kind**. A
Timesheet, a Notifier, and a Dialog read as the same instrument with different labels.
Nothing about a Pomodoro *looks like time*; nothing about a Budget *looks like money*.

The fix is not more decoration on the same idiom — it's giving each essential widget a
**real-instrument identity**: its own material, its own layout topology, its own
typographic voice, and one signature gesture you remember it by. A canvas should feel
like a workbench of tools — a kitchen timer next to a paper notepad next to an
oscilloscope — not a stack of settings panels.

## 2. What stays the same (the coherence contract)

Distinctness without chaos. These never change per widget:

- **The shell**: card silhouette, glass frame, accent glow/selection ring, title
  capsule, ports, resize bracket. From across the room (far zoom), the canvas still
  reads as one family; LOD stripping behavior is untouched.
- **The accent system**: each instrument's hue still comes from `--gp-widget-accent`.
  A material can interpret the accent (LED glow, ink color, liquid fill) but not
  ignore it.
- **Motion tokens & perf rules**: all existing duration/ease variables; static paint
  only at idle, no backdrop-filter in cards, one-shot keyframes for state changes,
  everything off at far zoom and under `prefers-reduced-motion`.
- **Spacing grid**: interiors keep the 40px rhythm so auto-height and collapse
  behavior stay predictable.
- **A11y floor**: every custom control (dial, flap, odometer, punch hole) keeps a
  real focusable element with `role`, `aria-valuenow`, and arrow-key operation.

## 3. Foundations to build first — the "instrument parts bin"

Shared primitives that many redesigns below draw from. Build once, reuse everywhere:

1. **Materials library** (pure CSS, static paint): `paper` (warm tint + SVG-noise
   grain + optional ruled lines), `felt` (deep matte with inset wells), `bezel`
   (brushed device faceplate with edge highlights), `crt` (near-black with faint
   graticule + phosphor glow text), `lcd` (light gray-green liquid crystal with
   ghost segments), `chalkboard` (matte slate with dust unevenness), `ledger`
   (cream with ruled columns and a red margin line). All are gradient/data-URI
   backgrounds — no runtime cost.
2. **Type voices** (2 added families max, assigned per group): `voice-page` (a good
   serif — Notes, Flashcards content), `voice-hand` (casual marker — Sticky,
   Sketchpad labels), `voice-device` (the existing mono, plus a 7-segment/LED
   display treatment built from CSS segments — timers, calculator, counters),
   `voice-label` (existing Clash Display for everything structural).
3. **Inline-edit text**: kill the bordered textbox as the default. Text renders as
   *finished content*; hover shows a faint caret-underline; click drops you into
   editing in place. Bordered boxes survive only where a field is genuinely a form
   (Notifier's message, Form widget).
4. **Drag-number**: any numeric value can be scrubbed by dragging horizontally
   (with shift for fine step), double-click to type. Replaces number inputs in
   instruments.
5. **Odometer digits**: digit columns that roll vertically on change (one-shot
   translate). Used by Counter, Timesheet totals, Budget total.
6. **Split-flap tile**: a two-half flip tile that flaps once when its character
   changes. Used by Countdown; reusable for World Clock later.
7. **Dial/knob gesture**: circular drag with detents (snap ticks + tiny rotation
   overshoot). Used by Pomodoro, Mood, and future logic widgets.
8. **Physical drag-and-drop** for cards/rows (pointer-based, ghost follows cursor,
   drop targets glow) — Kanban and Checklist reordering.

## 4. The 20 essential widgets and their new identities

Format per widget: **Identity → Material & type → Layout → Signature gesture →
Details that sell it**.

### 4.1 Notes — *A page*
- **Material/type**: `paper` with faint grain; `voice-page` serif at comfortable
  size; baseline rules fade in *only while editing* and fade back out.
- **Layout**: zero chrome. The entire interior is the page — no label, no border,
  no placeholder box. First line auto-styles as a heading (larger, tighter).
- **Gesture**: just type — click anywhere, caret lands at the nearest text point.
- **Details**: soft dog-ear shadow in the bottom corner that deepens as content
  grows past the fold (a real "there's more" affordance, click to expand card);
  word count appears as a pencil-gray marginal note on hover only.

### 4.2 Sticky Note — *An actual Post-it*
- **Material/type**: flat, saturated paper color (finally, a card that is NOT
  glass) — five classic sticky hues; `voice-hand` marker type; a subtle bottom-
  right curl shadow so it sits *on* the canvas.
- **Layout**: type-anywhere square; text auto-scales down as it fills (fit-to-box)
  so a sticky never scrolls.
- **Gesture**: **peel to recolor** — the top-right corner shows a tiny stack of
  alternate colors; clicking peels the current color off (one-shot curl keyframe)
  revealing the next.
- **Details**: each sticky gets a deterministic ±1.5° rotation from its id so a
  cluster looks hand-placed; selection straightens it to 0° (satisfying snap).

### 4.3 Checklist — *A pen-and-paper list*
- **Material/type**: quiet paper wash; content in `voice-page`.
- **Layout**: rows are full-bleed lines, not boxed inputs; a thin "ink line" runs
  up the left edge as progress (replaces the top bar — it literally inks up).
- **Gesture**: checking draws a **pen-stroke strike-through** (animated SVG dash
  across the text, slight downward slope like a real hand); the row then exhales —
  desaturates and slides beneath a "done" fold that can collapse.
- **Details**: drag rows by a dotted grip that only materializes on hover; the
  ghost "add" row at the bottom shows a faint pen-nib cursor; completing the last
  item stamps a small tilted "DONE" seal in the corner (one-shot).

### 4.4 Kanban — *A felt card table*
- **Material/type**: columns are `felt` lanes — recessed wells with inner shadow;
  cards are tiny `paper` cards with real edges; column titles in condensed caps.
- **Layout**: lanes get breathing room; card count becomes a **stack light** in
  the lane header (calm → amber glow when the lane exceeds a WIP limit you can
  set by clicking the light).
- **Gesture**: **real drag between lanes** — pick a card up (it tilts 3°, shadow
  deepens, lane wells glow as drop targets), replacing today's hover-arrows.
  Arrows remain as the keyboard path.
- **Details**: cards dropped in the last lane get a faded ✓ stamp overlay; a lane
  briefly flashes its wash when it receives a card.

### 4.5 Calendar — *A wall month*
- **Material/type**: bone-white/graphite month sheet; huge condensed month name
  with a small year underneath, like a print calendar.
- **Layout**: weekend columns get a subtle tint; today's cell is embossed
  (raised bevel + accent ring), not just colored.
- **Gesture**: **paint a range** — press and drag across days to mark spans, not
  just single-day toggles.
- **Details**: marks are ink dots that *accumulate* (2-3 marks cluster like
  grapes in the cell corner); hovering a cell lifts it like a loose tile;
  month navigation flips the sheet (one-shot horizontal page turn).

### 4.6 Weekly Planner — *A desk blotter*
- **Material/type**: seven paper strips side by side on a darker blotter base;
  day initials run vertically at the top of each strip.
- **Layout**: today's strip is brighter paper and slightly wider; a thin red
  "now" line sits at the current time across today's strip only.
- **Gesture**: click any empty strip area and type — entries are inline lines
  with a small dragged-time badge, no boxed inputs.
- **Details**: past days' strips dim like used pages; dragging an entry between
  strips carries a paper ghost.

### 4.7 Pomodoro — *A mechanical kitchen timer*
- **Material/type**: the interior becomes a **dial face** — `bezel` ring with
  knurling (fine tick texture), matte face, `voice-device` numerals.
- **Layout**: radial. Minutes tick-marks around the rim; remaining time large in
  the center; work face is tomato-warm, break face flips to cool green (the whole
  face changes state, not a chip).
- **Gesture**: **twist to wind** — drag rotationally around the dial to set
  minutes with detent snaps per minute (tiny overshoot per detent, like a real
  wind-up); press the dial center to start (center visually depresses).
- **Details**: completed sessions are stamped as notches on the rim, filling
  clockwise; the progress arc is already built — it becomes the dial's sweep.

### 4.8 Timer — *An LED slab*
- **Material/type**: `bezel` faceplate; time in **7-segment LED digits** with the
  classic ghost "88:88" unlit segments behind, accent-colored glow.
- **Layout**: digits are the whole instrument; controls shrink to a physical
  **flip switch** (start/stop) and a small recessed reset button.
- **Gesture**: **scrub digits** — drag any digit column vertically to set it
  (odometer roll), no min/sec input boxes.
- **Details**: under 10 seconds the glow tightens and pulses once per second (a
  driven state, not an idle loop — it only runs while the timer runs); at zero,
  all segments flash once then show a dim "00:00".

### 4.9 Counter — *A tally clicker*
- **Material/type**: chrome clicker body — `bezel` with a big satisfying dome.
- **Layout**: one giant circular **thumb button** dominates the card (this is the
  point of a clicker); count rendered as **mechanical odometer wheels** above it;
  minus and reset become small side hardware (a recessed pin and a swing lever).
- **Gesture**: press the dome — it physically travels 2-3px with a squash, digits
  roll. Holding it repeats slowly (real clickers can't, but this one's better).
- **Details**: step size becomes a tiny engraved selector under the wheels;
  crossing a multiple of 10 gives the wheel-roll a slightly longer, more
  satisfying spin.

### 4.10 Habit — *A punch card*
- **Material/type**: ticket-stock card with a perforated left edge (die-cut
  circles as the days); `voice-label` small caps.
- **Layout**: 7 punch holes in a row, day initials engraved beneath; the streak
  flame sits at the right end like a wax seal.
- **Gesture**: **punch it** — clicking a day stamps the hole through (inner
  shadow appears, ring pops once); un-punching pastes a translucent patch over
  the hole (visibly a correction, which is honest).
- **Details**: the flame badge physically grows with the streak — ember at 3,
  small flame at 5, full flame with an amber card-edge glow at 7/7; a fully
  punched week tears off (one-shot) into a small archived stub row.

### 4.11 Budget — *A banker's ledger*
- **Material/type**: `ledger` paper — cream, ruled rows, a red vertical margin
  line; amounts in tabular numerals, right-aligned on the decimal point.
- **Layout**: two ink colors carry meaning: entries in blue-black, deductions in
  red; the TOTAL row gets the classic **double underline**; a slim "envelope"
  gauge on the right edge shows remaining vs. cap as physical fill.
- **Gesture**: amounts use drag-number scrubbing; a new line appears by clicking
  the next empty rule — the row *is* the input.
- **Details**: when the total exceeds the cap, the total's ink turns red and the
  envelope gauge overflows with a small stain — no alarm banners, the ledger
  itself frowns.

### 4.12 Progress — *A glass thermometer*
- **Material/type**: a horizontal glass tube with etched tick marks and a
  meniscus highlight on the liquid (accent-colored fill).
- **Layout**: the tube is the widget; the % value rides *on* the liquid's leading
  edge like a gauge bug; label engraved beneath the tube.
- **Gesture**: **drag the liquid** directly to set progress (with tick snapping);
  milestones are notches you click to etch onto the tube.
- **Details**: passing a milestone makes the notch glow once; ≥100% bubbles past
  the end cap (a couple of one-shot bubbles, then rest).

### 4.13 Goal Tracker — *A trail map*
- **Material/type**: topographic paper wash; a winding dotted path from bottom-
  left basecamp to a summit flag top-right.
- **Layout**: milestones are camps along the path (small circles with inline-
  editable names); a marker (the "climber") sits at the current position.
- **Gesture**: checking a milestone **hops the climber** to the next camp along
  the path (one-shot arc hop).
- **Details**: the path behind the climber becomes a solid inked line; the summit
  flag unfurls when everything's done; distance-left reads like trail signage
  ("2 camps to summit").

### 4.14 Countdown — *A departure board*
- **Material/type**: black board, **split-flap tiles** for the numbers, dot-
  matrix event name line — full airport homage.
- **Layout**: `DAYS | HRS | MIN` as flap groups with engraved labels beneath;
  event title above in dot-matrix caps.
- **Gesture**: flaps only flap when a value actually changes (one-shot per
  change — at rest the board is silent and static).
- **Details**: urgency is board-wide: amber tint under 7 days, warm red under
  24h, and the final hour shows seconds (the extra flap group slides in once);
  past-due flips the whole board to "DEPARTED".

### 4.15 Flashcards — *An index-card deck*
- **Material/type**: real index cards — white stock, red top rule, faint blue
  lines; content in `voice-page`; the deck's remaining cards visible as 2-3
  offset edges behind the current one.
- **Layout**: card face is everything; counters live as a small pencil tally on
  the deck edge.
- **Gesture**: **swipe to sort** — drag the card right ("knew it") or left
  ("again"), it slides off with a slight spin onto one of two visible piles;
  the next card slides up from the deck. Flip stays the existing 3D turn.
- **Details**: the "again" pile visibly grows fatter — your shame is spatial;
  finishing the deck squares both piles and offers "shuffle the misses".

### 4.16 Table — *A data slate*
- **Material/type**: dense `crt`-adjacent dark slate; mono numerals; header row
  as a machined rail.
- **Layout**: real spreadsheet behavior in miniature — a visible **cell cursor**,
  zebra rows, column edges draggable to resize.
- **Gesture**: keyboard-first: arrows move the cell cursor, Enter edits in place,
  Tab advances — no per-cell bordered inputs, the grid is the input.
- **Details**: selecting a column shows an automatic Σ/avg/count readout in the
  footer rail; column headers get type badges (text/number/date) that also set
  alignment.

### 4.17 Line Chart — *An oscilloscope*
- **Material/type**: `crt` face — near-black, faint graticule, the trace in
  phosphor glow (accent hue), a brighter dot at the newest sample.
- **Layout**: the scope face is the whole widget; latest/avg/max become a tiny
  HUD readout in a corner of the glass, mono, like scope cursors.
- **Gesture**: **draw on the glass** — click anywhere on the face to add a point
  at that position; drag existing points vertically to adjust. The A/B/C value
  boxes below the chart die entirely.
- **Details**: hovering the trace shows a crosshair cursor with the value ghosted
  next to it; wired `series` input pipes draw with a subtle one-shot sweep when
  new data arrives.

### 4.18 Mood Tracker — *A weather dial*
- **Material/type**: soft matte face; today's mood as a **weather glyph** (storm
  → rain → cloud → sun-behind-cloud → full sun) drawn large in the center.
- **Layout**: the five moods sit on a radial arc around the glyph like a volume
  knob's positions; a forecast strip of the last 7 entries runs along the bottom
  as tiny weather icons.
- **Gesture**: **turn the dial** — drag around the arc (with detents per mood) or
  click a position; the center glyph morphs and the card's ambient wash warms or
  cools with it.
- **Details**: the glyph morph is a one-shot crossfade+scale; the widget's
  wireable numeric value maps storm=1 … sun=5 exactly as now.

### 4.19 Calculator — *A pocket calc*
- **Material/type**: full retro homage — plastic body wash, a **solar strip**,
  an `lcd` display with dark liquid-crystal digits over ghost 8888 segments.
- **Layout**: chunky keypad with real key travel (2px press depth, keycap edge
  highlight); operator column in the classic orange; equals key double-height.
- **Gesture**: keys depress and the LCD updates with a barely-perceptible
  liquid-crystal lag (60ms transition) — the thing that makes LCDs feel real.
- **Details**: a thin paper **tape** slides up behind the display on demand
  showing the last few operations; divide-by-zero shows the authentic "E".

### 4.20 Sketchpad — *A chalkboard*
- **Material/type**: matte slate `chalkboard` with faint dust unevenness; wooden
  tray shadow along the bottom edge.
- **Layout**: tools live *in the tray* as physical stubs — two chalk pieces
  (white + accent), an eraser block; sizes chosen by how much of the stub you
  click (tip vs. side).
- **Gesture**: strokes render with a slightly rough chalk texture (pressure-
  width already possible from pointer events); the eraser leaves a faint smear
  rather than perfect deletion — wiping twice cleans fully.
- **Details**: picking up a tool tilts it out of the tray; "clear board" is a
  wipe animation sweeping once across (one-shot), leaving faint ghost dust.

## 5. Anti-uniformity rules (the checklist for every redesign PR)

1. **No mono-caps micro-label** inside these 20 unless the instrument's metaphor
   uses engraving (bezel devices). Labels become part of the material: engraved,
   printed, penciled, or absent.
2. **No bordered squircle input** unless the field is genuinely a form. Inline
   edit, drag-number, or direct manipulation instead.
3. **At least one non-stacked layout axis**: radial, columnar, grid, path — the
   row-stack is allowed only where the instrument is truly a list.
4. **One signature gesture** per widget, discoverable by pointer affordance alone.
5. **The accent must appear in the instrument's own vocabulary** (ink, phosphor,
   liquid, LED) — never as a generic tinted button.
6. **Idle = static.** Every animation above is one-shot on a state change, or
   driven only while the instrument is actively running (timer glow), and all of
   it disables under reduced motion and far zoom.

## 6. Rollout plan

| Phase | Scope | Notes |
|---|---|---|
| A | Parts bin: materials, type voices, inline-edit, drag-number, odometer, split-flap, dial gesture, physical DnD | Everything else depends on it; ~1 week |
| B | Paper family: Notes, Sticky, Checklist, Flashcards, Weekly Planner | One material system exercised five ways |
| C | Device family: Pomodoro, Timer, Counter, Calculator, Countdown | LED/bezel/split-flap; the flashiest wins |
| D | Board & data family: Kanban, Calendar, Table, Line Chart, Budget | Includes the two behavior upgrades (real DnD, cell cursor) |
| E | Expressive family: Habit, Progress, Goal Tracker, Mood, Sketchpad | Most bespoke illustration work |

Sequencing rationale: each phase ships a coherent *material family*, so partial
rollout never leaves one lonely odd widget — the canvas gains whole instrument
families at a time. Phases B–E are independent after A and can reorder freely.

## 7. Risks & mitigations

- **Kitsch drift**: skeuomorphism can rot into clip-art. Mitigation: materials are
  *suggested* (gradients, one texture, real typography), never photo-real; no
  bevel gets more than 2px; when in doubt, remove one prop.
- **Light theme**: every material needs a light interpretation (paper stays paper;
  CRT/LED faces stay dark islands intentionally — a scope is dark in any room).
  Decide per material in Phase A, not per widget later.
- **Perf**: textures are single data-URI backgrounds; digit rolls/flaps are
  transform-only; the only continuously-driven visuals (timer pulse, now-line)
  run strictly while their widget is active.
- **A11y**: dial, scrub, swipe, and punch all need keyboard/AT equivalents —
  the parts bin ships each primitive with its keyboard story built in, so no
  widget invents its own.
- **Familiarity loss**: the old idiom is uniform but learnable. Mitigation: the
  signature gesture always has a visible conventional fallback (Pomodoro keeps a
  start control; Kanban keeps arrows for keyboard; Flashcards keep prev/next).

---

# Part II — 30 More Instruments

Same contract, same parts bin, same anti-uniformity rules. Organized into six
instrument families so each material gets exercised several ways and partial
rollout ships coherent sets. Format: **Identity → Material & type → Layout →
Signature gesture → Details**.

## 8. The Eurorack family — the six logic widgets (the wiring story made literal)

The logic/automation widgets are the one group where engraved mono-caps is the
*correct* voice: they become **modular-synth modules** — matte dark-aluminum
faceplates, silkscreen-engraved labels, and **physical patch jacks that sit
exactly where the field ports are**, so plugging a wire into a widget finally
looks like plugging a cable into a jack. Tiny signal LEDs show live state. This
family alone transforms how the dependency system reads.

### 8.1 Number Input — *A fader module*
- Vertical fader with a machined cap (or rotary knob at micro size); value on a
  small LED readout; min/max engraved at the rail ends.
- **Gesture**: drag the fader with detents at step increments; double-click the
  LED to type.
- Output jack at the bottom edge glows faintly when wired; the LED readout uses
  the odometer roll.

### 8.2 Toggle — *A flip-switch module*
- One chunky two-position lever switch, engraved ON/OFF, a single LED above it.
- **Gesture**: the lever physically throws with a fast rotate + settle
  (one-shot); the LED floods on. The whole module face brightens slightly when
  true — downstream gates read at a glance.

### 8.3 Status — *A stack light*
- The four workflow states as a vertical signal-tower: four lamp segments
  (gray/blue/red/green), only the active lamp lit with a soft flood.
- **Gesture**: click a lamp to jump states, or click the tower base to advance
  to the next state in order.
- Progress output shown as an engraved percentage under the tower.

### 8.4 Branch Gate — *A railway switch*
- A track diagram: one input line splitting into TRUE/FALSE output lines, each
  ending in a labeled jack with an LED. A physical points-lever sits at the
  fork.
- **Gesture**: throw the lever — the track junction visually re-aligns (the
  active branch draws solid, the dead branch dashes out).
- The question text is a small station-sign plate above the fork, inline-editable.

### 8.5 Formula — *An op-amp module*
- Two input jacks (A, B) on the left, a rotary **operator selector** (＋ − × ÷)
  as a machined switch in the middle, result on an LED readout at the right.
- **Gesture**: turn the operator knob with hard detents; the result LED rolls.
- When both inputs are wired, A and B become read-only engraved values (the
  module makes the pipe-lock state physical).

### 8.6 Date Picker — *A date-stamp module*
- A rotary date stamp: three engraved bands (DD / MM / YYYY) like a library
  stamp wheel; "days until" on a small LED counter beside it, negative days in
  red.
- **Gesture**: roll each band vertically to set the date (odometer roll with
  band texture); a calendar pop stays as the fallback.

## 9. Desk & paper family (5)

### 9.1 Quote — *A letterpress broadside*
- Deckle-edged paper, a huge printed ornamental quotation mark, the quote set
  in large serif italic, attribution after an em-dash in small caps.
- **Gesture**: click the ornament to cycle three typographic settings
  (broadside / telegram / typewriter) — same data, different print job.
- No input box ever: the quote is inline-edited as finished typography.

### 9.2 Meeting Notes — *Steno minutes*
- Steno-pad paper with a center rule; the date arrives as a **received-stamp**
  in the corner; attendees clip to the top edge as small brass-clip chips.
- **Gesture**: an **ADJOURNED stamp** — one click stamps the end time diagonally
  and visually "closes" the sheet (dims to archive tone; still editable via
  "reopen").
- Action items are the only checkboxes, tinted like carbon copy.

### 9.3 Cornell — *The authentic Cornell sheet*
- The real template printed on paper material: narrow cue column with a red
  vertical rule, wide notes area, a summary band at the bottom on slightly
  darker stock.
- **Gesture**: select a phrase in the notes area and **drag it left across the
  red rule** — it becomes a cue, leaving a highlight where it came from.
- Each zone has its own type size (cues bold and sparse, summary italic).

### 9.4 Citation — *A library catalog card*
- An exact catalog-card homage: typewriter face, ruled lines, the punched
  drawer-hole die-cut at the bottom center.
- **Gesture**: the copy action **types the formatted citation out** onto the
  card line by line (fast type-on, one-shot) before it hits the clipboard.
- Style (APA/MLA/Chicago) selected via index tabs sticking out of the card top.

### 9.5 Outline — *Engineering drafting paper*
- Faint grid paper; outline depth shown as drafting **rail lines** down the left
  of each level (not just indentation) — level 2 hangs off level 1's rail.
- **Gesture**: collapsing a branch **folds the paper** — a one-shot crease
  appears with a "+n lines" note in the margin.
- Drag-reorder carries a paper ghost; keyboard Tab/Shift-Tab unchanged.

## 10. Study hall family (5)

### 10.1 Vocab — *A dictionary entry*
- Dictionary typography as the entire design: headword in bold serif,
  part-of-speech in italic abbreviation, definition indented with a hanging
  margin — each word is a real entry, not a table row.
- **Gesture**: swipe a **highlighter stroke** across a word to mark it learned
  (translucent marker wash, slightly overshooting the text like a real hand).
- The learned-count output becomes "n of m entries highlighted."

### 10.2 Quiz — *A scantron bubble sheet*
- Exam-paper pink/blue tint, questions numbered in a margin column, answers as
  **A–D bubbles** you fill; filled bubbles get pencil-scratch texture.
- **Gesture**: grading sweeps a **red pen** down the sheet — ticks and crosses
  drawn stroke by stroke, then the score circled at the top like a teacher's
  hand (all one-shot).
- Retake erases to faint ghost answers (you can see what you guessed last time).

### 10.3 Grade Calc — *A report card*
- Institutional heading rule, ruled subject rows, weights as small pencil
  annotations beside each entry.
- **Gesture**: the computed letter grade lives in a **red-ink circle stamp** at
  the bottom right; when the letter changes, the stamp re-thunks (scale-in with
  a slight rotation).
- The percent output rides under the stamp as a typewritten note.

### 10.4 Reading List — *A bookshelf*
- Entries render as **book spines standing on a shelf** — spine height/thickness
  varied deterministically from the title, spine hue from the title hash, titles
  set vertically.
- **Gesture**: **pull a spine** halfway out to mark "reading"; lay it flat on
  top of the row to mark "done" (the done pile grows horizontally).
- Queue/reading/done becomes physical shelf state; the count output reads "3 of
  9 shelved flat."

### 10.5 Assignment — *A manila folder*
- A folder with a die-cut tab carrying the assignment name; inside, the task
  sheet; a red **DUE stamp** whose ink darkens as the deadline approaches.
- **Gesture**: marking it complete **closes the folder** (flap folds over,
  one-shot) and stamps SUBMITTED across the tab.
- Days-remaining output is the stamp's engraved subtitle.

## 11. Time & measure family (4)

### 11.1 Stopwatch — *A chronograph*
- A watch face: analog sweep hand over a subdial, digital readout beneath,
  two **crown buttons** at the case edge (start/stop and lap) with real press
  travel.
- **Gesture**: crown presses; laps stack as engraved rows under the face with
  delta times.
- The sweep hand animates only while running (driven state); paused, the whole
  face is static paint.

### 11.2 World Clock — *A newsroom clock wall*
- Each timezone is a **round analog wall clock** with a city plaque beneath —
  the classic newsroom row. Cities currently in nighttime get dark faces with
  a small moon glyph.
- **Gesture**: adding a city "hangs" a new clock (drop-in one-shot).
- Hands update once per minute (visibility-aware, shared clock); no seconds
  hands — the wall is calm.

### 11.3 Timesheet — *A punch clock*
- A mechanical time-recorder: entries are **punched cards** with IN/OUT columns
  of stamped times; the total rides on an odometer; billable rows get a brass
  edge.
- **Gesture**: a physical **PUNCH lever** — pull it to stamp "now" into the open
  row (stamp thunk, one-shot). Manual time edits stay as drag-numbers.
- Currency/rate settings live on a small engraved plate, out of the main face.

### 11.4 Unit Converter — *A slide rule*
- Two engraved scales (source unit and target unit) mounted in a rail, with a
  **hairline cursor** across both.
- **Gesture**: **drag the slide** — the scales shift against each other and the
  hairline reads the conversion; type-to-set remains via clicking either value.
- Changing the unit pair swaps the engraved scales (one-shot crossfade).

## 12. Data & decision family (5)

### 12.1 Bar Chart — *A mixing desk*
- Each bar becomes a **channel fader**: vertical slider with a machined cap,
  value readout above, channel name on tape-label strips beneath.
- **Gesture**: *editing is the chart* — drag the fader caps directly; no value
  boxes anywhere.
- Wired inputs show a small jack LED per channel; the loudest channel's readout
  glows.

### 12.2 Pie Chart — *A plate*
- The pie sits on a ceramic plate ring; slices are matte with a thin gloss
  highlight; labels on small flag picks stuck into each slice.
- **Gesture**: **pull a slice** — click slides it out from the center to
  highlight it and reveal its exact value on the pick.
- Rotation drag lets you turn the plate to face any slice forward.

### 12.3 Metrics — *A cockpit cluster*
- Each KPI is an **instrument on a panel**: small round gauges for bounded
  values, odometer counters for totals, engraved labels beneath each.
- **Gesture**: gauges *sweep to their new value* when data changes (one-shot
  needle motion with a slight overshoot) — otherwise the panel is static.
- Deltas show as a tiny trend needle beside each instrument.

### 12.4 Timeline — *A metro line*
- Events are **stations** on a transit line: interchange rings, station names
  set at 45°, the line colored by the widget accent.
- **Gesture**: a **train marker** sits between stations proportional to today's
  date; past stations render filled, future ones hollow.
- Adding an event drops a new station and the line re-spaces (one-shot morph).

### 12.5 Pros & Cons — *A balance scale*
- A real beam scale: two pans labeled PRO and CON; each argument is a **weight
  token** whose physical size reflects its importance.
- **Gesture**: adding, removing, or resizing a weight **re-tilts the beam**
  (one-shot rotation with a settle wobble). The verdict is the tilt.
- Tokens are inline-editable; dragging a token to the other pan converts it.

## 13. Workshop & studio family (5)

### 13.1 Inventory — *A parts-bin shelf*
- Items are **labeled bins in a grid**, each showing its fill level as physical
  contents; low-stock bins glow amber from inside; empty bins show bare bottom.
- **Gesture**: scrub quantity by dragging vertically inside a bin (contents
  rise/fall); a restock visibly *pours* (one-shot fill).
- The low-stock count output is a red tag hanging off the shelf edge.

### 13.2 Logbook — *A ship's log*
- Dark leather-bound tone with a ruled log page; every entry begins with an
  **auto-inked timestamp** in the margin (typed for you, in a different ink).
- **Gesture**: flagging an entry as a warning hoists a small maritime signal
  flag in its margin.
- Entries are append-only in spirit: edits show a thin strike + rewrite rather
  than silent replacement (a log you can trust).

### 13.3 Contact — *A rolodex card*
- A rotary-file card: punched rail cut into the bottom edge, name in raised
  type, fields as printed lines with inline edit; the card sits in a visible
  rolodex frame.
- **Gesture**: with multiple contacts, **roll the wheel** — cards flip over the
  rail (one-shot page rotation) instead of paging buttons.
- Call/email become punched icon holes that act as links.

### 13.4 Color Palette — *A paint fan deck*
- Swatches are **fan-deck chips** — elongated, stacked at a slight pivot like a
  physical fan, each printed with a paint-brand-style name and hex.
- **Gesture**: **spread the fan** by dragging; clicking a chip pulls it out of
  the fan and copies its hex (chip-pull one-shot + toast).
- Adding a color slides a new chip into the fan; the pivot point is the card
  corner.

### 13.5 Code — *A terminal*
- Window chrome with the three traffic-light dots, `~/snippet.ts` as a shell
  prompt in the title row, phosphor-tinted mono text on near-black, block
  cursor that blinks **only while focused**.
- **Gesture**: the copy action flashes the buffer like a `cat` (quick full-text
  highlight sweep) before copying.
- The language tag becomes part of the prompt line, not a chip.

## 14. The bench — 10 more, one line each (next in line, not yet specced)

- **Poll** → a tally board: votes chalked as five-bar gate marks.
- **Rating** → judge's paddles: cards held up 0–10, flip on change.
- **Priority Matrix** → radar quadrant board: blips you drag between quadrants.
- **SWOT** → war-room whiteboard: four taped-off quadrants, marker type.
- **Process** → conveyor line: stages as belt sections, items advance physically.
- **Risk Register** → hazard placard board: risks as diamond placards sized by score.
- **Media** → a lightbox: images on backlit film, polaroid frame for singles.
- **Audio Player** → a cassette deck: reels that turn only while playing.
- **Dialog** → a screenplay page: CHARACTER / dialogue formatting as the editor.
- **AI Generator** → a séance radio: tune the dial, the answer fades in on the band.

## 15. Rollout continuation

| Phase | Scope | Notes |
|---|---|---|
| F | Eurorack family (6 logic modules) | Highest leverage: transforms the wiring story; jacks must align with existing port geometry |
| G | Desk & paper II + Study hall (10) | Reuses Phase B materials almost entirely |
| H | Time & measure + Data & decision (9) | Chronograph and slide rule share dial/scrub primitives from Phase A/C |
| I | Workshop & studio (5) | Bookshelf, fan deck, rolodex — the most bespoke illustration work |
| J | The bench (10) | Spec as demand emerges |

New parts-bin additions required by Part II: **jack/LED module kit** (Phase F),
**stamp one-shot** (received/adjourned/due/submitted/grade all share it),
**pencil/pen stroke renderer** (quiz grading, checklist strike, tally marks),
and **scale-pair slide gesture** (slide rule). Everything else reuses Part I
primitives.

---

# Part III — The Final 23 (every remaining registry widget)

This completes the catalogue: all 73 registry types now have an instrument
identity. The ten bench one-liners from §14 are expanded to full specs here and
§14 is superseded. Same contract, same format.

## 16. Canvas furniture (2)

### 16.1 Canvas — *A porthole*
- **Material/type**: a deep beveled window frame set into the card — you are
  looking *into another room*.
- **Layout**: inside the glass, a live **constellation map** of the child
  canvas: one glowing dot per widget, positioned at its real coordinates and
  colored by its accent. Cheap to render (dots from store data, no nested
  widget rendering) and genuinely informative — a busy child canvas *looks*
  busy through the glass.
- **Gesture**: double-click dives in; the frame swells toward the viewport as
  the transition (one-shot zoom-through).
- **Details**: widget count engraved on a small brass plate under the window;
  an empty child canvas shows faint fog instead of dots.

### 16.2 Divider — *A surveyor's plaque*
- **Material/type**: a brass section plaque with the label engraved, mounted on
  a hairline rule that runs the card's width.
- **Gesture**: click the plaque to edit inline; the rule extends from under the
  plaque with a one-shot draw when first placed.
- **Details**: low-contrast diagonal hatching at the rule's far ends (surveyor
  tape); at far zoom the plaque is exactly what LOD keeps — dividers are
  navigation landmarks.

## 17. Typographic & paper additions (4)

### 17.1 Bullets — *A modernist poster*
- **Material/type**: the one deliberately *typographic* instrument: dark poster
  board, tight grotesque type, oversized geometric markers (● ▲ ■) in the
  accent — Bauhaus list, not notebook list. Contrast against the paper family
  is the point.
- **Gesture**: click a marker to cycle its glyph; nesting shifts both indent
  and marker shape.
- **Details**: the first item can be promoted to a poster headline (bigger,
  no marker) by clicking its marker away entirely.

### 17.2 Dialog — *A screenplay page*
- **Material/type**: script-white paper with two brads punched at the left
  edge; Courier voice; screenplay formatting *is* the editor — CHARACTER names
  centered in small caps, dialogue indented, parentheticals italic.
- **Gesture**: Enter after a line auto-alternates to the other character; Tab
  cycles/creates character names. No fields anywhere — you just write the
  scene.
- **Details**: empty state reads "FADE IN:"; a long scene gets a "CONT'D" mark
  when it scrolls.

### 17.3 Form — *A clipboard*
- **Material/type**: a metal clip at the top holding a printed form; labels in
  printed type, answers in inline handwriting voice; required fields marked by
  small red asterisk stamps.
- **Gesture**: when every required field is filled, the clip visibly **snaps**
  (one-shot) and a FILED stamp becomes available; stamping it emits the
  completion output.
- **Details**: completion progress is a fill meter etched into the clip itself;
  adding a field slides a new printed line out from under the clip.

### 17.4 Daily Agenda — *A register receipt*
- **Material/type**: thermal receipt paper — slightly curled bottom edge,
  perforation across the top, dot-matrix voice; times printed in the left
  margin column.
- **Gesture**: adding an item **prints it** — the paper extends downward with a
  fast one-shot feed; completing an item punches a hole through its line.
- **Details**: the current time slot is marked by the printer-head line (a
  thin highlight bar that moves per-minute, driven by the shared clock only
  while today); end of day prints a total line ("6/8 done — thank you, come
  again").

## 18. Boards & rooms (5)

### 18.1 SWOT — *A war-room whiteboard*
- **Material/type**: whiteboard white with **masking-tape cross** dividing the
  four quadrants; each quadrant writes in a different marker color; S/W/O/T
  stenciled faintly behind the text.
- **Gesture**: type anywhere in a quadrant; drag an item across the tape to
  reclassify it (it re-inks in the destination color).
- **Details**: quadrant counts as small magnet chips in each corner; a crowded
  quadrant's tape edge buckles slightly — the board itself shows imbalance.

### 18.2 Poll — *A chalk tally board*
- **Material/type**: chalkboard reuse; options as chalk rows; votes as
  **five-bar-gate tallies** (four strokes and the diagonal fifth), drawn stroke
  by stroke with the pen renderer.
- **Gesture**: tap a row to add a vote — the tally stroke draws itself; the
  leading row gets a hand-drawn chalk underline that redraws when the lead
  changes.
- **Details**: vote totals in a chalk circle at row end; resetting wipes the
  board with the one-shot eraser sweep from Sketchpad.

### 18.3 Priority Matrix — *A radar scope*
- **Material/type**: `crt` reuse — four quadrants on a radar face (DO /
  SCHEDULE / DELEGATE / DROP engraved at the rim), range rings, a **static**
  sweep wedge (no idle rotation — the sweep is paint, not animation).
- **Gesture**: tasks are **blips** with callsign labels; drag a blip between
  quadrants to re-triage; a blip entering the urgent-important quadrant pings
  once (one-shot ring).
- **Details**: blip brightness = recency; the DROP quadrant renders blips
  half-faded — the scope already tells you to let them go.

### 18.4 Risk Register — *A hazard board*
- **Material/type**: safety-notice board; each risk is a **diamond placard**
  (road-sign language) whose size and color scale with likelihood × impact;
  mitigation notes hang beneath on a tag.
- **Gesture**: drag a placard between the board's severity zones to re-score it
  (likelihood/impact update from the drop position).
- **Details**: a small odometer in the board corner reads "days since last
  incident" (resets when any risk is marked as fired — dark humor, real
  utility); resolved risks get bagged in a translucent sleeve.

### 18.5 Process — *A conveyor line*
- **Material/type**: stages as **belt sections** with roller texture, connected
  end to end; items as small crates riding the belt; the active stage sits
  under a gantry work light.
- **Gesture**: advance an item by pushing its crate — it slides to the next
  belt section (one-shot travel with a bump at arrival).
- **Details**: per-stage counts as stenciled bin numbers; a stage over its
  limit piles crates visibly askew; the DONE end of the line drops crates onto
  a pallet stack.

## 19. Judgement instruments (3)

### 19.1 Decision — *A gavel docket*
- **Material/type**: a court docket sheet; options listed as case lines with
  their scores as clerk's pencil notes; a small gavel rest at the bottom.
- **Gesture**: **strike the gavel** to commit — one-shot strike, the chosen
  option gets a VERDICT stamp and the others are struck through in clerk's
  ink. Un-deciding lifts the stamp to a ghost (visible history of reversals).
- **Details**: while undecided, the leading option carries a light pencil
  check that moves as scores change — the docket leans before it rules.

### 19.2 Decision Matrix — *A judges' scorecard*
- **Material/type**: competition scorecard sheet: criteria as judge rows with
  their weights on armbands, options as columns; each cell is a small held-up
  scorecard.
- **Gesture**: scrub any scorecard to re-score (drag-number); the winning
  column stands on a **podium** — it rises a few pixels with a gold rail
  under its header, and re-ranks live as scores change.
- **Details**: weighted totals print along the bottom in judge's ink; a tie
  shows two silver podiums and no gold (the sheet refuses to lie).

### 19.3 Rating — *Judges' paddles*
- **Material/type**: a row of score paddles (stars or 0–10) held in a rack;
  wooden paddle stock, stenciled numerals.
- **Gesture**: drag across the rack — paddles **flip up sequentially** to your
  score (staggered one-shots, Olympic-judge style); tap a paddle for a direct
  set.
- **Details**: the label rides a small plaque under the rack; a max score
  flips all paddles plus a tiny confetti-free flourish (the last paddle
  overshoots and settles).

## 20. Academy additions (3)

### 20.1 GPA — *A brass plaque*
- **Material/type**: engraved brass: the GPA number deep-stamped in the center
  (odometer digits in brass), institution-style border line; semesters as
  small sub-plates beneath.
- **Gesture**: scrub a semester's GPA/credits on its sub-plate; the master
  number re-rolls with a metallic settle.
- **Details**: meeting/exceeding a target embosses a laurel ring around the
  number; below target, the plaque stays plain — no shame states, absence is
  the signal.

### 20.2 Formula Sheet — *A blueprint*
- **Material/type**: cyanotype — white linework on Prussian blue; formulas in
  chalk-white math script; a proper **title block** in the corner (sheet no.,
  revision, date) like an engineering drawing.
- **Gesture**: click a formula to spotlight it — others dim to faint linework;
  copy stamps "ISSUED" in the title block's revision row (one-shot).
- **Details**: section headers render as drawing zone labels (A1, B2) along
  the sheet edge; adding a formula draws its rule box first, then the text.

### 20.3 Study Goal — *A registrar's card*
- **Material/type**: registrar record card — heavy stock, ruled progress
  ledger, institutional type; the goal reads like a course requirement line.
- **Gesture**: logging a session punches a small stamp into the ledger row
  (stamp one-shot, date auto-inked); the ON TRACK / BEHIND assessment appears
  as a registrar's mark that updates with pace.
- **Details**: pace math becomes visible as "required per week vs. actual"
  printed in the card footer; completing the goal earns a corner seal
  (embossed, quiet).

## 21. Cabinet & studio additions (4)

### 21.1 Links — *A card file*
- **Material/type**: a card-file drawer viewed from above: each link is a
  colored **index tab** sticking up, favicon dot and short label printed on
  the tab.
- **Gesture**: click a tab to pull its card up (title, URL, note on the card
  face); click the raised card to open the link; drag tabs to reorder.
- **Details**: dead/duplicate links show a dog-eared tab; groups become tab
  colors; the raised card casts a shadow back into the drawer.

### 21.2 Media — *A lightbox*
- **Material/type**: a backlit film-viewing table — the media area glows from
  beneath; multiple images sit as **mounted slides** with thin frames; a
  single image gets a Polaroid frame with a handwritten caption strip.
- **Gesture**: click a slide to put it **on the loupe** (enlarges over the
  table, one-shot); drag slides to reorder on the light surface.
- **Details**: video thumbnails wear a film-leader countdown ring; audio files
  render as a slide with a waveform contact print.

### 21.3 Audio Player — *A cassette deck*
- **Material/type**: a deck faceplate: cassette window showing **two reels**
  (they rotate only while playing — a driven state, never idle), track name
  handwritten on the cassette label, transport as chunky piano keys.
- **Gesture**: piano-key transport with real key travel and a mechanical
  clunk; scrubbing drags the tape between reels (reel ratios shift with
  position).
- **Details**: a VU needle bounces gently only during playback; pause leaves
  the needle frozen mid-swing — exactly like the hardware.

### 21.4 Game Tuner — *A test-bench console*
- **Material/type**: aluminum rack unit: big machined knobs for each tunable
  (grip, drift, feel…), engraved scales, a small **telemetry readout** showing
  the response curve implied by current settings.
- **Gesture**: knobs with fine detents (shift for micro-adjust); flipping a
  red **missile-switch guard** and pressing the button beneath resets to
  defaults — destructive actions should feel ceremonial.
- **Details**: each knob's jack can be wired (Eurorack family compatibility);
  a changed-from-default knob gets a small witness mark on its scale.

## 22. The Eurorack extension + the oracle (2)

### 22.1 Text Input — *A label maker*
- **Material/type**: Eurorack faceplate consistency; the value renders as an
  embossed **Dymo-style label strip** — white raised letters on the tape,
  slightly overshooting shadow.
- **Gesture**: click the strip to type; each character embosses with a subtle
  punch (per-keystroke micro-pop, transform-only); the strip feeds out of a
  slot as it lengthens.
- **Details**: output jack at the strip's end; multiline mode stacks tape
  strips; empty state shows a blank tape stub poking from the slot.

### 22.2 AI Generator — *A séance radio*
- **Material/type**: a vintage valve radio: warm wooden cabinet wash, a wide
  **frequency band display**, a paper slip slot beneath, valve glow visible
  through side vents (glow only while working).
- **Gesture**: the prompt is written on a **paper slip** that feeds into the
  slot on submit (one-shot); while generating, the needle wanders the band
  and the valves warm; the answer **prints out as ticker tape** below —
  tearing off the tape (click) converts it into a Notes card.
- **Details**: errors tune to static — the band display fuzzes and the slip is
  returned; idle state is a completely dark, silent cabinet. The most
  theatrical instrument, and it earns it: this is the app's one genuine
  magic act.

## 23. Rollout completion

| Phase | Scope | Notes |
|---|---|---|
| K | Canvas furniture + typographic (6): canvas, divider, bullets, dialog, form, daily_agenda | Small, mostly material + type work |
| L | Boards & rooms (5): swot, poll, priority_matrix, risk_register, process | Reuses chalkboard, CRT, tape, pen renderer |
| M | Judgement + academy (6): decision, decision_matrix, rating, gpa, formula_sheet, study_goal | Stamp/scorecard/plaque kit; blueprint is the one new material |
| N | Cabinet & studio (4): links, media, audio_player, game_tuner | Deck and lightbox are the largest builds here |
| O | Label maker + séance radio (2) | The radio ships last, polished — it's the demo centerpiece |

Part III's only new parts-bin entries: the **blueprint material**, the
**placard/diamond shape kit** (risk register, and reusable for warning states
elsewhere), and the **ticker-tape print-out** (séance radio, receipt agenda
shares the paper-feed motion). Everything else is reuse — which is the health
check that the system is converging rather than sprawling: 73 widgets, ~7
materials, ~4 type voices, one parts bin.
