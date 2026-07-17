import { useWidgetStore } from '../store/useWidgetStore'
import { localDayKey } from './localDate'
import { boundsForWidgets } from './widgetBounds'

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath()
  context.roundRect(x, y, width, height, radius)
}

export async function exportCanvasImage(copyToClipboard = true): Promise<void> {
  const state = useWidgetStore.getState()
  const widgets = Object.values(state.widgets).filter((widget) => widget.canvasId === state.activeCanvasId)
  const bounds = boundsForWidgets(widgets)
  if (!bounds) return
  const padding = 100
  const scale = Math.min(2, 2400 / Math.max(bounds.width + padding * 2, bounds.height + padding * 2))
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil((bounds.width + padding * 2) * scale)
  canvas.height = Math.ceil((bounds.height + padding * 2) * scale)
  const context = canvas.getContext('2d')!
  context.scale(scale, scale)
  context.fillStyle = '#070b09'
  context.fillRect(0, 0, canvas.width / scale, canvas.height / scale)
  context.translate(padding - bounds.x, padding - bounds.y)
  context.strokeStyle = 'rgba(163,230,53,.08)'
  context.lineWidth = 1
  for (let x = Math.floor(bounds.x / 40) * 40; x < bounds.x + bounds.width; x += 40) {
    context.beginPath(); context.moveTo(x, bounds.y); context.lineTo(x, bounds.y + bounds.height); context.stroke()
  }
  for (let y = Math.floor(bounds.y / 40) * 40; y < bounds.y + bounds.height; y += 40) {
    context.beginPath(); context.moveTo(bounds.x, y); context.lineTo(bounds.x + bounds.width, y); context.stroke()
  }
  context.lineWidth = 2
  for (const relation of Object.values(state.relations)) {
    const from = state.widgets[relation.fromId]
    const to = state.widgets[relation.toId]
    if (!from || !to || from.canvasId !== state.activeCanvasId || to.canvasId !== state.activeCanvasId) continue
    const dependency = relation.type === 'blocker'
    context.strokeStyle = dependency
      ? relation.isResolved ? 'rgba(100,116,139,.55)' : 'rgba(245,158,11,.78)'
      : 'rgba(167,139,250,.55)'
    context.setLineDash(dependency && relation.isResolved ? [5, 7] : [])
    context.beginPath()
    if (dependency) {
      const startX = from.position.x + from.size.width + 8
      const startY = from.position.y + from.size.height / 2
      const endX = to.position.x - 8
      const endY = to.position.y + to.size.height / 2
      const reach = Math.max(36, Math.abs(endX - startX) * 0.4)
      context.moveTo(startX, startY)
      context.bezierCurveTo(startX + reach, startY, endX - reach, endY, endX, endY)
    } else {
      context.moveTo(from.position.x + from.size.width / 2, from.position.y + from.size.height)
      context.bezierCurveTo(from.position.x + from.size.width / 2, (from.position.y + to.position.y) / 2, to.position.x + to.size.width / 2, (from.position.y + to.position.y) / 2, to.position.x + to.size.width / 2, to.position.y)
    }
    context.stroke()
  }
  context.setLineDash([])
  for (const widget of widgets) {
    context.fillStyle = 'rgba(23,23,23,.96)'
    context.strokeStyle = widget.metadata.accent ?? '#94a3b8'
    context.lineWidth = 2
    roundedRect(context, widget.position.x, widget.position.y, widget.size.width, widget.size.height, 22)
    context.fill(); context.stroke()
    context.fillStyle = '#f5f5f5'
    context.font = '600 14px system-ui, sans-serif'
    context.fillText(widget.title, widget.position.x + 18, widget.position.y + 30, widget.size.width - 36)
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) return
  if (copyToClipboard && navigator.clipboard && 'ClipboardItem' in window) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      return
    } catch { /* permission denied: fall back to a regular download */ }
  }
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `grovepad-canvas-${localDayKey()}.png`
  link.click()
  URL.revokeObjectURL(url)
}
