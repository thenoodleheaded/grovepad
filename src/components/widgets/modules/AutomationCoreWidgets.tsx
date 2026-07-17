import { AlertTriangle, Check, CirclePlay, LoaderCircle, Plus, Trash2, X } from 'lucide-react'
import type { AutomationCoreData, ModuleData } from '../../../types/spatial'
import { AUTOMATION_CORE_CATALOG, type AutomationCoreType } from '../../../widgets/automationCoreCatalog'
import { commandsFor } from '../../../widgets/fields'
import { cancelAutomationWidget, executeAutomationWidget } from '../../../engine/automationExecutor'
import { widgetDefinition } from '../../../widgets/registry'

const inputClass='gp-input w-full px-3 py-2 outline-none'

export function AutomationCoreWidget({widgetId,type,data,onChange}:{widgetId:string;type:AutomationCoreType;data:AutomationCoreData;onChange:(data:ModuleData)=>void}){
  const spec=AUTOMATION_CORE_CATALOG[type]
  const unavailableReason=widgetDefinition(type).unavailableReason
  const update=(patch:Partial<AutomationCoreData>)=>onChange({...data,...patch})
  const pure=(key:string)=>{const command=commandsFor(type).find(item=>item.key===key);if(command)onChange(command.run(data))}
  // Execution lives in the engine-level executor so trigger wires can run
  // this widget offscreen; the button is just another way to call it.
  const execute=()=>{void executeAutomationWidget(widgetId)}

  const showConfig=['local_function','http_request','webhook_sender','widget_creator','branch_builder','relation_builder','focus_action','test_data_generator'].includes(type)
  if(unavailableReason)return <div role="status" className="rounded-xl border border-amber-400/30 bg-amber-300/5 p-4 text-sm leading-5 text-amber-100"><strong className="block text-amber-300">Unavailable in this beta</strong><span>{unavailableReason}</span></div>
  return <div className="space-y-3">
    <div data-island="status" data-island-size="fixed" className="gp-island relative overflow-hidden p-3">
      <div className="absolute inset-y-0 left-0 w-1" style={{background:spec.accent}}/>
      <div className="flex items-center justify-between gap-3"><div className="min-w-0"><div className="truncate text-[9px] font-semibold uppercase tracking-[.14em] text-neutral-500">{spec.kind.replaceAll('_',' ')}</div><div className="truncate text-xs font-semibold text-neutral-200">{data.running?'Running':data.lastError?'Needs attention':data.count?`${data.count} runs`:'Ready'}</div></div><span className={`h-2.5 w-2.5 rounded-full ${data.running?'animate-pulse bg-sky-400':data.lastError?'bg-red-400':data.enabled?'bg-emerald-400':'bg-neutral-600'}`}/></div>
    </div>
    <label className="gp-subdivision block rounded-xl border gp-hairline p-3 text-[8px] font-semibold uppercase tracking-widest text-neutral-600">Input<textarea value={data.input} onChange={event=>update({input:event.target.value})} rows={2} placeholder={spec.kind==='canvas'?'Widget IDs, titles, or records…':'Value or payload…'} className={`${inputClass} mt-1 resize-none normal-case`}/></label>
    {showConfig&&<label className="gp-subdivision block rounded-xl border gp-hairline p-3 text-[8px] font-semibold uppercase tracking-widest text-neutral-600">{type==='script_block'||type==='local_function'?'Function body':'Configuration JSON'}<textarea value={data.config} onChange={event=>update({config:event.target.value})} rows={3} className={`${inputClass} mt-1 resize-none font-mono normal-case`}/></label>}
    {(data.output||data.lastError)&&<div className={`gp-subdivision rounded-xl border p-3 ${data.lastError?'border-red-500/25 bg-red-500/5':'gp-hairline bg-white/[.025]'}`}><div className="flex items-center gap-1.5 text-[8px] uppercase tracking-widest text-neutral-600">{data.lastError?<AlertTriangle size={9}/>:<Check size={9}/>} {data.lastError?'Error':'Output'}</div><div className={`mt-1 max-h-16 overflow-auto whitespace-pre-wrap break-all font-mono text-[9px] ${data.lastError?'text-red-300':'text-neutral-300'}`}>{data.lastError||data.output}</div></div>}
    <div className="gp-subdivision flex gap-1.5 rounded-xl border gp-hairline p-2">
      <button type="button" disabled={data.running||!data.enabled} onClick={execute} className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 text-[10px] font-semibold disabled:opacity-40" style={{borderColor:`${spec.accent}55`,background:`${spec.accent}16`,color:spec.accent}}>{data.running?<LoaderCircle size={11} className="animate-spin"/>:<CirclePlay size={11}/>} Execute</button>
      {data.running&&<button type="button" onClick={()=>cancelAutomationWidget(widgetId)} aria-label="Cancel running automation" className="h-9 rounded-xl border border-red-500/30 px-3 text-red-300"><X size={11} aria-hidden/></button>}
      {(type==='queue'||type==='stack_store')&&<button type="button" onClick={()=>pure('dequeue')} aria-label="Release next" className="h-9 rounded-xl border gp-hairline px-3 text-neutral-400"><Trash2 size={11}/></button>}
      {type==='approval_gate'&&<><button type="button" onClick={()=>pure('approve')} aria-label="Approve" className="h-9 rounded-xl border border-emerald-500/25 px-3 text-emerald-400"><Check size={11}/></button><button type="button" onClick={()=>pure('reject')} aria-label="Reject" className="h-9 rounded-xl border border-red-500/25 px-3 text-red-400"><X size={11}/></button></>}
      {(type==='mutex'||type==='workflow_lock')&&data.running&&<button type="button" onClick={()=>pure('release')} aria-label="Release lock" className="h-9 rounded-xl border gp-hairline px-3 text-neutral-400"><X size={11}/></button>}
      {data.items.length>0&&<span className="flex h-9 min-w-9 items-center justify-center rounded-xl border gp-hairline text-[10px] text-neutral-400"><Plus size={9}/>{data.items.length}</span>}
    </div>
  </div>
}
