import { describe, expect, it } from 'vitest'
import { promoteRecent, RECENT_WIDGET_LIMIT } from './useWidgetPickerPrefsStore'
import type { ModuleType } from '../types/spatial'

const t = (name: string) => name as ModuleType

describe('promoteRecent', () => {
  it('puts the newest type first', () => {
    expect(promoteRecent([t('text'), t('media')], t('poll'))).toEqual([
      t('poll'),
      t('text'),
      t('media'),
    ])
  })

  it('moves an already-present type to the front instead of duplicating it', () => {
    expect(promoteRecent([t('text'), t('media'), t('poll')], t('poll'))).toEqual([
      t('poll'),
      t('text'),
      t('media'),
    ])
  })

  it('caps the list at the recent-widget limit', () => {
    const full = Array.from({ length: RECENT_WIDGET_LIMIT }, (_, i) => t(`type_${i}`))
    const next = promoteRecent(full, t('fresh'))
    expect(next).toHaveLength(RECENT_WIDGET_LIMIT)
    expect(next[0]).toBe(t('fresh'))
    expect(next).not.toContain(t(`type_${RECENT_WIDGET_LIMIT - 1}`))
  })

  it('re-promoting within a full list does not drop anything', () => {
    const full = Array.from({ length: RECENT_WIDGET_LIMIT }, (_, i) => t(`type_${i}`))
    const next = promoteRecent(full, t('type_3'))
    expect(next).toHaveLength(RECENT_WIDGET_LIMIT)
    expect(new Set(next).size).toBe(RECENT_WIDGET_LIMIT)
    expect(next[0]).toBe(t('type_3'))
  })
})
