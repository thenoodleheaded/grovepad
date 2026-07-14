import { useEffect, useRef } from 'react'
import { Sparkles } from 'lucide-react'
import { useWidgetStore } from '../../../store/useWidgetStore'
import type { AiGeneratorData } from '../../../types/spatial'
import { useFieldAnchor } from '../../../hooks/useFieldAnchor'

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
  const timeoutRef = useRef<number | null>(null)
  const promptRef = useFieldAnchor<HTMLTextAreaElement>('prompt')
  const doneRef = useFieldAnchor<HTMLButtonElement>('done')

  useEffect(
    () => () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
    },
    [],
  )

  const generate = () => {
    if (!dataRef.current.prompt.trim()) return
    onChange({ ...dataRef.current, status: 'generating' })
    timeoutRef.current = window.setTimeout(() => {
      onChange({ ...dataRef.current, status: 'done' })

      const store = useWidgetStore.getState()
      const parent = store.widgets[widgetId]
      if (parent) {
        const spawnX = parent.position.x + parent.size.width + 80
        const spawnY = parent.position.y
        const childTitle = `Generated: ${dataRef.current.prompt.trim().slice(0, 32) || 'Output'}`
        const childId = store.createWidget(childTitle, { x: spawnX, y: spawnY }, 'notes')
        store.updateWidgetData(childId, {
          text: `AI output for: "${dataRef.current.prompt}"\n\n1. Analyze the core logic.\n2. Verify the interfaces.\n3. Run validation.`,
        })
        store.addRelation(widgetId, childId, 'parent')
      }
    }, 1200)
  }

  const isGenerating = data.status === 'generating'
  const isDone = data.status === 'done'

  return (
    <div className="flex h-full flex-col gap-2">
      {/* Multi-line prompt textarea */}
      <textarea
        ref={promptRef}
        rows={3}
        value={data.prompt}
        placeholder="Describe what to generate…"
        disabled={isGenerating}
        onChange={(e) => onChange({ ...data, prompt: e.target.value, status: 'idle' })}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            if (!isGenerating) generate()
          }
        }}
        className="flex-1 w-full resize-none rounded-lg border gp-hairline bg-neutral-800/30 px-3 py-2.5 text-[13px] leading-[1.55] text-neutral-200 outline-none transition-colors placeholder:text-neutral-700 gp-hairline-focus focus:bg-neutral-800/50 disabled:opacity-50"
      />

      {/* Generate button — full-width, prominent */}
      <button
        ref={doneRef}
        type="button"
        disabled={isGenerating || !data.prompt.trim()}
        onClick={generate}
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
