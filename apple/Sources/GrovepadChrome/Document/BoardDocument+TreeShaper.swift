import Foundation
import GrovepadCore
import GrovepadCanvas

// ---------------------------------------------------------------------------
// `uiLinkingSlice.commitGhostTree`: the shaped tree becomes real cards in one
// undo step. Every card spawns as an icon tile (the 2×2 tile the preview
// drew), each node's cards are laid out from their real sizes
// (`TreeCommitLayout`) and welded into one glue cluster when there are two
// or more, and each node's first card is the parent of its children's first
// card. Mint order follows the web: every card, then every glue, then every
// relation.
//
// Not ported (recorded in apple/AGENTS.md): the settle pass the web runs over
// the new cards (`settleWidgetsByCanvas` — owner's rule: cards push each
// other only on a drag's drop) and the staged reveal (`treeReveal.ts`). Like the web's commit, a Canvas card made here gets no
// child canvas (`buildWidget` never makes one; only `createWidget` does).
// ---------------------------------------------------------------------------

extension BoardDocument {
    /// Creates the tree and selects the new cards. Returns their ids in
    /// creation order, or nil when a node has no widgets yet (the web's
    /// Create Tree button is disabled then).
    @discardableResult
    public func commitGhostTree(_ nodes: [GhostTreeNode], originX: Double, originY: Double, mint override: IdMinter? = nil) -> [String]? {
        guard !nodes.isEmpty, nodes.allSatisfy({ !$0.widgetTypes.isEmpty }) else { return nil }
        guard nodes.allSatisfy({ $0.widgetTypes.allSatisfy { WidgetRegistry.definition(for: $0) != nil } }) else { return nil }
        let mint = override ?? self.mint
        let canvasId = activeCanvasId

        let placements = Dictionary(
            TreeCommitLayout.layout(
                nodes.map { TreeCommitNode(id: $0.id, parentId: $0.parentId, order: $0.order, widgetSizes: $0.widgetTypes.map { _ in CanvasGeometry.iconifiedSize }) },
                originX: originX, originY: originY
            ).map { ($0.nodeId, $0.widgetPositions) },
            uniquingKeysWith: { first, _ in first }
        )

        let created: [String] = commit("Create Tree") { board in
            var created: [String] = []
            var idsByNode: [String: [String]] = [:]
            for node in nodes {
                let positions = placements[node.id] ?? []
                idsByNode[node.id] = node.widgetTypes.enumerated().map { index, type in
                    let definition = WidgetRegistry.definition(for: type)!
                    let id = mint()
                    var widget = Widget(
                        id: id, type: type, title: definition.label, canvasId: canvasId,
                        position: positions.indices.contains(index) ? positions[index] : Vector2D(x: originX, y: originY),
                        size: definition.defaultSize,
                        data: definition.defaultData(mint: mint)
                    )
                    // `{ ...built, iconified: true, expandedSize: built.size, size: ICONIFIED_SIZE }`
                    widget.iconified = true
                    widget.expandedSize = widget.size
                    widget.size = CanvasGeometry.iconifiedSize
                    board.widgets[id] = widget
                    created.append(id)
                    return id
                }
            }
            // A node's cards are one bundle: weld them.
            for node in nodes {
                let members = idsByNode[node.id] ?? []
                guard members.count >= 2 else { continue }
                let glueId = mint()
                board.glues[glueId] = WidgetGlue(id: glueId, widgetIds: members)
            }
            // Nodes are separate clusters joined to their parents by lines.
            for node in nodes {
                guard let parentNode = node.parentId,
                      let fromId = idsByNode[parentNode]?.first,
                      let toId = idsByNode[node.id]?.first,
                      fromId != toId else { continue }
                let relationId = mint()
                board.relations[relationId] = Relation(id: relationId, fromId: fromId, toId: toId, type: .parent, isResolved: true)
            }
            return created
        }
        selectWidgets(created)
        return created
    }
}
