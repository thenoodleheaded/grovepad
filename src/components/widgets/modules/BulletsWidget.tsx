import {
  ArrowDownUp,
  ChevronDown,
  ChevronRight,
  Clock3,
  Hash,
  IndentDecrease,
  IndentIncrease,
  List,
  ListOrdered,
  Plus,
  X,
} from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import type { BulletItem, BulletsData, ModuleData } from '../../../types/spatial'
import { dataWithSkinState, skinStateFor } from '../../../utils/widgetSkins'
import { WidgetPanel } from '../WidgetPanel'
import { withoutPanelItem } from '../panelRemoval'
import {
  bulletLogState,
  bulletOutlineState,
  bulletSkin,
  orderedLogItems,
  visibleOutlineItems,
  type BulletLogState,
  type BulletOutlineState,
  type BulletSkin,
} from './bulletSkinModel'

interface BulletsWidgetProps {
  data: BulletsData
  onChange: (data: BulletsData) => void
  onHeightChange?: (height: number) => void
  skin?: BulletSkin
}

function logTime(value: string | undefined): string {
  if (!value) return 'Earlier'
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime())) return 'Earlier'
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed)
}

export function BulletsWidget({
  data,
  onChange,
  onHeightChange,
  skin: requestedSkin,
}: BulletsWidgetProps) {
  const inputRefs = useRef(new Map<string, HTMLInputElement>())
  const pendingFocusId = useRef<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const [removingIds, setRemovingIds] = useState<ReadonlySet<string>>(new Set())
  const skin = requestedSkin ?? bulletSkin(data.skin)
  const outlineState = bulletOutlineState(skinStateFor(data, 'nested_outline'), data.items)
  const logState = bulletLogState(skinStateFor(data, 'rolling_log'), data.items)

  useEffect(() => {
    if (pendingFocusId.current === null) return
    inputRefs.current.get(pendingFocusId.current)?.focus()
    pendingFocusId.current = null
  })

  useLayoutEffect(() => {
    if (rootRef.current) onHeightChange?.(rootRef.current.scrollHeight)
  }, [data, onHeightChange, removingIds, skin])

  const baseData = (items: BulletItem[] = data.items): BulletsData => ({
    ...data,
    items,
    skin,
  })

  const updateOutline = (state: BulletOutlineState, items = data.items) => {
    onChange(dataWithSkinState(
      baseData(items) as ModuleData,
      'nested_outline',
      { ...state },
    ) as BulletsData)
  }

  const updateLog = (state: BulletLogState, items = data.items) => {
    onChange(dataWithSkinState(
      baseData(items) as ModuleData,
      'rolling_log',
      { ...state },
    ) as BulletsData)
  }

  const setItem = (id: string, text: string) => {
    const items = data.items.map((item) => item.id === id ? { ...item, text } : item)
    if (skin === 'rolling_log' && !logState.timestamps[id]) {
      updateLog({
        ...logState,
        timestamps: { ...logState.timestamps, [id]: new Date().toISOString() },
      }, items)
      return
    }
    onChange(baseData(items))
  }

  const beginRemove = (id: string) => {
    setRemovingIds((previous) => new Set(previous).add(id))
  }

  const finishRemove = (id: string) => {
    setRemovingIds((previous) => {
      if (!previous.has(id)) return previous
      const next = new Set(previous)
      next.delete(id)
      return next
    })
    const items = withoutPanelItem(data.items, id)
    if (skin === 'nested_outline') {
      const levels = { ...outlineState.levels }
      delete levels[id]
      updateOutline({
        levels,
        collapsedIds: outlineState.collapsedIds.filter((collapsedId) => collapsedId !== id),
      }, items)
      return
    }
    if (skin === 'rolling_log') {
      const timestamps = { ...logState.timestamps }
      delete timestamps[id]
      updateLog({ ...logState, timestamps }, items)
      return
    }
    onChange(baseData(items))
  }

  const insertAfter = (index: number) => {
    const item = { id: crypto.randomUUID(), text: '' }
    const items = [...data.items]
    items.splice(index + 1, 0, item)
    pendingFocusId.current = item.id
    if (skin === 'nested_outline') {
      const source = data.items[index]
      const inheritedLevel = source ? outlineState.levels[source.id] ?? 0 : 0
      updateOutline({
        ...outlineState,
        levels: inheritedLevel > 0
          ? { ...outlineState.levels, [item.id]: inheritedLevel }
          : outlineState.levels,
      }, items)
      return
    }
    if (skin === 'rolling_log') {
      updateLog({
        ...logState,
        timestamps: { ...logState.timestamps, [item.id]: new Date().toISOString() },
      }, items)
      return
    }
    onChange(baseData(items))
  }

  const onItemKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
    item: BulletItem,
  ) => {
    const index = data.items.findIndex((candidate) => candidate.id === item.id)
    if (index < 0) return
    if (event.key === 'Enter') {
      event.preventDefault()
      insertAfter(index)
    } else if (
      event.key === 'Backspace' &&
      item.text === '' &&
      data.items.length > 1
    ) {
      event.preventDefault()
      const neighbor = data.items[index - 1] ?? data.items[index + 1]
      if (neighbor) pendingFocusId.current = neighbor.id
      beginRemove(item.id)
    }
  }

  const input = (item: BulletItem, placeholder: string) => (
    <input
      data-floor-overflow="scroll"
      ref={(element) => {
        if (element) inputRefs.current.set(item.id, element)
        else inputRefs.current.delete(item.id)
      }}
      value={item.text}
      placeholder={placeholder}
      onChange={(event) => setItem(item.id, event.target.value)}
      onKeyDown={(event) => onItemKeyDown(event, item)}
      className="gp-bullet-input"
    />
  )

  const remove = (item: BulletItem) => data.items.length > 1 && (
    <button
      type="button"
      aria-label={`Remove ${item.text.trim() || 'empty bullet'}`}
      onClick={() => beginRemove(item.id)}
      className="gp-bullet-remove"
    >
      <X size={11} aria-hidden />
    </button>
  )

  const row = (
    item: BulletItem,
    marker: React.ReactNode,
    className = '',
    placeholder = 'List item  ↵ adds another',
  ) => (
    <WidgetPanel
      key={item.id}
      removing={removingIds.has(item.id)}
      onExitComplete={() => finishRemove(item.id)}
      floor="controls"
      grip={false}
      className={`gp-bullet-row ${className}`}
    >
      {marker}
      {input(item, placeholder)}
      {remove(item)}
    </WidgetPanel>
  )

  const addLabel = skin === 'rolling_log'
    ? 'Add log entry'
    : skin === 'compact_chips'
      ? 'Add chip'
      : 'Add bullet'

  let content: React.ReactNode

  if (skin === 'numbered') {
    content = (
      <div className="gp-bullets-list gp-bullets-numbered">
        <header className="gp-bullets-heading">
          <span><ListOrdered size={13} aria-hidden /> Sequence</span>
          <small>{data.items.length}</small>
        </header>
        <div className="gp-bullets-ledger">
          {data.items.map((item, index) => row(
            item,
            <span className="gp-bullet-number" aria-hidden>{String(index + 1).padStart(2, '0')}</span>,
          ))}
        </div>
      </div>
    )
  } else if (skin === 'compact_chips') {
    content = (
      <div className="gp-bullets-list gp-bullets-chips">
        <header className="gp-bullets-heading">
          <span><Hash size={13} aria-hidden /> Quick tags</span>
          <small>{data.items.length}</small>
        </header>
        <div className="gp-bullet-chip-cloud">
          {data.items.map((item) => row(
            item,
            <span className="gp-bullet-chip-dot" aria-hidden />,
            'gp-bullet-chip',
            'Short label',
          ))}
        </div>
      </div>
    )
  } else if (skin === 'two_column') {
    content = (
      <div className="gp-bullets-list gp-bullets-columns">
        <header className="gp-bullets-heading">
          <span><List size={13} aria-hidden /> Balanced list</span>
          <small>{data.items.length} points</small>
        </header>
        <div className="gp-bullet-column-grid">
          {data.items.map((item, index) => row(
            item,
            <span className="gp-bullet-column-number" aria-hidden>{index + 1}</span>,
          ))}
        </div>
      </div>
    )
  } else if (skin === 'nested_outline') {
    const visible = visibleOutlineItems(data.items, outlineState)
    const adjustLevel = (index: number, delta: -1 | 1) => {
      const item = data.items[index]
      if (!item) return
      const current = outlineState.levels[item.id] ?? 0
      const previous = data.items[index - 1]
      const previousLevel = previous ? outlineState.levels[previous.id] ?? 0 : 0
      const nextLevel = delta === 1
        ? Math.min(3, previousLevel + 1, current + 1)
        : Math.max(0, current - 1)
      const levels = { ...outlineState.levels }
      if (nextLevel === 0) delete levels[item.id]
      else levels[item.id] = nextLevel
      updateOutline({ ...outlineState, levels })
    }
    const toggleCollapsed = (id: string) => {
      const collapsed = new Set(outlineState.collapsedIds)
      if (collapsed.has(id)) collapsed.delete(id)
      else collapsed.add(id)
      updateOutline({ ...outlineState, collapsedIds: [...collapsed] })
    }
    content = (
      <div className="gp-bullets-list gp-bullets-outline">
        <header className="gp-bullets-heading">
          <span><List size={13} aria-hidden /> Outline</span>
          <small>{visible.length}/{data.items.length} visible</small>
        </header>
        <div className="gp-bullets-ledger">
          {visible.map(({ item, index, level, hasChildren, collapsed }) => (
            <WidgetPanel
              key={item.id}
              removing={removingIds.has(item.id)}
              onExitComplete={() => finishRemove(item.id)}
              floor="controls"
              grip={false}
              className="gp-bullet-row gp-bullet-outline-row"
              style={{ '--gp-bullet-level': level } as CSSProperties}
            >
              {hasChildren ? (
                <button
                  type="button"
                  className="gp-bullet-disclosure"
                  aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${item.text || 'outline item'}`}
                  aria-expanded={!collapsed}
                  onClick={() => toggleCollapsed(item.id)}
                >
                  {collapsed
                    ? <ChevronRight size={12} aria-hidden />
                    : <ChevronDown size={12} aria-hidden />}
                </button>
              ) : (
                <span className="gp-bullet-outline-dot" aria-hidden />
              )}
              {input(item, 'Outline point  ↵ adds a sibling')}
              <span className="gp-bullet-indent-controls">
                <button
                  type="button"
                  aria-label={`Outdent ${item.text || 'outline item'}`}
                  disabled={level === 0}
                  onClick={() => adjustLevel(index, -1)}
                >
                  <IndentDecrease size={11} aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={`Indent ${item.text || 'outline item'}`}
                  disabled={index === 0 || level >= 3}
                  onClick={() => adjustLevel(index, 1)}
                >
                  <IndentIncrease size={11} aria-hidden />
                </button>
              </span>
              {remove(item)}
            </WidgetPanel>
          ))}
        </div>
      </div>
    )
  } else if (skin === 'rolling_log') {
    const ordered = orderedLogItems(data.items, logState)
    content = (
      <div className="gp-bullets-list gp-bullets-log">
        <header className="gp-bullets-log-heading">
          <span><Clock3 size={13} aria-hidden /> Rolling log</span>
          <button
            type="button"
            aria-label={`Show ${logState.order === 'newest' ? 'oldest' : 'newest'} entries first`}
            onClick={() => updateLog({
              ...logState,
              order: logState.order === 'newest' ? 'oldest' : 'newest',
            })}
          >
            <ArrowDownUp size={11} aria-hidden />
            {logState.order === 'newest' ? 'Newest' : 'Oldest'}
          </button>
        </header>
        <div className="gp-bullets-log-list">
          {ordered.map((item) => (
            <WidgetPanel
              key={item.id}
              removing={removingIds.has(item.id)}
              onExitComplete={() => finishRemove(item.id)}
              floor="controls"
              grip={false}
              className="gp-bullet-row gp-bullet-log-row"
            >
              <time dateTime={logState.timestamps[item.id]}>
                {logTime(logState.timestamps[item.id])}
              </time>
              <span className="gp-bullet-log-dot" aria-hidden />
              {input(item, 'What happened?  ↵ adds an entry')}
              {remove(item)}
            </WidgetPanel>
          ))}
        </div>
      </div>
    )
  } else {
    content = (
      <div className="gp-bullets-list gp-bullets-dots">
        <header className="gp-bullets-heading">
          <span><List size={13} aria-hidden /> Points</span>
          <small>{data.items.length}</small>
        </header>
        <div className="gp-bullets-ledger">
          {data.items.map((item) => row(
            item,
            <span className="gp-bullet-dot" aria-hidden />,
          ))}
        </div>
      </div>
    )
  }

  return (
    <div
      ref={rootRef}
      className="gp-bullets-skin"
      data-bullets-skin={skin}
    >
      {content}
      <button
        type="button"
        onClick={() => insertAfter(data.items.length - 1)}
        className="gp-bullet-add"
      >
        <Plus size={11} aria-hidden />
        {addLabel}
      </button>
    </div>
  )
}
