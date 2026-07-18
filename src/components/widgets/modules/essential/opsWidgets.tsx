import { ArrowLeftRight, Check, Copy, Minus, Plus, X } from 'lucide-react'
import type {
  InventoryData,
  LineChartData,
  LogbookData,
  PieChartData,
  TimesheetData,
  UnitConverterCategory,
  UnitConverterData,
} from '../../../../types/spatial'
import { useFieldAnchor } from '../../../../hooks/useFieldAnchor'
import { useTransientValue } from '../../../../hooks/useTransientValue'
import { SmallAction, AddButton, Stat } from './shared'
import { inputClass, numericClass, panelClass, finite, clamp, todayISO } from './sharedPrimitives'

/** Ops and chart widgets: Timesheet, Inventory, Logbook, LineChart, PieChart, UnitConverter. Extracted verbatim from EssentialWidgets.tsx. */
export function TimesheetWidget({
  data,
  onChange,
}: {
  data: TimesheetData
  onChange: (data: TimesheetData) => void
}) {
  const totalRef = useFieldAnchor<HTMLDivElement>('total_hours')
  const billableRef = useFieldAnchor<HTMLDivElement>('billable_hours')
  const amountRef = useFieldAnchor<HTMLDivElement>('amount')
  const total = data.entries.reduce((sum, entry) => sum + Math.max(0, finite(entry.hours)), 0)
  const billable = data.entries.reduce((sum, entry) => sum + (entry.billable ? Math.max(0, finite(entry.hours)) : 0), 0)
  const amount = billable * Math.max(0, finite(data.hourlyRate))
  const setEntry = (id: string, patch: Partial<TimesheetData['entries'][number]>) =>
    onChange({ ...data, entries: data.entries.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)) })
  const add = () => onChange({ ...data, entries: [...data.entries, { id: crypto.randomUUID(), date: todayISO(), label: '', hours: 1, billable: true }] })

  return (
    <div className="flex h-full flex-col gap-2">
      <div data-island="summary" data-island-size="fixed" className="grid grid-cols-3 gap-2">
        <Stat anchor={totalRef} label="Total hours" value={Math.round(total * 100) / 100} accent="text-cyan-300" />
        <Stat anchor={billableRef} label="Billable" value={Math.round(billable * 100) / 100} accent="text-emerald-300" />
        <Stat anchor={amountRef} label="Amount" value={`${data.currency}${Math.round(amount * 100) / 100}`} accent="text-amber-300" />
      </div>
      <div data-island="billing" data-island-size="width" className="flex items-center justify-end gap-2  text-[8px] uppercase text-neutral-700">
        <label>Currency <input value={data.currency} onChange={(event) => onChange({ ...data, currency: event.target.value.slice(0, 3) })} className="w-8 bg-transparent text-center text-[10px] text-neutral-400 outline-none" /></label>
        <label>Rate <input type="number" min={0} value={data.hourlyRate} onChange={(event) => onChange({ ...data, hourlyRate: Math.max(0, Number(event.target.value)) })} className={`${numericClass} w-14 text-right text-[10px] text-neutral-400`} /></label>
      </div>
      <div data-island="entries" data-island-size="free" data-island-min-h="96" className="min-h-0 flex-1 overflow-y-auto rounded-xl border gp-hairline bg-neutral-900/25 px-2">
        {data.entries.map((entry) => (
          <div key={entry.id} className="group/time flex h-10 items-center gap-2 border-b gp-hairline last:border-0">
            <input type="date" value={entry.date} onChange={(event) => setEntry(entry.id, { date: event.target.value })} className="w-[88px] bg-transparent  text-[8px] text-neutral-600 outline-none [color-scheme:dark]" />
            <input value={entry.label} placeholder="Work item…" onChange={(event) => setEntry(entry.id, { label: event.target.value })} className={`${inputClass} flex-1`} />
            <label className="flex items-center gap-1"><input type="number" min={0} step={0.25} value={entry.hours} onChange={(event) => setEntry(entry.id, { hours: Math.max(0, Number(event.target.value)) })} className={`${numericClass} w-11 text-right text-[11px]`} /><span className="text-[8px] text-neutral-700">h</span></label>
            <button type="button" title="Toggle billable" onClick={() => setEntry(entry.id, { billable: !entry.billable })} className={`rounded px-1 py-0.5  text-[8px] uppercase ${entry.billable ? 'bg-emerald-400/10 text-emerald-300' : 'text-neutral-700'}`}>Bill</button>
            <SmallAction label="Remove entry" danger onClick={() => onChange({ ...data, entries: data.entries.filter((item) => item.id !== entry.id) })}><X size={9} /></SmallAction>
          </div>
        ))}
      </div>
      <AddButton label="Add time entry" onClick={add} />
    </div>
  )
}

export function InventoryWidget({
  data,
  onChange,
}: {
  data: InventoryData
  onChange: (data: InventoryData) => void
}) {
  const totalRef = useFieldAnchor<HTMLDivElement>('total_units')
  const lowRef = useFieldAnchor<HTMLDivElement>('low_stock_count')
  const stockedRef = useFieldAnchor<HTMLDivElement>('all_stocked')
  const total = data.items.reduce((sum, item) => sum + Math.max(0, finite(item.quantity)), 0)
  const low = data.items.filter((item) => item.quantity <= item.minimum)
  const allStocked = data.items.length > 0 && low.length === 0
  const setItem = (id: string, patch: Partial<InventoryData['items'][number]>) =>
    onChange({ items: data.items.map((item) => (item.id === id ? { ...item, ...patch } : item)) })
  const add = () => onChange({ items: [...data.items, { id: crypto.randomUUID(), name: '', quantity: 0, minimum: 0, unit: 'pcs' }] })

  return (
    <div className="flex h-full flex-col gap-2">
      <div data-island="summary" data-island-size="fixed" className="grid grid-cols-3 gap-2">
        <Stat anchor={totalRef} label="Total units" value={Math.round(total * 100) / 100} />
        <Stat anchor={lowRef} label="Low stock" value={low.length} accent={low.length ? 'text-amber-300' : 'text-emerald-300'} />
        <Stat anchor={stockedRef} label="All stocked" value={allStocked ? 'Yes' : 'No'} accent={allStocked ? 'text-emerald-300' : 'text-neutral-500'} />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_88px_64px_24px] gap-2 px-2  text-[8px] uppercase tracking-wider text-neutral-700">
        <span>Item</span><span className="text-center">Quantity</span><span className="text-center">Minimum</span><span />
      </div>
      <div data-island="inventory" data-island-size="free" data-island-min-h="96" className="min-h-0 flex-1 overflow-y-auto rounded-xl border gp-hairline bg-neutral-900/25 px-2">
        {data.items.map((item) => {
          const isLow = item.quantity <= item.minimum
          return (
            <div key={item.id} className={`group/inventory grid min-h-[62px] grid-cols-[minmax(0,1fr)_88px_64px_24px] items-center gap-2 border-b gp-hairline py-1 last:border-0 ${isLow ? 'bg-amber-400/[0.035]' : ''}`}>
              <div className="gp-well min-w-0 px-1 py-0.5"><input value={item.name} placeholder="Item…" onChange={(event) => setItem(item.id, { name: event.target.value })} className="gp-input--bare w-full min-w-0 font-medium text-neutral-200 outline-none" /><input value={item.unit} placeholder="unit" onChange={(event) => setItem(item.id, { unit: event.target.value })} className="gp-input--bare w-full min-w-0  text-[9px] text-neutral-600 outline-none" /></div>
              <div className="gp-well flex items-center justify-between px-1"><button type="button" aria-label={`Decrease ${item.name || 'item'} quantity`} onClick={() => setItem(item.id, { quantity: Math.max(0, item.quantity - 1) })} className="text-neutral-500 hover:text-neutral-300"><Minus size={9} aria-hidden /></button><input type="number" min={0} aria-label={`${item.name || 'Item'} quantity`} value={item.quantity} onChange={(event) => setItem(item.id, { quantity: Math.max(0, Number(event.target.value)) })} className={`gp-input--bare ${numericClass} w-10 text-center text-[11px] ${isLow ? 'text-amber-300' : ''}`} /><button type="button" aria-label={`Increase ${item.name || 'item'} quantity`} onClick={() => setItem(item.id, { quantity: item.quantity + 1 })} className="text-neutral-500 hover:text-neutral-300"><Plus size={9} aria-hidden /></button></div>
              <input type="number" min={0} aria-label={`${item.name || 'Item'} minimum quantity`} value={item.minimum} onChange={(event) => setItem(item.id, { minimum: Math.max(0, Number(event.target.value)) })} className={`gp-input--compact ${numericClass} w-full text-center text-[10px] text-neutral-500`} />
              <SmallAction label="Remove item" danger onClick={() => onChange({ items: data.items.filter((entry) => entry.id !== item.id) })}><X size={9} /></SmallAction>
            </div>
          )
        })}
      </div>
      <AddButton label="Add inventory item" onClick={add} />
    </div>
  )
}

const LOG_LEVELS = ['note', 'info', 'warning'] as const
const LOG_COLORS = { note: '#94a3b8', info: '#38bdf8', warning: '#f59e0b' } as const

export function LogbookWidget({
  data,
  onChange,
}: {
  data: LogbookData
  onChange: (data: LogbookData) => void
}) {
  const countRef = useFieldAnchor<HTMLDivElement>('entry_count')
  const latestRef = useFieldAnchor<HTMLDivElement>('latest')
  const latest = [...data.entries].sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0]
  const setEntry = (id: string, patch: Partial<LogbookData['entries'][number]>) =>
    onChange({ entries: data.entries.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)) })
  const add = () => onChange({ entries: [...data.entries, { id: crypto.randomUUID(), timestamp: new Date().toISOString(), text: '', level: 'note' }] })

  return (
    <div className="flex h-full flex-col gap-2">
      <div data-island="summary" data-island-size="fixed" className="grid grid-cols-[90px_1fr] gap-2"><Stat anchor={countRef} label="Entries" value={data.entries.length} /><Stat anchor={latestRef} label="Latest" value={latest?.text || '—'} accent="text-slate-300" /></div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
        {[...data.entries].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).map((entry) => {
          const levelIndex = LOG_LEVELS.indexOf(entry.level)
          const color = LOG_COLORS[entry.level]
          return (
            <div key={entry.id} data-island={entry.id} data-island-size="width" className={`${panelClass} group/log flex items-start gap-2 px-2.5 py-2`}>
              <button type="button" title="Change level" onClick={() => setEntry(entry.id, { level: LOG_LEVELS[(levelIndex + 1) % LOG_LEVELS.length]! })} className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}55` }} />
              <div className="min-w-0 flex-1"><textarea value={entry.text} placeholder="Log what happened…" rows={1} onChange={(event) => setEntry(entry.id, { text: event.target.value })} className={`${inputClass} resize-none leading-relaxed`} /><p className="mt-0.5  text-[8px] text-neutral-700">{new Date(entry.timestamp).toLocaleString()} · {entry.level}</p></div>
              <SmallAction label="Remove entry" danger onClick={() => onChange({ entries: data.entries.filter((item) => item.id !== entry.id) })}><X size={9} /></SmallAction>
            </div>
          )
        })}
      </div>
      <AddButton label="Append entry" onClick={add} />
    </div>
  )
}

export function LineChartWidget({
  data,
  onChange,
}: {
  data: LineChartData
  onChange: (data: LineChartData) => void
}) {
  const latestRef = useFieldAnchor<HTMLDivElement>('latest')
  const averageRef = useFieldAnchor<HTMLDivElement>('average')
  const maxRef = useFieldAnchor<HTMLDivElement>('max')
  const values = data.points.map((point) => finite(point.value))
  const latest = values[values.length - 1] ?? 0
  const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
  const maximum = values.length ? Math.max(...values) : 0
  const chart = (() => {
    if (values.length === 0) return [] as Array<{ x: number; y: number }>
    const min = Math.min(...values)
    const max = Math.max(...values)
    const range = max - min || 1
    return values.map((value, index) => ({ x: 10 + (index / Math.max(1, values.length - 1)) * 280, y: 84 - ((value - min) / range) * 68 }))
  })()
  const add = () => onChange({ ...data, points: [...data.points, { id: crypto.randomUUID(), label: String.fromCharCode(65 + data.points.length), value: latest }] })
  const addAt = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect=event.currentTarget.getBoundingClientRect()
    const ratio=Math.max(0,Math.min(1,1-(event.clientY-rect.top)/rect.height))
    const min=values.length?Math.min(...values):0;const max=values.length?Math.max(...values):100
    const value=Math.round((min+ratio*(max-min||100))*100)/100
    onChange({...data,points:[...data.points,{id:crypto.randomUUID(),label:String.fromCharCode(65+data.points.length),value}]})
  }

  return (
    <div className="gp-flat-visual flex h-full flex-col gap-2">
      <div className="flex items-center justify-end"><input value={data.unit} placeholder="unit" onChange={(event) => onChange({ ...data, unit: event.target.value })} className="w-12 bg-transparent text-right  text-[9px] text-neutral-600 outline-none" /></div>
      <div role="button" tabIndex={0} aria-label="Oscilloscope. Click to add a point" data-island="scope" data-island-size="free" data-island-min-h="96" onClick={addAt} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();add()}}} className="gp-line-scope gp-flat-visual-own relative h-32 shrink-0 cursor-crosshair overflow-hidden border border-emerald-300/15 outline-none focus-visible:ring-1 focus-visible:ring-emerald-300/50">
        <svg viewBox="0 0 300 96" preserveAspectRatio="none" className="h-full w-full" role="img" aria-label="Line chart">
          {chart.length > 1 && <polyline points={chart.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke="#38bdf8" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
          {chart.map((point, index) => <circle key={data.points[index]?.id ?? index} cx={point.x} cy={point.y} r="3" fill="#0a0a0a" stroke="#7dd3fc" strokeWidth="1.5"><title>{data.points[index]?.label}: {values[index]}{data.unit}</title></circle>)}
        </svg>
      </div>
      <div data-island="summary" data-island-size="fixed" className="grid grid-cols-3 gap-2"><Stat anchor={latestRef} label="Latest" value={`${Math.round(latest * 100) / 100}${data.unit}`} accent="text-sky-300" /><Stat anchor={averageRef} label="Average" value={Math.round(average * 100) / 100} /><Stat anchor={maxRef} label="Maximum" value={Math.round(maximum * 100) / 100} /></div>
      <p className="text-center  text-[8px] tracking-widest text-emerald-200/35">CLICK THE GLASS TO SAMPLE · ENTER ADDS LATEST</p>
    </div>
  )
}

function pieGradient(data: PieChartData): string {
  const total = data.segments.reduce((sum, segment) => sum + Math.max(0, finite(segment.value)), 0)
  if (total <= 0) return 'conic-gradient(#262626 0deg 360deg)'
  let angle = 0
  const stops = data.segments.map((segment) => {
    const start = angle
    angle += (Math.max(0, finite(segment.value)) / total) * 360
    return `${segment.color} ${start}deg ${angle}deg`
  })
  return `conic-gradient(${stops.join(', ')})`
}

export function PieChartWidget({
  data,
  onChange,
}: {
  data: PieChartData
  onChange: (data: PieChartData) => void
}) {
  const totalRef = useFieldAnchor<HTMLDivElement>('total')
  const shareRef = useFieldAnchor<HTMLDivElement>('largest_share')
  const labelRef = useFieldAnchor<HTMLDivElement>('largest_label')
  const total = data.segments.reduce((sum, segment) => sum + Math.max(0, finite(segment.value)), 0)
  const largest = data.segments.reduce<LineChartData['points'][number] | PieChartData['segments'][number] | null>((best, segment) => !best || segment.value > best.value ? segment : best, null)
  const largestShare = total > 0 && largest ? (Math.max(0, largest.value) / total) * 100 : 0
  const setSegment = (id: string, patch: Partial<PieChartData['segments'][number]>) => onChange({ ...data, segments: data.segments.map((segment) => segment.id === id ? { ...segment, ...patch } : segment) })
  const palette = ['#38bdf8', '#a3e635', '#f472b6', '#f59e0b', '#a78bfa', '#34d399']
  const add = () => onChange({ ...data, segments: [...data.segments, { id: crypto.randomUUID(), label: `Segment ${data.segments.length + 1}`, value: 10, color: palette[data.segments.length % palette.length]! }] })

  return (
    <div className="gp-flat-visual flex h-full flex-col gap-2">
      <div className="flex items-center justify-end"><button type="button" onClick={() => onChange({ ...data, mode: data.mode === 'donut' ? 'pie' : 'donut' })} className="rounded-md border gp-hairline px-2 py-1  text-[8px] uppercase text-neutral-500">{data.mode}</button></div>
      <div className="gp-pie-layout grid min-h-0 flex-1 grid-cols-[minmax(96px,180px)_minmax(120px,1fr)] items-start gap-3">
        {/* A stretched circle is a lie (XVIII.1): the disc scales only proportionally. */}
        <div data-island="disc" data-island-size="aspect" data-island-min-w="96" data-island-min-h="96" data-island-max-w="224" data-island-max-h="224" className="flex aspect-square h-full min-h-24 w-auto min-w-24 max-w-full items-center justify-center justify-self-center self-start"><div className="relative aspect-square h-full w-full rounded-full shadow-[0_10px_30px_rgba(0,0,0,0.25)]" style={{ background: pieGradient(data) }}>{data.mode === 'donut' && <div className="absolute inset-[25%] flex flex-col items-center justify-center rounded-full bg-neutral-950 shadow-inner"><span className=" text-[8px] uppercase text-neutral-700">Total</span><strong className=" text-sm text-neutral-200">{Math.round(total * 100) / 100}</strong></div>}</div></div>
        <div data-island="segments" data-island-size="free" data-island-min-w="120" data-island-min-h="96" data-island-max-h="260" className="min-h-0 overflow-y-auto">
          {data.segments.map((segment) => (
            <div key={segment.id} className="group/segment flex h-8 items-center gap-1.5 border-b gp-hairline last:border-0">
              <input aria-label={`${segment.label} color`} type="color" value={segment.color} onChange={(event) => setSegment(segment.id, { color: event.target.value })} className="h-4 w-4 cursor-pointer rounded border-0 bg-transparent p-0" />
              <input aria-label="Segment label" value={segment.label} onChange={(event) => setSegment(segment.id, { label: event.target.value })} className={`${inputClass} flex-1 text-[10px]`} />
              <input aria-label={`${segment.label} value`} type="number" min={0} value={segment.value} onChange={(event) => setSegment(segment.id, { value: Math.max(0, Number(event.target.value)) })} className={`${numericClass} w-12 text-right text-[10px]`} />
              <SmallAction label="Remove segment" danger onClick={() => onChange({ ...data, segments: data.segments.filter((item) => item.id !== segment.id) })}><X size={8} /></SmallAction>
            </div>
          ))}
        </div>
      </div>
      <div data-island="summary" data-island-size="fixed" className="gp-pie-summary grid grid-cols-3 gap-2"><Stat anchor={totalRef} label="Total" value={Math.round(total * 100) / 100} /><Stat anchor={shareRef} label="Largest share" value={`${Math.round(largestShare * 10) / 10}%`} accent="text-pink-300" /><Stat anchor={labelRef} label="Largest" value={largest?.label || '—'} accent="text-pink-300" /></div>
      <AddButton label="Add segment" onClick={add} />
    </div>
  )
}

const LINEAR_UNITS: Record<Exclude<UnitConverterCategory, 'temperature'>, Record<string, number>> = {
  length: { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344 },
  mass: { mg: 0.000001, g: 0.001, kg: 1, oz: 0.0283495, lb: 0.453592, t: 1000 },
  time: { ms: 0.001, s: 1, min: 60, h: 3600, day: 86400, week: 604800 },
}
const TEMP_UNITS = ['C', 'F', 'K'] as const
const DEFAULT_UNITS: Record<UnitConverterCategory, [string, string]> = {
  length: ['m', 'ft'], mass: ['kg', 'lb'], temperature: ['C', 'F'], time: ['min', 'h'],
}

function unitsFor(category: UnitConverterCategory): string[] {
  return category === 'temperature' ? [...TEMP_UNITS] : Object.keys(LINEAR_UNITS[category])
}

function convertUnit(data: UnitConverterData): number {
  const value = finite(data.value)
  if (data.category !== 'temperature') {
    const units = LINEAR_UNITS[data.category]
    const from = units[data.from] ?? 1
    const to = units[data.to] ?? 1
    return (value * from) / to
  }
  let celsius = value
  if (data.from === 'F') celsius = (value - 32) * (5 / 9)
  else if (data.from === 'K') celsius = value - 273.15
  if (data.to === 'F') return celsius * (9 / 5) + 32
  if (data.to === 'K') return celsius + 273.15
  return celsius
}

export function UnitConverterWidget({
  data,
  onChange,
}: {
  data: UnitConverterData
  onChange: (data: UnitConverterData) => void
}) {
  const inputRef = useFieldAnchor<HTMLDivElement>('input')
  const outputRef = useFieldAnchor<HTMLDivElement>('output')
  const [copied, showCopied] = useTransientValue(false)
  const output = convertUnit(data)
  const precision = clamp(Math.round(data.precision), 0, 8)
  const formatted = Number.isFinite(output) ? Number(output.toFixed(precision)).toString() : '0'
  const units = unitsFor(data.category)
  const setCategory = (category: UnitConverterCategory) => {
    const [from, to] = DEFAULT_UNITS[category]
    onChange({ ...data, category, from, to })
  }
  const copy = () => {
    void navigator.clipboard?.writeText(formatted)
    showCopied(true, 900)
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <select aria-label="Unit category" value={data.category} onChange={(event) => setCategory(event.target.value as UnitConverterCategory)} className="mx-auto rounded-full border gp-hairline bg-neutral-900 px-3 py-1  text-[9px] uppercase tracking-wider text-emerald-300 outline-none">
        <option value="length">Length</option><option value="mass">Mass</option><option value="temperature">Temperature</option><option value="time">Time</option>
      </select>
      <div data-island="conversion" data-island-size="fixed" className="gp-unit-conversion grid grid-cols-[1fr_34px_1fr] items-stretch gap-2">
        <div ref={inputRef} className={`${panelClass} px-3 py-2`}><span className=" text-[8px] uppercase text-neutral-700">Input</span><input aria-label="Value to convert" type="number" value={data.value} onChange={(event) => onChange({ ...data, value: Number(event.target.value) })} className={`${numericClass} mt-1 w-full text-xl font-bold`} /><select aria-label="Source unit" value={data.from} onChange={(event) => onChange({ ...data, from: event.target.value })} className="mt-1 w-full bg-transparent  text-[9px] text-neutral-500 outline-none">{units.map((unit) => <option key={unit}>{unit}</option>)}</select></div>
        <button type="button" aria-label="Swap units" onClick={() => onChange({ ...data, from: data.to, to: data.from })} className="flex items-center justify-center text-neutral-600 transition-transform hover:rotate-180 hover:text-emerald-300"><ArrowLeftRight size={14} /></button>
        <div ref={outputRef} className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.055] px-3 py-2"><span className=" text-[8px] uppercase text-emerald-500/50">Output</span><div className="mt-1 flex items-center"><strong className="min-w-0 flex-1 truncate  text-xl text-emerald-200">{formatted}</strong><button type="button" aria-label="Copy output" onClick={copy} className="text-emerald-500/50 hover:text-emerald-300">{copied ? <Check size={11} /> : <Copy size={11} />}</button></div><select aria-label="Target unit" value={data.to} onChange={(event) => onChange({ ...data, to: event.target.value })} className="mt-1 w-full bg-transparent  text-[9px] text-emerald-500/60 outline-none">{units.map((unit) => <option key={unit}>{unit}</option>)}</select></div>
      </div>
      <div data-island="precision" data-island-size="width" className="gp-unit-precision mt-auto flex items-center justify-between gap-2 border-t gp-hairline pt-2">
        <span className=" text-[9px] text-neutral-700">1 {data.from} = {Number(convertUnit({ ...data, value: 1 }).toFixed(6))} {data.to}</span>
        <label className=" text-[8px] uppercase text-neutral-700">Precision <input type="number" min={0} max={8} value={data.precision} onChange={(event) => onChange({ ...data, precision: clamp(Number(event.target.value), 0, 8) })} className={`${numericClass} w-7 text-right text-[9px] text-neutral-500`} /></label>
      </div>
    </div>
  )
}
