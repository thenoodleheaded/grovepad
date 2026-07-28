import type { CanvasLmsSkin } from '../../../types/widgetDataEducation'
import type {
  CanvasLmsFeed,
  CanvasLmsPlannerItem,
} from '../../../services/canvasLmsService'

export const CANVAS_LMS_SKINS = [
  'overview',
  'courses',
  'assignments',
  'grades',
  'announcements',
] as const satisfies readonly CanvasLmsSkin[]

export function canvasLmsSkin(value: unknown): CanvasLmsSkin {
  return CANVAS_LMS_SKINS.includes(value as CanvasLmsSkin)
    ? value as CanvasLmsSkin
    : 'overview'
}

export function activeCanvasItems(feed: CanvasLmsFeed): CanvasLmsPlannerItem[] {
  return feed.items
    .filter((item) => !item.completed)
    .sort((left, right) => {
      if (!left.dueAt) return 1
      if (!right.dueAt) return -1
      return left.dueAt.localeCompare(right.dueAt)
    })
}

export function canvasSubmissionLabel(item: CanvasLmsPlannerItem): string {
  if (item.score !== null) {
    const possible = item.pointsPossible === null ? '' : ` / ${item.pointsPossible}`
    return `${item.score}${possible} pts`
  }
  if (item.submitted) return 'Submitted'
  if (item.completed) return 'Complete'
  return 'To do'
}
