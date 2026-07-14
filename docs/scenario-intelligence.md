# Scenario Intelligence — Use-Case Catalogue & Implementation Plan

*The layer that turns vague-but-understood thoughts into useful canvas workspaces.*

This document extends the shipped v1 (`src/utils/scenarioResolver.ts`, 19 archetypes,
specificity gating, micro-questions, duplicate-aware reranking, local learning) into a
full program: a ~120-archetype catalogue across every domain the app can serve, a
phased engineering plan for dramatically better precision on vague input, and a
backlog of concept-level improvements.

---

## 1. Design principles (recap, binding for everything below)

1. **Specificity ≠ confidence.** "I'm learning Spanish" is perfectly understood and
   almost entirely underspecified. Measure the two separately
   (`SpecificityProfile`) and never let high understanding masquerade as a mandate
   to guess the user's immediate goal.
2. **Scenarios, not widgets, are the prediction target for vague input.** Widgets
   are an implementation detail the user should never need to know.
3. **One compact question, maximum.** Only when the answer materially changes the
   canvas. A second question is justified only for something consequential (an exam
   date, a deadline). Never "what would you like to do?"
4. **Cost-of-being-wrong policy.** The plan is always visible before commit; a
   single Notes widget may auto-commit at moderate confidence; multi-widget plans
   are always proposals; the "Keep as Notes" escape hatch always exists.
5. **Context reranks, and says so.** When canvas contents, canvas name, selection,
   or learned preference changed the ranking, one short note explains it.
6. **Local first.** Detection, learning, and preferences run entirely in the
   browser. Any cloud assistance is opt-in and additive, never required.
7. **Top-three usefulness beats top-one accuracy.** The success metric is "was a
   direction the user actually wanted visible without scrolling," not "did the
   first guess win."

---

## 2. The catalogue

~120 archetypes across 12 domains. ✅ marks the 19 shipped in v1. Each archetype
lists: trigger examples (the *vague* phrasings that should fire), the recommended
workspace (lead widget first — it anchors the cluster and the rest attach to it as
children), focused directions, and the micro-question with its option → direction
mapping. All widget names below are existing `ModuleType`s in the registry — no new
widgets are required for any entry.

### 2.1 Learning & education

| Archetype | Triggers (vague forms) | Recommended workspace | Focused directions | Micro-question |
|---|---|---|---|---|
| ✅ `language-learning` | "I'm learning Spanish", "improving my Japanese" | study_goal + vocab + flashcards + habit | vocabulary; routine; progress; resources | "What are you focusing on right now?" → Vocabulary / Speaking→routine / Grammar→vocabulary / Consistency→routine |
| ✅ `exam-prep` | "studying for finals", "DELE B2", "prepping for the bar" | study_goal + weekly_planner + countdown + flashcards | schedule; practice; coverage | "What would help most first?" → schedule / practice / topic list |
| ✅ `learn-skill` | "learning guitar", "teaching myself chess" | goal_tracker + habit + reading_list | routine; progress; resources | "What do you want help with first?" |
| `online-course` | "started a Udemy course", "taking a course on ML" | study_goal + checklist(modules) + pomodoro | finish-it (checklist+countdown); master-it (cornell+flashcards); routine (weekly_planner+habit) | "Finish it, or really absorb it?" → finish / master / just keep momentum→routine |
| `school-semester` | "new semester", "back to school", "junior year" | weekly_planner + assignment + gpa | grades (grade_calc+gpa); workload (assignment+calendar); study rhythm (weekly_planner+pomodoro+habit) | "What tends to slip?" → grades / deadlines→workload / focus→rhythm |
| `thesis` | "writing my thesis", "dissertation year" | outline + citation + timeline + study_goal | structure (outline+notes); sources (citation+reading_list); deadline march (timeline+countdown+progress) | "What's the scariest part?" → structure / literature→sources / the deadline |
| `college-applications` | "applying to college", "uni applications" | checklist + table(schools) + countdown | shortlist (table+links); essays (outline+notes+countdown); deadlines (calendar+checklist) | "Where are you in it?" → picking schools→shortlist / essays / tracking deadlines |
| `scholarship-hunt` | "looking for scholarships", "funding my degree" | table + checklist + countdown | find (links+table); apply (checklist+countdown); track (kanban) | "Finding them or finishing them?" → find / apply / track |
| `memorization` | "memorize my speech", "learn my lines", "memorizing surahs" | flashcards + habit + progress | drill (flashcards+quiz); schedule (daily_agenda+habit); track (progress+counter) | "How do you memorize best?" → repetition→drill / a set time daily→schedule / seeing progress→track |
| `group-study` | "starting a study group" | weekly_planner + contact + checklist | schedule (weekly_planner+world_clock); materials (links+reading_list); roles (checklist+contact) | "What needs organizing?" → times / materials / people |
| `teach-class` | "teaching a workshop", "I'm going to teach X" | outline(curriculum) + weekly_planner + checklist | curriculum (outline+notes); logistics (checklist+form); feedback (form+poll+rating) | "What's least ready?" → the content→curriculum / the logistics / knowing if it lands→feedback |
| `kids-homework` | "helping my kid with school" | assignment + weekly_planner + habit | routine (daily_agenda+habit); subjects (assignment+progress); motivation (goal_tracker+rating) | "What's the struggle?" → sitting down to it→routine / keeping track→subjects / motivation |
| `second-brain` | "organize my notes", "my knowledge is scattered" | outline + links + canvas_node | structure (outline+canvas_node); inbox (notes+checklist); references (links+citation) | "What's the mess?" → no structure / capture→inbox / links everywhere→references |

### 2.2 Career & work

| Archetype | Triggers | Recommended workspace | Focused directions | Micro-question |
|---|---|---|---|---|
| ✅ `job-search` | "looking for a new job" | kanban + contact + checklist | pipeline; interview; network | "Which part is on your mind?" |
| `interview-prep` (promote from sub-direction) | "interview on Friday", "big interview coming" | flashcards + checklist + countdown | stories (notes+flashcards); logistics (checklist+countdown); company research (links+notes) | "What would calm the nerves?" → having answers→stories / being prepared→logistics / knowing them→research |
| `new-job` | "starting a new job Monday" | checklist + contact + notes | first 90 days (goal_tracker+checklist); people (contact+notes); rhythm (daily_agenda+weekly_planner) | "What do you want to nail?" → early wins / names & faces→people / a good routine→rhythm |
| `promotion-push` | "I want a promotion", "asking for a raise" | logbook(brag doc) + goal_tracker + notes | evidence (logbook+metrics); the ask (notes+countdown); skills gap (checklist+reading_list) | "What's missing?" → proof of impact→evidence / the conversation→ask / a skill→gap |
| `performance-review` | "review season", "self-assessment due" | logbook + notes + checklist | gather wins (logbook+metrics); write it (outline+notes); goals ahead (goal_tracker) | "Which half?" → looking back→wins / writing / looking ahead→goals |
| `quarterly-goals` | "setting my OKRs", "goals for Q3" | goal_tracker + metrics + checklist | define (notes+goal_tracker); measure (metrics+line_chart); execute (kanban+weekly_planner) | "Where are you?" → still defining / need numbers→measure / doing→execute |
| `manage-team` | "managing a team now", "new manager" | meeting_notes + kanban + contact | 1:1s (meeting_notes+calendar+contact); delivery (kanban+status); growth (notes+goal_tracker per person) | "What feels shakiest?" → the people→1:1s / the work→delivery / their growth |
| `hiring` | "hiring for a role", "recruiting an engineer" | kanban + table + checklist | pipeline (kanban+table); interviews (checklist+form+meeting_notes); decision (decision_matrix+contact) | "What stage?" → sourcing→pipeline / interviewing / deciding |
| `freelance` | "going freelance", "getting my first clients" | kanban + timesheet + budget | clients (kanban+contact); money (budget+timesheet+metrics); pipeline (kanban+links) | "What worries you?" → finding work→pipeline / the money / juggling clients |
| `salary-negotiation` | "negotiating an offer" | pros_cons + table(comps) + notes | compare offers (decision_matrix+table); prepare the ask (notes+quote?); walk-away math (calculator+budget) | "What do you need?" → comparing / the script→prepare / knowing your number→math |
| `career-change` | "switching careers", "pivoting to UX" | decision_matrix + timeline + reading_list | explore (reading_list+contact); decide (decision_matrix+pros_cons); transition plan (timeline+goal_tracker+budget) | "How sure are you?" → still exploring / weighing it→decide / committed→plan |
| `conference-trip` | "going to a conference" | daily_agenda + checklist + contact | sessions (daily_agenda+notes); people (contact+checklist); follow-ups (checklist+logbook) | "What do you want out of it?" → talks→sessions / meeting people / doing something after→follow-ups |
| `presentation-prep` | "giving a talk next month" | outline + countdown + checklist | content (outline+notes); rehearsal (habit+timer+checklist); logistics (checklist+contact) | "What's furthest behind?" → the content / practice→rehearsal / logistics |
| `resignation` | "handing in my notice", "leaving my job" | checklist + timeline + notes | handover (checklist+notes); timing (timeline+countdown); what's next (notes+goal_tracker) | "What needs the most care?" → a clean handover / the timing / the next chapter |
| `portfolio-build` | "need a portfolio", "showcasing my work" | kanban + checklist + links | select work (kanban+media); build it (checklist+timeline); publish & share (links+metrics) | "Where are you stuck?" → choosing pieces→select / making it→build / getting it seen→publish |

### 2.3 Money & finance

| Archetype | Triggers | Recommended workspace | Focused directions | Micro-question |
|---|---|---|---|---|
| ✅ `personal-finance` | "get my finances together", "saving up for X" | budget + goal_tracker + metrics | budget; goal; log | "What matters most right now?" |
| `debt-payoff` | "pay off my credit card", "getting out of debt" | goal_tracker + progress + budget | snowball plan (table+progress); monthly squeeze (budget+pie_chart); milestone morale (progress+countdown) | "What keeps you on track?" → a clear order→snowball / finding the money→squeeze / seeing the finish line→morale |
| `emergency-fund` | "build an emergency fund", "need a safety net" | goal_tracker + progress + budget | the number (calculator+goal_tracker); autopilot (habit+budget); track (progress+line_chart) | "What's the blocker?" → knowing the target→number / actually saving→autopilot / staying motivated→track |
| `start-investing` | "start investing", "where to put my savings" | reading_list + notes + budget | learn first (reading_list+notes); how much (budget+calculator); track (metrics+line_chart) | "Where are you?" → learning / figuring the amount→how much / already in→track |
| `retirement-planning` | "plan for retirement", "am I saving enough" | goal_tracker + metrics + notes | the math (calculator+metrics); catch-up plan (budget+goal_tracker); learn (reading_list+notes) | "What would help?" → running numbers→math / a plan→catch-up / understanding options→learn |
| `tax-season` | "do my taxes", "tax deadline coming" | checklist + countdown + links | documents (checklist+media); deadlines (countdown+calendar); records (logbook+table) | "What's the pain?" → gathering papers→documents / the deadline / messy records |
| `subscription-audit` | "too many subscriptions", "cut monthly costs" | table + checklist + budget | list them (table+budget); cancel (checklist+counter); watch (budget+pie_chart) | — (small enough; no question) |
| `net-worth` | "track my net worth" | metrics + line_chart + logbook | — (single strong direction; alternatives: monthly snapshot→logbook; breakdown→pie_chart) | — |
| `shared-expenses` | "split rent with roommates", "who owes what" | table + budget + calculator | — (ledger→table+logbook; monthly split→calculator+budget) | — |
| `sell-stuff` | "sell my old stuff", "declutter and make money" | inventory + checklist + budget | catalogue (inventory+media); list & price (table+links); track sales (logbook+counter+budget) | "What stage?" → sorting→catalogue / listing / selling→track |
| `charitable-giving` | "plan my donations", "give more this year" | budget + table + calendar | — (annual plan→budget+calendar; research causes→links+table) | — |
| `insurance-shopping` | "choosing health insurance", "compare policies" | decision_matrix + table + checklist | — (compare→decision_matrix; paperwork→checklist+countdown) | — |

### 2.4 Home & living

| Archetype | Triggers | Recommended workspace | Focused directions | Micro-question |
|---|---|---|---|---|
| ✅ `moving-home` | "moving next month" | checklist + budget + countdown | tasks; costs; admin | "What worries you most?" |
| ✅ `home-improvement` | "renovating the kitchen" | checklist + budget + timeline | plan; costs; design | "What stage is it at?" |
| `declutter` | "declutter the house", "too much stuff" | checklist + habit + progress | room by room (checklist+progress); daily habit (habit+counter); sell/donate (inventory+checklist) | "How do you want to attack it?" → systematically→rooms / little daily bites→habit / stuff out the door→sell |
| `cleaning-routine` | "keep the house clean", "cleaning schedule" | weekly_planner + habit + checklist | — (rota→weekly_planner; deep-clean list→checklist; shared chores→table) | — |
| `garden` | "start a garden", "growing vegetables" | calendar + checklist + logbook | plan the plot (sketchpad+inventory); planting calendar (calendar+checklist); grow log (logbook+media) | "What stage?" → designing→plot / when to plant→calendar / already growing→log |
| `houseplants` | "keep my plants alive" | habit + inventory + logbook | — (watering rhythm→habit; plant roster→inventory+media) | — |
| `home-maintenance` | "stay on top of house maintenance" | calendar + checklist + logbook | — (seasonal calendar; repair log→logbook+budget) | — |
| `interior-design` | "redecorating the living room" | sketchpad + color_palette + budget | mood (media+color_palette+links); layout (sketchpad); shopping (checklist+budget+links) | "What comes first for you?" → the vibe→mood / the layout / the buying→shopping |
| `smart-home` | "setting up smart home stuff" | checklist + links + notes | — (device plan→checklist+sketchpad; research→links+table) | — |
| `emergency-prep` | "emergency kit", "prep for storm season" | checklist + inventory + contact | — (kit→inventory+checklist; family plan→contact+notes) | — |
| `home-inventory` | "document our stuff for insurance" | inventory + media + table | — | — |
| `rent-out-space` | "renting out the spare room", "listing on Airbnb" | checklist + budget + calendar | — (get ready→checklist+media; money→budget+metrics; bookings→calendar+form) | — |

### 2.5 Health & body *(gentle-tone rules apply — §3)*

| Archetype | Triggers | Recommended workspace | Focused directions | Micro-question |
|---|---|---|---|---|
| ✅ `fitness` | "getting in shape", "training for a marathon" | habit + goal_tracker + metrics | routine; progress; plan | "What would keep you going?" |
| ✅ `wellbeing` | "feeling burned out", "reduce stress" | mood_tracker + habit | mood; routine; unload | "What would help today?" |
| ✅ `habit-building` | "drink more water", "quit smoking" | habit + mood_tracker | single; routine; reflect | "How do you want to hold yourself to it?" |
| `running-program` | "couch to 5k", "training for a 10k" | timeline + habit + stopwatch | the plan (timeline+checklist); consistency (habit+counter); times (stopwatch+line_chart) | "What do you care about?" → following a plan / just showing up→consistency / getting faster→times |
| `strength-program` | "start lifting", "getting stronger" | weekly_planner + logbook + progress | program (weekly_planner+checklist); log lifts (logbook+line_chart); milestones (goal_tracker+progress) | "What's your style?" → structured program / tracking numbers→log / chasing PRs→milestones |
| `weight-management` | "lose a few kilos", "healthier weight" *(neutral)* | goal_tracker + habit + line_chart | gentle habits (habit+weekly_planner); trend not day (line_chart+metrics); food awareness (logbook+weekly_planner) | "What approach feels right?" → small habits / watching the trend / knowing what I eat→awareness |
| `sleep` | "fix my sleep", "sleeping badly" | habit + logbook + mood_tracker | wind-down (habit+daily_agenda); patterns (logbook+line_chart); mornings (habit+countdown?) | "Which end of the night?" → falling asleep→wind-down / understanding it→patterns / waking up→mornings |
| `rehab` | "recovering from a knee injury", "physio exercises" *(neutral)* | checklist + habit + progress | daily exercises (checklist+habit); track recovery (logbook+progress); appointments (calendar+contact) | — |
| `appointments` | "keep track of doctor stuff" | calendar + checklist + contact | — (visits→calendar+notes; questions to ask→checklist) | — |
| `medication-routine` | "remember my meds" *(neutral, zero advice)* | habit + daily_agenda | — | — |
| `meditation` | "meditate regularly", "start mindfulness" | habit + timer + logbook | — (streak→habit+counter; sessions→timer+logbook; how it feels→mood_tracker) | — |
| `symptom-journal` | "track my migraines" *(neutral)* | logbook + calendar + line_chart | — (log→logbook; patterns→line_chart+calendar; for the doctor→notes+table) | — |
| `nutrition-awareness` | "eat better", "track what I eat" | logbook + weekly_planner + metrics | — (log→logbook; plan→weekly_planner+checklist) | — |

### 2.6 People & relationships

| Archetype | Triggers | Recommended workspace | Focused directions | Micro-question |
|---|---|---|---|---|
| ✅ `plan-event` | "throwing a birthday party" | checklist + budget + countdown + contact | guests; logistics; budget | "What's the pressing part?" |
| `wedding` | "planning our wedding" | checklist + budget + countdown + table(guests) | vendors (contact+table+budget); guests (table+form+counter); the day (timeline+daily_agenda); money (budget+pie_chart) | "What's looming largest?" → vendors / the guest list / the day itself / the budget |
| `gift-planning` | "Christmas shopping", "gift ideas for everyone" | checklist + budget + table | ideas per person (table+notes); budget (budget+counter); shipping deadlines (countdown+checklist) | — |
| `keep-in-touch` | "be better at staying in touch" | contact + habit + calendar | — (rotation→contact+calendar; occasions→calendar+countdown; call log→logbook) | — |
| `new-baby` | "we're having a baby" | checklist + countdown + budget | get ready (checklist+inventory); money (budget+goal_tracker); logistics & people (contact+calendar+notes) | "What would ease your mind?" → being prepared→ready / the finances→money / the plan around the birth→logistics |
| `kids-activities` | "juggling the kids' schedules" | weekly_planner + calendar + contact | — (the week→weekly_planner; carpool & contacts→contact+table; gear→checklist+inventory) | — |
| `new-pet` | "getting a puppy" | checklist + habit + budget | prepare (checklist+inventory+links); routine (habit+daily_agenda); health & costs (budget+calendar+contact) | "Where are you?" → before pickup→prepare / settling in→routine / ongoing care→health |
| `eldercare` | "helping my mom as she gets older" *(gentle)* | contact + calendar + checklist | coordination (calendar+contact); paperwork (checklist+notes); observations (logbook+notes) | — |
| `holiday-season` | "getting ready for the holidays" | checklist + budget + calendar | gifts (table+budget); hosting (checklist+countdown); cards & greetings (contact+checklist) | "Which part?" → gifts / hosting / cards |
| `celebration-surprise` | "planning a surprise for her birthday" | checklist + countdown + budget | — (the plan→checklist+notes; keeping it secret is a UX joke we skip) | — |
| `long-distance` | "long distance relationship" | world_clock + calendar + countdown | — (time zones→world_clock+daily_agenda; visits→countdown+budget; shared things→links+media) | — |
| `co-parenting` | "custody schedule coordination" *(neutral)* | calendar + weekly_planner + notes | — (schedule→calendar; handoffs→checklist; shared costs→table+budget) | — |
| `family-tree` | "researching our family history" | outline + table + media | — (tree→outline/canvas_node; records→table+links+citation; photos→media) | — |

### 2.7 Travel

| Archetype | Triggers | Recommended workspace | Focused directions | Micro-question |
|---|---|---|---|---|
| ✅ `plan-trip` | "trip to Tokyo" | checklist + budget + daily_agenda + links | itinerary; budget; logistics | "What needs sorting first?" |
| `road-trip` | "road trip down the coast" | timeline(route) + checklist + budget | route (timeline+links+media); car & gear (checklist+inventory); stops (table+links) | "What's the fun part for you?" → the route / being prepared→gear / the stops |
| `camping` | "camping trip", "hiking weekend" | checklist(gear) + inventory + countdown | — (gear→inventory+checklist; food plan→checklist+budget; route→links+media) | — |
| `long-travel` | "backpacking Southeast Asia", "gap year" | timeline + budget + checklist | route (timeline+world_clock+links); money (budget+metrics); paperwork (checklist+countdown+contact) | "What's most uncertain?" → the route / the money / visas & documents→paperwork |
| `move-abroad` | "moving to Berlin", "emigrating" | checklist + timeline + countdown | paperwork (checklist+contact+countdown); logistics (timeline+budget); landing (checklist+links+world_clock) | "Which phase?" → visas→paperwork / the move itself→logistics / settling in→landing |
| `bucket-list` | "places I want to see someday" | table + links + goal_tracker | — (the list→table+media; next one→countdown+budget) | — |
| `business-travel` | "traveling for work constantly" | checklist(packing template) + world_clock + daily_agenda | — (repeatable packing→checklist+process; expenses→logbook+budget+timesheet) | — |

### 2.8 Creative & making

| Archetype | Triggers | Recommended workspace | Focused directions | Micro-question |
|---|---|---|---|---|
| ✅ `writing-project` | "writing a novel" | outline + goal_tracker + habit | structure; momentum; research | "What do you fight with most?" |
| `podcast` | "starting a podcast" | checklist(launch) + kanban(episodes) + timeline | launch (checklist+countdown+links); episodes (kanban+calendar); gear & sound (links+budget+audio_player) | "Where are you?" → before episode 1→launch / making episodes / the setup→gear |
| `video-channel` | "starting a YouTube channel" | kanban(ideas→published) + calendar + metrics | ideas (kanban+notes); cadence (calendar+habit); growth (metrics+line_chart) | "What's the challenge?" → what to make→ideas / posting regularly→cadence / growing→growth |
| `photography-project` | "getting into photography" | goal_tracker + media + links | shoot more (habit+counter+media); learn (reading_list+links); a project (goal_tracker+checklist+media) | "What kind of push?" → practice→shoot / technique→learn / a real project |
| `music-making` | "recording an album", "writing songs" | kanban(songs) + timeline + checklist | songs (kanban+audio_player+notes); release (timeline+checklist+countdown); practice (habit+timer) | "Which mode?" → writing→songs / releasing / getting better→practice |
| `daily-art-practice` | "draw every day", "100 days of code", "Inktober" | habit + counter + media | — (streak→habit+counter; gallery→media; prompts→bullets+calendar) | — |
| `craft-project` | "knitting a sweater", "building a table" | checklist(steps) + inventory(materials) + media | plan (process+sketchpad+unit_converter); materials (inventory+budget+links); progress (media+logbook) | "What stage?" → planning / gathering→materials / making→progress |
| `game-dev` | "making a game" | kanban + game_tuner + timeline | scope (notes+priority_matrix); build (kanban+status); feel (game_tuner+logbook) | "Where's the energy?" → deciding what it is→scope / building / making it feel good→feel |
| `blog-newsletter` | "starting a newsletter" | calendar(content) + kanban(drafts) + metrics | write (kanban+outline); ship on schedule (calendar+habit+countdown); grow (metrics+links) | "What's hard?" → writing / consistency→ship / readers→grow |
| `streaming` | "start streaming on Twitch" | weekly_planner(schedule) + checklist(setup) + metrics | — (setup→checklist+links+budget; schedule→weekly_planner+habit; community→metrics+contact) | — |
| `submissions` | "submitting stories to magazines", "applying to galleries/festivals" | kanban(submissions) + table + countdown | — (pipeline→kanban+table; deadlines→countdown+calendar; responses→logbook) | — |

### 2.9 Food & cooking

| Archetype | Triggers | Recommended workspace | Focused directions | Micro-question |
|---|---|---|---|---|
| ✅ `meal-planning` | "meal prep", "eat at home more" | weekly_planner + checklist + links | menu; groceries; recipes | "What's the goal?" |
| `baking-project` | "learning sourdough", "getting into baking" | process(method) + logbook(attempts) + habit | method (process+notes+unit_converter); attempts (logbook+media+rating); rhythm (habit+calendar) | "What's the fun part?" → nailing the method / experimenting→attempts / the ritual→rhythm |
| `dinner-party` | "hosting dinner Saturday" | checklist + countdown + table(menu) | — (menu→table+links; prep timeline→checklist+timer; guests→contact+poll) | — |
| `recipe-development` | "creating my own recipes" | notes + logbook + rating | — (drafts→notes+media; tests→logbook+rating; keepers→table) | — |
| `tasting-journal` | "getting into wine/coffee/whisky" | logbook + rating + table | — (journal→logbook+rating+media; learn→reading_list+vocab!) | — |
| `preserving` | "canning season", "preserving the harvest" | process + inventory + calendar | — (batches→process+logbook; pantry→inventory; schedule→calendar) | — |
| `diet-transition` | "going vegan", "trying keto" *(neutral)* | weekly_planner + reading_list + checklist | — (meals→weekly_planner+links; learn→reading_list+notes; pantry swap→checklist+inventory) | — |
| `restaurant-list` | "places we want to eat at" | table + rating + links | — | — |

### 2.10 Life admin

| Archetype | Triggers | Recommended workspace | Focused directions | Micro-question |
|---|---|---|---|---|
| ✅ `big-purchase` | "buying a laptop" | decision_matrix + budget + links | compare; afford; shortlist | "Where are you in the hunt?" |
| ✅ `decision` | "should I take the offer?" | pros_cons + decision_matrix | quick; weighted; gut | "How rigorous do you want to be?" |
| `car-ownership` | "stay on top of car maintenance" | calendar + logbook + budget | — (schedule→calendar+checklist; log→logbook; costs→budget+line_chart) | — |
| `sell-vehicle` | "selling my car" | checklist + table(offers) + links | — (prep→checklist+media; listings→links+table; offers→table+notes) | — |
| `bureaucracy` | "renew my passport", "visa paperwork", "DMV stuff" | checklist + countdown + contact | — (documents→checklist+media; timeline→countdown+calendar; contacts→contact+logbook) | — |
| `immigration-process` | "green card process", "citizenship application" | checklist + timeline + logbook | — (requirements→checklist+links; timeline→timeline+countdown; records→logbook+media) | — |
| `digital-cleanup` | "organize my files/photos", "digital declutter" | checklist + progress + counter | — (photos→checklist+progress; passwords→checklist; storage→pie_chart+metrics) | — |
| `email-overload` | "get to inbox zero" | habit + checklist + counter | — | — |
| `choose-school` | "picking a school for our daughter" | decision_matrix + table + calendar | — (compare→decision_matrix+table; visits→calendar+notes; application→checklist+countdown) | — |
| `find-provider` | "need a new dentist/doctor/plumber" | table + contact + checklist | — | — |
| `insurance-claim` | "filing a claim after the storm" | checklist + logbook + media | — (evidence→media+logbook; process→checklist+contact+countdown) | — |
| `warranty-receipts` | "track warranties and receipts" | table + media + calendar | — | — |
| `estate-planning` | "make a will", "get our affairs in order" *(gentle)* | checklist + contact + notes | — (documents→checklist+notes; people→contact; wishes→notes) | — |
| `benefits-application` | "applying for unemployment/aid" *(neutral)* | checklist + countdown + logbook | — | — |

### 2.11 Business & product

| Archetype | Triggers | Recommended workspace | Focused directions | Micro-question |
|---|---|---|---|---|
| ✅ `startup` | "starting a coffee shop business" | swot + timeline + budget + kanban | validate; plan; numbers | "What keeps you up at night?" |
| ✅ `start-project` | "kicking off a project" | kanban + timeline + notes | plan; track; shape | "Where are you with it?" |
| ✅ `research` | "researching quantum computing" | outline + citation + reading_list + notes | sources; synthesis; questions | "Where are you in it?" |
| `product-launch` | "launching next quarter" | timeline + checklist + metrics | plan (timeline+risk_register); readiness (checklist+status+countdown); success (metrics+line_chart) | "What defines success?" → hitting the date→plan / nothing breaking→readiness / the numbers→success |
| `marketing-campaign` | "running a campaign" | timeline + budget + metrics | plan (timeline+kanban); spend (budget+pie_chart); results (metrics+bar_chart) | — |
| `content-calendar` | "our social media is chaos" | calendar + kanban + metrics | — (plan→calendar+kanban; ideas→notes+bullets; performance→metrics+bar_chart) | — |
| `client-management` | "juggling several clients" | kanban + contact + timesheet | — (work→kanban+status; people→contact+meeting_notes; hours→timesheet+metrics) | — |
| `invoicing` | "chasing invoices", "who owes me" | table + countdown + metrics | — (ledger→table+logbook; overdue→countdown+checklist; cashflow→metrics+line_chart) | — |
| `customer-feedback` | "collect user feedback" | form + table + metrics | — (collect→form+poll; digest→table+notes; act→kanban+checklist) | — |
| `competitor-analysis` | "size up the competition" | table + swot + links | — | — |
| `pricing-strategy` | "figure out what to charge" | decision_matrix + calculator + table | — (models→table+notes; math→calculator+formula; decide→decision_matrix+pros_cons) | — |
| `stock-inventory` | "track our stock" | inventory + metrics + logbook | — | — |

### 2.12 Community, play & everything else

| Archetype | Triggers | Recommended workspace | Focused directions | Micro-question |
|---|---|---|---|---|
| ✅ `reading` | "read more books" | reading_list + habit + goal_tracker | list; habit; notes | "What do you want from it?" |
| `volunteering` | "start volunteering" | calendar + contact + logbook | — (find→links+table; commit→calendar+habit; log→logbook+counter) | — |
| `run-a-club` | "running our book club" | calendar + contact + poll | — (schedule→calendar+countdown; members→contact+form; picks→poll+reading_list) | — |
| `fundraiser` | "organizing a fundraiser" | goal_tracker + progress + checklist | — (target→goal_tracker+progress; event→checklist+countdown+contact; money→budget+logbook) | — |
| `religious-season` | "Ramadan planning", "Advent", "Lent" *(respectful, neutral)* | calendar + habit + checklist | — (observance→calendar+countdown; practice→habit+counter; gatherings→checklist+contact) | — |
| `coach-team` | "coaching my kid's team" | weekly_planner + contact + checklist | — (sessions→weekly_planner+process; roster→contact+table; season→calendar+metrics) | — |
| `tournament` | "organizing a tournament" | table(bracket) + checklist + countdown | — | — |
| `collection` | "organize my vinyl/cards/books" | inventory + table + media | — (catalogue→inventory+media; wishlist→table+budget; trades→logbook+links) | — |
| `puzzle-hobby` | "getting into chess/crosswords/climbing grades" → routes to `learn-skill` | — | — | — |
| `life-reset` | "get my life together", "fresh start" *(broad!)* | priority_matrix + habit + notes | pick a front (priority_matrix+notes); one habit (habit); brain dump (notes+checklist) | "Where do you want to start?" → seeing everything→pick / one small win→habit / getting it out of my head→dump |

**Catalogue totals: ~120 archetypes, ~330 directions, all expressible with the existing 72 widget types.**

---

## 3. Sensitive-scenario policy

Some triggers touch grief, illness, addiction, divorce, job loss, financial distress.
Rules, enforced by a per-archetype `tone: 'standard' | 'gentle'` flag:

1. **Gentle tone** — taglines become plain and quiet ("A private place to write",
   never "Crush your goals!"). No exclamation marks, no gamified language.
2. **No streak pressure** on gentle archetypes — `habit` widgets appear only in
   explicitly chosen directions, never in the recommended lead.
3. **Notes-first fallback** — for high-sensitivity input (bereavement, diagnosis,
   crisis wording), *suppress scenario mode entirely*: recommend Notes, quietly
   offer one gentle direction. Maintain a `SUPPRESS_PATTERNS` list checked before
   archetype matching.
4. **Never fabricate expertise** — no archetype gives medical, legal, or financial
   advice through widget titles. Titles describe the user's own activity ("Questions
   for the doctor"), never instructions.
5. **The micro-question is optional everywhere**, and on gentle archetypes it is
   phrased as an offer ("What would help today?") never an interrogation.

---

## 4. Implementation plan

### Phase 1 — Catalogue infrastructure (foundation, ~1 session)

The current archetype list is inline TS literals. At 120 entries this needs structure,
not a rewrite:

- **Split data from engine**: `src/utils/scenarios/catalogue.ts` (pure data, one
  export per domain, concatenated) and `src/utils/scenarios/resolve.ts` (the engine —
  current logic moves over unchanged). `scenarioResolver.ts` becomes a re-export shim
  so `QuickAddSheet.tsx` doesn't change.
- **Schema hardening**: `ArchetypeSpec` gains `domain`, `tone`, `priority` (tie-break
  weight), and `slots` (Phase 3). Directions gain optional `seed` (Phase 3).
- **Invariant checks in dev**: on first resolve in dev builds, walk the catalogue and
  `console.warn` any direction whose widget type isn't in `WIDGET_REGISTRY`, any
  question option pointing at a missing direction id, any archetype without a `hub`.
  (Cheap, catches typos in a 330-direction table immediately.)
- **Fixture file**: `src/utils/scenarios/fixtures.ts` — an array of
  `{ input, expectArchetype, expectTopic? }` covering ≥3 phrasings per archetype
  (≈400 lines, written alongside each archetype as it lands). Runnable via a dev
  console helper `__grovepad.runScenarioFixtures()` until a test runner exists.

### Phase 2 — Matching precision engine (the big one, ~2–3 sessions)

Current matching is **first-regex-wins**, which already produced real bugs ("quit my
job" → habit-building). At 120 archetypes it must become **scored, not ordered**:

```
score(archetype, input) =
    max(patternHits)            // strongest regex hit: 0.55 explicit … 0.4 weak
  + keywordOverlap * 0.25       // lemmatized token overlap with per-archetype keyword set
  + verbFrameBonus * 0.15       // "learning/planning/deciding/tracking/saving/fixing/quitting…"
                                //   verb families mapped to domains
  + specificityFit * 0.10       // how well the input's specificity profile matches
                                //   the archetype's expected shape
  - negationPenalty             // "not planning a trip anymore" → hard suppress
  - narrativePenalty            // third-person/past-tense storytelling → likely just a note
```

Concrete work items:

1. **Score all, pick max with margin.** Resolve returns the top archetype only when
   `top ≥ 0.5` and `top − second ≥ 0.12`. Inside the margin → *ambiguous scenario*:
   show both scenario chips and let one tap disambiguate (a new, tiny UI state — the
   micro-question mechanism reused at the archetype level).
2. **Longest-consumption tie-break.** "Studying for my Spanish exam" fires both
   `language-learning` and `exam-prep`; the pattern that consumed more of the input
   (match length / input length) wins — exam-prep here — and the loser's topic
   ("Spanish") still feeds the winner's topic slot.
3. **Verb-frame lexicon** (`verbFrames.ts`): ~15 families (`ACQUIRE_SKILL`, `PLAN`,
   `DECIDE`, `TRACK`, `SAVE`, `ORGANIZE`, `CREATE`, `RECOVER`, `MAINTAIN`, `HOST`,
   `SEARCH`, `TRANSITION`, `REDUCE`, `REMEMBER`, `COORDINATE`), each a verb set plus
   a domain-affinity vector. Cheap to compute, big disambiguation win: "getting
   into photography" (ACQUIRE_SKILL→creative) vs "getting into Harvard"
   (SEARCH/TRANSITION→education).
4. **Person/tense guard.** First-person present/future ("I'm…", "we're…", "going
   to…") is scenario fuel. Third-person or past narrative ("my sister learned
   French in a year") gets `narrativePenalty` and falls through to Notes.
5. **Negation guard.** Reuse `extractMeaning().negated`, plus scoped forms:
   "stopped", "gave up", "cancelled", "no longer" adjacent to the matched span.
6. **Multi-scenario input.** "Learning Spanish and planning a trip to Madrid" — when
   two archetypes both clear threshold on *disjoint spans*, offer a two-chip split
   ("Two things here — set up both?") that commits two anchored clusters side by
   side. Span tracking comes free from regex match indices.
7. **Topic pipeline hardening.** Current `TOPIC_TRAIL` trimming + title-casing,
   plus: possessive normalization ("my mom's garden" → "Mom's garden"), pronoun
   rejection, emoji stripping, 28-char cap (already), and a per-archetype
   `topicHint: 'place' | 'subject' | 'thing' | 'person' | 'free'` so "moving to
   Berlin" prefers the place capture while "learning to bake" prefers the activity.

### Phase 3 — Slot filling: plans that arrive pre-configured (~1–2 sessions)

The difference between "a Countdown widget" and "a Countdown already set to June 14"
is the difference between a template and a thought understood.

- **Slot spec per archetype**: `slots: { deadline?: 'countdown' | 'date_picker';
  amount?: 'budget' | 'goal_tracker'; place?: …; people?: 'contact' }`.
- **Extractors already exist** in `thoughtInterpreter.ts` (`detectDate`, `MONEY`,
  `MENTION`, `URL`) — scenario resolution reuses them on the raw input.
- **Seeding**: `buildPlan` gains a `seed` step — when a slot value exists and the
  direction contains its widget type, patch `defaultData()`:
  `countdown.targetDate = detected date`, `goal_tracker.target = detected amount`,
  `contact.name = detected @mention`, `links.items = detected URLs`.
- **The justified second question**: when an archetype declares a slot
  `consequential: true` (exam date, wedding date, moving day) and it's missing, the
  sheet may show *one* follow-up chip row ("When is it?" → Today+N presets / date
  keyboard input / "skip"). Hard cap: never more than one slot question, and only
  after the first question is answered or absent.

### Phase 4 — Deep context engine (~2 sessions)

Currently: duplicate-lead derank, canvas-name token match, learned direction. Extend:

1. **Selection as subject.** If a widget is selected and its title shares tokens
   with the input (or the input is *only* vague verbs — "need to get on this"), bias
   toward attaching: recommend a compact direction, parent the cluster to the
   selection (plumbing already exists via `commitThoughtPlan`'s `parentId`), and
   note "Building under {title}".
2. **Whole-plan dedup, reuse over re-create.** Today only the lead widget is
   checked. Instead diff every plan node against same-type widgets whose titles
   share the topic token; matching nodes are dropped from the plan and *relinked* —
   the committed cluster adds `parent` relations to the existing widgets. Note:
   "Reusing your {title}". This is the single biggest cleanup-avoidance feature.
3. **Canvas-of-canvases awareness.** `canvas_node` widgets mean workspaces nest. If
   a sibling canvas is named like the topic ("Languages", "Spain 2027"), offer
   "Put this on {canvas}?" as a secondary action chip on the plan card
   (`commitThoughtPlan` on that canvasId + a toast with a jump action).
4. **Recency shaping.** Keep a rolling 7-day log (localStorage ring buffer, ~50
   entries) of created widget types. A user who just made a Budget by hand and then
   types a vague finance thought gets the `goal` direction led, not another Budget —
   generalizes the current canvas-scan to time.
5. **Explanations stay mandatory.** Every rerank source emits at most one note;
   the sheet shows at most one (priority: reuse > attach > learned > name-match).

### Phase 5 — Learning that compounds (~1 session)

1. **Keep**: per-archetype direction counts (shipped).
2. **Undo as negative signal.** `commitThoughtPlan` runs inside
   `batchHistory('thought-plan', …)`; tag the batch with the archetype/direction and
   decrement the preference if that exact batch is undone within 2 minutes. (Hook
   point: the undo stack already knows batch labels.)
3. **Token→archetype votes**, mirroring `thoughtInterpreter`'s `tokenTypes`: after
   3+ commits, "vocab" in any input nudges language-learning for *this user*.
4. **Plan-size preference.** Track committed plan sizes; a user who consistently
   picks 1–2 widget directions gets compact directions ranked above hubs (and the
   hub tagline becomes "the full setup" — still one tap away).
5. **Explicit pin, minimal chrome.** After committing a non-recommended direction
   twice for the same archetype, show once: a small "Always start here" chip on the
   plan card. Accepting sets a hard pin (beats learned counts); a pinned lead shows
   "Your default" and unpins from the same spot. No settings page needed.
6. **Reset story.** One line in the existing debug panel (`AiDebugPanel.tsx`):
   "Forget quick-add preferences" → clears both localStorage keys.

### Phase 6 — Evaluation as a first-class artifact (~1 session + ongoing)

The repo has no test runner; this phase earns one (vitest, zero-config with Vite).

- **Fixture suite** (Phase 1's file, promoted to `scenarioResolver.test.ts`):
  - *Coverage*: ≥3 vague phrasings per archetype resolve to it (top-1).
  - *Anti-hijack*: a corpus of *specific* requests ("write a checklist for
    groceries", outlines, explicit widget names) must return `null` from
    `resolveScenario` — protecting the widget predictor's territory. This is the
    most important suite: false scenario positives are worse than misses.
  - *Sensitive*: suppression list inputs never produce cheery hubs.
  - *Topic*: expected topic extraction per phrasing.
- **Metrics that matter** (computed over fixtures, printed in CI):
  top-1 archetype accuracy; % of fixtures whose expected direction is in the top 3;
  false-positive rate on the specific corpus; margin distribution (how often the
  ambiguity UI would trigger).
- **Live counters, local only**: commits per archetype, undo-within-2-min per
  archetype, question-answer rate. Surfaced in `AiDebugPanel` — these are the
  "top-three usefulness" and "how often users undo" measurements the concept calls
  for, without telemetry.

### Phase 7 — Suggested sequencing

| Order | Phase | Why this order |
|---|---|---|
| 1 | Phase 1 (infrastructure) + first 40 new archetypes (education, career, money, home) | Data layout must precede volume; these domains have the clearest trigger language |
| 2 | Phase 6 (fixtures + vitest) | Write the harness *before* the tricky domains — every subsequent archetype lands with tests |
| 3 | Phase 2 (scoring engine) | With 60+ archetypes live, first-match ordering becomes untenable; fixtures make the swap safe |
| 4 | Remaining ~60 archetypes (health, relationships, creative, admin, business, community) | Sensitive-tone machinery (§3) built as part of the health/relationships batch |
| 5 | Phase 3 (slots) | Highest visible-delight-per-effort once matching is trustworthy |
| 6 | Phase 4 (deep context) | Needs stable matching + slots to rerank meaningfully |
| 7 | Phase 5 (learning extensions) | Compounds forever after; needs undo-tagging plumbing from the store |

### Shipped: the structural planner (quantified requests)

`src/utils/structuralPlanner.ts` — a deterministic layer that runs before
scenario resolution and before any model call, for requests that state their
own topology. Canonical documented case (also a fixture in
`structuralPlanner.test.ts`, and correct with AI fully disabled):

> "make me a calculus 2 course topic tree, 3 main topics, 5 subtopics each.
> attach appropriate widgets for me to study, also attach a sketchpad in a
> group to every subtopic node"

Behavior:
- Counts bind only to a whitelist of level nouns; a second level must be
  explicitly per-parent ("each"/"per"/sub-prefix) — two absolute counts are
  rejected, never guessed. Single-level requests need tree context
  ("tree", "outline", "course"…).
- "Attach a X" resolves through the interpreter's widget matching; "in a
  group" scopes to its own directive clause and produces **real widget
  groups** (`ThoughtPlan.groups` → `commitThoughtPlan` → group band + pill),
  one group per host, merged if several grouped attachments share a host.
- Vague "appropriate widgets for me to study" rotates through a
  subject-keyword mapping (math → formula sheet / flashcards / quiz, etc.)
  so branches get varied drills, not clones.
- The literal example expands to 49 nodes — over the 48 cap — so the deepest
  level scales 5 → 4 with a visible amber warning in the sheet before
  commit ("Reduced to 4 subtopics per branch…"). Never silent truncation.
- The whole commit (40 widgets, 39 relations, 12 groups) is one undo step.
- Models never touch this structure. On deep-capable tiers a follow-up call
  may only rename placeholder titles through an id-constrained
  `{"titles":[…]}` schema (`localAiService` "branch namer" task); unknown
  ids are ignored, structure/groups/relations are byte-identical after
  enrichment, and the router-only tier skips the call entirely.

---

## 5. Further improvement ideas (beyond the plan)

**Understanding the input**
1. **Clarify-by-example placeholder rotation** — the empty-state example chips rotate
   through domains (finance, trip, decision) per open, teaching breadth passively.
2. **Compound-thought splitting v2** — feed `splitClauses` output through scenario
   scoring per clause, so "learn Spanish, fix my sleep" proposes two mini-hubs.
3. **Emoji & tone signals** — "😭 exams in two weeks" boosts exam-prep urgency slot;
   playful tone never changes matching, only tagline warmth.
4. **Spelling tolerance** — cheap Damerau distance on the keyword lexicon
   ("marathhon", "budgetting") before giving up on a match.
5. **Multilingual triggers** — the trigger lexicon is data; a Spanish/German/French
   trigger set is a translation task, not an engineering one. Detect input language
   per-thought, not per-app.
6. **Opt-in AI deepening** — an "Ask AI to tailor this" chip on the plan card sends
   the thought + chosen direction to the (currently unwired) AI layer to rewrite
   titles and seed data richer; deterministic layer remains the instant default.

**Canvas intelligence**
7. **Ghost preview on canvas** — hovering a direction renders translucent ghost
   cards *behind* the sheet at the actual commit position (the `GhostTreeShaper`
   pattern exists); the plan stops being abstract.
8. **Post-commit follow-through** — reopening quick-add near an existing hub (same
   archetype, ≤7 days) offers "Log today's practice" / "Add a word" style
   *actions on existing widgets* instead of new widgets. This is the moment the
   feature becomes a companion instead of a generator.
9. **Cluster health nudges (opt-in only)** — a hub untouched for 3 weeks gets a
   quiet indicator on the group pill, never a notification.
10. **Scenario-aware group bands** — committed hubs auto-create a named group
    ("Spanish", color from the lead widget's accent) so the new relation lines +
    band read as one object immediately.
11. **Attach-vs-new arbitration** — when the selected widget's cluster already
    matches the detected archetype, default the sheet into "extend this cluster"
    mode with an explicit "start fresh instead" escape.

**Interaction & feel**
12. **Keyboard-first flow** — ↑/↓ cycles directions, 1–4 answers the micro-question,
    ⌘Z inside the sheet un-answers. Zero pointer needed from N to committed hub.
13. **FLIP chip morphing** — when directions swap, chips that persist between plans
    animate position rather than re-rising, making the plan feel like one living
    object being reshaped by the conversation.
14. **Commit choreography** — on create, the sheet's plan chips visibly fly toward
    their canvas positions (one 300ms one-shot, respecting reduced-motion), so the
    mental model "chips = future widgets" is confirmed exactly once.
15. **"Just notes" always one tap** — a permanent quiet button in the sheet footer;
    the cost-of-being-wrong floor made physical.
16. **Voice capture** — Web Speech API into the same textarea; vague spoken thoughts
    are the natural habitat of this feature.

**Learning & personal fit**
17. **Personal archetypes** — "Save this cluster as a starting point": any selected
    group of widgets becomes a user-defined direction with auto-extracted trigger
    tokens from its titles; user templates rank above built-ins on tie.
18. **Household/team lexicon** — recurring @mentions and proper nouns accumulate into
    a local entity dictionary; "plan something for Mika's birthday" auto-fills the
    contact slot and gift-planning archetype.
19. **Rhythm awareness** — if the user answers the micro-question <10% of the time,
    stop rendering it expanded; collapse to a single "refine…" chip (the UI itself
    learns its information density).
20. **Cross-device preference sync** — piggyback the two localStorage keys onto the
    existing Supabase persistence (v2 schema already versioned) as an opt-in.

**Ecosystem & long game**
21. **Scenario deep links** — `grovepad://new?thought=…` so OS-level share sheets and
    browser extensions can pipe a highlighted sentence straight into resolution.
22. **A/B-able catalogue** — because archetypes are pure data with fixtures, variant
    taglines/directions can be evaluated offline against the fixture metrics before
    ever shipping.
23. **Community catalogue format** — the archetype schema (triggers, directions,
    question) is publishable JSON; a curated gallery ("Wedding planning by …") is an
    import feature, not a platform rebuild.
24. **Seasonal priors** — a September "back to school" prior, a January habit prior,
    a November NaNoWriMo prior: ±0.05 score nudges from the calendar, always
    explained ("It's that time of year") and always beatable by stronger signals.
25. **Completion celebration → next scenario** — when a goal_tracker in a hub hits
    100%, the group pill offers "What's next?" seeded with adjacent archetypes
    (finished C25K → 10k program). Scenario intelligence at the *end* of journeys,
    not just the start.

---

*Written 2026-07-11. Companion code: `src/utils/scenarioResolver.ts`,
`src/components/ui/QuickAddSheet.tsx`, `src/utils/thoughtInterpreter.ts`.*
