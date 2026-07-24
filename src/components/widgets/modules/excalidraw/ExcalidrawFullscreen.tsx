import { useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Excalidraw, getNonDeletedElements } from '@excalidraw/excalidraw'
import type { AppState, ExcalidrawInitialDataState } from '@excalidraw/excalidraw/types'
import { Shapes, X } from 'lucide-react'
import type { ExcalidrawData } from '../../../../types/spatial'
import { useThemeStore } from '../../../../store/useThemeStore'
import { useOverlayLifecycle } from '../../../../store/useOverlayStore'
import { useFocusTrap } from '../../../../hooks/useFocusTrap'
import { createOwnedTimeout } from '../../../../utils/ownedTimeout'
import { loadExcalidrawFiles, persistNewExcalidrawFiles } from '../../../../utils/excalidrawFiles'
import { pickPersistedAppState } from './excalidrawScene'

interface ExcalidrawFullscreenProps {
  open: boolean
  widgetId: string
  title: string
  data: ExcalidrawData
  onChange: (data: ExcalidrawData) => void
  onClose: () => void
}

/**
 * The real editing surface. Rendered only while `open` so the heavy
 * Excalidraw instance mounts exactly once per session and never sits alive
 * (and never fights the canvas viewport for wheel/pointer input) behind the
 * card preview.
 */
function ExcalidrawEditor({ widgetId, data, onChange }: Omit<ExcalidrawFullscreenProps, 'open' | 'onClose' | 'title'>) {
  const theme = useThemeStore((state) => state.theme)
  const objectUrlsRef = useRef<string[]>([])
  const knownFileRefsRef = useRef(data.files)
  const pendingRef = useRef<{ elements: readonly import('@excalidraw/excalidraw/element/types').ExcalidrawElement[]; appState: AppState } | null>(null)
  const timeoutRef = useRef(createOwnedTimeout())
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const flush = () => {
    const pending = pendingRef.current
    if (!pending) return
    pendingRef.current = null
    onChangeRef.current({
      elements: getNonDeletedElements(pending.elements),
      appState: pickPersistedAppState(pending.appState),
      files: knownFileRefsRef.current,
      updatedAt: new Date().toISOString(),
    })
  }

  useEffect(() => () => {
    timeoutRef.current.dispose()
    flush()
    for (const url of objectUrlsRef.current) URL.revokeObjectURL(url)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const initialData = useMemo(() => async (): Promise<ExcalidrawInitialDataState> => {
    const { files, objectUrls } = await loadExcalidrawFiles(widgetId, data.files)
    objectUrlsRef.current = objectUrls
    return {
      elements: data.elements,
      appState: data.appState as Partial<AppState>,
      files,
      scrollToContent: data.elements.length > 0,
    }
    // Intentionally load only once at mount — this component is the sole
    // editor for its scene, so `data` only ever changes via its own onChange.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgetId])

  return (
    <Excalidraw
      initialData={initialData}
      theme={theme}
      onChange={(elements, appState, files) => {
        pendingRef.current = { elements, appState }
        timeoutRef.current.schedule(flush, 500)
        void persistNewExcalidrawFiles(widgetId, files, knownFileRefsRef.current).then((refs) => {
          knownFileRefsRef.current = refs
        })
      }}
    />
  )
}

export function ExcalidrawFullscreen({ open, widgetId, title, data, onChange, onClose }: ExcalidrawFullscreenProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useOverlayLifecycle(open)
  useFocusTrap(open, panelRef, closeButtonRef)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${title} — fullscreen drawing`}
      className="gp-excalidraw-overlay fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-8"
    >
      <div role="presentation" className="gp-scrim gp-fade absolute inset-0 bg-black/55" onClick={onClose} />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="gp-excalidraw-panel gp-popup-surface gp-dialog gp-pop gp-panel relative z-10 flex h-full w-full max-w-[1680px] flex-col overflow-hidden rounded-3xl shadow-2xl outline-none"
      >
        <div className="flex shrink-0 items-center justify-between border-b gp-hairline px-4 py-2.5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-200">
            <Shapes size={14} className="text-sky-300" aria-hidden />
            {title}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close fullscreen drawing"
            className="gp-popup-close-naked gp-touch-target h-8 w-8"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
        <div className="relative min-h-0 flex-1">
          <ExcalidrawEditor widgetId={widgetId} data={data} onChange={onChange} />
        </div>
      </div>
    </div>,
    document.body,
  )
}
