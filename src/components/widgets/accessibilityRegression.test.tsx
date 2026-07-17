import { afterEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { KanbanData } from '../../types/spatial'
import { buildBoardSnapshot } from '../../utils/persistence'
import { parsePersistedBoard } from '../../utils/persistedBoardSchema'
import { useWidgetStore } from '../../store/useWidgetStore'
import { KanbanWidget } from './modules/KanbanWidget'

const baseline = parsePersistedBoard(buildBoardSnapshot(useWidgetStore.getState()))!

afterEach(() => {
  useWidgetStore.getState().loadBoard(baseline)
})

describe('widget accessibility regressions', () => {
  it('keeps Kanban move and delete actions in the accessibility tree at rest', () => {
    const data: KanbanData = { columns: [{ id: 'todo', label: 'Todo', cards: [{ id: 'card', label: 'Task' }] }] }
    const markup = renderToStaticMarkup(<KanbanWidget data={data} onChange={() => undefined} />)
    expect(markup).toContain('Remove card')
    expect(markup).not.toContain('pointer-events-none')
  })
})
