import { canvasLmsSkin } from '../../components/widgets/modules/canvasLmsModel'
import type { RestingFaceModel } from '../restingFaceModel'

const SKIN_LABELS = {
  overview: 'Overview',
  courses: 'Courses',
  assignments: 'Assignments',
  grades: 'Grades',
  announcements: 'Announcements',
} as const

/**
 * The folded card never repeats student records. It communicates the selected
 * view and the privacy boundary; live Canvas details appear only after opening.
 */
export function canvasLmsRestingFace(data: Record<string, unknown>): RestingFaceModel {
  const skin = canvasLmsSkin(data.skin)
  return {
    kind: 'rows',
    eyebrow: { label: SKIN_LABELS[skin], note: 'Private' },
    rows: [
      { key: 'source', label: 'Canvas LMS', value: 'Open to sync', tone: 'accent' },
      { key: 'privacy', label: 'Student data', value: 'This device', tone: 'muted' },
    ],
    overflow: 0,
  }
}
