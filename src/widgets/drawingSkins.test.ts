import { describe, expect, it } from 'vitest'
import type { ExcalidrawData, SketchpadData } from '../types/spatial'
import { consolidateWidgetData } from '../utils/consolidatedWidgetData'
import { resolveWidgetMention } from '../utils/thoughtInterpreter'
import { commandsFor, fieldsFor } from './fields'
import {
  isWidgetTypePublic,
  publicWidgetTypeFor,
  widgetDefinition,
} from './registry'

describe('Drawing widget consolidation', () => {
  it('publishes one Drawing card while preserving old Excalidraw boards', () => {
    expect(isWidgetTypePublic('sketchpad')).toBe(true)
    expect(publicWidgetTypeFor('excalidraw')).toBe('sketchpad')
    expect(isWidgetTypePublic('excalidraw')).toBe(false)
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

  it('converts standalone Excalidraw scenes without losing elements', () => {
    const legacy: ExcalidrawData = {
      elements: [{ id: 'shape-one' }] as unknown as ExcalidrawData['elements'],
      appState: { viewBackgroundColor: '#fff' },
      files: [],
      updatedAt: '2026-07-25T00:00:00.000Z',
    }
    const converted = consolidateWidgetData('excalidraw', legacy)
    expect(converted.type).toBe('sketchpad')
    expect((converted.data as SketchpadData).mode).toBe('diagram')
    expect((converted.data as SketchpadData).diagram).toEqual(legacy)
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
