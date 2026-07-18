import { useEffect, useState } from 'react'
import { BrainCircuit, Trash2 } from 'lucide-react'
import { useAiDebugStore, type AiDebugEntry } from '../../store/useAiDebugStore'
import { localAiService, type LocalAiStatus } from '../../services/localAiService'

function statusTone(status: AiDebugEntry['status']): string {
  switch (status) {
    case 'ok':
      return 'bg-emerald-400'
    case 'error':
      return 'bg-red-400'
    case 'aborted':
      return 'bg-neutral-500'
    default:
      return 'bg-amber-400 animate-pulse'
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatClock(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString(undefined, { hour12: false })
}

function phasePresentation(phase: AiDebugEntry['phase']): { label: string; className: string } {
  switch (phase) {
    case 'quickadd-deterministic': return { label: 'heuristic', className: 'bg-emerald-500/15 text-emerald-300' }
    case 'quickadd-model': return { label: 'local model', className: 'bg-violet-500/15 text-violet-300' }
    case 'topology': return { label: 'topology', className: 'bg-violet-500/15 text-violet-300' }
    default: return { label: 'hydration', className: 'bg-sky-500/15 text-sky-300' }
  }
}

/**
 * AI work debugger, toggled with `I` (like the perf overlay's `P`).
 *
 * Every OpenAI request the app makes — the import topology pass and each
 * background widget hydration — is traced into useAiDebugStore. This panel
 * lists them live: status, model, duration, token usage, and (expanded) the
 * exact prompt sent and raw JSON the model returned, so a bad mindmap or a
 * mis-hydrated widget can be traced to the request that produced it.
 */
export function AiDebugPanel() {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [runtimeStatus, setRuntimeStatus] = useState<LocalAiStatus>(() => localAiService.getStatus())
  const [enablingModel, setEnablingModel] = useState(false)
  const entries = useAiDebugStore((state) => state.entries)

  useEffect(() => localAiService.subscribe(setRuntimeStatus), [])

  const pending = entries.filter((e) => e.status === 'pending').length
  const totalTokens = entries.reduce((sum, e) => sum + e.promptTokens + e.completionTokens, 0)
  const deterministic = entries.find((entry) => entry.phase === 'quickadd-deterministic')
  const localModel = entries.find((entry) => entry.phase === 'quickadd-model')
  const runtime = localAiService.getCapabilities()
  const canEnableModel = (runtimeStatus.phase === 'available' || runtimeStatus.phase === 'error') && !runtimeStatus.enabled

  const enableModel = () => {
    if (enablingModel) return
    setEnablingModel(true)
    void localAiService.enableModel().catch(() => undefined).finally(() => setEnablingModel(false))
  }

  return (
    <div
      data-canvas-ui
      className="gp-dialog gp-panel absolute right-4 top-28 z-10 flex w-[400px] max-w-[calc(100vw-2rem)] select-none flex-col overflow-hidden rounded-2xl shadow-xl"
    >
      <div className="flex items-center gap-2 border-b gp-hairline px-3 py-2  text-xs text-neutral-400">
        <BrainCircuit size={13} className={pending > 0 ? 'text-amber-400' : 'text-emerald-400'} aria-hidden />
        <span className="font-semibold text-neutral-300">AI calls</span>
        <span className="tabular-nums">{entries.length}</span>
        {pending > 0 && <span className="tabular-nums text-amber-400">{pending} live</span>}
        {totalTokens > 0 && (
          <span className="tabular-nums" title="total prompt + completion tokens">
            {totalTokens.toLocaleString()} tok
          </span>
        )}
        <span className="ml-auto text-neutral-600">I to hide</span>
        <button
          type="button"
          aria-label="Clear AI call log"
          onClick={() => {
            useAiDebugStore.getState().clear()
            setExpandedId(null)
          }}
          className="rounded p-1 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
        >
          <Trash2 size={12} aria-hidden />
        </button>
      </div>

      <div className="space-y-1.5 border-b gp-hairline bg-neutral-950/30 px-3 py-2  text-[10px] text-neutral-500">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>Quick Add runtime</span>
          <span className="text-neutral-300">{runtime.profile.label}</span>
          <span>{runtime.platform} · {runtime.profile.tier}</span>
          <span className={runtimeStatus.phase === 'ready' ? 'text-emerald-300' : runtimeStatus.phase === 'error' ? 'text-amber-300' : 'text-neutral-400'}>
            {runtimeStatus.phase}
          </span>
          {canEnableModel && (
            <button
              type="button"
              onClick={enableModel}
              disabled={enablingModel}
              className="rounded bg-violet-400/10 px-1.5 py-0.5 text-violet-300 transition-colors hover:bg-violet-400/20 disabled:opacity-50"
            >
              {enablingModel ? 'starting…' : 'download model'}
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-neutral-600">
          <span>model: {runtimeStatus.modelId ?? 'deterministic only'}</span>
          <span>WebGPU: {runtime.hasWebGPU ? 'yes' : 'no'}</span>
          <span>memory: {runtime.memoryGb ? `${runtime.memoryGb} GB` : 'unknown'}</span>
          <span title={runtimeStatus.message}>{runtimeStatus.message}</span>
        </div>
        {!runtimeStatus.enabled && runtimeStatus.phase !== 'unsupported' && (
          <p className="text-amber-300/80">Model comparison is waiting for a local-model download.</p>
        )}
      </div>

      {(deterministic || localModel) && (
        <div className="grid grid-cols-2 gap-px border-b gp-hairline bg-white/[0.04]">
          {([
            ['Deterministic', deterministic],
            ['Local model', localModel],
          ] as const).map(([label, entry]) => (
            <div key={label} className="min-w-0 bg-neutral-950/50 px-3 py-2  text-[10px]">
              <div className="flex items-center gap-1.5 text-neutral-500">
                <span className={`h-1.5 w-1.5 rounded-full ${entry ? statusTone(entry.status) : 'bg-neutral-700'}`} />
                <span>{label}</span>
                {entry && <span className="ml-auto tabular-nums text-neutral-600">{formatDuration(entry.durationMs)}</span>}
              </div>
              <p className="mt-1 truncate text-neutral-300" title={entry?.summary ?? ''}>
                {entry?.summary ?? 'No pass yet'}
              </p>
            </div>
          ))}
        </div>
      )}

      {entries.length === 0 ? (
        <p className="px-3 py-4 text-center text-[11px] text-neutral-600">
          No AI calls yet — import a document to see traffic here.
        </p>
      ) : (
        <ul className="max-h-[50vh] overflow-y-auto">
          {entries.map((entry) => {
            const expanded = expandedId === entry.id
            const phase = phasePresentation(entry.phase)
            return (
              <li key={entry.id} className="border-b gp-hairline last:border-b-0">
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : entry.id)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left  text-[11px] text-neutral-400 transition-colors hover:bg-neutral-800/50"
                >
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusTone(entry.status)}`} aria-hidden />
                  <span className="shrink-0 text-neutral-500">{formatClock(entry.startedAt)}</span>
                  <span className={`shrink-0 rounded px-1 text-[10px] font-semibold ${phase.className}`}>{phase.label}</span>
                  <span className="min-w-0 flex-1 truncate text-neutral-300">{entry.label}</span>
                  <span className="shrink-0 text-neutral-600">{entry.model}</span>
                  {entry.status !== 'pending' && (
                    <span className="shrink-0 tabular-nums">{formatDuration(entry.durationMs)}</span>
                  )}
                </button>

                {expanded && (
                  <div className="space-y-2 border-t gp-hairline bg-neutral-900/40 px-3 py-2  text-[10px]">
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-neutral-500">
                      <span>status: <span className="text-neutral-300">{entry.status}</span></span>
                      {(entry.promptTokens > 0 || entry.completionTokens > 0) && (
                        <span>
                          tokens: <span className="tabular-nums text-neutral-300">
                            {entry.promptTokens.toLocaleString()} in / {entry.completionTokens.toLocaleString()} out
                          </span>
                        </span>
                      )}
                      <span>prompt: <span className="tabular-nums text-neutral-300">{entry.prompt.length.toLocaleString()} ch</span></span>
                    </div>
                    {entry.summary && <p className="text-neutral-300">{entry.summary}</p>}
                    {entry.error && (
                      <p className="whitespace-pre-wrap break-words text-red-400">{entry.error}</p>
                    )}
                    <div>
                      <p className="mb-0.5 text-neutral-500">prompt</p>
                      <pre className="max-h-40 select-text overflow-auto whitespace-pre-wrap break-words rounded bg-neutral-950/60 p-2 text-neutral-400">
                        {entry.prompt}
                      </pre>
                    </div>
                    {entry.response && (
                      <div>
                        <p className="mb-0.5 text-neutral-500">response</p>
                        <pre className="max-h-40 select-text overflow-auto whitespace-pre-wrap break-words rounded bg-neutral-950/60 p-2 text-neutral-400">
                          {entry.response}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
