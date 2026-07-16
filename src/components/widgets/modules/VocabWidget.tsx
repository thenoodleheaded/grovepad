import { Check, Plus, X } from 'lucide-react'
import type { VocabData } from '../../../types/spatial'
import { useFieldAnchor } from '../../../hooks/useFieldAnchor'

interface VocabWidgetProps {
  data: VocabData
  onChange: (data: VocabData) => void
}

/** Term → definition study list; tap the check to mark a term known. */
export function VocabWidget({ data, onChange }: VocabWidgetProps) {
  const knownCount = data.terms.filter((t) => t.known).length
  const knownCountRef = useFieldAnchor<HTMLSpanElement>('known_count')

  const setTerm = (id: string, patch: Partial<VocabData['terms'][number]>) =>
    onChange({ terms: data.terms.map((t) => (t.id === id ? { ...t, ...patch } : t)) })

  const removeTerm = (id: string) =>
    onChange({ terms: data.terms.filter((t) => t.id !== id) })

  const addTerm = () =>
    onChange({ terms: [...data.terms, { id: crypto.randomUUID(), term: '', definition: '', known: false }] })

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-1.5">
        {data.terms.map((t) => (
          <div key={t.id} className="group/row flex items-start gap-2">
            <button
              type="button"
              role="checkbox"
              aria-checked={t.known}
              aria-label={t.known ? 'Mark unknown' : 'Mark known'}
              onClick={() => setTerm(t.id, { known: !t.known })}
              className={`mt-1 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border text-[8px] transition-colors ${
                t.known
                  ? 'border-emerald-400/60 bg-emerald-400/20 text-emerald-300'
                  : 'border-neutral-600 text-transparent hover:border-neutral-400'
              }`}
            >
              <Check size={9} aria-hidden />
            </button>
            <div className="min-w-0 flex-1">
              <input
                value={t.term}
                placeholder="Term…"
                aria-label="Term"
                onChange={(e) => setTerm(t.id, { term: e.target.value })}
                className={`w-full bg-transparent text-[13px] font-medium outline-none placeholder:text-neutral-700 ${
                  t.known ? 'text-neutral-500' : 'text-neutral-200'
                }`}
              />
              <input
                value={t.definition}
                placeholder="Definition…"
                aria-label="Definition"
                onChange={(e) => setTerm(t.id, { definition: e.target.value })}
                className="w-full bg-transparent text-[11px] text-neutral-500 outline-none placeholder:text-neutral-700"
              />
            </div>
            <button
              type="button"
              aria-label="Remove term"
              onClick={() => removeTerm(t.id)}
              className="mt-1 shrink-0 text-neutral-700 pointer-events-none opacity-0 transition-opacity hover:text-red-400 group-hover/row:opacity-100 group-hover/row:pointer-events-auto"
            >
              <X size={11} aria-hidden />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-auto flex h-9 items-center justify-between border-t gp-hairline">
        <button
          type="button"
          onClick={addTerm}
          className="flex items-center gap-1.5 text-[11px] text-neutral-600 transition-colors hover:text-neutral-400"
        >
          <Plus size={11} aria-hidden />
          Add term
        </button>
        <span
          ref={knownCountRef}
          className={`font-mono text-[10px] tabular-nums transition-colors ${
            data.terms.length > 0 && knownCount === data.terms.length ? 'text-emerald-400' : 'text-neutral-600'
          }`}
        >
          {knownCount}/{data.terms.length} known
        </span>
      </div>
    </div>
  )
}
