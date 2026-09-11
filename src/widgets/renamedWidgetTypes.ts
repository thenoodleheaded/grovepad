// ---------------------------------------------------------------------------
// Renamed widget types — cards that still exist, under a new name.
//
// Unlike `deletedWidgetTypes.ts`, nothing here was removed: the widget is
// still live, still creatable, still fully supported. Only the string that
// names it changed. A board saved under the old name still holds records
// typed with it, and without this map those records would hydrate as opaque,
// locked placeholders — the same fate as a genuinely unrecognised future
// type — even though the app knows exactly what they are and how to draw
// them.
//
// Persistence reads this map on both hydration paths and rewrites a matching
// `type` to its current name before anything else looks at the record, so
// every downstream check (deleted-type drop, module-type validity, skin
// lookup) sees the live name. The record's `data` is untouched: a rename
// never changes the shape a widget's data takes, only what it is called.
//
// This module imports nothing at all, matching `deletedWidgetTypes.ts`, so
// both can be read mid-registry-assembly without an import cycle.
// ---------------------------------------------------------------------------

export const RENAMED_WIDGET_TYPES: ReadonlyMap<string, string> = new Map([
  // Note -> Text, 2026-08-13.
  ['notes', 'text'],
])

export function currentWidgetType(type: string): string {
  return RENAMED_WIDGET_TYPES.get(type) ?? type
}
