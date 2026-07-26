import type { ReactNode } from 'react'
import { locationSkinMode } from '../modules/locationSkinModel'
import type { ModuleType } from '../../../types/moduleTypes'
import type { AtlasWidgetData, AutomationCoreData, LocationData } from '../../../types/widgetDataExpansion'
import { ATLAS_TYPES, atlasModeFor, type AtlasType } from '../../../widgets/atlasCatalog'
import { AUTOMATION_CORE_TYPES, type AutomationCoreType } from '../../../widgets/automationCoreCatalog'
import type { WidgetContentRenderer, WidgetRendererFamily } from './contracts'
import { AtlasWidget, AutomationCoreWidget, ExpansionWidget, LocationWidget } from './lazyCatalogWidgets'

type ExpansionType = Extract<ModuleType,
  'clock_pulse'|'comparator'|'aggregator'|'range_mapper'|'latch'|'random_picker'|'sequencer'|'template'|'recorder'|'notifier'|
  'subscriptions'|'debt_payoff'|'expense_split'|'invoices'|'meal_planner'|'recipe'|'home_maintenance'|'chore_rotation'|'renewals_vault'|'medications'|'workout_plan'|'job_applications'|'okr'|'decision_journal'|'weekly_review'|'snippet_library'|'keep_in_touch'|'gifts_occasions'|'trip_itinerary'|'guest_list'
>

const EXPANSION_TYPES = [
  'clock_pulse', 'comparator', 'aggregator', 'range_mapper', 'latch',
  'random_picker', 'sequencer', 'template', 'recorder', 'notifier',
  'subscriptions', 'debt_payoff', 'expense_split', 'invoices', 'meal_planner',
  'recipe', 'home_maintenance', 'chore_rotation', 'renewals_vault', 'medications',
  'workout_plan', 'job_applications', 'okr', 'decision_journal', 'weekly_review',
  'snippet_library', 'keep_in_touch', 'gifts_occasions', 'trip_itinerary', 'guest_list',
] as const satisfies readonly ExpansionType[]

function renderersForTypes<T extends ModuleType>(
  types: readonly T[],
  render: (type: T, context: Parameters<WidgetContentRenderer>[0]) => ReactNode,
): Partial<Record<ModuleType, WidgetContentRenderer>> {
  return Object.fromEntries(
    types.map((type) => [type, (context: Parameters<WidgetContentRenderer>[0]) => render(type, context)]),
  ) as Partial<Record<ModuleType, WidgetContentRenderer>>
}

export const atlasWidgetRendererFamily: WidgetRendererFamily = {
  id: 'atlas',
  renderers: {
    ...renderersForTypes(ATLAS_TYPES, (type: AtlasType, { widget, onUpdate }) => (
      <AtlasWidget type={type} data={widget.data as AtlasWidgetData} onChange={onUpdate} />
    )),
    // The Tracker's skin — which Atlas preset it wears — is chosen from the
    // card's title roller, exactly like every other widget. It has no
    // in-card picker of its own.
    tracker: ({ widget, onUpdate }) => {
      const data = widget.data as AtlasWidgetData
      return <AtlasWidget type={atlasModeFor(data)} data={data} onChange={onUpdate} />
    },
  },
}

export const automationWidgetRendererFamily: WidgetRendererFamily = {
  id: 'automation-core',
  renderers: renderersForTypes(AUTOMATION_CORE_TYPES, (type: AutomationCoreType, { widget, onUpdate }) => (
    <AutomationCoreWidget widgetId={widget.id} type={type} data={widget.data as AutomationCoreData} onChange={onUpdate} />
  )),
}

export const expansionWidgetRendererFamily: WidgetRendererFamily = {
  id: 'expansion',
  renderers: {
    ...renderersForTypes(EXPANSION_TYPES, (type: ExpansionType, { widget, onUpdate }) => (
      <ExpansionWidget type={type} data={widget.data} onChange={onUpdate} />
    )),
    // Location left the generic expansion grid when it gained purpose-built
    // skins: each one is its own instrument over the same coordinates.
    location: ({ widget, onUpdate }) => {
      const data = widget.data as LocationData
      return <LocationWidget data={data} skin={locationSkinMode(data.skin)} onChange={onUpdate} />
    },
  },
}
