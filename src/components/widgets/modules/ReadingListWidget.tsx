import { Plus, X } from 'lucide-react'
import type { ReadingItem, ReadingListData, ReadingStatus } from '../../../types/spatial'
import { useFieldAnchor } from '../../../hooks/useFieldAnchor'

interface ReadingListWidgetProps {
  data: ReadingListData
  onChange: (data: ReadingListData) => void
}

const NEXT_STATUS: Record<ReadingStatus, ReadingStatus> = {
  queued: 'reading',
  reading: 'done',
  done: 'queued',
}

const SPINE_COLORS=['#a3e635','#38bdf8','#f472b6','#f59e0b','#a78bfa','#34d399','#fb7185','#60a5fa']
const hash=(text:string)=>[...text].reduce((sum,char)=>sum+char.charCodeAt(0),0)

/** Books & articles with a tap-to-cycle status chip. */
export function ReadingListWidget({ data, onChange }: ReadingListWidgetProps) {
  const doneCountRef = useFieldAnchor('done_count')

  const setItem = (id: string, patch: Partial<ReadingItem>) =>
    onChange({ items: data.items.map((item) => (item.id === id ? { ...item, ...patch } : item)) })

  const removeItem = (id: string) =>
    onChange({ items: data.items.filter((item) => item.id !== id) })

  const addItem = () =>
    onChange({
      items: [...data.items, { id: crypto.randomUUID(), title: '', status: 'queued' }],
    })

  const doneCount = data.items.filter((i) => i.status === 'done').length

  return (
    <div className="flex h-full flex-col">
      <div className="relative flex min-h-28 flex-1 items-end gap-1 overflow-x-auto px-1 pb-3">
        <span aria-hidden className="absolute inset-x-0 bottom-2 h-px bg-[var(--gp-hairline)] shadow-[0_4px_8px_color-mix(in_oklab,var(--gp-widget-accent),transparent_88%)]"/>
        {data.items.filter(item=>item.status!=='done').map(item=>{const color=SPINE_COLORS[hash(item.title)%SPINE_COLORS.length]!;return <div key={item.id} className="group/spine relative shrink-0">
          <button type="button" aria-label={`${item.title||'Untitled'} — ${item.status}`} onClick={()=>setItem(item.id,{status:NEXT_STATUS[item.status]})} className={`relative h-[72px] rounded-t-[4px] rounded-b-sm border gp-hairline bg-[linear-gradient(170deg,rgba(255,255,255,.07),transparent_30%),oklch(20%_.004_250/.9)] transition-[transform,box-shadow] hover:-translate-y-0.5 ${item.status==='reading'?'-translate-y-1.5 scale-[1.04] shadow-[0_0_12px_color-mix(in_oklab,var(--gp-widget-accent),transparent_70%)]':''}`} style={{width:18+hash(item.title)%9}}>
            <span className="absolute inset-y-1 left-[3px] w-0.5 rounded" style={{background:color,opacity:.6}}/><span className=" text-[9px] text-neutral-400 [writing-mode:vertical-rl]">{item.title||'Untitled'}</span>
          </button><button type="button" aria-label="Remove item" onClick={()=>removeItem(item.id)} className="absolute -right-1 -top-1 hidden rounded-full bg-neutral-950 p-0.5 text-neutral-600 group-hover/spine:block"><X size={8}/></button>
        </div>})}
        <div className="ml-auto flex min-w-12 flex-col-reverse gap-0.5">{data.items.filter(item=>item.status==='done').map(item=><button key={item.id} type="button" aria-label={`${item.title||'Untitled'} — done`} onClick={()=>setItem(item.id,{status:'queued'})} className="h-1.5 w-12 rounded-sm border-t gp-hairline bg-neutral-700/70" title={item.title}/>)}</div>
      </div>

      <div ref={doneCountRef} className="mt-auto flex h-8 items-center justify-between border-t gp-hairline">
        <button
          type="button"
          onClick={addItem}
          className="flex items-center gap-1.5 text-[11px] text-neutral-600 transition-colors hover:text-neutral-400"
        >
          <Plus size={11} aria-hidden />
          Add item
        </button>
        {data.items.length > 0 && (
          <span className=" text-[10px] tabular-nums text-neutral-600">
            {doneCount}/{data.items.length} read
          </span>
        )}
      </div>
    </div>
  )
}
