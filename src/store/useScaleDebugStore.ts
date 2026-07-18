import { create } from 'zustand'
import type { Size } from '../types/spatial'

export type ScaleEventKind =
  | 'resize-request' // every call into the store's resizeWidget, from any caller
  | 'scale-state' // full <-> pill <-> icon transition
  | 'pointer-resize' // one committed frame of a manual drag on the resize handle
  | 'content-floor' // a content-floor measurement pass, whether or not it resized

export interface ScaleDebugEntry {
  id: string
  t: number
  widgetId: string
  widgetType: string
  kind: ScaleEventKind
  before: Size | null
  after: Size | null
  zoom: number
  /** Every input variable the responsible code actually used, kind-specific
   * (e.g. dx/dy/lockHeight for a pointer-resize, natural/scrollHeight/overflow
   * for a content-floor pass, requested/snapped/clamped for a resize-request). */
  detail: Record<string, number | string | boolean | null>
  anomalies: string[]
}

/** Full per-widget state, resampled on a fixed cadence while the panel is
 * open — the "every variable, once a second" heartbeat, independent of
 * whether any resize event fired. Catches drift a discrete event would miss:
 * a store/DOM desync, a stale registry bound, a collapsed size that no
 * longer matches its pill. */
export interface ScaleDebugSnapshot {
  widgetId: string
  widgetType: string
  title: string
  t: number
  size: Size
  collapsed: boolean
  iconified: boolean
  locked: boolean
  mounted: boolean
  registryDefaultSize: Size
  registrySizing: { minWidth?: number; minHeight?: number; maxWidth?: number; maxHeight?: number; autoHeight?: boolean }
  liveSizing: { minWidth?: number; minHeight?: number } | null
  effectiveSizing: { minWidth?: number; minHeight?: number; maxWidth?: number; maxHeight?: number; autoHeight?: boolean }
  dataFloor: Size
  domSizePx: Size | null
  domStoreDeltaWorldPx: Size | null
  naturalContentHeight: number | null
  uiScrollHeight: number | null
  uiClientHeight: number | null
  overflowY: number | null
  anomalies: string[]
}

const MAX_ENTRIES = 500

interface ScaleDebugState {
  entries: ScaleDebugEntry[]
  snapshot: ScaleDebugSnapshot[]
  snapshotAt: number
  isOpen: boolean
  anomaliesOnly: boolean
  record: (entry: Omit<ScaleDebugEntry, 'id' | 't'>) => void
  setSnapshot: (snapshot: ScaleDebugSnapshot[]) => void
  setOpen: (open: boolean) => void
  toggleOpen: () => void
  setAnomaliesOnly: (value: boolean) => void
  clear: () => void
}

/**
 * Live trace of the whole-card scaling system: every resizeWidget call,
 * every full/pill/icon transition, every manual drag frame, and every
 * content-floor measurement pass, plus a per-second full-state snapshot of
 * every widget on the active canvas. Toggled with `S`, rendered by
 * ScaleDebugPanel, exposed on the dev-only `__grovepad` hook.
 *
 * Recording is unconditional (like useAiDebugStore) so opening the panel
 * mid-session still shows recent history; the ring buffer keeps the cost
 * bounded. The expensive per-widget DOM/content-floor sweep that fills
 * `snapshot` only runs from ScaleDebugPanel's own interval, which does not
 * mount until the panel is open — zero cost while the panel is closed.
 *
 * Unlike useAiDebugStore, `record` itself is gated on `isOpen`: a manual
 * resize drag calls resizeWidget up to once per animation frame, so an
 * always-on trace would mean every ordinary resize — debugging or not —
 * pays an allocation per frame. The intended workflow is open the panel
 * (`S`) first, then scale things up and down, so nothing about "show me the
 * bug that just happened" is lost — only history from before the panel was
 * ever opened this session.
 */
export const useScaleDebugStore = create<ScaleDebugState>()((set, get) => ({
  entries: [],
  snapshot: [],
  snapshotAt: 0,
  isOpen: false,
  anomaliesOnly: false,
  record: (entry) => {
    if (!get().isOpen) return
    set((state) => ({
      entries: [
        { ...entry, id: crypto.randomUUID(), t: Date.now() },
        ...state.entries,
      ].slice(0, MAX_ENTRIES),
    }))
  },
  setSnapshot: (snapshot) => set({ snapshot, snapshotAt: Date.now() }),
  setOpen: (isOpen) => set((state) => (state.isOpen === isOpen ? state : { isOpen })),
  toggleOpen: () => set((state) => ({ isOpen: !state.isOpen })),
  setAnomaliesOnly: (anomaliesOnly) => set((state) => (state.anomaliesOnly === anomaliesOnly ? state : { anomaliesOnly })),
  clear: () => set((state) => (state.entries.length === 0 && state.snapshot.length === 0 ? state : { entries: [], snapshot: [] })),
}))
