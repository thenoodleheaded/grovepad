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
    ['dashboard_door', 'gp-canvas-node-dashboard'],
    ['folder_index', 'gp-canvas-node-index'],
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
          skinStates: { cover: { eyebrow: 'Project', subtitle: 'The next chapter' } },
        }}
        skin="cover"
        onChange={() => undefined}
      />,
    )
    const thumbnail = renderToStaticMarkup(
      <CanvasNodeWidget data={{ ...data, skin: 'live_thumbnail' }} skin="live_thumbnail" />,
    )

    expect(cover).toContain('aria-label="Canvas cover eyebrow"')
    expect(cover).toContain('The next chapter')
    expect(thumbnail).toContain('class="gp-canvas-preview"')
    expect(thumbnail).not.toContain('gp-skin-details')
  })
})
