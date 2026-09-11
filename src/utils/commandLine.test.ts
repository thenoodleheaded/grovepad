import { describe, expect, it } from 'vitest'
import {
  COMMAND_SPECS,
  parseCommandLine,
  suggestCommands,
  type CommandContext,
} from './commandLine'

const ctx = (overrides: Partial<CommandContext> = {}): CommandContext => ({
  selectionCount: 0,
  skinOptions: [],
  ...overrides,
})

describe('parseCommandLine', () => {
  it('returns null for a thought, so capture is untouched', () => {
    expect(parseCommandLine('plan my week', ctx())).toBeNull()
    expect(parseCommandLine('i want to make a game', ctx())).toBeNull()
    expect(parseCommandLine('', ctx())).toBeNull()
  })

  it('returns null for multi-line input', () => {
    expect(parseCommandLine('delete\nall', ctx({ selectionCount: 2 }))).toBeNull()
  })

  it('recognizes a bare verb over the selection', () => {
    const parse = parseCommandLine('glue', ctx({ selectionCount: 3 }))
    expect(parse?.spec.id).toBe('glue')
    expect(parse?.issue).toBeNull()
    expect(parse?.summary).toBe('Glue 3 cards into one cluster')
    expect(parse?.tokens[0]).toEqual({ text: 'glue', role: 'verb' })
  })

  it('reports the missing selection instead of failing silently', () => {
    const parse = parseCommandLine('glue', ctx({ selectionCount: 1 }))
    expect(parse?.issue).toBe('Select at least 2 cards first')
    expect(parseCommandLine('delete', ctx())?.issue).toBe('Select a card first')
  })

  it('resolves verb aliases onto the canonical command', () => {
    expect(parseCommandLine('remove', ctx({ selectionCount: 1 }))?.spec.id).toBe('delete')
    expect(parseCommandLine('stick', ctx({ selectionCount: 2 }))?.spec.id).toBe('glue')
    expect(parseCommandLine('star', ctx({ selectionCount: 1 }))?.spec.id).toBe('favorite')
  })

  it('parses add with aliases, filler, and counts', () => {
    const parse = parseCommandLine('add a note and a timer', ctx())
    expect(parse?.spec.id).toBe('add')
    expect(parse?.args.widgetTypes).toEqual(['text', 'timekeeper'])
    expect(parse?.issue).toBeNull()
    const fillerRoles = parse?.tokens.filter((token) => token.role === 'filler')
    expect(fillerRoles?.length).toBe(3) // a, and, a

    const counted = parseCommandLine('add note x3', ctx())
    expect(counted?.args.widgetTypes).toEqual(['text', 'text', 'text'])

    const leading = parseCommandLine('add 3 notes', ctx())
    expect(leading?.args.widgetTypes).toEqual(['text', 'text', 'text'])
  })

  it('matches multi-word widget labels ahead of their last word', () => {
    const parse = parseCommandLine('add reading list', ctx())
    expect(parse?.args.widgetTypes).toEqual(['reading_list'])
  })

  it('captures a quoted title for a single created card', () => {
    const parse = parseCommandLine('add note "call landlord"', ctx())
    expect(parse?.args.widgetTypes).toEqual(['text'])
    expect(parse?.args.text).toBe('call landlord')
    expect(parse?.summary).toContain('call landlord')
  })

  it('asks for a widget when add names none', () => {
    const parse = parseCommandLine('add', ctx())
    expect(parse?.issue).toContain('Name a widget')
  })

  it('parses the user example: glue a plain note, formula and a calculator', () => {
    const parse = parseCommandLine('add a note, formula and a calculator', ctx())
    expect(parse?.args.widgetTypes).toEqual(['text', 'formula', 'calculator'])
  })

  it('matches skins case-insensitively and by prefix', () => {
    const options = [
      { value: 'pomodoro', label: 'Pomodoro' },
      { value: 'stopwatch', label: 'Stopwatch' },
    ]
    const exact = parseCommandLine('skin pomodoro', ctx({ selectionCount: 1, skinOptions: options }))
    expect(exact?.args.skin).toBe('pomodoro')
    expect(exact?.issue).toBeNull()

    const prefix = parseCommandLine('skin stop', ctx({ selectionCount: 1, skinOptions: options }))
    expect(prefix?.args.skin).toBe('stopwatch')

    const miss = parseCommandLine('skin kanban', ctx({ selectionCount: 1, skinOptions: options }))
    expect(miss?.issue).toContain('Pomodoro')
  })

  it('lists the wearable skins when skin has no argument', () => {
    const parse = parseCommandLine('skin', ctx({
      selectionCount: 1,
      skinOptions: [{ value: 'sticky', label: 'Sticky' }],
    }))
    expect(parse?.issue).toContain('Sticky')
  })

  it('maps align words onto align modes', () => {
    const parse = parseCommandLine('align left', ctx({ selectionCount: 2 }))
    expect(parse?.args.choice).toBe('left')
    expect(parse?.issue).toBeNull()
    expect(parseCommandLine('align center', ctx({ selectionCount: 2 }))?.args.choice).toBe('center-h')
    expect(parseCommandLine('align middle', ctx({ selectionCount: 2 }))?.args.choice).toBe('center-v')
    expect(parseCommandLine('align', ctx({ selectionCount: 2 }))?.issue).toContain('Which edge?')
  })

  it('parses zoom as percent, in, and out — and bounds the number', () => {
    expect(parseCommandLine('zoom 150', ctx())?.args.amount).toBe(150)
    expect(parseCommandLine('zoom in', ctx())?.args.choice).toBe('in')
    expect(parseCommandLine('zoom 900', ctx())?.issue).toContain('10–400')
  })

  it('parses nudge direction and cell count', () => {
    const parse = parseCommandLine('nudge left 3', ctx({ selectionCount: 1 }))
    expect(parse?.args.choice).toBe('left')
    expect(parse?.args.amount).toBe(3)
  })

  it('requires all or none after select', () => {
    expect(parseCommandLine('select all', ctx())?.args.choice).toBe('all')
    expect(parseCommandLine('select none', ctx())?.args.choice).toBe('none')
    expect(parseCommandLine('select', ctx())?.issue).toContain('select all')
  })

  it('takes the rest of the line as the rename text', () => {
    const parse = parseCommandLine('rename Trip to Japan', ctx({ selectionCount: 1 }))
    expect(parse?.args.text).toBe('Trip to Japan')
    expect(parse?.issue).toBeNull()
    expect(parseCommandLine('rename', ctx({ selectionCount: 1 }))?.issue).toBe('Rename to what?')
    expect(parseCommandLine('rename x', ctx({ selectionCount: 2 }))?.issue).toContain('one card')
  })

  it('tokenizes every word of the input, in order', () => {
    const parse = parseCommandLine('add a note "shopping"', ctx())
    expect(parse?.tokens.map((token) => token.text).join(' ')).toBe('add a note "shopping"')
    expect(parse?.tokens.map((token) => token.role)).toEqual(['verb', 'filler', 'noun', 'title'])
  })
})

describe('suggestCommands', () => {
  it('suggests by prefix on the first word only', () => {
    const suggestions = suggestCommands('gl')
    expect(suggestions.map((entry) => entry.spec.id)).toContain('glue')
    expect(suggestCommands('glue extra words')).toEqual([])
    expect(suggestCommands('')).toEqual([])
  })

  it('ranks an exact verb above prefix matches', () => {
    const suggestions = suggestCommands('un')
    expect(suggestions.length).toBeGreaterThan(0)
    const exact = suggestCommands('undo')
    expect(exact[0]?.spec.id).toBe('undo')
  })

  it('never suggests for an ordinary thought word', () => {
    expect(suggestCommands('plan')).toEqual([])
  })
})

describe('navigation verbs', () => {
  it('parses go with a destination and demands one without', () => {
    const parse = parseCommandLine('go Research', ctx())
    expect(parse?.spec.id).toBe('go')
    expect(parse?.args.text).toBe('Research')
    expect(parse?.issue).toBeNull()
    expect(parseCommandLine('go', ctx())?.issue).toBe('Go where? Name a canvas or card')
  })

  it('parses switch, tab, and the tab-cycling verbs', () => {
    const switchParse = parseCommandLine('switch Personal', ctx())
    expect(switchParse?.spec.id).toBe('switch')
    expect(switchParse?.args.text).toBe('Personal')

    const openTab = parseCommandLine('tab Research', ctx())
    expect(openTab?.spec.id).toBe('open-tab')
    expect(openTab?.args.text).toBe('Research')
    expect(parseCommandLine('tab', ctx())?.issue).toBe('Which canvas? — “tab Research”')

    expect(parseCommandLine('next tab', ctx())?.spec.id).toBe('next-tab')
    expect(parseCommandLine('next tab', ctx())?.issue).toBeNull()
    expect(parseCommandLine('previous', ctx())?.spec.id).toBe('previous-tab')
    expect(parseCommandLine('close tab', ctx())?.spec.id).toBe('close-tab')
  })

  it('captures find text so search opens pre-filled', () => {
    const parse = parseCommandLine('find landlord notes', ctx())
    expect(parse?.spec.id).toBe('find')
    expect(parse?.args.text).toBe('landlord notes')
    expect(parse?.summary).toBe('Search for “landlord notes”')
    expect(parseCommandLine('find', ctx())?.summary).toBe('Open search')
    expect(parseCommandLine('find', ctx())?.issue).toBeNull()
  })
})

describe('registry integrity', () => {
  it('keeps every verb unique across commands', () => {
    const seen = new Map<string, string>()
    for (const entry of COMMAND_SPECS) {
      for (const verb of entry.verbs) {
        expect(seen.has(verb), `verb "${verb}" claimed by ${seen.get(verb)} and ${entry.id}`).toBe(false)
        seen.set(verb, entry.id)
      }
    }
  })

  it('keeps single-word verbs so the first token always decides', () => {
    for (const entry of COMMAND_SPECS) {
      for (const verb of entry.verbs) expect(verb).not.toMatch(/\s/)
    }
  })
})
