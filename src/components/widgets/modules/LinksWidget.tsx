import { ExternalLink, Link2, Plus, X } from 'lucide-react'
import type { LinksData } from '../../../types/spatial'
import { useFieldAnchor } from '../../../hooks/useFieldAnchor'

interface LinksWidgetProps {
  data: LinksData
  onChange: (data: LinksData) => void
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** Labelled external links — edit inline, click the arrow to open. */
export function LinksWidget({ data, onChange }: LinksWidgetProps) {
  const countRef = useFieldAnchor('count')

  const setItem = (id: string, patch: Partial<{ label: string; url: string }>) =>
    onChange({
      items: data.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    })

  const removeItem = (id: string) =>
    onChange({ items: data.items.filter((item) => item.id !== id) })

  const addItem = () =>
    onChange({ items: [...data.items, { id: crypto.randomUUID(), label: '', url: '' }] })

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col">
        {data.items.map((item) => {
          const host = hostnameOf(item.url)
          return (
            <div key={item.id} className="group/row flex h-[34px] items-center gap-2">
              <Link2 size={11} className="shrink-0 text-neutral-600" aria-hidden />
              <input
                value={item.label}
                placeholder="Label…"
                aria-label="Link label"
                onChange={(e) => setItem(item.id, { label: e.target.value })}
                className="gp-input--bare w-2/5 min-w-0 text-[12px] text-neutral-200 outline-none placeholder:text-neutral-700"
              />
              <input
                value={item.url}
                placeholder="https://…"
                aria-label="Link URL"
                onChange={(e) => setItem(item.id, { url: e.target.value })}
                className="gp-input--bare min-w-0 flex-1 font-mono text-[10px] text-neutral-500 outline-none placeholder:text-neutral-700"
              />
              {host && (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={`Open ${host}`}
                  onClick={(e) => e.stopPropagation()}
                  className="shrink-0 text-neutral-600 transition-colors hover:text-emerald-400"
                >
                  <ExternalLink size={11} aria-hidden />
                </a>
              )}
              <button
                type="button"
                aria-label="Remove link"
                onClick={() => removeItem(item.id)}
                className="shrink-0 text-neutral-700 pointer-events-none opacity-0 transition-opacity hover:text-red-400 group-hover/row:opacity-100 group-hover/row:pointer-events-auto"
              >
                <X size={11} aria-hidden />
              </button>
            </div>
          )
        })}
      </div>

      <div ref={countRef} className="mt-auto flex h-9 items-center border-t gp-hairline">
        <button
          type="button"
          onClick={addItem}
          className="flex items-center gap-1.5 text-[11px] text-neutral-600 transition-colors hover:text-neutral-400"
        >
          <Plus size={11} aria-hidden />
          Add link
        </button>
      </div>
    </div>
  )
}
