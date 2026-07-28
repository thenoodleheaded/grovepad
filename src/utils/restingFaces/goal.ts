import {
  clampFraction,
  compact,
  finite,
  formatRestNumber,
  record,
  REST_BAR_LIMIT,
  REST_ROW_LIMIT,
  type RestingFaceModel,
} from '../restingFaceModel'

// ---------------------------------------------------------------------------
// Goal resting faces.
//
// A Goal card is four different instruments behind one name — a percentage
// bar, a milestone list, an hours ledger, and an OKR sheet — and each folds to
// its own reading. The catalogue skins on top of these (Thermometer, Burn-up,
// Score Ring, and the rest) wear the milestone body under a presentation
// dress, so they fold to the milestone face plus their own name; the catalogue
// dress in `catalogue.ts` adds that, and nothing here pretends otherwise.
// ---------------------------------------------------------------------------

interface Milestone {
  id: string
  label: string
  done: boolean
}

function milestones(raw: unknown): Milestone[] {
  if (!Array.isArray(raw)) return []
  const result: Milestone[] = []
  for (const item of raw) {
    const entry = record(item)
    if (!entry) continue
    result.push({
      id: typeof entry.id === 'string' ? entry.id : `milestone-${result.length}`,
      label: typeof entry.label === 'string' ? entry.label : '',
      done: entry.done === true,
    })
  }
  return result
}

/**
 * A bare Progress card is the same instrument as a Goal wearing Simple, so it
 * folds the same way. Without this it fell through to the generic ladder,
 * which has no key named `percent` and rested a filled card as a bare icon.
 */
export function progressRestingFace(data: Record<string, unknown>): RestingFaceModel | null {
  const percent = finite(data.percent)
  if (percent === null) return null
  const rounded = Math.round(clampFraction(percent / 100) * 100)
  const label = typeof data.label === 'string' && data.label.trim() ? data.label.trim() : 'Progress'
  return {
    kind: 'gauge',
    progress: rounded / 100,
    primary: `${rounded}%`,
    secondary: compact(label, 22),
    tone: rounded >= 100 ? 'good' : 'accent',
  }
}

export function goalRestingFace(data: Record<string, unknown>): RestingFaceModel | null {
  const mode = typeof data.mode === 'string' ? data.mode : 'milestones'
  const goal = typeof data.goal === 'string' ? data.goal.trim() : ''

  if (mode === 'simple') {
    const simple = record(data.simple) ?? {}
    const percent = Math.round(clampFraction((finite(simple.percent) ?? 0) / 100) * 100)
    const label = typeof simple.label === 'string' && simple.label.trim()
      ? simple.label.trim()
      : goal || 'Progress'
    return {
      kind: 'gauge',
      progress: percent / 100,
      primary: `${percent}%`,
      secondary: compact(label, 22),
      tone: percent >= 100 ? 'good' : 'accent',
    }
  }

  if (mode === 'hours') {
    const hours = record(data.hours) ?? {}
    const target = Math.max(0, finite(hours.targetHours) ?? 0)
    const logged = Math.max(0, finite(hours.loggedHours) ?? 0)
    const subject = typeof hours.subject === 'string' && hours.subject.trim()
      ? hours.subject.trim()
      : goal || 'Study'
    return {
      kind: 'gauge',
      progress: target > 0 ? clampFraction(logged / target) : 0,
      primary: `${formatRestNumber(logged)}h`,
      secondary: compact(subject, 20),
      caption: target > 0 ? `of ${formatRestNumber(target)}h` : 'No target yet',
      tone: target > 0 && logged >= target ? 'good' : 'accent',
    }
  }

  if (mode === 'okr') {
    const okr = record(data.okr) ?? {}
    const keyResults = Array.isArray(okr.keyResults) ? okr.keyResults : []
    const bars = keyResults
      .map((item, index) => {
        const entry = record(item)
        if (!entry) return null
        const current = finite(entry.current) ?? 0
        const target = finite(entry.target) ?? 0
        return {
          key: typeof entry.id === 'string' ? entry.id : `kr-${index}`,
          label: compact(typeof entry.label === 'string' && entry.label.trim() ? entry.label : 'Key result', 20),
          value: target > 0
            ? `${Math.round(clampFraction(current / target) * 100)}%`
            : formatRestNumber(current),
          fraction: target > 0 ? clampFraction(current / target) : 0,
        }
      })
      .filter((bar): bar is NonNullable<typeof bar> => bar !== null)
      .slice(0, REST_BAR_LIMIT)
    const objective = typeof okr.objective === 'string' && okr.objective.trim()
      ? okr.objective.trim()
      : goal
    if (bars.length === 0) return objective ? { kind: 'text', text: compact(objective, 120) } : null
    return {
      kind: 'bars',
      eyebrow: { label: 'Objective', note: compact(objective, 20) || undefined },
      bars,
    }
  }

  // milestones — and every catalogue skin that wears the same body. Those
  // skins get NO eyebrow here on purpose: the catalogue dress fills it with
  // the skin's own name, which is the only thing telling a folded Thermometer
  // from a folded Burn-up. A card actually in milestones mode names its goal.
  const steps = milestones(data.milestones).filter((step) => step.label.trim())
  if (steps.length === 0) return goal ? { kind: 'text', text: compact(goal, 120) } : null
  const done = steps.filter((step) => step.done).length
  const visible = steps.slice(0, REST_ROW_LIMIT)
  const named = mode === 'milestones' || mode === undefined
  return {
    kind: 'rows',
    ...(named
      ? { eyebrow: { label: compact(goal || 'Goal', 20), note: `${done}/${steps.length}` } }
      : {}),
    meter: done / steps.length,
    rows: visible.map((step) => ({
      key: step.id,
      label: compact(step.label, 30),
      done: step.done,
    })),
    overflow: Math.max(0, steps.length - visible.length),
  }
}
