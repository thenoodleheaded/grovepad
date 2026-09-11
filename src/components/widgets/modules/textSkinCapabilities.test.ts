import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  TEXT_SKIN_CAPABILITIES,
  capabilitiesFor,
  writingGoalOf,
  type TextSkinCapabilities,
} from './textSkinCapabilities'
import { EMPTY_HISTORY, recordEdit, shouldCoalesce, stepBack, stepForward } from './textEditorHistory'

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

describe('what each Text skin is for', () => {
  /**
   * The whole point of splitting the tools across skins: three editors that do
   * different jobs, not one editor wearing three coats of paint. If any two
   * skins ever offer exactly the same tools, the split has stopped meaning
   * anything and one of them should be deleted instead.
   */
  it('gives no two skins the same set of tools', () => {
    const signatures = Object.values(TEXT_SKIN_CAPABILITIES).map((entry) => JSON.stringify(entry))
    expect(new Set(signatures).size).toBe(signatures.length)
  })

  it('makes Plain the document: toolbar, outline, search, counts, export', () => {
    const plain = capabilitiesFor('plain')
    expect(plain).toMatchObject({
      formattingToolbar: true,
      outline: true,
      findReplace: true,
      statistics: true,
      citations: true,
      export: true,
      sheet: true,
      checkboxes: true,
    })
  })

  /** Sticky's character is speed. A panel it has to open would cost it that. */
  it('keeps Sticky to capture: ink, colour, checkboxes, and nothing to open', () => {
    const sticky = capabilitiesFor('sticky')
    expect(sticky).toMatchObject({ ink: true, palette: true, checkboxes: true, liveMarkdown: true })
    expect(sticky.sheet).toBe(false)
    expect(sticky.formattingToolbar).toBe(false)
    expect(sticky.outline).toBe(false)
    expect(sticky.findReplace).toBe(false)
    expect(sticky.export).toBe(false)
  })

  /** Distraction-free means the toolbar is absent by design, not forgotten. */
  it('makes Typewriter the draft: goal, centred caret, focus, and no toolbar', () => {
    const typewriter = capabilitiesFor('typewriter')
    expect(typewriter).toMatchObject({
      writingGoal: true,
      typewriterScroll: true,
      focusMode: true,
      outline: true,
      export: true,
      sheet: true,
    })
    expect(typewriter.formattingToolbar).toBe(false)
  })

  it('gives only Sticky the pen and the colour pad', () => {
    const inked = (Object.keys(TEXT_SKIN_CAPABILITIES) as (keyof typeof TEXT_SKIN_CAPABILITIES)[])
      .filter((skin) => TEXT_SKIN_CAPABILITIES[skin].ink)
    expect(inked).toEqual(['sticky'])
  })

  it('gives only Typewriter the goal and the centred caret', () => {
    const drafting = (Object.keys(TEXT_SKIN_CAPABILITIES) as (keyof typeof TEXT_SKIN_CAPABILITIES)[])
      .filter((skin) => TEXT_SKIN_CAPABILITIES[skin].writingGoal)
    expect(drafting).toEqual(['typewriter'])
  })

  it('paints markdown in every skin, because that is how the text is typed', () => {
    for (const entry of Object.values(TEXT_SKIN_CAPABILITIES) as TextSkinCapabilities[]) {
      expect(entry.liveMarkdown).toBe(true)
    }
  })

  it("falls back to the document's tools for an unknown skin", () => {
    expect(capabilitiesFor('nonsense' as never)).toEqual(capabilitiesFor('plain'))
  })

  it('reads a word goal only when it is a real target', () => {
    expect(writingGoalOf({ wordGoal: 1500 })).toBe(1500)
    expect(writingGoalOf({ wordGoal: 0 })).toBeNull()
    expect(writingGoalOf({ wordGoal: -5 })).toBeNull()
    expect(writingGoalOf({ wordGoal: 'lots' })).toBeNull()
    expect(writingGoalOf({})).toBeNull()
  })
})

/**
 * The keyboard is deliberately NOT in the capability table — ⌘B and a list
 * that carries on are how markdown gets typed, not a feature a skin owns. A
 * sticky note where Enter refused to continue a list would simply be broken.
 * There is no DOM in this runner, so the contract is read off the source.
 */
describe('the keyboard belongs to every skin', () => {
  const surface = source('./TextEditorSurface.tsx')

  it('never consults a capability while handling a key', () => {
    const handler = surface.slice(surface.indexOf('const handleKeyDown'))
    expect(handler).not.toContain('capabilities')
    expect(handler).not.toContain('skin')
  })

  it('is the one surface every skin writes on', () => {
    expect(source('./TextWidget.tsx')).toContain('<TextEditorSurface')
    expect(source('./StickyNoteWidget.tsx')).toContain('<TextEditorSurface')
  })

  it('carries the shortcuts a student already knows', () => {
    for (const key of ["'b'", "'i'", "'e'", "'k'", "'Tab'", "'Enter'", "'ArrowUp'"]) {
      expect(surface).toContain(key)
    }
  })
})

describe('undo that survives a command', () => {
  const snapshot = (text: string) => ({ text, start: text.length, end: text.length })

  it('folds a run of typing into one step', () => {
    expect(shouldCoalesce('hell', 'hello', 100)).toBe(true)
    expect(shouldCoalesce('hell', 'hello', 5000)).toBe(false)
    expect(shouldCoalesce('a', 'a much longer pasted thing', 100)).toBe(false)
  })

  /** A new line ends the word, so it ends the undo step with it. */
  it('starts a new step at a line break', () => {
    expect(shouldCoalesce('one', 'one\n', 100)).toBe(false)
  })

  it('steps back to the state before an edit, and forward again', () => {
    const first = recordEdit(EMPTY_HISTORY, snapshot('before'), false)
    const back = stepBack(first, snapshot('after'))
    expect(back?.restored.text).toBe('before')
    const forward = stepForward(back!.state, snapshot('before'))
    expect(forward?.restored.text).toBe('after')
  })

  it('has nothing to undo when nothing has happened', () => {
    expect(stepBack(EMPTY_HISTORY, snapshot('x'))).toBeNull()
    expect(stepForward(EMPTY_HISTORY, snapshot('x'))).toBeNull()
  })

  /** Typing after an undo abandons the branch, as it does in every editor. */
  it('drops the redo branch once a new edit lands', () => {
    const first = recordEdit(EMPTY_HISTORY, snapshot('a'), false)
    const back = stepBack(first, snapshot('b'))!
    expect(back.state.future).toHaveLength(1)
    expect(recordEdit(back.state, snapshot('c'), false).future).toHaveLength(0)
  })
})
