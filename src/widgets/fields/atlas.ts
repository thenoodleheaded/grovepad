import type { AtlasWidgetData, ModuleData, ModuleType } from '../../types/spatial'
import type { FieldCommand, FieldValueType, SemanticUnit } from '../../types/fieldConnections'
import type { CommandDescriptor, FieldDescriptor, FieldValue } from '../fields'
import { ATLAS_CATALOG, ATLAS_TYPES, type AtlasFieldSpec, type AtlasType } from '../atlasCatalog'

const asData=(data:ModuleData)=>data as AtlasWidgetData
const numberValue=(value:FieldValue)=>Array.isArray(value)?value.at(-1)?.v??0:typeof value==='number'?value:typeof value==='boolean'?Number(value):Number.parseFloat(value)||0
const textValue=(value:FieldValue)=>Array.isArray(value)?value.map(point=>point.v).join(', '):String(value)
const boolValue=(value:FieldValue)=>Array.isArray(value)?value.length>0:typeof value==='boolean'?value:typeof value==='number'?value>=1:['true','1','yes','on'].includes(value.toLowerCase())
const minuteOf=(time:string)=>{const [h,m]=time.split(':').map(Number);return (h||0)*60+(m||0)}
const nowMinute=()=>new Date().getHours()*60+new Date().getMinutes()
const minutesUntil=(time:string)=>{const delta=minuteOf(time)-nowMinute();return delta<0?delta+1440:delta}
const clampPct=(value:number)=>Math.max(0,Math.min(100,value))
const daysUntil=(date:string)=>{const target=new Date(`${date}T00:00:00`);const today=new Date();today.setHours(0,0,0,0);return Math.ceil((target.getTime()-today.getTime())/86400000)||0}

function nextPrayer(data:AtlasWidgetData){
  const order=['fajr','dhuhr','asr','maghrib','isha']
  return order.map(key=>({key,time:data.times[key]??'00:00',minutes:minutesUntil(data.times[key]??'00:00')})).sort((a,b)=>a.minutes-b.minutes)[0]!
}
function fastingNow(data:AtlasWidgetData){const start=minuteOf(data.timeStart),end=minuteOf(data.timeEnd),now=nowMinute();return start<=end?now>=start&&now<end:now>=start||now<end}
function genericBoolean(type:AtlasType,key:string,data:AtlasWidgetData):boolean {
  if(type==='fasting_window'&&key==='fasting_now')return fastingNow(data)
  if(type==='outage_schedule'&&key==='power_on')return !fastingNow(data)
  if(type==='sun_window'&&key==='is_golden_hour')return minutesUntil(data.times.sunset??'18:00')<=60
  if(key==='above_nisab')return data.primary>data.target
  if(key==='in_range')return data.primary<=data.target&&data.primary>=data.target*.55
  if(key==='on_track'||key==='on_schedule'||key==='all_watered'||key==='today_complete'||key==='acknowledged'||key==='all_approved')return data.primary>=data.target||data.items.every(item=>item.done)
  if(key==='over_scope'||key==='overweight'||key==='overstay_risk'||key==='recurrence_alert'||key==='overdue'||key==='efficiency_drifting'||key==='pocket_low')return key==='pocket_low'?data.primary<data.target*.2:data.primary>data.target
  if(key==='reward_ready'||key==='any_cooled_and_affordable')return data.primary>=data.target
  if(key==='is_me')return data.enabled
  if(key==='overlap_now')return fastingNow(data)
  if(key==='is_collection_eve')return new Date().getDay()===data.primary%7
  if(key==='added_today')return Boolean(data.lastActionAt&&new Date(data.lastActionAt).toDateString()===new Date().toDateString())
  if(key==='running')return data.enabled
  if(key==='my_turn')return data.actionCount%Math.max(1,data.items.length)===0
  return data.enabled
}
function genericText(type:AtlasType,key:string,data:AtlasWidgetData):string {
  if(type==='prayer_times'){
    if(key==='next_prayer')return nextPrayer(data).key.replace(/^./,letter=>letter.toUpperCase())
    if(key in data.times)return data.times[key]??''
  }
  if(type==='fasting_window'&&key==='window_label')return `${data.timeStart}–${data.timeEnd}`
  if(type==='sun_window'&&(key==='sunrise'||key==='sunset'))return data.times[key]??''
  if(key.includes('date')||key.includes('expiry')||key.includes('review'))return data.date
  if(key.includes('next')||key.includes('oldest')||key.includes('current')||key.includes('frontier')||key.includes('top_')||key.includes('holder')||key.includes('weakest')||key.includes('portion')||key.includes('result'))return data.items.find(item=>!item.done)?.label??data.text??data.label
  if(key.includes('digest')||key.includes('summary')||key.includes('quote_text'))return data.items.map(item=>item.label).join(' · ')
  if(key==='phase')return ['menstrual','follicular','ovulation','luteal'][Math.floor((data.primary%Math.max(1,data.target))/Math.max(1,data.target)*4)]??'follicular'
  return data.text||data.label
}
function genericNumber(type:AtlasType,key:string,data:AtlasWidgetData):number {
  if(type==='prayer_times'&&key==='minutes_to_next')return nextPrayer(data).minutes
  if(type==='prayer_times'&&key==='prayers_done_today')return Math.min(5,data.actionCount)
  if(type==='fasting_window'&&key==='minutes_to_open')return minutesUntil(data.timeEnd)
  if(type==='zakat'&&key==='due_amount')return Math.max(0,data.primary-data.target)*(data.secondary||2.5)/100
  if(type==='meeting_cost'&&key==='cost_so_far')return data.enabled&&data.lastActionAt?(Date.now()-data.lastActionAt)/3600000*data.secondary*data.target:data.primary
  if(type==='visa_runway'&&key==='days_left')return Math.max(0,data.target-data.primary)
  if(type==='jet_lag_shifter'&&key==='days_to_aligned')return Math.ceil(Math.abs(data.secondary))
  if(type==='sun_window'&&key==='minutes_to_sunset')return minutesUntil(data.times.sunset??'18:00')
  if(key.includes('days_until')||key.includes('days_to')||key.includes('next_handoff'))return Math.max(0,daysUntil(data.date))
  if(key.includes('pct')||key.includes('health')||key.includes('readiness')||key.includes('strength')||key.includes('progress'))return clampPct(data.primary/Math.max(1,data.target)*100)
  if(key.includes('left')||key.includes('remaining'))return Math.max(0,data.target-data.primary)
  if(key.includes('count')||key.includes('papers_left')||key.includes('slots_open')||key.includes('gaps')||key.includes('ideas')){
    if(key.includes('left')||key.includes('open')||key==='gaps')return data.items.filter(item=>!item.done).length
    if(key.includes('overdue')||key.includes('due'))return data.items.filter(item=>!item.done&&daysUntil(item.date)<=0).length
    return data.items.length
  }
  if(key.includes('total')||key.includes('revenue')||key.includes('cost')||key.includes('amount')||key.includes('value'))return data.items.reduce((sum,item)=>sum+item.value,0)+data.primary
  if(key.includes('rate')||key.includes('avg')||key.includes('efficiency')||key.includes('hours')||key.includes('debt'))return data.secondary||data.primary
  if(key.includes('round'))return data.actionCount+1
  return data.primary
}
/**
 * Advisory semantic tag inferred from a field's own key name — the same
 * pattern-matching idiom `genericNumber`/`genericText` already use to decide
 * *what* a key means; this decides what *unit* it's expressed in. Purely a
 * hint for auto-suggested wire transforms, so a false negative just means no
 * suggestion (identity), never a wrong one.
 */
function inferUnit(key: string, valueType: FieldValueType): SemanticUnit | undefined {
  if (valueType === 'text' && (key.includes('date') || key.includes('expiry') || key.includes('review'))) return 'date_iso'
  if (valueType !== 'number') return undefined
  if (key.includes('pct') || key.includes('health') || key.includes('readiness') || key.includes('strength') || key.includes('progress')) return 'percent'
  if (key.includes('total') || key.includes('revenue') || key.includes('cost') || key.includes('amount') || key.includes('due_amount') || key.includes('spend')) return 'currency'
  if (key.includes('count') || key.includes('left') || key.includes('remaining') || key.includes('days_until') || key.includes('days_to') || key.includes('papers_left') || key.includes('slots_open') || key.includes('gaps')) return 'count'
  return undefined
}

function getValue(type:AtlasType,field:AtlasFieldSpec,data:AtlasWidgetData){
  if(field.valueType==='series')return data.history
  if(field.valueType==='boolean')return genericBoolean(type,field.key,data)
  if(field.valueType==='text')return genericText(type,field.key,data)
  return genericNumber(type,field.key,data)
}
function setValue(field:AtlasFieldSpec,data:AtlasWidgetData,value:FieldValue):AtlasWidgetData {
  const slot=field.writable
  if(!slot)return data
  if(slot==='enabled')return {...data,enabled:boolValue(value)}
  if(slot==='text'||slot==='date'||slot==='timeStart'||slot==='timeEnd')return {...data,[slot]:textValue(value)}
  return {...data,[slot]:numberValue(value)}
}

export const ATLAS_FIELDS:Partial<Record<ModuleType,FieldDescriptor[]>>=Object.fromEntries(
  ATLAS_TYPES.map(type=>[type,ATLAS_CATALOG[type].fields.map(field=>({
    key:field.key,label:field.label,valueType:field.valueType,timeSensitive:field.timeSensitive,
    unit:inferUnit(field.key,field.valueType),
    get:(raw:ModuleData)=>getValue(type,field,asData(raw)),
    ...(field.writable?{set:(raw:ModuleData,value:FieldValue)=>setValue(field,asData(raw),value)}:{}),
  } satisfies FieldDescriptor))]),
)

function runAtlasCommand(_type:AtlasType,key:string,data:AtlasWidgetData):AtlasWidgetData {
  const now=Date.now()
  if(key==='start'||key==='start_fast')return {...data,enabled:true,lastActionAt:now}
  if(key==='stop'||key==='end_fast')return {...data,enabled:false,lastActionAt:now}
  if(key==='reset_day')return {...data,primary:0,actionCount:0,lastActionAt:now}
  if(key==='add_glass')return {...data,primary:data.primary+250,actionCount:data.actionCount+1,lastActionAt:now,history:[...data.history,{t:now,v:data.primary+250}].slice(-120)}
  if(key.startsWith('add_')||key.startsWith('log_')||key==='deposit'||key==='lend_item'||key==='claim_dish'||key==='give_kudos'||key==='give_star'){
    const nextValue=key==='give_star'?data.primary+1:data.primary
    return {...data,primary:nextValue,actionCount:data.actionCount+1,lastActionAt:now,items:[...data.items,{id:crypto.randomUUID(),label:data.text.trim()||`Entry ${data.items.length+1}`,value:data.secondary||1,done:false,date:new Date().toISOString().slice(0,10),status:'active',note:''}],history:[...data.history,{t:now,v:nextValue}].slice(-120)}
  }
  if(key.includes('mark_')||key==='water'||key==='pack_item'||key==='stamp'||key==='complete_node'||key==='record_result'||key==='redeem'||key==='deliver'){
    const index=data.items.findIndex(item=>!item.done)
    return {...data,primary:data.primary+1,actionCount:data.actionCount+1,lastActionAt:now,items:data.items.map((item,i)=>i===index?{...item,done:true,status:'done'}:item),history:[...data.history,{t:now,v:data.primary+1}].slice(-120)}
  }
  if(key.includes('advance')||key==='draw_next'||key==='new_round'||key==='flush_digest'||key==='refresh_sun')return {...data,actionCount:data.actionCount+1,primary:data.primary+1,lastActionAt:now}
  if(key==='spend')return {...data,primary:Math.max(0,data.primary-1),lastActionAt:now}
  return {...data,actionCount:data.actionCount+1,lastActionAt:now}
}

export const ATLAS_COMMANDS:Partial<Record<ModuleType,CommandDescriptor[]>>=Object.fromEntries(
  ATLAS_TYPES.map(type=>[type,ATLAS_CATALOG[type].commands.map(key=>({key:key as FieldCommand,label:key.replaceAll('_',' ').replace(/^./,letter=>letter.toUpperCase()),run:(raw:ModuleData)=>runAtlasCommand(type,key,asData(raw))}))]),
)
