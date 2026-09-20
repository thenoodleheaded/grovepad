import Foundation
import GrovepadCore
import GrovepadCanvas

// ---------------------------------------------------------------------------
// Relation and dependency lines as edge descriptors: the geometry halves of
// `components/canvas/RelationLines.tsx` and `DependencyLines.tsx`. Paint is
// the shared stack (`edgePaint(for:)`); this file only says where each line
// runs and what it is.
//
// - Relations (every type but `blocker`): one line per ordered pair, the
//   highest-priority type winning a merge (blocker 5 … cousin 1). A strict
//   parent reads top-down (`lower` → `upper`); a floating name capsule is a
//   pill the line dodges, hidden while the card rests or is an icon.
// - Dependencies (`blocker`): fixed rails, prerequisite's right edge into the
//   dependent's left (`DependencyGeometry.route`).
//
// A glued cluster is ONE node: every member links as the group, the line
// anchors to the group frame (`clusterFrameEnvelope`) and dodges the
// group's title row as a pill, two relations into one group merge, and a
// relation wholly inside a group draws nothing.
//
// Deviation, recorded: the critical-path highlight is not drawn.
// ---------------------------------------------------------------------------

public enum RelationLineModel {
    /// `TYPE_PRIORITY`.
    static func priority(_ type: RelationType) -> Int {
        switch type {
        case .blocker: return 5
        case .conflict: return 4
        case .parent: return 3
        case .coParent: return 2
        case .cousin: return 1
        }
    }

    /// `WIDGET_PILL_TOP`, `PILL_HALF_HEIGHT`, `PILL_CHAR_WIDTH`,
    /// `WIDGET_PILL_CHROME`, `PILL_MIN_HALF_WIDTH`.
    static let pillTop = 36.0
    static let pillHalfHeight = 16.0
    static let pillCharWidth = 6.5
    static let pillChrome = 41.0
    static let pillMinHalfWidth = 32.0

    /// `estimatePillHalfWidth`.
    static func pillHalfWidth(_ title: String, boxWidth: Double) -> Double {
        let estimated = (pillChrome + Double(title.count) * pillCharWidth) / 2
        return min(max(estimated, pillMinHalfWidth), boxWidth * 0.4)
    }

    /// Where a widget's lines land: its on-screen footprint, with the name
    /// capsule as a pill when it shows.
    static func node(_ widget: Widget, restContext: RestContext) -> EdgeNode {
        let box = displayedWidgetRect(widget, restContext: restContext)
        let pillHidden = widget.iconified == true || restContext.isResting(widget)
        var node = EdgeNode(frame: box)
        if !pillHidden {
            let rx = pillHalfWidth(widget.title, boxWidth: box.width)
            node.pill = EdgePill(cx: box.x + rx, cy: box.y - pillTop + pillHalfHeight, rx: rx, ry: pillHalfHeight)
        }
        return node
    }

    /// Every relation and dependency line on `canvasId`. `strictCarriers` are
    /// the widgets holding a strict parent grip (directly or inherited);
    /// `hoverWidgetId` lights the lines touching the hovered card, and
    /// `hoverAccent` is that card's accent (relations only).
    public static func descriptors(
        board: Board,
        canvasId: String,
        restContext: RestContext,
        hoverWidgetId: String?,
        hoverAccent: String?,
        hoveredLineId: String?,
        strictCarriers: Set<String>,
        visibleRect: WorldRect?
    ) -> [EdgeDescriptor] {
        struct Merged {
            var id: String
            var from: Widget
            var to: Widget
            var type: RelationType
            var resolved: Bool
            var strict: Bool
            var hovered: Bool
            var priority: Int
        }
        var order: [String] = []
        var merged: [String: Merged] = [:]
        var dependencies: [EdgeDescriptor] = []
        var nodes: [String: EdgeNode] = [:]
        let glueIndex = GlueGeometry.index(board.glues)
        /// `linkNodeId`: a member of a group of two or more links as the group.
        func linkNodeId(_ widgetId: String) -> String {
            if let glueId = glueIndex[widgetId], (board.glues[glueId]?.widgetIds.count ?? 0) >= 2 { return "glue:\(glueId)" }
            return widgetId
        }
        func nodeFor(_ widget: Widget) -> EdgeNode {
            let key = linkNodeId(widget.id)
            if let cached = nodes[key] { return cached }
            var made = node(widget, restContext: restContext)
            if key != widget.id, let glueId = glueIndex[widget.id], let glue = board.glues[glueId],
               let env = GlueGeometry.frameEnvelope(glue.widgetIds, widgets: board.widgets) {
                made = EdgeNode(frame: env)
                if let row = GlueGeometry.titleRowRect(glue.widgetIds, widgets: board.widgets, name: glue.name) {
                    made.pill = EdgePill(cx: row.x + row.width / 2, cy: row.y + row.height / 2, rx: row.width / 2, ry: row.height / 2)
                }
            }
            nodes[key] = made
            return made
        }

        for relation in board.relations.values {
            guard let from = board.widgets[relation.fromId], let to = board.widgets[relation.toId],
                  from.canvasId == canvasId, to.canvasId == canvasId, from.id != to.id else { continue }
            let touchesHover = hoverWidgetId != nil && (hoverWidgetId == from.id || hoverWidgetId == to.id)
            if relation.type == .blocker {
                // Dependencies anchor to the bare footprint (no pill).
                let route = DependencyGeometry.route(
                    prerequisite: EdgeNode(frame: displayedWidgetRect(from, restContext: restContext)),
                    dependent: EdgeNode(frame: displayedWidgetRect(to, restContext: restContext))
                )
                if let visibleRect, !route.curve.controlBounds.intersects(visibleRect) { continue }
                dependencies.append(EdgeDescriptor(
                    id: relation.id, route: route.curve, mid: route.mid, semantics: .dependency,
                    connected: touchesHover, resolved: relation.isResolved, hovered: hoveredLineId == relation.id
                ))
                continue
            }
            // Keyed by NODE: two relations reaching members of one group are
            // one line to the group; both ends inside one group draw nothing.
            let fromNode = linkNodeId(from.id)
            let toNode = linkNodeId(to.id)
            if fromNode == toNode { continue }
            let key = "\(fromNode)::\(toNode)"
            let strict = relation.type == .parent && strictCarriers.contains(from.id)
            let priority = priority(relation.type)
            if var existing = merged[key] {
                if priority > existing.priority {
                    existing.type = relation.type
                    existing.resolved = relation.isResolved
                    existing.priority = priority
                }
                existing.strict = existing.strict || strict
                existing.hovered = existing.hovered || hoveredLineId == relation.id
                merged[key] = existing
                continue
            }
            order.append(key)
            merged[key] = Merged(id: relation.id, from: from, to: to, type: relation.type, resolved: relation.isResolved, strict: strict, hovered: hoveredLineId == relation.id, priority: priority)
        }

        var result: [EdgeDescriptor] = []
        for key in order {
            guard let edge = merged[key] else { continue }
            let route = routeEdge(
                from: nodeFor(edge.from), to: nodeFor(edge.to),
                attachFrom: edge.strict ? .lower : .free, attachTo: edge.strict ? .upper : .free
            )
            if let visibleRect, !route.curve.controlBounds.intersects(visibleRect) { continue }
            let touchesHover = hoverWidgetId != nil && (hoverWidgetId == edge.from.id || hoverWidgetId == edge.to.id)
            result.append(EdgeDescriptor(
                id: edge.id, route: route.curve, mid: route.mid,
                semantics: .relation(type: edge.type, strict: edge.strict, hoverAccent: touchesHover ? hoverAccent : nil),
                connected: touchesHover, resolved: edge.resolved, hovered: edge.hovered
            ))
        }
        // Dependencies paint above relations, as their layer does on the web.
        return result + dependencies
    }
}
