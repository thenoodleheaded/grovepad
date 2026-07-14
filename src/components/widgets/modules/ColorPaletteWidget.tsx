import { useEffect, useRef, useState } from 'react'
import { Check, Plus, X } from 'lucide-react'
import type { ColorPaletteData } from '../../../types/spatial'
import { useFieldAnchor } from '../../../hooks/useFieldAnchor'

interface ColorPaletteWidgetProps {
  data: ColorPaletteData
  onChange: (data: ColorPaletteData) => void
}

const RANDOM_PALETTE = ['#a3e635', '#f472b6', '#60a5fa', '#fbbf24', '#c084fc', '#34d399']

function randomColor(): string {
  return RANDOM_PALETTE[Math.floor(Math.random() * RANDOM_PALETTE.length)]!
}

/** A swatch board — click a hex label to copy it, click a swatch to repaint it. */
export function ColorPaletteWidget({ data, onChange }: ColorPaletteWidgetProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const timeoutRef = useRef<number | null>(null)
  const countRef = useFieldAnchor('count')

  useEffect(() => () => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
  }, [])

  const setColor = (index: number, color: string) =>
    onChange({ colors: data.colors.map((c, i) => (i === index ? color : c)) })

  const removeColor = (index: number) =>
    onChange({ colors: data.colors.filter((_, i) => i !== index) })

  const addColor = () => onChange({ colors: [...data.colors, randomColor()] })

  const copyColor = async (index: number, color: string) => {
    try {
      await navigator.clipboard.writeText(color)
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
      setCopiedIndex(index)
      timeoutRef.current = window.setTimeout(() => setCopiedIndex(null), 1100)
    } catch {
      // Clipboard access denied — silently ignore, the hex is still visible to read.
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-4 gap-2.5">
        {data.colors.map((color, index) => (
          <div key={index} className="group/swatch relative flex flex-col items-center gap-1">
            <label
              className="h-9 w-9 cursor-pointer overflow-hidden rounded-lg border gp-hairline shadow-inner transition-transform hover:scale-105"
              style={{ backgroundColor: color }}
            >
              <input
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : '#000000'}
                aria-label={`Swatch ${index + 1} color`}
                onChange={(e) => setColor(index, e.target.value)}
                className="h-0 w-0 opacity-0"
              />
            </label>
            <button
              type="button"
              aria-label={`Copy ${color}`}
              onClick={() => copyColor(index, color)}
              className="flex items-center gap-0.5 font-mono text-[9px] text-neutral-500 transition-colors hover:text-neutral-200"
            >
              {copiedIndex === index ? (
                <Check size={8} className="text-emerald-400" aria-hidden />
              ) : null}
              {copiedIndex === index ? 'Copied' : color.toUpperCase()}
            </button>
            {data.colors.length > 1 && (
              <button
                type="button"
                aria-label="Remove swatch"
                onClick={() => removeColor(index)}
                className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full border border-neutral-700 bg-neutral-900 text-neutral-500 transition-colors hover:text-red-400 group-hover/swatch:flex"
              >
                <X size={9} aria-hidden />
              </button>
            )}
          </div>
        ))}
      </div>

      <div ref={countRef} className="mt-auto flex h-8 items-center border-t gp-hairline">
        <button
          type="button"
          onClick={addColor}
          className="flex items-center gap-1.5 text-[11px] text-neutral-600 transition-colors hover:text-neutral-400"
        >
          <Plus size={11} aria-hidden />
          Add swatch
        </button>
      </div>
    </div>
  )
}
