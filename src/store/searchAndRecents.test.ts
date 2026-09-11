import { afterEach, describe, expect, it } from 'vitest'
import { buildBoardSnapshot } from '../utils/persistence'
import { parsePersistedBoard } from '../utils/persistedBoardSchema'
import { contentExcerpt, widgetContentText } from '../utils/widgetSearchText'
import { lastVisitedCanvasIn, promoteCanvasVisit, type CanvasVisit } from './canvasRecents'
import { useWidgetStore } from './useWidgetStore'

const baseline = parsePersistedBoard(buildBoardSnapshot(useWidgetStore.getState()))!

afterEach(() => {
  useWidgetStore.getState().loadBoard(baseline)
})

describe('widgetContentText', () => {
  it('flattens user strings and skips machine blobs', () => {
    const text = widgetContentText({
      text: 'Call the landlord about rent',
      nested: { items: [{ label: 'buy milk' }, { label: 'water plants' }] },
      count: 7,
      done: false,
      image: 'data:image/png;base64,AAAA',
      hash: 'a'.repeat(300),
    })
    expect(text).toContain('Call the landlord about rent')
    expect(text).toContain('buy milk')
    expect(text).toContain('water plants')
    expect(text).not.toContain('data:image')
    expect(text).not.toContain('aaaa')
  })

  it('excerpts around the match with ellipses', () => {
    const content = `${'x '.repeat(60)}the landlord replied today ${'y '.repeat(60)}`
    const excerpt = contentExcerpt(content, 'landlord')
    expect(excerpt).toContain('landlord')
    expect(excerpt.startsWith('…')).toBe(true)
    expect(excerpt.endsWith('…')).toBe(true)
    expect(excerpt.length).toBeLessThan(100)
  })
})

describe('searchWidgets', () => {
  it('finds widgets by their content, labelled with the matched text', () => {
    const store = useWidgetStore.getState()
    const id = store.createWidget('Untitled scribble', { x: 70_000, y: 70_000 }, 'text')
    useWidgetStore.getState().updateWidgetData(id, { text: 'remember to email the landlord' })

    const results = useWidgetStore.getState().searchWidgets('landlord')
    const hit = results.find((result) => result.id === id)
    expect(hit).toBeDefined()
    expect(hit!.subtitle).toContain('landlord')
  })

  it('returns canvases as first-class results that include workspace roots', () => {
    const store = useWidgetStore.getState()
    const card = store.createWidget('Thesis planning', { x: 72_000, y: 72_000 }, 'canvas_node')
    const canvasId = (useWidgetStore.getState().widgets[card]!.data as { canvasId: string }).canvasId

    const results = useWidgetStore.getState().searchWidgets('thesis')
    const canvasHit = results.find((result) => result.type === 'canvas' && result.id === canvasId)
    expect(canvasHit).toBeDefined()
    expect(canvasHit!.subtitle).toBe('Canvas')
  })
})

describe('canvas recents', () => {
  it('promotes visits most-recent-first without duplicates', () => {
    let visits: CanvasVisit[] = []
    visits = promoteCanvasVisit(visits, 'a', 1)
    visits = promoteCanvasVisit(visits, 'b', 2)
    visits = promoteCanvasVisit(visits, 'a', 3)
    expect(visits.map((visit) => visit.id)).toEqual(['a', 'b'])
    expect(visits[0]!.at).toBe(3)
  })

  it('resolves the last visited canvas within one workspace, skipping deleted ones', () => {
    const canvases = {
      root1: { id: 'root1', workspaceId: 'ws1' },
      deep1: { id: 'deep1', workspaceId: 'ws1' },
      root2: { id: 'root2', workspaceId: 'ws2' },
    }
    const visits: CanvasVisit[] = [
      { id: 'gone', at: 5 },
      { id: 'root2', at: 4 },
      { id: 'deep1', at: 3 },
      { id: 'root1', at: 2 },
    ]
    expect(lastVisitedCanvasIn(visits, canvases, 'ws1')).toBe('deep1')
    expect(lastVisitedCanvasIn(visits, canvases, 'ws2')).toBe('root2')
    expect(lastVisitedCanvasIn(visits, canvases, 'ws3')).toBeNull()
  })
})
