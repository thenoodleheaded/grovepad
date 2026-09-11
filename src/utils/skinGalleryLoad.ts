import type { HydratedPersistedBoard } from '../types/persistence'
import type { DomainPack } from '../types/spatial'
import { useWidgetStore } from '../store/useWidgetStore'
import { useToastStore } from '../store/useToastStore'
import { parsePersistedBoard } from './persistedBoardSchema'

// ---------------------------------------------------------------------------
// Skin Gallery — the reference workspace that shows every widget wearing every
// skin, twice: once pinned open, once resting.
//
// The gallery is generated outside the app (`npm run demo:skins`) and served
// as a plain fragment, because it is reference material rather than product
// data — regenerating it must never mean shipping a megabyte of sample cards
// inside the bundle. Loading ADDS a workspace: everything already on the board
// is carried across untouched, and re-loading replaces only the gallery's own
// records, so the button is safe to press twice.
//
// The fetched fragment is untrusted input like any other file, so the merged
// board is validated through `parsePersistedBoard` before it reaches the
// store. A gallery that fails validation is refused whole.
// ---------------------------------------------------------------------------

/** Every id the gallery owns carries this prefix, so a reload can replace them. */
const GALLERY_PREFIX = 'skinlab-'
const GALLERY_URL = '/skin-gallery.json'

interface GalleryFragment {
  workspace: { id: string; name: string; rootCanvasId: string; createdAt: number }
  canvases: Record<string, unknown>
  widgets: Record<string, unknown>
  activePacks?: DomainPack[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFragment(value: unknown): value is GalleryFragment {
  if (!isRecord(value) || !isRecord(value.canvases) || !isRecord(value.widgets)) return false
  const workspace = value.workspace
  return (
    isRecord(workspace) &&
    typeof workspace.id === 'string' &&
    typeof workspace.name === 'string' &&
    typeof workspace.rootCanvasId === 'string'
  )
}

/** Drop the previous gallery so a reload replaces it instead of doubling it. */
function withoutGallery<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([id]) => !id.startsWith(GALLERY_PREFIX)))
}

/**
 * Add (or refresh) the Skin Gallery workspace on the live board.
 *
 * Resolves true once the workspace is on the board. Every failure path is
 * reported as a toast and leaves the board exactly as it was.
 */
export async function loadSkinGallery(): Promise<boolean> {
  const toast = useToastStore.getState()
  let fragment: unknown
  try {
    const response = await fetch(GALLERY_URL, { cache: 'no-store' })
    if (!response.ok) throw new Error(String(response.status))
    fragment = await response.json()
  } catch {
    toast.addToast('The Skin Gallery file is missing — run “npm run demo:skins” first', {
      tone: 'danger',
    })
    return false
  }

  if (!isFragment(fragment)) {
    toast.addToast('That Skin Gallery file is not readable', { tone: 'danger' })
    return false
  }

  const state = useWidgetStore.getState()
  const merged: unknown = {
    workspaces: { ...withoutGallery(state.workspaces), [fragment.workspace.id]: fragment.workspace },
    canvases: { ...withoutGallery(state.canvases), ...fragment.canvases },
    widgets: { ...withoutGallery(state.widgets), ...fragment.widgets },
    relations: withoutGallery(state.relations),
    connections: withoutGallery(state.connections),
    glues: withoutGallery(state.glues),
    activePacks: [...new Set([...state.activePacks, ...(fragment.activePacks ?? [])])],
    activeWorkspaceId: fragment.workspace.id,
    activeCanvasId: fragment.workspace.rootCanvasId,
    canvasViews: {},
  }

  const board: HydratedPersistedBoard | null = parsePersistedBoard(merged)
  if (!board) {
    toast.addToast('That Skin Gallery file did not pass validation', { tone: 'danger' })
    return false
  }

  useWidgetStore.getState().loadBoard(board)
  useWidgetStore.getState().switchWorkspace(fragment.workspace.id)
  toast.addToast(`Skin Gallery added — ${Object.keys(fragment.canvases).length} canvases`)
  return true
}
