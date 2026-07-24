import type { ReactNode } from 'react'

function GlassWell({children,className=''}:{children:ReactNode;className?:string}){return <div className={`gp-display-well ${className}`}>{children}</div>}

export function SplitWell({value,label,tone='accent'}:{value:string|number;label:string;tone?:'accent'|'amber'|'rose'}){
  const color=tone==='rose'?'text-rose-400':tone==='amber'?'text-amber-300':'text-[var(--gp-widget-accent)]'
  return <div className="min-w-0 text-center"><GlassWell className="relative px-2 py-2"><span className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-white/[.06]"/><span className={` text-2xl font-semibold tabular-nums ${color}`}>{String(value).padStart(2,'0')}</span></GlassWell><span className="mt-1 block  text-[8px] tracking-[.16em] text-neutral-600">{label}</span></div>
}
