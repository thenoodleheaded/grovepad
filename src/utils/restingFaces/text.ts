import type { BulletItem } from '../../types/spatial'
import {
  bulletLogState,
  bulletOutlineState,
  bulletSkin,
  orderedLogItems,
  visibleOutlineItems,
} from '../../components/widgets/modules/bulletSkinModel'
import {
  textInputEmail,
  textInputHistory,
  textInputLink,
  textInputSkinMode,
  textInputTags,
} from '../../components/widgets/modules/textInputSkinModel'
import {
  compact,
  record,
  REST_CHIP_LIMIT,
  REST_COLUMN_ITEM_LIMIT,
  REST_LINE_LIMIT,
  REST_ROW_LIMIT,
  type RestingFaceModel,
} from '../restingFaceModel'

// ---------------------------------------------------------------------------
// The written families: Bullets, Text Input, Code, Links.
//
// Their content is words, so the risk is that every skin folds to the same
// grey paragraph. Each face below keeps the ONE structural thing its skin adds
// to plain writing — a number, an indent, a chip, a prompt, a host — because
// that structure is what someone chose the skin for.
// ---------------------------------------------------------------------------

const LOG_TIME = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })

function bulletItems(raw: unknown): BulletItem[] {
  if (!Array.isArray(raw)) return []
  const items: BulletItem[] = []
  for (const entry of raw) {
    const item = record(entry)
    if (!item || typeof item.id !== 'string') continue
    items.push({ id: item.id, text: typeof item.text === 'string' ? item.text : '' })
  }
  return items
}

/* ------------------------------------------------------------------ Bullets */

export function bulletsRestingFace(data: Record<string, unknown>): RestingFaceModel | null {
  const items = bulletItems(data.items).filter((item) => item.text.trim())
  if (items.length === 0) return { kind: 'icon' }
  const skin = bulletSkin(data.skin)
  const states = record(data.skinStates) ?? {}

  if (skin === 'compact_chips') {
    const visible = items.slice(0, REST_CHIP_LIMIT)
    return {
      kind: 'chips',
      chips: visible.map((item) => ({
        key: item.id,
        text: compact(item.text, 16),
        filled: true,
      })),
      overflow: Math.max(0, items.length - visible.length),
    }
  }

  if (skin === 'two_column') {
    // Down the first column, then the second — the reading order the open
    // card uses, so a folded list does not scramble the sequence.
    const half = Math.ceil(Math.min(items.length, REST_COLUMN_ITEM_LIMIT * 2) / 2)
    const left = items.slice(0, half)
    const right = items.slice(half, half * 2)
    return {
      kind: 'columns',
      columns: [left, right].filter((column) => column.length > 0).map((column, index) => ({
        key: `column-${index}`,
        label: index === 0 ? 'First' : 'Then',
        items: column.map((item) => ({ key: item.id, label: compact(item.text, 18) })),
        overflow: 0,
      })),
      eyebrow: { label: 'Two columns', note: String(items.length) },
    }
  }

  if (skin === 'nested_outline') {
    const state = bulletOutlineState(states.nested_outline, items)
    const visible = visibleOutlineItems(items, state).slice(0, REST_ROW_LIMIT)
    return {
      kind: 'rows',
      eyebrow: { label: 'Outline', note: String(items.length) },
      // The indent IS the information — a folded outline that lost its levels
      // is just a list. A collapsed parent keeps its ellipsis so the tile never
      // silently drops the children hiding underneath it.
      rows: visible.map((entry) => ({
        key: entry.item.id,
        indent: entry.level,
        label: compact(entry.item.text, 26),
        ...(entry.collapsed ? { value: '···', tone: 'muted' as const } : {}),
      })),
      overflow: Math.max(0, items.length - visible.length),
    }
  }

  if (skin === 'rolling_log') {
    const state = bulletLogState(states.rolling_log, items)
    const ordered = orderedLogItems(items, state)
    const visible = ordered.slice(0, REST_ROW_LIMIT)
    return {
      kind: 'rows',
      eyebrow: { label: 'Log', note: state.order === 'newest' ? 'Newest first' : 'Oldest first' },
      rows: visible.map((item) => {
        const stamp = state.timestamps[item.id]
        const at = stamp ? Date.parse(stamp) : Number.NaN
        return {
          key: item.id,
          ...(Number.isFinite(at) ? { lead: LOG_TIME.format(new Date(at)) } : {}),
          label: compact(item.text, 26),
        }
      }),
      overflow: Math.max(0, ordered.length - visible.length),
    }
  }

  const visible = items.slice(0, REST_ROW_LIMIT)
  return {
    kind: 'rows',
    rows: visible.map((item, index) => ({
      key: item.id,
      ...(skin === 'numbered' ? { lead: `${index + 1}.` } : {}),
      label: compact(item.text, 32),
    })),
    overflow: Math.max(0, items.length - visible.length),
  }
}

/* --------------------------------------------------------------- Text Input */

export function textInputRestingFace(data: Record<string, unknown>): RestingFaceModel | null {
  const value = typeof data.value === 'string' ? data.value.trim() : ''
  const skin = textInputSkinMode(data.skin, data.multiline === true)
  const states = record(data.skinStates) ?? {}
  const label = typeof data.label === 'string' ? data.label.trim() : ''

  if (skin === 'tags') {
    const tags = textInputTags(typeof data.value === 'string' ? data.value : '')
    if (tags.length === 0) return { kind: 'icon' }
    const visible = tags.slice(0, REST_CHIP_LIMIT)
    return {
      kind: 'chips',
      chips: visible.map((tag, index) => ({ key: `${tag}-${index}`, text: compact(tag, 14), filled: true })),
      overflow: Math.max(0, tags.length - visible.length),
    }
  }

  if (skin === 'command') {
    const history = textInputHistory((record(states.command) ?? {}).history)
    if (!value && history.length === 0) return { kind: 'icon' }
    // The prompt line first, then what has already been run under it.
    return {
      kind: 'lines',
      mono: true,
      eyebrow: { label: 'Command', note: history.length > 0 ? `${history.length} run` : undefined },
      lines: [
        { key: 'prompt', left: `❯ ${compact(value || '…', 24)}`, tone: 'accent' as const },
        ...history.slice(0, REST_LINE_LIMIT - 1).map((entry, index) => ({
          key: `history-${index}`,
          left: `  ${compact(entry, 24)}`,
          dim: true,
        })),
      ],
    }
  }

  if (!value) return { kind: 'icon' }

  if (skin === 'url') {
    const link = textInputLink(value)
    return {
      kind: 'rows',
      // An address that is not http(s) never becomes a link, and the folded
      // card says so rather than showing a host it does not have.
      eyebrow: {
        label: 'Link',
        note: link.valid ? link.host : link.scheme ? `${link.scheme}:` : 'Not a link',
        ...(link.valid ? {} : { tone: 'bad' as const }),
      },
      rows: [{
        key: 'url',
        label: compact(link.display || value, 34),
        tone: link.valid ? undefined : 'bad',
      }],
      overflow: 0,
    }
  }

  if (skin === 'email') {
    const email = textInputEmail(value)
    return {
      kind: 'rows',
      eyebrow: { label: 'Email', note: email.valid ? email.domain : 'Check address' },
      rows: [{
        key: 'address',
        label: compact(value, 34),
        tone: email.valid ? undefined : 'warn',
      }],
      overflow: 0,
    }
  }

  if (skin === 'search') {
    return {
      kind: 'rows',
      eyebrow: { label: compact(label || 'Search', 18) },
      rows: [{ key: 'query', lead: '⌕', label: compact(value, 32), tone: 'accent' }],
      overflow: 0,
    }
  }

  // single_line and multiline: the words themselves.
  return { kind: 'text', text: compact(value, 220) }
}

/* --------------------------------------------------------------------- Code */

export function codeRestingFace(data: Record<string, unknown>): RestingFaceModel | null {
  const code = typeof data.code === 'string' ? data.code : ''
  const language = typeof data.language === 'string' ? data.language.trim() : ''
  if (!code.trim()) return { kind: 'icon' }
  // The first lines as written, monospaced and un-wrapped: indentation is
  // most of what makes a snippet recognisable at a glance.
  const source = code.replace(/\r\n?/g, '\n').split('\n')
  const lines = source.filter((line) => line.trim()).slice(0, REST_LINE_LIMIT)
  return {
    kind: 'lines',
    mono: true,
    eyebrow: { label: compact(language || 'Code', 14), note: `${source.length} lines` },
    // Clipped, never `compact`ed: collapsing whitespace would strip the
    // indentation, and indentation is half of what makes a snippet legible.
    lines: lines.map((line, index) => ({
      key: `line-${index}`,
      left: line.length > 30 ? `${line.slice(0, 29).trimEnd()}…` : line.trimEnd(),
    })),
  }
}

/* -------------------------------------------------------------------- Links */

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

export function linksRestingFace(data: Record<string, unknown>): RestingFaceModel | null {
  const items = Array.isArray(data.items) ? data.items : []
  const links = items
    .map((entry) => record(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== null)
    .map((entry, index) => ({
      key: typeof entry.id === 'string' ? entry.id : `link-${index}`,
      label: typeof entry.label === 'string' ? entry.label.trim() : '',
      url: typeof entry.url === 'string' ? entry.url.trim() : '',
    }))
    .filter((link) => link.label || link.url)
  if (links.length === 0) return { kind: 'icon' }
  const visible = links.slice(0, REST_ROW_LIMIT)
  return {
    kind: 'rows',
    // The host is the trailing value because it is what tells two saved links
    // apart when their labels are both "Docs".
    rows: visible.map((link) => ({
      key: link.key,
      label: compact(link.label || hostOf(link.url) || link.url, 26),
      ...(link.label && hostOf(link.url) ? { value: compact(hostOf(link.url), 16), tone: 'muted' as const } : {}),
    })),
    overflow: Math.max(0, links.length - visible.length),
  }
}
