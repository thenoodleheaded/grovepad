# Widget Expansion Plan — Automation Primitives & Life-Friction Widgets

*Implementation plan only — nothing here is built yet.*

This plan extends Grovepad from "a canvas with widgets" toward its real promise:
**a personal operating surface where the things you track run themselves.** It adds
10 automation/logic widgets that complete the wiring vocabulary, 20 life widgets
that each kill a specific recurring friction, the engine groundwork both require,
and the scenario-intelligence integration that makes them discoverable from a
vague typed thought.

---

## 1. Why people will actually use this

The existing catalogue is strong on *capture* (notes, lists, trackers) and the
Unified Dependency Framework is strong on *reaction* (a checklist gating a reward
card). What's missing is the layer between: **time, memory, and composition.**
Today the engine only moves when the user edits something — nothing fires at 8pm,
nothing remembers last week's value, nothing turns three numbers into a sentence.

The life frictions worth targeting share a shape:

1. **Recurring, low-stakes, high-guilt.** Subscriptions renewing unnoticed, friends
   not contacted, filters not changed, meds not refilled. Nobody builds a system
   for these; everybody feels bad about them. A canvas that *nags itself* wins here.
2. **Decision fatigue.** What's for dinner, whose turn is it, what do I study
   first. The fix isn't information — it's a dice roll with authority.
3. **Invisible trends.** Weight, spending, workout volume, mood. People will log a
   number for two weeks; they won't build the chart. Auto-recording any wired
   number into a trend is the single highest-leverage feature in this plan.
4. **Scattered life-admin state.** Passport expiry, insurance renewal, who owes
   whom from the trip. Lives in five apps and one anxious memory. A spatial canvas
   is *better* than an app-per-domain because everything sits on one map — and the
   mindmap layer means "planning a trip" can *bloom* into itinerary + packing +
   split-expenses, pre-wired.

Design guardrails for every new widget (reject candidates that fail any):

- **G1 — Not trivially composable.** If `table` + two `formula`s does it, it's a
  template, not a widget.
- **G2 — Participates in automation.** ≥2 meaningful bindable fields (at least one
  source), so it's a citizen of the wire graph, not a dead-end card.
- **G3 — Manual-first, local-first.** Works fully offline with hand-entered data.
  No bank sync, no price scraping, no external APIs in v1.
- **G4 — Earns its pixels at far zoom.** A one-line "vitals" summary (count, next
  date, status) renderable in the LOD proxy.

---

## 2. Phase 0 — Engine groundwork (prerequisite for everything)

Five gaps in the current engine, in dependency order. All changes are additive to
persistence v2 (new `ModuleType`s and optional data keys only — no migration).

### 0.1 Time-driven propagation ("the heartbeat")

`fieldEngine.ts` propagation is a BFS wave from *edited* widgets. Time-sensitive
outputs (`date_picker` days-until, everything in this plan's scheduler) never
re-fire gates/triggers on their own.

- Add a minute-resolution tick driven by the existing `useSharedClock` hook.
- The tick does **not** re-evaluate the whole graph: field registry entries gain an
  optional `timeSensitive: true` flag; the store keeps an index of widgets whose
  type has any time-sensitive field **and** which appear as a source in ≥1
  connection. Each tick, diff those fields' values against a per-widget cache; only
  changed widgets seed a normal propagation wave. Zero connections → zero work.
- Retroactively mark `date_picker`, `countdown`, `calendar` fields time-sensitive —
  fixes the existing latent bug where a gate on "days until" doesn't flip at
  midnight without a manual edit.
- Guard: tick pauses when the tab is hidden; on visibility regain, run one
  catch-up diff (rising edges fire once, not replayed per missed minute — matches
  the existing "triggers re-arm rather than replay" philosophy).

### 0.2 New trigger commands

Extend `FieldCommand` with `capture`, `advance`, `roll`, `record`, `rotate`,
`new_period`. Which widget accepts which stays declared in `fields.ts`
(`commandsFor`), so the mapping-chip UI needs no changes beyond labels.

### 0.3 A `series` value type

`FieldValueType` gains `'series'` (wire payload: `{t: number, v: number}[]`,
capped length). `legalPrimitives` allows only `series → series` **pipe**. This is
the bridge that lets the Recorder feed `line_chart`/`bar_chart` live — `line_chart`
gains a writable series field. Ports render with a distinct glyph so users can see
"this carries a history, not a number."

### 0.4 Side-effect sink pattern

The engine must stay pure. Sinks (Notifier) work as: engine writes plain data
(`pendingFireAt` bump), and a single store subscriber outside the reducer performs
the effect (toast via `useToastStore`, or Web Notification with permission asked
lazily on first arm) with cooldown state stored back in widget data. One
subscriber, not per-widget effects.

### 0.5 Registry hygiene (do before adding 30 types)

`registry.ts` (1109 lines) and `fields.ts` (1518 lines) roughly double under this
plan. Split both into per-category modules re-exported through the existing entry
points (`widgets/registry/{core,study,logic,life}.ts` etc.) *before* Phase 1, so
every later PR is additive to a small file. Also add a new picker category
`automation` ("Automation & Logic") and move the existing logic widgets
(`text_input`, `number_input`, `toggle`, `branch_gate`, `formula`, `status`,
`date_picker`) into it — they're currently scattered across `data`/`structure`/
`tracking`/`planning`, which hides the automation story from the picker.

**Phase 0 estimate: ~3–4 days.** Includes engine tests (tick diffing, catch-up
semantics, series pipe legality) added next to the `scenarioResolver.test.ts`
precedent.

---

## 3. The 10 automation & logic widgets

Small, pure, mostly stateless renderers — the engine does the work. Each entry:
purpose → data sketch → ports (● source / ○ writable input / ⚡ command).

### 3.1 `clock_pulse` — Schedule

The missing time source. *"Reset my habits Monday morning. Reveal the wind-down
card after 9pm. Fire the plant-watering trigger every 3 days."*

- Data: `{label, mode: 'daily'|'weekly'|'interval'|'window', time, days[], intervalMinutes, windowStart, windowEnd, lastFiredAt}`
- Ports: ● `active` (bool — true inside window/on matching day), ● `pulse` (bool
  rising edge at fire moment — the universal trigger source), ● `today` (text weekday)
- Needs 0.1. The rising edge lasts one tick; trigger connections consume it.
- Size S.

### 3.2 `comparator` — Compare

Turns two numbers into a decision. *"Spending vs. cap → lock the treat card."*

- Data: `{label, op: 'gt'|'gte'|'lt'|'lte'|'eq'|'between', a, b, low, high}`
- Ports: ○ `a`, ○ `b` (○ `low`/`high` in between-mode), ● `result` (bool), ● `gap` (number, a−b)
- Size S.

### 3.3 `aggregator` — Combine

`sum` fan-in exists as a primitive; this adds the rest. *"Average mood across
three trackers. Worst risk score. How many of my five goals moved this week."*

- Data: `{label, mode: 'avg'|'min'|'max'|'count_nonzero'|'count_true', slots: number[] (6 fixed)}`
- Ports: ○ `in1`…`in6`, ● `value`. Fixed named slots — no engine change for
  multi-input; they're just six writable fields.
- Size S.

### 3.4 `range_mapper` — Bands

Turns any number into a human status. *"Budget remaining → 'comfortable / tight /
stop spending' piped into a status card."*

- Data: `{label, input, bands: [{upTo, label, emoji?}]}`
- Ports: ○ `input`, ● `label` (text), ● `bandIndex` (number), ● `topBand` (bool)
- Size S.

### 3.5 `latch` — Snapshot

The engine's first memory cell. *"Capture Monday's weight; show delta all week.
Baseline vs. now for anything."*

- Data: `{label, current, held, heldAt}`
- Ports: ○ `current`, ⚡ `capture` (also a button on the card), ● `held`, ● `delta`
  (current−held), ● `heldAt` (text)
- Classic combo: `clock_pulse.pulse` —trigger:capture→ `latch` = automatic weekly baseline.
- Size S.

### 3.6 `random_picker` — Decide For Me

Decision-fatigue killer with authority. *"What's for dinner. Who unloads the
dishwasher. Which deck to study."*

- Data: `{label, options: [{text, weight}], pick, lastRolledAt, noRepeatWindow}`
- Ports: ⚡ `roll`, ● `pick` (text), ● `rolledToday` (bool)
- `noRepeatWindow` excludes the last N picks. Auto-roll every morning via clock_pulse.
- Size S.

### 3.7 `sequencer` — Step Machine

Ordered stages with one active step. *"Morning routine. Workout circuit — timer
finishes, next exercise appears. Reveal course module 2 only after module 1."*

- Data: `{label, steps: [{text}], activeIndex, loop}`
- Ports: ⚡ `advance`, ⚡ `reset`, ● `current` (text), ● `index` (number),
  ● `progress` (number 0–100), ● `done` (bool)
- Combo: `timer.finished` —trigger:advance→ `sequencer`; `sequencer.index`
  —gate→ later cards = staged reveal without manual babysitting.
- Size M (needs a pleasant step editor).

### 3.8 `template` — Composer

Merges values into a sentence. *"A morning sticky that says: '3 tasks left, $42
of fun money, gym at 6.'"*

- Data: `{template: 'You have {a} tasks and {b} left', slotA…slotD (text)}`
- Ports: ○ `a`…○ `d`, ● `text` (composed output — pipe into sticky_note, notifier
  message, dialog…)
- Numbers arriving on text slots stringify via the existing coercion helpers.
- Size S.

### 3.9 `recorder` — History

**The keystone.** Any wired number becomes a trend, automatically. *"I stopped
logging weight because making the chart was homework." Never again.*

- Data: `{label, input, samples: [{t, v}] (cap ~400), mode: 'on_change'|'daily'|'on_command', lastRecordedAt}`
- Ports: ○ `input`, ⚡ `record`, ● `last` (number), ● `count`, ● `average`,
  ● `delta7d` (number — change vs. closest sample ≥7 days old), ● `series` (series → pipe to line_chart)
- Daily mode samples on the first tick of a new day (needs 0.1). `delta7d` feeds
  comparator → "trend going the wrong way" notifications.
- Size M (sparkline mini-render on the card itself).

### 3.10 `notifier` — Reach Out

The canvas taps you on the shoulder. *"Passport renewal 90 days out. Streak about
to break. Invoice overdue."*

- Data: `{label, message, channel: 'toast'|'browser', cooldownMinutes, armed, lastFiredAt, fireCount}`
- Ports: ○ `armed` (bool — fires on rising edge while respecting cooldown),
  ⚡ `notify` (direct trigger form), ● `lastFiredAt` (text), ● `fireCount` (number)
- Message field accepts a pipe from `template.text` for composed notifications.
  Uses the 0.4 sink pattern; browser-channel permission requested lazily.
- Size S–M.

**Phase 1 estimate: ~6–8 days** including fieldEngine tests per widget and three
seeded demo canvases (see §6).

---

## 4. The 20 life widgets

Grouped by the friction domain. Every entry passes G1–G4; "wiring" lines show the
automation story that existing widgets + Phase 1 make possible — these combos are
the product, not the cards in isolation.

### Money (4)

**4.1 `subscriptions`** — every recurring charge in one card. The "wait, I still
pay for that?" killer.
- Data: rows `{name, cost, cycle: monthly|yearly|weekly, renewsOn, active}`
- Ports: ● `monthlyTotal`, ● `annualTotal`, ● `nextRenewalDays`, ● `dueSoonCount` (≤7d)
- Wiring: `monthlyTotal` —sum→ budget expenses; `nextRenewalDays` → comparator → notifier.
- Size M.

**4.2 `debt_payoff`** — balances, APRs, and a real payoff date. Does the math
people avoid.
- Data: debts `{name, balance, apr, minPayment}`, `extraPayment`, `strategy: 'snowball'|'avalanche'`
- Ports: ○ `extraPayment` (wire a number_input slider — watch the payoff date move
  live), ● `totalBalance`, ● `monthsToFree`, ● `totalInterest`, ● `debtFreeDate` (text)
- Amortization math is the bulk of the work; pure function + unit tests.
- Size L.

**4.3 `expense_split`** — trip/household settlement. Ends the spreadsheet ritual.
- Data: `{people[], expenses: [{desc, amount, paidBy, splitAmong[]}]}`
- Ports: ● `total`, ● `youAreOwed`, ● `youOwe`, ● `settlement` (text: "Sam → you $23; you → Ali $8", minimal-transfer algorithm)
- Wiring: `settlement` —pipe→ template → a shareable sticky.
- Size M–L.

**4.4 `invoices`** — freelancer receivables. The follow-up you keep forgetting.
- Data: rows `{client, amount, issued, due, status: draft|sent|paid}`
- Ports: ● `outstanding`, ● `overdueCount`, ● `paidThisMonth`
- Wiring: `overdueCount` → notifier ("2 invoices overdue"); `paidThisMonth` —pipe→ budget income.
- Size M.

### Food & household (5)

**4.5 `meal_planner`** — 7-day × 3-meal grid. The 5pm "what's for dinner" panic,
solved Sunday.
- Data: `{week: slots[{day, meal, dish, recipeWidgetId?}]}`
- Ports: ● `plannedCount`, ● `gapsCount`, ● `todaysMeals` (text — time-aware via 0.1), ● `shoppingList` (text — aggregated from linked recipe cards)
- Wiring: `gapsCount` → gate a random_picker of house favorites; `todaysMeals` —pipe→ template → morning sticky.
- Size L (the grid + recipe linking).

**4.6 `recipe`** — ingredients that scale themselves.
- Data: `{title, servings, baseServings, ingredients: [{qty, unit, item}], steps[{text, done}], cookMinutes}`
- Ports: ○ `servings` (writable! wire `guest_list.confirmedCount` in — the canvas
  scales the recipe as RSVPs arrive), ● `ingredientList` (text, scaled), ● `cookMinutes`
- Size M.

**4.7 `home_maintenance`** — "every N months" chores with their own clocks.
Filters, smoke alarms, car service, plant repotting.
- Data: rows `{task, everyMonths, lastDone}`
- Ports: ● `dueCount`, ● `overdueCount`, ● `nextDue` (text); per-row done-button
  resets that row's clock
- Wiring: `dueCount` → notifier, monthly clock_pulse cadence.
- Size M.

**4.8 `chore_rotation`** — who does what this week, rotated automatically. Ends
the roommate/household argument.
- Data: `{people[], chores[], offset, cadenceLabel}`
- Ports: ⚡ `rotate` (fire from a weekly clock_pulse — it rotates itself),
  ● `assignments` (text), ● `myChores` (text, first-person row)
- Size M.

**4.9 `renewals_vault`** — passports, insurance, licenses, domains, warranties.
The quiet background anxiety, externalized.
- Data: rows `{item, expires, noteRef, renewLeadDays}`
- Ports: ● `soonestExpiryDays`, ● `dueSoonCount` (within each row's lead time), ● `nextUp` (text)
- Wiring: the canonical clock_pulse → comparator → notifier chain; ships as a
  pre-wired template.
- Size M.

### Health (2)

**4.10 `medications`** — doses, taken-today, refill runway.
- Data: rows `{name, timesPerDay, takenToday: bool[], pillsLeft, dailyUse}`
- Ports: ● `takenToday` (number), ● `remainingToday`, ● `allTaken` (bool),
  ● `refillDays` (min across rows), ⚡ accepts `uncheck_all`
- Wiring: nightly clock_pulse —trigger:uncheck_all→ resets itself; `refillDays` →
  comparator(≤5) → notifier.
- Size M.

**4.11 `workout_plan`** — sets × reps × weight with a progression story.
- Data: `{days: [{label, exercises: [{name, sets, reps, weight, done}]}]}`
- Ports: ● `sessionVolume` (Σ sets·reps·weight of today's done rows),
  ● `completedToday` (bool), ● `lastSession` (text)
- Wiring: `sessionVolume` —pipe→ recorder —series→ line_chart = an automatic
  progression graph, the thing every fitness app charges for.
- Size L.

### Work & growth (5)

**4.12 `job_applications`** — the hunt pipeline with built-in follow-up pressure.
- Data: rows `{company, role, stage: wishlist|applied|screen|interview|offer|closed, applied, nextAction, followUpBy}`
- Ports: ● `activeCount`, ● `needsFollowUpCount` (followUpBy ≤ today, needs 0.1),
  ● `interviewCount`, ● `offerCount`
- Wiring: `needsFollowUpCount` → notifier; `offerCount ≥ 1` —visibility→ reveal a
  "negotiation prep" cluster. Distinct from kanban (G1): date-aware nudging is the point.
- Size M–L.

**4.13 `okr`** — objective + weighted key results, where KRs are *wired in*.
- Data: `{objective, keyResults: [{label, current, target, weight}]}`
- Ports: ○ `kr1Current`…○ `kr4Current` (pipe a habit streak, a counter, an
  invoices `paidThisMonth` straight into your OKRs), ● `progress` (0–100 weighted)
- Wiring: `progress ≥ 100` —trigger→ confetti… i.e. —visibility→ a "celebrate" card.
- Size M.

**4.14 `decision_journal`** — record the call, the reasoning, the expected
outcome; get resurfaced when it's time to score it. Calibration for life — the
deepest fit with Grovepad's mindmapping identity.
- Data: entries `{decision, context, expected, confidence, decidedOn, reviewOn, actual?, verdict?}`
- Ports: ● `dueForReview` (number, needs 0.1), ● `entryCount`, ● `hitRate` (scored entries)
- Wiring: `dueForReview` → notifier ("2 past decisions ready to score").
- Size M.

**4.15 `weekly_review`** — the retro ritual, with the canvas holding you to it.
- Data: `{prompts: [{q, answer}] (went well / didn't / carry forward), weekOf, history: count+streak, completedThisWeek}`
- Ports: ⚡ `new_period` (archive answers, blank the card), ● `completedThisWeek` (bool), ● `streak` (number)
- Wiring: Sunday-evening clock_pulse —visibility→ reveals the card and
  —trigger:new_period→ rolls it; `completedThisWeek` —gate→ next week's planner
  ("no planning before reflecting", for those who want it).
- Size M.

**4.16 `snippet_library`** — reusable text with one-click copy: prompts, email
replies, shell commands, canned messages. The retype-it-again tax, removed.
- Data: entries `{title, body, tags, useCount}`; copy button bumps useCount, list
  sorts by frequency
- Ports: ● `count`, ● `mostUsed` (text)
- Size M.

### People & events (4)

**4.17 `keep_in_touch`** — relationships decay silently; this makes the decay
visible. People + desired cadence + last contact.
- Data: rows `{name, cadenceDays, lastContact, note}`
- Ports: ● `overdueCount`, ● `nextUp` (text: "Call Nadia — 3 weeks over"), per-row
  ⚡-style "logged it" button resets that row
- Wiring: weekly clock_pulse + `overdueCount` → notifier; `nextUp` —pipe→ into a
  morning template sticky.
- Size M.

**4.18 `gifts_occasions`** — birthdays and anniversaries with lead time, ideas
attached, budget wired.
- Data: rows `{person, date (recurs yearly), ideas, budget, bought}`
- Ports: ● `nextOccasionDays`, ● `nextOccasion` (text), ● `unboughtSoonCount` (≤14d), ● `plannedSpend`
- Wiring: `unboughtSoonCount` → notifier two weeks out — the app that ends
  forgotten birthdays; `plannedSpend` —sum→ budget.
- Size M.

**4.19 `trip_itinerary`** — day-by-day legs with confirmation numbers and a
booking checklist built in.
- Data: `{tripName, startDate, days: [{date, legs: [{time, what, where, confirmation, booked}]}]}`
- Ports: ● `daysUntil`, ● `unbookedCount`, ● `todaysPlan` (text — while traveling,
  the card reads out *today's* legs, via 0.1)
- Wiring: `daysUntil ≤ 7` —visibility→ reveals the packing checklist cluster;
  `unbookedCount` → notifier. A "plan a trip" thought blooms into
  itinerary + checklist + expense_split + countdown, pre-wired (§6).
- Size L.

**4.20 `guest_list`** — RSVPs with a live headcount that drives everything else.
- Data: rows `{name, status: invited|yes|no|maybe, plusOnes, dietary}`
- Ports: ● `confirmedCount` (incl. plus-ones), ● `pendingCount`, ● `dietaryNotes` (text)
- Wiring: the showcase composition — `confirmedCount` —pipe→ `recipe.servings`
  and —pipe→ formula → per-head budget. One RSVP flips and the whole party plan
  recalculates.
- Size M.

---

## 5. Per-widget implementation checklist (applies to all 30)

1. **Types** — `XData` interface + `ModuleData`/`ModuleType` union entries in
   `src/types/spatial.ts` (or the Phase-0 split equivalents).
2. **Registry entry** — label, ≤8-word description, lucide icon, category, accent,
   `defaultSize`, `defaultData()`. Life widgets: decide pack gating per widget —
   propose a new `life` DomainPack for §4, `automation` widgets ungated (they're
   the connective tissue and must always be wireable).
3. **Renderer** — component in `modules/` (or `modules/life/`), case in
   `WidgetRenderer`. Must include the far-zoom vitals line (G4) and respect the
   existing LOD rules (no backdrop-filter — see perf notes).
4. **Fields** — descriptors in `fields.ts` (port order = declaration order, so
   put the most-wired field first), `commandsFor` entries, `timeSensitive` flags.
5. **Tests** — data-shape roundtrip through field get/set; engine tests for any
   widget with commands or time-sensitive fields; math-heavy widgets
   (`debt_payoff`, `expense_split`) get pure-function unit tests first.
6. **Free rides** — AddWidgetModal, context menus, undo, persistence v2, and cloud
   sync all read the registry/data blob generically; verify, don't build.

---

## 6. Discovery — making 30 new widgets findable (Phase 6)

Widgets nobody finds are filler by definition. Three mechanisms:

1. **Scenario archetypes** (extends `docs/scenario-intelligence.md` catalogue):
   new entries whose recommended workspaces use the new types — `planning-a-trip`
   (trip_itinerary + expense_split + checklist + countdown), `job-hunt`
   (job_applications + snippet_library + calendar), `money-checkup`
   (subscriptions + debt_payoff + budget), `household-os` (chore_rotation +
   home_maintenance + meal_planner), `stay-in-touch`, `event-hosting`
   (guest_list + recipe + budget), `getting-fit` upgrade (workout_plan + recorder
   + line_chart). Micro-questions per the existing one-question rule.
2. **Wiring suggestions** — a small rules table `(sourceType, targetType) →
   suggested connection + copy`, surfaced as a dismissible chip when both types
   coexist on a canvas (e.g. meal_planner + checklist → "Pipe the shopping list?";
   any number source + recorder → "Track this over time?"). This teaches the
   primitive system through the user's own canvas. Rules data + one chip
   component; no ML.
3. **Pre-wired templates** — 5–6 seeded canvases in a gallery reachable from
   `EmptyCanvasState`: *Household OS*, *Freelance OS*, *Trip*, *Money Checkup*,
   *Morning Dashboard* (clock_pulse + template + notifier + recorder showing the
   automation layer off). Templates are just persistence-v2 documents; the work is
   authoring + a picker UI.
4. **Vocabulary** — extend `thoughtInterpreter`/`languageNormalization` token maps
   so "split the airbnb", "whose turn", "renew passport", "meal prep" resolve to
   the new types in mindmap bloom.

---

## 7. Rollout phases & estimates

| Phase | Scope | Est. |
|---|---|---|
| 0 | Engine heartbeat, commands, series type, sink pattern, registry split, `automation` category | 3–4 d |
| 1 | 10 automation widgets + engine tests + 1 demo canvas | 6–8 d |
| 2 | Money: subscriptions, debt_payoff, expense_split, invoices | 5–6 d |
| 3 | Household & health: meal_planner, recipe, home_maintenance, chore_rotation, renewals_vault, medications, workout_plan | 8–10 d |
| 4 | Work & growth: job_applications, okr, decision_journal, weekly_review, snippet_library | 5–6 d |
| 5 | People & events: keep_in_touch, gifts_occasions, trip_itinerary, guest_list | 5–6 d |
| 6 | Archetypes, wiring suggestions, template gallery, interpreter vocab | 4–5 d |

Order rationale: Phase 1 first because every later phase's *wiring* stories depend
on clock_pulse/recorder/notifier existing; Money next because it's the highest
"felt value per widget"; Phase 6 last but its archetype rows should be drafted
alongside each widget's PR so copy stays honest.

## 8. Risks & open questions

- **Notification permissions** — browser-channel notifier degrades to toast when
  denied; never block on the permission prompt. Toast-only is still useful
  (in-app nudges on canvas open).
- **Tick correctness across sleep/timezones** — catch-up-once semantics (0.1) must
  be tested around DST and laptop-lid scenarios; store `lastFiredAt` as epoch, render local.
- **Series payload size** — recorder cap (~400 samples) keeps persistence v2 blobs
  and pipe payloads bounded; document the cap on the card.
- **Picker overload** — 100+ types make the modal a wall. Mitigate with the
  `automation` category, pack gating for `life`, and lean harder on QuickAddSheet
  search + scenario entry as the primary path.
- **Open:** should `recipe.ingredientList → checklist` be a plain text pipe (v1,
  paste-like) or a structured item-import primitive (v2)? Plan assumes text pipe
  v1; revisit after meal_planner usage.
