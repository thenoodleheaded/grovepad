import type { Widget, WidgetGroup, Relation, ModuleType, GroupColor } from '../types/spatial';
import { widgetDefinition } from '../widgets/registry';

interface MinifiedGroup {
  id: string;
  label: string;
}

interface MinifiedWidget {
  id: string;
  type: ModuleType;
  title: string;
  groupId: string | null;
  /** [REF-X] anchor tags pointing at the source-document chunks this widget
      draws from — the hydration pass sends only these excerpts, never the
      whole document. */
  sourceRefs: string[];
}

interface MinifiedRelation {
  from: string;
  to: string;
  type: 'parent' | 'co-parent' | 'cousin' | 'blocker' | 'conflict';
}

export interface MinifiedMindmap {
  groups: MinifiedGroup[];
  widgets: MinifiedWidget[];
  relations: MinifiedRelation[];
}

export function layoutMindmap(
  topology: MinifiedMindmap,
  canvasId: string,
): {
  widgets: Record<string, Widget>;
  groups: Record<string, WidgetGroup>;
  relations: Relation[];
  /** Logical topology id (w1, w2…) → spawned widget UUID, so callers can
      route per-widget follow-ups (hydration) without title matching. */
  idMap: Record<string, string>;
} {
  const idMap: Record<string, string> = {};
  
  // 1. Map logical widget IDs to real browser UUIDs
  topology.widgets.forEach((w) => {
    idMap[w.id] = crypto.randomUUID();
  });
  
  const widgets: Record<string, Widget> = {};
  const groups: Record<string, WidgetGroup> = {};
  
  const groupWidgetMap: Record<string, MinifiedWidget[]> = {};
  const ungroupedWidgets: MinifiedWidget[] = [];
  
  topology.groups.forEach((g) => {
    groupWidgetMap[g.id] = [];
  });
  
  topology.widgets.forEach((w) => {
    const gid = w.groupId;
    if (gid && groupWidgetMap[gid]) {
      groupWidgetMap[gid].push(w);
    } else {
      ungroupedWidgets.push(w);
    }
  });
  
  let currentGroupCol = 0;
  
  // Layout widgets group-by-group in grid-aligned columns
  topology.groups.forEach((g) => {
    const groupWidgets = groupWidgetMap[g.id] || [];
    if (groupWidgets.length === 0) return;
    
    const realGroupId = crypto.randomUUID();
    const groupWidgetIds = groupWidgets
      .map((gw) => idMap[gw.id])
      .filter((id): id is string => !!id);
    
    // Group colors index cycling
    const colorChoices = [
      '#6366f1', // indigo
      '#8b5cf6', // violet
      '#ec4899', // pink
      '#f97316', // orange
      '#eab308', // yellow
      '#22c55e', // green
    ] as const;
    const color = colorChoices[currentGroupCol % colorChoices.length] as GroupColor;
    
    // Create the group plate metadata
    groups[realGroupId] = {
      id: realGroupId,
      label: g.label,
      widgetIds: groupWidgetIds,
      color,
    };
    
    // Place widgets inside this group in a clean 2-column layout
    groupWidgets.forEach((gw, idx) => {
      const realId = idMap[gw.id];
      if (!realId) return;
      const def = widgetDefinition(gw.type);
      
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      
      const x = currentGroupCol * 960 + col * 360 + 120;
      const y = row * 320 + 200;
      
      widgets[realId] = {
        id: realId,
        type: gw.type,
        title: gw.title,
        canvasId,
        position: { x, y },
        size: { ...def.defaultSize },
        metadata: { badges: [] },
        data: def.defaultData(),
      };
    });
    
    currentGroupCol++;
  });
  
  // Layout ungrouped widgets in a far right column
  if (ungroupedWidgets.length > 0) {
    ungroupedWidgets.forEach((uw, idx) => {
      const realId = idMap[uw.id];
      if (!realId) return;
      const def = widgetDefinition(uw.type);
      
      const x = currentGroupCol * 960 + 120;
      const y = idx * 320 + 200;
      
      widgets[realId] = {
        id: realId,
        type: uw.type,
        title: uw.title,
        canvasId,
        position: { x, y },
        size: { ...def.defaultSize },
        metadata: { badges: [] },
        data: def.defaultData(),
      };
    });
  }
  
  // 3. Map relations
  const relations: Relation[] = [];
  topology.relations.forEach((r) => {
    const fromId = idMap[r.from];
    const toId = idMap[r.to];
    if (fromId && toId) {
      relations.push({
        id: crypto.randomUUID(),
        fromId,
        toId,
        type: r.type,
        isResolved: false,
      });
    }
  });
  
  return { widgets, groups, relations, idMap };
}

