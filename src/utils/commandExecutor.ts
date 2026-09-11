import { screenToWorld, type Vector2D } from '../types/spatial'
import { useCanvasStore } from '../store/useCanvasStore'
import { useCanvasTreeStore } from '../store/useCanvasTreeStore'
import { useCircuitStore } from '../store/useCircuitStore'
import { useSettingsStore } from '../store/useSettingsStore'
import { useWidgetStore } from '../store/useWidgetStore'
import { widgetDefinition } from '../widgets/registry'
import { dataWearingSkin } from './widgetSkins'
import { GRID_SIZE } from '../types/canvas'
import type { AlignMode, DistributeAxis } from './widgetAlignment'
import type { ParsedCommand } from './commandLine'
import { frameCanvas } from './cameraFraming'
import { leapToSearchResult } from './searchLeap'
import { fuzzyScore } from '../store/widgetSizing'
import { neighbourCanvasTabId } from '../store/canvasTabs'

/**
 * Executes a parsed Quick Add command against the public store actions —
 * the exact functions the buttons and menus already call, so a typed command
 * and a clicked control are indistinguishable to history, persistence, and
 * collaborators. Nothing here mutates state directly.
 */

export interface CommandResult {
  ok: boolean
  /** Toast copy: what just happened, in plain words. */
  message: string
  /** True when ⌘Z reverses it — the toast then offers Undo. */
  undoable: boolean
}

const done = (message: string, undoable = false): CommandResult => ({ ok: true, message, undoable })
const failed = (message: string): CommandResult => ({ ok: false, message, undoable: false })

/** The world point at the middle of the screen — where created cards land. */
function viewCenterWorld(): Vector2D {
  const { pan, zoom, viewportSize } = useCanvasStore.getState()
  return screenToWorld(
    { x: viewportSize.width / 2, y: viewportSize.height / 2 },
    { x: pan.x, y: pan.y, zoom },
  )
}

function selectedIds(): string[] {
  return [...useWidgetStore.getState().selectedIds]
}

function cardNoun(count: number): string {
  return count === 1 ? '1 card' : `${count} cards`
}

export function executeCommand(parse: ParsedCommand): CommandResult {
  const { spec, args } = parse
  const widgetStore = useWidgetStore.getState()
  const ids = selectedIds()

  switch (spec.id) {
    case 'add': {
      const types = args.widgetTypes ?? []
      if (types.length === 0) return failed('Name a widget to add')
      const center = viewCenterWorld()
      const created: string[] = []
      let offsetX = 0
      for (const type of types) {
        const def = widgetDefinition(type)
        const title = types.length === 1 && args.text ? args.text : def.label
        const id = useWidgetStore.getState().createWidget(
          title,
          { x: center.x + offsetX, y: center.y },
          type,
        )
        created.push(id)
        offsetX += def.defaultSize.width + GRID_SIZE
      }
      useWidgetStore.getState().selectWidgets(created)
      return done(created.length === 1 ? 'Added 1 card' : `Added ${created.length} cards`, true)
    }

    case 'duplicate': {
      const copies = widgetStore.duplicateWidgets(ids)
      return done(`Duplicated ${cardNoun(copies.length)}`, true)
    }

    case 'glue': {
      if (ids.length < 2) return failed('Select at least 2 cards first')
      // Its own undo step, so the toast's Undo takes back the weld and nothing
      // else; false means these cards were already one cluster.
      if (!useWidgetStore.getState().glueSelection(ids)) return failed('These cards are already glued together')
      return done(`Glued ${cardNoun(ids.length)} into one cluster`, true)
    }

    case 'unglue': {
      let released = 0
      for (const id of ids) {
        if (useWidgetStore.getState().unglueWidget(id)) released += 1
      }
      return released > 0
        ? done(`Unglued ${cardNoun(released)}`, true)
        : failed('Nothing here is glued')
    }

    case 'skin': {
      if (!args.skin) return failed('Which skin?')
      let dressed = 0
      for (const id of ids) {
        const widget = useWidgetStore.getState().widgets[id]
        if (!widget) continue
        const def = widgetDefinition(widget.type)
        useWidgetStore.getState().updateWidgetData(id, dataWearingSkin(widget, args.skin, def))
        dressed += 1
      }
      return done(`Changed the skin on ${cardNoun(dressed)}`, true)
    }

    case 'rename': {
      const id = ids[0]
      if (!id || !args.text) return failed('Select a card and give it a name')
      widgetStore.updateWidgetTitle(id, args.text)
      return done(`Renamed to “${args.text}”`, true)
    }

    case 'open':
    case 'iconify': {
      const target = spec.id === 'open' ? 'full' as const : 'icon' as const
      for (const id of ids) useWidgetStore.getState().setWidgetScaleState(id, target)
      return done(spec.id === 'open' ? `Opened ${cardNoun(ids.length)}` : `Folded ${cardNoun(ids.length)} to icons`, true)
    }

    case 'pin':
    case 'unpin': {
      const wantPinned = spec.id === 'pin'
      let flipped = 0
      for (const id of ids) {
        const widget = useWidgetStore.getState().widgets[id]
        if (!widget || Boolean(widget.metadata.pinned) === wantPinned) continue
        useWidgetStore.getState().toggleWidgetPinned(id)
        flipped += 1
      }
      return flipped > 0
        ? done(`${wantPinned ? 'Pinned' : 'Unpinned'} ${cardNoun(flipped)}`, true)
        : done(wantPinned ? 'Already pinned' : 'Nothing was pinned', false)
    }

    case 'lock':
    case 'unlock':
      widgetStore.lockWidgets(ids, spec.id === 'lock')
      return done(`${spec.id === 'lock' ? 'Locked' : 'Unlocked'} ${cardNoun(ids.length)}`, true)

    case 'favorite':
    case 'unfavorite': {
      const wantFavorite = spec.id === 'favorite'
      let flipped = 0
      for (const id of ids) {
        const widget = useWidgetStore.getState().widgets[id]
        if (!widget || Boolean(widget.metadata.favorite) === wantFavorite) continue
        useWidgetStore.getState().toggleWidgetFavorite(id)
        flipped += 1
      }
      return flipped > 0
        ? done(`${wantFavorite ? 'Starred' : 'Unstarred'} ${cardNoun(flipped)}`, true)
        : done(wantFavorite ? 'Already starred' : 'Nothing was starred', false)
    }

    case 'done':
    case 'undone':
      widgetStore.updateWidgetsMetadata(ids, { completed: spec.id === 'done' })
      return done(spec.id === 'done' ? `Marked ${cardNoun(ids.length)} done` : `Reopened ${cardNoun(ids.length)}`, true)

    case 'delete':
      widgetStore.deleteWidgets(ids)
      return done(`Deleted ${cardNoun(ids.length)}`, true)

    case 'cut':
      widgetStore.cutWidgets(ids)
      return done(`Cut ${cardNoun(ids.length)} — paste puts them back`, true)

    case 'undo':
      widgetStore.undo()
      return done('Undone', false)

    case 'redo':
      widgetStore.redo()
      return done('Redone', false)

    case 'select-all': {
      if (args.choice === 'none') {
        widgetStore.clearSelection()
        return done('Selection cleared', false)
      }
      const state = useWidgetStore.getState()
      const all = Object.values(state.widgets)
        .filter((widget) => widget.canvasId === state.activeCanvasId)
        .map((widget) => widget.id)
      state.selectWidgets(all)
      return done(`Selected ${cardNoun(all.length)}`, false)
    }

    case 'deselect':
      widgetStore.clearSelection()
      return done('Selection cleared', false)

    case 'align':
      widgetStore.alignSelection(args.choice as AlignMode)
      return done(`Aligned ${cardNoun(ids.length)}`, true)

    case 'distribute':
      widgetStore.distributeSelection(args.choice as DistributeAxis)
      return done(`Spaced ${cardNoun(ids.length)} evenly`, true)

    case 'untangle':
      if (ids.length > 0) widgetStore.untangleWidgets(ids)
      else widgetStore.untangleCanvas()
      return done(ids.length > 0 ? `Untangled ${cardNoun(ids.length)}` : 'Untangled the canvas', true)

    case 'tidy':
      widgetStore.untangleCanvas()
      return done('Tidied the canvas', true)

    case 'snap':
      for (const id of ids) useWidgetStore.getState().snapWidgetToGrid(id)
      return done(`Snapped ${cardNoun(ids.length)} to the grid`, true)

    case 'nudge': {
      const cells = args.amount ?? 1
      const step = GRID_SIZE * cells
      const delta = {
        left: { x: -step, y: 0 }, right: { x: step, y: 0 },
        up: { x: 0, y: -step }, down: { x: 0, y: step },
      }[args.choice ?? 'right'] ?? { x: 0, y: 0 }
      widgetStore.nudgeSelection(delta.x, delta.y)
      return done(`Nudged ${cardNoun(ids.length)} ${args.choice}`, true)
    }

    case 'frame': {
      const canvas = useCanvasStore.getState()
      if (ids.length === 0) {
        // Frame what is actually on the board — fitAll() jumps to the world
        // origin at 100%, which can be empty space on a board built elsewhere.
        frameCanvas('board')
        return done('Framed the board', false)
      }
      const state = useWidgetStore.getState()
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const id of ids) {
        const widget = state.widgets[id]
        if (!widget) continue
        minX = Math.min(minX, widget.position.x)
        minY = Math.min(minY, widget.position.y)
        maxX = Math.max(maxX, widget.position.x + widget.size.width)
        maxY = Math.max(maxY, widget.position.y + widget.size.height)
      }
      if (!Number.isFinite(minX)) return failed('Nothing to frame')
      canvas.fitRect({ x: minX, y: minY, width: maxX - minX, height: maxY - minY }, 120, true)
      return done('Framed the selection', false)
    }

    case 'fit':
      frameCanvas('board')
      return done('Fit the board on screen', false)

    case 'zoom': {
      const canvas = useCanvasStore.getState()
      const focal = {
        x: canvas.viewportSize.width / 2,
        y: canvas.viewportSize.height / 2,
      }
      if (args.choice === 'in' || args.choice === 'out') {
        const next = args.choice === 'in' ? canvas.zoom * 1.25 : canvas.zoom / 1.25
        canvas.zoomToAnimated(next, focal)
        return done(args.choice === 'in' ? 'Zoomed in' : 'Zoomed out', false)
      }
      canvas.zoomToAnimated((args.amount ?? 100) / 100, focal)
      return done(`Zoomed to ${args.amount}%`, false)
    }

    case 'back':
      useCanvasStore.getState().goBack()
      return done('Went back', false)

    case 'forward':
      useCanvasStore.getState().goForward()
      return done('Went forward', false)

    case 'home':
      useCanvasStore.getState().animateView({ x: 0, y: 0 }, 1)
      return done('Back at the origin', false)

    case 'circuit': {
      useCircuitStore.getState().toggleCircuitMode()
      return done(useCircuitStore.getState().circuitMode ? 'Circuit mode on' : 'Circuit mode off', false)
    }

    case 'library':
      widgetStore.openAddWidget(viewCenterWorld())
      return done('Widget library', false)

    case 'recipes':
      widgetStore.setRecipesOpen(true)
      return done('Recipes', false)

    case 'settings':
      useSettingsStore.getState().setOpen(true)
      return done('Settings', false)

    case 'help':
      widgetStore.setShortcutsOpen(true)
      return done('Controls reference', false)

    case 'tree':
      useCanvasTreeStore.getState().setOpen(true)
      return done('Canvas tree', false)

    case 'find':
      // `find landlord` opens search already filled in and searching; a bare
      // `find` opens it empty, exactly as before.
      if (args.text) {
        widgetStore.openPaletteSearch(args.text)
        return done(`Searching for “${args.text}”`, false)
      }
      widgetStore.setPaletteOpen(true)
      return done('Search', false)

    case 'go': {
      if (!args.text) return failed('Go where? Name a canvas or card')
      const results = widgetStore.searchWidgets(args.text)
      let target = results[0]
      if (!target) return failed(`Nothing called “${args.text}” in this workspace`)
      // A canvas door card and its backing canvas share a title (renameCanvas
      // mirrors them). "go" means enter the place, not select its door.
      const canvasTwin = results.find(
        (result) => result.type === 'canvas' && result.title.toLowerCase() === target!.title.toLowerCase(),
      )
      if (canvasTwin) target = canvasTwin
      leapToSearchResult(target)
      return done(
        target.type === 'canvas' ? `Opened “${target.title}”` : `Jumped to “${target.title}”`,
        false,
      )
    }

    case 'switch': {
      if (!args.text) return failed('Which workspace? — “switch Personal”')
      const state = useWidgetStore.getState()
      let best: { id: string; name: string } | null = null
      let bestScore = 0
      for (const workspace of Object.values(state.workspaces)) {
        const score = fuzzyScore(args.text, workspace.name)
        if (score > bestScore) {
          best = workspace
          bestScore = score
        }
      }
      if (!best) return failed(`No workspace called “${args.text}”`)
      if (best.id === state.activeWorkspaceId) return done(`Already in “${best.name}”`, false)
      state.switchWorkspace(best.id)
      return done(`Switched to “${best.name}”`, false)
    }

    case 'next-tab':
    case 'previous-tab': {
      const state = useWidgetStore.getState()
      const nextTabId = neighbourCanvasTabId(
        state.openTabs,
        state.activeTabId,
        spec.id === 'next-tab' ? 1 : -1,
      )
      if (!nextTabId) return failed('This is the only tab')
      state.activateCanvasTab(nextTabId)
      const landed = useWidgetStore.getState()
      return done(`Now on “${landed.canvases[landed.activeCanvasId]?.name ?? 'canvas'}”`, false)
    }

    case 'close-tab': {
      const state = useWidgetStore.getState()
      if (state.openTabs.length <= 1) return failed('This is the only tab')
      state.closeCanvasTab(state.activeTabId)
      return done('Closed the tab', false)
    }

    case 'open-tab': {
      if (!args.text) return failed('Which canvas? — “tab Research”')
      const state = useWidgetStore.getState()
      let best: { id: string; name: string } | null = null
      let bestScore = 0
      for (const canvas of Object.values(state.canvases)) {
        if (canvas.workspaceId !== state.activeWorkspaceId) continue
        const score = fuzzyScore(args.text, canvas.name)
        if (score > bestScore) {
          best = canvas
          bestScore = score
        }
      }
      if (!best) return failed(`No canvas called “${args.text}” in this workspace`)
      state.openCanvasTab(best.id, { activate: true })
      return done(`Opened “${best.name}” in a new tab`, false)
    }

    case 'import':
      widgetStore.setImportOpen(true)
      return done('Import', false)

    case 'canvas': {
      if (!args.text) return failed('Name the canvas')
      const id = widgetStore.createWidget(args.text, viewCenterWorld(), 'canvas_node')
      useWidgetStore.getState().selectWidgets([id])
      return done(`Created canvas “${args.text}”`, true)
    }

    case 'rename-canvas': {
      if (!args.text) return failed('Name the canvas')
      const state = useWidgetStore.getState()
      state.renameCanvas(state.activeCanvasId, args.text)
      return done(`Canvas renamed to “${args.text}”`, false)
    }

    default:
      return failed('That command is not wired up yet')
  }
}
