import { useCallback } from 'react'
import { useTextSheetStore } from '../../../store/useTextSheetStore'
import { useWidgetStore } from '../../../store/useWidgetStore'
import type { ModuleData, TextData } from '../../../types/spatial'
import { dataWithSkinState, skinStateFor, widgetAccent } from '../../../utils/widgetSkins'
import { widgetDefinition } from '../../../widgets/registry'
import { TextEditorSheet } from './TextEditorSheet'
import { capabilitiesFor, writingGoalOf } from './textSkinCapabilities'
import type { TextSkinMode } from './textSkinModel'

/**
 * The writing view's one host.
 *
 * A singleton mounted beside the canvas rather than a piece of the card, for
 * the same reason `WidgetFullscreenSheet` is: the door into it is the expand
 * button on the card's name row, which is drawn even while the card is resting
 * and its editor is not mounted. Reading the card out of the store here means
 * the view opens from any state the card happens to be in.
 */
export function TextWritingSheet() {
  const widgetId = useTextSheetStore((state) => state.widgetId)
  const origin = useTextSheetStore((state) => state.origin)
  const widget = useWidgetStore((state) => (widgetId ? state.widgets[widgetId] : undefined))

  const update = useCallback(
    (next: ModuleData) => {
      if (!widgetId) return
      useWidgetStore.getState().updateWidgetData(widgetId, next)
    },
    [widgetId],
  )

  if (!widget || widget.type !== 'text') return null

  const data = widget.data as TextData
  const skin = (data.mode ?? 'plain') as TextSkinMode
  const capabilities = capabilitiesFor(skin)
  const state = skinStateFor(data, skin)

  return (
    <TextEditorSheet
      open
      onClose={() => useTextSheetStore.getState().closeTextSheet()}
      title={widget.title}
      skin={skin}
      capabilities={capabilities}
      origin={origin}
      // The card's accent, read from the registry rather than off the DOM: the
      // sheet is portalled to the document body, so it inherits none of the
      // card's own variables and every note colour is mixed from this one.
      accent={widgetAccent(widget, widgetDefinition(widget.type))}
      value={data.text ?? ''}
      onChange={(text) => update({ ...data, text, mode: skin } as ModuleData)}
      focusMode={state.focusMode === true}
      goal={writingGoalOf(state)}
      onGoal={(next) =>
        update(
          dataWithSkinState({ ...data, mode: skin } as ModuleData, skin, {
            ...state,
            wordGoal: next,
          }),
        )
      }
    />
  )
}
