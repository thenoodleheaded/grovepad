const CANVAS_CONNECTION_KEY = 'grovepad:canvas-lms:connection:v1'
const MAX_RESPONSE_ITEMS = 100

const COURSE_COLORS = [
  '#e45b52',
  '#7baee4',
  '#72c995',
  '#e4b672',
  '#b58be4',
  '#65bfc8',
] as const

export interface CanvasLmsConnection {
  origin: string
  token: string
}

export interface CanvasLmsConnectionStatus {
  origin: string
  host: string
}

export interface CanvasLmsCourse {
  id: string
  name: string
  code: string
  term: string
  score: number | null
  grade: string
  url: string | null
  color: string
}

export interface CanvasLmsPlannerItem {
  id: string
  courseId: string
  courseName: string
  title: string
  dueAt: string | null
  type: string
  completed: boolean
  submitted: boolean
  pointsPossible: number | null
  score: number | null
  url: string | null
  color: string
}

export interface CanvasLmsAnnouncement {
  id: string
  courseId: string
  courseName: string
  title: string
  postedAt: string | null
  excerpt: string
  url: string | null
  color: string
}

export interface CanvasLmsFeed {
  courses: CanvasLmsCourse[]
  items: CanvasLmsPlannerItem[]
  announcements: CanvasLmsAnnouncement[]
  syncedAt: number
}

type Fetcher = typeof fetch
type UnknownRecord = Record<string, unknown>

function record(value: unknown): UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {}
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim().slice(0, 500) : fallback
}

function numeric(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : null
}

function identifier(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return text(value)
}

function boundedArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value.slice(0, MAX_RESPONSE_ITEMS) : []
}

function safeHttpUrl(value: unknown): string | null {
  const candidate = text(value)
  if (!candidate) return null
  try {
    const url = new URL(candidate)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch {
    return null
  }
}

function colorFor(id: string): string {
  let hash = 0
  for (const character of id) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0
  return COURSE_COLORS[Math.abs(hash) % COURSE_COLORS.length]!
}

function storedConnection(): CanvasLmsConnection | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const saved = record(JSON.parse(localStorage.getItem(CANVAS_CONNECTION_KEY) ?? 'null'))
    const origin = parseCanvasOrigin(saved.origin)
    const token = text(saved.token)
    return token ? { origin, token } : null
  } catch {
    return null
  }
}

function storeConnection(connection: CanvasLmsConnection): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(CANVAS_CONNECTION_KEY, JSON.stringify(connection))
}

export function parseCanvasOrigin(value: unknown): string {
  const raw = text(value)
  if (!raw) throw new Error('Enter your school’s Canvas address.')
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`
  try {
    const url = new URL(candidate)
    if (url.protocol !== 'https:') throw new Error('Canvas must use a secure HTTPS address.')
    if (url.username || url.password) throw new Error('Enter the Canvas address without credentials.')
    return url.origin
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Canvas')) throw error
    throw new Error('Enter a valid Canvas address, such as https://school.instructure.com.')
  }
}

export function canvasLmsConnectionStatus(): CanvasLmsConnectionStatus | null {
  const connection = storedConnection()
  if (!connection) return null
  return { origin: connection.origin, host: new URL(connection.origin).host }
}

export function disconnectCanvasLms(): void {
  if (typeof localStorage !== 'undefined') localStorage.removeItem(CANVAS_CONNECTION_KEY)
}

function normalizeCourse(value: unknown): CanvasLmsCourse | null {
  const source = record(value)
  const id = identifier(source.id)
  if (!id) return null
  const term = record(source.term)
  const enrollments = boundedArray(source.enrollments).map(record)
  const studentEnrollment = enrollments.find((entry) => {
    const type = text(entry.type).toLowerCase()
    const role = text(entry.role).toLowerCase()
    return type.includes('student') || role.includes('student')
  }) ?? enrollments[0] ?? {}
  const grades = record(studentEnrollment.grades)
  const score = numeric(
    grades.current_score
      ?? grades.computed_current_score
      ?? grades.final_score,
  )
  const grade = text(
    grades.current_grade
      ?? grades.computed_current_grade
      ?? grades.final_grade,
  )
  return {
    id,
    name: text(source.name, text(source.course_code, 'Untitled course')),
    code: text(source.course_code),
    term: text(term.name),
    score,
    grade,
    url: safeHttpUrl(source.html_url),
    color: colorFor(id),
  }
}

export function normalizeCanvasCourses(value: unknown): CanvasLmsCourse[] {
  return boundedArray(value)
    .map(normalizeCourse)
    .filter((course): course is CanvasLmsCourse => course !== null)
}

function courseLookup(courses: CanvasLmsCourse[]): Map<string, CanvasLmsCourse> {
  return new Map(courses.map((course) => [course.id, course]))
}

export function normalizeCanvasPlannerItems(
  value: unknown,
  courses: CanvasLmsCourse[],
): CanvasLmsPlannerItem[] {
  const byId = courseLookup(courses)
  return boundedArray(value).flatMap((entry): CanvasLmsPlannerItem[] => {
    const source = record(entry)
    const plannable = record(source.plannable)
    const submission = record(source.submissions)
    const override = record(source.planner_override)
    const id = identifier(source.plannable_id ?? source.id)
    const courseId = identifier(source.course_id ?? plannable.course_id)
    if (!id) return []
    const course = byId.get(courseId)
    const dueAt = text(
      plannable.due_at
        ?? source.plannable_date
        ?? plannable.todo_date
        ?? plannable.start_at,
    ) || null
    return [{
      id: `${text(source.plannable_type, 'item')}:${id}`,
      courseId,
      courseName: course?.name ?? text(source.context_name, 'Canvas'),
      title: text(plannable.title, text(source.title, 'Untitled item')),
      dueAt,
      type: text(source.plannable_type, 'item').replaceAll('_', ' '),
      completed: override.marked_complete === true || source.completed === true,
      submitted: Boolean(
        submission.submitted_at
          || submission.workflow_state === 'submitted'
          || submission.workflow_state === 'graded',
      ),
      pointsPossible: numeric(plannable.points_possible),
      score: numeric(submission.score),
      url: safeHttpUrl(plannable.html_url ?? source.html_url),
      color: course?.color ?? colorFor(courseId || id),
    }]
  }).sort((left, right) => {
    if (!left.dueAt) return 1
    if (!right.dueAt) return -1
    return left.dueAt.localeCompare(right.dueAt)
  })
}

function plainExcerpt(value: unknown): string {
  return text(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240)
}

export function normalizeCanvasAnnouncements(
  value: unknown,
  courses: CanvasLmsCourse[],
): CanvasLmsAnnouncement[] {
  const byId = courseLookup(courses)
  return boundedArray(value).flatMap((entry): CanvasLmsAnnouncement[] => {
    const source = record(entry)
    const id = identifier(source.id)
    if (!id) return []
    const courseId = text(source.context_code).replace(/^course_/, '')
    const course = byId.get(courseId)
    return [{
      id,
      courseId,
      courseName: course?.name ?? 'Canvas',
      title: text(source.title, 'Announcement'),
      postedAt: text(source.posted_at ?? source.created_at) || null,
      excerpt: plainExcerpt(source.message),
      url: safeHttpUrl(source.html_url),
      color: course?.color ?? colorFor(courseId || id),
    }]
  }).sort((left, right) => (right.postedAt ?? '').localeCompare(left.postedAt ?? ''))
}

async function canvasRequest(
  connection: CanvasLmsConnection,
  path: string,
  fetcher: Fetcher,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await fetcher(`${connection.origin}${path}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${connection.token}`,
    },
    signal,
  })
  if (response.status === 401 || response.status === 403) {
    throw new Error('Canvas refused this access token. Check it and try again.')
  }
  if (!response.ok) {
    throw new Error(`Canvas could not be reached (${response.status}).`)
  }
  return response.json()
}

function isoDayOffset(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString()
}

export async function fetchCanvasLmsFeed(
  connection: CanvasLmsConnection,
  signal?: AbortSignal,
  fetcher: Fetcher = fetch,
): Promise<CanvasLmsFeed> {
  const coursesResponse = await canvasRequest(
    connection,
    '/api/v1/courses?enrollment_state=active&enrollment_type=student&include%5B%5D=total_scores&include%5B%5D=term&per_page=100',
    fetcher,
    signal,
  )
  const courses = normalizeCanvasCourses(coursesResponse)
  const plannerPath = new URLSearchParams({
    start_date: isoDayOffset(-7),
    end_date: isoDayOffset(60),
    per_page: '100',
  })
  const itemsPromise = canvasRequest(
    connection,
    `/api/v1/planner/items?${plannerPath}`,
    fetcher,
    signal,
  )
  const announcementParams = new URLSearchParams({
    start_date: isoDayOffset(-28),
    end_date: isoDayOffset(1),
    active_only: 'true',
    per_page: '100',
  })
  for (const course of courses.slice(0, 30)) {
    announcementParams.append('context_codes[]', `course_${course.id}`)
  }
  const announcementsPromise = courses.length === 0
    ? Promise.resolve([])
    : canvasRequest(
        connection,
        `/api/v1/announcements?${announcementParams}`,
        fetcher,
        signal,
      ).catch(() => [])

  const [plannerResponse, announcementsResponse] = await Promise.all([
    itemsPromise,
    announcementsPromise,
  ])
  return {
    courses,
    items: normalizeCanvasPlannerItems(plannerResponse, courses),
    announcements: normalizeCanvasAnnouncements(announcementsResponse, courses),
    syncedAt: Date.now(),
  }
}

export async function connectCanvasLms(
  originValue: unknown,
  tokenValue: unknown,
  signal?: AbortSignal,
): Promise<CanvasLmsFeed> {
  const origin = parseCanvasOrigin(originValue)
  const token = text(tokenValue)
  if (token.length < 10) throw new Error('Enter a valid Canvas access token.')
  const connection = { origin, token }
  const feed = await fetchCanvasLmsFeed(connection, signal)
  storeConnection(connection)
  return feed
}

export async function loadCanvasLmsFeed(signal?: AbortSignal): Promise<CanvasLmsFeed> {
  const connection = storedConnection()
  if (!connection) throw new Error('Connect Canvas to load your courses.')
  return fetchCanvasLmsFeed(connection, signal)
}
