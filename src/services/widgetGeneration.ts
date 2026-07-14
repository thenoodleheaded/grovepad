import type { WidgetStoreState } from '../store/widgetStoreTypes'
import { useWidgetStore } from '../store/useWidgetStore'
import type { InterpretationContext, ThoughtInterpretation } from '../utils/thoughtInterpreter'

type GenerationStore = Pick<
  WidgetStoreState,
  'widgets' | 'canvases' | 'commitThoughtPlan'
>

export interface WidgetGenerationDependencies {
  getStore: () => GenerationStore
  predict: (
    prompt: string,
    context: InterpretationContext,
    signal: AbortSignal,
  ) => Promise<ThoughtInterpretation>
}

const defaultDependencies: WidgetGenerationDependencies = {
  getStore: () => useWidgetStore.getState(),
  predict: async (prompt, context, signal) => {
    const { localAiService } = await import('./localAiService')
    return localAiService.predictThoughtCandidates(
      prompt,
      context,
      { allowModel: true, mode: 'compose', signal },
    )
  },
}

/** Generate and commit a real interpreted plan, guarded against stale context. */
export async function generateWidgetOutput(
  widgetId: string,
  prompt: string,
  signal: AbortSignal,
  dependencies: WidgetGenerationDependencies = defaultDependencies,
): Promise<string[]> {
  const initialStore = dependencies.getStore()
  const parent = initialStore.widgets[widgetId]
  if (!parent) throw new Error('Generator widget no longer exists')

  const interpretation = await dependencies.predict(
    prompt,
    {
      selectedWidgetTitle: parent.title,
      selectedWidgetType: parent.type,
      canvasName: initialStore.canvases[parent.canvasId]?.name,
    },
    signal,
  )
  if (signal.aborted) throw new DOMException('Generation cancelled', 'AbortError')

  const store = dependencies.getStore()
  const currentParent = store.widgets[widgetId]
  const plan = interpretation.predictions[0]?.plan
  if (!currentParent) throw new Error('Generator widget no longer exists')
  if (!plan || plan.nodes.length === 0) throw new Error('No useful generation plan was produced')

  return store.commitThoughtPlan(
    plan,
    {
      x: currentParent.position.x + currentParent.size.width + 80,
      y: currentParent.position.y,
    },
    widgetId,
  )
}
