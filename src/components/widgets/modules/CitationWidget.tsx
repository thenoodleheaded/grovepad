import { Copy, Plus, X } from 'lucide-react'
import type { CitationData, CitationSource, CitationStyle } from '../../../types/spatial'
import { useFieldAnchor } from '../../../hooks/useFieldAnchor'
import { useTransientValue } from '../../../hooks/useTransientValue'

interface CitationWidgetProps {
  data: CitationData
  onChange: (data: CitationData) => void
}

const STYLES: CitationStyle[] = ['APA', 'MLA', 'Chicago']

/** Format one source in the selected style — enough to paste and refine. */
function formatSource(style: CitationStyle, s: CitationSource): string {
  const author = s.author.trim() || 'Author'
  const year = s.year.trim() || 'n.d.'
  const title = s.title.trim() || 'Title'
  if (style === 'MLA') return `${author}. "${title}." ${year}.`
  if (style === 'Chicago') return `${author}. ${title}. ${year}.`
  return `${author} (${year}). ${title}.`
}

export function CitationWidget({ data, onChange }: CitationWidgetProps) {
  const [copiedId, showCopiedId] = useTransientValue<string | null>(null)
  const countRef = useFieldAnchor<HTMLSpanElement>('count')

  const setSource = (id: string, patch: Partial<CitationSource>) =>
    onChange({ ...data, sources: data.sources.map((s) => (s.id === id ? { ...s, ...patch } : s)) })

  const removeSource = (id: string) =>
    onChange({ ...data, sources: data.sources.filter((s) => s.id !== id) })

  const addSource = () =>
    onChange({ ...data, sources: [...data.sources, { id: crypto.randomUUID(), title: '', author: '', year: '' }] })

  const copy = (s: CitationSource) => {
    navigator.clipboard?.writeText(formatSource(data.style, s)).then(() => {
      showCopiedId(s.id, 1100)
    })
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-1.5 flex shrink-0 items-center gap-1">
        {STYLES.map((style) => (
          <button
            key={style}
            type="button"
            aria-pressed={data.style === style}
            onClick={() => onChange({ ...data, style })}
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
              data.style === style
                ? 'bg-violet-500/20 text-violet-300'
                : 'text-neutral-600 hover:bg-neutral-800 hover:text-neutral-400'
            }`}
          >
            {style}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1.5">
        {data.sources.map((s) => (
          <div key={s.id} className="group/row rounded-lg border gp-hairline bg-neutral-900/30 px-2 py-1.5">
            <div className="flex items-center gap-2">
              <input
                value={s.title}
                placeholder="Title…"
                aria-label="Source title"
                onChange={(e) => setSource(s.id, { title: e.target.value })}
                className="min-w-0 flex-1 bg-transparent text-[12px] font-medium text-neutral-200 outline-none placeholder:text-neutral-700"
              />
              <button
                type="button"
                aria-label="Copy citation"
                onClick={() => copy(s)}
                className={`shrink-0 transition-colors ${copiedId === s.id ? 'text-emerald-400' : 'text-neutral-700 hover:text-neutral-300'}`}
              >
                <Copy size={11} aria-hidden />
              </button>
              <button
                type="button"
                aria-label="Remove source"
                onClick={() => removeSource(s.id)}
                className="shrink-0 text-neutral-700 pointer-events-none opacity-0 transition-opacity hover:text-red-400 group-hover/row:opacity-100 group-hover/row:pointer-events-auto"
              >
                <X size={11} aria-hidden />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                value={s.author}
                placeholder="Author…"
                aria-label="Author"
                onChange={(e) => setSource(s.id, { author: e.target.value })}
                className="min-w-0 flex-1 bg-transparent text-[10px] text-neutral-500 outline-none placeholder:text-neutral-700"
              />
              <input
                value={s.year}
                placeholder="Year"
                aria-label="Year"
                onChange={(e) => setSource(s.id, { year: e.target.value })}
                className="w-12 bg-transparent text-right font-mono text-[10px] text-neutral-500 outline-none placeholder:text-neutral-700"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-auto flex h-9 items-center justify-between border-t gp-hairline">
        <button
          type="button"
          onClick={addSource}
          className="flex items-center gap-1.5 text-[11px] text-neutral-600 transition-colors hover:text-neutral-400"
        >
          <Plus size={11} aria-hidden />
          Add source
        </button>
        <span ref={countRef} className="font-mono text-[10px] tabular-nums text-neutral-600">
          {data.sources.length} source{data.sources.length === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  )
}
