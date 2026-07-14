import { describe, expect, it } from 'vitest'
import { withoutPanelItem } from './panelRemoval'

describe('panel removal', () => {
  it('removes by stable id after concurrent insertions shift indexes', () => {
    const latest = [
      { id: 'inserted', text: 'New first item' },
      { id: 'alpha', text: 'Alpha' },
      { id: 'bravo', text: 'Bravo' },
    ]

    expect(withoutPanelItem(latest, 'bravo')).toEqual(latest.slice(0, 2))
  })

  it('is idempotent when a transition completion fires more than once', () => {
    const items = [{ id: 'alpha' }, { id: 'bravo' }]
    const once = withoutPanelItem(items, 'alpha')
    expect(withoutPanelItem(once, 'alpha')).toEqual(once)
  })
})
