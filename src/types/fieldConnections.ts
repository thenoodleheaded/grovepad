// ---------------------------------------------------------------------------
// Field vocabulary — display-time types for the per-widget field registry.
//
// The cross-widget wiring subsystem (field connections + propagation engine)
// was removed; dependencies now use regular relation lines only. What survives
// here are the two tiny value vocabularies the field registry in
// `src/widgets/fields.ts` still uses to describe each widget's own bindable
// fields (for readouts and one-shot commands rendered inside the card).
// ---------------------------------------------------------------------------

/** The value flavor of a bindable field — used only for display formatting. */
export type FieldValueType = 'number' | 'boolean' | 'text' | 'series'

/**
 * Optional semantic tag riding on top of a field's raw `FieldValueType`.
 * Purely advisory: it never blocks a connection (any type can still wire
 * into any other, coerced tolerantly — the patchbay stays promiscuous) but
 * lets the wire-drawing UI auto-suggest a sensible transform the instant two
 * differently-shaped ports connect. 'none' or omitted means "no opinion".
 */
export type SemanticUnit = 'percent' | 'ratio' | 'currency' | 'count' | 'duration_s' | 'date_iso' | 'none'

/** One-shot commands a widget's own controls can fire on its data. Which
 *  commands a widget accepts is declared in its field registry entry. */
export type FieldCommand =
  | 'reset' | 'increment' | 'decrement' | 'uncheck_all' | 'check_all'
  | 'capture' | 'advance' | 'roll' | 'record' | 'rotate' | 'new_period' | 'notify'
  | 'advance_round'|'mark_paid'|'mark_sent'|'log_price'|'log_reading'|'log_topup'|'log_fillup'|'log_earning'|'add_item'
  | 'log_period_start'|'start_fast'|'end_fast'|'add_glass'|'reset_day'|'log_night'|'draw_next'|'mark_done'|'mark_prayed'|'mark_read'
  | 'add_gratitude'|'draw_memory'|'add_prayer'|'mark_answered'|'log_outage'|'lend_item'|'mark_returned'|'water'|'water_all_due'|'mark_replaced'
  | 'advance_schedule'|'refresh_sun'|'mark_unpacked'|'add_box'|'start'|'stop'|'mark_pinged'|'mark_received'|'add_person'|'log_request'
  | 'add_flag'|'acknowledge_all'|'stamp'|'new_round'|'log_incident'|'add_line'|'mark_won'|'mark_lost'|'log_attempt'|'mark_reviewed'
  | 'advance_frontier'|'start_experiment'|'record_result'|'deposit'|'complete_node'|'log_care_event'|'log_gift'|'give_kudos'|'flush_digest'
  | 'claim_dish'|'give_star'|'redeem'|'log_feed'|'log_walk'|'log_weight'|'log_entry'|'log_exit'|'pack_item'|'advance_night'|'spend'|'add_cash'
  | 'advance_stage'|'deliver'|'mark_posted'
  | 'execute'|'enqueue'|'dequeue'|'approve'|'reject'|'acquire'|'release'|'clear'|'test'
  | 'add_zone'
