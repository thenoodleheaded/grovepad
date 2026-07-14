import { AtSign, Phone } from 'lucide-react'
import type { ContactData } from '../../../types/spatial'
import { useFieldAnchor } from '../../../hooks/useFieldAnchor'

interface ContactWidgetProps {
  data: ContactData
  onChange: (data: ContactData) => void
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return parts
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')
}

/** Lightweight person card — avatar initials, role, and reach-outs. */
export function ContactWidget({ data, onChange }: ContactWidgetProps) {
  const nameRef = useFieldAnchor<HTMLInputElement>('name')
  const emailRef = useFieldAnchor<HTMLLabelElement>('email')
  return (
    <div className="flex h-full flex-col justify-between gap-2">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-violet-400/30 bg-violet-400/10 text-sm font-semibold text-violet-300">
          {initialsOf(data.name)}
        </div>
        <div className="min-w-0 flex-1">
          <input
            ref={nameRef}
            value={data.name}
            placeholder="Name"
            aria-label="Name"
            onChange={(e) => onChange({ ...data, name: e.target.value })}
            className="w-full bg-transparent text-[14px] font-semibold text-neutral-200 outline-none placeholder:text-neutral-700"
          />
          <input
            value={data.role}
            placeholder="Role"
            aria-label="Role"
            onChange={(e) => onChange({ ...data, role: e.target.value })}
            className="w-full bg-transparent text-[11px] text-neutral-500 outline-none placeholder:text-neutral-700"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label ref={emailRef} className="flex h-7 items-center gap-2 rounded-lg border gp-hairline px-2">
          <AtSign size={11} className="shrink-0 text-neutral-600" aria-hidden />
          <input
            value={data.email}
            placeholder="email@…"
            aria-label="Email"
            onChange={(e) => onChange({ ...data, email: e.target.value })}
            className="w-full bg-transparent font-mono text-[11px] text-neutral-400 outline-none placeholder:text-neutral-700"
          />
        </label>
        <label className="flex h-7 items-center gap-2 rounded-lg border gp-hairline px-2">
          <Phone size={11} className="shrink-0 text-neutral-600" aria-hidden />
          <input
            value={data.phone}
            placeholder="+1 …"
            aria-label="Phone"
            onChange={(e) => onChange({ ...data, phone: e.target.value })}
            className="w-full bg-transparent font-mono text-[11px] text-neutral-400 outline-none placeholder:text-neutral-700"
          />
        </label>
      </div>
    </div>
  )
}
