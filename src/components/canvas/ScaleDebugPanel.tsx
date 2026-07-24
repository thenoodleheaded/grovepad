import { useEffect, useMemo, useState } from 'react'
import { ClipboardCopy, Ruler, Trash2 } from 'lucide-react'
import { useCanvasStore } from '../../store/useCanvasStore'
import { useScaleDebugStore, type ScaleDebugEntry, type ScaleDebugSnapshot } from '../../store/useScaleDebugStore'
import { useToastStore } from '../../store/useToastStore'
import { useWidgetStore } from '../../store/useWidgetStore'
import { computeScaleDebugSnapshot } from '../../utils/scaleDebugSnapshot'

const SNAPSHOT_INTERVAL_MS = 1000

const KIND_LABEL: Record<ScaleDebugEntry['kind'], string> = {
  'resize-request': 'resize',
  'scale-state': 'scale-state',
  'pointer-resize': 'drag',
  'content-floor': 'content-floor',
}

const KIND_TONE: Record<ScaleDebugEntry['kind'], string> = {
  'resize-request': 'bg-sky-500/15 text-sky-300',
  'scale-state': 'bg-violet-500/15 text-violet-300',
  'pointer-resize': 'bg-amber-500/15 text-amber-300',
  'content-floor': 'bg-emerald-500/15 text-emerald-300',
}

function fmtSize(size: { width: number; height: number } | null): string {
  if (!size) return '—'
  return `${Math.round(size.width)}×${Math.round(size.height)}`
}

function fmtClock(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString(undefined, { hour12: false }) + '.' + String(epochMs % 1000).padStart(3, '0')
}

function formatDetail(detail: ScaleDebugEntry['detail']): string {
  return Object.entries(detail)
    .filter(([, v]) => v !== null)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ')
}

function buildReport(entries: ScaleDebugEntry[], snapshot: ScaleDebugSnapshot[]): string {
  const lines: string[] = []
  lines.push(`# Scale debug report — ${new Date().toLocaleString()}`)
  lines.push('')
  const flagged = snapshot.filter((s) => s.anomalies.length > 0)
  lines.push(`## Live snapshot anomalies (${flagged.length}/${snapshot.length} widgets flagged)`)
  for (const s of flagged) {
    lines.push(
      `- ${s.widgetType} (${s.widgetId.slice(0, 8)}) "${s.title}" size=${fmtSize(s.size)} ` +
      `registry=[${s.registrySizing.minWidth ?? '-'}..${s.registrySizing.maxWidth ?? '-'} x ${s.registrySizing.minHeight ?? '-'}..${s.registrySizing.maxHeight ?? '-'}] ` +
      `live=${s.liveSizing ? `${s.liveSizing.minWidth ?? '-'}x${s.liveSizing.minHeight ?? '-'}` : 'none'} ` +
      `dataFloor=${fmtSize(s.dataFloor)} dom=${fmtSize(s.domSizePx)} domDelta=${s.domStoreDeltaWorldPx ? fmtSize(s.domStoreDeltaWorldPx) : 'none'} ` +
      `natural=${s.naturalContentHeight ?? '-'} scrollH=${s.uiScrollHeight ?? '-'} clientH=${s.uiClientHeight ?? '-'} overflowY=${s.overflowY ?? '-'} ` +
      `iconified=${s.iconified} locked=${s.locked} mounted=${s.mounted} ` +
      `— [${s.anomalies.join(', ')}]`,
    )
  }
  lines.push('')
  const flaggedEntries = entries.filter((e) => e.anomalies.length > 0).slice(0, 60)
  lines.push(`## Recent flagged events (${flaggedEntries.length} of ${entries.length} total)`)
  for (const e of flaggedEntries) {
    lines.push(
      `- ${fmtClock(e.t)} ${e.kind} ${e.widgetType} (${e.widgetId.slice(0, 8)}) ` +
      `${fmtSize(e.before)} → ${fmtSize(e.after)} zoom=${e.zoom.toFixed(2)} ${formatDetail(e.detail)} ` +
      `— [${e.anomalies.join(', ')}]`,
    )
  }
  lines.push('')
  lines.push(`## All events, most recent first (${Math.min(entries.length, 150)} shown)`)
  for (const e of entries.slice(0, 150)) {
    lines.push(
      `${fmtClock(e.t)} ${e.kind} ${e.widgetType} ${fmtSize(e.before)} → ${fmtSize(e.after)} ${formatDetail(e.detail)}` +
      (e.anomalies.length ? ` [${e.anomalies.join(', ')}]` : ''),
    )
  }
  return lines.join('\n')
}

/**
 * Live trace of the whole-card scaling system, toggled with `S` (like the AI
 * debugger's `I`). Two views: a per-second full-state snapshot of every
 * widget on the active canvas (registry bounds, live content floor, DOM vs
 * store size, content overflow — every variable the scaling code reasons
 * with, whether or not anything just resized), and a ring buffer of every
 * discrete scaling event (manual drag frames, store resizeWidget calls,
 * scale-state transitions, content-floor decisions) with automatic anomaly
 * flags. "Copy report" serializes both to plain text for pasting elsewhere.
 */
export function ScaleDebugPanel() {
  const entries = useScaleDebugStore((state) => state.entries)
  const snapshot = useScaleDebugStore((state) => state.snapshot)
  const anomaliesOnly = useScaleDebugStore((state) => state.anomaliesOnly)
  const [tab, setTab] = useState<'snapshot' | 'events'>('snapshot')

  useEffect(() => {
    const tick = () => {
      const state = useWidgetStore.getState()
      const zoom = useCanvasStore.getState().zoom
      const widgets = Object.values(state.widgets).filter((w) => w.canvasId === state.activeCanvasId)
      const next = widgets.map((widget) => {
        const el = document.querySelector<HTMLElement>(`[data-widget-id="${widget.id}"].gp-widget-card`)
        return computeScaleDebugSnapshot(widget, zoom, el)
      })
      useScaleDebugStore.getState().setSnapshot(next)
    }
    tick()
    const id = window.setInterval(tick, SNAPSHOT_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [])

  const sortedSnapshot = useMemo(
    () => [...snapshot].sort((a, b) => b.anomalies.length - a.anomalies.length || a.widgetType.localeCompare(b.widgetType)),
    [snapshot],
  )
  const visibleSnapshot = anomaliesOnly ? sortedSnapshot.filter((s) => s.anomalies.length > 0) : sortedSnapshot
  const visibleEntries = anomaliesOnly ? entries.filter((e) => e.anomalies.length > 0) : entries
  const anomalyCount = snapshot.reduce((sum, s) => sum + (s.anomalies.length > 0 ? 1 : 0), 0)
    + entries.reduce((sum, e) => sum + (e.anomalies.length > 0 ? 1 : 0), 0)
  const zoom = useCanvasStore((state) => state.zoom)

  const copyReport = () => {
    const report = buildReport(entries, snapshot)
    navigator.clipboard.writeText(report)
      .then(() => useToastStore.getState().addToast('Scale debug report copied'))
      .catch(() => useToastStore.getState().addToast('Could not copy report'))
  }

  return (
    <div
      data-canvas-ui
      className="gp-popup-surface gp-dialog gp-panel absolute right-4 top-28 z-10 flex w-[520px] max-w-[calc(100vw-2rem)] select-none flex-col overflow-hidden rounded-2xl shadow-xl"
    >
      <div className="flex items-center gap-2 border-b gp-hairline px-3 py-2  text-xs text-neutral-400">
        <Ruler size={13} className={anomalyCount > 0 ? 'text-red-400' : 'text-emerald-400'} aria-hidden />
        <span className="font-semibold text-neutral-300">Scale debug</span>
        <span className="tabular-nums">{snapshot.length} widgets</span>
        <span className="tabular-nums">{entries.length} events</span>
        {anomalyCount > 0 && <span className="tabular-nums text-red-400">{anomalyCount} flagged</span>}
        <span className="ml-auto tabular-nums text-neutral-600">zoom {zoom.toFixed(2)}×</span>
        <button
          type="button"
          aria-label="Copy debug report"
          onClick={copyReport}
          className="rounded p-1 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
        >
          <ClipboardCopy size={12} aria-hidden />
        </button>
        <button
          type="button"
          aria-label="Clear scale debug log"
          onClick={() => useScaleDebugStore.getState().clear()}
          className="rounded p-1 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
        >
          <Trash2 size={12} aria-hidden />
        </button>
      </div>

      <div className="flex items-center gap-1 border-b gp-hairline bg-neutral-950/30 px-3 py-1.5  text-[10px]">
        {(['snapshot', 'events'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded px-2 py-0.5 transition-colors ${tab === t ? 'bg-neutral-700/60 text-neutral-100' : 'text-neutral-500 hover:text-neutral-300'}`}
          >
            {t === 'snapshot' ? 'live snapshot' : 'event log'}
          </button>
        ))}
        <button
          type="button"
          onClick={() => useScaleDebugStore.getState().setAnomaliesOnly(!anomaliesOnly)}
          className={`ml-auto rounded px-2 py-0.5 transition-colors ${anomaliesOnly ? 'bg-red-500/20 text-red-300' : 'text-neutral-500 hover:text-neutral-300'}`}
        >
          anomalies only
        </button>
        <span className="text-neutral-600">S to hide</span>
      </div>

      {tab === 'snapshot' ? (
        visibleSnapshot.length === 0 ? (
          <p className="px-3 py-4 text-center text-[11px] text-neutral-600">
            {anomaliesOnly ? 'No anomalies right now.' : 'No widgets on this canvas.'}
          </p>
        ) : (
          <ul className="max-h-[60vh] overflow-y-auto">
            {visibleSnapshot.map((s) => (
              <li key={s.widgetId} className="border-b gp-hairline px-3 py-1.5  text-[10px] last:border-b-0">
                <div className="flex items-center gap-2">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.anomalies.length > 0 ? 'bg-red-400' : s.mounted ? 'bg-emerald-500' : 'bg-neutral-600'}`} aria-hidden />
                  <span className="shrink-0 text-neutral-300">{s.widgetType}</span>
                  <span className="min-w-0 flex-1 truncate text-neutral-600">{s.title}</span>
                  <span className="shrink-0 tabular-nums text-neutral-300">{fmtSize(s.size)}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 pl-3.5 text-neutral-600">
                  <span>
                    bounds {s.registrySizing.minWidth ?? '·'}..{s.registrySizing.maxWidth ?? '·'} × {s.registrySizing.minHeight ?? '·'}..{s.registrySizing.maxHeight ?? '·'}
                    {s.registrySizing.autoHeight ? ' auto' : ''}
                  </span>
                  {s.liveSizing && <span>live-min {s.liveSizing.minWidth ?? '·'}×{s.liveSizing.minHeight ?? '·'}</span>}
                  <span>data-floor {fmtSize(s.dataFloor)}</span>
                  {s.mounted && <span>dom {fmtSize(s.domSizePx)}</span>}
                  {s.naturalContentHeight !== null && <span>natural {Math.round(s.naturalContentHeight)}</span>}
                  {s.overflowY !== null && s.overflowY > 0 && <span>overflowY {Math.round(s.overflowY)}</span>}
                  {s.iconified && <span>icon</span>}
                  {s.locked && <span>locked</span>}
                  {!s.mounted && <span>unmounted</span>}
                </div>
                {s.anomalies.length > 0 && (
                  <div className="mt-0.5 flex flex-wrap gap-1 pl-3.5">
                    {s.anomalies.map((a) => (
                      <span key={a} className="rounded bg-red-500/15 px-1 text-red-300">{a}</span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )
      ) : visibleEntries.length === 0 ? (
        <p className="px-3 py-4 text-center text-[11px] text-neutral-600">
          {anomaliesOnly ? 'No flagged events yet.' : 'No scaling events yet — resize a widget to see them here.'}
        </p>
      ) : (
        <ul className="max-h-[60vh] overflow-y-auto">
          {visibleEntries.slice(0, 200).map((e) => (
            <li key={e.id} className="border-b gp-hairline px-3 py-1.5  text-[10px] last:border-b-0">
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-neutral-500">{fmtClock(e.t)}</span>
                <span className={`shrink-0 rounded px-1 font-semibold ${KIND_TONE[e.kind]}`}>{KIND_LABEL[e.kind]}</span>
                <span className="shrink-0 text-neutral-300">{e.widgetType}</span>
                <span className="min-w-0 flex-1 truncate text-neutral-600">
                  {fmtSize(e.before)} → {fmtSize(e.after)}
                </span>
                <span className="shrink-0 tabular-nums text-neutral-600">{e.zoom.toFixed(2)}×</span>
              </div>
              <div className="mt-0.5 truncate pl-3.5 text-neutral-600" title={formatDetail(e.detail)}>
                {formatDetail(e.detail)}
              </div>
              {e.anomalies.length > 0 && (
                <div className="mt-0.5 flex flex-wrap gap-1 pl-3.5">
                  {e.anomalies.map((a) => (
                    <span key={a} className="rounded bg-red-500/15 px-1 text-red-300">{a}</span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
