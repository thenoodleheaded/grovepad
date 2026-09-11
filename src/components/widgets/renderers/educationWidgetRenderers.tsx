import type {
  CanvasLmsData,
  CitationData,
  FormulaSheetData,
} from '../../../types/widgetDataEducation'
import type { WidgetRendererFamily } from './contracts'
import {
  CanvasLmsWidget, CitationWidget, FormulaSheetWidget, 
} from './lazyEducationWidgets'

export const educationWidgetRendererFamily: WidgetRendererFamily = {
  id: 'education',
  renderers: {
    canvas_lms: ({ widget }) => <CanvasLmsWidget data={widget.data as CanvasLmsData} />,
    // The card resolves its own skin from `data.skin`, which keeps the skin
    // model inside the lazy education chunk with the widget that reads it.
    formula_sheet: ({ widget, onUpdate }) => <FormulaSheetWidget data={widget.data as FormulaSheetData} onChange={onUpdate} />,
    citation: ({ widget, onUpdate }) => <CitationWidget data={widget.data as CitationData} onChange={onUpdate} />,
  },
}
