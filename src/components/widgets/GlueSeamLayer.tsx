import { memo, useMemo, type CSSProperties } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useWidgetStore } from '../../store/useWidgetStore'
import { useWidgetRestStore } from '../../store/useWidgetRestStore'
import type { Widget } from '../../types/spatial'
import {
  GLUE_RANGE,
  glueBoxRect,
  glueSeamBetween,
  glueSeamsForCluster,
  type GlueSeam,
} from '../../utils/glueGeometry'
import { widgetAccent } from '../../utils/widgetSkins'
import { widgetDefinition } from '../../widgets/registry'

/** How far a weld bleeds under each card's edge, so the gradient meets the
 * glass with no hairline of canvas showing through. */
const SEAM_BLEED = 6

function accentOf(widget: Widget): string {
  return widgetAccent(widget, widgetDefinition(widget.type))
}

/** One weld: the gap between two glued widgets, filled with a smooth gradient
 * blending their two accent colours. A straight bar for facing edges, a small
 * square patch for diagonal neighbours (the elbow of an L, the heart of a
 * 2×2) — together the welds trace the shape of the merge. */
const GlueSeamPatch = memo(function GlueSeamPatch({
  seam,
  a,
  b,
  fading,
  preview,
}: {
  seam: GlueSeam
  a: Widget
  b: Widget
  fading: boolean
  preview: boolean
}) {
  const accentA = accentOf(a)
  const accentB = accentOf(b)
  // The gradient always runs from the earlier widget (left/top) to the later
  // one, whatever order the pair was welded in.
  const [fromAccent, toAccent] = seam.aFirst ? [accentA, accentB] : [accentB, accentA]

  let style: CSSProperties
  if (seam.axis === 'x') {
    style = {
      left: seam.rect.x - SEAM_BLEED,
      top: seam.rect.y,
      width: seam.rect.width + SEAM_BLEED * 2,
      height: seam.rect.height,
      background: `linear-gradient(to right, ${fromAccent}, ${toAccent})`,
      // Soften the bar's open ends so the weld reads as a smooth meniscus,
      // not a hard-edged block floating between the cards.
      maskImage: 'linear-gradient(to bottom, transparent, black 18%, black 82%, transparent)',
      WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 18%, black 82%, transparent)',
    }
  } else if (seam.axis === 'y') {
    style = {
      left: seam.rect.x,
      top: seam.rect.y - SEAM_BLEED,
      width: seam.rect.width,
      height: seam.rect.height + SEAM_BLEED * 2,
      background: `linear-gradient(to bottom, ${fromAccent}, ${toAccent})`,
      maskImage: 'linear-gradient(to right, transparent, black 18%, black 82%, transparent)',
      WebkitMaskImage: 'linear-gradient(to right, transparent, black 18%, black 82%, transparent)',
    }
  } else {
    // Corner patch: the tiny square where two diagonal neighbours meet. The
    // gradient runs corner to corner, and the patch bleeds slightly under
    // both cards so it fuses with the neighbouring bar welds.
    const aBox = glueBoxRect(a)
    const bBox = glueBoxRect(b)
    const downRight =
      (aBox.x <= bBox.x && aBox.y <= bBox.y) || (bBox.x <= aBox.x && bBox.y <= aBox.y)
    style = {
      left: seam.rect.x - SEAM_BLEED,
      top: seam.rect.y - SEAM_BLEED,
      width: seam.rect.width + SEAM_BLEED * 2,
      height: seam.rect.height + SEAM_BLEED * 2,
      background: `linear-gradient(${downRight ? '135deg' : '45deg'}, ${fromAccent}, ${toAccent})`,
    }
  }

  return (
    <div
      aria-hidden
      className="gp-glue-seam absolute"
      data-glue-preview={preview || undefined}
      data-glue-fading={fading || undefined}
      style={style}
    />
  )
})

/**
 * World-space layer painting the gradient welds between glued widgets —
 * beneath the cards, so each weld shows only in the 0.3-cell seam (plus a
 * hidden bleed under the glass). While an option-drag hovers within glue
 * range, the weld the drop would commit is previewed at the exact snap
 * position; while it pulls a member free, that member's welds fade.
 */
export function GlueSeamLayer() {
  const { glues, widgets, activeCanvasId, glueIntent, unglueIntentWidgetId } = useWidgetStore(
    useShallow((state) => ({
      glues: state.glues,
      widgets: state.widgets,
      activeCanvasId: state.activeCanvasId,
      glueIntent: state.glueIntent,
      unglueIntentWidgetId: state.unglueIntentWidgetId,
    })),
  )

  const expandedWidgetId = useWidgetRestStore((state) => state.expandedWidgetId)

  const seams = useMemo(() => {
    const result: Array<{ seam: GlueSeam; a: Widget; b: Widget }> = []
    for (const glue of Object.values(glues)) {
      const anchor = widgets[glue.widgetIds[0] ?? '']
      // Glue never spans canvases — checking one member suffices.
      if (!anchor || anchor.canvasId !== activeCanvasId) continue
      // While one member is ephemerally expanded it floats over its neighbours;
      // the welds are measured at the resting tiles, so they would poke out
      // from under the big card at stale spots. Hide the cluster's welds until
      // it collapses back to its tiles.
      if (expandedWidgetId && glue.widgetIds.includes(expandedWidgetId)) continue
      // A member being pulled free widens its welds out to one cell so they can
      // visibly fade instead of blinking out the instant the gap passes the
      // 0.75-cell seam ceiling.
      const maxGap =
        unglueIntentWidgetId && glue.widgetIds.includes(unglueIntentWidgetId)
          ? GLUE_RANGE
          : undefined
      for (const seam of glueSeamsForCluster(glue.widgetIds, widgets, maxGap)) {
        result.push({ seam, a: widgets[seam.aId]!, b: widgets[seam.bId]! })
      }
    }
    return result
  }, [activeCanvasId, glues, widgets, unglueIntentWidgetId, expandedWidgetId])

  // The weld an option-drag is promising: dragged widget AT ITS SNAP SPOT
  // against the live target, so the preview shows the exact bond of the drop.
  const previewSeam = useMemo(() => {
    if (!glueIntent) return null
    const dragged = widgets[glueIntent.draggedId]
    const target = widgets[glueIntent.targetId]
    if (!dragged || !target) return null
    const snapped: Widget = { ...dragged, position: glueIntent.position }
    const seam = glueSeamBetween(
      snapped.id,
      glueBoxRect(snapped),
      target.id,
      glueBoxRect(target),
    )
    return seam ? { seam, a: snapped, b: target } : null
  }, [glueIntent, widgets])

  if (seams.length === 0 && !previewSeam) return null

  return (
    <div className="absolute left-0 top-0" aria-hidden>
      {seams.map(({ seam, a, b }) => (
        <GlueSeamPatch
          key={`${seam.aId}:${seam.bId}:${seam.axis}`}
          seam={seam}
          a={a}
          b={b}
          preview={false}
          fading={unglueIntentWidgetId === seam.aId || unglueIntentWidgetId === seam.bId}
        />
      ))}
      {previewSeam && (
        <GlueSeamPatch
          key="glue-preview"
          seam={previewSeam.seam}
          a={previewSeam.a}
          b={previewSeam.b}
          preview
          fading={false}
        />
      )}
    </div>
  )
}
