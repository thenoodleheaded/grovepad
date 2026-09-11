import type { OutlineData, OutlineSkinMode } from '../../types/spatial'
import {
  outlineContextLabel,
  outlineItems,
  outlineRomanMarker,
  outlineSkinMode,
  outlineWorkDetails,
  visibleOutlineItems,
} from '../../components/widgets/modules/outlineSkinModel'
import {
  compact,
  REST_ROW_LIMIT,
  type RestingFaceModel,
  type RestRow,
  type RestTone,
} from '../restingFaceModel'

// ---------------------------------------------------------------------------
// Outline resting faces.
//
// One hierarchy, seven dresses — and every one of them is a row list in the
// open card, so every one of them folds to the `rows` grammar. What survives
// the fold is exactly what each skin adds to the shared list: the roman skin
// keeps its markers as row leads, the delivery plan keeps its checkmarks,
// estimates, and completion meter, the story board keeps its act/scene
// ordinals. Everything reads the same outlineSkinModel the open card reads,
// so a folded tile can never disagree with the expanded card or with undo.
//
// Collapsed branches stay collapsed: the fold shows the rows the open card
// is showing, via the same visibleOutlineItems reading.
// ---------------------------------------------------------------------------

/** Mirrors SKIN_META in OutlineWidget.tsx — the open card's own heading. */
const EYEBROWS: Record<OutlineSkinMode, string> = {
  tree: 'Idea tree',
  roman: 'Formal outline',
  scenes: 'Story board',
  sitemap: 'Site structure',
  course: 'Learning path',
  work_breakdown: 'Delivery plan',
  collapsible_brief: 'Expandable brief',
}

export function outlineRestingFace(data: Record<string, unknown>): RestingFaceModel | null {
  const items = outlineItems(data.items)
  const skin = outlineSkinMode(data.skin)
  // Nothing written yet — a starter row with no words is still nothing.
  if (!items.some((item) => item.text.trim())) return { kind: 'icon' }

  const visible = visibleOutlineItems(items)
  const shown = visible.slice(0, REST_ROW_LIMIT)
  const overflow = Math.max(0, visible.length - shown.length)
  const details = outlineWorkDetails(data as unknown as Pick<OutlineData, 'skinStates'>)

  const rows: RestRow[] = shown.map(({ item, index, hasChildren }) => {
    // A blank row rests as its context word, the way the open card holds its
    // place with a labelled empty field.
    const blank = !item.text.trim()
    const label = blank
      ? outlineContextLabel(skin, item.depth)
      : compact(item.text, 26)
    const tone: RestTone | undefined = blank ? 'muted' : undefined
    const row: RestRow = { key: item.id, label, indent: item.depth, ...(tone ? { tone } : {}) }

    if (skin === 'roman') {
      return { ...row, lead: outlineRomanMarker(items, index) }
    }
    if (skin === 'scenes') {
      // Acts carry the accent the clapperboard carries when open; deeper rows
      // keep the bare ordinal the open card prints beside them.
      return item.depth === 0
        ? { ...row, tone: tone ?? 'accent' }
        : { ...row, lead: outlineRomanMarker(items, index).replace('.', '') }
    }
    if (skin === 'sitemap') {
      // Sections read accented, leaf pages read muted — the folder/file
      // distinction of the open card, carried as tone.
      const leaf = !hasChildren && item.depth > 0
      return { ...row, tone: tone ?? (item.depth === 0 ? 'accent' : leaf ? 'muted' : undefined) }
    }
    if (skin === 'course' || skin === 'work_breakdown') {
      const detail = details[item.id]
      const done = detail?.complete === true
      if (skin === 'course') return { ...row, done }
      const trailing = detail?.estimate || detail?.owner || ''
      return { ...row, done, ...(trailing ? { value: compact(trailing, 12) } : {}) }
    }
    if (skin === 'collapsible_brief') {
      return { ...row, tone: tone ?? (item.depth === 0 ? undefined : 'muted') }
    }
    return row
  })

  if (skin === 'work_breakdown') {
    const completed = items.filter((item) => details[item.id]?.complete).length
    const completion = items.length > 0 ? completed / items.length : 0
    return {
      kind: 'rows',
      eyebrow: { label: EYEBROWS[skin], note: `${Math.round(completion * 100)}%` },
      rows,
      overflow,
      meter: completion,
    }
  }

  return { kind: 'rows', eyebrow: { label: EYEBROWS[skin] }, rows, overflow }
}
