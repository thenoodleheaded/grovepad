import { useMemo } from 'react'
import { ArrowUpRight, FolderOpen, Network, Sparkles } from 'lucide-react'
import type { CSSProperties } from 'react'
import { useWidgetStore } from '../../store/useWidgetStore'
import type { CanvasNodeData, Widget } from '../../types/spatial'
import { canvasPreviewItems } from './modules/canvasNodeSkinModel'
import type { RestingFaceModel } from '../../utils/restingFace'

// ---------------------------------------------------------------------------
// The canvas door's resting faces — the live counterpart to ClockFace.
//
// The model (restingFaces/visual.ts) is pure and fixed-size; everything the
// tile SHOWS — the canvas's name, its miniature — comes from the store, read
// here with exactly the subscriptions the open CanvasNodeWidget makes. Each
// skin mirrors its open card at tile scale: the portal keeps its glyph-and-
// arrow strip, the cover its orbit marks and subtitle, the thumbnail its
// miniature board. All of it is bounded: at most PREVIEW_LIMIT rectangles and
// a couple of text spans — never an input, a button, or a per-frame effect.
//
// The name is the only thing any of these tiles says. A canvas door cannot
// describe what is behind it in words worth the pixels, so it does not try.
// ---------------------------------------------------------------------------

const PREVIEW_LIMIT = 24

export function CanvasNodeRestFace({ widget, model, accent }: {
  widget: Widget
  model: Extract<RestingFaceModel, { kind: 'canvas' }>
  accent: string
}) {
  const canvasId = (widget.data as CanvasNodeData).canvasId
  const canvases = useWidgetStore((state) => state.canvases)
  const widgets = useWidgetStore((state) => state.widgets)
  const canvasName = canvases[canvasId]?.name ?? 'Canvas'
  const preview = useMemo(
    () => model.skin === 'live_thumbnail'
      ? canvasPreviewItems(canvasId, widgets, PREVIEW_LIMIT)
      : [],
    [canvasId, model.skin, widgets],
  )

  if (model.skin === 'cover') {
    return (
      <div className="relative flex h-full w-full min-w-0 flex-col overflow-hidden">
        {/* The cover's orbit, folded to three still marks in the corner. */}
        <span aria-hidden className="pointer-events-none absolute -right-1 -top-1 flex gap-[3px]">
          {[0.5, 0.28, 0.14].map((opacity, index) => (
            <span
              key={index}
              className="h-[5px] w-[5px] rounded-full"
              style={{ background: accent, opacity }}
            />
          ))}
        </span>
        <strong className="truncate text-[13px] font-semibold leading-[16px] text-neutral-50">
          {canvasName}
        </strong>
        {model.subtitle && (
          <span className="mt-[2px] line-clamp-2 min-w-0 text-[9.5px] leading-[13px] text-neutral-400">
            {model.subtitle}
          </span>
        )}
        <ArrowUpRight size={11} aria-hidden className="mt-auto ml-auto shrink-0" style={{ color: `var(--gp-accent-ink, ${accent})` }} />
      </div>
    )
  }

  if (model.skin === 'live_thumbnail') {
    return (
      <div className="flex h-full w-full min-w-0 flex-col gap-[5px]">
        <div className="flex h-[14px] shrink-0 items-center gap-1.5">
          <Network size={10} aria-hidden style={{ color: `var(--gp-accent-ink, ${accent})` }} />
          <span className="min-w-0 flex-1 truncate text-[8px] font-bold uppercase tracking-[0.11em]" style={{ color: `var(--gp-accent-ink, ${accent})` }}>
            {canvasName}
          </span>
          <span
            aria-hidden
            className="h-[4px] w-[4px] shrink-0 rounded-full"
            style={{ background: accent, boxShadow: `0 0 5px ${accent}` }}
          />
        </div>
        {/* The miniature board: each far-canvas card as a rectangle in the
            same normalized 0–100 box the open thumbnail draws. */}
        <div
          className="relative min-h-0 flex-1 overflow-hidden rounded-[8px] bg-black/25"
          style={{ boxShadow: 'inset 0 0 0 1px rgb(255 255 255 / 0.06)' }}
        >
          {preview.length === 0 ? (
            <span className="absolute inset-0 flex items-center justify-center text-neutral-600">
              <Sparkles size={13} aria-hidden />
            </span>
          ) : preview.map((item) => (
            <span
              key={item.id}
              className="absolute rounded-[2px]"
              style={{
                left: `${item.x}%`,
                top: `${item.y}%`,
                width: `${item.width}%`,
                height: `${item.height}%`,
                background: item.completed ? `${accent}52` : 'rgb(255 255 255 / 0.11)',
                boxShadow: item.completed
                  ? `inset 0 0 0 1px ${accent}66`
                  : 'inset 0 0 0 1px rgb(255 255 255 / 0.14)',
              } as CSSProperties}
            />
          ))}
        </div>
      </div>
    )
  }

  // Portal — the default: the open card's glyph-and-arrow strip at tile scale.
  return (
    <div className="flex h-full w-full min-w-0 items-center gap-2.5">
      <span
        aria-hidden
        className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full"
        style={{ background: `${accent}22`, boxShadow: `inset 0 0 0 1px ${accent}55`, color: `var(--gp-accent-ink, ${accent})` }}
      >
        <FolderOpen size={13} />
      </span>
      <strong className="min-w-0 flex-1 truncate text-[11px] font-semibold leading-[13px] text-neutral-50">
        {canvasName}
      </strong>
      <ArrowUpRight size={13} aria-hidden className="shrink-0" style={{ color: `var(--gp-accent-ink, ${accent})` }} />
    </div>
  )
}
