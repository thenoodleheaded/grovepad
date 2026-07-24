import type { ThoughtPlan } from '../../utils/thoughtInterpreter'
import { layoutThoughtPlan, layoutWidth, type PlanNodeSize } from '../../utils/planLayout'

export const PREVIEW_CHIP_WIDTH = 208
export const PREVIEW_CHIP_HEIGHT = 64
export const PREVIEW_PILL_GAP = 44

export interface PreviewChip {
  key: string
  temporaryId: string
  title: string
  widgetType: ThoughtPlan['nodes'][number]['widgetType']
  x: number
  y: number
  depth: number
  siblingIndex: number
}

interface PreviewRope {
  key: string
  d: string
  blocker: boolean
}

export interface PreviewScene {
  chips: PreviewChip[]
  ropes: PreviewRope[]
  width: number
  height: number
}

function chipKeys(plan: ThoughtPlan): Map<string, string> {
  const seen = new Map<string, number>()
  const keys = new Map<string, string>()
  for (const node of plan.nodes) {
    const base = `${node.widgetType}|${node.title.trim().toLowerCase()}`
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    keys.set(node.temporaryId, count === 0 ? base : `${base}#${count}`)
  }
  return keys
}

export function buildPreviewScene(
  plan: ThoughtPlan,
  anchor: { x: number; y: number },
): PreviewScene {
  const sizes: Record<string, PlanNodeSize> = {}
  for (const node of plan.nodes) {
    sizes[node.temporaryId] = {
      width: PREVIEW_CHIP_WIDTH,
      height: PREVIEW_CHIP_HEIGHT,
    }
  }
  const positions = layoutThoughtPlan(plan, sizes)
  const width = layoutWidth(positions, sizes)
  const left = anchor.x - width / 2
  const keys = chipKeys(plan)

  const depthOf = new Map<string, number>()
  const parentOf = new Map<string, string>()
  for (const relation of plan.relations) {
    if (relation.type === 'parent' && !parentOf.has(relation.toTemporaryId)) {
      parentOf.set(relation.toTemporaryId, relation.fromTemporaryId)
    }
  }
  const depthFor = (id: string, hops = 0): number => {
    const cached = depthOf.get(id)
    if (cached !== undefined) return cached
    const parent = parentOf.get(id)
    const depth = parent && parent !== id && hops < 12 ? depthFor(parent, hops + 1) + 1 : 0
    depthOf.set(id, depth)
    return depth
  }

  const siblingCounters = new Map<string, number>()
  const chips: PreviewChip[] = plan.nodes.map((node) => {
    const position = positions[node.temporaryId] ?? { x: 0, y: 0 }
    const depth = depthFor(node.temporaryId)
    const parent = parentOf.get(node.temporaryId) ?? '__root__'
    const siblingIndex = siblingCounters.get(parent) ?? 0
    siblingCounters.set(parent, siblingIndex + 1)
    return {
      key: keys.get(node.temporaryId)!,
      temporaryId: node.temporaryId,
      title: node.title,
      widgetType: node.widgetType,
      x: left + position.x,
      y: anchor.y + position.y,
      depth,
      siblingIndex,
    }
  })
  const chipByTempId = new Map(chips.map((chip) => [chip.temporaryId, chip]))

  const ropes: PreviewRope[] = []
  for (const relation of plan.relations) {
    if (relation.type !== 'parent' && relation.type !== 'blocker') continue
    const from = chipByTempId.get(relation.fromTemporaryId)
    const to = chipByTempId.get(relation.toTemporaryId)
    if (!from || !to) continue
    const x1 = from.x + PREVIEW_CHIP_WIDTH / 2
    const y1 = from.y + PREVIEW_CHIP_HEIGHT
    const x2 = to.x + PREVIEW_CHIP_WIDTH / 2
    const y2 = to.y
    if (y2 <= y1) continue
    const bend = Math.min(36, (y2 - y1) / 2)
    ropes.push({
      key: `${from.key}->${to.key}`,
      d: `M ${x1} ${y1} C ${x1} ${y1 + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}`,
      blocker: relation.type === 'blocker',
    })
  }

  let maxY = anchor.y
  for (const chip of chips) maxY = Math.max(maxY, chip.y + PREVIEW_CHIP_HEIGHT)
  return { chips, ropes, width, height: maxY - anchor.y }
}
