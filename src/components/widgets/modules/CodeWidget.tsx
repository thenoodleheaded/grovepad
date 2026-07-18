import { Check, Copy } from 'lucide-react'
import type { CodeData } from '../../../types/spatial'
import { useFieldAnchor } from '../../../hooks/useFieldAnchor'
import { useTransientValue } from '../../../hooks/useTransientValue'

interface CodeWidgetProps {
  data: CodeData
  onChange: (data: CodeData) => void
}

/** Monospace snippet block with a language tag and one-click copy. */
export function CodeWidget({ data, onChange }: CodeWidgetProps) {
  const [copied, showCopied] = useTransientValue(false)
  const codeRef = useFieldAnchor<HTMLTextAreaElement>('code')

  const copy = () => {
    navigator.clipboard?.writeText(data.code).then(() => {
      showCopied(true, 1200)
    })
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border gp-hairline bg-neutral-950/70">
      <div className="flex h-8 shrink-0 items-center justify-between border-b gp-hairline px-2.5">
        <div className="flex items-center gap-1.5">
          <span aria-hidden className="h-2 w-2 rounded-full bg-red-500/50" />
          <span aria-hidden className="h-2 w-2 rounded-full bg-amber-500/50" />
          <span aria-hidden className="h-2 w-2 rounded-full bg-emerald-500/50" />
        </div>
        <div className="flex items-center gap-2">
          <input
            value={data.language}
            placeholder="lang"
            aria-label="Language"
            onChange={(e) => onChange({ ...data, language: e.target.value })}
            className="w-14 bg-transparent text-right  text-[10px] text-neutral-500 outline-none placeholder:text-neutral-700"
          />
          <button
            type="button"
            aria-label="Copy code"
            onClick={copy}
            className="text-neutral-600 transition-colors hover:text-neutral-300"
          >
            {copied ? <Check size={11} className="text-emerald-400" aria-hidden /> : <Copy size={11} aria-hidden />}
          </button>
        </div>
      </div>
      <textarea
        ref={codeRef}
        value={data.code}
        placeholder={'// paste or type code…'}
        aria-label="Code"
        spellCheck={false}
        onChange={(e) => onChange({ ...data, code: e.target.value })}
        className="w-full flex-1 resize-none bg-transparent p-2.5  text-[11px] leading-[18px] text-neutral-300 outline-none placeholder:text-neutral-700"
      />
    </div>
  )
}
