import { Plus, X } from 'lucide-react'
import type { GpaData } from '../../../types/spatial'
import {
  clampGradeNumber,
  computeGpa,
  gradeTone,
} from './gradeSkinModel'

interface GpaWidgetProps {
  data: GpaData
  onChange: (data: GpaData) => void
}

function readNumber(raw: string): number {
  const value = Number.parseFloat(raw)
  return Number.isFinite(value) ? value : 0
}

export function GpaWidget({ data, onChange }: GpaWidgetProps) {
  const gpa = computeGpa(data.courses)
  const totalCredits = data.courses.reduce(
    (sum, course) => sum + clampGradeNumber(course.credits, 0, 99),
    0,
  )
  const setCourse = (id: string, patch: Partial<GpaData['courses'][number]>) => {
    onChange({
      courses: data.courses.map((course) => (
        course.id === id ? { ...course, ...patch } : course
      )),
    })
  }
  const removeCourse = (id: string) => {
    onChange({ courses: data.courses.filter((course) => course.id !== id) })
  }
  const addCourse = () => {
    onChange({
      courses: [
        ...data.courses,
        { id: crypto.randomUUID(), name: '', credits: 3, points: 4 },
      ],
    })
  }

  return (
    <div className="gp-grades gp-grades--gpa">
      <section className="gp-gpa-hero" data-tone={gradeTone(gpa * 25)}>
        <div>
          <span>Cumulative GPA</span>
          <output>{gpa.toFixed(2)}</output>
          <p>{totalCredits.toFixed(0)} credits across {data.courses.length} courses</p>
        </div>
        <div className="gp-gpa-scale" aria-label={`${gpa.toFixed(2)} out of 4.3`}>
          {[1, 2, 3, 4].map((mark) => (
            <i key={mark} data-filled={gpa >= mark || undefined}><span>{mark}</span></i>
          ))}
        </div>
      </section>
      <div className="gp-gpa-table-head" aria-hidden>
        <span>Course</span><span>Credits</span><span>Points</span><span />
      </div>
      <div className="gp-gpa-list">
        {data.courses.length === 0 ? (
          <div className="gp-grades-empty">Add your first course to calculate a GPA.</div>
        ) : data.courses.map((course) => (
          <div className="gp-gpa-row" key={course.id}>
            <label className="gp-gpa-name gp-bare-field">
              <span className="sr-only">Course name</span>
              <input
                value={course.name}
                placeholder="Course…"
                aria-label="Course name"
                maxLength={80}
                onChange={(event) => setCourse(course.id, { name: event.target.value })}
              />
            </label>
            <label className="gp-gpa-number gp-bare-field">
              <span className="sr-only">{course.name || 'Course'} credits</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                max={99}
                value={course.credits}
                aria-label={`${course.name || 'Course'} credits`}
                onChange={(event) => setCourse(course.id, {
                  credits: clampGradeNumber(readNumber(event.target.value), 0, 99),
                })}
              />
            </label>
            <label className="gp-gpa-number gp-bare-field">
              <span className="sr-only">{course.name || 'Course'} grade points</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                max={4.3}
                step={0.1}
                value={course.points}
                aria-label={`${course.name || 'Course'} grade points`}
                onChange={(event) => setCourse(course.id, {
                  points: clampGradeNumber(readNumber(event.target.value), 0, 4.3),
                })}
              />
            </label>
            <button
              type="button"
              className="gp-grade-remove"
              aria-label={`Remove ${course.name || 'course'}`}
              onClick={() => removeCourse(course.id)}
            >
              <X size={12} aria-hidden />
            </button>
          </div>
        ))}
      </div>
      <footer className="gp-grades-footer">
        <button type="button" className="gp-grades-add" onClick={addCourse}>
          <Plus size={12} aria-hidden />
          Add course
        </button>
        <span>{totalCredits.toFixed(0)} credits</span>
      </footer>
    </div>
  )
}
