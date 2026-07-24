import { useEffect, useMemo } from 'react'
import { Check, Sparkles, X } from 'lucide-react'
import { useMcpConnectorStore } from '../../store/useMcpConnectorStore'
import { useToastStore } from '../../store/useToastStore'
import { useWidgetStore } from '../../store/useWidgetStore'
import { thoughtPlanFromMcpTree, type McpTreePreview } from '../../mcp/treeContract'
import { BlueprintSceneView } from './QuickAddPreviewLayer'
import { buildPreviewScene, PREVIEW_PILL_GAP } from './quickAddPreviewScene'

/**
 * On-canvas review surface for AI-proposed trees.
 *
 * When a connected MCP client calls preview_tree, the pending tree renders
 * here as blueprint chips exactly where commit will create real cards, headed
 * by an interactive pill: Add commits the tree as one Undo action, Dismiss
 * retires the preview (the AI client is told the user dismissed it). The AI
 * client's own commit_tree call and the Add button share one consume-once
 * commit in useMcpConnectorStore, so approving in either place never
 * duplicates cards.
 *
 * The layer lives inside the canvas world transform; only the pill accepts
 * pointer input, and data-canvas-ui keeps canvas gestures from starting on it.
 */
export function McpPreviewLayer() {
  const previews = useMcpConnectorStore((state) => state.previews)
  const activeCanvasId = useWidgetStore((state) => state.activeCanvasId)

  // Fold expired previews away on time, not just on the next store write.
  useEffect(() => {
    if (previews.length === 0) return
    const nextExpiry = Math.min(...previews.map((preview) => preview.expiresAt))
    const timer = window.setTimeout(
      () => useMcpConnectorStore.getState().pruneExpiredPreviews(),
      Math.max(0, nextExpiry - Date.now()) + 50,
    )
    return () => window.clearTimeout(timer)
  }, [previews])

  const visible = previews.filter((preview) => preview.canvasId === activeCanvasId)
  if (visible.length === 0) return null
  return (
    <>
      {visible.map((preview) => (
        <McpPreviewTree key={preview.previewId} preview={preview} />
      ))}
    </>
  )
}

function McpPreviewTree({ preview }: { preview: McpTreePreview }) {
  const scene = useMemo(
    () => buildPreviewScene(thoughtPlanFromMcpTree(preview), preview.origin),
    [preview],
  )

  const add = () => {
    try {
      useMcpConnectorStore.getState().commitPreview(preview.previewId)
    } catch (cause) {
      useToastStore.getState().addToast(cause instanceof Error ? cause.message : 'Could not add the AI tree')
    }
  }
  const dismiss = () => {
    useMcpConnectorStore.getState().dismissPreview(preview.previewId)
    useToastStore.getState().addToast('AI proposal dismissed')
  }

  return (
    <div data-canvas-ui className="absolute left-0 top-0">
      <div className="pointer-events-none" aria-hidden>
        <BlueprintSceneView scene={scene} />
      </div>
      <div
        className="gp-bp-pill absolute flex items-center gap-2 whitespace-nowrap rounded-full border border-violet-300/25 bg-neutral-950/85 py-1.5 pl-3 pr-1.5 text-[11px] text-neutral-300 shadow-xl backdrop-blur-sm"
        style={{ left: preview.origin.x, top: preview.origin.y - PREVIEW_PILL_GAP, transform: 'translateX(-50%)' }}
        role="group"
        aria-label={`AI proposed a ${preview.nodes.length}-card tree`}
      >
        <Sparkles size={11} className="text-violet-300/90" />
        <span className="font-medium text-neutral-100">AI proposal</span>
        <span className="rounded-full bg-violet-400/15 px-1.5 py-px text-[8.5px] font-semibold uppercase tracking-wider text-violet-300">AI</span>
        <span className="text-neutral-600">·</span>
        <span className="text-neutral-500">{preview.nodes.length === 1 ? '1 card' : `${preview.nodes.length} cards`}</span>
        <button
          type="button"
          onClick={add}
          className="ml-1 flex items-center gap-1 rounded-full bg-emerald-400/15 py-1 pl-2 pr-2.5 font-medium text-emerald-300 transition-colors hover:bg-emerald-400/25"
        >
          <Check size={11} /> Add to board
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss AI proposal"
          className="flex items-center gap-1 rounded-full py-1 pl-1.5 pr-2 text-neutral-400 transition-colors hover:bg-neutral-400/10 hover:text-neutral-200"
        >
          <X size={11} /> Dismiss
        </button>
      </div>
    </div>
  )
}
