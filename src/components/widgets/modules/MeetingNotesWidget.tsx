import { CalendarClock, Plus, Users, X } from 'lucide-react'
import type { MeetingNotesData } from '../../../types/spatial'
import { useFieldAnchor } from '../../../hooks/useFieldAnchor'

interface MeetingNotesWidgetProps {
  data: MeetingNotesData
  onChange: (data: MeetingNotesData) => void
}

/** Structured meeting record — date, attendees, notes, and action items. */
export function MeetingNotesWidget({ data, onChange }: MeetingNotesWidgetProps) {
  const actionsDoneRef = useFieldAnchor<HTMLParagraphElement>('actions_done')

  const setAction = (id: string, patch: Partial<MeetingNotesData['actions'][number]>) =>
    onChange({
      ...data,
      actions: data.actions.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    })

  const removeAction = (id: string) =>
    onChange({ ...data, actions: data.actions.filter((a) => a.id !== id) })

  const addAction = () =>
    onChange({
      ...data,
      actions: [...data.actions, { id: crypto.randomUUID(), text: '', done: false }],
    })

  return (
    <div className="gp-bare-field flex h-full flex-col gap-2">
      <div className="flex shrink-0 items-center gap-3">
        <label className="flex items-center gap-1.5 text-neutral-500">
          <CalendarClock size={11} className="shrink-0" aria-hidden />
          <input
            type="date"
            value={data.date}
            aria-label="Meeting date"
            onChange={(e) => onChange({ ...data, date: e.target.value })}
            className="bg-transparent  text-[11px] text-neutral-400 outline-none [color-scheme:dark]"
          />
        </label>
        <label className="flex min-w-0 flex-1 items-center gap-1.5 text-neutral-500">
          <Users size={11} className="shrink-0" aria-hidden />
          <input
            value={data.attendees}
            placeholder="Attendees…"
            aria-label="Attendees"
            onChange={(e) => onChange({ ...data, attendees: e.target.value })}
            className="w-full bg-transparent text-[11px] text-neutral-400 outline-none placeholder:text-neutral-700"
          />
        </label>
      </div>

      <textarea
        value={data.notes}
        placeholder="Notes & decisions…"
        aria-label="Meeting notes"
        onChange={(e) => onChange({ ...data, notes: e.target.value })}
        className="min-h-0 w-full flex-1 resize-none rounded-lg border gp-hairline bg-neutral-800/30 px-2.5 py-2 text-[12px] leading-relaxed text-neutral-200 outline-none placeholder:text-neutral-700"
      />

      <div className="shrink-0">
        <p
          ref={actionsDoneRef}
          className="pb-1 text-[9px] font-semibold uppercase tracking-widest text-neutral-600"
        >
          Action items
        </p>
        {data.actions.map((a) => (
          <div key={a.id} className="group/row flex h-6 items-center gap-2">
            <button
              type="button"
              role="checkbox"
              aria-checked={a.done}
              aria-label={a.text || 'Action item'}
              onClick={() => setAction(a.id, { done: !a.done })}
              className={`flex h-3 w-3 shrink-0 items-center justify-center rounded-sm border text-[8px] transition-colors ${
                a.done
                  ? 'border-emerald-400/60 bg-emerald-400/20 text-emerald-300'
                  : 'border-neutral-600 text-transparent hover:border-neutral-400'
              }`}
            >
              ✓
            </button>
            <input
              value={a.text}
              placeholder="Action…"
              aria-label="Action item"
              onChange={(e) => setAction(a.id, { text: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addAction()
                }
              }}
              className={`min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-neutral-700 ${
                a.done ? 'text-neutral-600 line-through' : 'text-neutral-200'
              }`}
            />
            <button
              type="button"
              aria-label="Remove action"
              onClick={() => removeAction(a.id)}
              className="shrink-0 text-neutral-700 pointer-events-none opacity-0 transition-opacity hover:text-red-400 group-hover/row:opacity-100 group-hover/row:pointer-events-auto"
            >
              <X size={10} aria-hidden />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addAction}
          className="flex h-6 items-center gap-1 text-[10px] text-neutral-600 transition-colors hover:text-neutral-400"
        >
          <Plus size={10} aria-hidden />
          Add action
        </button>
      </div>
    </div>
  )
}
