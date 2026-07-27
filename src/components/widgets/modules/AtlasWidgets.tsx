import type { CSSProperties } from 'react'
import { Eye, EyeOff, Plus } from 'lucide-react'
import { useSharedClock } from '../../../hooks/useSharedClock'
import type { AtlasWidgetData, ModuleData } from '../../../types/spatial'
import { ATLAS_CATALOG, type AtlasType } from '../../../widgets/atlasCatalog'
import {
  ATLAS_CIRCULAR_VISUALS,
  ATLAS_COLLECTION_VISUALS,
  atlasItemsToggled,
  atlasSkinFor,
  type AtlasSkin,
} from '../../../widgets/atlasSkins'
import { commandsFor, fieldsFor } from '../../../widgets/fields'

const inputClass='gp-input min-w-0 px-2 py-1.5 outline-none'
const objectCollections=ATLAS_COLLECTION_VISUALS
const circularObjects=ATLAS_CIRCULAR_VISUALS

function pct(data:AtlasWidgetData){return Math.max(4,Math.min(100,data.primary/Math.max(1,data.target)*100))}
function display(value:unknown){if(typeof value==='number')return Number.isInteger(value)?String(value):value.toFixed(1);if(typeof value==='boolean')return value?'Yes':'No';if(Array.isArray(value))return `${value.length} points`;return String(value)}
function minuteOf(time:string){const [h,m]=time.split(':').map(Number);return (h||0)*60+(m||0)}

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

/** The Dial hero: one uniform instrument, so a card watched from across the
 *  board reads the same way whatever system it belongs to. */
function DialFace({type,data}:{type:AtlasType;data:AtlasWidgetData}){
  const spec=ATLAS_CATALOG[type]
  const hero=fieldsFor(type).find(field=>field.key===spec.heroField)
  const progress=pct(data)
  return <div data-field-key={spec.heroField} data-visual="dial" className="gp-atlas-object relative flex h-32 items-center justify-center overflow-hidden rounded-2xl border gp-hairline bg-white/[0.02]">
    <svg viewBox="0 0 160 96" className="absolute inset-0 h-full w-full"><path d="M20 82 A60 60 0 0 1 140 82" fill="none" stroke="#ffffff10" strokeWidth="10" strokeLinecap="round"/><path d="M20 82 A60 60 0 0 1 140 82" fill="none" stroke={spec.accent} strokeOpacity=".8" strokeWidth="10" strokeLinecap="round" pathLength="100" strokeDasharray={`${progress} 100`}/></svg>
    <div className="relative flex flex-col items-center">
      <span className="gp-value max-w-[13ch] truncate text-2xl font-semibold" style={{color:spec.accent}}>{display(hero?hero.get(data):data.primary)}</span>
      <span className="gp-label truncate text-[9px]">{hero?.label??'Progress'}</span>
      <span className="text-[9px] text-neutral-500">{Math.round(progress)}% of {display(data.target)}</span>
    </div>
  </div>
}

/** The Ledger body: the same items the object hero draws, as rows you can tick. */
function LedgerRows({type,data,onChange}:{type:AtlasType;data:AtlasWidgetData;onChange:(data:ModuleData)=>void}){
  const spec=ATLAS_CATALOG[type]
  if(data.items.length===0)return <div className="gp-well px-3 py-4 text-center text-[10px] text-neutral-500">No entries yet — use an action below to add one.</div>
  return <div data-field-key={spec.heroField} data-visual="ledger" className="space-y-1">{data.items.map(item=>
    <button key={item.id} type="button" aria-pressed={item.done} onClick={()=>onChange(atlasItemsToggled(data,item.id))} className="flex min-h-8 w-full items-center gap-2 rounded-xl border gp-hairline bg-white/[0.02] px-2 text-left transition hover:bg-white/[0.07] active:scale-[.99]">
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{background:item.done?'#a3e635':spec.accent,opacity:item.status==='waiting'?.45:1}}/>
      <span className={`min-w-0 flex-1 truncate text-[11px] ${item.done?'text-neutral-500 line-through':'text-neutral-300'}`}>{item.label}</span>
      <span className="shrink-0 text-[10px] tabular-nums text-neutral-500">{display(item.value)}</span>
    </button>)}
  </div>
}

/** The Trend body: the reading history this card already keeps, as a line. */
function TrendChart({type,data}:{type:AtlasType;data:AtlasWidgetData}){
  const spec=ATLAS_CATALOG[type]
  const points=data.history.slice(-32)
  if(points.length<2)return <div data-field-key={spec.heroField} data-visual="trend" className="gp-well flex h-28 items-center justify-center px-3 text-center text-[10px] text-neutral-500">Not enough readings yet — log a couple and the line appears here.</div>
  const values=points.map(point=>point.v)
  const min=Math.min(...values),max=Math.max(...values),span=Math.max(0.000001,max-min)
  const path=points.map((point,index)=>`${index===0?'M':'L'}${(index/(points.length-1))*300} ${44-((point.v-min)/span)*36}`).join(' ')
  const average=values.reduce((total,value)=>total+value,0)/values.length
  return <div className="space-y-2">
    <div data-field-key={spec.heroField} data-visual="trend" className="gp-atlas-object relative h-28 overflow-hidden rounded-2xl border gp-hairline bg-white/[0.02] p-2">
      <svg viewBox="0 0 300 48" preserveAspectRatio="none" className="h-full w-full"><path d={`${path} L300 48 L0 48 Z`} fill={spec.accent} fillOpacity=".08" stroke="none"/><path d={path} fill="none" stroke={spec.accent} strokeOpacity=".85" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/></svg>
    </div>
    <div className="grid grid-cols-3 gap-2">
      {([['Latest',values.at(-1)??0],['Average',average],['Peak',max]] as const).map(([label,value])=>
        <div key={label} className="gp-well min-w-0 px-2 py-2"><div className="gp-label truncate">{label}</div><div className="gp-value truncate">{display(Number(value.toFixed(2)))}</div></div>)}
    </div>
  </div>
}

/** The Schedule body: the named times this card already stores, across the day. */
function ScheduleRows({type,data}:{type:AtlasType;data:AtlasWidgetData}){
  const spec=ATLAS_CATALOG[type]
  const named=Object.entries(data.times).filter(([,time])=>Boolean(time))
  const rows=named.length>0?named:[['Opens',data.timeStart] as const,['Closes',data.timeEnd] as const]
  const now=new Date().getHours()*60+new Date().getMinutes()
  const upcoming=rows.filter(([,time])=>minuteOf(String(time))>=now).sort((a,b)=>minuteOf(String(a[1]))-minuteOf(String(b[1])))[0]
  return <div data-field-key={spec.heroField} data-visual="schedule" className="space-y-1">{[...rows].sort((a,b)=>minuteOf(String(a[1]))-minuteOf(String(b[1]))).map(([label,time])=>{
    const next=upcoming?.[0]===label
    return <div key={label} className="flex min-h-8 items-center gap-2 rounded-xl border gp-hairline px-2" style={{background:next?`${spec.accent}14`:'rgba(255,255,255,0.02)'}}>
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{background:next?spec.accent:'#52525b'}}/>
      <span className="min-w-0 flex-1 truncate text-[11px] capitalize text-neutral-300">{String(label).replaceAll('_',' ')}</span>
      <span className="shrink-0 text-[11px] tabular-nums" style={{color:next?spec.accent:'#a1a1aa'}}>{String(time)}</span>
    </div>
  })}</div>
}

function Readouts({type,data,limit}:{type:AtlasType;data:AtlasWidgetData;limit:number}){
  const readouts=fieldsFor(type).filter(field=>!field.set&&field.valueType!=='series').slice(0,limit)
  if(readouts.length===0)return null
  return <div className="grid grid-cols-3 gap-2">{readouts.map(field=><div key={field.key} data-field-key={field.key} className="gp-well min-w-0 px-2 py-2"><div className="gp-label truncate">{field.label}</div><div className="gp-value truncate">{display(field.get(data))}</div></div>)}</div>
}

function Writables({type,data,onChange}:{type:AtlasType;data:AtlasWidgetData;onChange:(data:ModuleData)=>void}){
  const writable=fieldsFor(type).filter(field=>field.set).slice(0,2)
  if(writable.length===0)return null
  return <div className="grid grid-cols-2 gap-1.5">{writable.map(field=>{const current=field.get(data);const inputType=field.key.includes('time')?'time':field.key.includes('date')?'date':field.valueType==='number'?'number':'text';return <label key={field.key} data-field-key={field.key} className="gp-subdivision min-w-0 rounded-xl border gp-hairline p-2 text-[8px] uppercase tracking-wide text-neutral-600">{field.label}<input aria-label={field.label} type={inputType} value={String(current)} onChange={event=>field.set&&onChange(field.set(data,field.valueType==='number'?Number(event.target.value):event.target.value))} className={`${inputClass} mt-1 w-full normal-case`}/></label>})}</div>
}

function Commands({type,data,limit,onChange}:{type:AtlasType;data:AtlasWidgetData;limit:number;onChange:(data:ModuleData)=>void}){
  const spec=ATLAS_CATALOG[type]
  const run=(key:string)=>{const command=commandsFor(type).find(item=>item.key===key);if(command)onChange(command.run(data))}
  const keys=spec.commands.slice(0,limit)
  if(keys.length===0)return null
  return <div className="flex flex-wrap gap-1.5">{keys.map(key=><button key={key} type="button" onClick={()=>run(key)} className="flex min-h-8 flex-1 items-center justify-center gap-1 rounded-xl border gp-hairline bg-white/[0.035] px-2 text-[9px] font-semibold text-neutral-300 transition hover:bg-white/[0.08] active:scale-95"><Plus size={9}/>{key.replaceAll('_',' ')}</button>)}</div>
}

/** The Compact body: one glanceable line, for a board packed with cards. */
function CompactLine({type,data,onChange}:{type:AtlasType;data:AtlasWidgetData;onChange:(data:ModuleData)=>void}){
  const spec=ATLAS_CATALOG[type]
  const Icon=spec.icon
  const hero=fieldsFor(type).find(field=>field.key===spec.heroField)
  return <div className="flex items-center gap-2">
    <span data-field-key={spec.heroField} className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border gp-hairline bg-white/[0.02] px-2.5 py-2">
      <Icon size={14} strokeWidth={1.6} style={{color:spec.accent}}/>
      <span className="gp-label min-w-0 flex-1 truncate text-[9px]">{hero?.label??spec.label}</span>
      <span className="gp-value shrink-0 truncate text-[13px] font-semibold" style={{color:spec.accent}}>{display(hero?hero.get(data):data.primary)}</span>
    </span>
    <Commands type={type} data={data} limit={1} onChange={onChange}/>
  </div>
}

export function AtlasWidget({type,data,skin:requestedSkin,onChange}:{type:AtlasType;data:AtlasWidgetData;skin?:AtlasSkin;onChange:(data:ModuleData)=>void}){
  const spec=ATLAS_CATALOG[type]
  // Which shape the card wears is a skin, chosen from the card's title roller.
  // Every branch below reads the one stored record — none of them owns data the
  // others cannot see, so rolling between them never costs anything.
  const skin=requestedSkin??atlasSkinFor(type,data)
  useSharedClock(60_000,spec.fields.some(field=>field.timeSensitive)||skin==='schedule',true)
  const style={'--gp-atlas-accent':spec.accent} as CSSProperties
  const discretion=type==='cycle_tracker'&&<button type="button" aria-label="Toggle discretion mode" onClick={()=>onChange({...data,privateMode:!data.privateMode})} className="absolute right-2 top-2 rounded-full border gp-hairline bg-neutral-950/70 p-1.5 text-neutral-400">{data.privateMode?<Eye size={11}/>:<EyeOff size={11}/>}</button>

  if(skin==='compact')return <div style={style}><CompactLine type={type} data={data} onChange={onChange}/></div>

  return <div className="space-y-3" style={style}>
    {skin==='object'&&<div className="relative rounded-2xl"><ObjectHero type={type} data={data}/>{discretion}</div>}
    {skin==='dial'&&<div className="relative rounded-2xl"><DialFace type={type} data={data}/>{discretion}</div>}
    {skin==='trend'&&<TrendChart type={type} data={data}/>}
    {skin==='ledger'&&<LedgerRows type={type} data={data} onChange={onChange}/>}
    {skin==='schedule'&&<ScheduleRows type={type} data={data}/>}
    <Readouts type={type} data={data} limit={skin==='dial'||skin==='trend'?2:3}/>
    <Writables type={type} data={data} onChange={onChange}/>
    <Commands type={type} data={data} limit={3} onChange={onChange}/>
  </div>
}
