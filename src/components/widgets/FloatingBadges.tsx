import { useWidgetStore } from '../../store/useWidgetStore'
import type { PriorityLevel, StatusDotColor, WidgetBadge } from '../../types/spatial'

interface FloatingBadgesProps {
  widgetId: string
}

function statusDotClass(color: StatusDotColor): string {
  switch (color) {
    case 'red':
      return 'bg-red-500 shadow-[0_0_6px_2px_rgba(239,68,68,0.45)]'
    case 'yellow':
      return 'bg-yellow-400 shadow-[0_0_6px_2px_rgba(250,204,21,0.45)]'
    case 'green':
      return 'bg-emerald-400 shadow-[0_0_6px_2px_rgba(52,211,153,0.45)]'
  }
}

function priorityLabel(level: PriorityLevel): string {
  switch (level) {
    case 'low':
      return 'Low'
    case 'medium':
      return 'Med'
    case 'high':
      return 'High'
    case 'critical':
      return 'Crit'
  }
}

function priorityClass(level: PriorityLevel): string {
  switch (level) {
    case 'low':
      return 'bg-blue-500/10 text-blue-400 border-blue-500/20'
    case 'medium':
      return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
    case 'high':
      return 'bg-orange-500/10 text-orange-400 border-orange-500/20'
    case 'critical':
      return 'bg-red-500/10 text-red-400 border-red-500/20'
  }
}

function avatarColor(initial: string): string {
  const palette = ['#6366f1', '#8b5cf6', '#ec4899', '#f97316', '#eab308', '#22c55e', '#06b6d4']
  const code = initial.charCodeAt(0)
  return palette[Number.isNaN(code) ? 0 : code % palette.length] ?? '#6366f1'
}

function daysUntil(isoDate: string): number {
  return Math.ceil((new Date(isoDate).getTime() - Date.now()) / 86_400_000)
}

function BadgePill({ badge }: { badge: WidgetBadge }) {
  switch (badge.type) {
    case 'status_dot':
      return (
        <span
          aria-label={`Status: ${badge.color}`}
          className={`h-2.5 w-2.5 rounded-full ${statusDotClass(badge.color)}`}
        />
      )

    case 'priority_flag':
      return (
        <span
          className={`rounded border px-1.5 py-px font-mono text-[9px] font-bold uppercase tracking-wide ${priorityClass(badge.level)}`}
        >
          {priorityLabel(badge.level)}
        </span>
      )

    case 'assignee_avatars':
      return (
        <span className="flex -space-x-1">
          {badge.initials.slice(0, 3).map((initial, i) => (
            <span
              key={i}
              title={initial}
              style={{ backgroundColor: avatarColor(initial) }}
              className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-neutral-900 font-mono text-[8px] font-bold text-white"
            >
              {initial.charAt(0).toUpperCase()}
            </span>
          ))}
          {badge.initials.length > 3 && (
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-neutral-900 bg-neutral-700 font-mono text-[8px] text-neutral-400">
              +{badge.initials.length - 3}
            </span>
          )}
        </span>
      )

    case 'deadline_countdown': {
      const days = daysUntil(badge.dueDate)
      const isOverdue = days < 0
      return (
        <span
          className={`rounded px-1.5 py-px font-mono text-[9px] font-medium ${
            isOverdue
              ? 'bg-red-500/15 text-red-400'
              : days <= 3
                ? 'bg-orange-500/10 text-orange-400'
                : 'bg-neutral-800 text-neutral-400'
          }`}
        >
          {isOverdue ? `${Math.abs(days)}d overdue` : `${days}d left`}
        </span>
      )
    }

    case 'tag_pill':
      return (
        <span className="flex items-center gap-0.5">
          {badge.tags.slice(0, 4).map((tag, i) => (
            <span
              key={i}
              style={{ backgroundColor: tag.color + '1f', color: tag.color }}
              className="rounded-full px-1.5 py-px text-[9px] font-medium"
            >
              {tag.label}
            </span>
          ))}
        </span>
      )
  }
}

const EMPTY_BADGES: WidgetBadge[] = []

/**
 * Non-layout badge tray: absolutely positioned above the card top border so
 * the card's flex column is never thickened. Only mounts when there's at
 * least one manual badge.
 */
export function FloatingBadges({ widgetId }: FloatingBadgesProps) {
  const badges = useWidgetStore((state) => state.widgets[widgetId]?.metadata.badges ?? EMPTY_BADGES)

  if (badges.length === 0) return null

  return (
    <div
      role="region"
      aria-label="Triage badges"
      className="pointer-events-none absolute -top-3 left-2 right-2 z-10 flex items-center gap-1"
    >
      {badges.map((badge, i) => (
        <BadgePill key={`${badge.type}-${i}`} badge={badge} />
      ))}
    </div>
  )
}
