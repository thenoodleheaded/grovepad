import type { WidgetDefinition } from '../contracts/registry'
import type { AtlasType } from '../atlasCatalog'
import { ATLAS_CATALOG, ATLAS_TYPES, defaultAtlasData } from '../atlasCatalog'
import { GRID_SIZE } from '../../types/spatial'

export const ATLAS_WIDGET_DEFINITIONS = Object.fromEntries(
  ATLAS_TYPES.map((type) => {
    const spec=ATLAS_CATALOG[type]
    const taller=['content_pipeline','skill_tree','past_papers','care_plan','commission_queue','prayer_times'].includes(type)
    const definition:WidgetDefinition={
      type,label:spec.label,description:spec.description,icon:spec.icon,category:spec.category,
      accent:spec.accent,defaultSize:{width:taller?400:360,height:GRID_SIZE*(taller?7:6)},
      defaultData:()=>defaultAtlasData(type),...(spec.pack?{pack:spec.pack}:{}),
      availability:'existing-only',unavailableReason:'This preset now lives inside the Tracker widget.',
    }
    return [type,definition]
  }),
) as Record<AtlasType,WidgetDefinition>

export const TRACKER_WIDGET_DEFINITION: WidgetDefinition = {
  type:'tracker',label:'Tracker',description:'One flexible tracker with modes for logs, routines, status, and planning',
  icon:ATLAS_CATALOG.price_book.icon,category:'tracking',accent:'#34d399',
  defaultSize:{width:360,height:GRID_SIZE*7},defaultData:()=>defaultAtlasData('price_book'),
}
