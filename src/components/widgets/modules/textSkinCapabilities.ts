/**
 * Which writing tools belong to which Text skin.
 *
 * A skin is not a colour scheme here — it is a different job of writing, and
 * the tools follow the job. Putting every feature on every skin would have
 * produced three identical editors wearing three coats of paint, which is the
 * opposite of what skins are for.
 *
 *   Plain       — the document. Everything a school essay needs on screen:
 *                 a formatting toolbar, an outline, find and replace, the
 *                 word count, citations, and export.
 *   Sticky      — the capture. Stays fast and small: checkboxes you can tap,
 *                 the pen, the colour pad. No toolbar, no panels, no sheet.
 *   Typewriter  — the draft. Distraction-free by construction: no toolbar at
 *                 all (the keyboard still formats), plus the things that keep
 *                 a long session going — a word goal, a centred caret, and
 *                 focus dimming.
 *
 * Keyboard shortcuts are deliberately NOT in this table. ⌘B, list
 * continuation, Tab to indent and the rest work in every skin, because they
 * are how markdown is typed rather than a feature a skin owns — a sticky note
 * where Enter refused to continue a list would just be broken.
 */

import type { TextSkinMode } from './textSkinModel'

export interface TextSkinCapabilities {
  /** Markdown painted live behind the caret. */
  liveMarkdown: boolean
  /** The row of formatting buttons above the writing. */
  formattingToolbar: boolean
  /** The headings list in the writing sheet. */
  outline: boolean
  /** Find, and replace. */
  findReplace: boolean
  /** Words, characters, sentences, reading time. */
  statistics: boolean
  /** A target word count with progress against it. */
  writingGoal: boolean
  /** Keep the caret line vertically centred while typing. */
  typewriterScroll: boolean
  /** Dim every line but the one being written. */
  focusMode: boolean
  /** `[@key]` tokens resolve to sources and build a reference list. */
  citations: boolean
  /** Save the writing out as a file, or print it. */
  export: boolean
  /** The full-screen writing sheet. */
  sheet: boolean
  /** Pen ink laid over the writing. */
  ink: boolean
  /** The colour pad. */
  palette: boolean
  /** Checkboxes that toggle when tapped. */
  checkboxes: boolean
}

const PLAIN: TextSkinCapabilities = {
  liveMarkdown: true,
  formattingToolbar: true,
  outline: true,
  findReplace: true,
  statistics: true,
  writingGoal: false,
  typewriterScroll: false,
  focusMode: false,
  citations: true,
  export: true,
  sheet: true,
  ink: false,
  palette: false,
  checkboxes: true,
}

const STICKY: TextSkinCapabilities = {
  liveMarkdown: true,
  formattingToolbar: false,
  outline: false,
  findReplace: false,
  statistics: false,
  writingGoal: false,
  typewriterScroll: false,
  focusMode: false,
  citations: false,
  export: false,
  sheet: false,
  ink: true,
  palette: true,
  checkboxes: true,
}

const TYPEWRITER: TextSkinCapabilities = {
  liveMarkdown: true,
  formattingToolbar: false,
  outline: true,
  findReplace: true,
  statistics: true,
  writingGoal: true,
  typewriterScroll: true,
  focusMode: true,
  citations: true,
  export: true,
  sheet: true,
  ink: false,
  palette: false,
  checkboxes: false,
}

export const TEXT_SKIN_CAPABILITIES: Record<TextSkinMode, TextSkinCapabilities> = {
  plain: PLAIN,
  sticky: STICKY,
  typewriter: TYPEWRITER,
}

export function capabilitiesFor(skin: TextSkinMode): TextSkinCapabilities {
  return TEXT_SKIN_CAPABILITIES[skin] ?? PLAIN
}

/** The word target a Typewriter draft is working toward, when one is set. */
export function writingGoalOf(state: Record<string, unknown>): number | null {
  const raw = state.wordGoal
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return null
  return Math.min(100_000, Math.round(raw))
}

/** The goal presets offered on a draft, in the order they are shown. */
export const WORD_GOALS: readonly number[] = [250, 500, 1000, 1500, 2500, 5000]
