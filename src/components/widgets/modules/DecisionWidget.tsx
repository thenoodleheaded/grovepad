import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Dices, Plus, X } from 'lucide-react'
import type { DecisionData } from '../../../types/spatial'
import { useFieldAnchor } from '../../../hooks/useFieldAnchor'
import { WidgetPanel } from '../WidgetPanel'

interface DecisionWidgetProps {
  data: DecisionData
  onChange: (data: DecisionData) => void
  onHeightChange?: (height: number) => void
}

/** Can't decide? List the options and let the dice pick one, with a little
 *  roulette shuffle before it lands. */
export function DecisionWidget({ data, onChange, onHeightChange }: DecisionWidgetProps) {
  const [spinning, setSpinning] = useState(false)
  const [flashIndex, setFlashIndex] = useState<number | null>(null)
  const timerRef = useRef<number | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const pickedRef = useFieldAnchor<HTMLParagraphElement>('picked')
  const picked = data.pickedIndex !== null ? (data.options[data.pickedIndex] ?? '') : ''

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
  }, [])

  useLayoutEffect(() => {
    if (!rootRef.current) return
    onHeightChange?.(rootRef.current.scrollHeight)
  }, [data.options.length, onHeightChange, picked, spinning])

  const filled = data.options.map((o, i) => ({ text: o, index: i })).filter((o) => o.text.trim())

  const spin = () => {
    if (spinning || filled.length < 2) return
    setSpinning(true)
    const winner = filled[Math.floor(Math.random() * filled.length)]!.index
    // Roulette: flash through options with easing-out steps, then land.
    let step = 0
    const totalSteps = 10 + Math.floor(Math.random() * 4)
    const tick = () => {
      if (step < totalSteps) {
        setFlashIndex(filled[step % filled.length]!.index)
        step++
        timerRef.current = window.setTimeout(tick, 45 + step * 14)
      } else {
        setFlashIndex(null)
        setSpinning(false)
        onChange({ ...data, pickedIndex: winner })
      }
    }
    tick()
  }

  const setOption = (index: number, text: string) =>
    onChange({
      ...data,
      pickedIndex: null,
      options: data.options.map((o, i) => (i === index ? text : o)),
    })

  const removeOption = (index: number) =>
    onChange({
      ...data,
      pickedIndex: null,
      options: data.options.filter((_, i) => i !== index),
    })

  const addOption = () => onChange({ ...data, options: [...data.options, ''] })

  return (
    <div ref={rootRef} className="flex h-full flex-col gap-1.5">
      <WidgetPanel grip={false} island="options" sizing="free" className="flex min-h-0 flex-1 flex-col p-3">
        <input
          value={data.question}
          placeholder="What are we deciding?"
          aria-label="Decision question"
          onChange={(e) => onChange({ ...data, question: e.target.value })}
          className="mb-2 w-full shrink-0 bg-transparent text-[13px] font-medium text-neutral-200 outline-none placeholder:text-neutral-700"
        />

        <div className="flex min-h-0 flex-1 flex-col">
        {data.options.map((option, index) => {
          const isPicked = !spinning && data.pickedIndex === index
          const isFlashing = flashIndex === index
          return (
            <div
              key={index}
              className={`group/row flex h-7 items-center gap-2 rounded-md px-1.5 transition-colors duration-100 ${
                isPicked
                  ? 'bg-emerald-400/15'
                  : isFlashing
                    ? 'bg-neutral-700/60'
                    : ''
              }`}
            >
              <span
                aria-hidden
                className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${
                  isPicked ? 'bg-emerald-400' : 'bg-neutral-700'
                }`}
              />
              <input
                value={option}
                placeholder="Option…"
                aria-label={`Option ${index + 1}`}
                onChange={(e) => setOption(index, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addOption()
                  }
                }}
                className={`min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-neutral-700 ${
                  isPicked ? 'font-semibold text-emerald-300' : 'text-neutral-200'
                }`}
              />
              {isPicked && (
                <span className="shrink-0 text-[9px] font-semibold uppercase tracking-widest text-emerald-400">
                  Picked
                </span>
              )}
              {data.options.length > 2 && (
                <button
                  type="button"
                  aria-label="Remove option"
                  onClick={() => removeOption(index)}
                  className="shrink-0 text-neutral-700 opacity-0 transition-opacity hover:text-red-400 group-hover/row:opacity-100"
                >
                  <X size={10} aria-hidden />
                </button>
              )}
            </div>
          )
        })}
        <button
          type="button"
          onClick={addOption}
          className="mt-0.5 flex h-6 items-center gap-1 px-1.5 text-[10px] text-neutral-600 transition-colors hover:text-neutral-400"
        >
          <Plus size={10} aria-hidden />
          Add option
        </button>
        </div>
      </WidgetPanel>

      <WidgetPanel grip={false} island="controls" sizing="width" className="shrink-0 space-y-2 p-3">
        <button
          type="button"
          disabled={spinning || filled.length < 2}
          onClick={spin}
          className="flex h-8 w-full shrink-0 items-center justify-center gap-2 rounded-lg bg-emerald-500/15 text-[12px] font-semibold text-emerald-300 transition-colors duration-200 hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Dices size={13} className={spinning ? 'animate-spin' : ''} aria-hidden />
          {spinning ? 'Deciding…' : 'Decide for me'}
        </button>

        {picked && !spinning && (
          <p ref={pickedRef} className="shrink-0 truncate text-center text-[10px] text-neutral-600">
            Picked: <span className="text-emerald-400">{picked}</span>
          </p>
        )}
      </WidgetPanel>
    </div>
  )
}
