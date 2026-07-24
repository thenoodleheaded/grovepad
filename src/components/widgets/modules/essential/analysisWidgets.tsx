import { Plus, X } from 'lucide-react'
import type {
  DecisionMatrixData,
  RiskLevel,
  RiskRegisterData,
  SwotData,
} from '../../../../types/spatial'
import { WidgetPanel } from '../../WidgetPanel'
import { SmallAction, AddButton, Stat } from './shared'
import { inputClass, numericClass, panelClass, finite, clamp } from './sharedPrimitives'

/** Analysis widgets: RiskRegister, DecisionMatrix, Swot. Extracted verbatim from EssentialWidgets.tsx. */
function riskScore(likelihood: number, impact: number): number {
  return clamp(likelihood, 1, 5) * clamp(impact, 1, 5)
}

export function RiskRegisterWidget({
  data,
  onChange,
}: {
  data: RiskRegisterData
  onChange: (data: RiskRegisterData) => void
}) {
  const open = data.items.filter((item) => item.status === 'open')
  const highest = open.reduce((max, item) => Math.max(max, riskScore(item.likelihood, item.impact)), 0)
  const allResolved = data.items.length > 0 && open.length === 0
  const setItem = (id: string, patch: Partial<RiskRegisterData['items'][number]>) => onChange({ items: data.items.map((item) => (item.id === id ? { ...item, ...patch } : item)) })
  const sorted = [...data.items].sort((a, b) => riskScore(b.likelihood, b.impact) - riskScore(a.likelihood, a.impact))
  const add = () => onChange({ items: [...data.items, { id: crypto.randomUUID(), risk: '', likelihood: 3, impact: 3, mitigation: '', status: 'open' }] })

  return (
    <div className="flex h-full flex-col gap-2">
      <div data-island="summary" className="grid grid-cols-3 gap-2">
        <Stat label="Open" value={open.length} accent={open.length ? 'text-rose-300' : 'text-emerald-300'} />
        <Stat label="Highest score" value={highest} accent={highest >= 15 ? 'text-rose-300' : highest >= 8 ? 'text-amber-300' : 'text-neutral-300'} />
        <Stat label="All resolved" value={allResolved ? 'Yes' : 'No'} accent={allResolved ? 'text-emerald-300' : 'text-neutral-500'} />
      </div>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
        {sorted.map((item) => {
          const score = riskScore(item.likelihood, item.impact)
          const scoreColor = score >= 15 ? 'text-rose-300 bg-rose-400/10' : score >= 8 ? 'text-amber-300 bg-amber-400/10' : 'text-emerald-300 bg-emerald-400/10'
          return (
            <div key={item.id} data-island={item.id} className={`${panelClass} group/risk px-2.5 py-2 ${item.status === 'resolved' ? 'opacity-50' : ''}`}>
              <div className="flex items-center gap-2">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg  text-[11px] font-bold ${scoreColor}`}>{score}</span>
                <input value={item.risk} placeholder="Describe the risk…" onChange={(event) => setItem(item.id, { risk: event.target.value })} className={`${inputClass} flex-1 font-medium ${item.status === 'resolved' ? 'line-through' : ''}`} />
                {(['likelihood', 'impact'] as const).map((key) => (
                  <label key={key} className="flex items-center gap-1  text-[8px] uppercase text-neutral-700">
                    {key === 'likelihood' ? 'L' : 'I'}
                    <select value={item[key]} onChange={(event) => setItem(item.id, { [key]: Number(event.target.value) as RiskLevel })} className="rounded border gp-hairline bg-neutral-900 px-1 py-0.5 text-[9px] text-neutral-400 outline-none">
                      {[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}
                    </select>
                  </label>
                ))}
                <button type="button" onClick={() => setItem(item.id, { status: item.status === 'open' ? 'resolved' : 'open' })} className={`rounded-md px-1.5 py-1  text-[8px] uppercase ${item.status === 'resolved' ? 'text-emerald-300' : 'text-neutral-600 hover:text-neutral-300'}`}>{item.status === 'resolved' ? 'Resolved' : 'Resolve'}</button>
                <SmallAction label="Remove risk" danger onClick={() => onChange({ items: data.items.filter((risk) => risk.id !== item.id) })}><X size={9} /></SmallAction>
              </div>
              <input value={item.mitigation} placeholder="Mitigation / response…" onChange={(event) => setItem(item.id, { mitigation: event.target.value })} className="mt-1 w-full bg-transparent pl-9 text-[10px] text-neutral-500 outline-none placeholder:text-neutral-700" />
            </div>
          )
        })}
      </div>
      <AddButton label="Add risk" onClick={add} />
    </div>
  )
}

function decisionScore(data: DecisionMatrixData, optionIndex: number): number {
  const option = data.options[optionIndex]
  if (!option) return 0
  return data.criteria.reduce((sum, criterion, index) => sum + finite(criterion.weight, 1) * finite(option.scores[index] ?? 0), 0)
}

export function DecisionMatrixWidget({
  data,
  onChange,
}: {
  data: DecisionMatrixData
  onChange: (data: DecisionMatrixData) => void
}) {
  const scores = data.options.map((_, index) => decisionScore(data, index))
  const winnerIndex = scores.length ? scores.reduce((best, score, index) => score > scores[best]! ? index : best, 0) : -1
  const winner = data.options[winnerIndex]
  const setCriterion = (index: number, patch: Partial<DecisionMatrixData['criteria'][number]>) => onChange({ ...data, criteria: data.criteria.map((criterion, i) => i === index ? { ...criterion, ...patch } : criterion) })
  const setOption = (index: number, patch: Partial<DecisionMatrixData['options'][number]>) => onChange({ ...data, options: data.options.map((option, i) => i === index ? { ...option, ...patch } : option) })
  const addCriterion = () => onChange({ criteria: [...data.criteria, { id: crypto.randomUUID(), label: 'Criterion', weight: 1 }], options: data.options.map((option) => ({ ...option, scores: [...option.scores, 3] })) })
  const removeCriterion = (index: number) => onChange({ criteria: data.criteria.filter((_, i) => i !== index), options: data.options.map((option) => ({ ...option, scores: option.scores.filter((_, i) => i !== index) })) })
  const addOption = () => onChange({ ...data, options: [...data.options, { id: crypto.randomUUID(), label: `Option ${String.fromCharCode(65 + data.options.length)}`, scores: data.criteria.map(() => 3) }] })

  return (
    <div className="flex h-full flex-col gap-2">
      <div data-island="summary" className="grid grid-cols-2 gap-2">
        <Stat label="Leading option" value={winner?.label || '—'} accent="text-violet-300" />
        <Stat label="Weighted score" value={winnerIndex >= 0 ? Math.round(scores[winnerIndex]! * 100) / 100 : 0} accent="text-violet-300" />
      </div>
      <div data-island="matrix" data-floor-min-w="240" data-floor-min-h="96" className="min-h-0 flex-1 overflow-auto rounded-xl border gp-hairline">
        <table className="w-full min-w-[360px] border-collapse text-[10px]">
          <thead className="sticky top-0 z-10 bg-neutral-900/95">
            <tr>
              <th className="w-28 border-b border-r gp-hairline px-2 py-1.5 text-left font-medium text-neutral-600">Option</th>
              {data.criteria.map((criterion, index) => (
                <th key={criterion.id} className="group/criterion min-w-20 border-b border-r gp-hairline px-1 py-1">
                  <div className="flex items-center gap-1">
                    <input aria-label={`Criterion ${index + 1} label`} value={criterion.label} onChange={(event) => setCriterion(index, { label: event.target.value })} className="min-w-0 flex-1 bg-transparent text-center text-[9px] text-neutral-400 outline-none" />
                    <SmallAction label="Remove criterion" danger onClick={() => removeCriterion(index)}><X size={8} /></SmallAction>
                  </div>
                  <label className=" text-[8px] text-neutral-700">w <input aria-label={`${criterion.label} weight`} type="number" min={0} step={0.1} value={criterion.weight} onChange={(event) => setCriterion(index, { weight: Number(event.target.value) })} className={`${numericClass} w-8 text-center text-[8px] text-neutral-600`} /></label>
                </th>
              ))}
              <th className="border-b gp-hairline px-2 text-violet-400/70">Score</th>
            </tr>
          </thead>
          <tbody>
            {data.options.map((option, optionIndex) => (
              <tr key={option.id} className={winnerIndex === optionIndex ? 'bg-violet-400/[0.06]' : ''}>
                <td className="border-b border-r gp-hairline px-2 py-1.5"><input aria-label={`Option ${optionIndex + 1} label`} value={option.label} onChange={(event) => setOption(optionIndex, { label: event.target.value })} className={`${inputClass} font-medium ${winnerIndex === optionIndex ? 'text-violet-300' : ''}`} /></td>
                {data.criteria.map((criterion, criterionIndex) => (
                  <td key={criterion.id} className="border-b border-r gp-hairline text-center">
                    <input aria-label={`${option.label} score for ${criterion.label}`} type="number" min={0} max={5} step={1} value={option.scores[criterionIndex] ?? 0} onChange={(event) => setOption(optionIndex, { scores: option.scores.map((score, i) => i === criterionIndex ? clamp(Number(event.target.value), 0, 5) : score) })} className={`${numericClass} w-10 text-center text-[10px]`} />
                  </td>
                ))}
                <td className="border-b gp-hairline px-2 text-center  font-bold text-violet-300">{Math.round(scores[optionIndex]! * 10) / 10}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div data-island="actions" className="flex items-center justify-between"><AddButton label="Add option" onClick={addOption} /><AddButton label="Add criterion" onClick={addCriterion} /></div>
    </div>
  )
}

type SwotKey = keyof SwotData
const SWOT_META: Array<{ key: SwotKey; label: string; color: string }> = [
  { key: 'strengths', label: 'Strengths', color: '#34d399' },
  { key: 'weaknesses', label: 'Weaknesses', color: '#fb7185' },
  { key: 'opportunities', label: 'Opportunities', color: '#38bdf8' },
  { key: 'threats', label: 'Threats', color: '#f59e0b' },
]

function SwotQuadrant({
  label,
  color,
  items,
  onChange,
}: {
  label: string
  color: string
  items: string[]
  onChange: (items: string[]) => void
}) {
  return (
    <WidgetPanel grip={false} floor="rigid" className="group/swot flex min-h-0 flex-col p-3">
      <div className="mb-1 flex items-center justify-between"><span className="text-[9px] font-semibold uppercase tracking-widest" style={{ color }}>{label}</span><span className=" text-[8px] text-neutral-700">{items.filter((item) => item.trim()).length}</span></div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {items.map((item, index) => (
          <div key={index} className="group/swot-row flex h-6 items-center gap-1">
            <span className="h-1 w-1 shrink-0 rounded-full" style={{ backgroundColor: color }} />
            <input value={item} placeholder="Add insight…" onChange={(event) => onChange(items.map((value, i) => i === index ? event.target.value : value))} className={`${inputClass} flex-1 text-[10px]`} />
            <button type="button" aria-label="Remove insight" onClick={() => onChange(items.filter((_, i) => i !== index))} className="text-neutral-800 pointer-events-none opacity-0 hover:text-red-400 group-hover/swot-row:opacity-100 group-hover/swot-row:pointer-events-auto"><X size={8} /></button>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => onChange([...items, ''])} className="mt-1 flex h-5 items-center gap-1 text-[9px] text-neutral-700 pointer-events-none opacity-0 transition-opacity hover:text-neutral-400 group-hover/swot:opacity-100 group-hover/swot:pointer-events-auto"><Plus size={8} /> Add</button>
    </WidgetPanel>
  )
}

export function SwotWidget({ data, onChange }: { data: SwotData; onChange: (data: SwotData) => void }) {
  return (
    <div className="gp-swot-grid grid h-full grid-cols-2 grid-rows-2 gap-2">
      {SWOT_META.map((meta) => (
        <SwotQuadrant key={meta.key} label={meta.label} color={meta.color} items={data[meta.key]} onChange={(items) => onChange({ ...data, [meta.key]: items })} />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tracking and lightweight visualization
// ---------------------------------------------------------------------------
