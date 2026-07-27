import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { DialogData } from '../../../types/widgetDataCore'
import { DialogWidget } from './DialogWidget'
import type { DialogSkinMode } from './dialogSkinModel'

const SKINS = [
  'screenplay',
  'chat',
  'interview',
  'roleplay',
  'comic',
  'localization',
  'audio_transcript',
] as const

const SCRIPT: DialogData = {
  skin: 'screenplay',
  lines: [
    { id: 'a', character: 'NARRATOR', cue: 'The canvas wakes.' },
    { id: 'b', character: 'MAE', cue: 'Ready when you are.' },
  ],
  skinStates: {
    localization: {
      targetLanguage: 'Uzbek',
      translations: { a: 'Tuval uyg‘onadi.' },
    },
    roleplay: { directions: { b: 'Bright, but measured' } },
    audio_transcript: { timestamps: { b: '00:12' } },
  },
}

function render(skin: DialogSkinMode) {
  return renderToStaticMarkup(
    <DialogWidget data={{ ...SCRIPT, skin }} skin={skin} onChange={() => undefined} />,
  )
}

describe('purpose-built Dialog skins', () => {
  it.each([
    ['screenplay', 'gp-script-screenplay'],
    ['chat', 'gp-script-bubble'],
    ['interview', 'gp-script-qa-mark'],
    ['roleplay', 'gp-script-direction-row'],
    ['comic', 'gp-script-balloon'],
    ['localization', 'gp-script-l10n-row'],
    ['audio_transcript', 'gp-script-wave'],
  ] as const)('renders the %s experience with its own anatomy', (skin, className) => {
    expect(render(skin)).toContain(className)
  })

  it.each(SKINS)('keeps the canonical script visible in the %s skin', (skin) => {
    const markup = render(skin)
    expect(markup).toContain('NARRATOR')
    expect(markup).toContain('The canvas wakes.')
    expect(markup).toContain('MAE')
    expect(markup).toContain('Ready when you are.')
  })

  it('shows specialist details only in the skin that owns them', () => {
    expect(render('localization')).toContain('Tuval uyg‘onadi.')
    expect(render('localization')).toContain('Uzbek')
    expect(render('roleplay')).toContain('Bright, but measured')
    expect(render('audio_transcript')).toContain('00:12')
    expect(render('screenplay')).not.toContain('Tuval uyg‘onadi.')
  })

  it.each(SKINS)('keeps every editable text control on the one card backplate in %s', (skin) => {
    const markup = render(skin)
    for (const control of markup.matchAll(/<(input|textarea)[^>]*>/g)) {
      const before = markup.slice(0, control.index)
      expect(before.slice(before.lastIndexOf('<span')), `${skin} ${control[1]} wrapper`)
        .toContain('gp-bare-field')
    }
  })

  it('labels destructive and editable controls for assistive technology', () => {
    const markup = render('audio_transcript')
    expect(markup).toContain('aria-label="Remove NARRATOR line"')
    expect(markup).toContain('aria-label="Timestamp for NARRATOR"')
    expect(markup).toContain('aria-label="Dialogue for NARRATOR"')
  })
})
