import type { WidgetDefinition } from '../registry'
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
      defaultData:()=>defaultAtlasData(type),...(spec.pack?{pack:spec.pack}:{})
    }
    return [type,definition]
  }),
) as Record<AtlasType,WidgetDefinition>
