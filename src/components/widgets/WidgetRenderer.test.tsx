import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import unknownBoardFixture from '../../utils/fixtures/boards/v2-unknown.json?raw'
import { parsePersistedBoard } from '../../utils/persistedBoardSchema'
import { WidgetRenderer } from './WidgetRenderer'

describe('WidgetRenderer unknown widget placeholder', () => {
  it('explains the compatibility state while keeping the future type visible', () => {
    const board = parsePersistedBoard(JSON.parse(unknownBoardFixture))
    const widget = board?.widgets.future
    expect(widget).toBeDefined()

    const markup = renderToStaticMarkup(
      <WidgetRenderer widget={widget!} onUpdate={() => {}} onHeightChange={() => {}} />,
    )

    expect(markup).toContain('data-opaque-widget="true"')
    expect(markup).toContain('quantum_planner')
    expect(markup).toContain('Its data is preserved unchanged')
  })
})
