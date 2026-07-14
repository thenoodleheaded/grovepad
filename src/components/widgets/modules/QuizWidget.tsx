import { Check, Plus, RotateCcw, X } from 'lucide-react'
import type { QuizData } from '../../../types/spatial'
import { useFieldAnchor } from '../../../hooks/useFieldAnchor'

interface QuizWidgetProps {
  data: QuizData
  onChange: (data: QuizData) => void
}

/**
 * Single self-check question: mark one option correct, then pick to reveal.
 * A right/wrong verdict shows once answered; `correct` is a bindable output.
 */
export function QuizWidget({ data, onChange }: QuizWidgetProps) {
  const answered = data.picked !== null
  const pickedOption = data.options.find((o) => o.id === data.picked)
  const gotItRight = pickedOption?.correct === true
  const verdictRef = useFieldAnchor<HTMLDivElement>('correct')

  const setOption = (id: string, patch: Partial<QuizData['options'][number]>) =>
    onChange({ ...data, picked: null, options: data.options.map((o) => (o.id === id ? { ...o, ...patch } : o)) })

  const markCorrect = (id: string) =>
    onChange({
      ...data,
      picked: null,
      options: data.options.map((o) => ({ ...o, correct: o.id === id })),
    })

  const removeOption = (id: string) =>
    onChange({ ...data, picked: null, options: data.options.filter((o) => o.id !== id) })

  const addOption = () =>
    onChange({ ...data, options: [...data.options, { id: crypto.randomUUID(), text: '', correct: false }] })

  const pick = (id: string) => {
    if (!answered) onChange({ ...data, picked: id })
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <input
        value={data.prompt}
        placeholder="Ask a question…"
        aria-label="Quiz question"
        onChange={(e) => onChange({ ...data, prompt: e.target.value, picked: null })}
        className="w-full shrink-0 bg-transparent text-[13px] font-medium text-neutral-200 outline-none placeholder:text-neutral-700"
      />

      <div className="flex min-h-0 flex-1 flex-col gap-1.5">
        {data.options.map((o) => {
          const isPicked = data.picked === o.id
          const reveal = answered && o.correct
          return (
            <div
              key={o.id}
              className={`group/row flex items-center gap-2 rounded-lg border px-2 py-1 transition-colors ${
                reveal
                  ? 'border-emerald-400/50 bg-emerald-400/10'
                  : isPicked
                    ? 'border-red-400/50 bg-red-400/10'
                    : 'gp-hairline'
              }`}
            >
              {/* Mark-correct radio (edit mode) */}
              <button
                type="button"
                aria-label={o.correct ? 'Correct answer' : 'Mark as correct answer'}
                aria-pressed={o.correct}
                onClick={() => markCorrect(o.id)}
                className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border text-[8px] transition-colors ${
                  o.correct
                    ? 'border-emerald-400/70 bg-emerald-400/20 text-emerald-300'
                    : 'border-neutral-600 text-transparent hover:border-neutral-400'
                }`}
              >
                <Check size={9} aria-hidden />
              </button>
              <input
                value={o.text}
                placeholder="Option…"
                aria-label="Answer option"
                onChange={(e) => setOption(o.id, { text: e.target.value })}
                className="min-w-0 flex-1 bg-transparent text-[12px] text-neutral-200 outline-none placeholder:text-neutral-700"
              />
              <button
                type="button"
                onClick={() => pick(o.id)}
                disabled={answered}
                className="shrink-0 rounded-md border border-sky-400/25 bg-sky-400/10 px-1.5 py-0.5 text-[9px] font-medium text-sky-300 transition-colors hover:bg-sky-400/20 disabled:opacity-30"
              >
                Pick
              </button>
              {data.options.length > 2 && (
                <button
                  type="button"
                  aria-label="Remove option"
                  onClick={() => removeOption(o.id)}
                  className="shrink-0 text-neutral-700 opacity-0 transition-opacity hover:text-red-400 group-hover/row:opacity-100"
                >
                  <X size={10} aria-hidden />
                </button>
              )}
            </div>
          )
        })}
      </div>

      <div ref={verdictRef} className="flex h-8 shrink-0 items-center justify-between">
        {answered ? (
          <>
            <span className={`text-[11px] font-semibold ${gotItRight ? 'text-emerald-400' : 'text-red-400'}`}>
              {gotItRight ? '✓ Correct!' : '✗ Not quite'}
            </span>
            <button
              type="button"
              onClick={() => onChange({ ...data, picked: null })}
              className="flex items-center gap-1 text-[10px] text-neutral-500 transition-colors hover:text-neutral-300"
            >
              <RotateCcw size={10} aria-hidden />
              Retry
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={addOption}
            className="flex items-center gap-1.5 text-[11px] text-neutral-600 transition-colors hover:text-neutral-400"
          >
            <Plus size={11} aria-hidden />
            Add option
          </button>
        )}
      </div>
    </div>
  )
}
