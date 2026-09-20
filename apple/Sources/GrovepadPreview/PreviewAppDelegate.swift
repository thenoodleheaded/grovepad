#if os(macOS)
import AppKit
import SwiftUI
import UniformTypeIdentifiers
import GrovepadCore
import GrovepadCanvas
import GrovepadChrome
import GrovepadApp

// ---------------------------------------------------------------------------
// The preview app: one window over the app layer's coordinator (document,
// local store, autosave, circuit driver, device state) and its Mac canvas
// host — the same pieces the Xcode target under `App/` assembles, minus the
// SwiftUI chrome. Menus for File (Open…, Save As…), Edit (Undo, Redo,
// Delete) and View (Fit, Circuit Mode); a plain bar above the canvas with
// Back, Add, the ⚡ toggle and Fit. Autosave writes the document to
// ~/Library/Application Support/GrovepadPreview/board/ half a second after
// the last commit (the coordinator's own debounce).
// ---------------------------------------------------------------------------

/// The canvas host now lives in `GrovepadApp`; the preview is a thin shell over it.
typealias PreviewCanvasView = MacCanvasHostView

@MainActor
final class PreviewAppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
    static let autosaveDelay: TimeInterval = AppCoordinator.autosaveDelayMs / 1000

    private(set) var window: NSWindow!
    private(set) var coordinator: AppCoordinator!
    private(set) var session: WindowSession!
    private(set) var canvas: PreviewCanvasView!
    var document: BoardDocument { coordinator.document }
    var store: LocalBoardStore { coordinator.store }

    private var backButton: NSButton!
    private var canvasLabel: NSTextField!
    private var statusLabel: NSTextField!
    private var toastReset: DispatchWorkItem?

    /// `GROVEPAD_PREVIEW_STORE=/some/dir` points the autosave elsewhere (the
    /// smoke run uses a scratch folder so it never touches the real board).
    static let storeDirectory: URL = {
        if let override = ProcessInfo.processInfo.environment["GROVEPAD_PREVIEW_STORE"], !override.isEmpty {
            return URL(fileURLWithPath: override, isDirectory: true)
        }
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support")
        return base.appendingPathComponent("GrovepadPreview/board", isDirectory: true)
    }()

    // MARK: - Launch

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildMenus()
        openDocument()
        buildWindow()
        NSApp.activate(ignoringOtherApps: true)
        if ProcessInfo.processInfo.environment["GROVEPAD_PREVIEW_SMOKE"] == "1" {
            PreviewSmoke.run(self)
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func applicationWillTerminate(_ notification: Notification) {
        coordinator.dispose()
    }

    private func openDocument() {
        var deps = AppCoordinator.Dependencies(storeDirectory: PreviewAppDelegate.storeDirectory)
        deps.appVersion = "preview"
        coordinator = AppCoordinator(dependencies: deps)
        coordinator.start()
        session = coordinator.makeSession()
        if let failure = coordinator.startupFailure {
            NSLog("GrovepadPreview: stored board not loaded (%@)", failure)
        }
    }

    /// One workspace with one root canvas, minted with the system minter.
    static func emptyBoard() -> Board { AppCoordinator.emptyBoard() }

    // MARK: - Window and bar

    private func buildWindow() {
        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1280, height: 800),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered, defer: false
        )
        window.title = "Grovepad Preview"
        window.delegate = self
        window.center()
        window.setFrameAutosaveName("GrovepadPreviewWindow")

        let content = NSView(frame: window.contentRect(forFrameRect: window.frame))
        content.wantsLayer = true
        window.contentView = content

        canvas = PreviewCanvasView(session: session, screenScale: window.backingScaleFactor)
        canvas.onSync = { [weak self] in self?.refreshBar() }

        let bar = buildBar()
        bar.translatesAutoresizingMaskIntoConstraints = false
        canvas.translatesAutoresizingMaskIntoConstraints = false
        content.addSubview(bar)
        content.addSubview(canvas)
        NSLayoutConstraint.activate([
            bar.topAnchor.constraint(equalTo: content.topAnchor),
            bar.leadingAnchor.constraint(equalTo: content.leadingAnchor),
            bar.trailingAnchor.constraint(equalTo: content.trailingAnchor),
            bar.heightAnchor.constraint(equalToConstant: 44),
            canvas.topAnchor.constraint(equalTo: bar.bottomAnchor),
            canvas.leadingAnchor.constraint(equalTo: content.leadingAnchor),
            canvas.trailingAnchor.constraint(equalTo: content.trailingAnchor),
            canvas.bottomAnchor.constraint(equalTo: content.bottomAnchor),
        ])

        window.makeKeyAndOrderFront(nil)
        window.makeFirstResponder(canvas)
        refreshBar()
        canvas.fitAll()
    }

    private func buildBar() -> NSView {
        let bar = NSVisualEffectView()
        bar.material = .titlebar
        bar.blendingMode = .withinWindow

        backButton = NSButton(title: "‹ Back", target: self, action: #selector(goBack(_:)))
        backButton.bezelStyle = .rounded
        backButton.toolTip = "Back to the parent canvas"

        canvasLabel = NSTextField(labelWithString: "")
        canvasLabel.font = .systemFont(ofSize: 13, weight: .semibold)
        canvasLabel.lineBreakMode = .byTruncatingTail

        let add = NSPopUpButton(frame: .zero, pullsDown: true)
        add.addItem(withTitle: "Add")
        for type in ["text", "canvas_node", "bullets", "checklist", "flashcards", "counter", "toggle", "number_input"] {
            guard let definition = WidgetRegistry.definition(for: type) else { continue }
            let item = NSMenuItem(title: definition.label, action: #selector(addWidget(_:)), keyEquivalent: "")
            item.target = self
            item.representedObject = type
            add.menu?.addItem(item)
        }
        add.toolTip = "Add a widget at the middle of the view"

        let toggle = NSHostingView(rootView: CircuitModeToggle(document: document))
        toggle.setContentHuggingPriority(.required, for: .horizontal)

        let fit = NSButton(title: "Fit", target: self, action: #selector(fitAll(_:)))
        fit.bezelStyle = .rounded
        fit.toolTip = "Frame every card (⌘0)"

        statusLabel = NSTextField(labelWithString: "")
        statusLabel.font = .systemFont(ofSize: 11)
        statusLabel.textColor = .secondaryLabelColor
        statusLabel.lineBreakMode = .byTruncatingTail
        statusLabel.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)

        let stack = NSStackView(views: [backButton, canvasLabel, NSView(), add, toggle, fit, statusLabel])
        stack.orientation = .horizontal
        stack.alignment = .centerY
        stack.spacing = 10
        stack.edgeInsets = NSEdgeInsets(top: 0, left: 12, bottom: 0, right: 12)
        stack.translatesAutoresizingMaskIntoConstraints = false
        bar.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: bar.topAnchor),
            stack.bottomAnchor.constraint(equalTo: bar.bottomAnchor),
            stack.leadingAnchor.constraint(equalTo: bar.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: bar.trailingAnchor),
        ])
        return bar
    }

    private func refreshBar() {
        let canvasId = document.activeCanvasId
        let meta = document.canvas(canvasId)
        backButton.isEnabled = meta?.parentCanvasId != nil
        var trail: [String] = []
        var cursor: String? = canvasId
        while let id = cursor, let canvas = document.canvas(id) {
            trail.insert(canvas.name, at: 0)
            cursor = canvas.parentCanvasId
        }
        canvasLabel.stringValue = trail.joined(separator: " › ")
        window.title = trail.last.map { "Grovepad Preview — \($0)" } ?? "Grovepad Preview"
        if let toast = session.environment.toasts.toasts.last?.message, toast != statusLabel.stringValue {
            self.toast(toast)
        }
    }

    private func toast(_ message: String) {
        statusLabel.stringValue = message
        toastReset?.cancel()
        let reset = DispatchWorkItem { [weak self] in self?.statusLabel.stringValue = "" }
        toastReset = reset
        DispatchQueue.main.asyncAfter(deadline: .now() + 5, execute: reset)
    }

    // MARK: - Menus

    private func buildMenus() {
        let main = NSMenu()

        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "About Grovepad Preview", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Quit Grovepad Preview", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        let appItem = NSMenuItem()
        appItem.submenu = appMenu
        main.addItem(appItem)

        let file = NSMenu(title: "File")
        file.addItem(withTitle: "Open…", action: #selector(openPackage(_:)), keyEquivalent: "o")
        let saveAs = file.addItem(withTitle: "Save As…", action: #selector(savePackage(_:)), keyEquivalent: "S")
        saveAs.keyEquivalentModifierMask = [.command, .shift]
        file.addItem(.separator())
        file.addItem(withTitle: "Close", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        let fileItem = NSMenuItem()
        fileItem.submenu = file
        main.addItem(fileItem)

        let edit = NSMenu(title: "Edit")
        edit.addItem(withTitle: "Undo", action: #selector(undo(_:)), keyEquivalent: "z")
        let redo = edit.addItem(withTitle: "Redo", action: #selector(redo(_:)), keyEquivalent: "Z")
        redo.keyEquivalentModifierMask = [.command, .shift]
        edit.addItem(.separator())
        edit.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        edit.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        edit.addItem(.separator())
        edit.addItem(withTitle: "Delete Selected Widgets", action: #selector(deleteSelection(_:)), keyEquivalent: "")
        let editItem = NSMenuItem()
        editItem.submenu = edit
        main.addItem(editItem)

        let view = NSMenu(title: "View")
        view.addItem(withTitle: "Fit", action: #selector(fitAll(_:)), keyEquivalent: "0")
        // No bare key equivalent: a menu-level `W` would steal the letter from
        // every text field. The canvas handles W itself while it has focus.
        view.addItem(withTitle: "Circuit Mode (W on the canvas)", action: #selector(toggleCircuitMode(_:)), keyEquivalent: "")
        view.addItem(withTitle: "Back to Parent Canvas", action: #selector(goBack(_:)), keyEquivalent: "[")
        let viewItem = NSMenuItem()
        viewItem.submenu = view
        main.addItem(viewItem)

        NSApp.mainMenu = main
    }

    // MARK: - Undo (the window's undo manager is the document's)

    func windowWillReturnUndoManager(_ window: NSWindow) -> UndoManager? { coordinator.undoManager }

    func windowDidResignKey(_ notification: Notification) {
        canvas.windowDidResignKey()
    }

    func windowWillClose(_ notification: Notification) {
        coordinator.flushAll()
    }

    @objc func undo(_ sender: Any?) { document.undo() }
    @objc func redo(_ sender: Any?) { document.redo() }

    @objc func validateMenuItem(_ item: NSMenuItem) -> Bool {
        switch item.action {
        case #selector(undo(_:)): return document.canUndo
        case #selector(redo(_:)): return document.canRedo
        case #selector(goBack(_:)): return document.canvas(document.activeCanvasId)?.parentCanvasId != nil
        case #selector(deleteSelection(_:)): return !document.selection.isEmpty
        default: return true
        }
    }

    // MARK: - Actions

    @objc func addWidget(_ sender: NSMenuItem) {
        guard let type = sender.representedObject as? String, let definition = WidgetRegistry.definition(for: type) else { return }
        let centre = canvas.viewportCentreWorld
        let position = Vector2D(x: centre.x - definition.defaultSize.width / 2, y: centre.y - definition.defaultSize.height / 2)
        guard let id = document.createWidget(type: type, at: position, title: definition.label) else { return }
        canvas.expand(id)
    }

    @objc func toggleCircuitMode(_ sender: Any?) {
        document.setCircuitMode(!document.circuitUI.circuitMode)
    }

    @objc func fitAll(_ sender: Any?) {
        canvas.fitAll()
    }

    @objc func goBack(_ sender: Any?) {
        guard let parent = document.canvas(document.activeCanvasId)?.parentCanvasId else { return }
        document.navigate(to: parent)
        canvas.fitAll()
    }

    @objc func deleteSelection(_ sender: Any?) {
        canvas.deleteSelection()
    }

    // MARK: - File

    private static var packageType: UTType { .grovepadBoard }

    @objc func openPackage(_ sender: Any?) {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [PreviewAppDelegate.packageType, .zip, .data]
        panel.allowsMultipleSelection = false
        panel.message = "Choose a .grovepad package"
        panel.beginSheetModal(for: window) { [weak self] response in
            guard let self, response == .OK, let url = panel.url else { return }
            do {
                try self.coordinator.importPackage(at: url, mode: .replace)
                self.canvas.fitAll()
            } catch {
                self.presentError(title: "Could not open \(url.lastPathComponent)", error)
            }
        }
    }

    @objc func savePackage(_ sender: Any?) {
        let panel = NSSavePanel()
        panel.allowedContentTypes = [PreviewAppDelegate.packageType]
        panel.nameFieldStringValue = coordinator.exportFileName()
        panel.beginSheetModal(for: window) { [weak self] response in
            guard let self, response == .OK, let url = panel.url else { return }
            do {
                try Data(self.coordinator.exportPackageBytes()).write(to: url, options: .atomic)
                self.toast("Saved \(url.lastPathComponent)")
            } catch {
                self.presentError(title: "Could not save \(url.lastPathComponent)", error)
            }
        }
    }

    private func presentError(title: String, _ error: Error) {
        let alert = NSAlert()
        alert.messageText = title
        alert.informativeText = "\(error)"
        alert.alertStyle = .warning
        alert.beginSheetModal(for: window)
    }
}
#endif
