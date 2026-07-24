import {
  Code2,
  FileText,
  FolderOpen,
  List,
  Quote,
  StickyNote,
} from 'lucide-react'
import type { WidgetDefinition } from '../contracts/registry'
import { C } from './definitionHelpers'

/** Structure and notes widgets (canvas_node … sticky_note). Extracted verbatim from registry.ts; key order preserved. */
export const STRUCTURE_NOTES_WIDGET_DEFINITIONS = {
  canvas_node: {
    type: 'canvas_node',
    label: 'Canvas',
    description: 'A whole board inside a card — click its name to enter it',
    icon: FolderOpen,
    category: 'structure',
    accent: '#a3e635',
    defaultSize: { width: 280, height: C * 2 },
    sizing: { minWidth: C * 4, minHeight: C * 2, maxHeight: C * 2 },
    // canvasId is assigned by the store when the backing canvas is created.
    defaultData: () => ({ canvasId: '' }),
  },
  notes: {
    type: 'notes',
    label: 'Note',
    description: 'Plain, sticky, and quote skins in one writing card',
    icon: FileText,
    category: 'notes',
    accent: '#e2e8f0',
    defaultSize: { width: 320, height: C * 5 },
    sizing: { minWidth: C * 4, autoHeight: true },
    defaultData: () => ({ text: '', mode: 'plain', color: 'yellow', attribution: '' }),
    skins: [
      { value: 'plain', label: 'Plain', icon: FileText, accent: '#e2e8f0' },
      { value: 'sticky', label: 'Sticky', icon: StickyNote, accent: '#fcd34d' },
      { value: 'quote', label: 'Quote', icon: Quote, accent: '#c4b5fd' },
    ],
  },
  bullets: {
    type: 'bullets',
    label: 'Bullets',
    description: 'Quick unordered list of short points',
    icon: List,
    category: 'notes',
    accent: '#93c5fd',
    // Bullets are a column of points and nothing else — the card is exactly
    // its list, so there is no edge worth dragging.
    defaultSize: { width: C * 6, height: C * 3 },
    sizing: { minWidth: C * 5, autoHeight: true, fixed: true },
    defaultData: () => ({ items: [{ id: crypto.randomUUID(), text: 'First point' }] }),
  },
  quote: {
    type: 'quote',
    label: 'Quote',
    description: 'A pull-quote or callout with attribution',
    icon: Quote,
    category: 'notes',
    accent: '#fbcfe8',
    defaultSize: { width: 320, height: C * 4 },
    defaultData: () => ({ text: 'The canvas stretches on, in every direction.', attribution: '' }),
  },
  code: {
    type: 'code',
    label: 'Code Snippet',
    description: 'Monospace code block with a language tag',
    icon: Code2,
    category: 'notes',
    accent: '#7dd3fc',
    defaultSize: { width: 360, height: C * 5 },
    defaultData: () => ({ language: 'ts', code: '' }),
  },
  sticky_note: {
    type: 'sticky_note',
    label: 'Sticky Note',
    description: 'A quick colored note — pick a hue, jot it down',
    icon: StickyNote,
    category: 'notes',
    accent: '#fde047',
    defaultSize: { width: 260, height: C * 4 },
    sizing: { minWidth: C * 4, autoHeight: true },
    defaultData: () => ({ text: '', color: 'yellow' }),
  },
} satisfies Record<string, WidgetDefinition>
