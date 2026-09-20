import Foundation
import GrovepadCore

// ---------------------------------------------------------------------------
// The widget context menu (`WidgetContextMenu.tsx`, `nativeMenu.ts`): one
// row list built from the document, read by both surfaces — a system menu on
// the Mac, the system action sheet on iOS — so an action can never exist on
// one and not the other. Rows are described, never drawn, here.
// ---------------------------------------------------------------------------

public struct ContextMenuRow: Equatable, Identifiable, Sendable {
    public enum ID: String, Sendable {
        case openCanvas = "open-canvas"
        case duplicate, rename, lock, unglue
        case strictHold = "strict-hold"
        case delete
        /// The device-local WidgetKit Note choice (`useNativeWidgetStore`):
        /// present on Text cards only when the app supplies the state.
        case noteWidget = "note-widget"
    }

    public var id: ID
    public var label: String
    public var symbol: String
    public var danger = false
    public var separatorBefore = false
}

/// What a row does, handed to the presenter so the menu itself stays pure.
public struct ContextMenuActions {
    public var navigate: (String) -> Void
    public var startRenaming: (String) -> Void
    public var requestDeletion: ([String]) -> Void
    public var close: () -> Void
    /// "Show in widget" / "Remove from widget": the app target owns the
    /// choice (device state, never board data); the chrome only asks.
    public var toggleNoteWidget: (String) -> Void

    public init(navigate: @escaping (String) -> Void, startRenaming: @escaping (String) -> Void, requestDeletion: @escaping ([String]) -> Void, close: @escaping () -> Void = {}, toggleNoteWidget: @escaping (String) -> Void = { _ in }) {
        self.navigate = navigate
        self.startRenaming = startRenaming
        self.requestDeletion = requestDeletion
        self.close = close
        self.toggleNoteWidget = toggleNoteWidget
    }
}

public struct ContextMenuModel: Equatable {
    /// Whether the pressed card is the one the OS widget shows
    /// (`WidgetContextMenu.tsx`: "Use in home-screen widget" / "Remove from
    /// home-screen widget"). Nil hides the row (no widget host, not a Text card).
    public enum NoteWidgetState: Equatable, Sendable {
        case shown
        case available
    }

    public var widgetId: String
    public var title: String
    /// The selection when the pressed card is part of it, else the card alone.
    public var actionIds: [String]
    public var rows: [ContextMenuRow]

    /// `useMemo(actions)`: every value the rows read is derived from the
    /// document, so both surfaces show the same menu. `nativeMenu` drops
    /// the desktop key hint from Rename (a phone has no F2).
    public init?(widgetId: String, document: BoardDocument, nativeMenu: Bool = false, noteWidget: NoteWidgetState? = nil) {
        guard let widget = document.widget(widgetId) else { return nil }
        self.widgetId = widgetId
        title = widget.title
        let isSelected = document.isSelected(widgetId)
        actionIds = isSelected ? document.selection : [widgetId]
        let many = actionIds.count > 1
        let count = actionIds.count
        var list: [ContextMenuRow] = []

        if widget.type == "canvas_node" {
            list.append(ContextMenuRow(id: .openCanvas, label: "Open canvas", symbol: "folder"))
        }
        list.append(ContextMenuRow(id: .duplicate, label: many ? "Duplicate \(count)" : "Duplicate", symbol: "plus.square.on.square"))
        list.append(ContextMenuRow(id: .rename, label: nativeMenu ? "Rename" : "Rename (F2)", symbol: "pencil.line"))
        let locked = widget.metadata.locked
        list.append(ContextMenuRow(
            id: .lock,
            label: many ? (locked ? "Unlock \(count)" : "Lock \(count)") : (locked ? "Unlock widget" : "Lock widget"),
            symbol: locked ? "lock.open" : "lock"
        ))
        if document.glue(containing: widgetId) != nil {
            list.append(ContextMenuRow(id: .unglue, label: "Unglue", symbol: "drop"))
        }
        if widget.type == "text", let noteWidget {
            list.append(ContextMenuRow(
                id: .noteWidget,
                label: noteWidget == .shown ? "Remove from widget" : "Show in widget",
                symbol: noteWidget == .shown ? "rectangle.slash" : "rectangle.on.rectangle"
            ))
        }
        if document.hasFamily(widgetId) {
            let hold = document.resolveStrictHold(widgetId)
            let releasedBy = hold.inheritedFrom.flatMap { document.widget($0)?.title }
            let label: String
            if hold.strict {
                label = "Release strict hold"
            } else if let releasedBy {
                label = "Hold family strictly (released by \(ContextMenuModel.truncate(releasedBy, 12)))"
            } else {
                label = "Hold family strictly"
            }
            list.append(ContextMenuRow(id: .strictHold, label: label, symbol: hold.strict ? "point.3.connected.trianglepath.dotted" : "magnet", separatorBefore: true))
        }
        list.append(ContextMenuRow(id: .delete, label: many ? "Delete \(count)" : "Delete", symbol: "trash", danger: true, separatorBefore: true))
        rows = list
    }

    static func truncate(_ text: String, _ limit: Int) -> String {
        text.count <= limit ? text : String(text.prefix(limit)) + "…"
    }

    /// `run(action)`: the row's effect through the document, then close.
    public func run(_ id: ContextMenuRow.ID, document: BoardDocument, actions: ContextMenuActions) {
        defer { actions.close() }
        guard let widget = document.widget(widgetId) else { return }
        switch id {
        case .openCanvas:
            if let canvasId = widget.data.string("canvasId") { actions.navigate(canvasId) }
        case .duplicate:
            document.duplicateWidgets(actionIds)
        case .rename:
            actions.startRenaming(widgetId)
        case .lock:
            // The pressed card decides the direction for a mixed selection.
            document.setLocked(actionIds, !widget.metadata.locked)
        case .unglue:
            document.unglueWidget(widgetId)
        case .strictHold:
            document.setStrictHold([widgetId], !document.resolveStrictHold(widgetId).strict)
        case .delete:
            actions.requestDeletion(actionIds)
        case .noteWidget:
            actions.toggleNoteWidget(widgetId)
        }
    }

    /// The system action sheet's shape (`presentNativeMenu`): title, items
    /// with a danger flag, and the chosen index → row id.
    public struct ActionSheet: Equatable, Sendable {
        public struct Item: Equatable, Sendable {
            public var label: String
            public var danger: Bool
        }
        public var title: String?
        public var items: [Item]
    }

    public var actionSheet: ActionSheet {
        ActionSheet(title: title.isEmpty ? nil : title, items: rows.map { ActionSheet.Item(label: $0.label, danger: $0.danger) })
    }

    /// `null` (dismissed) or an out-of-range index is an ordinary answer.
    public func row(atSheetIndex index: Int?) -> ContextMenuRow.ID? {
        guard let index, rows.indices.contains(index) else { return nil }
        return rows[index].id
    }
}
