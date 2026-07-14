import type { ModuleType, Vector2D } from '../types/spatial'
import { widgetDefinition } from '../widgets/registry'
import { useWidgetStore } from '../store/useWidgetStore'

export type LifeTemplate = {
  id: string
  label: string
  description: string
  types: readonly ModuleType[]
}

export const LIFE_TEMPLATES: readonly LifeTemplate[] = [
  {
    id: 'household-os', label: 'Household OS',
    description: 'Meals, chores, maintenance, and renewals in one place.',
    types: ['meal_planner', 'chore_rotation', 'home_maintenance', 'renewals_vault', 'clock_pulse'],
  },
  {
    id: 'money-checkup', label: 'Money checkup',
    description: 'Subscriptions, debts, invoices, and split expenses.',
    types: ['subscriptions', 'debt_payoff', 'invoices', 'expense_split'],
  },
  {
    id: 'trip-plan', label: 'Trip plan',
    description: 'Itinerary, guests, shared costs, and a scaled recipe.',
    types: ['trip_itinerary', 'guest_list', 'expense_split', 'recipe'],
  },
  {
    id: 'health-rhythm', label: 'Health rhythm',
    description: 'Training, medication tracking, and an automatic trend.',
    types: ['workout_plan', 'recorder', 'medications', 'clock_pulse'],
  },
] as const

/** Creates a compact cluster of related cards. The normal store collision
 * solver still owns final placement, so templates cannot overlap cards. */
export function createLifeTemplate(template: LifeTemplate, origin: Vector2D): string[] {
  const store = useWidgetStore.getState()
  const columns = Math.min(3, template.types.length)
  return template.types.map((type, index) => store.createWidget(
    widgetDefinition(type).label,
    { x: origin.x + (index % columns) * 390, y: origin.y + Math.floor(index / columns) * 280 },
    type,
  ))
}
