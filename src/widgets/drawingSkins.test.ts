import { describe, expect, it } from 'vitest'
import type { SketchpadData } from '../types/spatial'
import { resolveWidgetMention } from '../utils/thoughtInterpreter'
import { commandsFor, fieldsFor } from './fields'
import {
  isWidgetTypePublic,
  widgetDefinition,
  WIDGET_REGISTRY,
} from './registry'

describe('Drawing widget consolidation', () => {
  it('publishes one Drawing card and leaves no standalone Excalidraw behind', () => {
    expect(isWidgetTypePublic('sketchpad')).toBe(true)
    // The standalone Excalidraw card is deleted outright, not merely hidden.
    expect(Object.keys(WIDGET_REGISTRY)).not.toContain('excalidraw')
    expect(resolveWidgetMention('excalidraw')).toBe('sketchpad')
  })

  it('keeps every Drawing mode in its reviewed order', () => {
    expect(widgetDefinition('sketchpad').skins?.map((skin) => skin.value)).toEqual([
      'ink',
      'whiteboard',
      'graph_paper',
      'dot_grid',
      'storyboard',
      'annotation',
      'diagram',
    ])
  })

  it('carries its own Excalidraw scene under the Diagram skin', () => {
    const data = widgetDefinition('sketchpad').defaultData() as SketchpadData
    expect(data.diagram).toBeDefined()
  })

  it('exposes useful drawing signals and a mode-aware clear command', () => {
    expect(fieldsFor('sketchpad').map((field) => field.key)).toEqual([
      'mode',
      'mark_count',
      'has_content',
    ])
    expect(commandsFor('sketchpad').map((command) => command.key)).toEqual(['clear'])
  })
})
