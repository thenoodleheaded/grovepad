import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleCheck,
  Clapperboard,
  File,
  FolderTree,
  GraduationCap,
  ListChecks,
  ListTree,
  Network,
  Paperclip,
  PanelsTopLeft,
  Plus,
  ScrollText,
  X,
} from 'lucide-react'
import {
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
} from 'react'
import type {
  OutlineData,
  OutlineItem,
  OutlineSkinMode,
} from '../../../types/spatial'
import {
  dataWithOutlineBriefDetail,
  dataWithOutlineBriefExpanded,
  dataWithOutlineWorkDetail,
  dataWithoutOutlineItem,
  outlineBriefDetails,
  outlineBriefExpandedIds,
  outlineContextLabel,
  outlineItems,
  outlineRomanMarker,
  outlineSkinMode,
  outlineWorkDetails,
  visibleOutlineItems,
} from './outlineSkinModel'

interface OutlineWidgetProps {
  data: OutlineData
  onChange: (data: OutlineData) => void
  skin?: OutlineSkinMode
}

const SKIN_META = {
  tree: { label: 'Idea tree', hint: 'Branches stay close to their roots', icon: ListTree },
  roman: { label: 'Formal outline', hint: 'Document-ready hierarchy', icon: ScrollText },
  scenes: { label: 'Story board', hint: 'Acts, scenes, and beats', icon: Clapperboard },
  sitemap: { label: 'Site structure', hint: 'Sections, pages, and routes', icon: Network },
  course: { label: 'Learning path', hint: 'Modules, lessons, and exercises', icon: GraduationCap },
  work_breakdown: { label: 'Delivery plan', hint: 'Owners, effort, and completion', icon: ListChecks },
  collapsible_brief: { label: 'Expandable brief', hint: 'Headings with supporting detail', icon: PanelsTopLeft },
} satisfies Record<OutlineSkinMode, {
  label: string
  hint: string
  icon: typeof ListTree
}>

function rowStyle(depth: number): CSSProperties {
  return { '--gp-outline-depth': Math.min(depth, 5) } as CSSProperties
}

export function OutlineWidget({
  data,
  onChange,
  skin: requestedSkin,
}: OutlineWidgetProps) {
  const inputRefs = useRef(new Map<string, HTMLInputElement>())
  const pendingFocusId = useRef<string | null>(null)
  const items = useMemo(() => outlineItems(data.items), [data.items])
  const skin = requestedSkin ?? outlineSkinMode(data.skin)
  const visible = useMemo(() => visibleOutlineItems(items), [items])
  const workDetails = useMemo(() => outlineWorkDetails(data), [data])
  const briefDetails = useMemo(() => outlineBriefDetails(data), [data])
  const briefExpanded = useMemo(() => new Set(outlineBriefExpandedIds(data)), [data])
  const topLevel = items.filter((item) => item.depth === 0).length
  const completed = items.filter((item) => workDetails[item.id]?.complete).length
  const completion = items.length > 0 ? Math.round((completed / items.length) * 100) : 0
  const meta = SKIN_META[skin]
  const SkinIcon = meta.icon

  useEffect(() => {
    if (!pendingFocusId.current) return
    inputRefs.current.get(pendingFocusId.current)?.focus()
    pendingFocusId.current = null
  })

  const baseData = (nextItems = items): OutlineData => ({
    ...data,
    items: nextItems,
    skin,
  })

  const setItem = (id: string, patch: Partial<OutlineItem>) => {
    onChange(baseData(items.map((item) => item.id === id ? { ...item, ...patch } : item)))
  }

  const addAfter = (index: number) => {
    const source = items[index]
    const item: OutlineItem = {
      id: crypto.randomUUID(),
      text: '',
      depth: source?.depth ?? 0,
      collapsed: false,
    }
    const next = [...items]
    next.splice(index + 1, 0, item)
    pendingFocusId.current = item.id
    onChange(baseData(next))
  }

  const remove = (item: OutlineItem) => {
    const index = items.findIndex((candidate) => candidate.id === item.id)
    const neighbor = items[index - 1] ?? items[index + 1]
    if (neighbor) pendingFocusId.current = neighbor.id
    onChange(dataWithoutOutlineItem(baseData(), item.id))
  }

  const onItemKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
    item: OutlineItem,
    index: number,
  ) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      addAfter(index)
    } else if (event.key === 'Tab') {
      event.preventDefault()
      setItem(item.id, {
        depth: Math.max(0, Math.min(5, item.depth + (event.shiftKey ? -1 : 1))),
      })
    } else if (event.key === 'Backspace' && item.text === '' && items.length > 1) {
      event.preventDefault()
      remove(item)
    }
  }

  const disclosure = (item: OutlineItem, hasChildren: boolean) => {
    if (!hasChildren) return null
    return (
      <button
        type="button"
        aria-label={item.collapsed ? `Expand ${item.text || 'branch'}` : `Collapse ${item.text || 'branch'}`}
        aria-expanded={!item.collapsed}
        onClick={() => setItem(item.id, { collapsed: !item.collapsed })}
        className="gp-outline-disclosure"
      >
        {item.collapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
      </button>
    )
  }

  const marker = (
    item: OutlineItem,
    index: number,
    hasChildren: boolean,
  ) => {
    if (skin === 'roman') {
      return <span className="gp-outline-roman-marker">{outlineRomanMarker(items, index)}</span>
    }
    if (skin === 'scenes') {
      return (
        <span className="gp-outline-scene-marker">
          {item.depth === 0 ? <Clapperboard size={11} /> : <span>{String(outlineRomanMarker(items, index)).replace('.', '')}</span>}
        </span>
      )
    }
    if (skin === 'sitemap') {
      return (
        <span className="gp-outline-map-marker">
          {hasChildren || item.depth === 0 ? <FolderTree size={11} /> : <File size={10} />}
        </span>
      )
    }
    if (skin === 'course') {
      return (
        <span className="gp-outline-course-marker">
          {workDetails[item.id]?.complete ? <Check size={10} /> : item.depth === 0 ? <BookOpen size={11} /> : <Circle size={7} />}
        </span>
      )
    }
    if (skin === 'work_breakdown') {
      const detail = workDetails[item.id]
      return (
        <button
          type="button"
          aria-label={`${detail?.complete ? 'Mark incomplete' : 'Mark complete'}: ${item.text || 'untitled item'}`}
          aria-pressed={detail?.complete === true}
          onClick={() => onChange(dataWithOutlineWorkDetail(baseData(), item.id, {
            complete: !detail?.complete,
          }))}
          className="gp-outline-check"
        >
          {detail?.complete ? <CircleCheck size={15} /> : <Circle size={15} />}
        </button>
      )
    }
    if (skin === 'collapsible_brief') {
      const expanded = briefExpanded.has(item.id)
      return (
        <button
          type="button"
          aria-label={`${expanded ? 'Hide' : 'Show'} details for ${item.text || 'heading'}`}
          aria-expanded={expanded}
          onClick={() => onChange(dataWithOutlineBriefExpanded(baseData(), item.id, !expanded))}
          className="gp-outline-brief-toggle"
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
      )
    }
    return hasChildren
      ? disclosure(item, hasChildren)
      : <span className="gp-outline-tree-dot" aria-hidden />
  }

  const workFields = (item: OutlineItem) => {
    const detail = workDetails[item.id] ?? { owner: '', estimate: '', complete: false }
    return (
      <div className="gp-outline-work-fields gp-bare-field">
        <label>
          <span>Owner</span>
          <input
            aria-label={`Owner for ${item.text || 'untitled item'}`}
            value={detail.owner}
            placeholder="Unassigned"
            onChange={(event) => onChange(dataWithOutlineWorkDetail(
              baseData(),
              item.id,
              { owner: event.target.value },
            ))}
          />
        </label>
        <label>
          <span>Effort</span>
          <input
            aria-label={`Estimate for ${item.text || 'untitled item'}`}
            value={detail.estimate}
            placeholder="—"
            onChange={(event) => onChange(dataWithOutlineWorkDetail(
              baseData(),
              item.id,
              { estimate: event.target.value },
            ))}
          />
        </label>
      </div>
    )
  }

  const briefFields = (item: OutlineItem) => {
    if (!briefExpanded.has(item.id)) return null
    const detail = briefDetails[item.id] ?? { notes: '', attachments: [] }
    return (
      <div className="gp-outline-brief-details gp-bare-field">
        <label>
          <span>Supporting note</span>
          <textarea
            aria-label={`Supporting note for ${item.text || 'heading'}`}
            value={detail.notes}
            placeholder="Add context, decisions, or a concise explanation…"
            onChange={(event) => onChange(dataWithOutlineBriefDetail(
              baseData(),
              item.id,
              { notes: event.target.value },
            ))}
          />
        </label>
        <label className="gp-outline-attachment-field">
          <Paperclip size={11} aria-hidden />
          <input
            aria-label={`Attachments for ${item.text || 'heading'}`}
            value={detail.attachments.join(', ')}
            placeholder="Links or filenames, separated by commas"
            onChange={(event) => onChange(dataWithOutlineBriefDetail(
              baseData(),
              item.id,
              {
                attachments: event.target.value
                  .split(',')
                  .map((value) => value.trim())
                  .filter(Boolean),
              },
            ))}
          />
        </label>
      </div>
    )
  }

  return (
    <div
      className={`gp-outline-skin gp-outline-${skin}`}
      data-outline-skin={skin}
    >
      <header className="gp-outline-heading">
        <div className="gp-outline-heading-copy">
          <span className="gp-outline-heading-icon"><SkinIcon size={13} aria-hidden /></span>
          <span>
            <strong>{meta.label}</strong>
            <small>{meta.hint}</small>
          </span>
        </div>
        <div className="gp-outline-counts" aria-label={`${topLevel} top-level items, ${items.length} total items`}>
          <span>{topLevel} roots</span>
          <span>{items.length} items</span>
        </div>
      </header>

      {skin === 'work_breakdown' && (
        <div className="gp-outline-progress" aria-label={`${completion}% complete`}>
          <span><strong>{completion}%</strong> complete</span>
          <span className="gp-outline-progress-track" aria-hidden>
            <span style={{ width: `${completion}%` }} />
          </span>
        </div>
      )}

      <div data-island="outline" data-floor-min-h="112" className="gp-outline-surface">
        {visible.length === 0 ? (
          <button type="button" onClick={() => addAfter(-1)} className="gp-outline-empty">
            <Plus size={14} aria-hidden />
            Start your outline
          </button>
        ) : visible.map(({ item, index, hasChildren }) => (
          <div
            key={item.id}
            className={`gp-outline-row ${item.collapsed ? 'is-collapsed' : ''} ${workDetails[item.id]?.complete ? 'is-complete' : ''}`}
            style={rowStyle(item.depth)}
            data-depth={item.depth}
          >
            <div className="gp-outline-row-main">
              <span className="gp-outline-marker-wrap">
                {marker(item, index, hasChildren)}
              </span>
              <div className="gp-outline-copy gp-bare-field">
                <span className="gp-outline-context">
                  {outlineContextLabel(skin, item.depth)}
                </span>
                <input
                  ref={(element) => {
                    if (element) inputRefs.current.set(item.id, element)
                    else inputRefs.current.delete(item.id)
                  }}
                  value={item.text}
                  placeholder={skin === 'scenes' ? 'Describe this beat…' : 'Outline item…'}
                  onChange={(event) => setItem(item.id, { text: event.target.value })}
                  onKeyDown={(event) => onItemKeyDown(event, item, index)}
                  className="gp-outline-input"
                />
              </div>
              {skin === 'work_breakdown' && workFields(item)}
              {skin !== 'tree' && skin !== 'collapsible_brief' && disclosure(item, hasChildren)}
              <div className="gp-outline-row-actions">
                <button
                  type="button"
                  aria-label={`Outdent ${item.text || 'item'}`}
                  disabled={item.depth === 0}
                  onClick={() => setItem(item.id, { depth: Math.max(0, item.depth - 1) })}
                >
                  <ChevronLeft size={10} />
                </button>
                <button
                  type="button"
                  aria-label={`Indent ${item.text || 'item'}`}
                  disabled={item.depth >= 5 || index === 0}
                  onClick={() => setItem(item.id, { depth: Math.min(5, item.depth + 1) })}
                >
                  <ChevronRight size={10} />
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${item.text || 'item'}`}
                  onClick={() => remove(item)}
                  className="gp-outline-remove"
                >
                  <X size={10} />
                </button>
              </div>
            </div>
            {skin === 'collapsible_brief' && briefFields(item)}
          </div>
        ))}
      </div>

      <footer className="gp-outline-footer">
        <button
          type="button"
          onClick={() => addAfter(items.length - 1)}
          className="gp-outline-add"
        >
          <Plus size={11} aria-hidden />
          Add {skin === 'scenes' ? 'beat' : skin === 'course' ? 'lesson' : 'item'}
        </button>
        <span>Enter adds · Tab nests · ⇧ Tab lifts</span>
      </footer>
    </div>
  )
}
