# The Grovepad Widget Constitution

*Ratified by architectural audit of the full codebase. Binding for every new `ModuleType` proposed for the registry.*

---

## Preamble — What Grovepad Actually Is

Grovepad is not a note-taking app with widgets bolted on. It is a **personal operating surface**: an infinite spatial canvas where thoughts, trackers, plans, and life-admin live as typed cards that wire into each other through a deterministic dependency graph. The canvas replaces the "one app per life domain" paradigm with a single, zoomable map where everything coexists — and, critically, where things *react to each other* without the user writing code.

The core value this app delivers is the wire graph: a living network where outputs from one card gate, trigger, and feed others. Every new widget should exist in service of that network — either as a useful node inside it, or as a high-quality self-contained tool that is meaningfully better than having users assemble something clunkier from separate pieces.

---

## Article I — The Existence Test

A proposed widget must pass the following Articles. The spirit of this constitution is **not** to create an exhaustive bureaucratic checklist — it is to prevent one specific disease: *boring, dead-end widgets that sit on the canvas doing nothing and helping nobody*.

> [!IMPORTANT]
> The registry already contains 100+ widget types. Every new type permanently increases the surface area of the picker modal, the interpreter's pattern space, the field registry, the renderer switch, and the persistence schema. A widget that adds nothing meaningful is permanent debt. The bar is real — but it is not impossibly high.

---

## Article II — The Consolidation or Novelty Test

**A widget must either (A) consolidate a domain of concern that would otherwise require cluttering the canvas with 2–3 separate cards, or (B) introduce genuinely novel behaviour that cannot be composed from existing primitives.**

The key question is not "could you technically build this from other widgets?" but rather: **"Would building this from other widgets create meaningfully worse UX — more cards, more wiring, more cognitive load — than having a single dedicated card?"**

### What passes

- **Consolidation widgets** — A widget that bundles a related domain (e.g., medication tracking: doses, count, refill runway) into one focused card is valid even if a sophisticated user could theoretically stitch it from tables and counters. The *integration of state* and the *domain-specific UI* (a pill counter that resets daily, not a generic number_input) is the value.
- **Novel algorithm or interaction** — A widget that performs domain-specific computation (amortization, weighted settlement, recipe scaling, debt strategy) that primitives genuinely cannot replicate.
- **Domain-specific workflow card** — A widget designed around a specific recurring human workflow (meal planning, job hunt pipeline, workout logging) where the opinionated structure is the product, not a limitation.

### What fails

- **Exact duplicates of existing widgets.** A widget that is functionally identical to an existing type with only cosmetic differences. Example: `pomodoro` is a `timer` pre-set to 25 minutes with a break phase. The only difference is a numeric preset and a label switch — this belongs as a *mode or preset* of `timer`, not a separate registry entry.
- **Pure decorations.** A widget whose entire purpose is to look nice on the canvas and which carries no state, produces no output, and accepts no input that any other widget would care about.
- **Search and replace.** A widget that already exists under a different name. Adding `Daily Planner` when `daily_agenda` already exists is not a new widget — it is a rename.

### Worked Examples

- ❌ **`pomodoro`** — A `timer` with `workMinutes: 25` and a break phase. The break phase is a second timer state, achievable with a `sequencer` + `timer` + `clock_pulse`. Not a new widget — a `timer` preset.
- ❌ **"Grocery List"** — A checklist with a category column. This is `checklist` + a label convention. Ship as a template.
- ❌ **"Simple Notepad"** — Indistinguishable from `notes`.
- ✅ **`debt_payoff`** — Contains iterative amortization math (snowball/avalanche, compounding APR). Cannot be replicated with `formula` primitives.
- ✅ **`meal_planner`** — A 7×3 grid of slots that natively wires to `recipe.servings` and aggregates a shopping list. Composing this from generic tables would destroy the UX.
- ✅ **`chore_rotation`** — Stateful modular rotation logic across a named people list, advancing on command. No combination of existing primitives achieves this cleanly.
- ✅ **`sketchpad`** — A freehand drawing surface. Completely impossible to replicate with any other widget.

---

## Article III — The Wire Graph Citizenship Rule

**A widget should meaningfully engage with the Unified Dependency Framework. It must not be a category-one dead-end by design.**

This is the core spirit of the constitution. The wire graph is what makes Grovepad different from a whiteboard or a collection of sticky notes. A widget that permanently and intentionally sits outside the graph — producing nothing that downstream widgets can consume, accepting nothing from upstream — is a parasitic citizen of a canvas built for interconnection.

### What this means in practice

- A widget does **not** need to expose fields. Some widgets are structural (`canvas_node`) or creative (`sketchpad`) and their role on the canvas is valid without wire ports. These are **intentional exceptions** — their value is architectural, not computational.
- A widget that *could* expose useful outputs but deliberately does not is a failure. If your widget computes a total, a count, a status, a boolean — that value belongs in the field registry as a source port. Not exposing it is lazy.
- There is **no minimum field count**. There is only the question: *"Has every meaningful piece of computed state been exposed as a bindable field?"* If yes, the widget passes regardless of how many fields that is.

### Article III.1 — Inputs get the same discipline as outputs

*Ratified 2026-07-13, after a full I/O coverage audit found 42 of 202 widget types (~21%) accepted no wire input at all, and one (`world_clock`) had neither an input nor an output despite not being on the exemption list — a straightforward oversight, now fixed.*

Everything Article III says about outputs applies symmetrically to inputs, with the same non-mandate: **there is no minimum input count, only the question of whether an obvious one is missing.** A widget with zero inputs is not automatically a failure — many are legitimate sinks whose own UI *is* the input mechanism (`table`, `calculator`, `bar_chart`: a user types rows directly; there is no single value a remote wire would sensibly set). Forcing an input onto a widget with no natural one is the same anti-pattern as forcing an output nobody would wire — field bloat nobody asked for.

The failure mode is narrower and sharper: **a widget with an obvious, single, wire-driven action that is simply missing.** The test for any zero-input widget, new or existing:

> *"Is there a natural single action here that a wire ought to be able to trigger? If yes and it's absent, that's the bug. If genuinely no, the widget just isn't that kind of widget — leave it alone."*

The most common shape of the missing action is **append one record from an incoming value** — a list/record widget (`checklist`, `bullets`, `links`, `kanban`, `decision`, and most of the Life-domain trackers) that can be *read* from but never *grown* by a wire. Every widget of this shape should expose an `add_item` command (see the recipe below) unless there's a specific reason its record shape is too ambiguous for a single incoming value to resolve (e.g. `pros_cons` has two arrays and no way to say which one a bare value belongs to — that's a legitimate exemption, not laziness).

**The `add_item` recipe.** Because [trigger wires can now carry a payload](#article-iii2--payload-carrying-trigger-wires) (the source field's live value, transformed), a list-shaped widget's append action is one command, one wire:

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

Rules for this recipe:
- Always default to a sensible non-empty label when the payload is empty — an appended-but-blank row is a worse first impression than a placeholder.
- Set `acceptsPayload: true` so the wire inspector knows to offer a transform for this trigger (formatting the payload before it lands, e.g. prefixing a source tag).
- Coerce with the same tolerant `text()`/`num()`/`bool()` helpers every other setter uses — a payload of the wrong raw type must never throw.
- If the widget has more than one plausible target array (which list does a bare value join?), that ambiguity is a real reason to skip the pattern, not a reason to guess.

### Article III.2 — Payload-carrying trigger wires

*Also ratified 2026-07-13.* Trigger-wire commands (`CommandDescriptor.run`) receive an optional second argument: the source field's current value, passed through the wire's transform. Commands that don't care about it simply omit the parameter — every command written before this amendment needs no change (`run: (d) => ...` remains a valid implementation of `run: (data, payload?) => ...`). Commands that do care about it (the `add_item` family above) accept it and set `acceptsPayload: true`.

This closes what used to be a real gap: moving one payload into a command required **two wires** — a value wire staging it into a scratch field (the convention the automation-core widgets used, wiring `text_input.value → automation.input` then `manual_trigger.count → automation.execute`), plus the trigger. One wire, one action, is now possible for any command author who wants it.

### Article III.3 — Semantic unit tags (advisory, never gating)

*Also ratified 2026-07-13.* A `FieldDescriptor` may carry an optional `unit?: SemanticUnit` (`percent | ratio | currency | count | duration_s | date_iso | none`) on top of its raw `valueType`. This is **purely advisory** — it never blocks a connection. Grovepad's wiring stays a patchbay in the Eurorack sense (see `widget-instrument-redesign.md` §8): anything can patch into anything, and a nonsensical patch produces a visible, fixable, nonsensical result rather than a rejected gesture.

What the tag *does* do: the instant a value wire connects two tagged fields, `suggestTransform(fromUnit, toUnit)` in `src/types/circuit.ts` prefills the new connection's transform instead of defaulting to identity — e.g. a `ratio`-tagged output into a `percent`-tagged input arrives pre-scaled by 100. The matrix is deliberately small and conservative (only pairs with one obviously-correct answer); an unmatched pair gets no suggestion, not a wrong one. `src/widgets/fields/atlas.ts` infers units automatically from field key names for the 49 Atlas-pattern widgets (`inferUnit`), so new fields in that family get tagging for free by naming convention (`*_pct`, `*_total`, `*_count`, etc.) — no per-field authorship needed.

New fields should set `unit` whenever one clearly applies; there is no requirement to tag everything, and an untagged field is not a constitution violation — it just gets no auto-suggestion.

### Article III.4 — Port-rail geometry and visual language

Inputs and outputs are separate visual systems even when they share the dependency engine. **Inputs leave the left edge; outputs leave the right edge.** Every port on a rail is distributed evenly across the entire usable side, from the top rounded-corner clearance to the bottom clearance. Dense rails compress their spacing; they never overflow above or below the widget, cluster arbitrarily at center, or disagree with the wire endpoint.

The visible dot, its hover target, drop hit-test, and dependency-line endpoint must all use the same pure geometry source. Dependency paths reuse the obstacle-aware visual routing vocabulary of relation lines, but keep their own I/O direction, typed port colors, interaction state, and execution semantics. The standardized high-contrast port palette is: number blue, boolean green, text violet, series amber, and trigger rose. Hover targets may extend invisibly beyond the dot (and grow slightly on expanded cards), but must not change the drawn endpoint or steal ordinary content interaction at rest.

### Intentional exceptions (structural widgets)

The following widget roles are exempt from field requirements because their value is spatial and organizational, not computational:

| Widget | Reason for exemption |
|:---|:---|
| `canvas_node` | Nests entire canvases. Navigation, not computation. |
| `sketchpad` | Freehand drawing. Creative surface, not a data source. |

Any new widget claiming this exemption must have an equally clear spatial or creative purpose. "We didn't get around to adding fields" is not a valid reason.

### Field quality rules

- **Source fields must be derived.** A source that simply re-exports a user-typed string verbatim adds nothing to the graph. Expose computed, aggregated, or state-derived values: totals, counts, booleans, deltas, dates-until.
- **Writable fields must accept coerced values safely.** The field engine coerces types via `num()`, `text()`, `bool()` in [fields.ts](file:///Users/amir-hamza/grovepad/src/widgets/fields.ts#L106-L124). A writable field must not break when it receives the wrong type.
- **Command targets must be idempotent.** The engine may fire the same command multiple times per wave. A command handler that corrupts its own state on re-entry is a bug.

---

## Article IV — The Redundancy Gate

**A new widget must not be a reskin, preset, or thin wrapper of an existing widget.**

Before any new widget is built, check every existing type in the registry. If the proposed widget differs from an existing one only by:
- Different default numeric values (different preset times, amounts, quantities)
- A label or title change
- A minor layout rearrangement of the same data fields
- Removal of features from an existing widget to make it "simpler"

...then the right answer is to extend the existing widget (add a mode, a preset, a config option), **not** to create a new registry entry.

### The Redundancy Test

Ask: *"Could an experienced user achieve what this widget does by simply customizing an existing widget's settings?"* If yes — extend, do not add.

| Proposed | Verdict | Because |
|:---|:---|:---|
| `pomodoro` | ❌ Redundant | It is `timer` with preset values and a phase label. Extend `timer` with a focus-mode preset. |
| `daily_standup` | ❌ Redundant | It is `meeting_notes` with different section labels. Extend `meeting_notes`. |
| `expense_split` | ✅ Not redundant | The minimal-transfer settlement algorithm is not a `budget` mode. |
| `workout_plan` | ✅ Not redundant | Sets × reps × weight progression tracking is not a `checklist` variant. |

---

## Article V — The "Actually Useful to Someone" Test

**A widget must target a real, recurring human friction — not a hypothetical or a novelty.**

A proposed widget must be grounded in a specific, describable, real-world pain point that a real category of user experiences with meaningful frequency. Novelty, aesthetic appeal, or technical impressiveness are **not** sufficient justifications on their own.

### The friction question

The proposer must be able to answer in one sentence: *"Who specifically is this for, and what stops them from doing it today without this widget?"*

Good answers:
- "Freelancers who forget to follow up on invoices — currently they lose track in email."
- "People managing shared trip expenses — currently they do this in a spreadsheet that nobody updates."
- "Renters who forget when their appliances need service — currently they just don't do it."

Bad answers:
- "It would be cool to have."
- "Some people might want this."
- "I personally wanted it once."

---

## Article VI — The Discoverability Floor

**A widget must be findable by someone who has never heard of it.**

A widget buried in a 100+ item picker scroll is effectively invisible. Every new widget must support at least **one** of the following discoverability paths:

1. **Thought interpreter** — The [thoughtInterpreter](file:///Users/amir-hamza/grovepad/src/utils/thoughtInterpreter.ts) can surface it from ≥2 natural phrases a user might type.
2. **Scenario archetype** — A relevant scenario in the [scenarioResolver](file:///Users/amir-hamza/grovepad/src/utils/scenarioResolver.ts) recommends it.
3. **Picker search** — The `label` and `description` contain the words a user would actually type when searching for it.

All three is ideal. At least one is required. The `description` field must be a verb-phrase of ≤10 words that communicates *what the widget does*, not what *category* it belongs to.

---

## Article VII — The Data Schema Hygiene Rules

**A widget's `defaultData()` must produce a value that is immediately renderable, serializable to JSON, and survivable across persistence roundtrips.**

### Schema Rules

1. **No `undefined` values.** Every field in the data interface must have a concrete default. `null` is permitted only for explicitly nullable fields (e.g., `pickedIndex: null`).
2. **All IDs via `crypto.randomUUID()`.** Never use incrementing integers, timestamps, or Math.random() for item IDs.
3. **Dates as ISO 8601 strings** (`YYYY-MM-DD`), never as `Date` objects or epoch numbers in stored data. Epoch numbers are permitted only for transient runtime state (e.g., `lastFiredAt` timestamps).
4. **No circular references.** The data blob must survive `JSON.parse(JSON.stringify(data))` without loss.
5. **Flat over nested.** Prefer arrays of objects over deeply nested trees. The persistence layer serializes the entire widget data blob; deeply nested structures increase serialization cost and diff complexity.
6. **Starter content must be non-empty.** `defaultData()` should produce a widget that *shows something* on first render — a sample row, a placeholder entry, a pre-filled label. A blank-on-creation card is bad first-impression UX.

---

## Article VIII — The Performance Contract

**A widget MUST NOT degrade canvas performance below the existing baseline.**

### Hard Limits

| Metric | Budget |
|:---|:---|
| **No `backdrop-filter`** | Prohibited in widget bodies — causes compositing layer explosion on dense canvases |
| **No `setInterval` / `setTimeout`** | Use the shared clock hook `useSharedClock` for time-driven updates; never create per-widget timers |
| **No layout thrashing** | Widget renderers must not read DOM geometry (`getBoundingClientRect`, `offsetWidth`) during render |
| **Field `get()` computation** | Must be fast enough to not stall a 32-hop propagation wave — avoid synchronous heavy math in hot-path getters |

---

## Article IX — The Nomenclature Standard

**Widget names must be concrete nouns or noun phrases that describe the *thing*, not the *action*.**

### Naming Rules

| Rule | Good | Bad |
|:---|:---|:---|
| Use a concrete noun | `Debt Payoff`, `Recipe`, `Guest List` | `Track Your Debt`, `Cook Something`, `Manage Guests` |
| ≤3 words in `label` | `Expense Split` | `Shared Expense Calculator and Splitter` |
| ≤10 words in `description` | `Calculate the smallest fair settlement` | `A widget that helps you and your friends figure out who owes what` |
| No redundant "Widget" or "Card" suffix | `Subscriptions` | `Subscription Tracker Widget` |
| `type` key is `snake_case` | `keep_in_touch` | `keepInTouch`, `KeepInTouch` |

---

## Article X — The Domain Pack Gating Policy

**Widgets that serve a narrow life domain should be gated behind a `DomainPack` to prevent picker bloat.**

### Gating Rules

| Widget Category | Pack Gating |
|:---|:---|
| **Structure, Notes, Planning, Data** | Never gated. Universal primitives. |
| **Automation & Logic** | Never gated. Wire graph connective tissue — gating breaks composition. |
| **Study** | Ungated in v1 (core early audience). |
| **Life** (money, health, food, people, work) | Always gated behind the `life` pack. |
| **Specialist** (game_tuner, audio_player, domain-specific tools) | Always gated behind their specific domain pack. |

If a widget would feel bizarre on a student's exam-prep canvas or a project manager's sprint board, it belongs in a pack.

---

## Article XI — The Proposal Requirements

**Before any code is written, the proposer submits a written proposal that answers:**

1. **The friction.** Who is this for and what do they currently do instead? One sentence.
2. **Why not compose it?** If existing widgets could approximate this, explain concretely why the approximation is worse — more cards, more cognitive load, worse UX.
3. **The wire story.** At least one real example of this widget connected to at least one other widget on a canvas. Show the field connection (source → target, type).
4. **The redundancy check.** Which existing widget(s) are most similar, and why this is not a preset or extension of any of them?
5. **The data shape.** The proposed `XData` TypeScript interface and `defaultData()` value.
6. **The field list.** Every bindable field (`FieldDescriptor`) the widget will expose, with `get`/`set` where applicable.

---

## Article XII — The Registry Fit Check

Before merging, verify:

- The `type` key does not collide with or confuse any existing type.
- The `category` placement makes sense in the picker modal's visual grouping.
- The `accent` color is not identical to an adjacent widget in the same category.
- The `defaultSize` is grid-aligned (`height` in multiples of `GRID_SIZE = 40`).
- The renderer is lazily imported in `WidgetRenderer.tsx`.
- The field descriptors are registered in `fields.ts` (or `fields/expansion.ts`).
- The registry entry is in `registry.ts` (or `registry/expansion.ts`).

---

## Appendix A — The Current Widget Census

As of this writing, the registry contains **72 core types** and **30 expansion types**, organized across 10 categories:

| Category | Count | Examples |
|:---|:---:|:---|
| Structure | 3 | `canvas_node`, `divider`, `branch_gate` |
| Notes & Content | 9 | `notes`, `bullets`, `quote`, `code`, `sticky_note`, `outline`, `logbook`, `meeting_notes`, `flashcards` |
| Tasks & Planning | 15+ | `checklist`, `kanban`, `timeline`, `pros_cons`, `weekly_planner`, `priority_matrix`, `decision`, `calendar`, `countdown`, `progress`, `poll`, `daily_agenda`, `process`, `risk_register`, `decision_matrix`, `swot`, `date_picker` |
| Study | 10 | `vocab`, `grade_calc`, `gpa`, `assignment`, `cornell`, `formula_sheet`, `citation`, `study_goal`, `quiz`, `pomodoro` |
| Data & Views | 13 | `table`, `budget`, `metrics`, `rating`, `calculator`, `bar_chart`, `line_chart`, `pie_chart`, `unit_converter`, `text_input`, `number_input`, `toggle`, `formula`, `form` |
| Media & Creative | 5 | `color_palette`, `media`, `sketchpad`, `dialog`, `ai_generator` |
| Tracking | 13 | `goal_tracker`, `stopwatch`, `reading_list`, `timer`, `mood_tracker`, `counter`, `links`, `habit`, `contact`, `world_clock`, `status`, `timesheet`, `inventory` |
| Automation | 10 | `clock_pulse`, `comparator`, `aggregator`, `range_mapper`, `latch`, `random_picker`, `sequencer`, `template`, `recorder`, `notifier` |
| Life | 20 | `subscriptions`, `debt_payoff`, `expense_split`, `invoices`, `meal_planner`, `recipe`, `home_maintenance`, `chore_rotation`, `renewals_vault`, `medications`, `workout_plan`, `job_applications`, `okr`, `decision_journal`, `weekly_review`, `snippet_library`, `keep_in_touch`, `gifts_occasions`, `trip_itinerary`, `guest_list` |
| Specialist | 2 | `game_tuner`, `audio_player` |

> [!IMPORTANT]
> Any proposed widget must occupy a genuinely unserved niche in this census. "We don't have a widget for X" is necessary but not sufficient — the full question is: "Does X represent a real friction, and is a dedicated widget meaningfully better than what already exists?"

---

## Appendix B — The Rejection Hall of Shame

Proposals already rejected. Do not re-propose without new justification:

| Proposal | Failing Article | Reason |
|:---|:---|:---|
| `pomodoro` (as a registry type) | IV (Redundancy) | It is `timer` with preset values and a phase label. Extend `timer` with a focus-mode instead. |
| "Grocery List" | II (Consolidation/Novelty) | It's a `checklist` with a category label. A template, not a widget. |
| "Simple Notepad" | II (Consolidation/Novelty) | Indistinguishable from `notes`. |
| "Motivational Quote of the Day" | II / IV | `random_picker` with text options + `clock_pulse` trigger — two existing widgets. |
| "Kanban with Swimlanes" | IV (Redundancy) | `kanban` + `divider` achieves this spatially. |
| "Birthday Calendar" | IV (Redundancy) | `gifts_occasions` already covers this domain with wiring. |
| "Emoji Picker" | V (Actually Useful) | No recurring friction solved. Pure novelty. |

---

## Appendix C — The I/O Coverage Audit

*Baseline measured 2026-07-13, at 202 registered `ModuleType`s, by counting `fieldsFor(type)` (outputs) and `fieldsFor(type).filter(f => f.set).length + commandsFor(type).length` (inputs) across the entire registry.* Re-run the same method before trusting these numbers again — the census in Appendix A grows independently of this table.

| Metric | Count | Notes |
|:---|---:|:---|
| Total widget types | 202 | |
| Zero outputs | 3 → 0 | `canvas_node`, `sketchpad` (both exempt, Article III), `world_clock` (was a real gap — fixed, see Article III.1) |
| Zero inputs | 42 | Most are legitimate sinks (Article III.1); `checklist`, `bullets`, `links`, `kanban`, `decision` closed as the first `add_item` batch. The rest follow the same recipe on demand — not mechanically ground through, since not every one has an unambiguous single append target. |
| Zero of both | 3 → 2 | `canvas_node`, `sketchpad` remain intentional. `world_clock` no longer belongs on this list. |

**How to re-run this audit:** write a throwaway Vitest file that imports `MODULE_TYPES` from `types/spatial` and `fieldsFor`/`commandsFor` from `widgets/fields`, tallies output/settable/command counts per type, and diff against this table. Delete the scratch file afterward — this appendix is the durable record, not a committed test.
