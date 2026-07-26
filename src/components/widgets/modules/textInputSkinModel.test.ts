import { describe, expect, it } from 'vitest'
import {
  COMMAND_HISTORY_LIMIT,
  isMultilineSkin,
  joinTextInputTags,
  textInputEmail,
  textInputEmptyWord,
  textInputHistory,
  textInputLink,
  textInputPlaceholder,
  textInputSkinMode,
  textInputTags,
  withCommandRun,
  withTextInputTag,
  withoutTextInputTag,
} from './textInputSkinModel'

describe('text input skin mode', () => {
  it('keeps a known skin', () => {
    expect(textInputSkinMode('command')).toBe('command')
    expect(textInputSkinMode('tags')).toBe('tags')
  })

  /**
   * Cards saved before Text Input had skins only recorded the Wrap/Single
   * boolean. A wrapped one must keep its paragraph area rather than snapping
   * to a single line the first time it is opened.
   */
  it('reads an unskinned card from the shape it was saved with', () => {
    expect(textInputSkinMode(undefined, true)).toBe('multiline')
    expect(textInputSkinMode(undefined, false)).toBe('single_line')
    expect(textInputSkinMode('nonsense', true)).toBe('multiline')
  })

  it('treats only Multiline as a paragraph', () => {
    expect(isMultilineSkin('multiline')).toBe(true)
    for (const skin of ['single_line', 'search', 'url', 'email', 'tags', 'command'] as const) {
      expect(isMultilineSkin(skin), skin).toBe(false)
    }
  })

  it('asks in the worn skin’s own language unless the card has its own prompt', () => {
    expect(textInputPlaceholder('email', '')).toBe('name@example.com')
    expect(textInputPlaceholder('command', 'Type a value…')).toBe('deploy --preview')
    expect(textInputPlaceholder('search', 'Which release?')).toBe('Which release?')
  })

  it('names the empty state in the skin’s own words', () => {
    expect(textInputEmptyWord('command')).toBe('No command run')
    expect(textInputEmptyWord('tags')).toBe('No tags')
  })
})

describe('web address validation', () => {
  it('reads a bare host as https and shortens it for display', () => {
    const link = textInputLink('grovepad.app/boards')
    expect(link.valid).toBe(true)
    expect(link.href).toBe('https://grovepad.app/boards')
    expect(link.display).toBe('grovepad.app/boards')
    expect(link.scheme).toBe('https')
  })

  /**
   * A typed address is untrusted text. Only http(s) may ever reach an href —
   * a `javascript:` or `data:` string must stay a string.
   */
  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'mailto:someone@example.com',
  ])('never hands %s to the browser as somewhere to go', (raw) => {
    const link = textInputLink(raw)
    expect(link.href).toBeNull()
    expect(link.valid).toBe(false)
  })

  it('refuses half-typed addresses without pretending they are broken', () => {
    expect(textInputLink('').valid).toBe(false)
    expect(textInputLink('grovepad').valid).toBe(false)
    expect(textInputLink('grovepad').display).toBe('grovepad')
  })
})

describe('email shape', () => {
  it('accepts an address-shaped value and splits it for reading', () => {
    expect(textInputEmail(' ada@grovepad.app ')).toEqual({
      user: 'ada',
      domain: 'grovepad.app',
      valid: true,
    })
  })

  it.each(['ada', 'ada@', '@grovepad.app', 'ada@grovepad', 'a b@c.dd'])(
    'rejects %s',
    (raw) => {
      expect(textInputEmail(raw).valid).toBe(false)
    },
  )
})

describe('tags', () => {
  it('reads the same comma-separated string the card emits', () => {
    expect(textInputTags('alpha, beta ,gamma')).toEqual(['alpha', 'beta', 'gamma'])
    expect(joinTextInputTags(['alpha', 'beta'])).toBe('alpha, beta')
  })

  it('drops blanks and repeats rather than showing them twice', () => {
    expect(textInputTags('alpha,,  ,Alpha, alpha ')).toEqual(['alpha'])
  })

  it('bounds the row so a pasted paragraph cannot become 400 chips', () => {
    const many = Array.from({ length: 60 }, (_, index) => `tag-${index}`).join(', ')
    expect(textInputTags(many)).toHaveLength(24)
    expect(textInputTags('x'.repeat(90))[0]).toHaveLength(32)
  })

  it('adds and removes through the same normalization', () => {
    expect(withTextInputTag('alpha', 'beta')).toBe('alpha, beta')
    expect(withTextInputTag('alpha', ' ALPHA ')).toBe('alpha')
    expect(withoutTextInputTag('alpha, beta, gamma', 'Beta')).toBe('alpha, gamma')
  })
})

describe('command history', () => {
  it('validates persisted history instead of trusting it', () => {
    expect(textInputHistory('not a list')).toEqual([])
    expect(textInputHistory([1, null, ' build ', '', 'build'])).toEqual(['build'])
  })

  it('keeps the newest run first and never grows past the limit', () => {
    let history: string[] = []
    for (let index = 0; index < COMMAND_HISTORY_LIMIT + 5; index += 1) {
      history = withCommandRun(history, `run-${index}`)
    }
    expect(history).toHaveLength(COMMAND_HISTORY_LIMIT)
    expect(history[0]).toBe(`run-${COMMAND_HISTORY_LIMIT + 4}`)
  })

  it('moves a repeated line back to the top rather than listing it twice', () => {
    const history = withCommandRun(withCommandRun(['build'], 'test'), 'build')
    expect(history).toEqual(['build', 'test'])
  })

  it('ignores an empty submit', () => {
    expect(withCommandRun(['build'], '   ')).toEqual(['build'])
  })
})
