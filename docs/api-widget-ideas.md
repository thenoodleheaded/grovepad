# External API Widget Concepts for Grovepad

With the offline-first constraint removed from the Widget Constitution, widgets can now harness external online APIs to drive dynamic data directly into the Grovepad wire graph. 

Below is an expanded catalog of API widget ideas, highlighting **out-of-the-box integrations** that turn the canvas into an active personal control center.

---

## 1. Out-of-the-Box & Lifestyle Integrations

### Gmail (VIP Inbox Gate)
- **API Source**: Gmail API
- **Friction**: Getting distracted by spam or low-priority emails while missing critical messages from clients, family, or VIPs.
- **Wire Graph Ports**:
  - ● `unread_count` (number)
  - ● `vip_waiting` (boolean - true if a thread from a starred/VIP sender is unread)
  - ● `oldest_unread_hours` (number)
  - ⚡ `mark_read_oldest` (command)
- **Wiring Story**: Wire `vip_waiting` $\rightarrow$ `branch_gate` $\rightarrow$ set visibility of a VIP-only note card to **visible**. When true, it renders a bold red card: "🚨 Client Ali is waiting on a reply!".

### Steam / PlayStation / Nintendo (Gaming Accountability Lock)
- **API Source**: Steam Web API / PSN API / Smart Plug integrations
- **Friction**: Launching games when there are critical, uncompleted chores or study cards remaining on the canvas.
- **Wire Graph Ports**:
  - ● `is_playing_now` (boolean)
  - ● `playtime_today_minutes` (number)
  - ○ `parental_lockout` (boolean input - blocks console internet or power via smart plug if true)
- **Wiring Story**: Wire `checklist.all_done` $\rightarrow$ `comparator` (false) $\rightarrow$ `steam.parental_lockout`. If you have uncompleted items on your daily checklist, your gaming console power plug or game launcher is locked out.

### Spotify / Sonos (Focus Environment Switch)
- **API Source**: Spotify Web API
- **Friction**: Forgetting to toggle study music on when starting a timer, or forgetting to pause music when a calendar meeting begins.
- **Wire Graph Ports**:
  - ○ `play_playlist_uri` (text input)
  - ○ `volume` (number)
  - ⚡ `play` / `pause` / `skip` (commands)
  - ● `is_playing` (boolean)
  - ● `current_bpm` (number)
- **Wiring Story**: Wire `timer.running` $\rightarrow$ `branch_gate` (True $\rightarrow$ `spotify.play` Focus Playlist, False $\rightarrow$ `spotify.pause`). Alternatively, wire `google_calendar.is_busy` $\rightarrow$ `spotify.pause` to automatically silence music when meetings start.

### Strava / Apple Health / Garmin (Activity Adaptor)
- **API Source**: Strava API / Apple HealthKit
- **Friction**: Fitness trackers log data, but schedules and calorie counters don't adapt to how tired or active you actually are.
- **Wire Graph Ports**:
  - ● `steps_today` (number)
  - ● `sleep_score` (number)
  - ● `workout_duration_minutes` (number)
  - ● `recovery_needed` (boolean)
- **Wiring Story**: Wire `sleep_score` $\rightarrow$ `comparator` ($< 60$) $\rightarrow$ `weekly_planner` input adjustment (automatically triggers a warning banner on your planner: "Low sleep score. Light recovery day suggested").

### Pocket / Instapaper (Read-it-Later Nudger)
- **API Source**: Pocket API
- **Friction**: Bookmarking hundreds of articles and letting them pile up indefinitely without reading.
- **Wire Graph Ports**:
  - ● `unread_count` (number)
  - ● `oldest_article_title` (text)
  - ● `oldest_article_url` (text)
  - ⚡ `archive_oldest` (command)
- **Wiring Story**: Wire `oldest_article_title` and `oldest_article_url` $\rightarrow$ `template` ("Read this today: {a} ({b})") $\rightarrow$ morning dashboard sticky card. Once read, checking a box triggers `pocket.archive_oldest`.

### Duolingo / Anki (Streak Shield & Gate)
- **API Source**: Duolingo API / Anki Connect
- **Friction**: Breaking study streaks because of a lack of visibility on daily dashboards.
- **Wire Graph Ports**:
  - ● `streak_days` (number)
  - ● `completed_today` (boolean)
  - ● `due_cards_count` (number)
- **Wiring Story**: Wire `completed_today` $\rightarrow$ `branch_gate` (False $\rightarrow$ make a custom "Reward card" invisible). You can't reveal your evening game/chill links until Duolingo streaks are secured.

### Notion / Obsidian / Google Docs (Reflection Vault)
- **API Source**: Notion API / Google Docs API
- **Friction**: Reflecting or journaling on the spatial canvas but having to copy-paste it to long-form vaults for permanent archives.
- **Wire Graph Ports**:
  - ○ `content_to_append` (text input)
  - ⚡ `archive_now` (command)
- **Wiring Story**: Wire `weekly_review.completed_summary` $\rightarrow$ `notion.content_to_append`. Wire `clock_pulse.pulse` (configured for Sunday 9 PM) $\rightarrow$ `notion.archive_now` to automatically back up your weekly reviews.

---

## 2. Standard Utilities & Automation Primitives

### Plaid (Real-World Balances)
- **API Source**: Plaid Link
- **Friction**: Manually checking multiple banking apps to update budgets or tracking credit card balance limits.
- **Wire Graph Ports**:
  - ● `checking_balance` (number)
  - ● `credit_card_balance` (number)
  - ● `recent_transaction` (number - pulse value of the latest transaction)
  - ● `spending_alert` (boolean - flips true if daily spend exceeds a target)
- **Wiring Story**: Wire `credit_card_balance` $\rightarrow$ `comparator` ($\ge$ limit) $\rightarrow$ `branch_gate` $\rightarrow$ set target card visibility to **visible** (e.g., a big warning card: "Freeze spending! Credit limit close").

### Stripe (Merchant Dashboard)
- **API Source**: Stripe API
- **Friction**: Indie hackers and freelancers constantly refreshing dashboards to check daily revenue and payout dates.
- **Wire Graph Ports**:
  - ● `mrr` (number)
  - ● `daily_revenue` (number)
  - ● `payout_pending` (number)
  - ⚡ `new_sale` (trigger - fires a pulse whenever a new charge succeeds)
- **Wiring Story**: Connect the `new_sale` pulse $\rightarrow$ `counter.increment` $\rightarrow$ `confetti` trigger. Wire `daily_revenue` $\rightarrow$ `recorder` $\rightarrow$ `line_chart` to auto-graph daily growth.

### Exchange Rates
- **API Source**: Open Exchange Rates / Frankfurter
- **Friction**: Manually converting invoices, travel budgets, or subscription costs from foreign currencies.
- **Wire Graph Ports**:
  - ○ `base_amount` (number)
  - ○ `target_currency` (text)
  - ● `converted_amount` (number)
- **Wiring Story**: Connect a freelancer's foreign client `invoice.amount` $\rightarrow$ `exchange_rates.base_amount` $\rightarrow$ `budget` income.

### Weather Automation (OpenWeatherMap)
- **API Source**: OpenWeatherMap API
- **Friction**: Forgetting to adjust daily schedules, watering habits, or outdoor workout plans based on real-time weather.
- **Wire Graph Ports**:
  - ● `current_temp` (number)
  - ● `uv_index` (number)
  - ● `rain_probability` (number)
  - ● `will_rain_today` (boolean)
- **Wiring Story**: Wire `will_rain_today` $\rightarrow$ `branch_gate` $\rightarrow$ `notifier` ("Rain is expected: water the plants inside instead of turning on sprinklers") OR wire `uv_index` $\rightarrow$ `comparator` ($\ge 6$) $\rightarrow$ `workout_plan` mode switch (Set to: Indoor gym).

### Google Calendar Sync
- **API Source**: Google Calendar API
- **Friction**: Context switching to check when the next meeting starts or seeing if you have free time block options.
- **Wire Graph Ports**:
  - ● `next_meeting_time` (text)
  - ● `minutes_until_next` (number)
  - ● `is_busy` (boolean)
  - ⚡ `meeting_start` (trigger)
- **Wiring Story**: Wire `is_busy` $\rightarrow$ branch gate $\rightarrow$ hide a personal "distraction task checklist" card so it only appears when you are officially free.

### Commute Monitor (Google Maps Traffic)
- **API Source**: Google Maps Distance Matrix
- **Friction**: Being surprised by sudden traffic delays before leaving for work or picking up kids.
- **Wire Graph Ports**:
  - ○ `destination` (text)
  - ● `travel_time_minutes` (number)
  - ● `traffic_delay_minutes` (number)
  - ● `delay_status` (text: Clear / Heavy / Stalled)
- **Wiring Story**: Wire `traffic_delay_minutes` $\rightarrow$ `comparator` ($> 15$) $\rightarrow$ `notifier` ("Commute is jammed! Leave 20 minutes early").

### Telegram / Slack / Discord Sender
- **API Source**: Custom webhooks
- **Friction**: Manually copying summaries or pinging friends/colleagues when goals are reached.
- **Wire Graph Ports**:
  - ○ `message_text` (text)
  - ⚡ `send` (trigger command)
- **Wiring Story**: Wire a `goal_tracker.complete` trigger $\rightarrow$ `template` ("We finished the project goal! Total spend was {budget_total}") $\rightarrow$ `telegram.message_text` $\rightarrow$ `telegram.send` to auto-ping a team chat group.
