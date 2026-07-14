import type { ModuleType } from './moduleTypes'

// ---------------------------------------------------------------------------
// Domain Packs
// ---------------------------------------------------------------------------

export type DomainPack =
  | 'game_dev'
  | 'music_production'
  | 'software_eng'
  | 'data_science'
  | 'ux_design'
  | 'creative_writing'
  | 'digital_marketing'
  | 'finance_analytics'
  | 'project_management'
  | 'education'
  | 'cybersecurity'
  | 'hardware_engineering'
  | 'healthcare'
  | 'legal_tech'
  | 'life'

export const DOMAIN_PACKS: readonly DomainPack[] = [
  'game_dev',
  'music_production',
  'software_eng',
  'data_science',
  'ux_design',
  'creative_writing',
  'digital_marketing',
  'finance_analytics',
  'project_management',
  'education',
  'cybersecurity',
  'hardware_engineering',
  'healthcare',
  'legal_tech',
  'life',
]

export const DOMAIN_PACK_LABELS: Record<DomainPack, string> = {
  game_dev: 'Game Development',
  music_production: 'Music Production',
  software_eng: 'Software Engineering',
  data_science: 'Data Science',
  ux_design: 'UX/UI Design',
  creative_writing: 'Creative Writing',
  digital_marketing: 'Digital Marketing',
  finance_analytics: 'Finance & Analytics',
  project_management: 'Project Management',
  education: 'Education & Academics',
  cybersecurity: 'Cybersecurity',
  hardware_engineering: 'Hardware Engineering',
  healthcare: 'Healthcare & Biotech',
  legal_tech: 'Legal Technology',
  life: 'Life Systems',
}

export const MODULE_PACK_REQUIREMENTS: Partial<Record<ModuleType, DomainPack>> = {
  // game_dev
  game_tuner: 'game_dev',

  // music_production
  audio_player: 'music_production',

  // creative_writing
  dialog: 'creative_writing',
  commission_queue: 'creative_writing',
  outline: 'creative_writing',
  logbook: 'creative_writing',

  // ux_design
  color_palette: 'ux_design',
  ai_generator: 'ux_design',

  // education
  vocab: 'education',
  grade_calc: 'education',
  gpa: 'education',
  assignment: 'education',
  cornell: 'education',
  formula_sheet: 'education',
  citation: 'education',
  study_goal: 'education',
  quiz: 'education',
  pomodoro: 'education',
  past_papers: 'education',
  memorization_ladder: 'education',
  skill_tree: 'education',
  flashcards: 'education',
  reading_list: 'education',

  // finance_analytics
  budget: 'finance_analytics',
  unit_converter: 'finance_analytics',
  estimate_builder: 'finance_analytics',
  timesheet: 'finance_analytics',
  inventory: 'finance_analytics',

  // project_management
  timeline: 'project_management',
  daily_agenda: 'project_management',
  priority_matrix: 'project_management',
  decision: 'project_management',
  process: 'project_management',
  risk_register: 'project_management',
  decision_matrix: 'project_management',
  swot: 'project_management',
  content_pipeline: 'project_management',
  scope_meter: 'project_management',
  handover_note: 'project_management',
  crit_queue: 'project_management',
  date_picker: 'project_management',
  form: 'project_management',
  waiting_on: 'project_management',
  office_hours: 'project_management',
  meeting_cost: 'project_management',
  countdown: 'project_management',
  poll: 'project_management',
  pros_cons: 'project_management',
  meeting_notes: 'project_management',

  // data_science
  bar_chart: 'data_science',
  line_chart: 'data_science',
  pie_chart: 'data_science',
  metrics: 'data_science',
  rating: 'data_science',
  experiments: 'data_science',
  mistake_bank: 'data_science',

  // software_eng
  loop: 'software_eng',
  batch_processor: 'software_eng',
  parallel_runner: 'software_eng',
  race: 'software_eng',
  transaction: 'software_eng',
  subroutine: 'software_eng',
  approval_gate: 'software_eng',
  workflow_lock: 'software_eng',
  webhook_receiver: 'software_eng',
  manual_trigger: 'software_eng',
  canvas_lifecycle: 'software_eng',
  event_merger: 'software_eng',
  data_join: 'software_eng',
  object_builder: 'software_eng',
  event_correlator: 'software_eng',
  multi_source_aggregator: 'software_eng',
  widget_creator: 'software_eng',
  widget_updater: 'software_eng',
  widget_deleter: 'software_eng',
  branch_builder: 'software_eng',
  relation_builder: 'software_eng',
  canvas_router: 'software_eng',
  auto_grouper: 'software_eng',
  clone_branch: 'software_eng',
  template_instantiator: 'software_eng',
  archive_action: 'software_eng',
  auto_layout_action: 'software_eng',
  focus_action: 'software_eng',
  variable_store: 'software_eng',
  key_value_store: 'software_eng',
  queue: 'software_eng',
  stack_store: 'software_eng',
  set_store: 'software_eng',
  state_machine: 'software_eng',
  idempotency_store: 'software_eng',
  session_store: 'software_eng',
  mutex: 'software_eng',
  script_block: 'software_eng',
  local_function: 'software_eng',
  http_request: 'software_eng',
  webhook_sender: 'software_eng',
  secret_reference: 'software_eng',
  environment_config: 'software_eng',
  automation_console: 'software_eng',
  test_data_generator: 'software_eng',
  automation_recorder: 'software_eng',
  workflow_test_suite: 'software_eng',
  failure_inbox: 'software_eng',
  run_ledger: 'software_eng',
  clock_pulse: 'software_eng',
  comparator: 'software_eng',
  aggregator: 'software_eng',
  range_mapper: 'software_eng',
  latch: 'software_eng',
  random_picker: 'software_eng',
  sequencer: 'software_eng',
  template: 'software_eng',
  recorder: 'software_eng',
  notifier: 'software_eng',
  branch_gate: 'software_eng',
  status: 'software_eng',
  on_call: 'software_eng',

  // life
  subscriptions: 'life',
  debt_payoff: 'life',
  expense_split: 'life',
  invoices: 'life',
  meal_planner: 'life',
  recipe: 'life',
  home_maintenance: 'life',
  chore_rotation: 'life',
  renewals_vault: 'life',
  medications: 'life',
  workout_plan: 'life',
  job_applications: 'life',
  okr: 'life',
  decision_journal: 'life',
  weekly_review: 'life',
  snippet_library: 'life',
  keep_in_touch: 'life',
  gifts_occasions: 'life',
  trip_itinerary: 'life',
  guest_list: 'life',
  savings_circle: 'life',
  zakat: 'life',
  remittance_planner: 'life',
  price_book: 'life',
  utility_runway: 'life',
  fuel_log: 'life',
  side_income: 'life',
  wishlist_saver: 'life',
  vitals_log: 'life',
  cycle_tracker: 'life',
  fasting_window: 'life',
  hydration: 'life',
  sleep_ledger: 'life',
  stretch_deck: 'life',
  prayer_times: 'life',
  scripture_plan: 'life',
  gratitude_jar: 'life',
  prayer_wall: 'life',
  outage_schedule: 'life',
  borrowed_items: 'life',
  plant_care: 'life',
  go_bag: 'life',
  bin_night: 'life',
  sun_window: 'life',
  moving_boxes: 'life',
  care_plan: 'life',
  gift_ledger: 'life',
  team_kudos: 'life',
  potluck_matrix: 'life',
  star_chart: 'life',
  pet_care: 'life',
  visa_runway: 'life',
  packing_matrix: 'life',
  jet_lag_shifter: 'life',
  currency_pocket: 'life',
  world_clock: 'life',
  contact: 'life',
  habit: 'life',
  mood_tracker: 'life',
}

