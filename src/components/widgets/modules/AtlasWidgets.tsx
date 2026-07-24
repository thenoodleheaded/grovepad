import type { CSSProperties } from 'react'
import { Eye, EyeOff, Plus } from 'lucide-react'
import { useSharedClock } from '../../../hooks/useSharedClock'
import type { AtlasWidgetData, ModuleData } from '../../../types/spatial'
import { ATLAS_CATALOG, type AtlasType } from '../../../widgets/atlasCatalog'
import { commandsFor, fieldsFor } from '../../../widgets/fields'

const inputClass='gp-input min-w-0 px-2 py-1.5 outline-none'
const objectCollections=new Set(['deck','book','ledger','tags','plant','bag','bins','boxes','hourglass','combs','clipboard','stamps','receipt','grid','ladder','dishes','vault','beads','plates','stars','pet','passport','suitcase','wallet','easels','film','constellation','frost','streams'])
const circularObjects=new Set(['ring','crescent','orbit','eclipse','horizon','dome','clocks','gauge','meter','pressure','vu','moon','arc'])

function pct(data:AtlasWidgetData){return Math.max(4,Math.min(100,data.primary/Math.max(1,data.target)*100))}
function display(value:unknown){if(typeof value==='number')return Number.isInteger(value)?String(value):value.toFixed(1);if(typeof value==='boolean')return value?'Yes':'No';if(Array.isArray(value))return `${value.length} points`;return String(value)}

function ObjectHero({type,data}:{type:AtlasType;data:AtlasWidgetData}){
  const spec=ATLAS_CATALOG[type]
  const Icon=spec.icon
  const progress=pct(data)
  if(type==='prayer_times'){
    const markers=['fajr','dhuhr','asr','maghrib','isha']
    const next=String(fieldsFor(type).find(field=>field.key==='next_prayer')?.get(data)??'').toLowerCase()
    return <div data-field-key={spec.heroField} className="gp-atlas-object relative h-28 overflow-hidden rounded-2xl border gp-hairline bg-gradient-to-b from-sky-400/8 to-amber-300/5">
      <svg viewBox="0 0 300 120" className="h-full w-full"><path d="M18 98 Q150 -12 282 98" fill="none" stroke={spec.accent} strokeOpacity=".45" strokeWidth="2"/>{markers.map((key,index)=>{const x=36+index*57;const y=98-70*Math.sin((index+.5)/5*Math.PI);return <g key={key}><circle cx={x} cy={y} r={key===next?7:4} fill={key===next?spec.accent:'#64748b'} className={key===next?'gp-atlas-breathe':''}/><text x={x} y={y+17} textAnchor="middle" fill="#94a3b8" fontSize="7">{key.toUpperCase()}</text></g>})}<circle cx={40+progress*2.2} cy={92-60*Math.sin(progress/100*Math.PI)} r="8" fill="#fde68a" opacity=".85"/></svg>
    </div>
  }
  if(type==='cycle_tracker'&&data.privateMode)return <div data-field-key={spec.heroField} className="gp-atlas-object flex h-28 items-center justify-center rounded-2xl border gp-hairline bg-violet-400/5"><div className="h-20 w-20 rounded-full border border-violet-300/35 bg-[radial-gradient(circle_at_35%_35%,rgba(196,181,253,.35),transparent_55%)] shadow-[0_0_30px_rgba(167,139,250,.15)]"/></div>
  if(spec.visual==='vessel')return <div data-field-key={spec.heroField} data-visual={spec.visual} className="gp-atlas-object relative h-28 overflow-hidden rounded-[26px] border gp-hairline bg-white/[0.025]"><div className="gp-atlas-liquid absolute inset-x-0 bottom-0 transition-[height] duration-500" style={{height:`${progress}%`,background:`linear-gradient(180deg,${spec.accent}88,${spec.accent}30)`}}/><div className="absolute inset-x-5 top-4 flex justify-between  text-[9px] text-white/50"><span>{Math.round(progress)}%</span><DropletMarks/></div></div>
  if(circularObjects.has(spec.visual))return <div data-field-key={spec.heroField} data-visual={spec.visual} className="gp-atlas-object relative flex h-28 items-center justify-center overflow-hidden rounded-2xl border gp-hairline bg-white/[0.02]"><svg viewBox="0 0 160 100" className="h-full w-full"><path d="M24 78 A58 58 0 0 1 136 78" fill="none" stroke="#ffffff12" strokeWidth="12" strokeLinecap="round"/><path d="M24 78 A58 58 0 0 1 136 78" fill="none" stroke={spec.accent} strokeOpacity=".78" strokeWidth="8" strokeLinecap="round" pathLength="100" strokeDasharray={`${progress} 100`}/><line x1="80" y1="78" x2={80+48*Math.cos(Math.PI-(progress/100)*Math.PI)} y2={78-48*Math.sin((progress/100)*Math.PI)} stroke={spec.accent} strokeWidth="2" strokeLinecap="round"/><circle cx="80" cy="78" r="5" fill={spec.accent}/></svg><span className="absolute bottom-2  text-[10px] text-neutral-400">{Math.round(progress)}%</span></div>
  if(objectCollections.has(spec.visual))return <div data-field-key={spec.heroField} data-visual={spec.visual} className="gp-atlas-object relative h-28 overflow-hidden rounded-2xl border gp-hairline bg-white/[0.02] p-3"><div className="flex h-full items-end justify-center gap-2">{data.items.slice(0,5).map((item,index)=><div key={item.id} className="gp-atlas-piece relative flex min-w-10 flex-1 items-center justify-center rounded-xl border gp-hairline transition-all duration-300" style={{height:`${38+((item.value+index*17)%55)}%`,color:item.done?'#a3e635':spec.accent,background:item.done?'rgba(163,230,53,.12)':`${spec.accent}12`,opacity:item.status==='waiting'?.55:1}}><Icon size={Math.max(13,22-index)} strokeWidth={1.5}/><span className="absolute -bottom-3 max-w-full truncate text-[7px] uppercase text-neutral-600">{item.label}</span></div>)}</div></div>
  return <div data-field-key={spec.heroField} data-visual={spec.visual} className="gp-atlas-object flex h-28 items-center justify-center rounded-2xl border gp-hairline" style={{color:spec.accent}}><Icon size={44} strokeWidth={1.3}/></div>
}
function DropletMarks(){return <span aria-hidden className="flex gap-1"><i className="h-1 w-1 rounded-full bg-white/30"/><i className="h-1 w-1 rounded-full bg-white/20"/><i className="h-1 w-1 rounded-full bg-white/10"/></span>}

export function AtlasWidget({type,data,onChange}:{type:AtlasType;data:AtlasWidgetData;onChange:(data:ModuleData)=>void}){
  const spec=ATLAS_CATALOG[type]
  useSharedClock(60_000,spec.fields.some(field=>field.timeSensitive),true)
  const fields=fieldsFor(type)
  const readouts=fields.filter(field=>!field.set&&field.valueType!=='series').slice(0,3)
  const writable=fields.filter(field=>field.set).slice(0,2)
  const run=(key:string)=>{const command=commandsFor(type).find(item=>item.key===key);if(command)onChange(command.run(data))}
  // Which preset a Tracker wears is a skin, chosen from the card's title
  // roller — the card body only ever renders the preset it was handed.
  return <div className="space-y-3" style={{'--gp-atlas-accent':spec.accent} as CSSProperties}>
    <div className="relative rounded-2xl"><ObjectHero type={type} data={data}/>{type==='cycle_tracker'&&<button type="button" aria-label="Toggle discretion mode" onClick={()=>onChange({...data,privateMode:!data.privateMode})} className="absolute right-2 top-2 rounded-full border gp-hairline bg-neutral-950/70 p-1.5 text-neutral-400">{data.privateMode?<Eye size={11}/>:<EyeOff size={11}/>}</button>}</div>
    <div className="grid grid-cols-3 gap-2">{readouts.map(field=><div key={field.key} data-field-key={field.key} className="gp-well min-w-0 px-2 py-2"><div className="gp-label truncate">{field.label}</div><div className="gp-value truncate">{display(field.get(data))}</div></div>)}</div>
    {writable.length>0&&<div className="grid grid-cols-2 gap-1.5">{writable.map(field=>{const current=field.get(data);const inputType=field.key.includes('time')?'time':field.key.includes('date')?'date':field.valueType==='number'?'number':'text';return <label key={field.key} data-field-key={field.key} className="gp-subdivision min-w-0 rounded-xl border gp-hairline p-2 text-[8px] uppercase tracking-wide text-neutral-600">{field.label}<input aria-label={field.label} type={inputType} value={String(current)} onChange={event=>field.set&&onChange(field.set(data,field.valueType==='number'?Number(event.target.value):event.target.value))} className={`${inputClass} mt-1 w-full normal-case`}/></label>})}</div>}
    <div className="flex flex-wrap gap-1.5">{spec.commands.slice(0,3).map(key=><button key={key} type="button" onClick={()=>run(key)} className="flex min-h-8 flex-1 items-center justify-center gap-1 rounded-xl border gp-hairline bg-white/[0.035] px-2 text-[9px] font-semibold text-neutral-300 transition hover:bg-white/[0.08] active:scale-95"><Plus size={9}/>{key.replaceAll('_',' ')}</button>)}</div>
  </div>
}
