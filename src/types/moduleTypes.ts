// ---------------------------------------------------------------------------
// Module registry (content type per widget)
// ---------------------------------------------------------------------------

export type ModuleType =
  | 'notes'
  | 'bullets'
  | 'checklist'
  | 'table'
  | 'sketchpad'
  | 'excalidraw'
  | 'budget'
  | 'progress'
  | 'ai_generator'
  | 'timeline'
  | 'dialog'
  | 'game_tuner'
  | 'audio_player'
  | 'canvas_node'
  | 'kanban'
  | 'countdown'
  | 'habit'
  | 'links'
  | 'code'
  | 'quote'
  | 'poll'
  | 'contact'
  | 'media'
  | 'metrics'
  | 'sticky_note'
  | 'calendar'
  | 'timer'
  | 'timekeeper'
  | 'tracker'
  | 'rating'
  | 'color_palette'
  | 'mood_tracker'
  | 'calculator'
  | 'bar_chart'
  | 'counter'
  | 'pros_cons'
  | 'weekly_planner'
  | 'goal_tracker'
  | 'stopwatch'
  | 'reading_list'
  | 'flashcards'
  | 'meeting_notes'
  | 'priority_matrix'
  | 'decision'
  | 'world_clock'
  | 'pomodoro'
  | 'vocab'
  | 'grade_calc'
  | 'gpa'
  | 'assignment'
  | 'cornell'
  | 'formula_sheet'
  | 'citation'
  | 'study_goal'
  | 'quiz'
  | 'text_input'
  | 'number_input'
  | 'toggle'
  | 'branch_gate'
  | 'formula'
  | 'status'
  | 'date_picker'
  | 'outline'
  | 'form'
  | 'daily_agenda'
  | 'process'
  | 'risk_register'
  | 'decision_matrix'
  | 'swot'
  | 'timesheet'
  | 'inventory'
  | 'logbook'
  | 'line_chart'
  | 'pie_chart'
  | 'unit_converter'
  | 'clock_pulse'
  | 'comparator'
  | 'aggregator'
  | 'range_mapper'
  | 'latch'
  | 'random_picker'
  | 'sequencer'
  | 'template'
  | 'recorder'
  | 'notifier'
  | 'subscriptions'
  | 'debt_payoff'
  | 'expense_split'
  | 'invoices'
  | 'meal_planner'
  | 'recipe'
  | 'home_maintenance'
  | 'chore_rotation'
  | 'renewals_vault'
  | 'medications'
  | 'workout_plan'
  | 'job_applications'
  | 'okr'
  | 'decision_journal'
  | 'weekly_review'
  | 'snippet_library'
  | 'keep_in_touch'
  | 'gifts_occasions'
  | 'trip_itinerary'
  | 'guest_list'
  | 'savings_circle' | 'zakat' | 'remittance_planner' | 'price_book'
  | 'utility_runway' | 'fuel_log' | 'side_income' | 'wishlist_saver'
  | 'vitals_log' | 'cycle_tracker' | 'fasting_window' | 'hydration'
  | 'sleep_ledger' | 'stretch_deck' | 'prayer_times' | 'scripture_plan'
  | 'gratitude_jar' | 'prayer_wall' | 'outage_schedule' | 'borrowed_items'
  | 'plant_care' | 'go_bag' | 'bin_night' | 'sun_window' | 'moving_boxes'
  | 'meeting_cost' | 'waiting_on' | 'office_hours' | 'scope_meter'
  | 'handover_note' | 'crit_queue' | 'on_call' | 'estimate_builder'
  | 'past_papers' | 'memorization_ladder' | 'experiments' | 'mistake_bank'
  | 'skill_tree' | 'care_plan' | 'gift_ledger' | 'team_kudos'
  | 'potluck_matrix' | 'star_chart' | 'pet_care' | 'visa_runway'
  | 'packing_matrix' | 'jet_lag_shifter' | 'currency_pocket'
  | 'commission_queue' | 'content_pipeline'
  | 'loop' | 'batch_processor' | 'parallel_runner' | 'race' | 'transaction' | 'subroutine' | 'approval_gate' | 'workflow_lock'
  | 'webhook_receiver' | 'manual_trigger' | 'canvas_lifecycle' | 'event_merger' | 'data_join' | 'object_builder' | 'event_correlator' | 'multi_source_aggregator'
  | 'widget_creator' | 'widget_updater' | 'widget_deleter' | 'branch_builder' | 'relation_builder' | 'canvas_router' | 'clone_branch' | 'template_instantiator' | 'archive_action' | 'auto_layout_action' | 'focus_action'
  | 'variable_store' | 'key_value_store' | 'queue' | 'stack_store' | 'set_store' | 'state_machine' | 'idempotency_store' | 'session_store' | 'mutex'
  | 'script_block' | 'local_function' | 'http_request' | 'webhook_sender' | 'secret_reference' | 'environment_config'
  | 'automation_console' | 'test_data_generator' | 'automation_recorder' | 'workflow_test_suite' | 'failure_inbox' | 'run_ledger'

export const MODULE_TYPES: readonly ModuleType[] = [
  'canvas_node',
  'notes',
  'bullets',
  'checklist',
  'table',
  'sketchpad',
  'excalidraw',
  'budget',
  'progress',
  'ai_generator',
  'timeline',
  'dialog',
  'game_tuner',
  'audio_player',
  'kanban',
  'countdown',
  'habit',
  'links',
  'code',
  'quote',
  'poll',
  'contact',
  'media',
  'metrics',
  'sticky_note',
  'calendar',
  'timer',
  'timekeeper',
  'tracker',
  'rating',
  'color_palette',
  'mood_tracker',
  'calculator',
  'bar_chart',
  'counter',
  'pros_cons',
  'weekly_planner',
  'goal_tracker',
  'stopwatch',
  'reading_list',
  'flashcards',
  'meeting_notes',
  'priority_matrix',
  'decision',
  'world_clock',
  'pomodoro',
  'vocab',
  'grade_calc',
  'gpa',
  'assignment',
  'cornell',
  'formula_sheet',
  'citation',
  'study_goal',
  'quiz',
  'text_input',
  'number_input',
  'toggle',
  'branch_gate',
  'formula',
  'status',
  'date_picker',
  'outline',
  'form',
  'daily_agenda',
  'process',
  'risk_register',
  'decision_matrix',
  'swot',
  'timesheet',
  'inventory',
  'logbook',
  'line_chart',
  'pie_chart',
  'unit_converter',
  'clock_pulse', 'comparator', 'aggregator', 'range_mapper', 'latch', 'random_picker',
  'sequencer', 'template', 'recorder', 'notifier',
  'subscriptions', 'debt_payoff', 'expense_split', 'invoices', 'meal_planner', 'recipe',
  'home_maintenance', 'chore_rotation', 'renewals_vault', 'medications', 'workout_plan',
  'job_applications', 'okr', 'decision_journal', 'weekly_review', 'snippet_library',
  'keep_in_touch', 'gifts_occasions', 'trip_itinerary', 'guest_list',
  'savings_circle', 'zakat', 'remittance_planner', 'price_book', 'utility_runway',
  'fuel_log', 'side_income', 'wishlist_saver', 'vitals_log', 'cycle_tracker',
  'fasting_window', 'hydration', 'sleep_ledger', 'stretch_deck', 'prayer_times',
  'scripture_plan', 'gratitude_jar', 'prayer_wall', 'outage_schedule', 'borrowed_items',
  'plant_care', 'go_bag', 'bin_night', 'sun_window', 'moving_boxes', 'meeting_cost',
  'waiting_on', 'office_hours', 'scope_meter', 'handover_note', 'crit_queue', 'on_call',
  'estimate_builder', 'past_papers', 'memorization_ladder', 'experiments', 'mistake_bank',
  'skill_tree', 'care_plan', 'gift_ledger', 'team_kudos', 'potluck_matrix', 'star_chart',
  'pet_care', 'visa_runway', 'packing_matrix', 'jet_lag_shifter', 'currency_pocket',
  'commission_queue', 'content_pipeline',
  'loop','batch_processor','parallel_runner','race','transaction','subroutine','approval_gate','workflow_lock',
  'webhook_receiver','manual_trigger','canvas_lifecycle','event_merger','data_join','object_builder','event_correlator','multi_source_aggregator',
  'widget_creator','widget_updater','widget_deleter','branch_builder','relation_builder','canvas_router','clone_branch','template_instantiator','archive_action','auto_layout_action','focus_action',
  'variable_store','key_value_store','queue','stack_store','set_store','state_machine','idempotency_store','session_store','mutex',
  'script_block','local_function','http_request','webhook_sender','secret_reference','environment_config',
  'automation_console','test_data_generator','automation_recorder','workflow_test_suite','failure_inbox','run_ledger',
]
