import { describe, expect, it } from 'vitest'
import type { DialogData } from '../../../types/widgetDataCore'
import {
  dialogDetail,
  dialogSkinMode,
  dialogSpeakers,
  transcriptTimecode,
  withDialogDetail,
  withoutDialogLine,
} from './dialogSkinModel'

const SCRIPT: DialogData = {
  skin: 'screenplay',
  lines: [
    { id: 'a', character: 'HOST', cue: 'Welcome.' },
    { id: 'b', character: 'GUEST', cue: 'Thank you.' },
    { id: 'c', character: 'host', cue: 'Let us begin.' },
  ],
}

describe('dialog skin model', () => {
  it('falls back safely for old and unknown cards', () => {
    expect(dialogSkinMode(undefined)).toBe('screenplay')
    expect(dialogSkinMode('unknown')).toBe('screenplay')
    expect(dialogSkinMode('chat')).toBe('chat')
  })

  it('keeps speakers in stable first-appearance order', () => {
    expect(dialogSpeakers(SCRIPT.lines)).toEqual(['HOST', 'GUEST'])
  })

  it('isolates bounded details by line id', () => {
    const translated = withDialogDetail({}, 'translations', 'a', 'Xush kelibsiz.')
    const timed = withDialogDetail(translated, 'timestamps', 'a', '00:14')

    expect(dialogDetail(timed, 'translations', 'a')).toBe('Xush kelibsiz.')
    expect(dialogDetail(timed, 'timestamps', 'a')).toBe('00:14')
    expect(dialogDetail(timed, 'directions', 'a')).toBe('')
  })

  it('prunes deleted lines from canonical and specialist state together', () => {
    const data: DialogData = {
      ...SCRIPT,
      skinStates: {
        localization: {
          translations: { a: 'Welcome', b: 'Thanks' },
          targetLanguage: 'English',
        },
        audio_transcript: { timestamps: { a: '00:00', b: '00:05' } },
      },
    }

    const next = withoutDialogLine(data, 'a')
    expect(next.lines.map((line) => line.id)).toEqual(['b', 'c'])
    expect(next.skinStates?.localization).toEqual({
      translations: { b: 'Thanks' },
      targetLanguage: 'English',
    })
    expect(next.skinStates?.audio_transcript).toEqual({
      timestamps: { b: '00:05' },
    })
  })

  it('offers calm deterministic timecodes before a transcript is timed', () => {
    expect(transcriptTimecode(0, '')).toBe('00:00')
    expect(transcriptTimecode(13, '')).toBe('01:05')
    expect(transcriptTimecode(3, ' 01:42 ')).toBe('01:42')
  })
})
