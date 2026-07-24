import { describe, expect, it, vi } from 'vitest'
import type { ThoughtInterpretation, ThoughtPlan } from '../utils/thoughtInterpreter'
import type { WidgetGenerationDependencies } from './widgetGeneration'
import { generateWidgetOutput } from './widgetGeneration'

const plan: ThoughtPlan = {
  sourceText: 'Build a launch checklist',
  confidence: 0.9,
  nodes: [{
    temporaryId: 'node-1',
    widgetType: 'checklist',
    title: 'Launch checklist',
    data: { items: [] },
    sourceText: 'Build a launch checklist',
    confidence: 0.9,
    depth: 0,
    metadata: { badges: [] },
  }],
  relations: [],
  warnings: [],
}

const interpretation = {
  sourceText: plan.sourceText,
  meaning: { clauses: [], people: [], dates: [], urls: [], amounts: [], modality: 'certain', negated: false },
  predictions: [{ id: 'one', label: 'Checklist', explanation: '', confidence: 0.9, plan, primaryTypes: ['checklist'], kind: 'single' }],
  recommendedId: 'one',
  confidenceMargin: 0.9,
  shouldAutoCommit: false,
} as ThoughtInterpretation

function dependencies() {
  const commitThoughtPlan = vi.fn(() => ['created'])
  const parent = {
    id: 'generator', type: 'ai_generator' as const, title: 'AI Generator', canvasId: 'canvas',
    position: { x: 100, y: 200 }, size: { width: 320, height: 160 },
    data: { prompt: '', status: 'idle' as const }, metadata: { badges: [] },
  }
  const store = {
    widgets: { generator: parent },
    canvases: { canvas: { id: 'canvas', name: 'Origin', workspaceId: 'workspace', parentCanvasId: null } },
    commitThoughtPlan,
  }
  const deps: WidgetGenerationDependencies = {
    getStore: () => store,
    predict: vi.fn(async () => interpretation),
  }
  return { deps, store, commitThoughtPlan }
}

describe('widget generation action', () => {
  it('commits the interpreted plan beside the generator', async () => {
    const { deps, commitThoughtPlan } = dependencies()
    await expect(generateWidgetOutput('generator', plan.sourceText, new AbortController().signal, deps))
      .resolves.toEqual(['created'])
    expect(commitThoughtPlan).toHaveBeenCalledWith(plan, { x: 500, y: 200 }, 'generator')
  })

  it('does not commit after cancellation', async () => {
    const { deps, commitThoughtPlan } = dependencies()
    const controller = new AbortController()
    deps.predict = vi.fn(async () => {
      controller.abort()
      return interpretation
    })
    await expect(generateWidgetOutput('generator', plan.sourceText, controller.signal, deps))
      .rejects.toMatchObject({ name: 'AbortError' })
    expect(commitThoughtPlan).not.toHaveBeenCalled()
  })

  it('does not commit if the generator was deleted while awaiting output', async () => {
    const { deps, store, commitThoughtPlan } = dependencies()
    deps.predict = vi.fn(async () => {
      delete (store.widgets as Partial<typeof store.widgets>).generator
      return interpretation
    })
    await expect(generateWidgetOutput('generator', plan.sourceText, new AbortController().signal, deps))
      .rejects.toThrow('no longer exists')
    expect(commitThoughtPlan).not.toHaveBeenCalled()
  })
})
