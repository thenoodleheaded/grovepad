import type {
  ModuleData,
  OutlineData,
  OutlineItem,
  OutlineSkinMode,
} from '../../../types/spatial'
import {
  dataWithSkinState,
  skinStateFor,
  type WidgetSkinState,
} from '../../../utils/widgetSkins'

export const OUTLINE_SKINS: readonly OutlineSkinMode[] = [
  'tree',
  'roman',
  'scenes',
  'sitemap',
  'course',
  'work_breakdown',
  'collapsible_brief',
]

export interface VisibleOutlineItem {
  item: OutlineItem
  index: number
  hasChildren: boolean
}

export interface OutlineWorkDetail {
  owner: string
  estimate: string
  complete: boolean
}

export interface OutlineBriefDetail {
  notes: string
  attachments: string[]
}

const MAX_ITEMS = 240
const MAX_TEXT = 2_000
const MAX_DETAIL = 1_200
const MAX_ATTACHMENTS = 8

function cleanText(raw: unknown, limit = MAX_DETAIL): string {
  return typeof raw === 'string' ? raw.slice(0, limit) : ''
}

function cleanRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {}
}

export function outlineSkinMode(raw: unknown): OutlineSkinMode {
  return typeof raw === 'string' && OUTLINE_SKINS.includes(raw as OutlineSkinMode)
    ? raw as OutlineSkinMode
    : 'tree'
}

export function outlineItems(raw: unknown): OutlineItem[] {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, MAX_ITEMS).flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return []
    const item = candidate as Partial<OutlineItem>
    return [{
      id: typeof item.id === 'string' && item.id ? item.id : `outline-${index}`,
      text: cleanText(item.text, MAX_TEXT),
      depth: Math.max(0, Math.min(5, Number.isFinite(item.depth) ? Math.trunc(item.depth!) : 0)),
      collapsed: item.collapsed === true,
    }]
  })
}

export function visibleOutlineItems(items: readonly OutlineItem[]): VisibleOutlineItem[] {
  const visible: VisibleOutlineItem[] = []
  const collapsedDepths: number[] = []
  items.forEach((item, index) => {
    while (
      collapsedDepths.length > 0 &&
      collapsedDepths[collapsedDepths.length - 1]! >= item.depth
    ) {
      collapsedDepths.pop()
    }
    const hidden = collapsedDepths.length > 0
    const hasChildren = (items[index + 1]?.depth ?? -1) > item.depth
    if (!hidden) visible.push({ item, index, hasChildren })
    if (!hidden && item.collapsed && hasChildren) collapsedDepths.push(item.depth)
  })
  return visible
}

export function outlineSiblingOrdinal(
  items: readonly OutlineItem[],
  index: number,
): number {
  const item = items[index]
  if (!item) return 1
  let ordinal = 1
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const candidate = items[cursor]!
    if (candidate.depth < item.depth) break
    if (candidate.depth === item.depth) ordinal += 1
  }
  return ordinal
}

function roman(value: number): string {
  const units: Array<[number, string]> = [
    [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'],
    [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ]
  let remaining = Math.max(1, Math.min(399, Math.trunc(value)))
  let result = ''
  for (const [amount, glyph] of units) {
    while (remaining >= amount) {
      result += glyph
      remaining -= amount
    }
  }
  return result
}

function alpha(value: number): string {
  let remaining = Math.max(1, Math.trunc(value))
  let result = ''
  while (remaining > 0) {
    remaining -= 1
    result = String.fromCharCode(65 + (remaining % 26)) + result
    remaining = Math.floor(remaining / 26)
  }
  return result
}

export function outlineRomanMarker(
  items: readonly OutlineItem[],
  index: number,
): string {
  const depth = items[index]?.depth ?? 0
  const ordinal = outlineSiblingOrdinal(items, index)
  if (depth % 3 === 0) return `${roman(ordinal)}.`
  if (depth % 3 === 1) return `${alpha(ordinal)}.`
  return `${ordinal}.`
}

export function outlineContextLabel(
  skin: OutlineSkinMode,
  depth: number,
): string {
  if (skin === 'scenes') return depth === 0 ? 'Act' : depth === 1 ? 'Scene' : 'Beat'
  if (skin === 'sitemap') return depth === 0 ? 'Section' : depth === 1 ? 'Page' : 'Route'
  if (skin === 'course') return depth === 0 ? 'Module' : depth === 1 ? 'Lesson' : 'Exercise'
  if (skin === 'work_breakdown') return depth === 0 ? 'Deliverable' : depth === 1 ? 'Workstream' : 'Task'
  if (skin === 'collapsible_brief') return depth === 0 ? 'Heading' : 'Point'
  return depth === 0 ? 'Root' : 'Branch'
}

function workDetailsFromState(state: WidgetSkinState): Record<string, OutlineWorkDetail> {
  const source = cleanRecord(state.items)
  const result: Record<string, OutlineWorkDetail> = {}
  for (const [id, raw] of Object.entries(source).slice(0, MAX_ITEMS)) {
    const detail = cleanRecord(raw)
    const owner = cleanText(detail.owner, 80)
    const estimate = cleanText(detail.estimate, 40)
    const complete = detail.complete === true
    if (owner || estimate || complete) result[id] = { owner, estimate, complete }
  }
  return result
}

export function outlineWorkDetails(
  data: Pick<OutlineData, 'skinStates'>,
): Record<string, OutlineWorkDetail> {
  return workDetailsFromState(skinStateFor(data, 'work_breakdown'))
}

function briefDetailsFromState(state: WidgetSkinState): Record<string, OutlineBriefDetail> {
  const source = cleanRecord(state.items)
  const result: Record<string, OutlineBriefDetail> = {}
  for (const [id, raw] of Object.entries(source).slice(0, MAX_ITEMS)) {
    const detail = cleanRecord(raw)
    const notes = cleanText(detail.notes)
    const attachments = Array.isArray(detail.attachments)
      ? detail.attachments
        .slice(0, MAX_ATTACHMENTS)
        .map((value) => cleanText(value, 180))
        .filter(Boolean)
      : []
    if (notes || attachments.length > 0) result[id] = { notes, attachments }
  }
  return result
}

export function outlineBriefDetails(
  data: Pick<OutlineData, 'skinStates'>,
): Record<string, OutlineBriefDetail> {
  return briefDetailsFromState(skinStateFor(data, 'collapsible_brief'))
}

export function outlineBriefExpandedIds(
  data: Pick<OutlineData, 'skinStates'>,
): string[] {
  const state = skinStateFor(data, 'collapsible_brief')
  return Array.isArray(state.expandedIds)
    ? state.expandedIds.slice(0, MAX_ITEMS).filter((id): id is string => typeof id === 'string')
    : []
}

export function dataWithOutlineWorkDetail(
  data: OutlineData,
  itemId: string,
  patch: Partial<OutlineWorkDetail>,
): OutlineData {
  const state = skinStateFor(data, 'work_breakdown')
  const details = workDetailsFromState(state)
  const current = details[itemId] ?? { owner: '', estimate: '', complete: false }
  const next = { ...current, ...patch }
  const nextDetails = { ...details }
  if (next.owner || next.estimate || next.complete) nextDetails[itemId] = next
  else delete nextDetails[itemId]
  return dataWithSkinState(
    { ...data, skin: 'work_breakdown' } as ModuleData,
    'work_breakdown',
    { ...state, items: nextDetails },
  ) as OutlineData
}

export function dataWithOutlineBriefDetail(
  data: OutlineData,
  itemId: string,
  patch: Partial<OutlineBriefDetail>,
): OutlineData {
  const state = skinStateFor(data, 'collapsible_brief')
  const details = briefDetailsFromState(state)
  const current = details[itemId] ?? { notes: '', attachments: [] }
  const next = { ...current, ...patch }
  const nextDetails = { ...details }
  if (next.notes || next.attachments.length > 0) nextDetails[itemId] = next
  else delete nextDetails[itemId]
  return dataWithSkinState(
    { ...data, skin: 'collapsible_brief' } as ModuleData,
    'collapsible_brief',
    { ...state, items: nextDetails },
  ) as OutlineData
}

export function dataWithOutlineBriefExpanded(
  data: OutlineData,
  itemId: string,
  expanded: boolean,
): OutlineData {
  const state = skinStateFor(data, 'collapsible_brief')
  const current = new Set(outlineBriefExpandedIds(data))
  if (expanded) current.add(itemId)
  else current.delete(itemId)
  return dataWithSkinState(
    { ...data, skin: 'collapsible_brief' } as ModuleData,
    'collapsible_brief',
    { ...state, expandedIds: [...current] },
  ) as OutlineData
}

export function dataWithoutOutlineItem(
  data: OutlineData,
  itemId: string,
): OutlineData {
  const nextStates: Record<string, Record<string, unknown>> = {}
  for (const [skin, rawState] of Object.entries(data.skinStates ?? {})) {
    const state = cleanRecord(rawState)
    const {
      items: _items,
      expandedIds: _expandedIds,
      ...rest
    } = state
    const details = cleanRecord(state.items)
    delete details[itemId]
    const expandedIds = Array.isArray(state.expandedIds)
      ? state.expandedIds.filter((id) => id !== itemId)
      : []
    const nextState = {
      ...rest,
      ...(Object.keys(details).length > 0 ? { items: details } : {}),
      ...(expandedIds.length > 0 ? { expandedIds } : {}),
    }
    if (Object.keys(nextState).length > 0) nextStates[skin] = nextState
  }
  const { skinStates: _skinStates, ...withoutSkinStates } = data
  return {
    ...withoutSkinStates,
    items: data.items.filter((item) => item.id !== itemId),
    ...(Object.keys(nextStates).length > 0 ? { skinStates: nextStates } : {}),
  }
}
