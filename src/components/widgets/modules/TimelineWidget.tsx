import type { TimelineData } from '../../../types/spatial'

interface TimelineWidgetProps {
  data: TimelineData
}

// Accent palette — pairs of (bar bg, text) for phases
const PHASE_STYLES = [
  { bar: 'bg-emerald-500/25 border-emerald-500/30', text: 'text-emerald-300', dot: 'bg-emerald-400' },
  { bar: 'bg-sky-500/25 border-sky-500/30', text: 'text-sky-300', dot: 'bg-sky-400' },
  { bar: 'bg-amber-500/25 border-amber-500/30', text: 'text-amber-300', dot: 'bg-amber-400' },
  { bar: 'bg-fuchsia-500/25 border-fuchsia-500/30', text: 'text-fuchsia-300', dot: 'bg-fuchsia-400' },
  { bar: 'bg-rose-500/25 border-rose-500/30', text: 'text-rose-300', dot: 'bg-rose-400' },
  { bar: 'bg-violet-500/25 border-violet-500/30', text: 'text-violet-300', dot: 'bg-violet-400' },
] as const

/** Read-only horizontal phase chart. Each phase row is 40px (1 grid cell). */
export function TimelineWidget({ data }: TimelineWidgetProps) {
  const total = Math.max(1, data.totalUnits)
  return (
    <div className="flex h-full flex-col gap-0">
      {/* Phase rows — 40px each */}
      {data.phases.map((phase, index) => {
        const style = PHASE_STYLES[index % PHASE_STYLES.length]!
        const left = Math.min(100, (Math.max(0, phase.start) / total) * 100)
        const width = Math.min(100 - left, (Math.max(0.5, phase.span) / total) * 100)

        return (
          <div key={phase.id} className="flex h-10 items-center gap-2.5">
            {/* Label — fixed-width column, right-aligned */}
            <div className="flex w-14 shrink-0 items-center justify-end gap-1.5">
              <div className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} aria-hidden />
              <span className={`truncate text-[10px] font-medium ${style.text}`}>
                {phase.label}
              </span>
            </div>

            {/* Track + bar */}
            <div className="relative h-4 flex-1 overflow-hidden rounded-full bg-neutral-800/60">
              <div
                className={`absolute top-0 h-full rounded-full border ${style.bar} flex items-center justify-center overflow-hidden`}
                style={{ left: `${left}%`, width: `${width}%` }}
              >
                {/* Inline label inside bar when wide enough (>12%) */}
                {width > 12 && (
                  <span className={`truncate px-1.5 text-[9px] font-medium ${style.text} select-none`}>
                    {phase.span}u
                  </span>
                )}
              </div>
            </div>
          </div>
        )
      })}

      {/* Scale footer — 24px */}
      <div className="mt-auto flex items-center pl-[4.5rem] pt-1">
        <span className=" text-[9px] text-neutral-700 select-none">0</span>
        <div className="mx-1.5 flex-1 border-t border-dashed gp-hairline" />
        <span className=" text-[9px] text-neutral-600 select-none">{total}u</span>
      </div>
    </div>
  )
}
