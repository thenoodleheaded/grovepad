import { canvasLmsSkin } from '../../components/widgets/modules/canvasLmsModel'
import type { RestingFaceModel } from '../restingFaceModel'

const SKIN_LABELS = {
  overview: 'Overview',
  courses: 'Courses',
  assignments: 'Assignments',
  grades: 'Grades',
  announcements: 'Announcements',
} as const

/** What each view will fetch once the card is opened. Naming the subject is
 * the most a folded card may say: it is the one thing that tells the five
 * views apart, and it is this widget's own setting rather than anybody's
 * record. */
const SKIN_SUBJECTS = {
  overview: 'Term at a glance',
  courses: 'Enrolled courses',
  assignments: 'Upcoming work',
  grades: 'Marks and feedback',
  announcements: 'Course notices',
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
      { key: 'source', label: SKIN_SUBJECTS[skin], value: 'Open to sync', tone: 'accent' },
      { key: 'privacy', label: 'Student data', value: 'This device', tone: 'muted' },
    ],
    overflow: 0,
  }
}
