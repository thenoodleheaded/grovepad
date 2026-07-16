import { lazy } from 'react'

export const AtlasWidget = lazy(async () => ({ default: (await import('../modules/AtlasWidgets')).AtlasWidget }))
export const AutomationCoreWidget = lazy(async () => ({ default: (await import('../modules/AutomationCoreWidgets')).AutomationCoreWidget }))
export const ExpansionWidget = lazy(async () => ({ default: (await import('../modules/ExpansionWidgets')).ExpansionWidget }))
