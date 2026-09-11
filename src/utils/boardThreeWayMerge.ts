import type { PersistedBoard } from '../types/persistence'
import type { CanvasMeta, Relation, Widget, WidgetGlue, Workspace } from '../types/spatial'
import { GRID_SIZE } from '../types/canvas'
import type { Connection } from '../types/circuit'
import { canonicalJson } from './cloudDocuments'

// ---------------------------------------------------------------------------
// Three-way board merge.
//
// Reconciling two boards by comparing them to each other can only ever ask a
// question: they differ, so which one do you want? Comparing BOTH of them to
// the copy that was last synced answers it instead. For every record the base
// says which side actually moved:
//
//   local == cloud                  nothing happened
//   local == base, cloud moved      the other device edited it   -> take cloud
//   cloud == base, local moved      this device edited it        -> take local
//   both moved, differently         a real conflict              -> see below
//
// "Moved" includes deletion: a record missing from one side is a delete, and
// a delete that raced an edit loses, because resurrecting a card is a nuisance
// and losing an edit is not recoverable.
//
// Real conflicts are resolved without asking. Widgets carry content, so BOTH
// versions are kept — the cloud copy stays at its own id so other devices stay
// coherent, and this device's version is kept beside it as a new card. Every
// other record (workspace names, canvas metadata, links, glue) carries no
// content worth duplicating, so this device wins: nothing renames itself in
// front of you while you are looking at it.
//
// The result is total and never destructive, which is what lets the whole
// reconcile run silently.
// ---------------------------------------------------------------------------

/** Free-standing so callers can label the merge in a toast without re-deriving it. */
export interface ThreeWayMergeResult {
  board: PersistedBoard
  /** Titles of cards that existed in two different versions and were both kept. */
  keptBothTitles: string[]
}

type RecordMap<T> = Record<string, T>

interface MapMerge<T> {
  merged: RecordMap<T>
  conflicts: Array<{ id: string; local: T; cloud: T }>
}

function json(value: unknown): string | null {
  return value === undefined ? null : canonicalJson(value)
}

/**
 * Merge one id-keyed collection. `preferOnConflict` decides records whose two
 * versions both moved; widgets pass 'cloud' and keep the local one separately.
 */
function mergeRecordMaps<T>(
  base: RecordMap<T> | null,
  local: RecordMap<T>,
  cloud: RecordMap<T>,
  preferOnConflict: 'local' | 'cloud',
): MapMerge<T> {
  const merged: RecordMap<T> = {}
  const conflicts: MapMerge<T>['conflicts'] = []
  const baseMap = base ?? {}
  const ids = new Set([...Object.keys(local), ...Object.keys(cloud), ...Object.keys(baseMap)])

  for (const id of ids) {
    const localRecord = local[id]
    const cloudRecord = cloud[id]
    const localJson = json(localRecord)
    const cloudJson = json(cloudRecord)
    // Identical on both sides — including "deleted on both sides".
    if (localJson === cloudJson) {
      if (localRecord !== undefined) merged[id] = localRecord
      continue
    }
    // A missing base entry is not a special case: an id absent from the base
    // is unequal to any present record, so a one-sided creation falls into the
    // branch below that takes the side that has it, and a two-sided creation
    // of the same id falls through to the conflict arm exactly like an edit.
    const baseJson = json(baseMap[id])
    if (localJson === baseJson) {
      if (cloudRecord !== undefined) merged[id] = cloudRecord
      continue
    }
    if (cloudJson === baseJson) {
      if (localRecord !== undefined) merged[id] = localRecord
      continue
    }
    // Both sides moved. A delete on one side against an edit on the other is
    // not a conflict worth keeping two copies of — the edit simply survives.
    if (localRecord === undefined) {
      merged[id] = cloudRecord!
      continue
    }
    if (cloudRecord === undefined) {
      merged[id] = localRecord
      continue
    }
    merged[id] = preferOnConflict === 'cloud' ? cloudRecord : localRecord
    conflicts.push({ id, local: localRecord, cloud: cloudRecord })
  }
  return { merged, conflicts }
}

function mergePacks(
  base: PersistedBoard['activePacks'] | null,
  local: PersistedBoard['activePacks'],
  cloud: PersistedBoard['activePacks'],
): PersistedBoard['activePacks'] {
  // Packs are a set, so union is the honest merge — except for one that the
  // base proves was deliberately turned off on one side since the last sync.
  const removedLocally = new Set((base ?? []).filter((pack) => !local.includes(pack)))
  const removedInCloud = new Set((base ?? []).filter((pack) => !cloud.includes(pack)))
  return [...new Set([...cloud, ...local])].filter(
    (pack) => !removedLocally.has(pack) && !removedInCloud.has(pack),
  )
}

function keptBothTitle(title: string): string {
  const suffix = ' (this device)'
  const trimmed = title.trim() || 'Card'
  return trimmed.endsWith(suffix) ? trimmed : `${trimmed.slice(0, 80 - suffix.length)}${suffix}`
}

/**
 * Reconcile the board on this device against the board in the cloud, using the
 * copy captured at the last successful sync to tell which side actually moved.
 * Pass `base: null` only when no lineage exists (first sync on this device, or
 * a lost baseline); the merge then unions both sides, which is lossless but
 * cannot detect deletions.
 *
 * The returned board is a raw union — run it through `parsePersistedBoard`,
 * which owns referential integrity, before it reaches the store or the cloud.
 */
export function mergeBoardsThreeWay(
  base: PersistedBoard | null,
  local: PersistedBoard,
  cloud: PersistedBoard,
  idFactory: () => string = () => crypto.randomUUID(),
): ThreeWayMergeResult {
  const workspaces = mergeRecordMaps<Workspace>(
    base?.workspaces ?? null, local.workspaces, cloud.workspaces, 'local',
  )
  const canvases = mergeRecordMaps<CanvasMeta>(
    base?.canvases ?? null, local.canvases, cloud.canvases, 'local',
  )
  const widgets = mergeRecordMaps<Widget>(
    base?.widgets ?? null, local.widgets, cloud.widgets, 'cloud',
  )
  const relations = mergeRecordMaps<Relation>(
    base?.relations ?? null, local.relations, cloud.relations, 'local',
  )
  const connections = mergeRecordMaps<Connection>(
    base?.connections ?? null, local.connections, cloud.connections, 'local',
  )
  const glues = mergeRecordMaps<WidgetGlue>(
    base?.glues ?? null, local.glues, cloud.glues, 'local',
  )

  // Keep this device's version of every genuinely conflicted card, beside the
  // cloud version rather than on top of it. A fresh id keeps it out of the
  // cloud copy's glue cluster and links, which stay pointed at the original.
  const occupied = new Set(Object.keys(widgets.merged))
  const keptBothTitles: string[] = []
  for (const conflict of widgets.conflicts) {
    let id = idFactory()
    while (occupied.has(id)) id = idFactory()
    occupied.add(id)
    const source = conflict.local
    const title = keptBothTitle(source.title)
    widgets.merged[id] = {
      ...source,
      id,
      title,
      position: { x: source.position.x, y: source.position.y + source.size.height + GRID_SIZE },
    }
    keptBothTitles.push(title)
  }

  return {
    board: {
      // Unrecognized top-level fields written by a newer build survive from
      // both sides; this device's copy wins where the two disagree.
      ...cloud,
      ...local,
      format: local.format,
      v: local.v,
      workspaces: workspaces.merged,
      canvases: canvases.merged,
      widgets: widgets.merged,
      relations: relations.merged,
      connections: connections.merged,
      glues: glues.merged,
      activePacks: mergePacks(base?.activePacks ?? null, local.activePacks, cloud.activePacks),
    },
    keptBothTitles,
  }
}
