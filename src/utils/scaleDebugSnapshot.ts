import type { Size, Widget } from '../types/spatial'
import { GRID_SIZE, ICONIFIED_SIZE } from '../types/spatial'
import { pillSizeForTitle } from './collapsedWidget'
import { computeDataHeight, computeDataWidth } from '../store/widgetSizing'
import { getLiveWidgetSizing, mergeWidgetSizing } from '../store/liveWidgetSizing'
import type { ScaleDebugSnapshot } from '../store/useScaleDebugStore'
import { DEFAULT_SIZING, widgetDefinition } from '../widgets/registry'
import { domStoreMismatch } from './scaleDebugAnomalies'
import { CARD_INSET, naturalContentHeight } from './widgetContentFloor'

/**
 * The full per-second heartbeat reading for one widget: every input the
 * scaling system reasons with (registry bounds, the live content floor, the
 * data-derived floor) alongside what is actually true of the mounted DOM
 * right now (its screen box, un-zoomed; the content region's overflow).
 * Pure aside from one DOM read of the already-mounted card — no store
 * writes, so calling it on a timer is safe to do for every widget on the
 * canvas every tick.
 */
export function computeScaleDebugSnapshot(widget: Widget, zoom: number, cardEl: HTMLElement | null): ScaleDebugSnapshot {
  const def = widgetDefinition(widget.type)
  const registrySizing = def.sizing ?? {}
  const live = getLiveWidgetSizing(widget.id) ?? null
  const effective = mergeWidgetSizing(registrySizing, live ?? undefined)
  const dataFloor: Size = {
    width: computeDataWidth(widget.type, widget.data),
    height: computeDataHeight(widget.type, widget.data),
  }

  const mounted = cardEl != null && cardEl.querySelector('.gp-widget-proxy') === null
  let domSizePx: Size | null = null
  let domStoreDeltaWorldPx: Size | null = null
  let naturalHeight: number | null = null
  let uiScrollHeight: number | null = null
  let uiClientHeight: number | null = null
  let overflowY: number | null = null

  if (mounted && cardEl) {
    const rect = cardEl.getBoundingClientRect()
    domSizePx = { width: rect.width, height: rect.height }
    domStoreDeltaWorldPx = domStoreMismatch(domSizePx, widget.size, zoom)
    const ui = cardEl.querySelector<HTMLElement>('.gp-widget-ui')
    if (ui) {
      uiScrollHeight = ui.scrollHeight
      uiClientHeight = ui.clientHeight
      overflowY = Math.max(0, ui.scrollHeight - ui.clientHeight)
      naturalHeight = naturalContentHeight(ui)
    }
  }

  const anomalies: string[] = []
  if (!Number.isFinite(widget.size.width) || !Number.isFinite(widget.size.height)) {
    anomalies.push('nan-or-infinite-size')
  } else if (widget.collapsed) {
    const pill = pillSizeForTitle(widget.title)
    if (Math.abs(widget.size.width - pill.width) > 1 || Math.abs(widget.size.height - pill.height) > 1) {
      anomalies.push('collapsed-size-mismatch')
    }
  } else if (widget.iconified) {
    if (widget.size.width !== ICONIFIED_SIZE.width || widget.size.height !== ICONIFIED_SIZE.height) {
      anomalies.push('iconified-size-mismatch')
    }
  } else {
    const minWidth = effective.minWidth ?? DEFAULT_SIZING.minWidth
    const minHeight = effective.minHeight ?? DEFAULT_SIZING.minHeight
    const maxWidth = effective.maxWidth ?? DEFAULT_SIZING.maxWidth
    const maxHeight = effective.autoHeight ? effective.maxHeight ?? Infinity : effective.maxHeight ?? DEFAULT_SIZING.maxHeight
    if (widget.size.width < minWidth - 0.5) anomalies.push('below-min-width')
    if (widget.size.height < minHeight - 0.5) anomalies.push('below-min-height')
    if (widget.size.width > maxWidth + 0.5) anomalies.push('above-max-width')
    if (widget.size.height > maxHeight + 0.5) anomalies.push('above-max-height')
    if (domStoreDeltaWorldPx) anomalies.push('dom-store-mismatch')
    if (!effective.autoHeight && naturalHeight !== null && naturalHeight > 0) {
      const voidPx = widget.size.height - (naturalHeight + CARD_INSET)
      if (voidPx > GRID_SIZE) anomalies.push('content-void')
    }
    if (overflowY !== null && overflowY > 4 && (uiClientHeight ?? 0) > 0) anomalies.push('content-overflow')
  }

  return {
    widgetId: widget.id,
    widgetType: widget.type,
    title: widget.title,
    t: Date.now(),
    size: widget.size,
    collapsed: widget.collapsed === true,
    iconified: widget.iconified === true,
    locked: widget.metadata.locked === true,
    mounted,
    registryDefaultSize: def.defaultSize,
    registrySizing: {
      minWidth: registrySizing.minWidth,
      minHeight: registrySizing.minHeight,
      maxWidth: registrySizing.maxWidth,
      maxHeight: registrySizing.maxHeight,
      autoHeight: registrySizing.autoHeight,
    },
    liveSizing: live ? { minWidth: live.minWidth, minHeight: live.minHeight } : null,
    effectiveSizing: effective,
    dataFloor,
    domSizePx,
    domStoreDeltaWorldPx,
    naturalContentHeight: naturalHeight,
    uiScrollHeight,
    uiClientHeight,
    overflowY,
    anomalies,
  }
}
