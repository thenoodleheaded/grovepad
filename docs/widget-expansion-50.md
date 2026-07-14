# The Next 50 — A Global Friction Atlas

*50 proposed widgets, drafted under the [Widget Constitution](widget-constitution.md). Every entry names its friction (Article V), its wire story (Article III), its nearest census neighbor and why it isn't a reskin (Article IV), and a visual identity that extends the five archetypes without breaking the design code or the performance contract (Article VIII).*

---

## Design doctrine for this batch

Three system-level rules apply to all 50, so they read as one family and never as "50 random apps glued on":

### 1. The card is the object
Each widget's hero layer is the *domain object itself* — a tank, a jar, a pager, a suitcase, a vault — rendered inside the standard squircle shell with the standard accent tokens. Not an illustration next to the data: the object **is** the data. The tank's water level *is* `days_left`. The suitcase's bulge *is* `kg_over`. No widget in this batch is allowed to be "a box with a text input and a table."

All object rendering is state-driven CSS/SVG — no per-frame animation, no `backdrop-filter`, no per-widget timers (time-sensitive fields ride the shared minute heartbeat). Transitions fire only on state change, exactly like the existing motion system.

### 2. Glanceable decay ("leave-behinds")
These widgets are designed to be *walked away from*. Their ambient state must communicate from a zoomed-out canvas without opening anything: plants droop, borrowed-item tags rust, hourglass sand rises, the outage card dims. Each visual below defines its **far silhouette** — the one shape/color signal that must survive far-zoom LOD when card chrome is shed.

### 3. Port choreography
When a wire is attached to a field, the widget acknowledges by pulsing *the exact visual element that field reads from* (wiring `tank.days_left` flashes the water line, not the card border). This teaches the dependency graph viscerally and makes every widget feel like a citizen of the graph rather than a tenant on the canvas. One shared CSS hook (`.gp-port-ack` on the element carrying `data-field-key`) implements this for all 50.

**Wire minimums for this batch:** every widget ships at least one *derived* source field and at least one writable field or command. Zero new structural exemptions are claimed.

---

## I. Money & Livelihood *(pack: `life`)*

### 1. `savings_circle` — Savings Circle
- **Friction:** Hundreds of millions of people worldwide save through rotating circles — ROSCA, chit fund, susu, stokvel, tanda, hui, ayuuto — and track them in memory or a paper notebook that one person owns. Missed turns and disputed orders break friendships.
- **Not a reskin of:** `expense_split` (settlement math, one-shot) or `budget`. The rotation state machine — ordered members, pot accumulation, payout advancement, missed-contribution debt — is novel logic.
- **Wires:** sources `my_turn` (bool), `next_payout_date`, `pot_total`, `rounds_left`; command `advance_round`; writable `contribution_amount`. Story: `savings_circle.my_turn → branch_gate → countdown "Your payout Friday"` and `clock_pulse (monthly) → savings_circle.advance_round`.
- **Visual (Analog Dashboard):** a ring of member tokens (initial-coins) orbiting a central brass pot. The pot's fill level is the current round's collection. On `advance_round`, the pot *physically slides* along the ring to the next member with a weighted spring, leaving a faint gold trail on members already paid. Missed contributions render that member's token cracked. **Far silhouette:** the ring with one bright token — whose turn it is, visible from orbit.

### 2. `zakat` — Zakat & Giving
- **Friction:** ~1.9B Muslims owe an annual 2.5% on wealth above the nisab, dated to a *lunar* anniversary; most compute it ad hoc in a calculator app the night before Ramadan ends. A `mode` switch generalizes to tithe, tzedakah, and dāna presets.
- **Not a reskin of:** `budget` — nisab thresholding, lunar-year anniversary math, and rate presets are domain computation (`debt_payoff`-class justification).
- **Wires:** sources `due_amount`, `days_until_due` (timeSensitive), `above_nisab` (bool); writables `assets_total`, `nisab_value` (so a metals-price connector can feed it later). Story: `zakat.days_until_due → comparator (<30) → notifier`.
- **Visual (Premium Editorial):** a crescent arc traces the card's top edge and fills with gold leaf as the lunar year progresses toward the due date — the fill is *time*, not money. Below, a restrained ledger of asset lines in serif type. The due amount sits in a hand-inked medallion. Deliberately quiet, zero gamification — this is worship, not a streak. **Far silhouette:** the gold crescent's completeness.

### 3. `remittance_planner` — Remittance
- **Friction:** 280M+ migrant workers send money home on a rhythm; they juggle fee tables, exchange-rate timing, and two currencies in their head, usually in WhatsApp notes.
- **Not a reskin of:** `budget`/`unit_converter` — it holds a *recurring corridor* (from-currency, to-currency, fee schedule per provider, target amount *in home currency*) and back-computes what to send.
- **Wires:** sources `send_amount_local`, `next_send_date`, `best_provider` (text), `effective_fee_pct`; writable `exchange_rate` (manual today, API-fed tomorrow); command `mark_sent`. Story: `remittance_planner.next_send_date → countdown` and `exchange_rate input ← currency connector` when the API pack lands.
- **Visual (Database Ledger, subverted):** two shores — a left column (local currency, cool tone) and right column (home currency, warm tone) — joined by a single arc whose stroke weight is the send amount. Provider fee rows hang under the arc like toll gates; the cheapest gate is lit. On `mark_sent`, a light pulse travels the arc left→right. **Far silhouette:** the arc between two color fields.

### 4. `price_book` — Price Book
- **Friction:** In markets and shops from Lagos to Lahore to a Lidl in Leipzig, people can't remember what a fair price is for the 30 things they always buy. Haggling and deal-spotting both run on price memory nobody has.
- **Not a reskin of:** `inventory` (stock counts) or `table` — per-item price *history* with median math and a good-price verdict is the product.
- **Wires:** sources `watched_item_is_cheap` (bool), `cheapest_store` (text), `basket_median_total`; command `log_price`. Story: `price_book.watched_item_is_cheap → branch_gate → sticky_note "BUY RICE NOW" visibility`.
- **Visual (Database Ledger):** each item row carries a **price ladder** — a compact vertical strip of historical price ticks where the newest tick drops in like a stamped tag; below-median ticks are green, gouges red. A rubber-stamp `FAIR` / `HIGH` verdict slams onto the row on entry (spring physics). **Far silhouette:** the count of green rows.

### 5. `utility_runway` — Utility Runway
- **Friction:** Prepaid electricity meters (South Africa, Nigeria, Pakistan, much of LatAm), water tanks awaiting a delivery truck, LPG cylinders — a huge share of the world buys utilities in discrete chunks and gets surprised at zero. One widget, four modes: prepaid meter, tank volume, cylinder, data bundle.
- **Not a reskin of:** `subscriptions` (recurring billing ≠ consumable runway) or `counter` — burn-rate estimation from logged readings is derived computation.
- **Wires:** sources `days_left` (timeSensitive), `daily_burn`, `level_pct`; command `log_reading`, `log_topup`. Story: `utility_runway.days_left → range_mapper (≤2: "critical") → notifier "buy tokens today"`.
- **Visual (Analog Dashboard):** the card body is a translucent vessel cross-section — vertical tank for water, segmented battery for kWh, cylinder for gas — with a liquid/charge level that *is* the runway. Logged readings notch the vessel wall like a measuring jug. At ≤2 days the liquid surface line turns amber and the card's inner glow cools. **Far silhouette:** vessel fill height + color.

### 6. `fuel_log` — Fuel Log
- **Friction:** Drivers (and increasingly EV owners — mode switch: kWh) everywhere want cost-per-km and efficiency drift but log fill-ups nowhere, so a failing engine or a thirsty AC goes unnoticed for months.
- **Not a reskin of:** `logbook` — odometer-delta math, L/100km ⇄ MPG ⇄ km/kWh localization, and efficiency trend are computed.
- **Wires:** sources `cost_per_km`, `last_efficiency`, `efficiency_series` (series → feeds `line_chart`/`recorder`), `efficiency_drifting` (bool); command `log_fillup`. Story: `fuel_log.efficiency_drifting → notifier "book a service"` wired next to `home_maintenance`.
- **Visual (Analog Dashboard):** a horizontal road strip runs across the card; each fill-up is a pump pin on the road with its price tag. Above, one honest needle gauge: efficiency vs. your rolling average — the needle's resting angle is the drift. Units render in the user's locale automatically. **Far silhouette:** needle angle.

### 7. `side_income` — Income Streams
- **Friction:** Gig workers and creators earn across 3–6 platforms, each with its own payout threshold (the $100 AdSense cliff, the Upwork hold), and can't see combined pending money or when anything actually pays out.
- **Not a reskin of:** `invoices` (client receivables with due dates) — this models *platform thresholds and holds*.
- **Wires:** sources `total_pending`, `next_payout` (text), `nearest_threshold_pct`; writable per-stream `pending_amount` (API-feedable); command `log_earning`. Story: `side_income.nearest_threshold_pct → progress` and `→ comparator (=100) → notifier "AdSense payout unlocked"`.
- **Visual (Analog Dashboard):** tributary streams — one colored band per platform, width proportional to pending amount — flow rightward into a shared pool. Each stream passes through a **threshold gate**: a physical sluice that stays shut until the platform minimum, with the trapped amount pooling visibly behind it. Gates open with a spring snap. **Far silhouette:** pool size.

### 8. `wishlist_saver` — Wishlist
- **Friction:** Impulse purchases and abandoned savings goals are two faces of the same missing tool: a place where wanted things wait, cool off, and show an honest "you can afford this on <date>."
- **Not a reskin of:** `goal_tracker` — the 30-day cooling-off timer, price-vs-savings-rate afford-date math, and per-item verdicts are a consolidation `goal_tracker` can't express.
- **Wires:** sources `next_affordable` (text), `total_wanted`, `any_cooled_and_affordable` (bool); writable `monthly_savings_rate`; command `add_item`. Story: `wishlist_saver.any_cooled_and_affordable → branch_gate → gifts_occasions note` ("treat yourself" card appears).
- **Visual (Premium Editorial):** items sit in a glass display case, each behind a pane of **frost** that thins as savings approach the price — an item you can afford is crystal clear. New items also wear a thin cooling-off ring that drains over 30 days; buying before it drains requires dragging past a deliberate, springy resistance. **Far silhouette:** how many panes are clear.

---

## II. Health & Body *(pack: `life`; gentle tone rules apply)*

### 9. `vitals_log` — Vitals
- **Friction:** People managing hypertension or diabetes — disproportionately in South Asia, the Gulf, and the African diaspora — log BP/glucose on paper slips their doctor never sees trends from.
- **Not a reskin of:** `metrics` (static tiles) or `recorder` — target bands, in-range verdicts, and multi-vital correlation are clinical, not generic.
- **Wires:** sources `latest_systolic`, `latest_glucose`, `in_range` (bool), `week_series` (series); command `log_reading`. Story: `vitals_log.in_range → branch_gate (false) → notifier "share reading with Dr. Ahmed"` + `keep_in_touch` contact.
- **Visual (Analog Dashboard, clinical trim):** a monitor strip-chart: readings appear as ticks on a scrolling paper band with the personal target band shaded green behind them. Out-of-band ticks print taller, in red, with a tiny bracket — exactly like an ECG annotation. The band advances only on log, never animates idle. Large-type mode is one tap (older users are the primary users). **Far silhouette:** red ticks on the band.

### 10. `cycle_tracker` — Cycle
- **Friction:** Half the world menstruates for decades; cycle apps are cloud-connected data-harvesters that many users (post-2022 especially) actively distrust. A fully local tracker inside their own workspace is a genuine conversion argument.
- **Not a reskin of:** `habit`/`calendar` — phase prediction from period logs is computation; privacy posture is a feature.
- **Wires:** sources `phase` (text), `days_until_period` (timeSensitive), `in_pms_window` (bool); command `log_period_start`. Story: `cycle_tracker.in_pms_window → branch_gate → weekly_planner note` ("light training week") — wired beside `workout_plan`.
- **Visual (Analog Dashboard, lunar):** an orbital ring — the cycle rendered as a moon's orbit with phase arcs in four muted tones; the *today* marker travels the ring. A **discretion toggle** swaps the entire card to an abstract moon-phase art tile (still accurate to the wearer, meaningless to a shoulder-surfer) — the widget passes the "open canvas during a meeting" test. **Far silhouette:** marker position on the ring.

### 11. `fasting_window` — Fasting
- **Friction:** Ramadan fasting (1.9B people, a full month yearly) and intermittent fasting share one mechanic: a daily eat/don't-eat boundary people track with phone alarms that know nothing about the rest of their plans.
- **Not a reskin of:** `timer`/`countdown` — the *recurring daily window* with suhoor/iftar or 16:8 presets, plus a live boolean the graph can branch on, is the product.
- **Wires:** sources `fasting_now` (bool, timeSensitive), `minutes_to_open`, `window_label` (text); writables `open_time`, `close_time` (feedable by `prayer_times` — see #15). Story: the flagship wire — `fasting_window.fasting_now → branch_gate → meal_planner visibility` (food cards fold away during the fast) and `minutes_to_open → comparator (<30) → notifier "start preparing iftar"`.
- **Visual (Analog Dashboard):** a 24-hour dial where the fasting span is rendered as an **eclipse** — the disc darkens across the window, and the terminator line (the open/close boundary) carries a thin warm glow that intensifies in the last half hour. During Ramadan mode the dial gains a subtle crescent tick at suhoor. **Far silhouette:** how much of the disc is dark, and where the glow sits.

### 12. `hydration` — Hydration
- **Friction:** The most-abandoned health habit on earth, abandoned because logging water in an app is more work than drinking it.
- **Not a reskin of:** `counter` — daily auto-reset, climate/body-weight target computation, and one-tap logging are consolidation; `counter` has no day semantics.
- **Wires:** sources `pct_of_target`, `on_track` (bool, timeSensitive — compares to time of day); writable `daily_target_ml`; command `add_glass`. Story: `clock_pulse (hourly) → comparator ← hydration.on_track → notifier` — a nudge only when *behind*, not on a dumb schedule.
- **Visual (Analog Dashboard):** the card **is a vessel**: the entire body holds a liquid fill with a one-time meniscus wobble on each add (single state-change animation). Tapping anywhere on the card adds one glass — the whole card is the button; a ripple radiates from the tap point. The liquid tint follows the accent token. **Far silhouette:** fill height — readable from across the room, which is the entire point.

### 13. `sleep_ledger` — Sleep Ledger
- **Friction:** People know they're underslept but never *how much*; sleep debt against a personal target is a number no paper diary computes, and wearables lock it in another silo.
- **Not a reskin of:** `logbook` — debt accumulation math and bed/wake window statistics are derived.
- **Wires:** sources `debt_hours`, `last_night_hours`, `week_series` (series); command `log_night`. Story: `sleep_ledger.debt_hours → range_mapper → daily_agenda banner text` ("recovery day — nothing heavy before 10").
- **Visual (Premium Editorial, nocturne):** horizontal night-bars laid on a dusk-to-dawn gradient strip, one row per night — each bar sits exactly where the sleep happened (a 3 AM bedtime is visibly *late* on the strip, not just short). Sleep debt renders as a **moon shadow** creeping across a small moon icon: full moon = rested, new moon = deeply in debt. **Far silhouette:** the moon's fullness.

### 14. `stretch_deck` — Stretch Deck
- **Friction:** Desk workers everywhere know they should move every hour and never do, because deciding *which* stretch is friction enough to skip it.
- **Not a reskin of:** `random_picker` — a curated, illustrated exercise deck with done-counts and body-area weighting is a domain workflow; the picker has no content and no memory.
- **Wires:** sources `current_stretch` (text), `done_today`; command `draw_next`, `mark_done`. Story: the canonical automation demo — `clock_pulse (50 min) → stretch_deck.draw_next → notifier ← stretch_deck.current_stretch`.
- **Visual (Structured Blueprint, playful):** a literal card deck: face-down pile left, current card center showing a single-stroke line-art figure mid-stretch, done pile right growing into a neat fan. `draw_next` flips with a crisp card-turn animation. The line-art figure is drawn with the accent color as if by one pen stroke. **Far silhouette:** the height of the done fan.

---

## III. Faith & Rhythm *(pack: `life`; these serve daily practices for most of humanity)*

### 15. `prayer_times` — Prayer Times
- **Friction:** Five daily prayers structure the day for ~1.9B people; times shift daily with the sun. Today this lives in a separate adhan app that knows nothing about the user's planner, timers, or focus blocks.
- **Not a reskin of:** anything in the census. Solar-offset time computation (or manual entry) + a live "next prayer" pointer is new. Computation is deterministic and offline (same solar math family as #24).
- **Wires:** sources `next_prayer` (text), `minutes_to_next` (timeSensitive), `prayers_done_today`; command `mark_prayed`; sources `fajr`…`isha` (times — these can *feed `fasting_window`* #11: suhoor/iftar wire themselves). Story: `prayer_times.minutes_to_next → comparator (<10) → branch_gate → pause pomodoro note` — the planner bends around prayer instead of colliding with it.
- **Visual (Analog Dashboard × Editorial):** a horizon arc spans the card — the sun's actual path today — with five markers placed astronomically along it (Fajr before the sun crests, Maghrib at the descent). The *next* marker breathes gently; passed markers turn to brushed gold. No minarets, no clip-art: pure celestial geometry, which is both accurate and respectful. **Far silhouette:** sun position vs. the next glowing marker.

### 16. `scripture_plan` — Scripture Plan
- **Friction:** Reading the Quran in Ramadan (30 juzʼ in 30 days), the Bible in a year, the Gita chapter-wise — plans with fixed divisions and a deadline, where falling behind silently is how everyone actually fails.
- **Not a reskin of:** `reading_list` (unordered queue) or `progress` — division math, pace-to-finish recalculation, and "today's portion" derivation are the product.
- **Wires:** sources `today_portion` (text), `pct_complete`, `on_schedule` (bool), `catchup_per_day`; command `mark_read`. Story: `scripture_plan.today_portion → template → notifier` (morning message names the exact surah/chapter) and `on_schedule → branch_gate → gratitude_jar prompt`.
- **Visual (Premium Editorial):** the card is a closed book viewed from the page-edge side: completed divisions render as **gilded page edges** accumulating left to right; today's portion is a silk ribbon bookmark hanging at the current position, and falling behind lets a faint gap of un-gilded pages open ahead of the ribbon. Typography is serif, generous, and multilingual-safe (Arabic, Devanagari tested). **Far silhouette:** gilding vs. gap.

### 17. `gratitude_jar` — Gratitude Jar
- **Friction:** The single most evidence-backed micro-practice in positive psychology, abandoned within two weeks by nearly everyone because the notes vanish into an app they never reopen.
- **Not a reskin of:** `notes`/`logbook` — the *retrieval* mechanic (drawing a random past entry back out) and streak state are the practice; a log with no resurfacing is why people quit.
- **Wires:** sources `count`, `streak_days`, `drawn_note` (text); commands `add_note`, `draw_random`. Story: `clock_pulse (Sunday) → gratitude_jar.draw_random → sticky_note text` — a memory from your own jar appears on the canvas weekly.
- **Visual (Premium Editorial, glass):** a literal glass jar occupies the card; each entry drops in as a small folded paper slip in a random warm tint and *stays visible* — six months of practice is a jar visibly full of color, which is the entire motivational payload. `draw_random` tips the jar with a soft paper-rustle animation and unfolds one slip in serif type. **Far silhouette:** jar fullness.

### 18. `prayer_wall` — Prayer Wall
- **Friction:** Intercession lists — dua lists, church prayer chains, mi sheberach lists — are kept by hundreds of millions on paper scraps: people to pray for, needs, and the quiet joy of marking one answered.
- **Not a reskin of:** `checklist` — the answered/ongoing lifecycle, per-person grouping, and the emotional register demand their own card; a checkbox is the wrong verb for "answered."
- **Wires:** sources `open_count`, `latest_request` (text), `answered_this_month`; commands `add_request`, `mark_answered`. Story: `prayer_wall.latest_request → template → keep_in_touch note` ("check in on Sarah").
- **Visual (Premium Editorial, candlelight):** a wall of small candle tiles, one per request, each with a steady (CSS, non-animated at rest) warm glow and the person's name beneath. `mark_answered` performs the one sacred animation in the batch: the flame lifts into a small gold star that settles into a constellation strip along the card's top edge. Gentle tone enforced; no streaks, no counters in the hero view. **Far silhouette:** candles below, stars above.

---

## IV. Home & Ground Truth *(pack: `life`)*

### 19. `outage_schedule` — Power Schedule
- **Friction:** Load-shedding is daily life for hundreds of millions — South Africa's stages, Pakistan's rolling cuts, Lebanon's grid hours, Nepal in dry season. Everyone keeps the timetable as a screenshot they can't compute with: *charge the laptop by 3.*
- **Not a reskin of:** `calendar`/`clock_pulse` — recurring outage blocks with a live `power_now` boolean and countdown derivations are graph inputs nothing else provides.
- **Wires:** sources `power_now` (bool, timeSensitive), `minutes_to_next_cut`, `next_window` (text); writable `schedule_blocks`. Story: `outage_schedule.minutes_to_next_cut → comparator (<45) → notifier "charge everything"`; `power_now → branch_gate → utility_runway note` (generator fuel check).
- **Visual (Glass Terminal):** a 24-hour ribbon with blackout blocks as void segments. The showpiece: during a scheduled outage the **card itself dims** — background drops to near-black and the countdown numerals switch to a phosphor-green torch-beam styling, like the room it's describing. Returns to normal on restoration. Pure state-driven CSS on the minute heartbeat. **Far silhouette:** whether the card is dark right now.

### 20. `borrowed_items` — Borrow Ledger
- **Friction:** Books, drills, cash, Tupperware — everyone on earth is owed something and has forgotten something they owe. Both directions rot relationships in silence.
- **Not a reskin of:** `inventory` (stock you own) or `keep_in_touch` — bidirectional lent/borrowed state with age-based nudging is its own domain.
- **Wires:** sources `overdue_count`, `oldest_item` (text), `i_owe_count`; commands `add_item`, `mark_returned`. Story: `borrowed_items.oldest_item → template → notifier` ("gently ask Tariq about the drill — 94 days").
- **Visual (Structured Blueprint, workshop):** two rails of hanging tags — LENT on the left hooks, BORROWED on the right — each tag a luggage-label with item + person + age. Tags **weather with age**: fresh tags are crisp accent-colored; past the nudge threshold they develop a rust gradient and hang slightly askew. `mark_returned` unhooks the tag with a satisfying spring lift. **Far silhouette:** count of rusty tags, and which rail they're on.

### 21. `plant_care` — Plant Shelf
- **Friction:** The `houseplants` scenario archetype currently resolves to generic widgets; meanwhile plant parents kill plants on schedule because per-plant intervals live nowhere.
- **Not a reskin of:** `habit` (one habit, one human) — N plants × (water, feed, mist) intervals with per-plant drought state is consolidation.
- **Wires:** sources `due_today_count`, `thirstiest` (text), `all_watered` (bool); command `water` (per plant), `water_all_due`. Story: `plant_care.due_today_count → comparator (>0) → notifier` and `→ checklist` on the morning dashboard.
- **Visual (Premium Editorial, botanical):** a wooden shelf holding one potted plant sprite per plant — 12 hand-drawn species forms. The sprite has three poses driven purely by overdue-state: perky → leaning → wilted, crossfaded on state change. Tapping a pot waters it: the soil ring darkens and the sprite springs upright. The card smells like nothing else in the registry. **Far silhouette:** any wilted sprite reads instantly.

### 22. `go_bag` — Go Bag
- **Friction:** Earthquake country (Japan, Türkiye, Chile, California), typhoon belts, flood plains: authorities everywhere beg households to keep an emergency kit, and the kits that exist hold expired water and dead batteries. The `emergency-prep` archetype currently has no real home.
- **Not a reskin of:** `checklist` — items carry *expiry dates* and quantities-per-person; the readiness score and expiry sweep are derived.
- **Wires:** sources `readiness_pct`, `expired_count`, `next_expiry` (text, timeSensitive); command `mark_replaced`. Story: `go_bag.expired_count → comparator (>0) → notifier (monthly pulse)` — the widget that quietly keeps a family ready.
- **Visual (Structured Blueprint, rugged):** a duffel-bag silhouette drawn in blueprint linework that **visually fills** — each stocked category (water, food, meds, docs, light) renders as a packed layer inside the outline. Expired items protrude as red tabs sticking out of the zipper. A stitched patch on the bag shows the readiness dial. **Far silhouette:** red tabs on a full/empty bag.

### 23. `bin_night` — Bin Night
- **Friction:** Multi-stream waste schedules (Germany's four bins, Japan's category calendar, every council's alternating weeks) generate a weekly "which bin is it?!" argument in millions of households.
- **Not a reskin of:** `calendar` — alternating/rotating schedule rules plus a tonight-boolean the graph can act on.
- **Wires:** sources `tonight_bin` (text), `is_collection_eve` (bool, timeSensitive); writable `schedule_rules`. Story: `bin_night.is_collection_eve → notifier ← bin_night.tonight_bin` ("Green bin tonight") and `→ chore_rotation.advance` (whoever's turn takes it out).
- **Visual (Structured Blueprint, curbside):** a row of wheelie-bin icons in their real-world colors (user-mapped) parked against a thin curb line. On collection eve, tonight's bin **rolls forward to the curb** — a 300ms transform — and stays there until the date passes. That one displaced bin is the entire interface. **Far silhouette:** is any bin at the curb, and its color.

### 24. `sun_window` — Sun Window
- **Friction:** Photographers chase golden hour, solar-panel owners time heavy loads, hikers plan descent-before-dark, and in high latitudes (Nordics, Patagonia) daylight is a resource to plan around. Sunrise/sunset math is fully deterministic and offline from lat/long.
- **Not a reskin of:** `world_clock` (civil time, not solar events) or `countdown` — solar-position computation with event derivations is novel.
- **Wires:** sources `minutes_to_sunset` (timeSensitive), `is_golden_hour` (bool), `daylight_today` (hours), `sunrise`/`sunset` (text). Story: `sun_window.is_golden_hour → notifier "light's good — go"`; `daylight_today → recorder → line_chart` (a year-curve of your daylight — quietly beautiful in Tromsø).
- **Visual (Analog Dashboard, celestial):** a glass dome in cross-section: the sun's arc for *today at your location*, with the sun disc positioned live on it (minute heartbeat). Golden hour bands tint the dome's horizon edges amber; night fills the dome floor with deep blue. Solstice ghost-arcs (faint min/max paths) give instant seasonal context. **Far silhouette:** sun height above the horizon line.

### 25. `moving_boxes` — Moving Boxes
- **Friction:** The `moving-house` archetype now exists (Quick Add routes "things i need to buy for moving" to it), but the actual relocation pain — *which numbered box holds the kettle* — has no card. Every mover alive has torn open six boxes to find one cable.
- **Not a reskin of:** `inventory` — box↔room↔contents mapping with search and unpack-progress is a workflow card, like `trip_itinerary` for trips.
- **Wires:** sources `unpacked_pct`, `boxes_left`, `find_result` (text — search output!); writable `search_query`; command `mark_unpacked`. Story: `text_input → moving_boxes.search_query`, `moving_boxes.find_result → sticky_note` — a searchable household, built from two wires.
- **Visual (Structured Blueprint, isometric):** an isometric stack of numbered kraft-brown boxes grouped by room color-band. Unpacking a box plays a single flap-open animation and the box turns to a flattened outline at the stack's base — the pile visibly becomes floor. Search highlights the matching box with a torch cone. **Far silhouette:** standing stack vs. flattened pile ratio.

---

## V. Work & Craft *(ungated: these serve the core productivity audience)*

### 26. `meeting_cost` — Meeting Meter
- **Friction:** Meetings burn payroll invisibly. Making the burn visible is the single most effective meeting-hygiene intervention known to managers — and it needs to be *running in the room*.
- **Not a reskin of:** `stopwatch` × `formula` — could be composed, but three cards and two wires to shame one stand-up is exactly the "meaningfully worse UX" Article II names.
- **Wires:** sources `cost_so_far`, `running` (bool), `cost_series` (series); commands `start`, `stop`; writables `attendee_count`, `avg_rate`. Story: `meeting_cost.cost_so_far → recorder → bar_chart` (weekly meeting spend, per team, forever visible).
- **Visual (Analog Dashboard, taximeter):** an unapologetic **taxi meter**: rolling split-flap digits, a FOR HIRE / HIRED flag that flips on start, fare climbing in your currency. The split-flap only ticks on the shared heartbeat (once per minute) with a small interpolation-free jump — honest and hypnotic. **Far silhouette:** flag up or down; digits size.

### 27. `waiting_on` — Waiting On
- **Friction:** Knowledge work dies in the "I asked, they haven't replied" state. Delegated items live in nobody's task list — they're not *your* task — so they silently age until the deadline explodes.
- **Not a reskin of:** `assignment` (things *you* must do) or `checklist` — wait-age tracking with per-item ping cadence is the inversion no census widget models.
- **Wires:** sources `overdue_count`, `oldest_wait_days` (timeSensitive), `oldest_item` (text); commands `mark_pinged`, `mark_received`. Story: `waiting_on.oldest_item → template ("nudge {a}") → notifier (Mon/Thu pulse)` — polite persistence, automated.
- **Visual (Glass Terminal, patience):** each item is a small **hourglass** with the person's initial etched on the frame; sand level = wait age against your cadence. `mark_pinged` physically flips the hourglass (spring rotation) and the sand restarts. Fully drained hourglasses glow amber and tilt. **Far silhouette:** how many hourglasses are drained.

### 28. `office_hours` — Overlap Finder
- **Friction:** Freelancers and remote teams spanning Manila–Berlin–São Paulo renegotiate "when can we actually talk" weekly. `world_clock` shows times; nobody computes the *overlap*.
- **Not a reskin of:** `world_clock` — interval intersection across N zones with per-person work windows is an algorithm, not a display.
- **Wires:** sources `overlap_now` (bool, timeSensitive), `next_overlap` (text), `overlap_hours_today`; writable per-person windows. Story: `office_hours.overlap_now → status.state` ("reachable") and `next_overlap → template → snippet_library` ("free 14:00–16:00 your time" — paste into any chat).
- **Visual (Structured Blueprint, combs):** each person is a horizontal **comb row** — teeth where they're available, gaps where not, labeled in *their* local time. Where teeth align across all rows, a vertical light column ignites through the card. The metaphor teaches itself in one glance. **Far silhouette:** presence/absence of a lit column.

### 29. `scope_meter` — Scope Meter
- **Friction:** Scope creep is the #1 margin-killer for freelancers globally, and it happens one "quick tweak" at a time precisely because no artifact makes the accumulation visible to *both* sides.
- **Not a reskin of:** `risk_register`/`counter` — contract caps (revisions, deliverables) vs. logged asks, with an over-scope verdict, is domain accounting.
- **Wires:** sources `revisions_left`, `over_scope` (bool), `extras_value`; command `log_request`. Story: `scope_meter.over_scope → branch_gate → invoices note` ("add change-order line") and `→ template` (a ready-to-send, polite scope email).
- **Visual (Analog Dashboard, boiler room):** a riveted **pressure gauge**: the needle advances with each logged request through green → amber → a red zone labeled with the contract cap. Crossing into red pops a rivet (one-shot spring particle) and raises a small `CHANGE ORDER` flag on the gauge crown. Theatrical enough to screenshot into a client email — which is the actual use case. **Far silhouette:** needle zone color.

### 30. `handover_note` — Handover
- **Friction:** Nurses, support engineers, factory supervisors, hotel front desks — every shift-based workforce on earth transfers state verbally and loses critical items in the gap. (SBAR exists because the gap kills.)
- **Not a reskin of:** `meeting_notes` — the acknowledge-chain (incoming person must confirm each flagged item) and open-flag state machine are the safety mechanism.
- **Wires:** sources `open_flags`, `acknowledged` (bool), `flag_summary` (text); commands `add_flag`, `acknowledge_all`. Story: `handover_note.acknowledged → branch_gate → sequencer.advance` (shift officially rotates only when the handover is confirmed — wire it to `chore_rotation`/`on_call`).
- **Visual (Structured Blueprint, clipboard):** a clipboard card where flagged items are **raised physical tabs** sticking off the right edge — unmissable. Acknowledging presses each tab flat with a firm click animation; the clipboard's clip stamps `RECEIVED ✓ <time>` when all are flat. Unacknowledged handovers older than a shift glow at the clip. **Far silhouette:** raised tabs = unfinished handover.

### 31. `crit_queue` — Crit Room
- **Friction:** Design and writing teams run feedback in scattered threads; "did everyone approve round 2?" is unanswerable, and shipping waits on ghosts.
- **Not a reskin of:** `poll` (one question) or `kanban` — per-reviewer × per-round verdict matrix with an all-approved derivation is review-specific.
- **Wires:** sources `approvals`, `all_approved` (bool), `round`; commands `stamp` (per reviewer: approve/changes), `new_round`. Story: the classic gate — `crit_queue.all_approved → branch_gate → "SHIP" sticky visibility`, and `→ notifier` to the whole team.
- **Visual (Premium Editorial, light-table):** the artifact title sits on a **light table**; each reviewer is a stamp slot along the bottom edge. Verdicts arrive as physical rubber stamps — green `APPROVED` seals and amber `CHANGES` marks — that slam in with spring physics and slight rotation jitter, layering like a real proof sheet. Rounds are film-frame tabs across the top. **Far silhouette:** stamps filled vs. empty slots.

### 32. `on_call` — On-Call
- **Friction:** Developers, doctors, plumbers on rota, sysadmins: "who holds the pager right now, and when do I hand off?" lives in a wiki page nobody trusts.
- **Not a reskin of:** `chore_rotation` (advance-on-command, no time windows) — scheduled windows with a live `is_me` boolean and escalation contact are the difference between a rota and an on-call system.
- **Wires:** sources `holder_now` (text, timeSensitive), `is_me` (bool), `next_handoff_in`; writable `rotation_schedule`; command `log_incident`. Story: `on_call.is_me → branch_gate → notifier "you're on call — laptop tonight"` and `is_me → status.state`.
- **Visual (Glass Terminal, retro pager):** the card is a **90s pager**: dark green LCD with blocky segments showing the current holder and handoff countdown, a belt-clip detail on the shell. When `is_me` flips true the LCD backlight comes on and the card's edge carries a slow breathing pulse for the whole shift — ambient, not annoying. Incidents print as one-line LCD entries. **Far silhouette:** backlight on/off.

### 33. `estimate_builder` — Estimate
- **Friction:** Tradespeople, tutors, tailors, developers — a billion small businesses quote jobs on gut feel in a chat message, forget the materials line, and eat the margin.
- **Not a reskin of:** `invoices` (money owed after the fact) or `calculator` — line-items × rate × risk-multiplier with margin readout, feeding forward into an invoice, is the missing front half of the billing pipeline.
- **Wires:** sources `quote_total`, `margin_pct`, `quote_text` (text — formatted!); command `add_line`, `mark_won`, `mark_lost`; source `win_rate`. Story: `estimate_builder.quote_text → template → snippet_library` (send anywhere), and `mark_won → invoices` prefill note — quoting-to-billing as one wired flow.
- **Visual (Database Ledger, thermal printer):** the card is a **receipt being printed**: lines feed upward from a printer slot at the bottom as you add them, in monospace on paper-white, with a perforated tear edge. The total prints double-struck. `mark_won` stamps the receipt `ACCEPTED` diagonally in ink-blue. Win rate lives as tally marks on the printer housing. **Far silhouette:** receipt length and the presence of a stamp.

---

## VI. Study & Mastery *(ungated: core early audience)*

### 34. `past_papers` — Past Papers
- **Friction:** From IGCSE to JEE to the bar exam, serious candidates grind years of past papers and track coverage in pencil grids on their wall. Which year × which subject × what score — and where the weak topics cluster — is the entire strategy.
- **Not a reskin of:** `quiz` (content) or `progress` — the year×paper matrix with score heat and weakest-topic derivation is the pencil grid, digitized and wired.
- **Wires:** sources `papers_left`, `avg_score`, `weakest_topic` (text), `trend` (series); command `log_attempt`. Story: `past_papers.weakest_topic → template → flashcards note` ("drill: organic chemistry") and `avg_score → study_goal.current`.
- **Visual (Structured Blueprint, exam hall):** a grid of small **answer-sheet cells** (year columns, paper rows), each attempted cell inked with its score in handwriting-style numerals; the ink saturation encodes the score. Weak-topic heat bleeds a soft red glow *between* related cells — the cluster is visible before it's conscious. **Far silhouette:** ink coverage of the grid + any red bleed.

### 35. `memorization_ladder` — Memorization
- **Friction:** Quran hifz (millions of students worldwide), stage actors' scripts, oral poetry, keynote talks: long-form *sequential* memorization where old passages decay while new ones are added. Flashcards shuffle; hifz climbs.
- **Not a reskin of:** `flashcards` — ordered segments, per-segment strength decay over time, and a due-for-revision queue derived from decay curves are a different algorithm serving a different practice.
- **Wires:** sources `due_segments`, `overall_strength_pct`, `next_review` (text); commands `mark_reviewed`, `advance_frontier`. Story: `memorization_ladder.due_segments → comparator (>0) → notifier (after fajr — wire from prayer_times!)` — three widgets in this doc compose into a complete hifz companion.
- **Visual (Premium Editorial, ascent):** a **staircase** rising across the card, one step per segment. Step opacity = memory strength: the frontier step is bold, well-reviewed steps glow softly, decaying steps below fade and develop hairline cracks (state-driven texture swap). Reviewing repairs the step with a mason's fill animation. **Far silhouette:** the height of the solid staircase vs. faded steps.

### 36. `experiments` — Experiments
- **Friction:** Science students, growth hackers, home cooks, self-quantifiers — anyone running "change one thing, observe" loops — never writes down the hypothesis, so every result is vibes.
- **Not a reskin of:** `logbook` — hypothesis → variables → result → verdict structure with win-rate stats turns anecdotes into a lab practice.
- **Wires:** sources `running_count`, `win_rate`, `last_verdict` (text); commands `start_experiment`, `record_result`. Story: `experiments.last_verdict → template → weekly_review note`, and `win_rate → metrics tile`.
- **Visual (Glass Terminal, petri):** each experiment is a **petri dish** chip: running dishes hold a faint animated-on-state-change culture blob; a WIN verdict blooms the culture green and stamps the dish lid; a NULL verdict grays it. Dishes rack into a grid — a career of experiments becomes a culture collection. **Far silhouette:** green vs. gray dish ratio.

### 37. `mistake_bank` — Mistake Bank
- **Friction:** Traders journal losses, chess players log blunders, med students track error patterns — the highest-leverage learning artifact in any skill is a mistake log with *recurrence detection*, and nobody maintains one past week two.
- **Not a reskin of:** `decision_journal` (prospective decisions) — retrospective error taxonomy with category recurrence alarms is the inverse discipline.
- **Wires:** sources `top_category` (text), `recurrence_alert` (bool), `cost_total`; command `deposit`. Story: `mistake_bank.recurrence_alert → branch_gate → priority_matrix note` ("3rd impulsive-entry this month — new rule?").
- **Visual (Database Ledger, vault):** a **bank vault door** occupies the card's left third; deposits slide in as red slips through the slot. The vault ledger on the right groups slips by category with tally stamps. When a category recurs past threshold, a rotating alarm beacon strip above the door lights (steady glow, not animated loop). Compounding-cost readout styled as an interest counter — your mistakes, accruing. **Far silhouette:** beacon lit or dark.

### 38. `skill_tree` — Skill Tree
- **Friction:** Learning roadmaps (language levels, gym progressions, developer skill paths) are consumed as static images from Reddit; nobody can mark progress on a JPEG, so the map never meets the territory.
- **Not a reskin of:** `goal_tracker` (linear milestones) or `outline` — prerequisite-gated unlocking (a node opens only when its parents complete) is graph logic, and the census has no in-card DAG.
- **Wires:** sources `unlocked_count`, `frontier` (text — currently unlockable nodes), `pct_complete`; command `complete_node`. Story: `skill_tree.frontier → template → weekly_planner` ("this week: past-tense conjugation") — the roadmap schedules itself.
- **Visual (Glass Terminal, constellation):** the tree renders as a **constellation**: completed skills are lit stars joined by drawn light-lines, frontier nodes shimmer as reachable stars, locked nodes are faint outlines. Completing a node draws its connecting line with the same rope-draw animation as the canvas's own relation wires — *deliberately* echoing the Quick Add blueprint language, because this widget is the canvas's philosophy miniaturized. **Far silhouette:** lit-constellation extent.

---

## VII. People & Belonging *(pack: `life`)*

### 39. `care_plan` — Care Plan
- **Friction:** Eldercare and long-term family care is coordinated by exhausted relatives across WhatsApp: meds given? eaten? mood? who's on tomorrow? The `eldercare` archetype (gentle tone) currently resolves to generic cards.
- **Not a reskin of:** `medications` (one dimension) — the daily care strip (meds + meals + mood + mobility + visits) with a last-check-in derivation consolidates what currently takes four widgets and produces the calm overview a stressed caregiver actually needs.
- **Wires:** sources `last_checkin` (text, timeSensitive), `tasks_due`, `today_complete` (bool); command `log_care_event`. Story: `care_plan.last_checkin → comparator (>6h) → notifier` to the sibling rota (`chore_rotation.current`).
- **Visual (Premium Editorial, gentle):** a soft horizontal **day-strip of beads** — each care moment (med, meal, visit, mood) a rounded bead in muted pastels that blooms gently when logged. Large type, high contrast, oversized touch targets: designed for a 68-year-old caring for a 92-year-old. No red anywhere; missed items are *hollow* beads, not alarms. **Far silhouette:** hollow vs. filled beads today.

### 40. `gift_ledger` — Gift Ledger
- **Friction:** In cash-gift cultures — Chinese hongbao, South Asian salami/shagun, Nigerian owambe spraying, Japanese goshugi — gift reciprocity is a *social ledger with real stakes*, tracked today in the backs of wedding albums. (Also quietly useful for Western registries and thank-you notes.)
- **Not a reskin of:** `gifts_occasions` (upcoming dates + ideas) — bidirectional given/received accounting with reciprocity suggestions is social bookkeeping, a different organ.
- **Wires:** sources `owed_count`, `next_reciprocity` (text), `balance_with` (per person); command `log_gift`. Story: `gift_ledger.next_reciprocity → template → gifts_occasions` ("their daughter's wedding: they gave ₦50k at yours").
- **Visual (Database Ledger, red envelope):** a two-pane balance book — GIVEN | RECEIVED — where each entry is a culture-neutral **envelope icon** (red-gold tint) with amount and occasion. A physical **balance beam** across the card's top tilts subtly toward whichever side is heavier per relationship when a person is selected. Entries slide in like envelopes into an album's photo corners. **Far silhouette:** beam tilt.

### 41. `team_kudos` — Applause Meter
- **Friction:** Small teams know recognition matters and still forget it for months; kudos die in Slack scroll. A visible accumulator with a weekly digest changes behavior.
- **Not a reskin of:** `gratitude_jar` (private, inward) — multi-person attribution and a digest pipeline make it a team ritual object.
- **Wires:** sources `kudos_this_week`, `top_receiver` (text), `digest` (text); commands `give_kudos`, `flush_digest`. Story: `clock_pulse (Fri 16:00) → team_kudos.flush_digest → template → notifier` — recognition ships itself weekly.
- **Visual (Analog Dashboard, VU):** a horizontal **VU meter** styled like studio hardware, needle riding the week's kudos volume; each teammate is a labeled input channel with a small LED that blinks once (one-shot) when they give or receive. Friday's flush animates the needle sweeping to zero as the digest "records." **Far silhouette:** needle deflection.

### 42. `potluck_matrix` — Potluck Board
- **Friction:** Iftars, church suppers, braais, office parties, barrio fiestas: someone always ends up with four desserts and no rice. The organizer's spreadsheet dies in a group chat.
- **Not a reskin of:** `guest_list` (attendance) — category × dish × claimant with dietary flags and *gap derivation* is provisioning logic.
- **Wires:** sources `gaps` (count), `missing_category` (text), `dietary_conflicts` (count); command `claim_dish`. Story: `potluck_matrix.missing_category → template ("we still need {a}!") → notifier`, wired beside `guest_list.confirmed`.
- **Visual (Structured Blueprint, table-set):** a **table viewed from above**: each category is a place setting; claimed dishes render as stylized dish icons on the plates, unclaimed categories are empty plates with a faint utensil outline. Dietary flags are napkin-corner colors under each dish. The empty plates *are* the to-do list. **Far silhouette:** empty plates remaining.

### 43. `star_chart` — Star Chart
- **Friction:** Parents worldwide run chore/behavior charts on the fridge; the fridge doesn't compute reward thresholds, sibling parity, or history, and the magnets fall off.
- **Not a reskin of:** `habit` (one adult, one habit) or `chore_rotation` (turn-taking) — multi-kid × multi-behavior star accounting with redemption thresholds is family game mechanics.
- **Wires:** sources per-kid `stars`, `reward_ready` (bool), `leader` (text); commands `give_star`, `redeem`. Story: `star_chart.reward_ready → branch_gate → gifts_occasions note` ("Amina earned the zoo trip") and `→ notifier` to the co-parent.
- **Visual (Structured Blueprint, fridge):** a fridge-door texture panel with **magnet stars** that snap on with a magnetic wobble animation (spring, one-shot). Each kid is a crayon-styled name row. The reward sits at the row's end behind a **vending-machine window** that physically flips open on redemption. Kids will demand to press it themselves — which is the retention mechanism. **Far silhouette:** star row lengths.

### 44. `pet_care` — Pet Card
- **Friction:** The `new-pet` archetype resolves generic. Feeding × walks × vet dates × weight curve currently takes four widgets, and pet owners keep none of them.
- **Not a reskin of:** `medications`/`habit` — multi-schedule consolidation around one animal with a growth curve is the same argument that ratified `meal_planner`.
- **Wires:** sources `next_due` (text, timeSensitive), `overdue` (bool), `weight_series` (series); commands `log_feed`, `log_walk`, `log_weight`. Story: `pet_care.overdue → notifier` and `weight_series → line_chart` for the vet visit.
- **Visual (Premium Editorial, companion):** the card is the pet's **collar tag** — a large rounded tag shape with the pet's name engraved. Around it, a **paw-print trail** arcs across the card: each print is a completed care event today, fading prints are yesterday's. The food bowl icon fills/empties with feed state. Weight sparkline is drawn as a leash curve along the bottom. **Far silhouette:** today's print count.

---

## VIII. Movement & Elsewhere *(pack: `life`)*

### 45. `visa_runway` — Visa Runway
- **Friction:** Students, nomads, and expats live under day-counting regimes — none crueler than Schengen's rolling 90-in-180 window, which humans reliably miscalculate and overstay. The stakes are bans.
- **Not a reskin of:** `renewals_vault` (static expiry dates) — the rolling-window algorithm over an entry/exit log is exactly the `debt_payoff`-class computation Article II protects.
- **Wires:** sources `days_left`, `must_exit_by` (text), `window_days_used`, `overstay_risk` (bool); command `log_entry`, `log_exit`. Story: `visa_runway.days_left → range_mapper → notifier` at 30/14/7, and `must_exit_by → countdown` on the trip canvas.
- **Visual (Database Ledger, passport):** a **passport page**: entry/exit stamps (real ink-stamp aesthetics, angled) placed along a scrolling 180-day tape at the page's bottom. Days that still "count against you" glow faintly on the tape; the forbidden zone beyond day 90 is a red-margin edge like a passport's machine-readable strip. The must-exit date prints as the next stamp, outlined and waiting. **Far silhouette:** how close the stamps crowd the red margin.

### 46. `packing_matrix` — Packing
- **Friction:** Airline weight limits ambush travelers at the check-in scale worldwide; families juggling four bags for one trip do allocation math on the airport floor.
- **Not a reskin of:** `checklist` — per-item weights, per-bag budgets, and an overweight verdict make it luggage arithmetic, not a to-do list.
- **Wires:** sources `kg_remaining` (per bag), `overweight` (bool), `unpacked_count`; command `pack_item`. Story: `packing_matrix.overweight → branch_gate → sticky "move 1.2kg to carry-on"`; `unpacked_count → countdown` eve-of-flight nudge via `trip_itinerary`.
- **Visual (Structured Blueprint, cross-section):** an **open suitcase in cross-section** that fills with layered item blocks as things are packed — heavy items render as denser, darker strata at the bottom. A luggage-scale hook dial hangs off the card's corner showing live kg vs. limit; going over makes the suitcase lid visibly **bulge** and one latch pop open. **Far silhouette:** lid closed or bulging.

### 47. `jet_lag_shifter` — Jet Lag Plan
- **Friction:** Everyone knows "shift your sleep before you fly"; nobody does the arithmetic of *tonight's* bedtime across a 5-day pre-shift, so nobody does it at all.
- **Not a reskin of:** `world_clock`/`countdown` — the gradual-shift schedule generator (direction-aware: eastward advances, westward delays) is a small algorithm with daily outputs.
- **Wires:** sources `tonight_bedtime` (text, timeSensitive), `days_to_aligned`, `shift_remaining_hours`; writables `departure_date`, `tz_delta`. Story: `jet_lag_shifter.tonight_bedtime → notifier (21:00 pulse)` and `→ sleep_ledger` note — the two widgets book-end the flight.
- **Visual (Analog Dashboard, twin clocks):** two clock faces — HOME and DESTINATION — whose hands **converge day by day**; the gap between their hour hands is the remaining shift, drawn as a shaded wedge that narrows nightly. Below, a horizontal sleep-band slides along a five-night strip toward the destination-aligned position. The convergence is the progress bar. **Far silhouette:** the wedge angle.

### 48. `currency_pocket` — Cash Pockets
- **Friction:** Travelers and border-region residents (a huge population: EU边境, US–Mexico, Gulf workers) hold three currencies at once and lose track of what they have and what anything "really" costs.
- **Not a reskin of:** `unit_converter` (one conversion, no holdings) or `budget` — multi-pocket cash state with home-value aggregation is a wallet, not a converter.
- **Wires:** sources `total_home_value`, `pocket_low` (bool), per-pocket `amount`; writable `rates` (manual, API-feedable); commands `spend`, `add_cash`. Story: `currency_pocket.pocket_low → notifier "hit an ATM before the weekend"`; `total_home_value → budget` line.
- **Visual (Premium Editorial, leather):** a **fanned leather wallet**: each currency is a note-stack peeking out of its own pocket, stack height proportional to amount, tinted like the real banknotes (₺ red, € blue-green, ﷼ violet). Spending slides a note out and off-card. The home-value total is embossed into the leather. **Far silhouette:** stack heights.

---

## IX. Creators & Makers *(pack: `specialist` except #50)*

### 49. `commission_queue` — Commission Queue
- **Friction:** Freelance illustrators (a massive global cohort — much of it in Southeast Asia and Latin America) manage commission slots, stage progress, and client payments in pinned Twitter threads and chaos.
- **Not a reskin of:** `kanban` — fixed slot caps, stage presets (sketch→lines→color→final), per-slot pricing, and queue revenue make it the `job_applications` argument for the other side of the marketplace.
- **Wires:** sources `slots_open`, `queue_revenue`, `current_piece` (text); commands `advance_stage`, `deliver`. Story: `commission_queue.slots_open → comparator (>0) → branch_gate → template` ("Commissions OPEN — 2 slots") → `snippet_library` for posting.
- **Visual (Premium Editorial, atelier):** a row of **easels**, one per slot. Each commission's canvas *gains fidelity with its stage*: a graphite-sketch texture at sketch, clean linework at lines, a color wash at color, a varnished frame at final — the same placeholder artwork maturing. Empty slots are bare easels with an `OPEN` card resting on the ledge. **Far silhouette:** bare vs. occupied easels.

### 50. `content_pipeline` — Content Pipeline
- **Friction:** Creators everywhere (the `content-calendar` and `video-channel` archetypes both point at generic cards today) die by cadence: ideas pile up, posting rhythm collapses, and no tool connects the two.
- **Not a reskin of:** `kanban` — per-platform slots, cadence-health computation (posts vs. target rhythm), and next-post derivation are channel management, not column management.
- **Wires:** sources `next_post` (text), `overdue_slots`, `cadence_health_pct`, `ideas_count`; commands `advance`, `mark_posted`. Story: `content_pipeline.cadence_health_pct → range_mapper → mood color on a status card`; `next_post → template → notifier (posting-day pulse)`; `ai_generator → content_pipeline` idea intake.
- **Visual (Structured Blueprint, film):** a **film-strip conveyor** running left to right through stage gates (idea → script → film → edit → post), each piece of content a frame on the strip with its platform chip (YT red, TT cyan, IG gradient). Posted frames exit right and shrink into a dated archive reel. Cadence health is a tempo dial styled as a metronome at the card's end — drifting off-beat tilts the pendulum. **Far silhouette:** frames stalled at any gate + metronome tilt.

---

## Census-collision audit (Article IV, summarized)

| Proposed | Nearest census widget | Why it survives the Redundancy Gate |
|:---|:---|:---|
| `savings_circle` | `expense_split` | Rotation state machine ≠ one-shot settlement |
| `zakat` | `budget` | Nisab threshold + lunar-anniversary math |
| `utility_runway` | `subscriptions` | Consumable burn-rate ≠ recurring billing |
| `hydration` | `counter` | Daily reset + target computation + vessel UI |
| `fasting_window` | `timer` | Recurring daily window + live graph boolean |
| `prayer_times` | — | No neighbor; solar computation |
| `bin_night` | `calendar` | Alternating-schedule rules + tonight boolean |
| `sun_window` | `world_clock` | Solar events ≠ civil time |
| `waiting_on` | `assignment` | Others' obligations ≠ own tasks |
| `office_hours` | `world_clock` | Interval intersection algorithm |
| `on_call` | `chore_rotation` | Time-window schedule ≠ advance-on-command |
| `estimate_builder` | `invoices` | Pre-sale quoting ≠ post-sale receivables |
| `memorization_ladder` | `flashcards` | Sequential decay model ≠ shuffled recall |
| `mistake_bank` | `decision_journal` | Retrospective taxonomy ≠ prospective log |
| `skill_tree` | `goal_tracker` | Prerequisite DAG ≠ linear milestones |
| `gift_ledger` | `gifts_occasions` | Reciprocity accounting ≠ date reminders |
| `star_chart` | `habit` | Multi-child accounting + redemption |
| `pet_care` / `plant_care` | `medications`/`habit` | Same consolidation ruling as `meal_planner` |
| `visa_runway` | `renewals_vault` | Rolling-window algorithm |
| `packing_matrix` | `checklist` | Weight budgets + per-bag allocation |
| `currency_pocket` | `unit_converter` | Holdings state ≠ stateless conversion |
| `commission_queue` / `content_pipeline` | `kanban` | Slot caps, stage presets, cadence math |

## Discoverability plan (Article VI)

Every widget above maps to at least one **existing or planned scenario archetype** (`houseplants`, `emergency-prep`, `eldercare`, `new-pet`, `moving-house`, `content-calendar`, `video-channel`, `freelance`, `money-checkup`, `interview-prep` …) and needs 2+ interpreter phrases at implementation time (e.g., `prayer_times`: "prayer times", "when is maghrib"; `visa_runway`: "schengen days", "visa days left"; `savings_circle`: "committee", "chit fund", "stokvel" — include the *local* names; that's the difference between serving the world and serving the Bay Area).

## Suggested build order

1. **Graph amplifiers first** (they make every existing canvas better): `prayer_times`, `fasting_window`, `outage_schedule`, `sun_window`, `office_hours`, `waiting_on` — all are timeSensitive boolean/countdown factories that feed `branch_gate`/`comparator`/`notifier`.
2. **Conversion magnets second** (each one replaces a whole app): `cycle_tracker`, `savings_circle`, `vitals_log`, `visa_runway`, `star_chart`, `commission_queue`.
3. **Delight & retention third**: `gratitude_jar`, `plant_care`, `stretch_deck`, `skill_tree`, `hydration`.
