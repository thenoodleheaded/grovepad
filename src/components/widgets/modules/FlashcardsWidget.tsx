import { useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react'
import type { FlashcardsData } from '../../../types/spatial'
import { useFieldAnchor } from '../../../hooks/useFieldAnchor'

interface FlashcardsWidgetProps {
  data: FlashcardsData
  onChange: (data: FlashcardsData) => void
}

/** Question/answer study deck — click the card to flip, arrows to browse. */
export function FlashcardsWidget({ data, onChange }: FlashcardsWidgetProps) {
  const [flipped, setFlipped] = useState(false)
  const [dragX,setDragX]=useState(0)
  const [dragStart,setDragStart]=useState<number|null>(null)
  const cardCountRef = useFieldAnchor<HTMLSpanElement>('card_count')
  const count = data.cards.length
  const index = Math.min(Math.max(0, data.current), Math.max(0, count - 1))
  const card = data.cards[index]

  const go = (delta: number) => {
    if (count === 0) return
    setFlipped(false)
    onChange({ ...data, current: (index + delta + count) % count })
  }

  const setSide = (side: 'front' | 'back', text: string) => {
    if (!card) return
    onChange({
      ...data,
      cards: data.cards.map((c, i) => (i === index ? { ...c, [side]: text } : c)),
    })
  }

  const addCard = () => {
    setFlipped(false)
    onChange({
      cards: [...data.cards, { id: crypto.randomUUID(), front: '', back: '' }],
      current: count,
    })
  }

  const removeCard = () => {
    if (!card) return
    setFlipped(false)
    const cards = data.cards.filter((_, i) => i !== index)
    onChange({ cards, current: Math.max(0, Math.min(index, cards.length - 1)) })
  }

  if (!card) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <p className="text-[12px] text-neutral-600">No cards yet</p>
        <button
          type="button"
          onClick={addCard}
          className="flex items-center gap-1.5 rounded-lg border border-emerald-400/25 bg-emerald-400/[0.07] px-3 py-1.5 text-[11px] font-medium text-emerald-300 transition-colors hover:bg-emerald-400/15"
        >
          <Plus size={11} aria-hidden />
          Add the first card
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-2">
      {/* The card — a true 3D flip. Click empty space to turn it over; each
          face carries its own textarea. The rotation is a one-shot
          compositor transform that only fires on flip. */}
      <div
        role="button"
        tabIndex={0}
        aria-label={flipped ? 'Showing answer — click to see question' : 'Showing question — click to see answer'}
        onClick={(e) => {
          if ((e.target as HTMLElement).tagName !== 'TEXTAREA'&&Math.abs(dragX)<4) setFlipped(!flipped)
        }}
        onPointerDown={e=>{if((e.target as HTMLElement).tagName==='TEXTAREA')return;e.currentTarget.setPointerCapture(e.pointerId);setDragStart(e.clientX)}}
        onPointerMove={e=>{if(dragStart!==null)setDragX(e.clientX-dragStart)}}
        onPointerUp={()=>{if(Math.abs(dragX)>70)go(dragX>0?1:-1);setDragStart(null);setDragX(0)}}
        onPointerCancel={()=>{setDragStart(null);setDragX(0)}}
        onKeyDown={(e) => {
          if (e.key === ' ' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
            e.preventDefault()
            setFlipped(!flipped)
          }
        }}
        className="relative min-h-0 flex-1 cursor-grab touch-none active:cursor-grabbing"
        style={{ perspective: '900px', transform:`translateX(${dragX}px) rotate(${dragX/35}deg)`, opacity:Math.max(.35,1-Math.abs(dragX)/220), transition:dragStart===null?'transform 180ms ease, opacity 180ms ease':'none' }}
      >
        <div
          className="absolute inset-0"
          style={{
            transformStyle: 'preserve-3d',
            transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
            transition: 'transform 420ms cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {/* Front — question */}
          <div
            className="absolute inset-0 rounded-xl border border-neutral-700 bg-neutral-800/40 p-3"
            style={{ backfaceVisibility: 'hidden' }}
            aria-hidden={flipped}
          >
            <span className="pointer-events-none absolute right-2.5 top-2 text-[9px] font-semibold uppercase tracking-widest text-neutral-600">
              Question
            </span>
            <textarea
              value={card.front}
              placeholder="The question…"
              aria-label="Question"
              tabIndex={flipped ? -1 : 0}
              onChange={(e) => setSide('front', e.target.value)}
              className="h-full w-full resize-none bg-transparent pt-3 text-center text-[13px] leading-relaxed text-neutral-200 outline-none placeholder:text-neutral-700"
            />
          </div>
          {/* Back — answer */}
          <div
            className="absolute inset-0 rounded-xl border border-emerald-400/30 bg-emerald-400/[0.06] p-3"
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
            aria-hidden={!flipped}
          >
            <span className="pointer-events-none absolute right-2.5 top-2 text-[9px] font-semibold uppercase tracking-widest text-emerald-400/70">
              Answer
            </span>
            <textarea
              value={card.back}
              placeholder="The answer…"
              aria-label="Answer"
              tabIndex={flipped ? 0 : -1}
              onChange={(e) => setSide('back', e.target.value)}
              className="h-full w-full resize-none bg-transparent pt-3 text-center text-[13px] leading-relaxed text-neutral-200 outline-none placeholder:text-neutral-700"
            />
          </div>
        </div>
      </div>

      <div className="flex h-7 shrink-0 items-center justify-between">
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            aria-label="Previous card"
            onClick={() => go(-1)}
            className="flex h-6 w-6 items-center justify-center rounded text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
          >
            <ChevronLeft size={13} aria-hidden />
          </button>
          <span
            ref={cardCountRef}
            className="min-w-9 text-center font-mono text-[10px] tabular-nums text-neutral-500"
          >
            {index + 1}/{count}
          </span>
          <button
            type="button"
            aria-label="Next card"
            onClick={() => go(1)}
            className="flex h-6 w-6 items-center justify-center rounded text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
          >
            <ChevronRight size={13} aria-hidden />
          </button>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            aria-label="Delete card"
            onClick={removeCard}
            className="flex h-6 w-6 items-center justify-center rounded text-neutral-600 transition-colors hover:bg-red-500/10 hover:text-red-400"
          >
            <Trash2 size={11} aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Add card"
            onClick={addCard}
            className="flex h-6 w-6 items-center justify-center rounded text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
          >
            <Plus size={13} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  )
}
