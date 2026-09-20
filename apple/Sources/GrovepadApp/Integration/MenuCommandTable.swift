import Foundation
import GrovepadChrome

// ---------------------------------------------------------------------------
// The Mac menu bar as data (roadmap phase 7): every custom row `AppCommands`
// draws, with its key and modifiers, so a test can prove the shortcuts are
// unique and agree with `ShortcutsModel` (the overlay's table) wherever the
// overlay names the same action. Rows the system supplies (Cut / Copy /
// Paste / Delete / Select All, Show Sidebar, Minimize / Zoom / window
// tabs, Enter Full Screen) are listed as `.system` so nobody adds a
// clashing custom one. Keep `AppCommands.body` and this table in step.
// ---------------------------------------------------------------------------

public struct MenuCommand: Equatable, Hashable, Sendable {
    public enum Menu: String, Sendable { case file, edit, view, window, help }
    public enum Source: Equatable, Hashable, Sendable { case custom, system }
    public struct Keys: Equatable, Hashable, Sendable {
        public var key: String
        public var command = true
        public var shift = false
        public var option = false
        public var control = false

        /// "⇧⌘Z" as the overlay writes it.
        public var display: String {
            var text = ""
            if control { text += "⌃" }
            if option { text += "⌥" }
            if shift { text += "⇧" }
            if command { text += "⌘" }
            return text + key.uppercased()
        }
    }

    public var menu: Menu
    public var title: String
    public var keys: Keys?
    public var source: Source = .custom
    /// The overlay row this menu item runs (`ShortcutsModel` label), if any.
    public var overlayLabel: String?
}

public enum MenuCommandTable {
    public static let helpURL = URL(string: "https://grovepad.app")!

    /// Every row the menu bar draws right now (Circuit Mode only while the
    /// circuit system is switched on, `CircuitFeature`).
    public static var rows: [MenuCommand] {
        allRows.filter { CircuitFeature.isEnabled || $0.title != "Circuit Mode" }
    }

    static let allRows: [MenuCommand] = [
        // File
        MenuCommand(menu: .file, title: "New Window", keys: .init(key: "n", shift: true)),
        MenuCommand(menu: .file, title: "Add Widget…", keys: .init(key: "n")),
        MenuCommand(menu: .file, title: "Shape a Tree", keys: nil),
        MenuCommand(menu: .file, title: "Open…", keys: .init(key: "o")),
        MenuCommand(menu: .file, title: "Import into Workspace…", keys: .init(key: "o", shift: true)),
        MenuCommand(menu: .file, title: "Save As…", keys: .init(key: "s", shift: true)),
        MenuCommand(menu: .file, title: "Export as .grovepad…", keys: .init(key: "e", shift: true)),
        MenuCommand(menu: .file, title: "Share…", keys: nil),
        // Edit
        MenuCommand(menu: .edit, title: "Undo", keys: .init(key: "z"), overlayLabel: "Undo"),
        MenuCommand(menu: .edit, title: "Redo", keys: .init(key: "z", shift: true), overlayLabel: "Redo"),
        MenuCommand(menu: .edit, title: "Cut", keys: .init(key: "x"), source: .system),
        MenuCommand(menu: .edit, title: "Copy", keys: .init(key: "c"), source: .system),
        MenuCommand(menu: .edit, title: "Paste", keys: .init(key: "v"), source: .system),
        MenuCommand(menu: .edit, title: "Delete", keys: nil, source: .system),
        MenuCommand(menu: .edit, title: "Select All", keys: .init(key: "a"), source: .system),
        MenuCommand(menu: .edit, title: "Duplicate", keys: .init(key: "d"), overlayLabel: "Duplicate selection"),
        MenuCommand(menu: .edit, title: "Lock / Unlock", keys: .init(key: "l"), overlayLabel: "Lock / unlock selection"),
        MenuCommand(menu: .edit, title: "Glue Selection", keys: .init(key: "g"), overlayLabel: "Glue / unglue the selection"),
        MenuCommand(menu: .edit, title: "Unglue Selection", keys: .init(key: "g", shift: true), overlayLabel: "Glue / unglue the selection"),
        MenuCommand(menu: .edit, title: "Delete Selected Cards", keys: .init(key: "⌫")),
        MenuCommand(menu: .edit, title: "Select All Cards", keys: .init(key: "a", shift: true)),
        // View
        MenuCommand(menu: .view, title: "Fit to Board", keys: .init(key: "f", shift: true), overlayLabel: "Frame selection or board"),
        MenuCommand(menu: .view, title: "Zoom In", keys: .init(key: "="), overlayLabel: "Zoom in / out"),
        MenuCommand(menu: .view, title: "Zoom Out", keys: .init(key: "-"), overlayLabel: "Zoom in / out"),
        MenuCommand(menu: .view, title: "Actual Size", keys: .init(key: "0"), overlayLabel: "Reset zoom to 100%"),
        MenuCommand(menu: .view, title: "Circuit Mode", keys: .init(key: "w", shift: true), overlayLabel: "Toggle wire mode"),
        MenuCommand(menu: .view, title: "Show Sidebar", keys: .init(key: "s", control: true), source: .system),
        MenuCommand(menu: .view, title: "Show Canvas Tree", keys: .init(key: "t", option: true)),
        MenuCommand(menu: .view, title: "Back", keys: .init(key: "[")),
        MenuCommand(menu: .view, title: "Forward", keys: .init(key: "]")),
        MenuCommand(menu: .view, title: "Previous Canvas Tab", keys: .init(key: "←", option: true), overlayLabel: "Previous / next canvas tab"),
        MenuCommand(menu: .view, title: "Next Canvas Tab", keys: .init(key: "→", option: true), overlayLabel: "Previous / next canvas tab"),
        MenuCommand(menu: .view, title: "Close Canvas Tab", keys: .init(key: "w", option: true), overlayLabel: "Close the current canvas tab"),
        MenuCommand(menu: .view, title: "Search…", keys: .init(key: "k"), overlayLabel: "Command palette — searches every canvas"),
        MenuCommand(menu: .view, title: "Enter Full Screen", keys: .init(key: "f", control: true), source: .system),
        // Window (all system: SwiftUI's WindowGroup + automatic window tabbing)
        MenuCommand(menu: .window, title: "Minimize", keys: .init(key: "m"), source: .system),
        MenuCommand(menu: .window, title: "Zoom", keys: nil, source: .system),
        MenuCommand(menu: .window, title: "Show Previous Tab", keys: nil, source: .system),
        MenuCommand(menu: .window, title: "Show Next Tab", keys: nil, source: .system),
        MenuCommand(menu: .window, title: "Move Tab to New Window", keys: nil, source: .system),
        MenuCommand(menu: .window, title: "Merge All Windows", keys: nil, source: .system),
        MenuCommand(menu: .window, title: "Bring All to Front", keys: nil, source: .system),
        // Help
        MenuCommand(menu: .help, title: "Keyboard Shortcuts", keys: .init(key: "/"), overlayLabel: "This shortcut list"),
        MenuCommand(menu: .help, title: "Grovepad Help", keys: nil),
    ]

    public static func rows(in menu: MenuCommand.Menu) -> [MenuCommand] { rows.filter { $0.menu == menu } }

    /// Two rows claiming one key combination.
    public static var duplicateShortcuts: [String] {
        var seen: [String: String] = [:]
        var clashes: [String] = []
        for row in rows {
            guard let keys = row.keys else { continue }
            let display = keys.display
            if let other = seen[display] { clashes.append("\(display): \(other) / \(row.title)") } else { seen[display] = row.title }
        }
        return clashes
    }

    /// The overlay rows a menu item names but the overlay does not list.
    public static var unknownOverlayLabels: [String] {
        let known = Set(ShortcutsModel.sections.flatMap { $0.rows.map(\.label) })
        return rows.compactMap(\.overlayLabel).filter { !known.contains($0) }
    }
}
