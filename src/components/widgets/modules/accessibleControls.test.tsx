import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { AudioPlayerData, InventoryData } from '../../../types/spatial'
import { WIDGET_REGISTRY } from '../../../widgets/registry'
import { InventoryWidget } from './EssentialWidgets'
import { AudioPlayerWidget } from './specialist/AudioPlayerWidget'

describe('named primary widget controls', () => {
  it('names Inventory quantity and threshold controls', () => {
    const data = WIDGET_REGISTRY.inventory.defaultData() as InventoryData
    const markup = renderToStaticMarkup(<InventoryWidget data={data} onChange={() => undefined} />)
    expect(markup).toContain('aria-label="Decrease Item quantity')
    expect(markup).toContain('aria-label="Increase Item quantity')
    expect(markup).toContain('aria-label="Item quantity')
    expect(markup).toContain('aria-label="Item minimum quantity')
  })

  it('names and exposes the state of Synthesizer play/pause', () => {
    const data = WIDGET_REGISTRY.audio_player.defaultData() as AudioPlayerData
    const markup = renderToStaticMarkup(<AudioPlayerWidget data={data} onChange={() => undefined} />)
    expect(markup).toContain('aria-label="Play audio"')
    expect(markup).toContain('aria-pressed="false"')
  })
})
