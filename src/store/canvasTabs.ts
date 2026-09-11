import type { CanvasTab } from '../types/persistence'

/**
 * Canvas tabs are a device-local row of pointers into the canvases the board
 * already holds in memory. Switching a tab is a navigation, not a load: the
 * viewport still renders exactly one canvas and the camera stays parked per
 * canvas in `canvasViews`.
 *
 * One invariant makes the whole feature safe to reason about:
 * **the active tab always points at `activeCanvasId`.**
 * Every mutation below returns a triple that satisfies it, so a caller can
 * spread the result into the store without re-deriving anything.
 */
export interface CanvasTabPosition {
  openTabs: CanvasTab[]
  activeTabId: string
  activeCanvasId: string
}

interface CanvasTabInput {
  openTabs: readonly CanvasTab[]
  activeTabId: string
  activeCanvasId: string
}

/** Only membership is read, so any canvas-shaped record satisfies this. */
type CanvasIndex = Record<string, unknown>

function defaultMint(): string {
  return crypto.randomUUID()
}

/**
 * Repair the tab row against the canvases that still exist.
 *
 * Runs after every write that can remove a canvas — undo/redo, board loads,
 * workspace deletion, and the canvas-node delete cascade — because a tab is
 * the one place a canvas id survives outside the document it came from.
 * A tab whose canvas is gone is dropped; if that tab was the active one, its
 * slot is refilled by the canvas the board fell back to rather than shuffling
 * the user to the end of the row.
 */
export function resolveCanvasTabs(
  input: CanvasTabInput,
  canvases: CanvasIndex,
  mintTabId: () => string = defaultMint,
): CanvasTabPosition {
  const seenTabIds = new Set<string>()
  const surviving: CanvasTab[] = []
  let activeIndex = -1
  // Where a dropped active tab used to sit, so its replacement lands in place.
  let refillIndex = -1
  for (const tab of input.openTabs) {
    const kept = !seenTabIds.has(tab.id) && Boolean(canvases[tab.canvasId])
    if (tab.id === input.activeTabId && activeIndex < 0 && refillIndex < 0) {
      if (kept) activeIndex = surviving.length
      else refillIndex = surviving.length
    }
    if (!kept) continue
    seenTabIds.add(tab.id)
    surviving.push(tab)
  }

  // The caller normally resolves the active canvas first; fall back through
  // the surviving tabs and then the document so this is total either way.
  let activeCanvasId = input.activeCanvasId
  if (!canvases[activeCanvasId]) {
    activeCanvasId =
      surviving[Math.max(activeIndex, 0)]?.canvasId ?? Object.keys(canvases)[0] ?? ''
  }
  if (!activeCanvasId) return { openTabs: [], activeTabId: '', activeCanvasId: '' }

  if (activeIndex >= 0) {
    const active = surviving[activeIndex]!
    if (active.canvasId !== activeCanvasId) {
      surviving[activeIndex] = { ...active, canvasId: activeCanvasId }
    }
    return { openTabs: surviving, activeTabId: active.id, activeCanvasId }
  }

  const alreadyOpen = surviving.find((tab) => tab.canvasId === activeCanvasId)
  if (alreadyOpen) {
    return { openTabs: surviving, activeTabId: alreadyOpen.id, activeCanvasId }
  }

  const replacement: CanvasTab = { id: mintTabId(), canvasId: activeCanvasId }
  const at = refillIndex >= 0 ? Math.min(refillIndex, surviving.length) : surviving.length
  surviving.splice(at, 0, replacement)
  return { openTabs: surviving, activeTabId: replacement.id, activeCanvasId }
}

/**
 * Open `canvasId` in a new tab immediately right of the active one, the way a
 * browser keeps a spawned tab next to its opener. Duplicates are allowed: two
 * tabs on one canvas is a legitimate way to keep a reference open, and they
 * simply share that canvas's saved camera.
 */
export function insertCanvasTab(
  input: CanvasTabInput,
  canvasId: string,
  options: { activate?: boolean; mintTabId?: () => string } = {},
): CanvasTabPosition {
  const activate = options.activate ?? true
  const tab: CanvasTab = { id: (options.mintTabId ?? defaultMint)(), canvasId }
  const openTabs = [...input.openTabs]
  const activeIndex = openTabs.findIndex((entry) => entry.id === input.activeTabId)
  openTabs.splice(activeIndex >= 0 ? activeIndex + 1 : openTabs.length, 0, tab)
  return activate
    ? { openTabs, activeTabId: tab.id, activeCanvasId: canvasId }
    : { openTabs, activeTabId: input.activeTabId, activeCanvasId: input.activeCanvasId }
}

/**
 * Close one tab. Returns null when the close is refused so the caller can stay
 * silent: the last tab never closes, because "no canvas on screen" is not a
 * state the viewport can render.
 */
export function closeCanvasTab(input: CanvasTabInput, tabId: string): CanvasTabPosition | null {
  const index = input.openTabs.findIndex((tab) => tab.id === tabId)
  if (index < 0 || input.openTabs.length <= 1) return null
  const openTabs = input.openTabs.filter((tab) => tab.id !== tabId)
  if (tabId !== input.activeTabId) {
    return { openTabs, activeTabId: input.activeTabId, activeCanvasId: input.activeCanvasId }
  }
  // Closing the tab you are standing on hands focus to its right neighbour,
  // falling back to the left one at the end of the row.
  const next = openTabs[index] ?? openTabs[index - 1]!
  return { openTabs, activeTabId: next.id, activeCanvasId: next.canvasId }
}

/**
 * The tab `delta` steps away from the active one, wrapping around the row so
 * repeated presses cycle rather than dead-end. Returns null when there is
 * nothing to move to.
 */
export function neighbourCanvasTabId(
  openTabs: readonly CanvasTab[],
  activeTabId: string,
  delta: number,
): string | null {
  if (openTabs.length < 2) return null
  const index = openTabs.findIndex((tab) => tab.id === activeTabId)
  if (index < 0) return openTabs[0]!.id
  const count = openTabs.length
  return openTabs[(((index + delta) % count) + count) % count]!.id
}

/** Drag-reorder: lift `sourceId` out of the row and drop it where `targetId` sits. */
export function reorderCanvasTabs(
  openTabs: readonly CanvasTab[],
  sourceId: string,
  targetId: string,
): CanvasTab[] {
  if (sourceId === targetId) return [...openTabs]
  const sourceIndex = openTabs.findIndex((tab) => tab.id === sourceId)
  const source = sourceIndex < 0 ? undefined : openTabs[sourceIndex]
  const targetIndex = openTabs.findIndex((tab) => tab.id === targetId)
  if (!source || targetIndex < 0) return [...openTabs]
  const remaining = openTabs.filter((tab) => tab.id !== sourceId)
  // Dropping onto a tab to the right means taking ITS slot, because the row
  // has already closed up behind the lift. Always inserting before the target
  // would make short rightward drags look like no-ops and leave the last
  // position unreachable.
  remaining.splice(
    remaining.findIndex((tab) => tab.id === targetId) + (sourceIndex < targetIndex ? 1 : 0),
    0,
    source,
  )
  return remaining
}
