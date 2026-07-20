import { memo, type CSSProperties } from 'react'
import type { Vector2D, WidgetBadge } from '../../types/spatial'
import { widgetDefinition } from '../../widgets/registry'
import {
  PrimitiveWidgetFlag,
  hasPrimitiveFlag,
  type PrimitivePreviewRow,
  type PrimitiveWidget,
} from '../../widgets/primitiveWidget'

interface PrimitiveWidgetCardProps {
  widget: PrimitiveWidget
  selected: boolean
  blocked: boolean
  grouped: boolean
  groupColor?: string
  ghostOffset?: Vector2D
  settlePending?: boolean
  focusBackground?: boolean
}

function PrimitiveBadge({ badge }: { badge: WidgetBadge }) {
  switch (badge.type) {
    case 'status_dot':
      return <span className={`gp-primitive-badge-dot gp-primitive-badge-dot-${badge.color}`} />
    case 'priority_flag':
      return <span className="gp-primitive-badge">{badge.level}</span>
    case 'assignee_avatars':
      return <span className="gp-primitive-badge">{badge.initials.slice(0, 3).join(' · ')}</span>
    case 'deadline_countdown':
      return <span className="gp-primitive-badge">{badge.dueDate}</span>
    case 'tag_pill':
      return <span className="gp-primitive-badge">{badge.tags.slice(0, 3).map((tag) => tag.label).join(' · ')}</span>
  }
}

function PrimitiveRows({ rows, bars = false }: { rows: readonly PrimitivePreviewRow[]; bars?: boolean }) {
  const max = bars
    ? Math.max(1, ...rows.map((row) => row.ratio ?? (Number(row.value) || 0)))
    : 1
  return (
    <div className="gp-primitive-rows">
      {rows.map((row, index) => {
        const ratio = row.ratio ?? (Number(row.value) || 0)
        return (
          <div
            className={`gp-primitive-row ${row.done ? 'gp-primitive-row-done' : ''}`}
            key={`${row.label}-${index}`}
          >
            {bars && (
              <span
                aria-hidden
                className="gp-primitive-row-bar"
                style={{
                  width: `${Math.max(3, Math.min(100, (ratio / max) * 100))}%`,
                  backgroundColor: row.color,
                }}
              />
            )}
            {!bars && <span aria-hidden className="gp-primitive-row-mark" />}
            <span className="gp-primitive-row-label">{row.label}</span>
            {row.value && <span className="gp-primitive-row-value">{row.value}</span>}
          </div>
        )
      })}
    </div>
  )
}

function PrimitivePreview({ widget }: { widget: PrimitiveWidget }) {
  const visual = widget.visual
  if (visual.kind === 'text') {
    return (
      <div className="gp-primitive-text-wrap">
        {visual.secondary && <span className="gp-primitive-kicker">{visual.secondary}</span>}
        <p className="gp-primitive-text">{visual.primary || 'No content yet'}</p>
      </div>
    )
  }
  if (visual.kind === 'palette') {
    return (
      <div className="gp-primitive-palette">
        {visual.colors?.map((color, index) => (
          <span key={`${color}-${index}`} style={{ backgroundColor: color }} />
        ))}
      </div>
    )
  }
  if (visual.kind === 'media') {
    return (
      <div className="gp-primitive-media">
        {visual.mediaUrl && <img alt="" draggable={false} loading="lazy" src={visual.mediaUrl} />}
        {visual.primary && <span>{visual.primary}</span>}
      </div>
    )
  }
  if (visual.kind === 'table') {
    return (
      <div className="gp-primitive-table">
        {visual.rows.map((row, index) => (
          <div className={index === 0 ? 'gp-primitive-table-head' : ''} key={`${row.label}-${index}`}>
            {row.label}
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className="gp-primitive-stack">
      {(visual.primary || visual.secondary) && (
        <div className="gp-primitive-summary">
          {visual.primary && <span>{visual.primary}</span>}
          {visual.secondary && <strong>{visual.secondary}</strong>}
        </div>
      )}
      {visual.progress !== undefined && (
        <div aria-hidden className="gp-primitive-progress">
          <span style={{ width: `${visual.progress * 100}%` }} />
        </div>
      )}
      <PrimitiveRows rows={visual.rows} bars={visual.kind === 'bars'} />
    </div>
  )
}

/**
 * Passive cards preserve canvas identity and visible information while
 * deliberately owning no hooks, observers, controls, timers, or store
 * subscriptions. A single delegated WidgetLayer listener promotes one to the
 * existing rich WidgetCard before interaction.
 */
export const PrimitiveWidgetCard = memo(function PrimitiveWidgetCard({
  widget,
  selected,
  blocked,
  grouped,
  groupColor,
  ghostOffset,
  settlePending,
  focusBackground,
}: PrimitiveWidgetCardProps) {
  const definition = widgetDefinition(widget.type)
  const Icon = definition.icon
  const collapsed = hasPrimitiveFlag(widget, PrimitiveWidgetFlag.Collapsed)
  const iconified = hasPrimitiveFlag(widget, PrimitiveWidgetFlag.Iconified)
  const locked = hasPrimitiveFlag(widget, PrimitiveWidgetFlag.Locked)
  const completed = hasPrimitiveFlag(widget, PrimitiveWidgetFlag.Completed)
  const hydrating = hasPrimitiveFlag(widget, PrimitiveWidgetFlag.Hydrating)
  const radius = collapsed ? 18 : iconified ? 14 : 22

  return (
    <div
      data-widget-id={widget.id}
      data-primitive-widget-id={widget.id}
      data-ghost-displaced={ghostOffset ? true : undefined}
      data-settle-pending={settlePending || undefined}
      className="gp-widget-layout-motion group/widget-shell absolute left-0 top-0"
      style={{
        transform: `translate3d(${widget.x + (ghostOffset?.x ?? 0)}px, ${widget.y + (ghostOffset?.y ?? 0)}px, 0)`,
        width: widget.width,
        height: widget.height,
        zIndex: widget.zIndex,
      }}
    >
      <article
        data-widget-id={widget.id}
        data-primitive-widget-id={widget.id}
        data-selected={selected || undefined}
        data-locked={locked || undefined}
        data-blocked={blocked || undefined}
        data-grouped={grouped || undefined}
        data-passive-widget
        tabIndex={selected ? 0 : -1}
        inert={focusBackground ? true : undefined}
        aria-hidden={focusBackground || undefined}
        aria-label={`${widget.title}, ${definition.label} widget`}
        title={iconified ? widget.title : undefined}
        className={`gp-widget-card gp-card-motion group/widget absolute inset-0 flex flex-col ${
          grouped ? 'gp-island gp-grouped-widget' : 'gp-glass gp-backplate'
        } ${completed ? 'opacity-55 saturate-50' : ''}`}
        style={{
          borderRadius: radius,
          cursor: locked ? 'default' : 'grab',
          '--gp-widget-accent': widget.accent,
          '--gp-widget-radius': `${radius}px`,
          contain: 'layout style paint',
          ...(groupColor ? { '--gp-group-color': groupColor } : {}),
        } as CSSProperties}
      >
        {!collapsed && !iconified && (
          <div aria-hidden className="gp-card-chrome pointer-events-none absolute bottom-full left-0 right-0 z-20 h-10">
            <div className="gp-primitive-title flex h-10 items-center">
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px]"
                style={{
                  color: widget.accent,
                  background: `${widget.accent}1c`,
                  boxShadow: `inset 0 0 0 1px ${widget.accent}30`,
                }}
              >
                <Icon size={14} aria-hidden />
              </span>
              <span className="truncate text-xs font-bold text-neutral-200">{widget.title}</span>
            </div>
          </div>
        )}

        {widget.badges.length > 0 && !collapsed && !iconified && (
          <div aria-label="Triage badges" className="gp-primitive-badges">
            {widget.badges.slice(0, 4).map((badge, index) => (
              <PrimitiveBadge badge={badge} key={`${badge.type}-${index}`} />
            ))}
          </div>
        )}

        {collapsed && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-1.5 px-4">
            <Icon size={12} className="shrink-0" style={{ color: widget.accent }} aria-hidden />
            <span className="truncate text-xs font-medium text-neutral-200">{widget.title}</span>
          </div>
        )}
        {iconified && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <Icon size={28} style={{ color: widget.accent }} aria-hidden />
          </div>
        )}

        {!collapsed && !iconified && (
          <div className="gp-widget-content gp-primitive-content flex-1 overflow-hidden rounded-[20px]">
            <PrimitivePreview widget={widget} />
          </div>
        )}

        {blocked && (
          <div aria-label={`${widget.title} is blocked`} className="gp-primitive-blocked">
            <span aria-hidden />
            Blocked
          </div>
        )}
        {hydrating && <div aria-label="AI digesting details" className="gp-primitive-hydrating" />}
      </article>
    </div>
  )
})
