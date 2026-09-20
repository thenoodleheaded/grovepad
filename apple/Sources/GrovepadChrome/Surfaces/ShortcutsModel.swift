import Foundation

// ---------------------------------------------------------------------------
// The keyboard and gesture table (`ShortcutsOverlay.tsx`). One linear list,
// never split into pages; the rows that ARE actions run from the overlay.
// ---------------------------------------------------------------------------

public struct ShortcutRow: Equatable, Hashable, Sendable {
    public var keys: [String]
    public var label: String
}

public struct ShortcutSection: Equatable, Hashable, Sendable {
    public var title: String
    public var rows: [ShortcutRow]
}

/// The eight rows the overlay can run, as the web's `ACTIONABLE` set.
public enum ShortcutAction: String, CaseIterable, Sendable {
    case frame = "Frame selection or board"
    case zoomIn = "Zoom in / out"
    case resetZoom = "Reset zoom to 100%"
    case quickAdd = "Quick add — one card per line"
    case undo = "Undo"
    case redo = "Redo"
    case duplicate = "Duplicate selection"
    case palette = "Command palette — searches every canvas"
}

public struct ShortcutsModel {
    public static let sections: [ShortcutSection] = [
        ShortcutSection(title: "Touch & trackpad", rows: [
            ShortcutRow(keys: ["1 finger"], label: "Pan in Navigate mode"),
            ShortcutRow(keys: ["2 fingers"], label: "Pan from any tool"),
            ShortcutRow(keys: ["Pinch"], label: "Zoom around your fingers"),
            ShortcutRow(keys: ["Tap"], label: "Select a card or clear selection"),
            ShortcutRow(keys: ["Select + Drag"], label: "Move a selected card"),
            ShortcutRow(keys: ["Pencil"], label: "Pressure-sensitive Sketchpad ink"),
        ]),
        ShortcutSection(title: "Canvas", rows: [
            ShortcutRow(keys: ["Scroll"], label: "Pan the canvas"),
            ShortcutRow(keys: ["⌘ Scroll", "Pinch"], label: "Zoom at cursor"),
            ShortcutRow(keys: ["Space + Drag", "Middle Drag"], label: "Pan (grab)"),
            ShortcutRow(keys: ["H"], label: "Navigate tool"),
            ShortcutRow(keys: ["V"], label: "Select tool"),
            ShortcutRow(keys: ["W"], label: "Toggle wire mode"),
            ShortcutRow(keys: ["F"], label: "Frame selection or board"),
            ShortcutRow(keys: ["+", "−", "⌘+", "⌘−"], label: "Zoom in / out"),
            ShortcutRow(keys: ["0", "⌘0"], label: "Reset zoom to 100%"),
        ]),
        ShortcutSection(title: "Create & edit", rows: [
            ShortcutRow(keys: ["Double-click empty canvas"], label: "Shape a tree at cursor"),
            ShortcutRow(keys: ["N"], label: "Quick add — one card per line"),
            ShortcutRow(keys: ["Right-click"], label: "Canvas / widget menu"),
            ShortcutRow(keys: ["⌘ Drag card"], label: "Draw a relation link"),
            ShortcutRow(keys: ["⌘Z"], label: "Undo"),
            ShortcutRow(keys: ["⇧⌘Z", "⌃Y"], label: "Redo"),
            ShortcutRow(keys: ["⌘D"], label: "Duplicate selection"),
            ShortcutRow(keys: ["⌘C"], label: "Copy selection"),
            ShortcutRow(keys: ["⌘X"], label: "Cut selection"),
            ShortcutRow(keys: ["⌘V"], label: "Paste widgets, images, or text"),
            ShortcutRow(keys: ["F2"], label: "Rename selected widget"),
            ShortcutRow(keys: ["⌘L"], label: "Lock / unlock selection"),
            ShortcutRow(keys: ["⌘]", "⌘["], label: "Bring to front / send to back"),
            ShortcutRow(keys: ["⌘S"], label: "Autosave status — nothing to save by hand"),
        ]),
        ShortcutSection(title: "Selection", rows: [
            ShortcutRow(keys: ["Click"], label: "Select widget"),
            ShortcutRow(keys: ["⌥ Drag"], label: "Glue / unglue widget"),
            ShortcutRow(keys: ["⇧ Click"], label: "Toggle in selection"),
            ShortcutRow(keys: ["⌘G", "⇧⌘G"], label: "Glue / unglue the selection"),
            ShortcutRow(keys: ["Drag"], label: "Marquee — replaces the selection"),
            ShortcutRow(keys: ["⇧ Drag"], label: "Marquee — adds to the selection"),
            ShortcutRow(keys: ["⌥ Drag on canvas"], label: "Marquee — removes from the selection"),
            ShortcutRow(keys: ["⌘A"], label: "Select all"),
            ShortcutRow(keys: ["Esc"], label: "Clear selection / exit wire mode"),
            ShortcutRow(keys: ["⌫"], label: "Delete selection"),
            ShortcutRow(keys: ["Arrows", "⇧ Arrows", "⌥ Arrows"], label: "Nudge (grid / coarse / fine)"),
            ShortcutRow(keys: ["X"], label: "Start dependency link"),
            ShortcutRow(keys: ["⌘ Enter"], label: "Widget menu on focused card"),
        ]),
        ShortcutSection(title: "Find & navigate", rows: [
            ShortcutRow(keys: ["⌘K", "⌘F"], label: "Command palette — searches every canvas"),
            ShortcutRow(keys: ["⌥←", "⌥→"], label: "View history back / forward"),
            ShortcutRow(keys: ["⌘,"], label: "Settings"),
            ShortcutRow(keys: ["Double-click canvas card"], label: "Enter a canvas"),
            ShortcutRow(keys: ["Breadcrumb click"], label: "Jump back up the canvas path"),
            ShortcutRow(keys: ["⌘ Click"], label: "Open a canvas in a background tab"),
            ShortcutRow(keys: ["⌘⇧ Click"], label: "Open a canvas in a new tab and go there"),
            ShortcutRow(keys: ["⌘⌥←", "⌘⌥→"], label: "Previous / next canvas tab"),
            ShortcutRow(keys: ["⌘⌥W"], label: "Close the current canvas tab"),
            ShortcutRow(keys: ["?"], label: "This shortcut list"),
        ]),
    ]

    public static func isActionable(_ label: String) -> Bool { ShortcutAction(rawValue: label) != nil }

    public static var rowCount: Int { sections.reduce(0) { $0 + $1.rows.count } }

    /// Runs an actionable row through the app's services.
    public struct Actions {
        public var frame: () -> Void
        public var zoomIn: () -> Void
        public var resetZoom: () -> Void
        public var quickAdd: () -> Void
        public var undo: () -> Void
        public var redo: () -> Void
        public var duplicate: () -> Void
        public var palette: () -> Void
        public var close: () -> Void

        public init(frame: @escaping () -> Void = {}, zoomIn: @escaping () -> Void = {}, resetZoom: @escaping () -> Void = {}, quickAdd: @escaping () -> Void = {}, undo: @escaping () -> Void = {}, redo: @escaping () -> Void = {}, duplicate: @escaping () -> Void = {}, palette: @escaping () -> Void = {}, close: @escaping () -> Void = {}) {
            self.frame = frame
            self.zoomIn = zoomIn
            self.resetZoom = resetZoom
            self.quickAdd = quickAdd
            self.undo = undo
            self.redo = redo
            self.duplicate = duplicate
            self.palette = palette
            self.close = close
        }
    }

    /// `runShortcut`: the action, then the overlay closes.
    @discardableResult
    public static func run(_ label: String, _ actions: Actions) -> Bool {
        guard let action = ShortcutAction(rawValue: label) else { return false }
        switch action {
        case .frame: actions.frame()
        case .zoomIn: actions.zoomIn()
        case .resetZoom: actions.resetZoom()
        case .quickAdd: actions.quickAdd()
        case .undo: actions.undo()
        case .redo: actions.redo()
        case .duplicate: actions.duplicate()
        case .palette: actions.palette()
        }
        actions.close()
        return true
    }
}
