import { Plus, X } from 'lucide-react'
import type { DialogData, DialogLine } from '../../../types/spatial'
import { useFieldAnchor } from '../../../hooks/useFieldAnchor'

interface DialogWidgetProps {
  data: DialogData
  onChange: (data: DialogData) => void
}

// Different accent per speaker index — cycles if more than 4 characters
const CHAR_COLORS = [
  'text-sky-400',
  'text-rose-400',
  'text-amber-400',
  'text-violet-400',
] as const

/** Screenplay-style character / cue blocks. */
export function DialogWidget({ data, onChange }: DialogWidgetProps) {
  const lineCountRef = useFieldAnchor('line_count')
  // Build a stable character → color map (by first appearance order)
  const charColorMap = new Map<string, string>()
  let colorIndex = 0
  for (const line of data.lines) {
    const key = line.character.toUpperCase()
    if (!charColorMap.has(key)) {
      charColorMap.set(key, CHAR_COLORS[colorIndex % CHAR_COLORS.length] ?? CHAR_COLORS[0])
      colorIndex++
    }
  }

  const setLine = (id: string, patch: Partial<Omit<DialogLine, 'id'>>) =>
    onChange({
      lines: data.lines.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    })

  const removeLine = (id: string) =>
    onChange({ lines: data.lines.filter((line) => line.id !== id) })

  const addLine = () =>
    onChange({
      lines: [...data.lines, { id: crypto.randomUUID(), character: 'CHARACTER', cue: '' }],
    })

  return (
    <div className="flex h-full flex-col gap-0.5">
      {/* Screenplay blocks */}
      <div className="flex flex-col gap-3">
        {data.lines.map((line) => {
          const charKey = line.character.toUpperCase()
          const charColor = charColorMap.get(charKey) ?? CHAR_COLORS[0]
          return (
            <div key={line.id} className="group/line relative">
              {/* Character name row */}
              <div className="flex items-center justify-center gap-2">
                <input
                  value={line.character}
                  aria-label="Character name"
                  onChange={(e) =>
                    setLine(line.id, { character: e.target.value.toUpperCase() })
                  }
                  className={`w-40 bg-transparent text-center text-[10px] font-semibold uppercase tracking-[0.18em] outline-none ${charColor}`}
                />
                <button
                  type="button"
                  aria-label="Remove dialog line"
                  onClick={() => removeLine(line.id)}
                  className="absolute right-0 top-0 text-neutral-700 pointer-events-none opacity-0 transition-opacity hover:text-red-400 group-hover/line:opacity-100 group-hover/line:pointer-events-auto"
                >
                  <X size={11} />
                </button>
              </div>

              {/* Cue line */}
              <input
                value={line.cue}
                placeholder="Line of dialog…"
                aria-label={`Cue for ${line.character}`}
                onChange={(e) => setLine(line.id, { cue: e.target.value })}
                className="mt-0.5 w-full bg-transparent px-3 text-center text-[13px] italic text-neutral-300 outline-none placeholder:text-neutral-700"
              />

              {/* Divider between blocks */}
              {data.lines.length > 1 && (
                <div className="mt-3 border-b gp-hairline" />
              )}
            </div>
          )
        })}
      </div>

      {/* Add line */}
      <div ref={lineCountRef} className="mt-auto flex items-center justify-center pt-2">
        <button
          type="button"
          onClick={addLine}
          className="flex items-center gap-1.5 text-[11px] text-neutral-600 transition-colors hover:text-neutral-400"
        >
          <Plus size={11} />
          Add line
        </button>
      </div>
    </div>
  )
}
