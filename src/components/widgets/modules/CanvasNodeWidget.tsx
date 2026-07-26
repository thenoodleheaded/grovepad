import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Folder,
  FolderOpen,
  LayoutDashboard,
  Network,
  Sparkles,
} from 'lucide-react'
import {
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { useWidgetStore } from '../../../store/useWidgetStore'
import type { CanvasNodeData, ModuleData } from '../../../types/spatial'
import { dataWithSkinState, skinStateFor } from '../../../utils/widgetSkins'
import {
  canvasCoverState,
  canvasNodeSkin,
  canvasPreviewItems,
  summarizeCanvasNode,
  type CanvasNodeSkin,
} from './canvasNodeSkinModel'

interface CanvasNodeWidgetProps {
  data: CanvasNodeData
  onChange?: (data: CanvasNodeData) => void
  onHeightChange?: (height: number) => void
  skin?: CanvasNodeSkin
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

function readableType(type: string): string {
  return type
    .split('_')
    .map((part) => `${part.charAt(0).toLocaleUpperCase()}${part.slice(1)}`)
    .join(' ')
}

function OpenCanvasButton({
  canvasName,
  onOpen,
  children = 'Open canvas',
}: {
  canvasName: string
  onOpen: () => void
  children?: ReactNode
}) {
  return (
    <button
      type="button"
      className="gp-canvas-node-open"
      aria-label={`Open ${canvasName}`}
      onClick={(event) => {
        event.stopPropagation()
        onOpen()
      }}
    >
      <span>{children}</span>
      <ArrowRight size={14} aria-hidden />
    </button>
  )
}

export function CanvasNodeWidget({
  data,
  onChange,
  onHeightChange,
  skin: requestedSkin,
}: CanvasNodeWidgetProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const canvases = useWidgetStore((state) => state.canvases)
  const widgets = useWidgetStore((state) => state.widgets)
  const canvasViews = useWidgetStore((state) => state.canvasViews)
  const skin = requestedSkin ?? canvasNodeSkin(data.skin)
  const canvas = canvases[data.canvasId]
  const canvasName = canvas?.name ?? 'Canvas'
  const summary = useMemo(
    () => summarizeCanvasNode(data.canvasId, canvases, widgets),
    [canvases, data.canvasId, widgets],
  )
  const preview = useMemo(
    () => canvasPreviewItems(data.canvasId, widgets),
    [data.canvasId, widgets],
  )
  const hasVisited = Boolean(canvasViews[data.canvasId])

  useLayoutEffect(() => {
    if (rootRef.current) onHeightChange?.(rootRef.current.scrollHeight)
  }, [
    onHeightChange,
    preview.length,
    skin,
    summary.childCanvases.length,
    summary.typeCounts.length,
    summary.widgetCount,
  ])

  const enter = (canvasId = data.canvasId) => {
    if (useWidgetStore.getState().canvases[canvasId]) {
      useWidgetStore.getState().navigateToCanvas(canvasId)
    }
  }

  const updateCover = (patch: Partial<ReturnType<typeof canvasCoverState>>) => {
    if (!onChange) return
    const current = canvasCoverState(skinStateFor(data, 'cover'))
    onChange(dataWithSkinState(
      { ...data, skin } as ModuleData,
      'cover',
      { ...current, ...patch },
    ) as CanvasNodeData)
  }

  if (skin === 'cover') {
    const cover = canvasCoverState(skinStateFor(data, 'cover'))
    return (
      <div ref={rootRef} className="gp-canvas-node gp-canvas-node-cover" data-canvas-skin="cover">
        <div className="gp-canvas-cover-orbit" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        <input
          className="gp-canvas-cover-eyebrow"
          aria-label="Canvas cover eyebrow"
          value={cover.eyebrow}
          placeholder="Open canvas"
          maxLength={40}
          onChange={(event) => updateCover({ eyebrow: event.target.value })}
        />
        <h2>{canvasName}</h2>
        <textarea
          className="gp-canvas-cover-subtitle"
          aria-label="Canvas cover subtitle"
          value={cover.subtitle}
          placeholder="What lives inside this canvas?"
          maxLength={160}
          rows={2}
          onChange={(event) => updateCover({ subtitle: event.target.value })}
        />
        <div className="gp-canvas-cover-footer">
          <span>
            {summary.widgetCount === 0 ? 'An open space' : plural(summary.widgetCount, 'card')}
            {' · '}
            {hasVisited ? 'Visited' : 'New'}
          </span>
          <button
            type="button"
            aria-label={`Open ${canvasName}`}
            onClick={(event) => {
              event.stopPropagation()
              enter()
            }}
          >
            <ArrowUpRight size={17} aria-hidden />
          </button>
        </div>
      </div>
    )
  }

  if (skin === 'live_thumbnail') {
    return (
      <div ref={rootRef} className="gp-canvas-node gp-canvas-node-thumbnail" data-canvas-skin="live_thumbnail">
        <header className="gp-canvas-node-heading">
          <span className="gp-canvas-node-icon"><Network size={14} aria-hidden /></span>
          <span>
            <small>Live canvas</small>
            <strong>{canvasName}</strong>
          </span>
          <span className="gp-canvas-live-dot" title="Preview is current" />
        </header>
        <div
          className="gp-canvas-preview"
          aria-label={`${canvasName} preview with ${plural(summary.widgetCount, 'card')}`}
        >
          {preview.length === 0 ? (
            <div className="gp-canvas-preview-empty">
              <Sparkles size={18} aria-hidden />
              <span>Room to begin</span>
            </div>
          ) : preview.map((item, index) => (
            <span
              key={item.id}
              className="gp-canvas-preview-card"
              data-completed={item.completed || undefined}
              style={{
                '--gp-preview-x': `${item.x}%`,
                '--gp-preview-y': `${item.y}%`,
                '--gp-preview-width': `${item.width}%`,
                '--gp-preview-height': `${item.height}%`,
                '--gp-preview-delay': `${Math.min(index, 8) * 18}ms`,
              } as CSSProperties}
            />
          ))}
          <span className="gp-canvas-preview-grid" aria-hidden />
        </div>
        <footer className="gp-canvas-node-footer">
          <span>{plural(summary.widgetCount, 'card')}</span>
          <OpenCanvasButton canvasName={canvasName} onOpen={() => enter()}>
            Enter
          </OpenCanvasButton>
        </footer>
      </div>
    )
  }

  if (skin === 'dashboard_door') {
    const completionLabel = summary.widgetCount === 0
      ? 'Ready'
      : `${summary.completionPercent}%`
    return (
      <div ref={rootRef} className="gp-canvas-node gp-canvas-node-dashboard" data-canvas-skin="dashboard_door">
        <header className="gp-canvas-node-heading">
          <span className="gp-canvas-node-icon"><LayoutDashboard size={14} aria-hidden /></span>
          <span>
            <small>Canvas pulse</small>
            <strong>{canvasName}</strong>
          </span>
        </header>
        <div className="gp-canvas-dashboard-hero">
          <strong>{completionLabel}</strong>
          <span>
            {summary.widgetCount === 0
              ? 'A clear canvas'
              : `${summary.completedCount} of ${summary.widgetCount} complete`}
          </span>
        </div>
        <div
          className="gp-canvas-dashboard-progress"
          role="progressbar"
          aria-label="Canvas completion"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={summary.completionPercent}
        >
          <span style={{ width: `${summary.completionPercent}%` }} />
        </div>
        <dl className="gp-canvas-dashboard-metrics">
          <div>
            <dt>Cards</dt>
            <dd>{summary.widgetCount}</dd>
          </div>
          <div data-attention={summary.attentionCount > 0 || undefined}>
            <dt>Attention</dt>
            <dd>{summary.attentionCount}</dd>
          </div>
          <div>
            <dt>Canvases</dt>
            <dd>{summary.childCanvases.length}</dd>
          </div>
        </dl>
        {summary.typeCounts.length > 0 && (
          <div className="gp-canvas-dashboard-types" aria-label="Most common card types">
            {summary.typeCounts.slice(0, 3).map((item) => (
              <span key={item.type}>{readableType(item.type)} <b>{item.count}</b></span>
            ))}
          </div>
        )}
        <OpenCanvasButton canvasName={canvasName} onOpen={() => enter()}>
          View dashboard
        </OpenCanvasButton>
      </div>
    )
  }

  if (skin === 'folder_index') {
    return (
      <div ref={rootRef} className="gp-canvas-node gp-canvas-node-index" data-canvas-skin="folder_index">
        <header className="gp-canvas-node-heading">
          <span className="gp-canvas-node-icon"><Folder size={14} aria-hidden /></span>
          <span>
            <small>Canvas index</small>
            <strong>{canvasName}</strong>
          </span>
          <span className="gp-canvas-index-count">{summary.childCanvases.length}</span>
        </header>
        {summary.childCanvases.length === 0 ? (
          <div className="gp-canvas-index-empty">
            <FolderOpen size={19} aria-hidden />
            <strong>No nested canvases yet</strong>
            <span>Open this canvas to start a new branch.</span>
          </div>
        ) : (
          <ul className="gp-canvas-index-list" aria-label={`Canvases inside ${canvasName}`}>
            {summary.childCanvases.slice(0, 6).map((child, index) => {
              const childSummary = summarizeCanvasNode(child.id, canvases, widgets)
              return (
                <li key={child.id}>
                  <button
                    type="button"
                    aria-label={`Open ${child.name}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      enter(child.id)
                    }}
                  >
                    <span className="gp-canvas-index-order">{String(index + 1).padStart(2, '0')}</span>
                    <span className="gp-canvas-index-name">
                      <strong>{child.name}</strong>
                      <small>{plural(childSummary.widgetCount, 'card')}</small>
                    </span>
                    <ArrowUpRight size={13} aria-hidden />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <OpenCanvasButton canvasName={canvasName} onOpen={() => enter()}>
          Open parent canvas
        </OpenCanvasButton>
      </div>
    )
  }

  return (
    <div ref={rootRef} className="gp-canvas-node gp-canvas-node-portal" data-canvas-skin="portal">
      <button
        type="button"
        className="gp-canvas-portal-link"
        aria-label={`Open ${canvasName}`}
        onClick={(event) => {
          event.stopPropagation()
          enter()
        }}
      >
        <span className="gp-canvas-portal-glyph">
          <FolderOpen size={17} aria-hidden />
          <span aria-hidden />
        </span>
        <span className="gp-canvas-portal-copy">
          <small>{hasVisited ? 'Continue inside' : 'Step inside'}</small>
          <strong>{canvasName}</strong>
          <span>
            {summary.widgetCount === 0
              ? 'An empty canvas'
              : `${plural(summary.widgetCount, 'card')} · ${plural(summary.childCanvases.length, 'branch')}`}
          </span>
        </span>
        <span className="gp-canvas-portal-arrow"><ArrowUpRight size={15} aria-hidden /></span>
      </button>
      {summary.completedCount > 0 && (
        <span className="gp-canvas-portal-complete">
          <CheckCircle2 size={11} aria-hidden />
          {summary.completedCount} complete
        </span>
      )}
    </div>
  )
}
