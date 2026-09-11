import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { STUDY_FOCUS_TYPES, isStudyFocusType } from './studyFocus'
import { WIDGET_REGISTRY, isWidgetTypePublic, orderedDefinitions } from './registry'
import { DELETED_WIDGET_TYPES } from './deletedWidgetTypes'
import { skinsFor } from '../utils/widgetSkins'
import { initialStudyFocus } from '../store/useWidgetPickerPrefsStore'
import type { ModuleType } from '../types/spatial'

describe('study focus allow-list', () => {
  it('names only types the registry still ships', () => {
    for (const type of STUDY_FOCUS_TYPES) {
      expect(WIDGET_REGISTRY[type], `${type} is not registered`).toBeDefined()
      expect(isWidgetTypePublic(type), `${type} is existing-only`).toBe(true)
    }
  })

  it('keeps the two study cards that a category filter would miss', () => {
    // Study Deck is filed under `notes` and Pomodoro is a skin of `timekeeper`;
    // both must survive a filter that is nominally about studying.
    expect(WIDGET_REGISTRY.flashcards.category).not.toBe('study')
    expect(isStudyFocusType('flashcards' as ModuleType)).toBe(true)
    expect(isStudyFocusType('timekeeper' as ModuleType)).toBe(true)
  })

  it('covers every widget the registry itself calls a study widget', () => {
    const studyCategory = orderedDefinitions()
      .filter((def) => def.category === 'study' && isWidgetTypePublic(def.type))
      .map((def) => def.type)
    expect(studyCategory.length).toBeGreaterThan(0)
    for (const type of studyCategory) {
      expect(isStudyFocusType(type), `${type} is category:'study' but filtered out`).toBe(true)
    }
  })

  it('actually filters — it is not an accidental allow-everything', () => {
    expect(isStudyFocusType('potluck_matrix' as ModuleType)).toBe(false)
    expect(isStudyFocusType('mutex' as ModuleType)).toBe(false)
    expect(STUDY_FOCUS_TYPES.size).toBeLessThan(orderedDefinitions().length / 2)
  })

  it('hides nothing permanently: no allow-listed type is a dropped type', () => {
    // The filter must never overlap the one mechanism that does delete
    // records, so that turning study focus off is always fully reversible.
    for (const type of STUDY_FOCUS_TYPES) {
      expect(DELETED_WIDGET_TYPES.has(type), `${type} is a dropped type`).toBe(false)
    }
  })
})

// The filter lives in two browse surfaces and one preference. There is no DOM
// test environment here, so source contracts guard the wiring the same way
// settingsContracts.test.ts guards the settings shell.
const addModal = readFileSync(new URL('../components/ui/AddWidgetModal.tsx', import.meta.url), 'utf8')
const palette = readFileSync(new URL('../components/ui/CommandPalette.tsx', import.meta.url), 'utf8')
const prefs = readFileSync(new URL('../store/useWidgetPickerPrefsStore.ts', import.meta.url), 'utf8')
const persistedBoard = readFileSync(new URL('../types/persistence.ts', import.meta.url), 'utf8')

describe('study focus wiring', () => {
  it('filters both widget-browsing surfaces', () => {
    for (const [name, source] of [['picker', addModal], ['command palette', palette]] as const) {
      expect(source, `${name} does not consult the allow-list`).toContain('isStudyFocusType')
      expect(source, `${name} does not read the preference`).toContain('state.studyFocus')
      // A stale memo would leave the old list on screen after the switch flips.
      expect(source, `${name} omits studyFocus from its memo deps`).toMatch(/studyFocus\]/)
    }
  })

  it('overrides the pack gate so the switch cannot empty the picker', () => {
    // Most study widgets belong to the education pack. If the pack gate still
    // applied, turning study focus on with packs off would hide them too.
    expect(addModal).toContain('!studyFocus && def.pack && !activePacks.includes(def.pack)')
    expect(palette).toContain('if (studyFocus) return isStudyFocusType(type)')
  })

  it('is a device preference, never board data', () => {
    // Written to localStorage only. If it ever reached the persisted board it
    // would sync between devices and read as data loss on the other one.
    expect(prefs).toContain("const STUDY_FOCUS_KEY = 'gp-study-focus'")
    expect(prefs).toContain('localStorage.setItem(STUDY_FOCUS_KEY')
    expect(persistedBoard).not.toContain('studyFocus')
  })
})

const skinRoller = readFileSync(new URL('../components/widgets/WidgetSkinRoller.tsx', import.meta.url), 'utf8')
const widgetCard = readFileSync(new URL('../components/widgets/WidgetCard.tsx', import.meta.url), 'utf8')
const widgetSkins = readFileSync(new URL('../utils/widgetSkins.ts', import.meta.url), 'utf8')

describe('study focus hides whole widgets, never skins', () => {
  it('leaves every surviving widget wearing its full set of skins', () => {
    let checked = 0
    for (const type of STUDY_FOCUS_TYPES) {
      const def = WIDGET_REGISTRY[type]
      if (!def.skins?.length) continue
      const offered = skinsFor({ type }, def)
      expect(offered.length, `${type} lost skins`).toBe(def.skins.length)
      expect(offered.map((s) => s.value)).toEqual(def.skins.map((s) => s.value))
      checked += 1
    }
    // A silent zero here would make the assertion above meaningless.
    expect(checked).toBeGreaterThan(4)
  })

  it('keeps the filter out of every skin code path', () => {
    // Skins are how one widget changes shape. Narrowing them would take away
    // ability inside a card the user chose to keep, which is not what the
    // switch promises.
    for (const [name, source] of [
      ['skin roller', skinRoller],
      ['widget card', widgetCard],
      ['skin resolver', widgetSkins],
    ] as const) {
      expect(source, `${name} consults the study filter`).not.toContain('studyFocus')
      expect(source, `${name} consults the study filter`).not.toContain('StudyFocus')
    }
    // The resolver hands back whatever the definition declares, unfiltered.
    expect(widgetSkins).toContain('return def.skins ?? []')
  })
})

describe('study focus starts on', () => {
  it('is on for someone who has never touched the switch', () => {
    expect(initialStudyFocus(null)).toBe(true)
  })

  it('stays off once turned off, across every reload', () => {
    // The bug this guards: re-defaulting a stored 'false' back to on would
    // make the switch look like it never saved.
    expect(initialStudyFocus('false')).toBe(false)
  })

  it('stays on once turned on', () => {
    expect(initialStudyFocus('true')).toBe(true)
  })

  it('treats junk in storage as off, never as never-chosen', () => {
    // A corrupt value means something was written, so the user did choose.
    expect(initialStudyFocus('')).toBe(false)
    expect(initialStudyFocus('yes')).toBe(false)
  })
})
