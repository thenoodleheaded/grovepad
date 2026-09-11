import {
  Code2,
  FileText,
  FolderOpen,
  Image,
  List,
  Network,
  PenLine,
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
    sizing: {
      minWidth: C * 4,
      minHeight: C * 2,
      maxWidth: C * 12,
      autoHeight: true,
      autoWidth: true,
      // Portal is one line: the name decides its width and its content decides
      // its height, so an edge to drag could only add empty glass or clip the
      // name back. The other two skins hold a picture worth sizing by hand.
      fixed: (data) => ((data as { skin?: string } | null)?.skin ?? 'portal') === 'portal',
    },
    restingFace: false,
    // The card already carries the canvas's name in its own face, so the
    // floating name row above it could only say the same thing twice.
    titleChrome: false,
    // canvasId is assigned by the store when the backing canvas is created.
    defaultData: () => ({ canvasId: '', skin: 'portal' }),
    rendererOwnedSkinDetails: ['live_thumbnail'],
    // Declared here rather than left to the generated catalogue, for the same
    // reason the Note skins are: the catalogue falls back to one icon per
    // presentation family, which put a generic sparkle where the door's folder
    // belongs. A Canvas card's mark is now also its skin trigger (the card
    // wears no name row), so the mark has to say which skin it is. The hues
    // stay in one green family — this card is a doorway first, and three
    // unrelated colours would read as three unrelated widgets.
    skinField: 'skin',
    skins: [
      {
        value: 'portal',
        label: 'Portal',
        description: 'The current simple entrance into a child canvas.',
        implementation: 'renderer-ready',
        presentation: 'standard',
        icon: FolderOpen,
        accent: '#a3e635',
      },
      {
        value: 'cover',
        label: 'Cover',
        description:
          'A large title, subtitle, accent, and last-opened summary for presentation canvases.',
        implementation: 'renderer-ready',
        presentation: 'cards',
        icon: Image,
        accent: '#7fd94b',
      },
      {
        value: 'live_thumbnail',
        label: 'Live Thumbnail',
        description: 'A miniature, non-interactive preview of the child canvas contents.',
        implementation: 'schema-extension',
        presentation: 'standard',
        icon: Network,
        accent: '#5ec95f',
      },
    ],
  },
  text: {
    type: 'text',
    label: 'Text',
    description: 'Plain, sticky, and focused writing skins in one card',
    icon: FileText,
    category: 'notes',
    accent: '#e2e8f0',
    defaultSize: { width: 320, height: C * 5 },
    sizing: { minWidth: C * 4, autoHeight: true },
    defaultData: () => ({ text: '', mode: 'plain', color: 'yellow' }),
    // Every Note skin is declared here so it wears an icon that says what it
    // is. The catalogue merge only fills gaps, and its generated entries fall
    // back to one icon per presentation family — which put a checklist on
    // Typewriter. The rest of each generated entry is repeated verbatim.
    skins: [
      { value: 'plain', label: 'Plain', icon: FileText, accent: '#e2e8f0' },
      { value: 'sticky', label: 'Sticky', icon: StickyNote, accent: '#fcd34d' },
      {
        value: 'typewriter',
        label: 'Typewriter',
        description:
          'Distraction-free long-form writing with a narrow measure and current-line focus.',
        implementation: 'renderer-ready',
        presentation: 'form',
        icon: PenLine,
        accent: '#72cfe4',
      },
    ],
  },
  bullets: {
    type: 'bullets',
    label: 'Bullets',
    description: 'Quick unordered list of short points',
    icon: List,
    category: 'notes',
    accent: '#93c5fd',
    // A point is a paragraph, so its measure is the reader's to set: the card
    // is width-draggable down to six cells, and its height still follows the
    // wrapped text rather than a dragged edge.
    defaultSize: { width: C * 6, height: C * 3 },
    sizing: { minWidth: C * 6, autoHeight: true },
    defaultData: () => ({
      items: [{ id: crypto.randomUUID(), text: 'First point' }],
      skin: 'dots',
    }),
    rendererOwnedSkinDetails: ['nested_outline'],
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
} satisfies Record<string, WidgetDefinition>
