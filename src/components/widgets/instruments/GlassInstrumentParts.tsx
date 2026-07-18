import type { ButtonHTMLAttributes, ReactNode } from 'react'

const DIGITS: Record<string, readonly string[]> = {
  '0':['a','b','c','d','e','f'],'1':['b','c'],'2':['a','b','g','e','d'],'3':['a','b','g','c','d'],
  '4':['f','g','b','c'],'5':['a','f','g','c','d'],'6':['a','f','g','e','c','d'],'7':['a','b','c'],
  '8':['a','b','c','d','e','f','g'],'9':['a','b','c','d','f','g'],'-':['g'],
}
const PATHS: Record<string,string>={a:'M5 3h14l-2 3H7z',b:'M20 5l2 2v12l-3-2V8z',c:'M20 21l2 2v12l-3 2V24z',d:'M5 39h14l-2-3H7z',e:'M2 21l3 3v13l-3-2z',f:'M2 7l3-2v12l-3 2z',g:'M5 20l2-2h10l2 2-2 2H7z'}

export function GlassWell({children,className=''}:{children:ReactNode;className?:string}){return <div className={`gp-display-well ${className}`}>{children}</div>}
export function GlassKey({children,className='',...props}:ButtonHTMLAttributes<HTMLButtonElement>){return <button type="button" {...props} className={`gp-glass-key ${className}`}>{children}</button>}

export function SevenSegment({value,urgent=false}:{value:string;urgent?:boolean}){
  return <span className="flex items-center gap-1" aria-label={value}>{[...value].map((char,index)=>char===':'?<span key={index} className="gp-led-colon">:</span>:<svg key={index} viewBox="0 0 24 42" className={`h-10 w-6 ${urgent?'text-rose-400':'text-[var(--gp-widget-accent)]'}`} aria-hidden>{Object.entries(PATHS).map(([id,path])=>{const lit=(DIGITS[char]??[]).includes(id);return <g key={id}><path d={path} fill="currentColor" opacity={lit ? .18 : 0}/>{lit&&<path d={path} fill="currentColor" opacity=".96"/>}</g>})}</svg>)}</span>
}

export function SplitWell({value,label,tone='accent'}:{value:string|number;label:string;tone?:'accent'|'amber'|'rose'}){
  const color=tone==='rose'?'text-rose-400':tone==='amber'?'text-amber-300':'text-[var(--gp-widget-accent)]'
  return <div className="min-w-0 text-center"><GlassWell className="relative px-2 py-2"><span className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-white/[.06]"/><span className={` text-2xl font-semibold tabular-nums ${color}`}>{String(value).padStart(2,'0')}</span></GlassWell><span className="mt-1 block  text-[8px] tracking-[.16em] text-neutral-600">{label}</span></div>
}
