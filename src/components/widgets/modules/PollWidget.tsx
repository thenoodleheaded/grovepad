import { Plus, X } from 'lucide-react'
import type { PollData } from '../../../types/spatial'
import { useFieldAnchor } from '../../../hooks/useFieldAnchor'

interface PollWidgetProps {
  data: PollData
  onChange: (data: PollData) => void
}

/** Tap-to-vote poll — each option fills with its share of the vote. */
export function PollWidget({ data, onChange }: PollWidgetProps) {
  const totalVotes = data.options.reduce((sum, o) => sum + o.votes, 0)
  const votesRowRef = useFieldAnchor<HTMLSpanElement>('votes')

  const setOptionLabel = (id: string, label: string) =>
    onChange({
      ...data,
      options: data.options.map((o) => (o.id === id ? { ...o, label } : o)),
    })

  const vote = (id: string) =>
    onChange({
      ...data,
      options: data.options.map((o) => (o.id === id ? { ...o, votes: o.votes + 1 } : o)),
    })

  const removeOption = (id: string) =>
    onChange({ ...data, options: data.options.filter((o) => o.id !== id) })

  const addOption = () =>
    onChange({
      ...data,
      options: [...data.options, { id: crypto.randomUUID(), label: '', votes: 0 }],
    })

  return (
    <div className="flex h-full flex-col gap-1.5">
      <input
        value={data.question}
        placeholder="Ask something…"
        aria-label="Poll question"
        onChange={(e) => onChange({ ...data, question: e.target.value })}
        className="w-full bg-transparent text-[13px] font-medium text-neutral-200 outline-none placeholder:text-neutral-700"
      />

      <div className="flex flex-col gap-1.5">
        {data.options.map((option) => {
          const share = totalVotes > 0 ? (option.votes / totalVotes) * 100 : 0
          return (
            <div
              key={option.id}
              className="group/row relative flex h-[30px] items-center gap-2 overflow-hidden rounded-lg border gp-hairline px-2"
            >
              {/* Vote-share fill behind the row */}
              <div
                aria-hidden
                className="absolute inset-y-0 left-0 bg-emerald-400/10 transition-[width] duration-300"
                style={{ width: `${share}%` }}
              />
              <input
                value={option.label}
                placeholder="Option…"
                onChange={(e) => setOptionLabel(option.id, e.target.value)}
                className="relative min-w-0 flex-1 bg-transparent text-[12px] text-neutral-300 outline-none placeholder:text-neutral-700"
              />
              <span className="relative shrink-0 font-mono text-[10px] tabular-nums text-neutral-500">
                {option.votes}
              </span>
              <button
                type="button"
                onClick={() => vote(option.id)}
                aria-label={`Vote for ${option.label || 'option'}`}
                className="relative shrink-0 rounded-md border border-emerald-400/25 bg-emerald-400/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300 transition-colors hover:border-emerald-400/50 hover:bg-emerald-400/20"
              >
                +1
              </button>
              <button
                type="button"
                aria-label="Remove option"
                onClick={() => removeOption(option.id)}
                className="relative shrink-0 text-neutral-700 opacity-0 transition-opacity hover:text-red-400 group-hover/row:opacity-100"
              >
                <X size={10} aria-hidden />
              </button>
            </div>
          )
        })}
      </div>

      <div className="mt-auto flex h-8 items-center justify-between border-t gp-hairline">
        <button
          type="button"
          onClick={addOption}
          className="flex items-center gap-1.5 text-[11px] text-neutral-600 transition-colors hover:text-neutral-400"
        >
          <Plus size={11} aria-hidden />
          Add option
        </button>
        <span ref={votesRowRef} className="font-mono text-[10px] tabular-nums text-neutral-600">
          {totalVotes} vote{totalVotes === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  )
}
