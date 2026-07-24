import { useEffect, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { generateWidgetOutput } from '../../../services/widgetGeneration'
import { useWidgetStore } from '../../../store/useWidgetStore'
import { useToastStore } from '../../../store/useToastStore'
import type { AiGeneratorData } from '../../../types/spatial'

interface AiGeneratorWidgetProps {
  data: AiGeneratorData
  widgetId: string
  onChange: (data: AiGeneratorData) => void
}

/** Animated dots for the generating state — purely CSS, no JS timers. */
function GeneratingDots() {
  return (
    <span className="inline-flex items-end gap-0.5" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block h-1 w-1 rounded-full bg-current opacity-60"
          style={{ animation: `gp-blink 1.2s ease-in-out ${i * 0.2}s infinite` }}
        />
      ))}
    </span>
  )
}

export function AiGeneratorWidget({ data, widgetId, onChange }: AiGeneratorWidgetProps) {
  const dataRef = useRef(data)
  dataRef.current = data
  const requestRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(false)
  const [isGenerating, setIsGenerating] = useState(false)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      requestRef.current?.abort()
    }
  }, [])

  const generate = async () => {
    const prompt = dataRef.current.prompt.trim()
    if (!prompt) return
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setIsGenerating(true)

    try {
      const created = await generateWidgetOutput(widgetId, prompt, controller.signal)
      // The commit itself is the acceptance boundary. It may change layout
      // enough to remount this renderer; once cards exist, still clear the
      // persisted generating state through the store-backed onChange action.
      // Completion belongs to the same history transaction as the generated
      // plan. This non-historic status write means one Undo removes every
      // output and restores the generator's pre-run state.
      useWidgetStore.getState().applyWireWrites(new Map([[widgetId, { prompt, status: 'done' as const }]]))
      useToastStore.getState().addToast(
        created.length === 1 ? 'Generated 1 card' : `Generated ${created.length} cards`,
        { action: { label: 'Undo', run: () => useWidgetStore.getState().undo() } },
      )
    } catch {
      if (!controller.signal.aborted) {
        useToastStore.getState().addToast('Generation could not finish — your prompt is unchanged')
      }
    } finally {
      if (requestRef.current === controller) requestRef.current = null
      if (mountedRef.current) setIsGenerating(false)
    }
  }

  const isDone = data.status === 'done'

  return (
    <div className="gp-bare-field flex h-full flex-col gap-2">
      {/* Multi-line prompt textarea */}
      <textarea

        rows={3}
        value={data.prompt}
        placeholder="Describe what to generate…"
        disabled={isGenerating}
        onChange={(e) => onChange({ ...data, prompt: e.target.value, status: 'idle' })}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            if (!isGenerating) void generate()
          }
        }}
        className="flex-1 w-full resize-none rounded-lg border gp-hairline bg-neutral-800/30 px-3 py-2.5 text-[13px] leading-[1.55] text-neutral-200 outline-none transition-colors placeholder:text-neutral-700 disabled:opacity-50"
      />

      {/* Generate button — full-width, prominent */}
      <button

        type="button"
        disabled={isGenerating || !data.prompt.trim()}
        onClick={() => void generate()}
        className={`flex h-9 w-full shrink-0 items-center justify-center gap-2 rounded-lg text-[12px] font-semibold transition-all ${
          isGenerating
            ? 'border border-violet-500/30 bg-violet-500/10 text-violet-400 cursor-default'
            : 'bg-violet-600 text-white hover:bg-violet-500 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed'
        }`}
      >
        <Sparkles size={13} aria-hidden />
        {isGenerating ? (
          <span className="flex items-center gap-1.5">
            Generating <GeneratingDots />
          </span>
        ) : (
          'Generate'
        )}
      </button>

      {/* Status row */}
      {isDone && (
        <p className="flex items-center gap-1.5 text-[11px] text-emerald-400/90">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Widget spawned on canvas
        </p>
      )}
      {!isDone && !isGenerating && data.prompt.trim() && (
        <p className="text-[10px] text-neutral-700">
          ⌘↵ to generate
        </p>
      )}
    </div>
  )
}
