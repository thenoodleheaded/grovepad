import Foundation
import GrovepadCore

// ---------------------------------------------------------------------------
// The menu a relation or dependency line opens (`LineContextMenu` in
// `RelationLines.tsx`, `DependencyContextMenu` in `DependencyLines.tsx`) as
// rows the platform draws: resolve, change type, reverse, add a parent link
// either way (relations), delete. Every row is one undo step.
// ---------------------------------------------------------------------------

public struct RelationLineMenuModel {
    public enum Action: Equatable, Sendable {
        case toggleResolved
        case changeType(RelationType)
        case reverse
        case addParent(parentId: String, childId: String)
        case delete
    }

    public struct Row: Equatable, Sendable {
        public var label: String
        public var action: Action
        public var checked = false
        public var danger = false
        /// A section title drawn above this row.
        public var header: String?
    }

    public let relationId: String
    public let title: String
    public let subtitle: String?
    public let rows: [Row]

    public init?(document: BoardDocument, relationId: String) {
        guard let relation = document.board.relations[relationId] else { return nil }
        self.relationId = relationId
        let from = RelationLineMenuModel.truncate(document.widget(relation.fromId)?.title ?? "…")
        let to = RelationLineMenuModel.truncate(document.widget(relation.toId)?.title ?? "…")
        var rows: [Row] = []
        if relation.type == .blocker {
            title = "Dependency"
            subtitle = "\(from) must finish before \(to)"
            rows.append(Row(label: relation.isResolved ? "Mark Active" : "Mark Satisfied", action: .toggleResolved))
            rows.append(Row(label: "Reverse Dependency", action: .reverse))
            for (index, type) in [RelationType.parent, .coParent, .cousin, .conflict].enumerated() {
                rows.append(Row(label: type.label, action: .changeType(type), header: index == 0 ? "Convert to Relation" : nil))
            }
            rows.append(Row(label: "Delete Dependency", action: .delete, danger: true))
        } else {
            title = "\(relation.type.label) Link"
            subtitle = nil
            if relation.type == .conflict {
                rows.append(Row(label: relation.isResolved ? "Mark Unresolved" : "Mark Resolved", action: .toggleResolved))
            }
            for (index, type) in RelationType.allCases.enumerated() {
                rows.append(Row(label: type.label, action: .changeType(type), checked: type == relation.type, header: index == 0 ? "Change Type" : nil))
            }
            rows.append(Row(label: "Reverse Direction", action: .reverse))
            rows.append(Row(label: "\(from) → parent of \(to)", action: .addParent(parentId: relation.fromId, childId: relation.toId), header: "Add Child Link"))
            rows.append(Row(label: "\(to) → parent of \(from)", action: .addParent(parentId: relation.toId, childId: relation.fromId)))
            rows.append(Row(label: "Delete Link", action: .delete, danger: true))
        }
        self.rows = rows
    }

    public func run(_ action: Action, document: BoardDocument) {
        switch action {
        case .toggleResolved: document.toggleResolveRelation(relationId)
        case .changeType(let type):
            if document.board.relations[relationId]?.type != type { document.updateRelation(relationId, type: type) }
        case .reverse: document.updateRelation(relationId, reversed: true)
        case .addParent(let parentId, let childId): document.addRelation(from: parentId, to: childId, type: .parent)
        case .delete: document.removeRelation(relationId)
        }
    }

    static func truncate(_ text: String, _ limit: Int = 18) -> String {
        text.count > limit ? String(text.prefix(limit - 1)) + "…" : text
    }
}
