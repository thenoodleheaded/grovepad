// Sample content for the Skin Gallery workspace.
//
// Every card in the gallery has to look like somebody actually uses it, so
// each widget family gets real values instead of the registry's empty
// defaults. Three families cover the whole registry:
//
//   * the Atlas/Tracker cards, which all share one envelope (`atlasSample`)
//   * the automation core cards, which all share another (`automationSample`)
//   * everything else, which is hand-authored per type in `BESPOKE_SAMPLES`
//
// A sample is a shallow patch merged over `defaultData()` AFTER the skin has
// been worn, so it always wins. Only keys the type's own `defaultData`
// already declares are used — nothing here invents a field a renderer or the
// persistence schema would not recognise.

import type { ModuleType } from '../../src/types/spatial'

type Patch = Record<string, unknown>

/** Deterministic ids, so rebuilding the gallery produces a stable board. */
let seq = 0
export function sampleId(): string {
  seq += 1
  return `skinlab-item-${seq.toString(36).padStart(5, '0')}`
}
export function resetSampleIds(): void {
  seq = 0
}

const DAY = 24 * 60 * 60 * 1000
/** The gallery is generated, not live — every date hangs off one fixed day. */
export const TODAY = Date.UTC(2026, 7, 4)
export function dayKey(offsetDays = 0): string {
  return new Date(TODAY + offsetDays * DAY).toISOString().slice(0, 10)
}
export function stamp(offsetDays = 0): string {
  return new Date(TODAY + offsetDays * DAY).toISOString()
}

// ---------------------------------------------------------------------------
// Atlas / Tracker family
// ---------------------------------------------------------------------------

type AtlasRow = [label: string, value?: number, done?: boolean, status?: string, note?: string]

interface AtlasSample {
  text?: string
  primary?: number
  secondary?: number
  target?: number
  rows?: AtlasRow[]
  series?: number[]
  times?: Record<string, string>
  date?: string
  timeStart?: string
  timeEnd?: string
  enabled?: boolean
}

const ATLAS: Partial<Record<string, AtlasSample>> = {
  savings_circle: {
    text: 'Round 3 of 8 — Amina holds the pot',
    primary: 100, target: 8,
    rows: [['Amina — paid', 100, true, 'done'], ['Bilal — paid', 100, true, 'done'], ['You — next turn', 100, false, 'active'], ['Chika — pending', 100, false, 'waiting']],
    series: [100, 200, 300, 400, 500, 600, 700],
  },
  zakat: {
    text: 'Nisab checked 12 Jul against the gold standard',
    primary: 8900, secondary: 2.5, target: 4130,
    rows: [['Cash savings', 3200, true, 'done'], ['Gold — 85 g', 5400, true, 'done'], ['Business stock', 900, false, 'active'], ['Debts owed', 600, false, 'waiting']],
  },
  remittance_planner: {
    text: 'Wise — arrives in 2 days, 1.1% all-in',
    primary: 550, secondary: 12.83,
    rows: [['Family support', 400, true, 'done'], ['School fees', 150, false, 'active']],
    series: [12.4, 12.5, 12.61, 12.7, 12.74, 12.8, 12.83],
  },
  price_book: {
    text: 'Olive oil 1 L — cheapest at the bazaar',
    primary: 6.8, target: 9,
    rows: [['Bazaar', 6.8, true, 'done'], ['Metro', 7.4, false, 'active'], ['Corner shop', 9.1, false, 'waiting']],
    series: [7.9, 7.6, 7.5, 7.2, 7, 6.9, 6.8],
  },
  utility_runway: {
    text: 'Prepaid electricity — burning 6.4 kWh a day',
    primary: 41, target: 100,
    rows: [['Reading 4 Aug', 41, true, 'done'], ['Top-up 28 Jul', 100, true, 'done']],
    series: [100, 92, 83, 73, 62, 51, 41],
  },
  fuel_log: {
    text: 'Civic — 7.4 L/100 km, drifting up',
    primary: 12480, secondary: 7.4,
    rows: [['4 Aug — 38.2 L', 38.2, true, 'done'], ['21 Jul — 36.9 L', 36.9, true, 'done']],
    series: [6.9, 7, 7.1, 7.1, 7.2, 7.3, 7.4],
  },
  side_income: {
    text: 'Payout releases at $100 — $68 pending',
    primary: 68, target: 100,
    rows: [['Design gigs', 42, false, 'active'], ['Stock photos', 26, false, 'waiting']],
    series: [8, 19, 27, 38, 51, 60, 68],
  },
  wishlist_saver: {
    text: 'Headphones become affordable on 12 Sep',
    primary: 120, target: 500,
    rows: [['Headphones', 249, false, 'active', 'Cooled off 21 days'], ['Standing desk', 420, false, 'waiting', 'Added last week']],
  },
  vitals_log: {
    text: 'Morning reading sits inside the band',
    primary: 122, secondary: 96, target: 130,
    rows: [['4 Aug 07:10 — 122/78', 122, true, 'done'], ['3 Aug 07:05 — 118/76', 118, true, 'done']],
    series: [131, 128, 126, 124, 121, 119, 122],
  },
  cycle_tracker: { text: 'Follicular — day 12 of 28', primary: 12, target: 28 },
  fasting_window: {
    text: 'Suhoor 05:10, iftar 19:42',
    timeStart: '05:10', timeEnd: '19:42',
    rows: [['Fast kept', 1, true, 'done'], ['Suhoor eaten', 1, true, 'done']],
  },
  hydration: {
    text: '900 ml of a 2,200 ml day',
    primary: 900, target: 2200,
    rows: [['Glass 08:10', 250, true, 'done'], ['Glass 11:40', 250, true, 'done'], ['Bottle 14:20', 400, true, 'done']],
    series: [0, 250, 500, 500, 900, 900, 900],
  },
  sleep_ledger: {
    text: '6 h 30 last night — 3.5 h of debt',
    primary: 6.5, target: 8,
    series: [7.2, 6.8, 7, 6.1, 5.9, 7.4, 6.5],
  },
  stretch_deck: {
    text: 'Shoulder roll',
    primary: 2,
    rows: [['Neck release', 1, true, 'done'], ['Hip opener', 1, false, 'active'], ['Wrist circles', 1, false, 'waiting']],
  },
  prayer_times: { text: 'Tashkent', primary: 3, times: { fajr: '05:10', dhuhr: '12:35', asr: '16:18', maghrib: '19:42', isha: '21:05' } },
  scripture_plan: {
    text: 'Juz 8 — Al-An’am 111 to 165',
    primary: 8, target: 30,
    rows: [['Juz 6', 1, true, 'done'], ['Juz 7', 1, true, 'done'], ['Juz 8', 1, false, 'active']],
  },
  gratitude_jar: {
    text: 'Three good things, every night',
    primary: 3,
    rows: [['Cool morning walk', 1, true, 'done'], ['Sister called', 1, true, 'done'], ['Bread from the corner bakery', 1, true, 'done']],
  },
  prayer_wall: {
    text: 'For steadiness this month',
    rows: [['Safe travel for Dad', 1, false, 'active'], ['Nilufar’s exams', 1, false, 'active'], ['Neighbour’s surgery', 1, true, 'done', 'Answered 22 Jul']],
  },
  outage_schedule: { text: 'Block 4 — dark 18:00 to 20:00 tonight', timeStart: '18:00', timeEnd: '20:00' },
  borrowed_items: {
    text: 'Karim has had the drill for 11 days',
    rows: [['Drill — Karim', 11, false, 'active'], ['Ladder — next door', 3, false, 'waiting'], ['Casserole dish — Mum', 1, true, 'done']],
  },
  plant_care: {
    text: 'The monstera is thirstiest',
    primary: 5, target: 7,
    rows: [['Monstera', 3, false, 'active'], ['Snake plant', 6, true, 'done'], ['Basil', 1, false, 'waiting']],
  },
  go_bag: {
    text: 'Two people, 72% ready',
    primary: 72, target: 100,
    rows: [['Water — 3 days', 1, true, 'done'], ['First aid kit', 1, true, 'done'], ['Batteries — expired', 0, false, 'active']],
  },
  bin_night: { text: 'Green bin', rows: [['Green — tonight', 1, false, 'active'], ['Recycling — next Tuesday', 1, false, 'waiting']] },
  sun_window: { text: 'Sunset 19:55, golden hour from 19:10', primary: 41.3, times: { sunrise: '05:42', sunset: '19:55' } },
  moving_boxes: {
    text: '2 of 8 boxes unpacked',
    primary: 2, target: 8,
    rows: [['Box 1 — Kitchen', 1, true, 'done'], ['Box 5 — Books', 0, false, 'active'], ['Box 6 — Bedding', 0, false, 'waiting']],
  },
  meeting_cost: { text: 'Weekly sync — 6 people at $45/h', primary: 168, secondary: 45, target: 6, enabled: true, series: [0, 28, 56, 84, 112, 140, 168] },
  waiting_on: {
    text: 'Dana has sat on the invoice for 9 days',
    primary: 2,
    rows: [['Invoice approval — Dana', 9, false, 'active'], ['Design feedback — Omar', 3, false, 'waiting']],
  },
  office_hours: { text: 'Tashkent, Berlin and New York overlap 15:00–17:00', timeStart: '09:00', timeEnd: '17:00' },
  scope_meter: { text: 'Landing page — revision 2 of 3', primary: 2, target: 3, rows: [['Extra hero variant', 180, false, 'active'], ['Second round of copy', 0, true, 'done']] },
  handover_note: {
    text: 'Night shift to morning shift',
    rows: [['Printer jam in room 3', 1, false, 'active'], ['Fridge alarm silenced', 1, true, 'done']],
  },
  crit_queue: { text: 'Round 2 — 3 of 5 stamps in', primary: 3, target: 5, rows: [['Sana — approved', 1, true, 'done'], ['Omar — approved', 1, true, 'done'], ['Dana — waiting', 0, false, 'waiting']] },
  on_call: { text: 'Dana holds the pager until Friday 09:00', rows: [['Dana', 1, false, 'active'], ['You — next', 0, false, 'waiting']] },
  estimate_builder: {
    text: 'Kitchen rewire — quoted with 15% risk',
    primary: 980, secondary: 1.15, target: 500,
    rows: [['Labour — 16 h', 640, true, 'done'], ['Materials', 210, true, 'done'], ['Certificate', 130, false, 'active']],
  },
  past_papers: {
    text: 'Weakest topic: thermodynamics',
    primary: 72, target: 100,
    rows: [['2024 Paper 1', 78, true, 'done'], ['2023 Paper 2', 66, true, 'done'], ['2022 Paper 1', 0, false, 'waiting']],
    series: [58, 61, 64, 66, 70, 74, 72],
  },
  memorization_ladder: {
    text: 'Al-Kahf — segments 1 to 20',
    primary: 64, target: 20,
    rows: [['Segment 12', 1, false, 'active'], ['Segment 13', 1, false, 'waiting']],
  },
  experiments: {
    text: 'Last verdict: shorter subject lines won',
    rows: [['Shorter subject lines', 1, true, 'done', '+12% open rate'], ['Tuesday send slot', 0, false, 'active', 'Running since 28 Jul']],
  },
  mistake_bank: {
    text: 'Top pattern — skipping the pre-flight checklist',
    primary: 340,
    rows: [['Deployed without a backup', 220, true, 'done'], ['Quoted before measuring', 120, true, 'done']],
  },
  skill_tree: {
    text: 'Frontier: async patterns',
    primary: 7,
    rows: [['Typing basics', 1, true, 'done'], ['Promises', 1, true, 'done'], ['Async patterns', 0, false, 'active']],
  },
  care_plan: {
    text: 'Dad — Tuesday check-in call',
    rows: [['Morning medication', 1, true, 'done'], ['Physio 15:00', 0, false, 'active'], ['Groceries dropped', 0, false, 'waiting']],
  },
  gift_ledger: {
    text: 'Two gifts still to reciprocate',
    primary: 260,
    rows: [['Wedding — Nilufar', 200, true, 'done'], ['Eid — cousins', 60, false, 'active']],
  },
  team_kudos: { text: 'Top receiver this week: Sana', primary: 9, rows: [['Sana — caught the billing bug', 1, true, 'done'], ['Omar — covered the on-call swap', 1, true, 'done']] },
  potluck_matrix: {
    text: 'Dessert is still unclaimed',
    rows: [['Plov — you', 1, true, 'done'], ['Salad — Dilnoza', 1, true, 'done'], ['Dessert — nobody', 0, false, 'waiting']],
  },
  star_chart: { text: 'Amir leads with 6 stars', primary: 6, target: 10, rows: [['Amir', 6, false, 'active'], ['Laylo', 4, false, 'waiting']] },
  pet_care: {
    text: 'Milo',
    rows: [['Morning feed', 1, true, 'done'], ['Evening walk', 0, false, 'active'], ['Vet — 12 Sep', 0, false, 'waiting']],
    series: [8.9, 9, 9.1, 9, 9.2, 9.3, 9.2],
  },
  visa_runway: { text: 'Schengen — must exit by 14 Sep', primary: 42, target: 90, series: [12, 18, 24, 30, 34, 38, 42] },
  packing_matrix: {
    text: 'Cabin bag at 17.4 of 23 kg',
    primary: 17.4, target: 23,
    rows: [['Camera kit', 2.4, true, 'done'], ['Boots', 1.6, true, 'done'], ['Gifts', 3.1, false, 'active']],
  },
  jet_lag_shifter: { text: 'Shift 6 h earlier across 5 nights', secondary: 6, date: dayKey(5) },
  currency_pocket: {
    text: 'USD 240 · UZS 1,850,000',
    primary: 240, secondary: 12580,
    rows: [['USD', 240, true, 'done'], ['UZS', 1850000, true, 'done'], ['EUR', 60, false, 'waiting']],
  },
  commission_queue: {
    text: '2 of 4 slots open for September',
    primary: 2, target: 4,
    rows: [['Portrait — Dilnoza', 180, false, 'active'], ['Logo — Metro Cafe', 400, false, 'waiting']],
  },
  content_pipeline: {
    text: '76% of August is already scheduled',
    primary: 76, target: 100,
    rows: [['Newsletter 08', 1, true, 'done'], ['Short — kitchen tour', 0, false, 'active'], ['Long — moving guide', 0, false, 'waiting']],
    series: [30, 41, 52, 58, 65, 71, 76],
  },
}

/**
 * The Atlas envelope filled in for one preset. `tracker` reaches this through
 * the preset it is wearing, so a Tracker skin gets the same content its
 * dedicated card would.
 */
export function atlasSample(preset: string): Patch {
  const sample = ATLAS[preset]
  if (!sample) return {}
  const patch: Patch = {}
  if (sample.text !== undefined) patch.text = sample.text
  if (sample.primary !== undefined) patch.primary = sample.primary
  if (sample.secondary !== undefined) patch.secondary = sample.secondary
  if (sample.target !== undefined) patch.target = sample.target
  if (sample.times !== undefined) patch.times = sample.times
  if (sample.date !== undefined) patch.date = sample.date
  if (sample.timeStart !== undefined) patch.timeStart = sample.timeStart
  if (sample.timeEnd !== undefined) patch.timeEnd = sample.timeEnd
  if (sample.enabled !== undefined) patch.enabled = sample.enabled
  if (sample.rows) {
    patch.items = sample.rows.map(([label, value = 1, done = false, status = 'active', note = ''], index) => ({
      id: sampleId(),
      label,
      value,
      done,
      date: dayKey(-index),
      status,
      note,
    }))
  }
  if (sample.series) {
    const series = sample.series
    patch.history = series.map((v, index) => ({ t: TODAY - (series.length - 1 - index) * DAY, v }))
  }
  patch.actionCount = (sample.rows?.filter((entry) => entry[2] === true).length ?? 0) + 3
  patch.lastActionAt = TODAY - 3 * 60 * 60 * 1000
  return patch
}

// ---------------------------------------------------------------------------
// Automation core family
// ---------------------------------------------------------------------------

interface AutomationSample {
  input: string
  config?: string
  output?: string
  count?: number
  items?: string[]
  running?: boolean
  lastError?: string
}

const AUTOMATION: Partial<Record<string, AutomationSample>> = {
  loop: { input: '["invoice-118","invoice-119","invoice-120"]', output: '3 reminders sent', count: 27, items: ['invoice-118', 'invoice-119', 'invoice-120'] },
  batch_processor: { input: '412 pending rows', output: 'Processed 412 rows in 9 chunks', count: 14 },
  parallel_runner: { input: 'fetch prices · fetch stock · fetch reviews', output: 'All three branches joined in 1.8 s', count: 61 },
  race: { input: 'primary API · mirror API', output: 'mirror API answered first (240 ms)', count: 88 },
  transaction: { input: 'create card · link relation · move to canvas', output: 'Committed 3 mutations', count: 12 },
  subroutine: { input: '{"client":"Metro Cafe","hours":16}', output: '{"quote":980}', count: 43 },
  approval_gate: { input: 'Publish the August newsletter?', output: 'Approved by Sana at 09:12', count: 6 },
  workflow_lock: { input: 'nightly-import', output: 'Held by run #338 until 02:15', count: 338, running: true },
  webhook_receiver: { input: 'POST /hooks/orders', output: '{"order":"A-4471","total":86.4}', count: 1204 },
  manual_trigger: { input: 'Run the weekly digest', output: 'Started at 08:00', count: 19 },
  canvas_lifecycle: { input: 'canvas:opened', output: 'Skin Gallery opened', count: 74 },
  event_merger: { input: 'orders · refunds · chargebacks', output: 'One ordered stream, 1,412 events', count: 1412 },
  data_join: { input: 'customers ⋈ orders on customer_id', output: '318 matched, 4 unmatched', count: 318 },
  object_builder: { input: 'name · email · plan', config: '{"shape":{"name":"$a","email":"$b","plan":"$c"}}', output: '{"name":"Dilnoza","email":"d@example.com","plan":"pro"}', count: 96 },
  event_correlator: { input: 'payment.created · payment.settled', output: 'Correlated 214 pairs, 3 orphans', count: 214 },
  multi_source_aggregator: { input: '4 connected sources', output: 'Collected 61 records', count: 61, items: ['bank feed', 'card feed', 'cash log', 'invoices'] },
  widget_creator: { input: '[{"title":"Follow up with Dana"}]', config: '{"type":"checklist","canvas":"Inbox"}', output: 'Created 1 card', count: 52 },
  widget_updater: { input: 'status = shipped', output: 'Updated 9 cards', count: 9 },
  widget_deleter: { input: 'archived older than 90 days', output: 'Deleted 14 cards', count: 14 },
  branch_builder: { input: '[{"phase":"Research"},{"phase":"Build"}]', config: '{"relation":"parent"}', output: 'Built a 2-level branch', count: 7 },
  relation_builder: { input: 'invoice-118 → client-metro', config: '{"type":"parent"}', output: 'Created 1 relation', count: 31 },
  canvas_router: { input: 'branch: August content', output: 'Moved 6 cards to “Published”', count: 6 },
  clone_branch: { input: 'Trip template', output: 'Cloned 11 cards', count: 4 },
  template_instantiator: { input: 'New client onboarding', config: '{"template":"client-onboarding"}', output: 'Created 8 cards and 7 relations', count: 8 },
  archive_action: { input: 'done in July', output: 'Archived 23 cards', count: 23 },
  auto_layout_action: { input: 'branch: invoices', output: 'Arranged 12 cards', count: 12 },
  focus_action: { input: 'invoice-118', config: '{"zoom":1.2,"highlight":true}', output: 'Framed invoice-118', count: 40 },
  variable_store: { input: 'monthly_target', output: '2400', count: 5, items: ['monthly_target = 2400'] },
  key_value_store: { input: 'rate:USD-UZS', output: '12580', count: 220, items: ['rate:USD-UZS = 12580', 'rate:EUR-UZS = 13640'] },
  queue: { input: 'invoice-121', output: 'Released invoice-118', count: 47, items: ['invoice-119', 'invoice-120', 'invoice-121'] },
  stack_store: { input: 'edit: renamed “Draft”', output: 'Popped “moved card”', count: 33, items: ['renamed “Draft”', 'moved card', 'resized chart'] },
  set_store: { input: 'metro-cafe', output: 'Already a member', count: 118, items: ['metro-cafe', 'nova-studio', 'bright-lab'] },
  state_machine: { input: 'event: ship', output: 'packed → shipped', count: 74, items: ['draft', 'packed', 'shipped', 'delivered'] },
  idempotency_store: { input: 'evt_7f31c9', output: 'Duplicate — skipped', count: 892, items: ['evt_7f31c9', 'evt_7f31c8'] },
  session_store: { input: 'draft answer', output: 'Held until the tab closes', count: 3 },
  mutex: { input: 'export-ledger', output: 'Held by “monthly export” since 09:04', count: 11, running: true },
  script_block: { input: '{"hours":16,"rate":45}', config: 'return { quote: input.hours * input.rate * 1.15 }', output: '{"quote":828}', count: 158 },
  local_function: { input: '{"amount":980,"currency":"USD"}', config: 'export const format = ({ amount, currency }) =>\n  new Intl.NumberFormat("en", { style: "currency", currency }).format(amount)', output: '"$980.00"', count: 640 },
  http_request: { input: '{"base":"USD","symbols":"UZS"}', config: '{"method":"GET","url":"https://api.example.com/rates","timeoutMs":5000}', output: '{"UZS":12580}', count: 2410 },
  webhook_sender: { input: '{"event":"invoice.paid","id":"A-4471"}', config: '{"url":"https://hooks.example.com/grovepad","retries":3}', output: '202 Accepted', count: 733 },
  secret_reference: { input: 'BILLING_API_KEY', output: 'Resolved — the value never leaves the vault', count: 2410 },
  environment_config: { input: 'environment: production', output: '{"region":"eu-central","tier":"pro"}', count: 1 },
  automation_console: { input: 'last 24 hours', output: '318 runs · 4 failures · p95 1.4 s', count: 318 },
  test_data_generator: { input: '12 invoices', config: '{"seed":"skin-gallery","shape":"invoice"}', output: 'Generated 12 rows', count: 12 },
  automation_recorder: { input: 'recording: “file a receipt”', output: 'Captured 7 steps', count: 7, items: ['create card', 'set amount', 'attach photo'] },
  workflow_test_suite: { input: '9 saved cases', output: '8 passed · 1 failed', count: 9, lastError: 'Case “refund path”: expected “refunded”, got “settled”' },
  failure_inbox: { input: 'uncaught failures', output: '3 open · oldest 2 days', count: 3, lastError: 'HTTP Request timed out after 5,000 ms' },
  run_ledger: { input: 'August', output: '1,204 recorded actions', count: 1204, items: ['09:12 approved newsletter', '08:00 nightly import', '02:15 lock released'] },
}

export function automationSample(type: string): Patch {
  const sample = AUTOMATION[type]
  if (!sample) return {}
  return {
    input: sample.input,
    ...(sample.config !== undefined ? { config: sample.config } : {}),
    output: sample.output ?? '',
    count: sample.count ?? 0,
    running: sample.running ?? false,
    lastError: sample.lastError ?? '',
    lastRunAt: TODAY - 42 * 60 * 1000,
    items: (sample.items ?? []).map((label) => ({ id: sampleId(), label, value: 1, done: false, date: dayKey(), status: 'active', note: '' })),
  }
}

// ---------------------------------------------------------------------------
// Everything else — one hand-authored patch per type
// ---------------------------------------------------------------------------

const row = (fields: Patch): Patch => ({ id: sampleId(), ...fields })

export const BESPOKE_SAMPLES: Partial<Record<ModuleType, () => Patch>> = {
  text: () => ({
    text: 'The gallery is the fastest way to see what a widget can look like.\n\nEvery card here is a real widget wearing a real skin, filled with real values — nothing is a screenshot.',
    color: 'yellow',
  }),
  bullets: () => ({
    items: [
      row({ text: 'One widget, many shapes' }),
      row({ text: 'A skin changes the tile, never the data' }),
      row({ text: 'The resting face is what the board shows at a glance' }),
      row({ text: 'Pinned means the card stays open' }),
    ],
  }),
  code: () => ({
    language: 'ts',
    code: "export function restingFace(widget: Widget): RestingFace {\n  const model = summarise(widget)\n  if (model.kind === 'icon') return iconFace(widget)\n  return tileFace(model)\n}",
  }),
  checklist: () => ({
    items: [
      row({ label: 'Draft the August newsletter', done: true, status: 'done', due: dayKey(-1), day: 0, time: '09:00', start: 0, span: 2, quadrant: 0 }),
      row({ label: 'Review the pricing page copy', done: false, status: 'doing', due: dayKey(1), day: 1, time: '11:00', start: 2, span: 1, quadrant: 1 }),
      row({ label: 'Send the Metro Cafe quote', done: false, status: 'todo', due: dayKey(2), day: 2, time: '14:30', start: 3, span: 2, quadrant: 0 }),
      row({ label: 'Book the dentist', done: false, status: 'todo', due: dayKey(5), day: 4, time: '16:00', start: 5, span: 1, quadrant: 3 }),
      row({ label: 'Archive last quarter’s boards', done: false, status: 'blocked', due: dayKey(9), day: 5, time: '10:00', start: 6, span: 3, quadrant: 2 }),
    ],
  }),
  kanban: () => ({
    columns: [
      row({ label: 'To do', cards: [row({ label: 'Pricing page copy' }), row({ label: 'Metro Cafe quote' })] }),
      row({ label: 'Doing', cards: [row({ label: 'August newsletter' })] }),
      row({ label: 'Done', cards: [row({ label: 'Client onboarding template' })] }),
    ],
  }),
  timeline: () => ({
    totalUnits: 12,
    phases: [
      row({ label: 'Research', start: 0, span: 3 }),
      row({ label: 'Build', start: 3, span: 6 }),
      row({ label: 'Launch', start: 9, span: 3 }),
    ],
  }),
  pros_cons: () => ({
    topic: 'Move the studio to the riverside unit',
    pros: [row({ text: 'Twice the daylight' }), row({ text: 'Ten minutes closer to most clients' }), row({ text: 'Room for a second desk' })],
    cons: [row({ text: '$340 more every month' }), row({ text: 'No loading bay' }), row({ text: 'Six-month lock-in' })],
  }),
  weekly_planner: () => ({
    days: [
      ['Newsletter draft', 'Walk 18:00'],
      ['Client call 11:00', 'Pricing copy'],
      ['Metro Cafe quote'],
      ['Deep work — layout engine'],
      ['Invoices', 'Dentist 16:00'],
      ['Groceries'],
      ['Weekly review'],
    ],
  }),
  priority_matrix: () => ({
    items: [
      row({ label: 'Fix the billing bug', quadrant: 0 }),
      row({ label: 'Rewrite the onboarding email', quadrant: 1 }),
      row({ label: 'Answer the vendor survey', quadrant: 2 }),
      row({ label: 'Reorganise the asset folder', quadrant: 3 }),
    ],
  }),
  decision: () => ({
    question: 'Which city for the September trip?',
    options: ['Istanbul', 'Almaty', 'Tbilisi'],
    pickedIndex: 1,
    weights: [3, 4, 2],
    history: [0, 1, 1],
    noRepeatWindow: 2,
  }),
  meeting_notes: () => ({
    date: dayKey(),
    attendees: 'Sana, Omar, Dana, you',
    notes: 'Agreed to ship the pricing page before the newsletter goes out. Dana will confirm the invoice batch by Thursday.',
    actions: [
      row({ text: 'Sana — final copy pass', done: true }),
      row({ text: 'Omar — staging deploy', done: false }),
      row({ text: 'Dana — confirm the invoice batch', done: false }),
    ],
  }),
  flashcards: () => ({
    cards: [
      row({ front: 'What does a resting face show?', back: 'The card’s content summarised into a tile you can read at board zoom.' }),
      row({ front: 'What does pinning do?', back: 'Holds the card open instead of letting it fall back to its resting tile.' }),
      row({ front: 'What is a skin?', back: 'An alternate shape for the same widget and the same data.' }),
    ],
    current: 1,
    vocabulary: {
      terms: [
        row({ term: 'resting face', definition: 'The summary tile a card wears when it is not open', known: true }),
        row({ term: 'glue', definition: 'A welded cluster of cards that move together', known: false }),
      ],
    },
    quiz: {
      prompt: 'Which of these changes the stored data?',
      options: [row({ text: 'Switching skins', correct: false }), row({ text: 'Editing a field', correct: true })],
      picked: 1,
    },
  }),
  goal_tracker: () => ({
    goal: 'Ship Grovepad 1.0',
    milestones: [
      row({ label: 'Skin catalogue complete', done: true }),
      row({ label: 'Circuit engine stable', done: true }),
      row({ label: 'Mobile pass', done: false }),
      row({ label: 'Launch video', done: false }),
    ],
    simple: { label: 'Toward launch', percent: 62 },
    hours: { subject: 'Layout engine', targetHours: 40, loggedHours: 26 },
    okr: {
      objective: 'Make the first board feel effortless',
      keyResults: [
        row({ label: 'Time to first useful card', current: 38, target: 30, weight: 2 }),
        row({ label: 'Boards kept after a week', current: 61, target: 75, weight: 1 }),
      ],
    },
  }),
  stopwatch: () => ({ elapsedMs: 1_284_000, laps: [412_000, 396_000, 476_000] }),
  reading_list: () => ({
    title: 'August reading',
    items: [
      row({ title: 'The Design of Everyday Things', status: 'done' }),
      row({ title: 'Thinking in Systems', status: 'reading' }),
      row({ title: 'A Pattern Language', status: 'queued' }),
    ],
  }),
  world_clock: () => ({ zones: ['Asia/Tashkent', 'Europe/Berlin', 'America/New_York', 'Asia/Tokyo'] }),
  pomodoro: () => ({ label: 'Layout engine', workMinutes: 25, breakMinutes: 5, phase: 'work', remainingSeconds: 940, completed: 3 }),
  vocab: () => ({
    terms: [
      row({ term: 'qadam', definition: 'step', known: true }),
      row({ term: 'daftar', definition: 'notebook', known: true }),
      row({ term: 'oyna', definition: 'window, or mirror', known: false }),
    ],
  }),
  grade_calc: () => ({
    components: [
      row({ name: 'Final exam', score: 78, weight: 40 }),
      row({ name: 'Midterm', score: 84, weight: 25 }),
      row({ name: 'Coursework', score: 91, weight: 25 }),
      row({ name: 'Participation', score: 95, weight: 10 }),
    ],
    gpa: {
      courses: [
        row({ name: 'Linear Algebra', credits: 4, points: 3.7 }),
        row({ name: 'Thermodynamics', credits: 3, points: 3 }),
        row({ name: 'Technical Writing', credits: 2, points: 4 }),
      ],
    },
  }),
  gpa: () => ({
    courses: [
      row({ name: 'Linear Algebra', credits: 4, points: 3.7 }),
      row({ name: 'Thermodynamics', credits: 3, points: 3 }),
      row({ name: 'Technical Writing', credits: 2, points: 4 }),
    ],
  }),
  assignment: () => ({
    items: [
      row({ title: 'Problem set 6', due: dayKey(2), status: 'todo' }),
      row({ title: 'Lab report — heat exchange', due: dayKey(5), status: 'doing' }),
      row({ title: 'Essay draft', due: dayKey(-2), status: 'done' }),
    ],
  }),
  // Stable ids, because three of this card's skins keep material *about* a
  // formula and have to be able to name the one they mean.
  formula_sheet: () => ({
    formulas: [
      { id: 'gas', name: 'Ideal gas law', expression: 'pV = nRT' },
      { id: 'interest', name: 'Compound interest', expression: 'A = P(1 + r/n)^(nt)' },
      { id: 'fuel', name: 'Fuel efficiency', expression: 'L = litres ÷ km × 100' },
    ],
  }),
  citation: () => ({
    style: 'APA',
    sources: [
      row({ title: 'The Design of Everyday Things', author: 'Norman, D.', year: '2013' }),
      row({ title: 'Thinking in Systems', author: 'Meadows, D.', year: '2008' }),
      row({ title: 'A Pattern Language', author: 'Alexander, C.', year: '1977' }),
    ],
  }),
  study_goal: () => ({ subject: 'Thermodynamics', targetHours: 40, loggedHours: 26 }),
  quiz: () => ({
    prompt: 'Which unit does the fuel log report?',
    options: [row({ text: 'L per 100 km', correct: true }), row({ text: 'km per hour', correct: false }), row({ text: 'kWh per day', correct: false })],
    picked: 0,
  }),
  calendar: () => ({ year: 2026, month: 7, markedDates: [dayKey(1), dayKey(3), dayKey(4), dayKey(9), dayKey(14)] }),
  countdown: () => ({ label: 'Launch day', targetDate: dayKey(14) }),
  progress: () => ({ label: 'Toward launch', percent: 62 }),
  poll: () => ({
    question: 'Where should the September offsite be?',
    options: [
      row({ label: 'Riverside cabin', votes: 9 }),
      row({ label: 'City studio', votes: 4 }),
      row({ label: 'Mountain lodge', votes: 12 }),
    ],
  }),
  rating: () => ({ label: 'How did the launch review land?', value: 4 }),
  calculator: () => ({ expression: '16 * 45 * 1.15', result: '828' }),
  bar_chart: () => ({
    title: 'Invoices paid by month',
    unit: 'k',
    bars: [
      row({ label: 'Apr', value: 4.2, color: '#38bdf8' }),
      row({ label: 'May', value: 5.6, color: '#a3e635' }),
      row({ label: 'Jun', value: 5.1, color: '#fbbf24' }),
      row({ label: 'Jul', value: 7.4, color: '#f472b6' }),
      row({ label: 'Aug', value: 6.8, color: '#c084fc' }),
    ],
  }),
  table: () => ({
    rows: [
      ['Client', 'Owner', 'Stage', 'Value'],
      ['Metro Cafe', 'Sana', 'Quoted', '$980'],
      ['Nova Studio', 'Omar', 'In build', '$4,200'],
      ['Bright Lab', 'Dana', 'Invoiced', '$1,750'],
      ['Riverside Co', 'Sana', 'Lead', '$600'],
    ],
  }),
  budget: () => ({
    currency: '$',
    items: [
      row({ label: 'Rent', amount: 900 }),
      row({ label: 'Groceries', amount: 420 }),
      row({ label: 'Transport', amount: 120 }),
      row({ label: 'Studio hosting', amount: 27 }),
      row({ label: 'Savings', amount: 300 }),
    ],
  }),
  metrics: () => ({
    tiles: [
      row({ label: 'Active boards', value: '1,284', unit: '', trend: 'up' }),
      row({ label: 'Revenue', value: '6.8', unit: 'k', trend: 'up' }),
      row({ label: 'Churn', value: '2.1', unit: '%', trend: 'down' }),
      row({ label: 'p95 load', value: '1.4', unit: 's', trend: 'flat' }),
    ],
  }),
  timer: () => ({ label: 'Tea', durationSeconds: 300, remainingSeconds: 138 }),
  timekeeper: () => ({
    countdown: { label: 'Tea', durationSeconds: 300, remainingSeconds: 138, endAt: null },
    pomodoro: { label: 'Layout engine', workMinutes: 25, breakMinutes: 5, phase: 'work', endAt: null, remainingSeconds: 940, completed: 3 },
    stopwatch: { elapsedMs: 1_284_000, startedAt: null, laps: [412_000, 396_000, 476_000] },
    deadline: { label: 'Launch day', targetDate: dayKey(14) },
    worldClock: { zones: ['Asia/Tashkent', 'Europe/Berlin', 'America/New_York'] },
  }),
  mood_tracker: () => ({ days: [4, 3, 5, 2, 4, 5, 4] }),
  counter: () => ({ label: 'Cups of tea', count: 4, step: 1 }),
  links: () => ({
    items: [
      row({ label: 'Widget constitution', url: 'https://example.com/widget-constitution' }),
      row({ label: 'Glass material notes', url: 'https://example.com/glass' }),
      row({ label: 'Launch checklist', url: 'https://example.com/launch' }),
    ],
  }),
  habit: () => ({ label: 'Morning walk', days: [true, true, false, true, true, true, false], streak: 3 }),
  contact: () => ({ name: 'Dana Karimova', role: 'Accounts, Metro Cafe', email: 'dana@example.com', phone: '+998 90 123 45 67' }),
  color_palette: () => ({ colors: ['#0f172a', '#38bdf8', '#a3e635', '#fbbf24', '#f472b6'] }),
  media: () => ({
    url:
      'data:image/svg+xml;utf8,' +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#38bdf8"/><stop offset="1" stop-color="#a3e635"/></linearGradient></defs><rect width="320" height="200" fill="url(#g)"/><circle cx="228" cy="58" r="30" fill="#ffffff" opacity=".85"/><path d="M0 168 L92 96 L158 146 L226 104 L320 170 L320 200 L0 200 Z" fill="#0f172a" opacity=".55"/></svg>',
      ),
    caption: 'Riverside unit, seen from the north window',
  }),
  sketchpad: () => ({ height: 240 }),
  dialog: () => ({
    lines: [
      row({ character: 'DANA', cue: 'The invoice batch is ready — do you want it out today?' }),
      row({ character: 'YOU', cue: 'Hold it until the pricing page ships.' }),
      row({ character: 'DANA', cue: 'Thursday, then. I will queue it.' }),
    ],
  }),
  ai_generator: () => ({ prompt: 'Rewrite the launch email so the first line says what changed, in plain language.', status: 'idle' }),
  text_input: () => ({ label: 'Client name', value: 'Metro Cafe', placeholder: 'Who is this for?', multiline: false }),
  number_input: () => ({ label: 'Hourly rate', value: 45, min: 0, max: 200, step: 5 }),
  toggle: () => ({ label: 'Invoice approved', value: true }),
  branch_gate: () => ({ value: true, trueLabel: 'Send', falseLabel: 'Hold', trueNote: 'Approved and inside terms', falseNote: 'Wait for Dana’s confirmation' }),
  formula: () => ({ label: 'Quote with risk', a: 720, b: 1.15, operator: 'multiply' }),
  status: () => ({ label: 'Pricing page', value: 'in_progress' }),
  date_picker: () => ({ label: 'Quote expires', date: dayKey(14), time: '17:00', includeTime: true }),
  outline: () => ({
    items: [
      row({ text: 'Launch plan', depth: 0, collapsed: false }),
      row({ text: 'Pricing page', depth: 1, collapsed: false }),
      row({ text: 'Copy pass', depth: 2, collapsed: false }),
      row({ text: 'Newsletter', depth: 1, collapsed: false }),
      row({ text: 'Launch video', depth: 1, collapsed: false }),
    ],
  }),
  form: () => ({
    title: 'New client intake',
    fields: [
      row({ label: 'Client name', type: 'text', value: 'Metro Cafe', required: true }),
      row({ label: 'Contact email', type: 'email', value: 'dana@example.com', required: true }),
      row({ label: 'Budget', type: 'number', value: 980, required: false }),
      row({ label: 'Needs it by', type: 'date', value: dayKey(21), required: false }),
    ],
  }),
  daily_agenda: () => ({
    date: dayKey(),
    items: [
      row({ time: '09:00', title: 'Newsletter draft', done: true }),
      row({ time: '11:00', title: 'Call with Metro Cafe', done: true }),
      row({ time: '14:30', title: 'Pricing page copy', done: false }),
      row({ time: '18:00', title: 'Walk', done: false }),
    ],
  }),
  process: () => ({
    steps: [
      row({ label: 'Confirm the brief in writing', status: 'done' }),
      row({ label: 'Measure the site', status: 'done' }),
      row({ label: 'Send the quote', status: 'active' }),
      row({ label: 'Collect the deposit', status: 'pending' }),
      row({ label: 'Schedule the work', status: 'pending' }),
    ],
  }),
  risk_register: () => ({
    items: [
      row({ risk: 'Supplier misses the September window', likelihood: 3, impact: 4, mitigation: 'Second supplier quoted and on standby', status: 'open' }),
      row({ risk: 'Pricing page slips past launch', likelihood: 2, impact: 3, mitigation: 'Copy frozen on Thursday', status: 'open' }),
      row({ risk: 'Invoice batch bounces', likelihood: 1, impact: 4, mitigation: 'Dana reconciles before sending', status: 'closed' }),
    ],
  }),
  decision_matrix: () => ({
    criteria: [row({ label: 'Daylight', weight: 3 }), row({ label: 'Cost', weight: 2 }), row({ label: 'Access', weight: 1 })],
    options: [
      row({ label: 'Riverside unit', scores: [5, 2, 3] }),
      row({ label: 'City studio', scores: [3, 4, 5] }),
      row({ label: 'Stay put', scores: [2, 5, 4] }),
    ],
  }),
  swot: () => ({
    strengths: ['Repeat clients', 'Fast turnaround', 'We own the tooling'],
    weaknesses: ['One person deep', 'No sales pipeline'],
    opportunities: ['Studio rentals nearby', 'Referrals from Metro Cafe'],
    threats: ['Rent rising', 'Two new competitors'],
  }),
  timesheet: () => ({
    currency: '$',
    hourlyRate: 45,
    entries: [
      row({ date: dayKey(-2), label: 'Metro Cafe — measure', hours: 3, billable: true }),
      row({ date: dayKey(-1), label: 'Metro Cafe — quote', hours: 2.5, billable: true }),
      row({ date: dayKey(), label: 'Admin and invoicing', hours: 1, billable: false }),
    ],
  }),
  inventory: () => ({
    items: [
      row({ name: 'Cable, 2.5 mm', quantity: 40, minimum: 25, unit: 'm' }),
      row({ name: 'Wall sockets', quantity: 6, minimum: 10, unit: 'pcs' }),
      row({ name: 'Junction boxes', quantity: 18, minimum: 8, unit: 'pcs' }),
    ],
  }),
  logbook: () => ({
    entries: [
      row({ timestamp: stamp(-2), text: 'Site measured — 16 sockets, two circuits', level: 'note' }),
      row({ timestamp: stamp(-1), text: 'Quote sent to Dana', level: 'note' }),
      row({ timestamp: stamp(0), text: 'Supplier confirmed the September window', level: 'warn' }),
    ],
  }),
  line_chart: () => ({
    title: 'Weekly hours logged',
    unit: 'h',
    points: [row({ label: 'W27', value: 22 }), row({ label: 'W28', value: 26 }), row({ label: 'W29', value: 31 }), row({ label: 'W30', value: 28 }), row({ label: 'W31', value: 34 })],
  }),
  pie_chart: () => ({
    title: 'Where the month went',
    segments: [
      row({ label: 'Client work', value: 58, color: '#38bdf8' }),
      row({ label: 'Admin', value: 17, color: '#a3e635' }),
      row({ label: 'Learning', value: 15, color: '#fbbf24' }),
      row({ label: 'Rest', value: 10, color: '#f472b6' }),
    ],
  }),
  unit_converter: () => ({ category: 'length', value: 16, from: 'm', to: 'ft', precision: 2 }),
  game_tuner: () => ({ grip: 68, drift: 34, stability: 72 }),
  audio_player: () => ({ bpm: 96, key: 'D Minor', signalChain: 'Tape → Chorus → Plate Reverb', isPlaying: false }),
  clock_pulse: () => ({ label: 'Nightly import', time: '02:00', days: [1, 2, 3, 4, 5], intervalMinutes: 30, windowStart: '09:00', windowEnd: '18:00', lastFiredAt: TODAY - 9 * 60 * 60 * 1000 }),
  comparator: () => ({ label: 'Stock below the reorder point', op: 'lt', a: 6, b: 10, low: 0, high: 40 }),
  aggregator: () => ({ label: 'Team hours this week', mode: 'sum', slots: [8, 6.5, 7, 5, 8, 0, 0] }),
  range_mapper: () => ({
    label: 'Invoice age',
    input: 34,
    bands: [
      row({ upTo: 14, label: 'Fresh', emoji: '🟢' }),
      row({ upTo: 30, label: 'Chasing', emoji: '🟡' }),
      row({ upTo: Number.MAX_SAFE_INTEGER, label: 'Overdue', emoji: '🔴' }),
    ],
  }),
  latch: () => ({ label: 'Best month so far', current: 6.8, held: 7.4, heldAt: TODAY - 34 * DAY }),
  random_picker: () => ({
    label: 'Who runs the demo?',
    options: [row({ text: 'Sana', weight: 1 }), row({ text: 'Omar', weight: 1 }), row({ text: 'Dana', weight: 2 })],
    pick: 'Dana',
    history: ['Omar', 'Dana'],
    noRepeatWindow: 1,
  }),
  sequencer: () => ({
    label: 'Client onboarding',
    steps: [row({ text: 'Signed brief' }), row({ text: 'Deposit received' }), row({ text: 'Kickoff call' }), row({ text: 'First draft' })],
    activeIndex: 2,
    loop: false,
  }),
  template: () => ({
    template: 'Hi {a}, your quote of {b} is ready and holds until {c}.',
    slotA: 'Dana',
    slotB: '$980',
    slotC: dayKey(14),
    slotD: 'Metro Cafe',
  }),
  recorder: () => ({
    label: 'Daily hours',
    input: 7,
    mode: 'daily',
    samples: [6, 8, 7.5, 5, 8, 2, 7].map((v, index) => ({ t: TODAY - (6 - index) * DAY, v })),
    lastRecordedAt: TODAY,
  }),
  notifier: () => ({
    label: 'Invoice chase',
    message: 'Bright Lab is 34 days overdue — send the second reminder',
    channel: 'toast',
    cooldownMinutes: 1440,
    armed: true,
    fireCount: 2,
    lastFiredAt: TODAY - 2 * DAY,
  }),
  location: () => ({
    label: 'Riverside unit',
    address: '14 Navoi Street, Tashkent',
    latitude: 41.3111,
    longitude: 69.2797,
    timezone: 'Asia/Tashkent',
    accuracyMeters: 12,
    capturedAt: TODAY - 3 * DAY,
  }),
  subscriptions: () => ({
    rows: [
      row({ name: 'Design tooling', cost: 22, cycle: 'monthly', renewsOn: dayKey(6), active: true }),
      row({ name: 'Cloud hosting', cost: 27, cycle: 'monthly', renewsOn: dayKey(11), active: true }),
      row({ name: 'Stock photos', cost: 180, cycle: 'yearly', renewsOn: dayKey(78), active: false }),
    ],
  }),
  debt_payoff: () => ({
    debts: [
      row({ name: 'Credit card', balance: 2450, apr: 19.9, minPayment: 75 }),
      row({ name: 'Studio loan', balance: 6100, apr: 8.4, minPayment: 190 }),
    ],
    extraPayment: 150,
    strategy: 'avalanche',
  }),
  expense_split: () => ({
    people: ['You', 'Sana', 'Omar'],
    you: 'You',
    expenses: [
      row({ desc: 'Cabin for the offsite', amount: 420, paidBy: 'You', splitAmong: ['You', 'Sana', 'Omar'] }),
      row({ desc: 'Groceries', amount: 96, paidBy: 'Sana', splitAmong: ['You', 'Sana', 'Omar'] }),
      row({ desc: 'Fuel', amount: 60, paidBy: 'Omar', splitAmong: ['You', 'Omar'] }),
    ],
  }),
  invoices: () => ({
    rows: [
      row({ client: 'Metro Cafe', amount: 980, issued: dayKey(-2), due: dayKey(12), status: 'sent' }),
      row({ client: 'Nova Studio', amount: 4200, issued: dayKey(-20), due: dayKey(-6), status: 'overdue' }),
      row({ client: 'Bright Lab', amount: 1750, issued: dayKey(-40), due: dayKey(-26), status: 'paid' }),
    ],
  }),
  meal_planner: () => {
    const dishes = [
      ['Porridge', 'Lentil soup', 'Plov'],
      ['Eggs on toast', 'Leftover plov', 'Grilled fish'],
      ['Yoghurt and fruit', 'Chicken salad', 'Pasta'],
      ['Porridge', 'Soup and bread', 'Stir fry'],
      ['Omelette', 'Sandwiches', 'Pizza night'],
      ['Pancakes', 'Manti', 'Barbecue'],
      ['Late breakfast', 'Family lunch', 'Soup'],
    ]
    const meals = ['breakfast', 'lunch', 'dinner']
    return {
      week: dishes.flatMap((day, dayIndex) => day.map((dish, mealIndex) => row({ day: dayIndex, meal: meals[mealIndex], dish }))),
      shoppingList: 'Rice, carrots, lamb, lentils, eggs, yoghurt, flour, tomatoes',
    }
  },
  recipe: () => ({
    title: 'Plov for six',
    servings: 6,
    baseServings: 2,
    cookMinutes: 75,
    ingredients: [
      row({ qty: 600, unit: 'g', item: 'Lamb shoulder' }),
      row({ qty: 500, unit: 'g', item: 'Devzira rice' }),
      row({ qty: 400, unit: 'g', item: 'Carrots, julienned' }),
      row({ qty: 2, unit: 'heads', item: 'Garlic' }),
    ],
    steps: [
      row({ text: 'Render the fat and brown the lamb', done: true }),
      row({ text: 'Add onion, then carrots, without stirring too much', done: true }),
      row({ text: 'Layer the rinsed rice and pour boiling water over a spoon', done: false }),
      row({ text: 'Bury the garlic, cover, and rest 20 minutes off the heat', done: false }),
    ],
  }),
  home_maintenance: () => ({
    rows: [
      row({ task: 'Replace the water filter', everyMonths: 3, lastDone: dayKey(-84) }),
      row({ task: 'Service the boiler', everyMonths: 12, lastDone: dayKey(-300) }),
      row({ task: 'Clear the gutters', everyMonths: 6, lastDone: dayKey(-40) }),
    ],
  }),
  chore_rotation: () => ({ people: ['You', 'Sana', 'Omar'], chores: ['Kitchen', 'Bathroom', 'Bins'], offset: 1, cadenceLabel: 'Weekly' }),
  renewals_vault: () => ({
    rows: [
      row({ item: 'Passport', expires: dayKey(180), noteRef: 'Top drawer, blue folder', renewLeadDays: 90 }),
      row({ item: 'Driving licence', expires: dayKey(52), noteRef: 'Wallet', renewLeadDays: 30 }),
      row({ item: 'Studio insurance', expires: dayKey(21), noteRef: 'Email from 12 Feb', renewLeadDays: 30 }),
    ],
  }),
  medications: () => ({
    rows: [
      row({ name: 'Vitamin D', timesPerDay: 1, takenToday: [true], pillsLeft: 22, dailyUse: 1 }),
      row({ name: 'Iron', timesPerDay: 2, takenToday: [true, false], pillsLeft: 9, dailyUse: 2 }),
    ],
  }),
  workout_plan: () => ({
    days: [
      row({
        label: 'Push',
        exercises: [
          row({ name: 'Bench press', sets: 4, reps: 6, weight: 62.5, done: true }),
          row({ name: 'Overhead press', sets: 3, reps: 8, weight: 35, done: true }),
          row({ name: 'Dips', sets: 3, reps: 10, weight: 0, done: false }),
        ],
      }),
      row({
        label: 'Pull',
        exercises: [
          row({ name: 'Deadlift', sets: 3, reps: 5, weight: 100, done: false }),
          row({ name: 'Rows', sets: 4, reps: 8, weight: 45, done: false }),
        ],
      }),
    ],
    activeDay: 0,
    lastSession: dayKey(-2),
  }),
  job_applications: () => ({
    rows: [
      row({ company: 'Nova Studio', role: 'Design engineer', stage: 'interview', applied: dayKey(-18), nextAction: 'Prepare the portfolio walkthrough', followUpBy: dayKey(2) }),
      row({ company: 'Bright Lab', role: 'Frontend', stage: 'applied', applied: dayKey(-6), nextAction: 'Follow up with the recruiter', followUpBy: dayKey(1) }),
      row({ company: 'Metro Systems', role: 'Product engineer', stage: 'offer', applied: dayKey(-40), nextAction: 'Compare the offer against Nova', followUpBy: dayKey(4) }),
    ],
  }),
  okr: () => ({
    objective: 'Make the first board feel effortless',
    keyResults: [
      row({ label: 'Time to first useful card', current: 38, target: 30, weight: 2 }),
      row({ label: 'Boards kept after a week', current: 61, target: 75, weight: 1 }),
      row({ label: 'Support questions per 100 boards', current: 14, target: 6, weight: 1 }),
    ],
  }),
  decision_journal: () => ({
    entries: [
      row({ decision: 'Take the riverside unit', context: 'Rent is $340 higher but daylight doubles and most clients are closer.', expected: 'More studio hours and fewer site trips', confidence: 70, decidedOn: dayKey(-30), reviewOn: dayKey(60) }),
      row({ decision: 'Freeze the pricing copy on Thursday', context: 'The newsletter cannot go out before the page is live.', expected: 'Launch stays on the 18th', confidence: 85, decidedOn: dayKey(-3), reviewOn: dayKey(14) }),
    ],
  }),
  weekly_review: () => ({
    prompts: [
      row({ q: 'What went well?', answer: 'The Metro Cafe quote went out a day early and the supplier confirmed September.' }),
      row({ q: 'What should change?', answer: 'Admin keeps eating Friday. Block it to one hour on Wednesday instead.' }),
      row({ q: 'What carries forward?', answer: 'Pricing page copy, and chasing the Nova Studio invoice.' }),
    ],
    weekOf: dayKey(-4),
    historyCount: 26,
    streak: 6,
    completedThisWeek: true,
  }),
  snippet_library: () => ({
    entries: [
      row({ title: 'Quote follow-up', body: 'Hi {name}, just checking the quote landed — happy to walk through it whenever suits.', tags: ['email', 'sales'], useCount: 22 }),
      row({ title: 'Overdue nudge', body: 'Hi {name}, invoice {number} is now {days} days past due. Could you confirm the payment date?', tags: ['email', 'billing'], useCount: 9 }),
      row({ title: 'Kickoff checklist', body: 'Brief signed · deposit received · access confirmed · dates agreed', tags: ['process'], useCount: 14 }),
    ],
  }),
  keep_in_touch: () => ({
    rows: [
      row({ name: 'Nadia', cadenceDays: 14, lastContact: dayKey(-19), note: 'Send the recipe she asked about' }),
      row({ name: 'Rustam', cadenceDays: 30, lastContact: dayKey(-12), note: 'New job at Nova' }),
      row({ name: 'Aunt Zulfiya', cadenceDays: 21, lastContact: dayKey(-40), note: 'Call, not text' }),
    ],
  }),
  gifts_occasions: () => ({
    rows: [
      row({ person: 'Nilufar', date: dayKey(16), ideas: 'Ceramic mug set, or the book she mentioned', budget: 60, bought: false }),
      row({ person: 'Dad', date: dayKey(42), ideas: 'Good secateurs', budget: 45, bought: true }),
      row({ person: 'Sana', date: dayKey(88), ideas: 'Coffee subscription', budget: 50, bought: false }),
    ],
  }),
  trip_itinerary: () => ({
    tripName: 'Almaty, five days',
    startDate: dayKey(30),
    days: [
      row({
        date: dayKey(30),
        legs: [
          row({ time: '07:40', what: 'Flight HY601', where: 'Tashkent → Almaty', confirmation: 'HY-4471', booked: true }),
          row({ time: '11:00', what: 'Check in', where: 'Hotel Kazzhol', confirmation: 'KZ-88213', booked: true }),
          row({ time: '19:00', what: 'Dinner with Rustam', where: 'Near the Green Bazaar', confirmation: '', booked: false }),
        ],
      }),
      row({
        date: dayKey(31),
        legs: [
          row({ time: '09:30', what: 'Shymbulak cable car', where: 'Medeu', confirmation: '', booked: false }),
          row({ time: '18:00', what: 'Client visit', where: 'Nova Studio office', confirmation: '', booked: true }),
        ],
      }),
    ],
  }),
  guest_list: () => ({
    rows: [
      row({ name: 'Sana and Omar', status: 'accepted', plusOnes: 1, dietary: 'No pork' }),
      row({ name: 'Dana', status: 'invited', plusOnes: 0, dietary: '' }),
      row({ name: 'Nilufar', status: 'accepted', plusOnes: 2, dietary: 'Vegetarian' }),
      row({ name: 'Rustam', status: 'declined', plusOnes: 0, dietary: '' }),
    ],
  }),
}

// ---------------------------------------------------------------------------
// Skin-specific touches
//
// Most skins re-present the same content, so the type-level sample is enough.
// These are the handful where the skin is genuinely about a different slice of
// the data and the card would otherwise read as generic. Keyed `type:skin`.
// ---------------------------------------------------------------------------

export const SKIN_OVERRIDES: Record<string, Patch> = {
  // The Map skin's own state is the framing it was left at; a building-level
  // frame is what a saved doorway actually looks like.
  'location:map': { skinStates: { map: { zoom: 17 } } },
  'text:typewriter': { text: 'The riverside unit has twice the daylight and no loading bay. Both are true at once, which is the whole problem.' },
  'code:terminal': { language: 'bash', code: '$ npm run check\n\n  ✓ typecheck\n  ✓ lint\n  ✓ 412 tests\n  ✓ docs\n' },
  'code:config': { language: 'json', code: '{\n  "workspace": "Skin Gallery",\n  "canvases": 205,\n  "cardsPerSkin": 2\n}' },
  'unit_converter:cooking': { category: 'volume', value: 2, from: 'cup', to: 'ml', precision: 0 },
  'unit_converter:temperature': { category: 'temperature', value: 180, from: 'C', to: 'F', precision: 0 },
  'unit_converter:data': { category: 'data', value: 4.7, from: 'GB', to: 'MB', precision: 0 },
  // The three Formula Sheet skins that keep material of their own. Without
  // this the gallery would show their shape with nothing in it.
  'formula_sheet:derivation': {
    skinStates: {
      derivation: {
        steps: {
          gas: ['pV = nRT', 'p = nRT / V', 'V = nRT / p'],
        },
      },
    },
  },
  'formula_sheet:unit_aware': {
    skinStates: {
      unit_aware: {
        units: {
          // Both sides come out in joules, which is the point of the check.
          gas: { p: 'J/m^3', V: 'm^3', n: 'mol', R: 'J/mol·K', T: 'K' },
          interest: { A: 'USD', P: 'USD' },
        },
      },
    },
  },
  'formula_sheet:worked_example': {
    skinStates: {
      worked_example: {
        openId: 'interest',
        values: { interest: { P: '1000', r: '0.05', n: '12', t: '3' } },
      },
    },
  },
  'formula:percent_change': { label: 'Month over month', a: 5.1, b: 6.8, operator: 'subtract' },
  'formula:ratio': { label: 'Billable ratio', a: 5.5, b: 6.5, operator: 'divide' },
  'comparator:range': { label: 'Room temperature in band', op: 'between', a: 21, b: 24, low: 16, high: 30 },
  'aggregator:average': { label: 'Average night of sleep', mode: 'avg', slots: [7.2, 6.8, 7, 6.1, 5.9, 7.4, 6.5] },
  'aggregator:count': { label: 'Days walked', mode: 'count', slots: [1, 1, 0, 1, 1, 1, 0] },
  'counter:goal_counter': { label: 'Pages read today', count: 18, step: 1 },
  'rating:nps': { label: 'Would you recommend the studio?', value: 9 },
  'rating:emoji': { label: 'How did today feel?', value: 4 },
  'status:service_health': { label: 'Sync service', value: 'blocked' },
  'text_input:search': { label: 'Search the ledger', value: 'metro', placeholder: 'Find a client…' },
  'text_input:url': { label: 'Project link', value: 'https://example.com/metro-cafe', placeholder: 'https://…' },
  'text_input:email': { label: 'Send the quote to', value: 'dana@example.com', placeholder: 'name@example.com' },
  'text_input:tags': { label: 'Tags', value: 'billing, metro-cafe, september', placeholder: 'Comma separated' },
  'text_input:command': { label: 'Command', value: 'npm run check', placeholder: 'Run…' },
  'number_input:currency': { label: 'Quote total', value: 980, min: 0, max: 10000, step: 10 },
  'number_input:percent': { label: 'Margin', value: 34, min: 0, max: 100, step: 1 },
  'number_input:duration': { label: 'Estimated hours', value: 16, min: 0, max: 80, step: 1 },
}
