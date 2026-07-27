import { Check, X } from 'lucide-react'
import type {
  DailyAgendaData,
  ProcessData,
  ProcessStepStatus,
  StatusData,
  WorkflowStatus,
} from '../../../../types/spatial'
import { SmallAction, AddButton, Stat, ProgressBar } from './shared'
import { inputClass } from './sharedPrimitives'

/** Workflow widgets: Status, DailyAgenda, Process. Form moved to its own skinned module. */
const STATUS_META: Array<{ value: WorkflowStatus; label: string; color: string; progress: number }> = [
  { value: 'not_started', label: 'Not started', color: '#737373', progress: 0 },
  { value: 'in_progress', label: 'In progress', color: '#38bdf8', progress: 50 },
  { value: 'blocked', label: 'Blocked', color: '#fb7185', progress: 50 },
  { value: 'done', label: 'Done', color: '#34d399', progress: 100 },
]

export function StatusWidget({
  data,
  onChange,
}: {
  data: StatusData
  onChange: (data: StatusData) => void
}) {
  const current = STATUS_META.find((item) => item.value === data.value) ?? STATUS_META[0]!
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <input
          aria-label="Status label"
          value={data.label}
          onChange={(event) => onChange({ ...data, label: event.target.value })}
          className={`${inputClass} flex-1 font-medium`}
        />
        <span className="flex items-center gap-1  text-[9px] uppercase" style={{ color: current.color }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: current.color }} />
          {current.label}
        </span>
      </div>
      <div data-island="states" className="gp-status-states grid grid-cols-4 gap-2">
        {STATUS_META.map((item) => (
          <button
            key={item.value}
            type="button"
            title={item.label}
            aria-label={item.label}
            onClick={() => onChange({ ...data, value: item.value })}
            className={`h-9 rounded-lg border transition-all ${data.value === item.value ? 'border-current bg-white/[0.04]' : 'gp-hairline opacity-45 hover:opacity-80'}`}
            style={{ color: item.color }}
          >
            <span className="mx-auto block h-2 w-2 rounded-full bg-current" />
          </button>
        ))}
      </div>
      <div data-island="progress" className="mt-auto space-y-1.5">
        <div className="flex justify-between  text-[8px] uppercase text-neutral-700">
          <span>Progress signal</span><span>{current.progress}%</span>
        </div>
        <ProgressBar value={current.progress} color={current.color} />
      </div>
    </div>
  )
}

// The Date card wears a whole skin family now, so it owns its own module
// (`../DateWidget.tsx`) rather than sharing this workflow file.

export function DailyAgendaWidget({
  data,
  onChange,
}: {
  data: DailyAgendaData
  onChange: (data: DailyAgendaData) => void
}) {
  const done = data.items.filter((item) => item.done).length
  const allDone = data.items.length > 0 && done === data.items.length
  const next = [...data.items].sort((a, b) => a.time.localeCompare(b.time)).find((item) => !item.done)
  const setItem = (id: string, patch: Partial<DailyAgendaData['items'][number]>) =>
    onChange({ ...data, items: data.items.map((item) => (item.id === id ? { ...item, ...patch } : item)) })
  const remove = (id: string) => onChange({ ...data, items: data.items.filter((item) => item.id !== id) })
  const add = () => onChange({ ...data, items: [...data.items, { id: crypto.randomUUID(), time: '09:00', title: '', done: false }] })

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center justify-between">
        <input aria-label="Agenda date" type="date" value={data.date} onChange={(event) => onChange({ ...data, date: event.target.value })} className="bg-transparent  text-[11px] text-sky-300 outline-none [color-scheme:dark]" />
        <span className=" text-[9px] text-neutral-600">{done}/{data.items.length} complete</span>
      </div>
      <ProgressBar value={data.items.length ? (done / data.items.length) * 100 : 0} color="#38bdf8" />
      <div data-island="agenda" data-floor-min-h="96" className="min-h-0 flex-1 overflow-y-auto rounded-xl border gp-hairline bg-neutral-900/25 px-2 py-1">
        {[...data.items].sort((a, b) => a.time.localeCompare(b.time)).map((item) => (
          <div key={item.id} className="group/agenda flex h-8 items-center gap-2 border-b gp-hairline last:border-0">
            <button type="button" role="checkbox" aria-label={item.title ? `Mark ${item.title} ${item.done ? 'not done' : 'done'}` : 'Toggle agenda item'} aria-checked={item.done} onClick={() => setItem(item.id, { done: !item.done })} className={`flex h-4 w-4 items-center justify-center rounded-full border ${item.done ? 'border-sky-400 bg-sky-400 text-neutral-950' : 'border-neutral-700 text-transparent'}`}><Check size={9} /></button>
            <input aria-label="Agenda item time" type="time" value={item.time} onChange={(event) => setItem(item.id, { time: event.target.value })} className="w-[62px] bg-transparent  text-[9px] text-neutral-500 outline-none [color-scheme:dark]" />
            <input aria-label="Agenda item title" value={item.title} placeholder="Agenda item…" onChange={(event) => setItem(item.id, { title: event.target.value })} className={`${inputClass} flex-1 ${item.done ? 'text-neutral-600 line-through' : ''}`} />
            <SmallAction label="Remove item" danger onClick={() => remove(item.id)}><X size={9} /></SmallAction>
          </div>
        ))}
      </div>
      <div data-island="summary" className="flex items-end justify-between">
        <AddButton label="Add item" onClick={add} />
        <div className="grid grid-cols-3 gap-1">
          <Stat label="Done" value={done} />
          <Stat label="All done" value={allDone ? 'Yes' : 'No'} accent={allDone ? 'text-emerald-300' : 'text-neutral-500'} />
          <Stat label="Next" value={next?.title || '—'} accent="text-sky-300" />
        </div>
      </div>
    </div>
  )
}

const PROCESS_META: Record<ProcessStepStatus, { label: string; color: string }> = {
  todo: { label: 'Queued', color: '#737373' },
  active: { label: 'Active', color: '#38bdf8' },
  done: { label: 'Done', color: '#34d399' },
}

export function ProcessWidget({
  data,
  onChange,
}: {
  data: ProcessData
  onChange: (data: ProcessData) => void
}) {
  const done = data.steps.filter((step) => step.status === 'done').length
  const progress = data.steps.length ? Math.round((done / data.steps.length) * 100) : 0
  const complete = data.steps.length > 0 && done === data.steps.length
  const current = data.steps.find((step) => step.status === 'active')
  const setStep = (id: string, patch: Partial<ProcessData['steps'][number]>) => onChange({ steps: data.steps.map((step) => (step.id === id ? { ...step, ...patch } : step)) })
  const setActive = (id: string) => onChange({ steps: data.steps.map((step) => ({ ...step, status: step.id === id ? 'active' : step.status === 'active' ? 'todo' : step.status })) })
  const advance = () => {
    const index = data.steps.findIndex((step) => step.status === 'active')
    if (index < 0) return
    onChange({ steps: data.steps.map((step, i) => i === index ? { ...step, status: 'done' } : i === index + 1 ? { ...step, status: 'active' } : step) })
  }
  const add = () => onChange({ steps: [...data.steps, { id: crypto.randomUUID(), label: '', status: data.steps.some((step) => step.status === 'active') ? 'todo' : 'active' }] })

  return (
    <div className="flex h-full flex-col gap-2">
      <div data-island="progress" className="flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-lime-300/70">Procedure</span>
        <div className="flex-1"><ProgressBar value={progress} color="#a3e635" /></div>
        <span className=" text-[9px] text-neutral-500">{progress}%</span>
      </div>
      <div data-island="steps" data-floor-min-h="96" className="min-h-0 flex-1">
        {data.steps.map((step, index) => {
          const meta = PROCESS_META[step.status]
          return (
            <div key={step.id} className="group/process relative flex h-8 items-center gap-2">
              {index < data.steps.length - 1 && <span className="absolute left-[7px] top-6 h-4 w-px bg-neutral-800" />}
              <button type="button" title="Make active" onClick={() => setActive(step.id)} className="relative z-10 h-3.5 w-3.5 rounded-full border-2 bg-neutral-950 transition-transform hover:scale-125" style={{ borderColor: meta.color }} />
              <span className="w-4  text-[8px] text-neutral-700">{String(index + 1).padStart(2, '0')}</span>
              <input value={step.label} placeholder="Process step…" onChange={(event) => setStep(step.id, { label: event.target.value })} className={`${inputClass} flex-1 ${step.status === 'done' ? 'text-neutral-600 line-through' : ''}`} />
              <span className=" text-[8px] uppercase" style={{ color: meta.color }}>{meta.label}</span>
              <SmallAction label="Remove step" danger onClick={() => onChange({ steps: data.steps.filter((item) => item.id !== step.id) })}><X size={9} /></SmallAction>
            </div>
          )
        })}
      </div>
      <div data-island="summary" className="flex items-end justify-between border-t gp-hairline pt-1">
        <div className="flex items-center gap-1"><AddButton label="Add step" onClick={add} /><button type="button" disabled={!current} onClick={advance} className="rounded-lg bg-lime-400/10 px-2 py-1.5 text-[10px] font-medium text-lime-300 disabled:opacity-30">Advance</button></div>
        <div className="grid grid-cols-3 gap-1">
          <Stat label="Progress" value={`${progress}%`} />
          <Stat label="Complete" value={complete ? 'Yes' : 'No'} accent={complete ? 'text-emerald-300' : 'text-neutral-500'} />
          <Stat label="Current" value={current?.label || '—'} accent="text-lime-300" />
        </div>
      </div>
    </div>
  )
}
