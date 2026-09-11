import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { CanvasNodeData } from '../../../types/spatial'
import { CanvasNodeWidget } from './CanvasNodeWidget'
import type { CanvasNodeSkin } from './canvasNodeSkinModel'

describe('purpose-built Canvas skins', () => {
  const data: CanvasNodeData = { canvasId: 'missing-canvas', skin: 'portal' }

  it.each([
    ['portal', 'gp-canvas-node-portal'],
    ['cover', 'gp-canvas-node-cover'],
    ['live_thumbnail', 'gp-canvas-node-thumbnail'],
  ] as const)('renders the %s experience with its own anatomy', (skin, className) => {
    const markup = renderToStaticMarkup(
      <CanvasNodeWidget
        data={{ ...data, skin: skin as CanvasNodeSkin }}
        skin={skin as CanvasNodeSkin}
        onChange={() => undefined}
      />,
    )
    expect(markup).toContain(className)
    expect(markup).toContain(`data-canvas-skin="${skin}"`)
  })

  it('makes the Cover context editable and keeps the thumbnail non-interactive', () => {
    const cover = renderToStaticMarkup(
      <CanvasNodeWidget
        data={{
          ...data,
          skin: 'cover',
          skinStates: { cover: { subtitle: 'The next chapter' } },
        }}
        skin="cover"
        onChange={() => undefined}
      />,
    )
    const thumbnail = renderToStaticMarkup(
      <CanvasNodeWidget data={{ ...data, skin: 'live_thumbnail' }} skin="live_thumbnail" />,
    )

    expect(cover).toContain('aria-label="Canvas cover subtitle"')
    expect(cover).toContain('The next chapter')
    expect(thumbnail).toContain('class="gp-canvas-preview"')
    expect(thumbnail).not.toContain('gp-skin-details')
  })

  it('carries no arrow button in any skin — the card itself is the door', () => {
    for (const skin of ['portal', 'cover', 'live_thumbnail'] as const) {
      const markup = renderToStaticMarkup(
        <CanvasNodeWidget data={{ ...data, skin }} skin={skin} onChange={() => undefined} />,
      )
      expect(markup, skin).not.toContain('lucide-arrow-up-right')
      expect(markup, skin).not.toContain('aria-label="Open Canvas"')
      // The only button left is the identity mark, and only where the card
      // hands it the skin roller; here there is no card, so not even that.
      expect(markup, skin).not.toContain('<button')
    }
  })

  it('says the canvas name once, and narrates nothing else', () => {
    const portal = renderToStaticMarkup(
      <CanvasNodeWidget data={data} skin="portal" onChange={() => undefined} />,
    )
    // The card is a door, not a caption. No "step inside", no card tallies.
    expect(portal).not.toContain('Step inside')
    expect(portal).not.toContain('Continue inside')
    expect(portal).not.toContain('An empty canvas')
    // The name still sits in its measurable slot, so the card can fit to it.
    expect(portal).toContain('class="gp-canvas-portal-name"')
  })
})
