import XCTest
import SwiftUI
import GrovepadCore
import GrovepadCanvas
import GrovepadChrome
@testable import GrovepadApp
#if canImport(AppKit)
import AppKit
#endif

/// The Mac menu table (unique shortcuts, agreement with the overlay), the
/// haptic wiring (connect / delete / toggle), and the editor being a real
/// system text input (what Scribble and VoiceOver need).
@MainActor
final class IntegrationMenusAndFeedbackTests: XCTestCase {

    /// These tests exercise the circuit system, which the app ships frozen
    /// (`CircuitFeature`); each switches it on for itself only.
    override func invokeTest() {
        let previous = CircuitFeature.isEnabled
        CircuitFeature.isEnabled = true
        defer { CircuitFeature.isEnabled = previous }
        super.invokeTest()
    }
    private var directory: URL!

    override func setUp() {
        super.setUp()
        directory = AppFixtures.temporaryDirectory("menus")
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: directory)
        super.tearDown()
    }

    func testMenuTableHasEveryMenuUniqueShortcutsAndKnownOverlayRows() {
        for menu in [MenuCommand.Menu.file, .edit, .view, .window, .help] {
            XCTAssertFalse(MenuCommandTable.rows(in: menu).isEmpty, "\(menu) has rows")
        }
        XCTAssertEqual(MenuCommandTable.duplicateShortcuts, [])
        XCTAssertEqual(MenuCommandTable.unknownOverlayLabels, [])
        let custom = MenuCommandTable.rows.filter { $0.source == .custom }.map(\.title)
        for title in ["New Window", "Open…", "Import into Workspace…", "Save As…", "Export as .grovepad…", "Undo", "Redo", "Duplicate", "Delete Selected Cards", "Select All Cards", "Fit to Board", "Zoom In", "Zoom Out", "Actual Size", "Circuit Mode", "Show Canvas Tree", "Close Canvas Tab", "Keyboard Shortcuts", "Grovepad Help"] {
            XCTAssertTrue(custom.contains(title), "\(title) is drawn")
        }
        let system = MenuCommandTable.rows.filter { $0.source == .system }.map(\.title)
        for title in ["Cut", "Copy", "Paste", "Delete", "Select All", "Show Sidebar", "Minimize", "Merge All Windows"] {
            XCTAssertTrue(system.contains(title), "\(title) is the system's")
        }
        // The overlay's own keys where the menu names the same action.
        XCTAssertEqual(MenuCommandTable.rows.first { $0.title == "Actual Size" }?.keys?.display, "⌘0")
        XCTAssertEqual(MenuCommandTable.rows.first { $0.title == "Close Canvas Tab" }?.keys?.display, "⌥⌘W")
        XCTAssertEqual(MenuCommandTable.rows.first { $0.title == "Search…" }?.keys?.display, "⌘K")
        XCTAssertEqual(MenuCommandTable.rows.first { $0.title == "Duplicate" }?.keys?.display, "⌘D")
    }

    func testHapticsTickOnDeleteConnectAndCircuitToggle() throws {
        let haptics = Haptics()
        var deps = AppCoordinator.Dependencies(storeDirectory: directory)
        deps.timers = ManualTimerSource()
        deps.clock = .fixed(ms: 1_789_000_000_000)
        deps.mint = .counting(prefix: "app-")
        deps.heartbeat = FakeHeartbeat()
        deps.settingsStore = InMemoryKeyValueStore()
        deps.toastScheduler = ManualToastScheduler()
        deps.frameScheduler = { ManualScheduler() }
        deps.noteWidgetFileURL = directory.appendingPathComponent("payload.json")
        deps.widgetReloader = RecordingWidgetReloader()
        deps.searchIndex = RecordingSearchableIndex()
        deps.haptics = haptics
        let coordinator = AppCoordinator(dependencies: deps)
        coordinator.start()
        defer { coordinator.dispose() }
        let document = coordinator.document

        let source = try XCTUnwrap(document.createWidget(type: "counter", at: .zero, title: "A"))
        let target = try XCTUnwrap(document.createWidget(type: "number_input", at: Vector2D(x: 400, y: 0), title: "B"))
        XCTAssertEqual(haptics.log, [], "creating and renaming are silent")
        document.renameWidget(source, title: "A2")
        XCTAssertEqual(haptics.log, [])

        let wire = try XCTUnwrap(document.addValueConnection(from: source, field: "count", to: target, field: "value"))
        XCTAssertEqual(haptics.log, [.commit], "a wire landing is a commit tick")
        document.removeConnection(wire)
        XCTAssertEqual(haptics.log, [.commit], "removing a wire is silent")

        _ = document.deleteWidgets([target])
        XCTAssertEqual(haptics.log, [.commit, .commit], "a deletion is a commit tick")
        document.undo()
        document.redo()
        XCTAssertEqual(haptics.log, [.commit, .commit], "undo and redo are silent: nothing the finger just did")
        var loaded = document.board
        loaded.widgets = loaded.widgets.filter { key, _ in key != source }
        document.loadBoard(loaded)
        XCTAssertEqual(haptics.log, [.commit, .commit], "a board load (import, sync) is silent")

        document.setCircuitMode(true)
        try awaitTicks(until: { haptics.log.count == 3 })
        XCTAssertEqual(haptics.log.last, .detent, "the ⚡ toggle is a detent")
        document.setCircuitMode(false)
        try awaitTicks(until: { haptics.log.count == 4 })
        XCTAssertEqual(haptics.log, [.commit, .commit, .detent, .detent])
    }

    #if canImport(AppKit)
    /// Scribble (iPad) and VoiceOver need a system text view, not a drawn
    /// one: on the Mac the same editor is an editable `NSTextView` with the
    /// text-area accessibility role; on iOS it is a `UITextView`, which
    /// conforms to `UITextInput` — the contract Scribble writes through.
    func testTheTextKitEditorIsARealSystemTextInput() throws {
        let editor = TextKitEditor(text: .constant("hello"), placeholder: "Write…")
        let host = NSHostingView(rootView: editor.frame(width: 300, height: 200))
        host.frame = NSRect(x: 0, y: 0, width: 300, height: 200)
        host.layoutSubtreeIfNeeded()
        let textView = try XCTUnwrap(firstTextView(in: host), "the editor hosts an NSTextView")
        XCTAssertTrue(textView.isEditable)
        XCTAssertTrue(textView.isSelectable)
        XCTAssertEqual(textView.string, "hello")
        XCTAssertTrue(textView.isAccessibilityElement())
        XCTAssertEqual(textView.accessibilityRole(), .textArea)
        XCTAssertNotNil(textView.textLayoutManager, "TextKit 2")
    }

    private func firstTextView(in view: NSView) -> NSTextView? {
        if let text = view as? NSTextView { return text }
        for child in view.subviews {
            if let found = firstTextView(in: child) { return found }
        }
        return nil
    }
    #endif

    private func awaitTicks(until done: @escaping () -> Bool) throws {
        for _ in 0..<50 where !done() {
            RunLoop.main.run(until: Date().addingTimeInterval(0.02))
        }
        XCTAssertTrue(done(), "the observation turn delivered the tick")
    }
}
