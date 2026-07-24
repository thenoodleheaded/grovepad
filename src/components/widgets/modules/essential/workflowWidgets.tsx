import { Check, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react'
import type {
  DailyAgendaData,
  DatePickerData,
  FormField,
  FormFieldType,
  FormWidgetData,
  OutlineData,
  ProcessData,
  ProcessStepStatus,
  StatusData,
  WorkflowStatus,
} from '../../../../types/spatial'
import { SmallAction, AddButton, Stat, ProgressBar } from './shared'
import { inputClass, panelClass, clamp, todayISO } from './sharedPrimitives'

/** Workflow widgets: Status, DatePicker, Outline, Form, DailyAgenda, Process. Extracted verbatim from EssentialWidgets.tsx. */
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

function daysUntil(date: string): number {
  if (!date) return 0
  const target = new Date(`${date}T00:00:00`)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const delta = Math.ceil((target.getTime() - now.getTime()) / 86_400_000)
  return Number.isFinite(delta) ? delta : 0
}

export function DatePickerWidget({
  data,
  onChange,
}: {
  data: DatePickerData
  onChange: (data: DatePickerData) => void
}) {
  const days = daysUntil(data.date)
  const due = Boolean(data.date) && days <= 0
  return (
    <div className="flex h-full flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <input
          value={data.label}
          onChange={(event) => onChange({ ...data, label: event.target.value })}
          className={`${inputClass} flex-1 font-medium`}
        />
        <button
          type="button"
          aria-label={data.includeTime ? 'Hide time field' : 'Show time field'}
          onClick={() => onChange({ ...data, includeTime: !data.includeTime })}
          className={`rounded-md border px-2 py-1  text-[8px] uppercase ${data.includeTime ? 'border-orange-400/40 text-orange-300' : 'gp-hairline text-neutral-600'}`}
        >
          Time
        </button>
      </div>
      <div data-island="date" className={`${panelClass} gp-date-row flex items-center gap-2 px-3 py-2`}>
        <input
          aria-label="Target date"
          type="date"
          value={data.date}
          onChange={(event) => onChange({ ...data, date: event.target.value })}
          className="min-w-0 flex-1 bg-transparent  text-[12px] text-neutral-300 outline-none [color-scheme:dark]"
        />
        {data.includeTime && (
          <input
            aria-label="Target time"
            type="time"
            value={data.time}
            onChange={(event) => onChange({ ...data, time: event.target.value })}
            className="w-20 bg-transparent  text-[11px] text-neutral-400 outline-none [color-scheme:dark]"
          />
        )}
      </div>
      <div data-island="summary" className="gp-date-summary grid grid-cols-2 gap-2">
        <Stat label="Days until" value={data.date ? days : '—'} accent={days < 0 ? 'text-red-300' : 'text-orange-300'} />
        <Stat label="Due state" value={!data.date ? 'Unset' : due ? 'Due' : 'Upcoming'} accent={due ? 'text-red-300' : 'text-emerald-300'} />
      </div>
      <div data-island="actions" className="mt-auto flex justify-end gap-1">
        <button type="button" onClick={() => onChange({ ...data, date: todayISO() })} className="rounded-md px-2 py-1 text-[9px] text-neutral-600 hover:bg-neutral-800 hover:text-neutral-300">Today</button>
        <button type="button" onClick={() => onChange({ ...data, date: '', time: '' })} className="rounded-md px-2 py-1 text-[9px] text-neutral-700 hover:bg-red-500/10 hover:text-red-400">Clear</button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Structured notes and planning
// ---------------------------------------------------------------------------

function outlineHiddenIndices(data: OutlineData): Set<number> {
  const hidden = new Set<number>()
  const collapsedDepths: number[] = []
  data.items.forEach((item, index) => {
    while (collapsedDepths.length > 0 && collapsedDepths[collapsedDepths.length - 1]! >= item.depth) {
      collapsedDepths.pop()
    }
    if (collapsedDepths.length > 0) hidden.add(index)
    else if (item.collapsed) collapsedDepths.push(item.depth)
  })
  return hidden
}

export function OutlineWidget({
  data,
  onChange,
}: {
  data: OutlineData
  onChange: (data: OutlineData) => void
}) {
  const hidden = outlineHiddenIndices(data)
  const setItem = (id: string, patch: Partial<OutlineData['items'][number]>) =>
    onChange({ items: data.items.map((item) => (item.id === id ? { ...item, ...patch } : item)) })
  const addAfter = (index: number) => {
    const depth = data.items[index]?.depth ?? 0
    const items = [...data.items]
    items.splice(index + 1, 0, { id: crypto.randomUUID(), text: '', depth, collapsed: false })
    onChange({ items })
  }
  const remove = (id: string) => onChange({ items: data.items.filter((item) => item.id !== id) })
  const topLevel = data.items.filter((item) => item.depth === 0).length

  return (
    <div className="flex h-full flex-col">
      <div data-island="summary" className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-sky-300/70">Structured outline</span>
        <span className="flex gap-2  text-[9px] text-neutral-600">
          <span>{topLevel} roots</span>
          <span>{data.items.length} items</span>
        </span>
      </div>
      <div data-island="outline" data-floor-min-h="96" className="min-h-0 flex-1 overflow-y-auto rounded-xl border gp-hairline bg-neutral-900/30 px-1.5 py-1">
        {data.items.map((item, index) => {
          if (hidden.has(index)) return null
          const nextDepth = data.items[index + 1]?.depth
          const hasChildren = nextDepth !== undefined && nextDepth > item.depth
          return (
            <div key={item.id} className="group/outline flex h-7 items-center gap-1" style={{ paddingLeft: Math.min(item.depth, 5) * 14 }}>
              {hasChildren ? (
                <SmallAction label={item.collapsed ? 'Expand branch' : 'Collapse branch'} onClick={() => setItem(item.id, { collapsed: !item.collapsed })}>
                  {item.collapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
                </SmallAction>
              ) : (
                <span className="mx-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400/50" />
              )}
              <input
                value={item.text}
                placeholder="Outline item…"
                onChange={(event) => setItem(item.id, { text: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    addAfter(index)
                  } else if (event.key === 'Tab') {
                    event.preventDefault()
                    setItem(item.id, { depth: clamp(item.depth + (event.shiftKey ? -1 : 1), 0, 5) })
                  }
                }}
                className={`${inputClass} flex-1`}
              />
              <div className="hidden items-center group-hover/outline:flex">
                <SmallAction label="Outdent" disabled={item.depth === 0} onClick={() => setItem(item.id, { depth: Math.max(0, item.depth - 1) })}>
                  <ChevronLeft size={9} />
                </SmallAction>
                <SmallAction label="Indent" disabled={item.depth >= 5 || index === 0} onClick={() => setItem(item.id, { depth: Math.min(5, item.depth + 1) })}>
                  <ChevronRight size={9} />
                </SmallAction>
                <SmallAction label="Remove item" danger onClick={() => remove(item.id)}><X size={9} /></SmallAction>
              </div>
            </div>
          )
        })}
      </div>
      <div data-island="controls" className="mt-1 flex items-center justify-between">
        <AddButton label="Add item" onClick={() => addAfter(data.items.length - 1)} />
        <span className=" text-[8px] text-neutral-700">Enter add · Tab indent</span>
      </div>
    </div>
  )
}

function formFieldFilled(field: FormField): boolean {
  if (field.type === 'checkbox') return field.value === true
  return String(field.value).trim().length > 0
}

function defaultFormValue(type: FormFieldType): FormField['value'] {
  if (type === 'checkbox') return false
  if (type === 'number') return 0
  return ''
}

export function FormWidget({
  data,
  onChange,
}: {
  data: FormWidgetData
  onChange: (data: FormWidgetData) => void
}) {
  const filled = data.fields.filter(formFieldFilled).length
  const complete = data.fields.length > 0 && data.fields.every((field) => !field.required || formFieldFilled(field))
  const setField = (id: string, patch: Partial<FormField>) =>
    onChange({ ...data, fields: data.fields.map((field) => (field.id === id ? { ...field, ...patch } : field)) })
  const removeField = (id: string) => onChange({ ...data, fields: data.fields.filter((field) => field.id !== id) })
  const addField = () =>
    onChange({
      ...data,
      fields: [...data.fields, { id: crypto.randomUUID(), label: 'Question', type: 'text', value: '', required: false }],
    })

  return (
    <div className="gp-pie-widget flex h-full flex-col gap-2">
      <div className="flex items-center justify-end">
        <span className={`rounded-full px-2 py-0.5  text-[8px] uppercase ${complete ? 'bg-emerald-400/10 text-emerald-300' : 'bg-neutral-800 text-neutral-600'}`}>
          {complete ? 'Ready' : 'Incomplete'}
        </span>
      </div>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
        {data.fields.map((field) => (
          <div key={field.id} data-island={field.id} className={`${panelClass} group/form px-2.5 py-2`}>
            <div className="mb-1 flex items-center gap-1.5">
              <input
                value={field.label}
                placeholder="Question"
                onChange={(event) => setField(field.id, { label: event.target.value })}
                className="min-w-0 flex-1 bg-transparent text-[10px] font-medium text-neutral-500 outline-none"
              />
              <button
                type="button"
                title="Required"
                onClick={() => setField(field.id, { required: !field.required })}
                className={` text-[9px] ${field.required ? 'text-rose-400' : 'text-neutral-700'}`}
              >
                *
              </button>
              <select
                value={field.type}
                onChange={(event) => {
                  const type = event.target.value as FormFieldType
                  setField(field.id, { type, value: defaultFormValue(type) })
                }}
                className="bg-transparent  text-[8px] uppercase text-neutral-600 outline-none"
              >
                <option value="text">Text</option><option value="number">Number</option><option value="checkbox">Check</option>
              </select>
              <SmallAction label="Remove field" danger onClick={() => removeField(field.id)}><X size={9} /></SmallAction>
            </div>
            {field.type === 'checkbox' ? (
              <button
                type="button"
                role="checkbox"
                aria-checked={field.value === true}
                onClick={() => setField(field.id, { value: field.value !== true })}
                className={`flex h-7 w-full items-center gap-2 rounded-lg border px-2 text-[11px] transition-colors ${field.value === true ? 'border-teal-400/40 bg-teal-400/10 text-teal-300' : 'gp-hairline text-neutral-600'}`}
              >
                <span className="flex h-3.5 w-3.5 items-center justify-center rounded border border-current">{field.value === true && <Check size={9} />}</span>
                Confirm
              </button>
            ) : (
              <input
                type={field.type}
                value={field.value as string | number}
                placeholder="Answer…"
                onChange={(event) => setField(field.id, { value: field.type === 'number' ? Number(event.target.value) : event.target.value })}
                className={`${inputClass} h-7 rounded-lg border gp-hairline bg-neutral-950/30 px-2`}
              />
            )}
          </div>
        ))}
      </div>
      <div data-island="summary" className="flex items-end justify-between border-t gp-hairline pt-1.5">
        <AddButton label="Add field" onClick={addField} />
        <div className="flex gap-1.5">
          <Stat label="Filled" value={`${filled}/${data.fields.length}`} />
          <Stat label="Complete" value={complete ? 'Yes' : 'No'} accent={complete ? 'text-emerald-300' : 'text-neutral-500'} />
        </div>
      </div>
    </div>
  )
}

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
