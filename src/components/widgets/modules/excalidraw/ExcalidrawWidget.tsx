import { useEffect, useRef, useState } from 'react'
import '@excalidraw/excalidraw/index.css'
import { Maximize2, Shapes } from 'lucide-react'
import type { ExcalidrawData } from '../../../../types/spatial'
import { ExcalidrawFullscreen } from './ExcalidrawFullscreen'

interface ExcalidrawWidgetProps {
  data: ExcalidrawData
  widgetId: string
  title: string
  onChange: (data: ExcalidrawData) => void
}

/**
 * The card is a static preview and launcher, not a live editor — Excalidraw's
 * own toolbar assumes a full-page layout, and the app canvas already owns
 * wheel/pointer input at this size. Real drawing happens in the fullscreen
 * editor; the card just shows what's there and opens it.
 */
export function ExcalidrawWidget({ data, widgetId, title, onChange }: ExcalidrawWidgetProps) {
  const [open, setOpen] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)
  const hasContent = data.elements.length > 0

  useEffect(() => {
    const container = previewRef.current
    if (!container) return
    if (!hasContent) {
      container.replaceChildren()
      return
    }
    let cancelled = false
    void import('@excalidraw/excalidraw').then(async ({ exportToSvg }) => {
      const svg = await exportToSvg({
        elements: data.elements,
        appState: { ...data.appState, exportBackground: false } as Record<string, unknown>,
        files: null,
        exportPadding: 12,
      })
      if (cancelled) return
      svg.setAttribute('width', '100%')
      svg.setAttribute('height', '100%')
      svg.style.display = 'block'
      container.replaceChildren(svg)
    })
    return () => { cancelled = true }
  }, [data.elements, data.appState, hasContent])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={hasContent ? `Open ${title} in fullscreen` : `Start drawing in ${title}`}
        className="gp-excalidraw-launcher group relative flex h-full w-full flex-col overflow-hidden text-left"
      >
        <div className="gp-excalidraw-grid" aria-hidden />
        <div ref={previewRef} aria-hidden className="gp-excalidraw-preview h-full w-full [&_svg]:mx-auto" />
        {!hasContent && (
          <div className="gp-excalidraw-empty pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="gp-excalidraw-empty__icon"><Shapes size={20} aria-hidden /></span>
            <strong>Open the infinite canvas</strong>
            <span>Shapes · arrows · text · freehand</span>
          </div>
        )}
        <span className="gp-excalidraw-open pointer-events-none absolute bottom-3 right-3">
          <Maximize2 size={13} aria-hidden />
          {hasContent ? 'Edit canvas' : 'Start drawing'}
        </span>
      </button>
      <ExcalidrawFullscreen
        open={open}
        widgetId={widgetId}
        title={title}
        data={data}
        onChange={onChange}
        onClose={() => setOpen(false)}
      />
    </>
  )
}
