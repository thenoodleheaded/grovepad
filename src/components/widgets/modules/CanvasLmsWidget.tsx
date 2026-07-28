import {
  Bell,
  BookOpen,
  CircleCheck,
  Clock3,
  ExternalLink,
  GraduationCap,
  LoaderCircle,
  RefreshCw,
  Unplug,
} from 'lucide-react'
import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import type { CanvasLmsData, CanvasLmsSkin } from '../../../types/widgetDataEducation'
import {
  canvasLmsConnectionStatus,
  connectCanvasLms,
  disconnectCanvasLms,
  loadCanvasLmsFeed,
  type CanvasLmsCourse,
  type CanvasLmsFeed,
  type CanvasLmsPlannerItem,
} from '../../../services/canvasLmsService'
import {
  activeCanvasItems,
  canvasLmsSkin,
  canvasSubmissionLabel,
} from './canvasLmsModel'

interface CanvasLmsWidgetProps {
  data: CanvasLmsData
}

interface CanvasLmsBodyProps {
  skin: CanvasLmsSkin
  feed: CanvasLmsFeed
}

function compactDate(value: string | null): string {
  if (!value) return 'No due date'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(0, 10)
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function compactDay(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(0, 10)
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function externalTitleLink(
  title: string,
  url: string | null,
  className?: string,
): ReactNode {
  if (!url) return <strong className={className}>{title}</strong>
  return (
    <a className={className} href={url} target="_blank" rel="noreferrer">
      <strong>{title}</strong>
      <ExternalLink size={10} aria-hidden />
    </a>
  )
}

function CourseMark({ course }: { course: CanvasLmsCourse }) {
  return (
    <i
      className="gp-canvas-lms-course-mark"
      style={{ '--gp-canvas-course': course.color } as CSSProperties}
      aria-hidden
    />
  )
}

function AssignmentRow({ item }: { item: CanvasLmsPlannerItem }) {
  return (
    <article className="gp-canvas-lms-assignment" data-done={item.completed || undefined}>
      <i style={{ '--gp-canvas-course': item.color } as CSSProperties} aria-hidden />
      <span>
        {externalTitleLink(item.title, item.url)}
        <small>{item.courseName} · {item.type}</small>
      </span>
      <span>
        <time dateTime={item.dueAt ?? undefined}>{compactDate(item.dueAt)}</time>
        <small>{canvasSubmissionLabel(item)}</small>
      </span>
    </article>
  )
}

function EmptyCanvasState({ icon, title, detail }: {
  icon: ReactNode
  title: string
  detail: string
}) {
  return (
    <div className="gp-canvas-lms-empty">
      {icon}
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  )
}

export function CanvasLmsBody({ skin, feed }: CanvasLmsBodyProps) {
  const activeItems = activeCanvasItems(feed)

  if (skin === 'courses') {
    return (
      <div className="gp-canvas-lms-body gp-canvas-lms-courses" data-canvas-lms-skin={skin}>
        {feed.courses.length === 0 ? (
          <EmptyCanvasState
            icon={<BookOpen size={22} aria-hidden />}
            title="No active courses"
            detail="Canvas did not report any current student enrollments."
          />
        ) : feed.courses.map((course) => (
          <article key={course.id} className="gp-canvas-lms-course-card">
            <CourseMark course={course} />
            <span>
              {externalTitleLink(course.name, course.url)}
              <small>{[course.code, course.term].filter(Boolean).join(' · ') || 'Active course'}</small>
            </span>
            {(course.grade || course.score !== null) && (
              <output>{course.grade || `${course.score?.toFixed(1)}%`}</output>
            )}
          </article>
        ))}
      </div>
    )
  }

  if (skin === 'assignments') {
    return (
      <div className="gp-canvas-lms-body gp-canvas-lms-assignments" data-canvas-lms-skin={skin}>
        {feed.items.length === 0 ? (
          <EmptyCanvasState
            icon={<CircleCheck size={22} aria-hidden />}
            title="No upcoming work"
            detail="Your planner is clear for the next sixty days."
          />
        ) : feed.items.map((item) => <AssignmentRow key={item.id} item={item} />)}
      </div>
    )
  }

  if (skin === 'grades') {
    return (
      <div className="gp-canvas-lms-body gp-canvas-lms-grades" data-canvas-lms-skin={skin}>
        {feed.courses.length === 0 ? (
          <EmptyCanvasState
            icon={<GraduationCap size={22} aria-hidden />}
            title="No grades available"
            detail="Grades appear when Canvas makes course totals visible."
          />
        ) : feed.courses.map((course) => {
          const score = course.score === null ? null : Math.max(0, Math.min(100, course.score))
          return (
            <article key={course.id} className="gp-canvas-lms-grade-row">
              <CourseMark course={course} />
              <span>
                {externalTitleLink(course.name, course.url)}
                <small>{course.code || course.term || 'Current course'}</small>
                <i
                  aria-hidden
                  style={{ '--gp-canvas-score': score === null ? 0 : score } as CSSProperties}
                />
              </span>
              <output>
                <strong>{course.grade || (score === null ? 'Hidden' : `${score.toFixed(1)}%`)}</strong>
                {course.grade && score !== null && <small>{score.toFixed(1)}%</small>}
              </output>
            </article>
          )
        })}
      </div>
    )
  }

  if (skin === 'announcements') {
    return (
      <div className="gp-canvas-lms-body gp-canvas-lms-announcements" data-canvas-lms-skin={skin}>
        {feed.announcements.length === 0 ? (
          <EmptyCanvasState
            icon={<Bell size={22} aria-hidden />}
            title="No recent announcements"
            detail="Nothing was posted across your current courses in the last four weeks."
          />
        ) : feed.announcements.map((announcement) => (
          <article key={announcement.id} className="gp-canvas-lms-announcement">
            <header>
              <i
                style={{ '--gp-canvas-course': announcement.color } as CSSProperties}
                aria-hidden
              />
              <span>{announcement.courseName}</span>
              <time dateTime={announcement.postedAt ?? undefined}>{compactDay(announcement.postedAt)}</time>
            </header>
            {externalTitleLink(announcement.title, announcement.url)}
            {announcement.excerpt && <p>{announcement.excerpt}</p>}
          </article>
        ))}
      </div>
    )
  }

  const scoredCourses = feed.courses.filter((course) => course.score !== null).length
  return (
    <div className="gp-canvas-lms-body gp-canvas-lms-overview" data-canvas-lms-skin="overview">
      <div className="gp-canvas-lms-stats">
        <span><strong>{feed.courses.length}</strong><small>Courses</small></span>
        <span><strong>{activeItems.length}</strong><small>To do</small></span>
        <span><strong>{scoredCourses}</strong><small>Grades</small></span>
      </div>
      <section>
        <header><Clock3 size={12} aria-hidden /> Up next</header>
        {activeItems.length === 0 ? (
          <EmptyCanvasState
            icon={<CircleCheck size={19} aria-hidden />}
            title="You’re caught up"
            detail="No incomplete planner items are currently visible."
          />
        ) : activeItems.slice(0, 4).map((item) => <AssignmentRow key={item.id} item={item} />)}
      </section>
      {feed.courses.length > 0 && (
        <div className="gp-canvas-lms-course-strip" aria-label="Active courses">
          {feed.courses.slice(0, 8).map((course) => (
            <span key={course.id}>
              <CourseMark course={course} />
              {course.code || course.name}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export function CanvasLmsWidget({ data }: CanvasLmsWidgetProps) {
  const initialStatus = canvasLmsConnectionStatus()
  const [status, setStatus] = useState(initialStatus)
  const [origin, setOrigin] = useState(initialStatus?.origin ?? '')
  const [token, setToken] = useState('')
  const [feed, setFeed] = useState<CanvasLmsFeed | null>(null)
  const [loading, setLoading] = useState(Boolean(initialStatus))
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    if (!status) return
    const controller = new AbortController()
    setLoading(true)
    setError('')
    void loadCanvasLmsFeed(controller.signal)
      .then(setFeed)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : 'Could not read Canvas.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [status, revision])

  const connect = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const nextFeed = await connectCanvasLms(origin, token)
      const nextStatus = canvasLmsConnectionStatus()
      setFeed(nextFeed)
      setStatus(nextStatus)
      setOrigin(nextStatus?.origin ?? origin)
      setToken('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not connect Canvas.')
    } finally {
      setLoading(false)
    }
  }

  const disconnect = () => {
    disconnectCanvasLms()
    setStatus(null)
    setFeed(null)
    setError('')
    setToken('')
  }

  return (
    <div className="gp-canvas-lms" data-canvas-lms-skin={canvasLmsSkin(data.skin)}>
      {status ? (
        <>
          <header className="gp-canvas-lms-header">
            <span>
              <GraduationCap size={15} aria-hidden />
              <span><strong>{status.host}</strong><small>Private Canvas connection</small></span>
            </span>
            <span>
              <button
                type="button"
                aria-label="Refresh Canvas"
                disabled={loading}
                onClick={() => setRevision((value) => value + 1)}
              >
                <RefreshCw size={12} className={loading ? 'gp-spin' : undefined} aria-hidden />
              </button>
              <button type="button" aria-label="Disconnect Canvas" onClick={disconnect}>
                <Unplug size={12} aria-hidden />
              </button>
            </span>
          </header>
          {error && <p className="gp-canvas-lms-error" role="status">{error}</p>}
          {loading && !feed ? (
            <div className="gp-canvas-lms-loading">
              <LoaderCircle size={22} className="gp-spin" aria-hidden />
              <strong>Reading your courses</strong>
            </div>
          ) : feed ? (
            <CanvasLmsBody skin={canvasLmsSkin(data.skin)} feed={feed} />
          ) : (
            <EmptyCanvasState
              icon={<GraduationCap size={22} aria-hidden />}
              title="Canvas is connected"
              detail="Refresh to try loading your courses again."
            />
          )}
        </>
      ) : (
        <form className="gp-canvas-lms-connect" onSubmit={(event) => { void connect(event) }}>
          <span className="gp-canvas-lms-mark" aria-hidden><GraduationCap size={24} /></span>
          <div>
            <h3>Connect your college Canvas</h3>
            <p>Use your school’s Canvas address and a personal access token.</p>
          </div>
          <label className="gp-canvas-lms-field gp-bare-field">
            <span>Canvas address</span>
            <input
              type="url"
              inputMode="url"
              required
              value={origin}
              placeholder="https://school.instructure.com"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              onChange={(event) => setOrigin(event.target.value)}
            />
          </label>
          <label className="gp-canvas-lms-field gp-bare-field">
            <span>Personal access token</span>
            <input
              type="password"
              required
              minLength={10}
              value={token}
              placeholder="Paste token"
              autoComplete="off"
              onChange={(event) => setToken(event.target.value)}
            />
          </label>
          <p className="gp-canvas-lms-help">
            In Canvas, open Account → Settings → Approved Integrations → New Access Token.
          </p>
          {error && <p className="gp-canvas-lms-error" role="status">{error}</p>}
          <button className="gp-canvas-lms-connect-button" type="submit" disabled={loading}>
            {loading ? <LoaderCircle size={12} className="gp-spin" aria-hidden /> : <GraduationCap size={12} aria-hidden />}
            {loading ? 'Checking…' : 'Connect Canvas'}
          </button>
          <p className="gp-canvas-lms-private">
            Your token and student details stay on this device. They are never saved in the board or shared with collaborators.
          </p>
        </form>
      )}
    </div>
  )
}
