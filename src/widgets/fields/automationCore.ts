import type { AutomationCoreData, ModuleData, ModuleType } from '../../types/spatial'
import type { FieldCommand } from '../../types/fieldConnections'
import type { CommandDescriptor, FieldDescriptor, FieldValue } from '../fields'
import { AUTOMATION_CORE_TYPES } from '../automationCoreCatalog'

const d=(value:ModuleData)=>value as AutomationCoreData
const text=(value:FieldValue)=>Array.isArray(value)?JSON.stringify(value):String(value)
const number=(value:FieldValue)=>Array.isArray(value)?value.length:typeof value==='number'?value:typeof value==='boolean'?Number(value):Number(value)||0
const bool=(value:FieldValue)=>typeof value==='boolean'?value:number(value)!==0

const commonFields:FieldDescriptor[]=[
  {key:'input',label:'Input',valueType:'text',get:value=>d(value).input,set:(value,next)=>({...d(value),input:text(next)})},
  {key:'output',label:'Output',valueType:'text',get:value=>d(value).output},
  {key:'enabled',label:'Enabled',valueType:'boolean',get:value=>d(value).enabled,set:(value,next)=>({...d(value),enabled:bool(next)})},
  {key:'running',label:'Running',valueType:'boolean',get:value=>d(value).running},
  {key:'count',label:'Count',valueType:'number',get:value=>d(value).count},
  {key:'concurrency',label:'Concurrency',valueType:'number',get:value=>d(value).concurrency,set:(value,next)=>({...d(value),concurrency:Math.max(1,Math.round(number(next)))})},
  {key:'last_error',label:'Last error',valueType:'text',get:value=>d(value).lastError},
]

export const AUTOMATION_CORE_FIELDS:Partial<Record<ModuleType,FieldDescriptor[]>>=Object.fromEntries(AUTOMATION_CORE_TYPES.map(type=>[type,commonFields]))

function run(key:FieldCommand,value:ModuleData):AutomationCoreData{
  const data=d(value),now=Date.now()
  if(key==='clear'||key==='reset')return {...data,output:'',lastError:'',count:0,items:[],running:false}
  if(key==='approve')return {...data,enabled:true,running:false,output:'approved',count:data.count+1,lastRunAt:now}
  if(key==='reject')return {...data,enabled:false,running:false,output:'rejected',count:data.count+1,lastRunAt:now}
  if(key==='acquire')return {...data,running:true,output:'locked',count:data.count+1,lastRunAt:now}
  if(key==='release')return {...data,running:false,output:'released',lastRunAt:now}
  if(key==='enqueue')return {...data,count:data.count+1,lastRunAt:now,items:[...data.items,{id:crypto.randomUUID(),key:String(data.items.length+1),value:data.input,status:'waiting',at:now}]}
  if(key==='dequeue'){const [head,...items]=data.items;return {...data,items,count:Math.max(0,data.count-1),output:head?.value??'',lastRunAt:now}}
  return {...data,running:false,output:data.input,count:data.count+1,lastRunAt:now,lastError:''}
}
const commands:CommandDescriptor[]=['execute','enqueue','dequeue','approve','reject','acquire','release','clear'].map(key=>({key:key as FieldCommand,label:key.replace(/^./,letter=>letter.toUpperCase()),run:value=>run(key as FieldCommand,value)}))
export const AUTOMATION_CORE_COMMANDS:Partial<Record<ModuleType,CommandDescriptor[]>>=Object.fromEntries(AUTOMATION_CORE_TYPES.map(type=>[type,commands]))
