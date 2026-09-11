/**
 * Undo for a Text card.
 *
 * The browser gives a textarea its own undo stack for free, and for plain
 * typing that stack is the better one — it knows about IME composition and
 * autocorrect in ways nothing here could. But it is lost the moment React
 * writes a value the user did not type, which is exactly what every command in
 * `textEditorModel` does: reformat a list, move a line, replace all. Those
 * edits need a history that survives them, and a student who presses ⌘Z after
 * "replace all" expects the whole replacement back, not one character of it.
 *
 * So this stack records COMMANDS and coalesced runs of typing, and the canvas
 * shortcut layer already steps aside while a text field has focus, which is
 * what leaves ⌘Z free to reach it.
 */

export interface HistorySnapshot {
  text: string
  start: number
  end: number
}

export interface HistoryState {
  past: HistorySnapshot[]
  future: HistorySnapshot[]
}

export const EMPTY_HISTORY: HistoryState = { past: [], future: [] }

/** Deep enough for an essay's worth of edits, bounded so a long session cannot
 *  grow without limit. */
const HISTORY_LIMIT = 200

/** How long a run of typing keeps folding into one undo step. */
const COALESCE_MS = 900

/**
 * Whether this edit continues the last one rather than starting a new step.
 *
 * One character, no line break, and soon after the last — that is somebody
 * typing a word, and a word is the smallest thing worth undoing. Anything
 * bigger (a paste, a command, a newline) opens its own step.
 */
export function shouldCoalesce(previous: string, next: string, elapsedMs: number): boolean {
  if (elapsedMs > COALESCE_MS) return false
  const delta = next.length - previous.length
  if (Math.abs(delta) !== 1) return false
  const changed = delta > 0 ? next : previous
  const shorter = delta > 0 ? previous : next
  // Find where they diverge; the single differing character decides it.
  let index = 0
  while (index < shorter.length && changed[index] === shorter[index]) index += 1
  return changed[index] !== '\n'
}

/** Push the pre-edit state onto the stack, dropping any redo branch. */
export function recordEdit(
  state: HistoryState,
  before: HistorySnapshot,
  coalesce: boolean,
): HistoryState {
  if (coalesce && state.past.length > 0) return { past: state.past, future: [] }
  const past = [...state.past, before]
  return {
    past: past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past,
    future: [],
  }
}

/** Step back one edit, banking the current state so redo can return to it. */
export function stepBack(
  state: HistoryState,
  current: HistorySnapshot,
): { state: HistoryState; restored: HistorySnapshot } | null {
  const restored = state.past[state.past.length - 1]
  if (!restored) return null
  return {
    state: { past: state.past.slice(0, -1), future: [...state.future, current] },
    restored,
  }
}

/** Step forward again, as long as nothing new has been typed since. */
export function stepForward(
  state: HistoryState,
  current: HistorySnapshot,
): { state: HistoryState; restored: HistorySnapshot } | null {
  const restored = state.future[state.future.length - 1]
  if (!restored) return null
  return {
    state: { past: [...state.past, current], future: state.future.slice(0, -1) },
    restored,
  }
}
