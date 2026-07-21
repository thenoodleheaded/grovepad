import { lazy } from 'react'

export const AtlasWidget = lazy(async () => ({ default: (await import('../modules/AtlasWidgets')).AtlasWidget }))
export const AutomationCoreWidget = lazy(async () => ({ default: (await import('../modules/AutomationCoreWidgets')).AutomationCoreWidget }))
export const ExpansionWidget = lazy(async () => ({ default: (await import('../modules/ExpansionWidgets')).ExpansionWidget }))

/** Same import literals as the lazy() wrappers above — Vite resolves them
 * to the same chunks, so firing one warms the exact module a first mount
 * would need. Consumed by the idle prefetch runtime (engine/loader). */
export const CATALOG_WIDGET_MODULE_LOADERS: ReadonlyArray<() => Promise<unknown>> = [
  () => import('../modules/AtlasWidgets'),
  () => import('../modules/AutomationCoreWidgets'),
  () => import('../modules/ExpansionWidgets'),
]
