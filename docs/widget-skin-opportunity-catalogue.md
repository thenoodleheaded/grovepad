# Grovepad skin opportunity catalogue

> Product proposal, not a shipped-capability contract. Generated from the live public widget registry, skin catalogue, field descriptors, and command descriptors on 25 July 2026.
>
> This is the broad idea inventory. The stricter, current ownership decision—skin vs control vs preset vs capability vs separate widget—is in [widget-skin-reorganization.md](widget-skin-reorganization.md).

## Outcome

- **94** currently spawnable widget types analyzed.
- **11** currently have at least one selectable skin; **83** have none.
- **610** implementable skin opportunities proposed: **368 renderer-ready** and **242 schema-extension**.
- Every public widget is covered, including widgets that already have skins.
- Existing-only legacy types are not proposed as independent targets; their useful forms already belong to canonical widgets such as Tasks, Goal, Timer, Chart, Study Deck, Date, Drawing, and Tracker.

## What counts as a skin

A skin must preserve the widget’s identity while changing how the same job is performed or understood. A different color, label, default value, or reduced feature set is not a skin. A multi-widget workflow belongs in the template catalogue. A capability with unrelated state, permissions, or lifecycle belongs in a new widget.

- **Renderer-ready** — primarily a new renderer, interaction arrangement, or interpretation of fields already present. It may still require a persisted `mode` value and migration-safe defaults.
- **Schema-extension** — still clearly the same widget, but needs additional optional fields, item metadata, or history. These should be implemented only after a data-contract proposal.

## Recommended first implementation wave

The first wave should favor skins that produce a large usability gain without expanding persisted data:

- **Meeting Notes** — Agenda, Minutes, Stand-up
- **Calendar** — Month, Week, Agenda
- **Table** — Grid, Compact Ledger, Cards
- **Budget** — Category Plan, Envelope, Zero-based
- **Metrics** — KPI Tiles, Big Number, Scoreboard
- **World Clock** — City Grid, Analog Wall, Overlap Band
- **Form** — Intake, Survey, Feedback
- **Process / SOP** — Stepper, Checklist SOP, Runbook
- **Risk Register** — Register, Heatmap, Top Risks
- **Timesheet** — Daily, Weekly, Project
- **Inventory** — Stock List, Pantry, Asset Register
- **Logbook** — Daily Log, Incident Log, Lab Notebook
- **Schedule Pulse** — Once, Interval, Daily
- **Comparator** — Threshold, Range, Equality
- **Recorder** — Event Log, Trend, Daily Snapshot
- **Notifier** — In-app, System, Banner
- **Meal Planner** — Week, Today, Batch Cooking
- **Medications** — Today, Schedule, Refills
- **Workout Plan** — Plan, Session, Circuit
- **Trip Itinerary** — Days, Timeline, Bookings

## Complete catalogue

## Structure

### Bool Gate (`branch_gate`)

Current purpose: A true/false condition with both normal and inverse outputs. Current skins: **none**.

Current automation surface: True branch (boolean, writable), False branch (boolean); Choose false branch.

- **Renderer-ready · Pass / Block** — Shows whether the incoming condition passes.
- **Renderer-ready · Inverter** — Makes the inverse output the visual focus.
- **Renderer-ready · Arm / Disarm** — Presents the condition as an automation safety gate.
- **Renderer-ready · Permission** — Frames true and false as allowed and denied.
- **Schema-extension · AND / OR** — Adds multiple boolean inputs and a selected combining rule.
- **Schema-extension · Debounced Gate** — Requires the condition to remain stable before changing output.

### Canvas (`canvas_node`)

Current purpose: A whole board inside a card — click its name to enter it. Current skins: **none**.

Current automation surface: no bindable fields; no trigger commands.

- **Renderer-ready · Portal** — The current simple entrance into a child canvas.
- **Renderer-ready · Cover** — A large title, subtitle, accent, and last-opened summary for presentation canvases.
- **Schema-extension · Live Thumbnail** — A miniature, non-interactive preview of the child canvas contents.
- **Schema-extension · Dashboard Door** — Shows child-widget counts, completion, alerts, and recent activity before entering.
- **Schema-extension · Folder Index** — Lists the immediate child canvases and opens one directly.

## Notes & Content

### Bullets (`bullets`)

Current purpose: Quick unordered list of short points. Current skins: **none**.

Current automation surface: Items (number); Add bullet from wire.

- **Renderer-ready · Dots** — The current lightweight unordered list.
- **Renderer-ready · Numbered** — An ordered list for sequences, rankings, and instructions.
- **Renderer-ready · Compact Chips** — Wraps very short items into a dense tag-like cloud.
- **Renderer-ready · Two Column** — Balances a long list across two readable columns.
- **Schema-extension · Nested Outline** — Adds indentation, collapse, and parent-child structure.
- **Schema-extension · Rolling Log** — Appends timestamped bullets with newest-first or oldest-first order.

### Code Snippet (`code`)

Current purpose: Monospace code block with a language tag. Current skins: **none**.

Current automation surface: Code (text, writable); no trigger commands.

- **Renderer-ready · Editor** — The current syntax-colored source presentation.
- **Renderer-ready · Terminal** — Monospace console styling for shell commands and transcripts.
- **Renderer-ready · Config** — Key-value emphasis for JSON, YAML, TOML, and environment examples.
- **Renderer-ready · Compact Snippet** — Shows the first useful lines with a prominent copy action.
- **Schema-extension · Diff** — Stores before and after text and highlights additions and removals.
- **Schema-extension · Runnable Example** — Pairs source with bounded input and captured output when a safe runtime exists.

### Logbook (`logbook`)

Current purpose: A chronological record of timestamped notes and warnings. Current skins: **none**.

Current automation surface: Entries (number), Latest entry (text); no trigger commands.

- **Renderer-ready · Daily Log** — Chronological dated entries.
- **Renderer-ready · Incident Log** — Severity, impact, response, and resolution.
- **Renderer-ready · Lab Notebook** — Hypothesis, method, observation, and conclusion.
- **Renderer-ready · Change Log** — Version, change, author, and date.
- **Renderer-ready · Maintenance Log** — Asset, work performed, parts, and next service.
- **Schema-extension · Audit Trail** — Creates append-only entries with actor and source.
- **Schema-extension · Travel Log** — Adds place, distance, media, and trip context.

### Meeting Notes (`meeting_notes`)

Current purpose: Date, attendees, notes, and action items. Current skins: **none**.

Current automation surface: Actions done (boolean); Reopen all actions.

- **Renderer-ready · Agenda** — Topic-first preparation with timeboxes and desired outcomes.
- **Renderer-ready · Minutes** — Formal attendees, discussion, decisions, and action records.
- **Renderer-ready · Stand-up** — Yesterday, today, blockers, and help-needed prompts.
- **Renderer-ready · Retrospective** — Went well, did not, learned, and next experiment.
- **Renderer-ready · One-to-One** — Talking points, feedback, commitments, and follow-up.
- **Schema-extension · Decision Review** — Links each meeting decision to owner, rationale, and review date.
- **Schema-extension · Handoff** — Captures current state, open risks, next action, and acknowledgement.

### Note (`notes`)

Current purpose: Plain, sticky, and quote skins in one writing card. Current skins: **Plain, Sticky, Quote**.

Current automation surface: Text (text, writable); no trigger commands.

- **Renderer-ready · Daily Log** — Timestamped journal styling optimized for short dated entries.
- **Renderer-ready · Markdown Page** — Reading-first typography with headings, code, lists, and links.
- **Renderer-ready · Typewriter** — Distraction-free long-form writing with a narrow measure and current-line focus.
- **Renderer-ready · Callout** — A concise warning, tip, decision, or important-fact treatment.
- **Schema-extension · Versioned Note** — Keeps named snapshots and compares the current text with an earlier version.

### Outline (`outline`)

Current purpose: A keyboard-friendly nested outline for structuring ideas. Current skins: **none**.

Current automation surface: Items (number), Top-level items (number); no trigger commands.

- **Renderer-ready · Tree** — The current nested outline.
- **Renderer-ready · Roman** — Formal I/A/1 hierarchy for documents and policies.
- **Renderer-ready · Scenes** — Story scenes grouped into acts and sequences.
- **Renderer-ready · Sitemap** — Pages grouped under navigation sections.
- **Renderer-ready · Course** — Modules, lessons, and exercises.
- **Schema-extension · Work Breakdown** — Adds owner, estimate, and completion to outline nodes.
- **Schema-extension · Collapsible Brief** — Adds notes and attachments under each heading.

### Study Deck (`flashcards`)

Current purpose: Flashcard, vocabulary, and self-quiz skins. Current skins: **Flashcards, Vocabulary, Quiz**.

Current automation surface: Cards (number); Next card, Previous card.

- **Renderer-ready · Cloze** — Hides marked spans inside a sentence rather than using separate fronts and backs.
- **Schema-extension · Leitner Boxes** — Moves cards through physical-style boxes based on recall quality.
- **Schema-extension · Spaced Repetition** — Schedules reviews using per-card ease and interval history.
- **Schema-extension · Match Pairs** — Turns cards into a timed term-to-definition matching board.
- **Schema-extension · Image Recall** — Uses an image or diagram as the prompt with text answers.

## Tasks & Planning

### Calendar (`calendar`)

Current purpose: A month view — click days to mark them. Current skins: **none**.

Current automation surface: Marked days (number), Today (text); no trigger commands.

- **Renderer-ready · Month** — The current month grid.
- **Renderer-ready · Week** — Seven vertical day lanes with time and all-day regions.
- **Renderer-ready · Agenda** — A chronological list optimized for the next few commitments.
- **Renderer-ready · Year Heatmap** — Shows event density and marked days across a year.
- **Renderer-ready · Availability** — Emphasizes free and busy intervals rather than event details.
- **Schema-extension · Shift Rota** — Adds assignee, role, and repeating shift patterns.
- **Schema-extension · Birthday & Anniversary** — Repeats people-linked annual occasions.

### Date (`date_picker`)

Current purpose: Edit a target date and switch between date-time and countdown views. Current skins: **Date & Time, Countdown**.

Current automation surface: Date (text, writable), Days until (number), Is due (boolean); no trigger commands.

- **Renderer-ready · Deadline** — Emphasizes remaining time and overdue state.
- **Renderer-ready · Anniversary** — Repeats the same month and day each year.
- **Renderer-ready · Relative Date** — Displays today, tomorrow, next week, or elapsed time.
- **Schema-extension · Range** — Stores start and end dates and calculates duration.
- **Schema-extension · Recurring Date** — Adds repeat rules and the next occurrence.
- **Schema-extension · Milestone** — Adds owner, status, and linked deliverable.

### Decision Matrix (`decision_matrix`)

Current purpose: Compare options against weighted criteria and reveal a winner. Current skins: **none**.

Current automation surface: Winner (text), Winner score (number); no trigger commands.

- **Renderer-ready · Weighted Matrix** — The current options-by-criteria scoring table.
- **Renderer-ready · Scorecard** — Shows one option at a time with its criterion scores.
- **Renderer-ready · Winner Board** — Ranks options and emphasizes score gaps.
- **Schema-extension · Pairwise** — Derives criterion or option weights through pair comparisons.
- **Schema-extension · Sensitivity** — Shows whether small weight changes alter the winner.
- **Schema-extension · Threshold** — Rejects options that fail mandatory criteria.

### Decision Picker (`decision`)

Current purpose: Choose simply or use weighted, no-repeat decisions. Current skins: **Simple, Weighted**.

Current automation surface: Picked option (text); Add option from wire.

- **Renderer-ready · Wheel** — A tactile wheel presentation for the existing weighted picker.
- **Renderer-ready · Coin / Dice** — Minimal two-way or numbered random choice for tiny decisions.
- **Schema-extension · Tournament** — Compares options in pairs until one winner remains.
- **Schema-extension · Elimination** — Removes one option per draw and keeps the elimination order.
- **Schema-extension · Consensus** — Collects several participant rankings before picking.

### Poll (`poll`)

Current purpose: Options with tap-to-vote counts. Current skins: **none**.

Current automation surface: Total votes (number); Clear votes.

- **Renderer-ready · Bars** — The current comparison of option vote totals.
- **Renderer-ready · Donut** — A share-of-votes view for compact dashboards.
- **Renderer-ready · Approval** — Allows each voter to approve any number of options.
- **Schema-extension · Ranked Choice** — Collects ordered preferences and calculates rounds.
- **Schema-extension · Pairwise** — Runs option-versus-option comparisons.
- **Schema-extension · Live Room** — Shows participant count, voting state, and result reveal control.
- **Schema-extension · Anonymous** — Stores aggregate votes without retaining voter identity.

### Process / SOP (`process`)

Current purpose: A sequential procedure with one active step and live progress. Current skins: **none**.

Current automation surface: Progress % (number), Complete (boolean), Current step (text); Restart process, Complete process.

- **Renderer-ready · Stepper** — The current one-active-step procedure.
- **Renderer-ready · Checklist SOP** — Shows all steps with completion controls.
- **Renderer-ready · Runbook** — Adds command, expected result, and rollback emphasis.
- **Renderer-ready · Recipe** — Ingredients or prerequisites above ordered instructions.
- **Renderer-ready · Incident** — Detection, triage, containment, recovery, and review.
- **Schema-extension · Swimlane** — Adds role ownership and parallel lanes.
- **Schema-extension · Branching Procedure** — Adds decision points and conditional next steps.

### Pros & Cons (`pros_cons`)

Current purpose: Two-column argument sheet for weighing a decision. Current skins: **none**.

Current automation surface: Pros (number), Cons (number); no trigger commands.

- **Renderer-ready · Balance** — The current two-column advantages and disadvantages view.
- **Renderer-ready · Debate** — Frames each pro beside a direct counterargument.
- **Renderer-ready · Red Team** — Prompts for failure modes, objections, and missing evidence.
- **Schema-extension · Weighted Trade-off** — Adds importance scores and displays the weighted balance.
- **Schema-extension · Reversible / Irreversible** — Separates consequences by how difficult they are to undo.

### Risk Register (`risk_register`)

Current purpose: Score likelihood and impact, record mitigation, resolve risks. Current skins: **none**.

Current automation surface: Open risks (number), Highest score (number), All resolved (boolean); Reopen all risks.

- **Renderer-ready · Register** — The current sortable risk list.
- **Renderer-ready · Heatmap** — Plots probability against impact.
- **Renderer-ready · Top Risks** — Shows only the highest unresolved exposures.
- **Renderer-ready · RAID** — Combines risks, assumptions, issues, and dependencies.
- **Schema-extension · Controls** — Adds preventive and detective controls with effectiveness.
- **Schema-extension · FMEA** — Adds failure mode, severity, occurrence, detection, and RPN.
- **Schema-extension · Bow-tie** — Shows causes, event, consequences, prevention, and recovery.

### SWOT Analysis (`swot`)

Current purpose: Strengths, weaknesses, opportunities, and threats in one view. Current skins: **none**.

Current automation surface: Strengths (number), Weaknesses (number), Opportunities (number), Threats (number); no trigger commands.

- **Renderer-ready · Classic** — The current four-quadrant analysis.
- **Renderer-ready · Personal** — Prompts tailored to an individual decision or career.
- **Renderer-ready · Competitor** — Compares internal position against one named competitor.
- **Renderer-ready · One-page** — Tighter executive summary with capped items.
- **Schema-extension · TOWS** — Turns SWOT combinations into strategic actions.
- **Schema-extension · Evidence-backed** — Adds evidence and confidence to every claim.

### Tasks (`checklist`)

Current purpose: One task collection with list, board, schedule, and priority views. Current skins: **List, Board, Assignments, Day, Week, Timeline, Priority Matrix**.

Current automation surface: Done count (number), All done (boolean); Uncheck all tasks, Check all tasks, Add task from wire.

- **Renderer-ready · Inbox** — A zero-organization capture queue for tasks that will be sorted later.
- **Renderer-ready · Shopping** — Large tap targets, quantities, and completed-item grouping for errands.
- **Schema-extension · Recurring** — Repeats items on daily, weekly, monthly, or completion-relative schedules.
- **Schema-extension · Sprint** — Adds owner, estimate, sprint, and done-definition fields to the board view.
- **Schema-extension · Dependencies** — Shows blocked tasks and prerequisite links within the task collection.
- **Schema-extension · Routine** — Runs the same ordered checklist repeatedly while preserving completion history.

## Study & Learning

### Citations (`citation`)

Current purpose: Source manager with an APA/MLA/Chicago toggle. Current skins: **none**.

Current automation surface: Sources (number); no trigger commands.

- **Renderer-ready · Bibliography** — A conventional formatted reference list.
- **Renderer-ready · Source Cards** — One visual card per source with type and key metadata.
- **Renderer-ready · Annotated** — Shows the user’s evaluation and relevance note under each source.
- **Renderer-ready · Footnotes** — Compact numbered notes optimized for manuscript work.
- **Schema-extension · Literature Matrix** — Compares question, method, finding, limitation, and relevance.
- **Schema-extension · Evidence Map** — Groups sources under the claims they support or challenge.

### Cornell Notes (`cornell`)

Current purpose: Cue column, notes, and a summary band. Current skins: **none**.

Current automation surface: Notes (text, writable), Summary (text, writable); no trigger commands.

- **Renderer-ready · Lecture** — Classic cues, notes, and summary with lecture metadata.
- **Renderer-ready · Reading** — Question prompts, evidence notes, and chapter summary.
- **Renderer-ready · Problem Solving** — Known facts, method, working, and final check.
- **Renderer-ready · Interview** — Questions on the left, responses on the right, synthesis below.
- **Renderer-ready · Research** — Claims, evidence, counterevidence, and synthesis.

### Formula Sheet (`formula_sheet`)

Current purpose: A quick-reference list of named formulas. Current skins: **none**.

Current automation surface: Formulas (number); no trigger commands.

- **Renderer-ready · Reference Sheet** — The current compact collection of named formulas.
- **Renderer-ready · Equation Cards** — One large equation per row with variable definitions.
- **Renderer-ready · Exam Strip** — Extremely dense, print-like formula packing.
- **Schema-extension · Derivation** — Stores ordered derivation steps beneath each final formula.
- **Schema-extension · Unit-aware** — Associates variables with units and flags inconsistent substitutions.
- **Schema-extension · Worked Example** — Pairs each formula with one collapsible numeric example.

### Grades (`grade_calc`)

Current purpose: Weighted course grade and GPA skins. Current skins: **Weighted Grade, GPA**.

Current automation surface: Grade % (number), Passing (boolean), GPA (number); no trigger commands.

- **Renderer-ready · Pass / Fail** — Focuses on the margin above or below a required grade.
- **Renderer-ready · What-if** — Makes one hypothetical score prominent while preserving current marks.
- **Schema-extension · Rubric** — Scores criteria separately and computes a weighted result.
- **Schema-extension · Dropped Scores** — Applies drop-lowest and replacement policies.
- **Schema-extension · Curve Simulator** — Compares raw and curved grade scenarios.

## Data & Views

### Budget (`budget`)

Current purpose: Line items with a running total. Current skins: **none**.

Current automation surface: Total (number); no trigger commands.

- **Renderer-ready · Category Plan** — The current planned-versus-actual category view.
- **Renderer-ready · Envelope** — Shows remaining spendable money as category envelopes.
- **Renderer-ready · Zero-based** — Requires every unit of income to receive an assignment.
- **Renderer-ready · 50 / 30 / 20** — Groups spending into needs, wants, and savings targets.
- **Schema-extension · Cashflow** — Adds dated income and expense timing across a month.
- **Schema-extension · Sinking Funds** — Tracks several future expenses and contribution schedules.
- **Schema-extension · Shared Budget** — Adds contributor, payer, and household ownership.
- **Schema-extension · Project Budget** — Separates committed, invoiced, paid, and forecast cost.

### Calculator (`calculator`)

Current purpose: A pocket calculator — type or tap. Current skins: **none**.

Current automation surface: Result (number); no trigger commands.

- **Renderer-ready · Basic** — The current four-operation keypad.
- **Renderer-ready · Scientific** — Functions, constants, parentheses, and memory.
- **Renderer-ready · Tape** — A visible running calculation history like an adding machine.
- **Renderer-ready · Finance** — Percent change, margin, markup, tax, and compound-growth shortcuts.
- **Renderer-ready · Programmer** — Binary, octal, hexadecimal, and bitwise operations.
- **Schema-extension · Date Math** — Calculates differences, offsets, and working days between dates.
- **Schema-extension · Named Variables** — Lets circuit inputs populate named values inside an expression.

### Chart (`bar_chart`)

Current purpose: Bar, line, donut, and pie views over one shared series. Current skins: **Bar, Line, Donut, Pie**.

Current automation surface: Total (number), Series (series, writable), Latest value (number), Average (number); no trigger commands.

- **Renderer-ready · Area** — Fills beneath the existing line series to emphasize volume.
- **Renderer-ready · Sparkline** — A label-light microtrend for glued dashboards.
- **Renderer-ready · Gauge** — Maps the latest value onto a bounded dial.
- **Renderer-ready · Progress Ring** — Treats the latest value as percent completion.
- **Schema-extension · Heatmap** — Adds a two-dimensional grid or calendar bucket model.
- **Schema-extension · Scatter** — Adds paired X/Y values rather than a single value series.
- **Schema-extension · Stacked** — Adds multiple named series sharing each category.

### Form (`form`)

Current purpose: Build and complete a compact form with required-field tracking. Current skins: **none**.

Current automation surface: Filled fields (number), Required complete (boolean), First response (text, writable); Clear responses.

- **Renderer-ready · Intake** — A practical mixed-field information request.
- **Renderer-ready · Survey** — Question-first layout optimized for completion.
- **Renderer-ready · Feedback** — Ratings, comments, and improvement prompts.
- **Renderer-ready · RSVP** — Attendance, plus-ones, dietary needs, and message.
- **Renderer-ready · Inspection** — Pass/fail checks with comments.
- **Schema-extension · Application** — Adds sections, required evidence, and review state.
- **Schema-extension · Conditional Form** — Shows later questions based on earlier responses.

### Formula (`formula`)

Current purpose: Combine two connected numbers and publish the live result. Current skins: **none**.

Current automation surface: Input A (number, writable), Input B (number, writable), Result (number); no trigger commands.

- **Renderer-ready · Two-input** — The current A/B operation surface.
- **Renderer-ready · Percent Change** — Old value, new value, and percent movement.
- **Renderer-ready · Ratio** — Part-to-whole and simplified ratio output.
- **Renderer-ready · Growth** — Starting value, rate, periods, and projected result.
- **Schema-extension · Expression** — Supports a safe expression over named inputs.
- **Schema-extension · Weighted Score** — Combines several value/weight pairs.
- **Schema-extension · Conditional** — Returns one of two values based on a comparison.

### Idempotency Store (`idempotency_store`)

Current purpose: Prevent an event from being processed twice. Current skins: **none**.

Current automation surface: Input (text, writable), Output (text), Enabled (boolean, writable), Running (boolean), Count (number), Concurrency (number, writable), Last error (text); Execute, Enqueue, Dequeue, Approve, Reject, Acquire, Release, Clear.

- **Renderer-ready · Duplicate Guard** — The current seen-key protection.
- **Renderer-ready · Request Ledger** — Shows accepted and rejected duplicate keys.
- **Renderer-ready · Import Guard** — Prevents importing the same external record twice.
- **Schema-extension · TTL Cache** — Forgets keys after a selected duration.
- **Schema-extension · Result Cache** — Stores the earlier output beside each key.
- **Schema-extension · Scoped Keys** — Separates keys by workflow, tenant, or period.

### Metrics (`metrics`)

Current purpose: KPI tiles with value, unit, and trend. Current skins: **none**.

Current automation surface: Tile 1 value (number, writable); no trigger commands.

- **Renderer-ready · KPI Tiles** — The current small collection of labeled values.
- **Renderer-ready · Big Number** — One dominant reading with supporting context.
- **Renderer-ready · Scoreboard** — Large side-by-side readings for teams or events.
- **Renderer-ready · Traffic Lights** — Maps each reading to red, amber, or green.
- **Schema-extension · Delta** — Stores prior values and emphasizes change.
- **Schema-extension · Target** — Adds goal, variance, and progress for each metric.
- **Schema-extension · Executive Strip** — Combines status, trend, owner, and freshness for several KPIs.

### Mutex (`mutex`)

Current purpose: Provide exclusive ownership of a shared resource. Current skins: **none**.

Current automation surface: Input (text, writable), Output (text), Enabled (boolean, writable), Running (boolean), Count (number), Concurrency (number, writable), Last error (text); Execute, Enqueue, Dequeue, Approve, Reject, Acquire, Release, Clear.

- **Renderer-ready · Lock** — The current one-owner critical-section control.
- **Renderer-ready · Critical Section** — Shows protected workflow, holder, and waiting state.
- **Schema-extension · Semaphore** — Allows a bounded number of concurrent holders.
- **Schema-extension · Keyed Lock** — Maintains independent locks by resource key.
- **Schema-extension · Lease** — Expires ownership unless renewed.
- **Schema-extension · Fair Queue** — Grants waiting requests in arrival order.

### Number Input (`number_input`)

Current purpose: A bounded number, slider, and stepper for live calculations. Current skins: **none**.

Current automation surface: Number value (number, writable); Increase by step, Decrease by step, Reset to minimum.

- **Renderer-ready · Stepper** — The current numeric field with increment and decrement.
- **Renderer-ready · Slider** — Continuous adjustment across a visible range.
- **Renderer-ready · Dial** — Circular coarse/fine control for frequent adjustment.
- **Renderer-ready · Currency** — Currency formatting and sensible cent steps.
- **Renderer-ready · Percent** — A bounded zero-to-one-hundred control.
- **Renderer-ready · Duration** — Hours, minutes, and seconds entry with one numeric output.
- **Schema-extension · Range** — Outputs a minimum and maximum rather than one number.

### Queue (`queue`)

Current purpose: Release persistent work in first-in order. Current skins: **none**.

Current automation surface: Input (text, writable), Output (text), Enabled (boolean, writable), Running (boolean), Count (number), Concurrency (number, writable), Last error (text); Execute, Enqueue, Dequeue, Approve, Reject, Acquire, Release, Clear.

- **Renderer-ready · FIFO** — The current first-in-first-out work queue.
- **Renderer-ready · Inbox** — Capture-focused queue with review and dispatch actions.
- **Renderer-ready · Work Queue** — Shows current, waiting, processed, and failed counts.
- **Schema-extension · Priority** — Orders items by explicit priority and age.
- **Schema-extension · Delayed** — Holds items until a release time.
- **Schema-extension · Dead Letter** — Separates repeatedly failed items for inspection.
- **Schema-extension · Assigned** — Adds owner, claimed time, and visibility timeout.

### Rating (`rating`)

Current purpose: A labeled 5-star rating. Current skins: **none**.

Current automation surface: Stars (number, writable); Clear rating.

- **Renderer-ready · Stars** — The current familiar five-star control.
- **Renderer-ready · Slider** — A continuous horizontal scale with a precise numeric reading.
- **Renderer-ready · Emoji** — A low-friction emotional or satisfaction scale.
- **Renderer-ready · Traffic Light** — Three-state red, amber, and green assessment.
- **Renderer-ready · NPS** — A zero-to-ten recommendation scale with detractor group labels.
- **Schema-extension · Rubric** — Combines several rated criteria into one score.
- **Schema-extension · Confidence** — Pairs the rating with a certainty or evidence-strength reading.

### Set Store (`set_store`)

Current purpose: Remember unique values and membership. Current skins: **none**.

Current automation surface: Input (text, writable), Output (text), Enabled (boolean, writable), Running (boolean), Count (number), Concurrency (number, writable), Last error (text); Execute, Enqueue, Dequeue, Approve, Reject, Acquire, Release, Clear.

- **Renderer-ready · Unique Values** — The current deduplicated collection.
- **Renderer-ready · Tags** — A token-style membership editor.
- **Renderer-ready · Watchlist** — Shows whether incoming values are already present.
- **Renderer-ready · Allowlist / Denylist** — Frames membership as access policy.
- **Schema-extension · Expiring Set** — Removes members after a TTL.
- **Schema-extension · Annotated Set** — Adds notes or source metadata while keeping unique keys.

### Stack (`stack_store`)

Current purpose: Release persistent work in last-in order. Current skins: **none**.

Current automation surface: Input (text, writable), Output (text), Enabled (boolean, writable), Running (boolean), Count (number), Concurrency (number, writable), Last error (text); Execute, Enqueue, Dequeue, Approve, Reject, Acquire, Release, Clear.

- **Renderer-ready · LIFO** — The current last-in-first-out collection.
- **Renderer-ready · Undo History** — Frames pushed values as reversible states.
- **Renderer-ready · Breadcrumbs** — Shows a navigational path with pop-back behavior.
- **Renderer-ready · Recent Items** — Keeps most recently used values with a bounded depth.
- **Schema-extension · Named Frames** — Adds a label and metadata to each stacked value.
- **Schema-extension · Checkpoint** — Marks frames that should survive ordinary clearing.

### State Machine (`state_machine`)

Current purpose: Enforce legal transitions between states. Current skins: **none**.

Current automation surface: Input (text, writable), Output (text), Enabled (boolean, writable), Running (boolean), Count (number), Concurrency (number, writable), Last error (text); Execute, Enqueue, Dequeue, Approve, Reject, Acquire, Release, Clear.

- **Renderer-ready · Workflow** — A generic ordered state flow.
- **Renderer-ready · Approval** — Draft, review, approved, rejected, and revision states.
- **Renderer-ready · Incident** — Detected, triaged, contained, recovering, and resolved.
- **Renderer-ready · Order** — Received, paid, preparing, shipped, delivered, and returned.
- **Renderer-ready · Content** — Idea, draft, edit, approved, scheduled, and published.
- **Schema-extension · Diagram** — Shows transitions and permitted commands spatially.
- **Schema-extension · Guarded** — Adds conditions and actions to transitions.

### Table (`table`)

Current purpose: Editable grid with a header row. Current skins: **none**.

Current automation surface: Rows (number); no trigger commands.

- **Renderer-ready · Grid** — The current spreadsheet-like layout.
- **Renderer-ready · Compact Ledger** — Tighter rows, numeric alignment, and frozen headers.
- **Renderer-ready · Cards** — Turns each row into a labeled record card.
- **Schema-extension · Database** — Adds typed columns, sorting, filtering, and validation.
- **Schema-extension · Kanban** — Groups records by one selected status column.
- **Schema-extension · Gallery** — Uses one media column as a visual cover.
- **Schema-extension · Form View** — Edits one record through a vertical field form.
- **Schema-extension · Pivot** — Groups and aggregates rows by selected dimensions.

### Text Input (`text_input`)

Current purpose: A clean text value that can feed any connected branch. Current skins: **none**.

Current automation surface: Text value (text, writable), Has value (boolean); no trigger commands.

- **Renderer-ready · Single Line** — The current compact text source.
- **Renderer-ready · Multiline** — A larger text area for paragraphs and payloads.
- **Renderer-ready · Search** — Search-field styling with clear and submit affordances.
- **Renderer-ready · URL** — Validates and normalizes a web address.
- **Renderer-ready · Email** — Validates an email-shaped value without sending it.
- **Schema-extension · Tags** — Produces an ordered list of small text tokens.
- **Schema-extension · Command** — Keeps history and emits submitted values rather than every keystroke.

### Toggle (`toggle`)

Current purpose: A simple on/off condition for gates, triggers, and branches. Current skins: **none**.

Current automation surface: On / off (boolean, writable); Switch off.

- **Renderer-ready · Switch** — The current sliding on/off control.
- **Renderer-ready · Checkbox** — A conventional completion-style boolean.
- **Renderer-ready · Power** — One large armed/disarmed button.
- **Renderer-ready · Segment** — Two explicit labeled choices rather than an abstract switch.
- **Renderer-ready · Availability** — Available/busy language with status color.
- **Schema-extension · Tri-state** — Adds unknown or automatic between off and on.

### Unit Converter (`unit_converter`)

Current purpose: Fast local conversions for length, mass, temperature, and time. Current skins: **none**.

Current automation surface: Input (number, writable), Converted output (number); no trigger commands.

- **Renderer-ready · General** — The current input/output conversion.
- **Renderer-ready · Cooking** — Cups, spoons, weight, temperature, and serving-friendly units.
- **Renderer-ready · Engineering** — Length, area, volume, pressure, energy, and power.
- **Renderer-ready · Data** — Bits, bytes, transfer sizes, and decimal/binary prefixes.
- **Renderer-ready · Temperature** — A focused Celsius, Fahrenheit, and Kelvin surface.
- **Schema-extension · Currency** — Adds dated exchange-rate sources and freshness.
- **Schema-extension · Custom Formula** — Lets a user define safe factor and offset conversions.

### World Clock (`world_clock`)

Current purpose: Local time in the cities you care about. Current skins: **none**.

Current automation surface: Primary time (text), Zones (number); Add timezone from wire.

- **Renderer-ready · City Grid** — Large digital times arranged by city.
- **Renderer-ready · Analog Wall** — A wall-clock presentation for rapid daylight recognition.
- **Renderer-ready · Overlap Band** — Highlights the shared working hours across selected zones.
- **Renderer-ready · Meeting Planner** — Scrubs one local time and shows its equivalent everywhere.
- **Schema-extension · Travel Clock** — Adds origin, destination, departure, and adaptation guidance.
- **Schema-extension · Sunlight** — Adds sunrise, sunset, and local daylight state for every city.

## Media & Creative

### AI Generator (`ai_generator`)

Current purpose: Prompt-driven content generator. Current skins: **none**.

Current automation surface: Prompt (text, writable), Generated (boolean); no trigger commands.

- **Renderer-ready · Brainstorm** — Produces several short alternatives from one prompt.
- **Renderer-ready · Rewrite** — Preserves source text while generating a chosen transformation.
- **Renderer-ready · Summarize** — Creates a bounded synopsis and optional key points.
- **Renderer-ready · Extract** — Pulls named facts or fields from supplied text.
- **Renderer-ready · Classify** — Returns one label from a user-defined set.
- **Schema-extension · Structured Output** — Validates generated JSON against a user-defined schema.
- **Schema-extension · Prompt Lab** — Stores prompt variants, parameters, outputs, and comparisons.

### Color Palette (`color_palette`)

Current purpose: A swatch board — click a hue to copy its hex. Current skins: **none**.

Current automation surface: Swatches (number); no trigger commands.

- **Renderer-ready · Swatches** — The current named set of colors.
- **Renderer-ready · Gradient** — Builds and previews ordered color stops.
- **Renderer-ready · Brand** — Separates primary, secondary, neutral, success, warning, and danger roles.
- **Renderer-ready · Accessibility** — Prioritizes contrast ratios and valid text/background pairs.
- **Schema-extension · Ramp** — Generates numbered light-to-dark steps from one seed.
- **Schema-extension · Image Extract** — Derives dominant colors from a selected media asset.
- **Schema-extension · Design Tokens** — Exports semantic CSS or platform token names and values.

### Dialog (`dialog`)

Current purpose: Script lines by character. Current skins: **none**.

Current automation surface: Lines (number); no trigger commands.

- **Renderer-ready · Screenplay** — Character headings, parentheticals, dialogue, and scene rhythm.
- **Renderer-ready · Chat** — Message bubbles with alternating speakers.
- **Renderer-ready · Interview** — Question-and-answer transcript styling.
- **Renderer-ready · Roleplay** — Speaker goals, hidden notes, and performance prompts.
- **Schema-extension · Comic** — Groups lines into panels and speech balloons.
- **Schema-extension · Localization** — Shows source and translated lines side by side.
- **Schema-extension · Audio Transcript** — Adds timestamps and speaker identification.

### Drawing (`sketchpad`)

Current purpose: Quick pressure-sensitive ink and full diagram skins. Current skins: **Quick Ink, Diagram**.

Current automation surface: no bindable fields; no trigger commands.

- **Renderer-ready · Whiteboard** — An infinite light-background diagram surface.
- **Renderer-ready · Graph Paper** — A precise square-grid surface for spatial reasoning.
- **Renderer-ready · Dot Grid** — A quieter alignment aid for notes and diagrams.
- **Schema-extension · Storyboard** — Adds ordered frames with captions and shot notes.
- **Schema-extension · Annotation** — Uses an imported image or PDF page as the locked background.

### Media (`media`)

Current purpose: An image by URL with a caption. Current skins: **none**.

Current automation surface: Image URL (text, writable), Caption (text, writable); no trigger commands.

- **Renderer-ready · Image** — The current single image with caption.
- **Renderer-ready · Video** — A player-first view with poster and caption.
- **Renderer-ready · Audio** — Waveform or player treatment for a sound asset.
- **Renderer-ready · Document Preview** — First-page or file-type preview with metadata.
- **Renderer-ready · Before / After** — Compares two versions with a draggable reveal.
- **Schema-extension · Gallery** — Stores and browses several related media items.
- **Schema-extension · Moodboard** — Supports free visual arrangement and annotations.

## Tracking

### Contact Card (`contact`)

Current purpose: Name, role, and how to reach them. Current skins: **none**.

Current automation surface: Name (text, writable), Email (text, writable); no trigger commands.

- **Renderer-ready · Personal** — Informal identity, birthday, notes, and preferred channels.
- **Renderer-ready · Business** — Company, role, work details, and professional links.
- **Renderer-ready · Emergency** — Critical details and one-tap call emphasis.
- **Renderer-ready · Vendor** — Service category, terms, identifiers, and support routes.
- **Schema-extension · Relationship** — Adds last contact, desired cadence, and personal context.
- **Schema-extension · Household** — Represents several related people under one address.
- **Schema-extension · Care Contact** — Adds role, availability, care notes, and escalation order.

### Counter (`counter`)

Current purpose: A tally counter — one number, step-adjustable. Current skins: **none**.

Current automation surface: Count (number, writable); Increment counter, Decrement counter, Reset counter.

- **Renderer-ready · Tally** — The current increment/decrement counter.
- **Renderer-ready · Clicker** — One enormous tap target for events and attendance.
- **Renderer-ready · Goal Counter** — Shows current, target, remaining, and percent.
- **Renderer-ready · Up / Down** — Prominent plus and minus controls for changing quantities.
- **Schema-extension · Multi-counter** — Maintains several named tallies in one card.
- **Schema-extension · Timed Rate** — Calculates events per minute or hour.
- **Schema-extension · Resetting Period** — Keeps daily, weekly, or monthly totals and history.

### Goal (`goal_tracker`)

Current purpose: Simple progress, milestones, study hours, and OKR skins. Current skins: **Simple, Milestones, Study Hours, OKR**.

Current automation surface: Progress % (number, writable), Complete (boolean); Reset milestones, Complete all milestones.

- **Renderer-ready · Thermometer** — A vertical progress vessel for one measurable target.
- **Renderer-ready · Burn-up** — Shows completed amount against a changing total scope.
- **Renderer-ready · Score Ring** — A compact circular reading suited to dashboards.
- **Schema-extension · Streak Goal** — Measures consecutive qualifying days rather than one percentage.
- **Schema-extension · Savings Goal** — Adds contributions, remaining amount, and projected completion.
- **Schema-extension · Outcome / Inputs** — Separates the desired result from controllable lead measures.

### Habit Tracker (`habit`)

Current purpose: A weekly streak grid for one habit. Current skins: **none**.

Current automation surface: Days done (number); Clear the week.

- **Renderer-ready · Week Grid** — The current seven-day completion row.
- **Renderer-ready · Month Heatmap** — A contribution-style month history.
- **Renderer-ready · Chain** — Emphasizes the uninterrupted sequence of qualifying days.
- **Renderer-ready · Scorecard** — Shows compliance rate and recent misses.
- **Schema-extension · Routine Stack** — Orders several habits around an anchor behavior.
- **Schema-extension · Minimum / Target** — Records a minimum acceptable and ideal daily amount.
- **Schema-extension · Flexible Frequency** — Supports times-per-week goals instead of specific weekdays.

### Inventory (`inventory`)

Current purpose: Track quantities and immediately surface low-stock items. Current skins: **none**.

Current automation surface: Total units (number), Low stock (number), All stocked (boolean); no trigger commands.

- **Renderer-ready · Stock List** — The current quantities and low-stock view.
- **Renderer-ready · Pantry** — Food-first rows with unit, expiry, and shopping state.
- **Renderer-ready · Asset Register** — Serial, owner, condition, purchase, and warranty emphasis.
- **Renderer-ready · Equipment Checkout** — Who holds each item and when it is due.
- **Renderer-ready · Locations** — Groups stock by room, shelf, bin, or site.
- **Schema-extension · Batch & Expiry** — Tracks lots, expiry dates, and first-expiring-first-out.
- **Schema-extension · Scan-first** — Uses barcode events to find, increment, or decrement stock.

### Link List (`links`)

Current purpose: Labelled external links, click to open. Current skins: **none**.

Current automation surface: Links (number); Add link from wire.

- **Renderer-ready · Bookmark Grid** — Visual tiles for saved destinations.
- **Renderer-ready · Reading Queue** — Ordered links with unread, active, and finished states.
- **Renderer-ready · Resource List** — Dense titles, descriptions, and domains for reference.
- **Renderer-ready · Link-in-bio** — Large curated buttons intended for sharing or presentation.
- **Schema-extension · Research Trail** — Adds why-saved notes, source type, and linked claims.
- **Schema-extension · Watch Later** — Adds duration, platform, and completion state.
- **Schema-extension · Health Monitor** — Periodically checks whether saved URLs remain reachable.

### Mood Tracker (`mood_tracker`)

Current purpose: A weekly mood log — tap a day to cycle through. Current skins: **none**.

Current automation surface: Days logged (number); Clear the week.

- **Renderer-ready · Week Check-in** — The current seven-day mood strip.
- **Renderer-ready · Month Heatmap** — Shows mood intensity across a calendar month.
- **Renderer-ready · Mood Wheel** — Chooses from a richer emotional vocabulary.
- **Schema-extension · Mood Journal** — Adds context notes, triggers, and helpful responses.
- **Schema-extension · Energy Matrix** — Plots pleasantness against energy.
- **Schema-extension · Trend** — Charts rolling mood, variability, and missing check-ins.

### Reading List (`reading_list`)

Current purpose: Books & articles with queued/reading/done states. Current skins: **none**.

Current automation surface: Read (number); Re-queue everything.

- **Renderer-ready · Bookshelf** — The current visual shelf of queued and finished items.
- **Renderer-ready · Reading Queue** — A focused next-up list with one active book or article.
- **Renderer-ready · Curriculum** — Groups reading into ordered modules or subjects.
- **Renderer-ready · Reference Library** — Dense searchable rows optimized for lookup rather than completion.
- **Schema-extension · Reading Log** — Records sessions, pages, duration, notes, and completion history.
- **Schema-extension · Citation Trail** — Surfaces linked citation records and related notes per source.

### Status (`status`)

Current purpose: A universal workflow state with progress and completion outputs. Current skins: **none**.

Current automation surface: Status (text, writable), Progress % (number), Complete (boolean); Reset status, Mark done.

- **Renderer-ready · Badge** — The current compact workflow state.
- **Renderer-ready · Traffic Light** — Red, amber, and green operational health.
- **Renderer-ready · Progress** — Makes completion percentage the dominant signal.
- **Renderer-ready · Pipeline** — Shows the current stage within an ordered flow.
- **Renderer-ready · Availability** — Online, busy, away, offline, or maintenance.
- **Schema-extension · Approval** — Adds pending, approved, rejected, and revision-requested states.
- **Schema-extension · Service Health** — Adds incident message, freshness, and uptime context.

### Timer (`timekeeper`)

Current purpose: Countdown, Pomodoro, and Stopwatch in one mode-switching timer. Current skins: **Countdown, Pomodoro, Stopwatch**.

Current automation surface: Running (boolean), Mode (text); Reset current timer.

- **Renderer-ready · Hourglass** — A calm visual countdown with minimal controls.
- **Schema-extension · Intervals** — Alternates configurable work and recovery segments.
- **Schema-extension · Tabata** — Runs repeated high-intensity and rest rounds.
- **Schema-extension · Chess Clock** — Maintains two mutually exclusive running clocks.
- **Schema-extension · Lap Timer** — Records named laps and split differences.
- **Schema-extension · Multi-stage Timer** — Runs several named timed phases in sequence.

### Timesheet (`timesheet`)

Current purpose: Log hours, mark billable work, and calculate live totals. Current skins: **none**.

Current automation surface: Total hours (number), Billable hours (number), Billable amount (number); no trigger commands.

- **Renderer-ready · Daily** — Entries grouped by day.
- **Renderer-ready · Weekly** — A week grid with daily totals.
- **Renderer-ready · Project** — Groups time by project and task.
- **Renderer-ready · Client** — Groups billable work by client and rate.
- **Renderer-ready · Shift** — Clock-in, break, and clock-out emphasis.
- **Schema-extension · Timer** — Runs a live entry and commits elapsed time.
- **Schema-extension · Approval** — Adds submitted, approved, rejected, and invoiced states.

### Tracker (`tracker`)

Current purpose: One flexible tracker with skins for logs, routines, status, and planning. Current skins: **Savings Circle, Zakat & Giving, Remittance, Price Book, Utility Runway, Fuel Log, Income Streams, Wishlist, Vitals, Cycle, Fasting, Hydration, Sleep Ledger, Stretch Deck, Prayer Times, Scripture Plan, Gratitude Jar, Prayer Wall, Power Schedule, Borrow Ledger, Plant Shelf, Go Bag, Bin Night, Sun Window, Moving Boxes, Meeting Meter, Waiting On, Overlap Finder, Scope Meter, Handover, Crit Room, On Call, Estimate, Past Papers, Memorization, Experiments, Mistake Bank, Skill Tree, Care Plan, Gift Ledger, Applause Meter, Potluck Board, Star Chart, Pet Card, Visa Runway, Packing, Jet Lag Plan, Cash Pockets, Commission Queue, Content Pipeline**.

Current automation surface: Current (number, writable), Target (number, writable), Active (boolean, writable); no trigger commands.

No new Tracker skin is recommended. Tracker already has fifty domain skins; improve search, grouping, and favorites before adding more.

## Automation & Logic

### Aggregator (`aggregator`)

Current purpose: Average min max or count inputs. Current skins: **none**.

Current automation surface: Input 1 (number, writable), Input 2 (number, writable), Input 3 (number, writable), Input 4 (number, writable), Input 5 (number, writable), Input 6 (number, writable), Value (number); no trigger commands.

- **Renderer-ready · Average** — The current mean of several inputs.
- **Renderer-ready · Sum** — Adds all numeric inputs.
- **Renderer-ready · Minimum / Maximum** — Chooses the lowest or highest input.
- **Renderer-ready · Count** — Counts non-zero or true inputs.
- **Renderer-ready · Any / All** — Combines boolean-like inputs.
- **Schema-extension · Weighted** — Associates a weight with each input.
- **Schema-extension · Rolling Window** — Aggregates recent recorded values instead of simultaneous inputs.

### Approval Gate (`approval_gate`)

Current purpose: Pause visibly for a human decision. Current skins: **none**.

Current automation surface: Input (text, writable), Output (text), Enabled (boolean, writable), Running (boolean), Count (number), Concurrency (number, writable), Last error (text); Execute, Enqueue, Dequeue, Approve, Reject, Acquire, Release, Clear.

- **Renderer-ready · Manual** — The current one-person approve or reject gate.
- **Renderer-ready · Preview** — Makes the incoming payload and decision consequences prominent.
- **Schema-extension · Two-person** — Requires two distinct approvals.
- **Schema-extension · Quorum** — Requires a configurable number of approvals from a group.
- **Schema-extension · Timeout** — Expires, rejects, or escalates after a deadline.
- **Schema-extension · Policy** — Shows the rule and evidence that a reviewer must check.

### Comparator (`comparator`)

Current purpose: Compare numbers into a decision. Current skins: **none**.

Current automation surface: A (number, writable), B (number, writable), Low (number, writable), High (number, writable), Result (boolean), Gap (number); no trigger commands.

- **Renderer-ready · Threshold** — Compares one value against a limit.
- **Renderer-ready · Range** — Tests whether a value is inside or outside bounds.
- **Renderer-ready · Equality** — Compares two values for equal or unequal state.
- **Renderer-ready · Gap** — Emphasizes numeric distance between A and B.
- **Schema-extension · Hysteresis** — Uses different enter and exit thresholds to prevent chatter.
- **Schema-extension · Change** — Compares the current value with its previous reading.
- **Schema-extension · Freshness** — Tests whether a timestamp is newer than a maximum age.

### HTTP Request (`http_request`)

Current purpose: Call an external API and publish its response. Current skins: **none**.

Current automation surface: Input (text, writable), Output (text), Enabled (boolean, writable), Running (boolean), Count (number), Concurrency (number, writable), Last error (text); Execute, Enqueue, Dequeue, Approve, Reject, Acquire, Release, Clear.

- **Renderer-ready · REST** — Method, URL, headers, body, and response.
- **Renderer-ready · Health Check** — Minimal URL, status, latency, and last-error view.
- **Renderer-ready · Form Post** — Composes form-encoded fields instead of raw JSON.
- **Renderer-ready · GraphQL** — Query, variables, endpoint, and response.
- **Schema-extension · File Upload** — Adds multipart files and progress.
- **Schema-extension · Pagination** — Follows page tokens and combines bounded results.
- **Schema-extension · Authenticated** — Uses a protected credential reference when secure storage exists.

### Notifier (`notifier`)

Current purpose: Send a toast or browser reminder. Current skins: **none**.

Current automation surface: Armed (boolean, writable), Message (text, writable), Last fired (text), Fire count (number); Send notification.

- **Renderer-ready · In-app** — The current Grovepad notification.
- **Renderer-ready · System** — Uses the operating system notification surface when permitted.
- **Renderer-ready · Banner** — Keeps a visible message on the canvas until dismissed.
- **Schema-extension · Reminder** — Schedules the message for a later time.
- **Schema-extension · Escalation** — Repeats or changes channel until acknowledged.
- **Schema-extension · Digest** — Collects several events into one bounded summary.
- **Schema-extension · Quiet Hours** — Defers non-urgent messages outside selected times.

### Range Mapper (`range_mapper`)

Current purpose: Turn numbers into human status bands. Current skins: **none**.

Current automation surface: Input (number, writable), Band label (text), Band index (number), Top band (boolean); no trigger commands.

- **Renderer-ready · Bands** — The current named threshold ranges.
- **Renderer-ready · Gauge Labels** — Maps a reading to poor, fair, good, or excellent.
- **Renderer-ready · Grade** — Maps a score to letter or mastery level.
- **Renderer-ready · Priority** — Maps urgency/impact input to a priority label.
- **Renderer-ready · Risk** — Maps a score to low, medium, high, or critical.
- **Schema-extension · Gradient** — Interpolates a color continuously rather than selecting a discrete band.
- **Schema-extension · Lookup** — Maps exact source values to arbitrary text outputs.

### Recorder (`recorder`)

Current purpose: Turn any number into history. Current skins: **none**.

Current automation surface: Input (number, writable), Last (number), Sample count (number), Average (number), 7-day change (number), Series (series); Record sample, Clear history.

- **Renderer-ready · Event Log** — Records each commanded input with its time.
- **Renderer-ready · Trend** — Emphasizes series, average, and recent change.
- **Renderer-ready · Daily Snapshot** — Keeps one reading per local day.
- **Renderer-ready · Min / Max** — Highlights extremes and when they occurred.
- **Schema-extension · Rolling Window** — Retains only a selected time or count window.
- **Schema-extension · Audit** — Adds source, actor, reason, and immutable entry identifiers.
- **Schema-extension · Distribution** — Buckets recorded readings into a histogram.

### Schedule Pulse (`clock_pulse`)

Current purpose: Fire automations on a schedule. Current skins: **none**.

Current automation surface: Active (boolean), Pulse (boolean), Today (text); no trigger commands.

- **Renderer-ready · Once** — Fires at one chosen date and time.
- **Renderer-ready · Interval** — Fires every selected number of minutes or hours.
- **Renderer-ready · Daily** — Fires at one or more local times each day.
- **Renderer-ready · Weekly** — Fires on selected weekdays and times.
- **Renderer-ready · Business Hours** — Stays active only inside a weekly availability schedule.
- **Schema-extension · Cron** — Supports an advanced validated recurrence expression.
- **Schema-extension · Solar** — Uses Location to fire around sunrise or sunset.

### Sequencer (`sequencer`)

Current purpose: Advance through ordered stages. Current skins: **none**.

Current automation surface: Current step (text), Index (number), Progress (number), Done (boolean); Advance step, Restart sequence.

- **Renderer-ready · Steps** — The current ordered sequence.
- **Renderer-ready · Round Robin** — Cycles indefinitely through participants or destinations.
- **Renderer-ready · Playlist** — Shows previous, current, and upcoming items.
- **Renderer-ready · Wizard** — One stage at a time with back and next.
- **Schema-extension · State Timeline** — Records time entered and time spent in each stage.
- **Schema-extension · Conditional Sequence** — Skips or branches stages based on incoming conditions.

### Snapshot Latch (`latch`)

Current purpose: Capture and hold a baseline. Current skins: **none**.

Current automation surface: Current (number, writable), Held (number), Delta (number), Held at (text); Capture snapshot.

- **Renderer-ready · Baseline** — The current current-versus-held comparison.
- **Renderer-ready · Before / After** — Presents the held value as before and current as after.
- **Renderer-ready · Peak Hold** — Retains the highest observed value until reset.
- **Renderer-ready · Last Known Good** — Retains the last reading received while a condition was healthy.
- **Schema-extension · Snapshot History** — Keeps several named captures rather than one.
- **Schema-extension · Change Detector** — Exposes magnitude and direction since the last capture.

### Text Composer (`template`)

Current purpose: Compose live values into sentences. Current skins: **none**.

Current automation surface: Slot A (text, writable), Slot B (text, writable), Slot C (text, writable), Slot D (text, writable), Composed text (text); no trigger commands.

- **Renderer-ready · Sentence** — The current text pattern with named slots.
- **Renderer-ready · Email** — Subject/body structure with recipient-friendly placeholders.
- **Renderer-ready · Notification** — Short title and message composition.
- **Renderer-ready · URL Builder** — Encodes path and query values safely.
- **Renderer-ready · Filename** — Sanitizes components into a portable filename.
- **Schema-extension · JSON** — Builds and validates structured JSON from fields.
- **Schema-extension · Markdown** — Composes headings, sections, lists, and links.

### Webhook Sender (`webhook_sender`)

Current purpose: Send structured events to another service. Current skins: **none**.

Current automation surface: Input (text, writable), Output (text), Enabled (boolean, writable), Running (boolean), Count (number), Concurrency (number, writable), Last error (text); Execute, Enqueue, Dequeue, Approve, Reject, Acquire, Release, Clear.

- **Renderer-ready · JSON** — The current generic JSON webhook.
- **Renderer-ready · Form Payload** — Sends URL-encoded key-value data.
- **Renderer-ready · Event Envelope** — Wraps payload with event name, ID, and timestamp.
- **Schema-extension · Signed** — Adds a protected signing secret and signature header.
- **Schema-extension · Retrying** — Uses bounded retry, backoff, and last-attempt state.
- **Schema-extension · Batch** — Collects several payloads before one send.
- **Schema-extension · Connector Message** — Formats a safe message for a selected chat connector.

### Widget Creator (`widget_creator`)

Current purpose: Create widgets from incoming records. Current skins: **none**.

Current automation surface: Input (text, writable), Output (text), Enabled (boolean, writable), Running (boolean), Count (number), Concurrency (number, writable), Last error (text); Execute, Enqueue, Dequeue, Approve, Reject, Acquire, Release, Clear.

- **Renderer-ready · Single** — Creates one configured widget from an input payload.
- **Renderer-ready · From Form** — Maps form values into title and starter content.
- **Renderer-ready · From Template** — Creates a selected widget preset from named inputs.
- **Schema-extension · Batch** — Creates several widgets from a collection.
- **Schema-extension · Scheduled** — Creates a new period card when triggered by a pulse.
- **Schema-extension · Child Canvas** — Creates a canvas and seeds it with selected starter widgets.

### Workflow Lock (`workflow_lock`)

Current purpose: Prevent concurrent duplicate workflow runs. Current skins: **none**.

Current automation surface: Input (text, writable), Output (text), Enabled (boolean, writable), Running (boolean), Count (number), Concurrency (number, writable), Last error (text); Execute, Enqueue, Dequeue, Approve, Reject, Acquire, Release, Clear.

- **Renderer-ready · Guard** — The current enabled/disabled workflow barrier.
- **Renderer-ready · Maintenance** — Frames the lock as a maintenance window control.
- **Renderer-ready · Emergency Stop** — A highly visible safety stop with deliberate re-arm.
- **Schema-extension · Lease** — Automatically releases after a bounded duration.
- **Schema-extension · Owner Lock** — Records who acquired the lock and why.
- **Schema-extension · Rate Window** — Allows a limited number of runs per period.

## Life Systems

### Chore Rotation (`chore_rotation`)

Current purpose: Rotate household work automatically. Current skins: **none**.

Current automation surface: Assignments (text), My chores (text); Rotate chores.

- **Renderer-ready · Weekly** — The current person-to-chore rotation.
- **Renderer-ready · Zones** — Assigns people to rooms or responsibility areas.
- **Renderer-ready · Fairness** — Emphasizes recent workload balance.
- **Renderer-ready · Kids** — Large tasks, stars, and simple completion.
- **Schema-extension · Points** — Assigns effort values and balances totals.
- **Schema-extension · Availability** — Skips unavailable people and preserves rotation fairness.
- **Schema-extension · Shift** — Supports teams handing recurring duties between shifts.

### Debt Payoff (`debt_payoff`)

Current purpose: Balances payoff date and interest. Current skins: **none**.

Current automation surface: Extra payment (number, writable), Total balance (number), Months to free (number), Total interest (number), Debt-free date (text); no trigger commands.

- **Renderer-ready · Snowball** — Orders debts by smallest balance.
- **Renderer-ready · Avalanche** — Orders debts by highest interest rate.
- **Renderer-ready · Timeline** — Shows projected payoff events over time.
- **Renderer-ready · Motivation** — Emphasizes milestones, paid principal, and next victory.
- **Schema-extension · Hybrid** — Lets a user pin exceptions while otherwise following a strategy.
- **Schema-extension · Payment Planner** — Tests extra-payment scenarios by month.

### Decision Journal (`decision_journal`)

Current purpose: Review and score past decisions. Current skins: **none**.

Current automation surface: Due for review (number), Entries (number), Hit rate (number); no trigger commands.

- **Renderer-ready · Decision Card** — The current rationale, prediction, and review record.
- **Renderer-ready · Review Queue** — Shows decisions whose outcomes are ready to assess.
- **Renderer-ready · Predictions** — Emphasizes probability and calibration.
- **Renderer-ready · Lessons** — Surfaces completed reviews and reusable lessons.
- **Schema-extension · Bias Check** — Prompts for common biases and counterevidence.
- **Schema-extension · Outcome Score** — Separates decision quality from eventual outcome.
- **Schema-extension · Recurring Decision** — Compares repeated choices across periods.

### Expense Split (`expense_split`)

Current purpose: Calculate the smallest fair settlement. Current skins: **none**.

Current automation surface: Total (number), You are owed (number), You owe (number), Settlement (text); no trigger commands.

- **Renderer-ready · Equal** — Splits every included expense evenly.
- **Renderer-ready · Shares** — Uses participant share counts.
- **Renderer-ready · Percentages** — Uses explicit participant percentages.
- **Renderer-ready · Settlement** — Shows the minimum transfer plan.
- **Schema-extension · Trip** — Groups expenses by day, currency, and payer.
- **Schema-extension · Household** — Supports recurring shared costs and monthly close.
- **Schema-extension · Event** — Adds budget category, guest subgroup, and reimbursement state.

### Gifts & Occasions (`gifts_occasions`)

Current purpose: Occasions ideas and planned spend. Current skins: **none**.

Current automation surface: Next occasion (number), Next occasion name (text), Unbought soon (number), Planned spend (number); no trigger commands.

- **Renderer-ready · Timeline** — The current next-occasion view.
- **Renderer-ready · Ideas** — Groups gift ideas by person.
- **Renderer-ready · Budget** — Shows planned and purchased spend.
- **Renderer-ready · Purchased** — Focuses on bought, delivered, wrapped, and given.
- **Schema-extension · Family** — Groups related occasions and shared gifts.
- **Schema-extension · Shipping** — Adds order, carrier, tracking, and arrival state.
- **Schema-extension · Traditions** — Stores recurring traditions, preferences, and past gifts.

### Guest List (`guest_list`)

Current purpose: RSVP headcount and dietary needs. Current skins: **none**.

Current automation surface: Confirmed (number), Pending (number), Dietary notes (text); no trigger commands.

- **Renderer-ready · RSVP** — The current invited/maybe/confirmed list.
- **Renderer-ready · Dietary** — Groups confirmed guests by dietary need.
- **Renderer-ready · Check-in** — Large arrival controls for the event door.
- **Renderer-ready · Households** — Groups invitations and plus-ones into parties.
- **Renderer-ready · Capacity** — Emphasizes confirmed headcount against limits.
- **Schema-extension · Seating** — Assigns guests to tables, rooms, or sections.
- **Schema-extension · Communication** — Tracks invitation, reminder, and final-detail messages.

### Home Maintenance (`home_maintenance`)

Current purpose: Recurring jobs with their own clocks. Current skins: **none**.

Current automation surface: Due (number), Overdue (number), Next due (text); no trigger commands.

- **Renderer-ready · Due Soon** — The current next-maintenance queue.
- **Renderer-ready · Calendar** — Plots work by due date.
- **Renderer-ready · By Room** — Groups tasks by physical area.
- **Renderer-ready · Seasonal** — Groups preparation by season.
- **Schema-extension · Asset** — Adds model, serial, warranty, manual, and service history.
- **Schema-extension · Contractor** — Adds provider, quote, appointment, and invoice.
- **Schema-extension · History** — Shows completed work and changing intervals.

### Invoices (`invoices`)

Current purpose: Track receivables and overdue followups. Current skins: **none**.

Current automation surface: Outstanding (number), Overdue (number), Paid this month (number); no trigger commands.

- **Renderer-ready · Receivables** — The current money-owed-to-you view.
- **Renderer-ready · Payables** — Tracks bills your household or team must pay.
- **Renderer-ready · Aging** — Groups outstanding value into age buckets.
- **Renderer-ready · Pipeline** — Draft, sent, viewed, due, overdue, and paid.
- **Schema-extension · Cashflow** — Plots expected and actual payment timing.
- **Schema-extension · Client** — Groups invoice history and outstanding value by client.
- **Schema-extension · Recurring** — Generates the next invoice draft from a schedule.

### Job Applications (`job_applications`)

Current purpose: Pipeline with followup pressure. Current skins: **none**.

Current automation surface: Active (number), Needs followup (number), Interviews (number), Offers (number); no trigger commands.

- **Renderer-ready · Pipeline** — The current stage-based application board.
- **Renderer-ready · Follow-up** — Prioritizes applications needing contact.
- **Renderer-ready · Calendar** — Shows deadlines, interviews, and promised responses.
- **Renderer-ready · Companies** — Groups roles and contacts by employer.
- **Schema-extension · Interview Prep** — Adds questions, stories, people, and next-round plan.
- **Schema-extension · Offer Compare** — Compares compensation, role, growth, flexibility, and risk.
- **Schema-extension · Networking** — Links contacts and conversations to opportunities.

### Keep in Touch (`keep_in_touch`)

Current purpose: Relationship cadence and overdue contacts. Current skins: **none**.

Current automation surface: Overdue (number), Next up (text); no trigger commands.

- **Renderer-ready · Queue** — The current overdue-contact list.
- **Renderer-ready · Radar** — Concentric circles based on relationship cadence.
- **Renderer-ready · Calendar** — Shows upcoming and overdue contact dates.
- **Renderer-ready · Circles** — Groups people by family, close friends, work, and community.
- **Schema-extension · Reciprocity** — Shows who initiated recent contact without turning relationships into scores.
- **Schema-extension · Conversation Notes** — Adds last topic, commitments, and suggested follow-up.
- **Schema-extension · CRM** — Adds stage, organization, and opportunity context for professional relationships.

### Meal Planner (`meal_planner`)

Current purpose: Plan seven days and three meals. Current skins: **none**.

Current automation surface: Planned meals (number), Meal gaps (number), Today’s meals (text), Shopping list (text, writable); no trigger commands.

- **Renderer-ready · Week** — The current breakfast/lunch/dinner weekly grid.
- **Renderer-ready · Today** — Shows only today with preparation cues.
- **Renderer-ready · Batch Cooking** — Groups dishes by shared preparation session.
- **Renderer-ready · Pantry-first** — Surfaces meals that use soon-to-expire inventory.
- **Schema-extension · Nutrition** — Adds macro or dietary targets and daily totals.
- **Schema-extension · Family Vote** — Collects preferences before assigning meals.
- **Schema-extension · Leftovers** — Tracks portions carried into later meal slots.

### Medications (`medications`)

Current purpose: Doses taken today and refill runway. Current skins: **none**.

Current automation surface: Taken today (number), Remaining today (number), All taken (boolean), Refill days (number); Reset today’s doses.

- **Renderer-ready · Today** — The current daily dose check-off.
- **Renderer-ready · Schedule** — Time-ordered doses across the day.
- **Renderer-ready · Refills** — Emphasizes supply, daily use, and refill runway.
- **Renderer-ready · Travel** — Shows trip supply sufficiency and local-time schedule.
- **Schema-extension · As Needed** — Tracks reason, dose, limits, and last use for PRN medication.
- **Schema-extension · Caregiver** — Adds administered-by and confirmation state.
- **Schema-extension · Adherence** — Shows completion history without making clinical claims.

### Recipe (`recipe`)

Current purpose: Ingredients scale with servings. Current skins: **none**.

Current automation surface: Servings (number, writable), Ingredients (text), Cook minutes (number); no trigger commands.

- **Renderer-ready · Cook** — The current ingredients and ordered method.
- **Renderer-ready · Scale** — Makes serving adjustment and recalculated quantities dominant.
- **Renderer-ready · Mise en Place** — Groups ingredients by preparation or station.
- **Renderer-ready · Step Timer** — Shows the active step with relevant timer shortcuts.
- **Renderer-ready · Shopping** — Formats missing ingredients as a compact shopping handoff.
- **Schema-extension · Nutrition** — Adds per-serving nutrient values.
- **Schema-extension · Cost** — Adds ingredient prices and total/per-serving cost.

### Renewals Vault (`renewals_vault`)

Current purpose: Expiry dates and renewal lead times. Current skins: **none**.

Current automation surface: Soonest expiry (number), Due soon (number), Next up (text); no trigger commands.

- **Renderer-ready · Timeline** — The current ordered expiry view.
- **Renderer-ready · Wallet** — Compact identity, membership, license, and policy cards.
- **Renderer-ready · Compliance** — Highlights missing evidence and expired items.
- **Renderer-ready · Annual Cost** — Groups renewal fees by month and category.
- **Schema-extension · Documents** — Attaches the related file or scan to each renewal.
- **Schema-extension · Workflow** — Adds prepare, submit, approved, and received states.

### Snippet Library (`snippet_library`)

Current purpose: Reusable text sorted by use. Current skins: **none**.

Current automation surface: Count (number), Most used (text); no trigger commands.

- **Renderer-ready · Code** — Language, title, code, and copy-first controls.
- **Renderer-ready · Writing** — Reusable phrases, paragraphs, and fragments.
- **Renderer-ready · Support Replies** — Categorized customer-response templates.
- **Renderer-ready · Prompts** — AI prompts with variables and expected use.
- **Renderer-ready · Commands** — Shell or application commands with notes.
- **Schema-extension · Variables** — Adds named placeholders and one-click composition.
- **Schema-extension · Usage** — Tracks last used, use count, and favorite status.

### Subscriptions (`subscriptions`)

Current purpose: Recurring charges and renewal pressure. Current skins: **none**.

Current automation surface: Monthly total (number), Annual total (number), Next renewal (number), Due soon (number); no trigger commands.

- **Renderer-ready · List** — The current recurring-payment ledger.
- **Renderer-ready · Cost Breakdown** — Groups monthly equivalent cost by category.
- **Renderer-ready · Renewal Calendar** — Places renewals on a month or year timeline.
- **Renderer-ready · Audit** — Prompts keep, cancel, downgrade, or review decisions.
- **Schema-extension · Household** — Adds user, shared/private status, and payer.
- **Schema-extension · Usage Value** — Compares price with entered usage and cost per use.

### Trip Itinerary (`trip_itinerary`)

Current purpose: Daily legs bookings and confirmations. Current skins: **none**.

Current automation surface: Days until (number), Unbooked (number), Today’s plan (text); no trigger commands.

- **Renderer-ready · Days** — The current day-by-day itinerary.
- **Renderer-ready · Timeline** — A continuous chronological travel plan.
- **Renderer-ready · Bookings** — Prioritizes confirmations, addresses, and unbooked gaps.
- **Renderer-ready · Offline** — A compact essential-details view designed for weak connectivity.
- **Schema-extension · Map** — Places itinerary stops on a spatial route.
- **Schema-extension · Group** — Adds participant, responsibility, and per-person visibility.
- **Schema-extension · Travel Day** — Emphasizes transfers, buffers, documents, and local times.

### Weekly Review (`weekly_review`)

Current purpose: A recurring reflection ritual. Current skins: **none**.

Current automation surface: Completed (boolean, writable), Streak (number); Start new review period.

- **Renderer-ready · Guided** — The current prompt-by-prompt review.
- **Renderer-ready · Scorecard** — Shows completion, streak, and a few weekly ratings.
- **Renderer-ready · Wins / Lessons** — A concise reflective review.
- **Renderer-ready · GTD** — Inbox, calendar, projects, waiting, someday, and next actions.
- **Schema-extension · Team** — Adds shared wins, blockers, decisions, and commitments.
- **Schema-extension · Monthly** — Uses month-level prompts and trend summaries.
- **Schema-extension · Life Areas** — Reviews work, health, money, relationships, and home separately.

### Workout Plan (`workout_plan`)

Current purpose: Training volume and progression. Current skins: **none**.

Current automation surface: Session volume (number), Completed today (boolean), Last session (text); no trigger commands.

- **Renderer-ready · Plan** — The current session prescription.
- **Renderer-ready · Session** — One exercise at a time with sets and completion.
- **Renderer-ready · Circuit** — Rounds through exercises with rest cues.
- **Renderer-ready · Strength** — Sets, reps, load, volume, and previous performance.
- **Renderer-ready · Cardio** — Duration, distance, pace, and interval cues.
- **Renderer-ready · Mobility** — Timed holds, sides, and movement notes.
- **Schema-extension · Progress** — Adds exercise-level history and personal records.

## Specialist

### Game Mechanics Tuner (`game_tuner`)

Current purpose: Sliders for tuning game feel. Current skins: **none**.

Current automation surface: Grip (number, writable), Drift (number, writable), Stability (number, writable); no trigger commands.

- **Renderer-ready · Character** — Movement speed, grip, acceleration, jump, and air control.
- **Renderer-ready · Vehicle** — Grip, drift, steering, suspension, and speed.
- **Renderer-ready · Camera** — Follow lag, damping, field of view, shake, and dead zone.
- **Renderer-ready · Combat** — Damage, cooldown, knockback, reach, and recovery.
- **Schema-extension · Difficulty** — Groups tuning parameters into named difficulty profiles.
- **Schema-extension · Economy** — Sources, sinks, prices, rewards, and progression curves.
- **Schema-extension · Controller Feel** — Stores dead zones, sensitivity, curves, and vibration.

### Synthesizer & Audio Player (`audio_player`)

Current purpose: BPM, key, and signal chain scratchpad. Current skins: **none**.

Current automation surface: BPM (number, writable), Playing (boolean, writable); no trigger commands.

- **Renderer-ready · Player** — The current playback surface.
- **Renderer-ready · Synth** — Oscillator, envelope, filter, and pitch controls.
- **Renderer-ready · Metronome** — Tempo, meter, accent, and start/stop.
- **Renderer-ready · Loop** — A/B loop points and repeated practice.
- **Schema-extension · Sampler** — Maps several clips to trigger pads.
- **Schema-extension · Podcast** — Adds chapters, speed, skip intervals, and notes.
- **Schema-extension · A/B Compare** — Synchronizes two sources for rapid switching.

## Product rules for implementation

1. Add renderer-ready skins before schema-extension skins unless a user workflow depends on the extension.
2. Keep one canonical data model per widget. Optional mode-specific fields must round-trip when the user rolls away and back.
3. Do not expose every proposal simultaneously. Group skins by role and let users favorite or hide uncommon forms.
4. Give every skin a distinct resting face, accent, picker phrase, safe size range, and keyboard-readable label.
5. Preserve circuit meaning across skin switches. A field such as `percent`, `count`, or `complete` must not silently change semantics because the card wears another skin.
6. Treat history-heavy skins—logs, trends, audits, recurring schedules, collaboration—as schema work, not renderer work.
7. Reject any proposed skin that is better expressed by combining existing widgets in a template.
