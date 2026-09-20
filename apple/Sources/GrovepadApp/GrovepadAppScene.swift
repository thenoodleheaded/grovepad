import SwiftUI
import UniformTypeIdentifiers
import GrovepadCore
import GrovepadCanvas
import GrovepadChrome
#if canImport(CoreSpotlight)
import CoreSpotlight
#endif
#if canImport(AppKit)
import AppKit
#endif

// ---------------------------------------------------------------------------
// The SwiftUI `App` body the Xcode target uses: a window group whose every
// window is a `WindowSession` over the one document (Mac: several windows,
// iPad: several scenes), the login gate in front of it while an account
// service exists and nobody chose guest, the platform canvas slot in
// `RootScene`'s slot, the Mac menu commands, `.grovepad` and
// `grovepad://` URLs, and the scene-phase hooks (flush on the way out,
// sync on the way back). The Mac also gets a Settings window.
// ---------------------------------------------------------------------------

public extension UTType {
    /// `app.grovepad.board`, a ZIP archive with the `.grovepad` extension.
    static let grovepadBoard = UTType(exportedAs: "app.grovepad.board", conformingTo: .zip)
}

/// A `.grovepad` archive for `fileExporter`.
public struct GrovepadPackageDocument: FileDocument {
    public static var readableContentTypes: [UTType] { [.grovepadBoard, .zip] }
    public static var writableContentTypes: [UTType] { [.grovepadBoard] }
    public var bytes: [UInt8]

    public init(bytes: [UInt8]) { self.bytes = bytes }

    public init(configuration: ReadConfiguration) throws {
        bytes = [UInt8](configuration.file.regularFileContents ?? Data())
    }

    public func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: Data(bytes))
    }
}

struct WindowSessionKey: FocusedValueKey {
    typealias Value = WindowSession
}

public extension FocusedValues {
    var windowSession: WindowSession? {
        get { self[WindowSessionKey.self] }
        set { self[WindowSessionKey.self] = newValue }
    }
}

public struct GrovepadAppScene: Scene {
    @State private var shell = AppShell.obtain()
    #if os(macOS)
    @NSApplicationDelegateAdaptor(MacAppDelegate.self) private var appDelegate
    #endif

    public init() {}

    public var body: some Scene {
        WindowGroup("Grovepad", id: "board") {
            AppRootView(shell: shell)
        }
        #if os(macOS)
        // One compact row: the traffic lights, the wordmark and the controls
        // share the title bar, which floats over the canvas (no bar of its own).
        .windowToolbarStyle(.unifiedCompact(showsTitle: false))
        #endif
        .handlesExternalEvents(matching: ["grovepad", "file"])
        .commands { AppCommands(shell: shell) }
        #if os(macOS)
        Settings {
            SettingsSceneView(shell: shell)
        }
        #endif
    }
}

// MARK: - Root view (one per window)

struct AppRootView: View {
    let shell: AppShell
    @State private var session: WindowSession?
    @State private var login: LoginViewModel?
    @State private var account: AccountViewModel?
    @State private var exportDocument: GrovepadPackageDocument?
    @State private var importing = false
    /// File ▸ Import into Workspace… skips the open dialog's question.
    @State private var importMode: PackageImportMode?
    /// The boot splash plays once per window, over whatever is behind it.
    @State private var splashing = true
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    #if os(macOS)
    @Environment(\.controlActiveState) private var controlActiveState
    #endif

    private var coordinator: AppCoordinator { shell.coordinator }

    var body: some View {
        Group {
            if let session {
                if coordinator.needsLogin, let login {
                    LoginView(model: login)
                        .transition(.opacity)
                } else {
                    RootScene(environment: session.environment, canvas: AnyView(canvasSlot(session)))
                        .transition(.opacity)
                        .overlay(alignment: .bottom) {
                            GuestBackupNudge(coordinator: coordinator, shaping: session.environment.chrome.treeShaper.isActive) {
                                coordinator.leaveGuestMode()
                            }
                        }
                }
            } else {
                GlassTokens.ground.ignoresSafeArea()
            }
        }
        // The sign-in scene and the board cross-fade as one window.
        .animation(.easeInOut(duration: reduceMotion ? 0.12 : 0.28), value: coordinator.needsLogin)
        .background(GlassTokens.ground.ignoresSafeArea())
        .overlay {
            if splashing {
                BootSplashView()
                    .transition(.opacity.combined(with: .scale(scale: 1.03)))
                    .onTapGesture { endSplash() }
                    .task {
                        // Long enough for the entrance to land and one pulse
                        // to travel; a click skips it.
                        try? await Task.sleep(for: .seconds(reduceMotion ? 0.8 : 3.2))
                        endSplash()
                    }
            }
        }
        // Settings ▸ Appearance: System (nil), Light or Dark, for this window
        // and everything hosted in it — live cards included.
        .preferredColorScheme(session?.environment.settings.preferredColorScheme)
        .focusedSceneValue(\.windowSession, session)
        .onAppear(perform: open)
        .onDisappear { if let session { coordinator.closeSession(session) } }
        .onChange(of: scenePhase) { _, phase in
            switch phase {
            case .active: coordinator.noteScenePhase(.active)
            case .inactive: coordinator.noteScenePhase(.inactive)
            case .background: coordinator.noteScenePhase(.background)
            @unknown default: break
            }
        }
        .onOpenURL { url in coordinator.handle(url: url) }
        // Handoff + window restoration: the active canvas and camera of
        // this window; continued on the other device (or after relaunch).
        .userActivity(CanvasActivityPayload.activityType, isActive: session != nil && !coordinator.needsLogin) { activity in
            guard let session else { return }
            let payload = coordinator.activityPayload(for: session)
            payload.apply(to: activity, canvasName: coordinator.document.canvasName(payload.canvasId) ?? "")
        }
        .onContinueUserActivity(CanvasActivityPayload.activityType) { activity in
            coordinator.continueActivity(activity, in: session)
        }
        #if canImport(CoreSpotlight)
        .onContinueUserActivity(CSSearchableItemActionType) { activity in
            coordinator.continueActivity(activity, in: session)
        }
        #endif
        .confirmationDialog(
            "Open \(coordinator.pendingImport?.lastPathComponent ?? "package")",
            isPresented: Binding(get: { coordinator.pendingImport != nil }, set: { if !$0 { coordinator.pendingImport = nil } }),
            titleVisibility: .visible
        ) {
            Button("Add as a new workspace") { runImport(.newWorkspace) }
            Button("Replace this board", role: .destructive) { runImport(.replace) }
            Button("Cancel", role: .cancel) { coordinator.pendingImport = nil }
        } message: {
            Text("A new workspace keeps everything you have; replacing swaps the whole board for the file's.")
        }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.grovepadBoard, .zip, .data]) { result in
            guard case .success(let url) = result else { importMode = nil; return }
            if let mode = importMode {
                importMode = nil
                coordinator.pendingImport = url
                runImport(mode)
            } else {
                coordinator.pendingImport = url
            }
        }
        .fileExporter(isPresented: Binding(get: { exportDocument != nil }, set: { if !$0 { exportDocument = nil } }), document: exportDocument, contentType: .grovepadBoard, defaultFilename: coordinator.exportFileName()) { result in
            exportDocument = nil
            if case .success(let url) = result, let session { session.environment.toasts.add("Saved \(url.lastPathComponent)") }
        }
        .onReceive(NotificationCenter.default.publisher(for: .grovepadImportRequested)) { note in
            importMode = (note.userInfo?[Notification.importModeKey] as? String) == "newWorkspace" ? .newWorkspace : nil
            importing = true
        }
        .onReceive(NotificationCenter.default.publisher(for: .grovepadExportRequested)) { _ in
            exportDocument = GrovepadPackageDocument(bytes: coordinator.exportPackageBytes())
        }
        #if os(macOS)
        .onChange(of: controlActiveState) { _, state in
            if state == .key, let session { coordinator.noteSessionActive(session) }
        }
        #endif
    }

    private func endSplash() {
        guard splashing else { return }
        withAnimation(.easeInOut(duration: reduceMotion ? 0.2 : 0.6)) { splashing = false }
    }

    private func open() {
        guard session == nil else { return }
        shell.start()
        let session = coordinator.makeSession()
        self.session = session
        let account = AccountViewModel(coordinator: coordinator)
        self.account = account
        session.environment.settings.accountContent = { AnyView(AccountSectionView(model: account)) }
        let settings = session.environment.settings
        settings.accountPanelContent = { actions in AccountPanel.parts(model: account, settings: settings, actions: actions) }
        // A guest's account button swaps the window to the sign-in scene;
        // "Continue as guest" there brings the board back.
        if shell.authenticator != nil {
            session.environment.settings.openSignIn = { [coordinator] in coordinator.leaveGuestMode() }
        }
        login = LoginViewModel(auth: shell.authenticator) { coordinator.continueAsGuest() }
    }

    @ViewBuilder
    private func canvasSlot(_ session: WindowSession) -> some View {
        #if os(macOS)
        MacCanvasSlot(session: session)
        #else
        TouchCanvasSlot(session: session)
        #endif
    }

    private func runImport(_ mode: PackageImportMode) {
        guard let url = coordinator.pendingImport else { return }
        coordinator.pendingImport = nil
        do {
            try coordinator.importPackage(at: url, mode: mode)
        } catch {
            session?.environment.toasts.add("Could not open \(url.lastPathComponent): \(error)")
        }
    }
}

public extension Notification {
    /// `userInfo` key on `grovepadImportRequested`: "newWorkspace" skips the question.
    static let importModeKey = "mode"
}

public extension Notification.Name {
    /// File ▸ Open… / Import into Workspace… (the root view owns the importer sheet).
    static let grovepadImportRequested = Notification.Name("app.grovepad.import-requested")
    /// File ▸ Export as .grovepad… (the root view owns the exporter sheet).
    static let grovepadExportRequested = Notification.Name("app.grovepad.export-requested")
}

// MARK: - Commands (Mac menu bar; the same shortcuts on an iPad keyboard)

struct AppCommands: Commands {
    let shell: AppShell
    @FocusedValue(\.windowSession) private var session
    @Environment(\.openWindow) private var openWindow

    private var document: BoardDocument? { session?.document }

    /// The menu bar as a table (phase 7): every row here is a `Button` in
    /// `body`, and `MenuCommandTable` is what the test judges — one copy of
    /// the shortcuts, agreeing with `ShortcutsModel` where the table has them.
    var body: some Commands {
        CommandGroup(replacing: .undoRedo) {
            Button("Undo") { document?.undo() }
                .keyboardShortcut("z", modifiers: .command)
                .disabled(!(document?.canUndo ?? false))
            Button("Redo") { document?.redo() }
                .keyboardShortcut("z", modifiers: [.command, .shift])
                .disabled(!(document?.canRedo ?? false))
        }
        // Cut / Copy / Paste / Delete / Select All stay the system's
        // (`.pasteboard`): they reach the focused text field through the
        // responder chain; the card-level rows sit under them.
        CommandGroup(after: .pasteboard) {
            Divider()
            Button("Duplicate") { guard let document else { return }; document.duplicateWidgets(document.selection) }
                .keyboardShortcut("d", modifiers: .command)
                .disabled(document?.selection.isEmpty ?? true)
            Button(lockLabel) { guard let document, let first = document.selection.first, let widget = document.widget(first) else { return }; document.setLocked(document.selection, !widget.metadata.locked) }
                .keyboardShortcut("l", modifiers: .command)
                .disabled(document?.selection.isEmpty ?? true)
            Button("Glue Selection") { document?.glueSelectionCommand(unglue: false) }
                .keyboardShortcut("g", modifiers: .command)
                .disabled((document?.selection.count ?? 0) < 2)
            Button("Unglue Selection") { document?.glueSelectionCommand(unglue: true) }
                .keyboardShortcut("g", modifiers: [.command, .shift])
                .disabled(document?.selection.isEmpty ?? true)
            Button("Delete Selected Cards") { guard let session, let document else { return }; session.environment.deletion.request(document.selection) }
                .keyboardShortcut(.delete, modifiers: .command)
                .disabled(document?.selection.isEmpty ?? true)
            Button("Select All Cards") { guard let document else { return }; document.selectWidgets(document.board.widgets(on: document.activeCanvasId).map(\.id)) }
                .keyboardShortcut("a", modifiers: [.command, .shift])
                .disabled(document == nil)
        }
        CommandGroup(replacing: .newItem) {
            Button("New Window") { openWindow(id: "board") }
                .keyboardShortcut("n", modifiers: [.command, .shift])
            Button("Add Widget…") { session?.environment.toolbar.openAddWidget() }
                .keyboardShortcut("n", modifiers: .command)
                .disabled(session == nil)
            Button("Shape a Tree") { session?.environment.toolbar.shapeTree() }
                .disabled(session == nil)
        }
        CommandGroup(replacing: .importExport) {
            Button("Open…") { NotificationCenter.default.post(name: .grovepadImportRequested, object: nil) }
                .keyboardShortcut("o", modifiers: .command)
            Button("Import into Workspace…") { NotificationCenter.default.post(name: .grovepadImportRequested, object: nil, userInfo: [Notification.importModeKey: "newWorkspace"]) }
                .keyboardShortcut("o", modifiers: [.command, .shift])
            Divider()
            Button("Save As…") { NotificationCenter.default.post(name: .grovepadExportRequested, object: nil) }
                .keyboardShortcut("s", modifiers: [.command, .shift])
            Button("Export as .grovepad…") { NotificationCenter.default.post(name: .grovepadExportRequested, object: nil) }
                .keyboardShortcut("e", modifiers: [.command, .shift])
            #if os(macOS)
            Button("Share…") { shareOnMac() }
            #endif
        }
        // Into the system View menu (which the toolbar and sidebar already
        // give the window), not a second menu of the same name.
        CommandGroup(after: .sidebar) {
            Button("Fit to Board") { session?.fitAll() }
                .keyboardShortcut("f", modifiers: [.command, .shift])
            Button("Zoom In") { session?.environment.zoom.zoomIn() }
                .keyboardShortcut("=", modifiers: .command)
            Button("Zoom Out") { session?.environment.zoom.zoomOut() }
                .keyboardShortcut("-", modifiers: .command)
            Button("Actual Size") { session?.environment.zoom.resetZoom() }
                .keyboardShortcut("0", modifiers: .command)
            Divider()
            if CircuitFeature.isEnabled {
                Button((document?.circuitUI.circuitMode ?? false) ? "Leave Circuit Mode" : "Circuit Mode") {
                    session?.environment.toolbar.toggleCircuitMode()
                }
                .keyboardShortcut("w", modifiers: [.command, .shift])
                .disabled(document == nil)
                Divider()
            }
            Button("Show Canvas Tree") { session?.environment.toolbar.openTree() }
                .keyboardShortcut("t", modifiers: [.command, .option])
                .disabled(session == nil)
            Button("Back") { session?.environment.toolbar.goBack() }
                .keyboardShortcut("[", modifiers: .command)
                .disabled(!(session?.environment.toolbar.canGoBack ?? false))
            Button("Forward") { session?.environment.toolbar.goForward() }
                .keyboardShortcut("]", modifiers: .command)
                .disabled(!(session?.environment.toolbar.canGoForward ?? false))
            Divider()
            Button("Previous Canvas Tab") { _ = session?.environment.tabs.step(-1) }
                .keyboardShortcut(.leftArrow, modifiers: [.command, .option])
                .disabled(session == nil)
            Button("Next Canvas Tab") { _ = session?.environment.tabs.step(1) }
                .keyboardShortcut(.rightArrow, modifiers: [.command, .option])
                .disabled(session == nil)
            Button("Close Canvas Tab") { guard let tabs = session?.environment.tabs else { return }; _ = tabs.close(tabs.activeTabId) }
                .keyboardShortcut("w", modifiers: [.command, .option])
                .disabled(session == nil)
            Divider()
            Button("Search…") { session?.environment.chrome.openPalette() }
                .keyboardShortcut("k", modifiers: .command)
        }
        CommandGroup(replacing: .help) {
            Button("Keyboard Shortcuts") { session?.environment.toolbar.openShortcuts() }
                .keyboardShortcut("/", modifiers: .command)
                .disabled(session == nil)
            Link("Grovepad Help", destination: MenuCommandTable.helpURL)
        }
    }

    private var lockLabel: String {
        guard let document, let first = document.selection.first, let widget = document.widget(first) else { return "Lock" }
        return widget.metadata.locked ? "Unlock" : "Lock"
    }

    #if os(macOS)
    private func shareOnMac() {
        let coordinator = shell.coordinator
        guard let window = NSApp.keyWindow, let view = window.contentView else { return }
        do {
            let url = try ShareExport.temporaryFile(bytes: coordinator.exportPackageBytes(), fileName: coordinator.exportFileName())
            _ = ShareExport.present(fileURL: url, from: view, at: NSRect(x: view.bounds.midX, y: view.bounds.maxY - 8, width: 1, height: 1))
        } catch {
            session?.environment.toasts.add("Could not prepare the export: \(error)")
        }
    }
    #endif
}

// MARK: - Mac settings window and app delegate

#if os(macOS)
struct SettingsSceneView: View {
    let shell: AppShell

    var body: some View {
        if let session = shell.coordinator.activeSession ?? shell.coordinator.sessions.first {
            // The web's floating glass panel: the window itself is invisible,
            // so the Liquid Glass pieces float over whatever is behind it.
            SettingsView(model: session.environment.settings) { SettingsWindowChrome.closeKeyWindow() }
                // A Mac window is a desktop surface whatever its width.
                .environment(\.chromeAdaptation, ChromeAdaptation(width: 1400, activeInput: .mouse))
                .frame(width: 560)
                .fixedSize(horizontal: false, vertical: true)
                .background(SettingsWindowChrome())
                .containerBackground(.clear, for: .window)
                .toolbar(removing: .title)
                .toolbarBackgroundVisibility(.hidden, for: .windowToolbar)
                .preferredColorScheme(session.environment.settings.preferredColorScheme)
        } else {
            Text("Open a board window to change settings.").padding(40)
        }
    }
}

/// Turns the Settings scene's window into a clear, borderless-looking
/// surface: no title bar or traffic lights (the panel has its own close
/// button), no window background (each glass piece frosts the desktop
/// itself), and draggable from any empty spot. It stays a real window —
/// ⌘W, ⌘, and the remembered position still work.
struct SettingsWindowChrome: NSViewRepresentable {
    func makeNSView(context: Context) -> NSView {
        let view = WindowHook()
        return view
    }

    func updateNSView(_ view: NSView, context: Context) {}

    static func closeKeyWindow() {
        NSApp.keyWindow?.performClose(nil)
    }

    private final class WindowHook: NSView {
        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            apply()
            // SwiftUI finishes dressing the window after this view lands;
            // apply again once it has, so its background cannot come back.
            DispatchQueue.main.async { [weak self] in self?.apply() }
        }

        private func apply() {
            guard let window else { return }
            window.styleMask.insert(.fullSizeContentView)
            window.titleVisibility = .hidden
            window.titlebarAppearsTransparent = true
            window.titlebarSeparatorStyle = .none
            for button in [NSWindow.ButtonType.closeButton, .miniaturizeButton, .zoomButton] {
                window.standardWindowButton(button)?.isHidden = true
            }
            // The title-bar strip draws its own backing even when transparent.
            window.standardWindowButton(.closeButton)?.superview?.superview?.isHidden = true
            window.isOpaque = false
            window.backgroundColor = .clear
            window.contentView?.wantsLayer = true
            window.contentView?.layer?.backgroundColor = .clear
            // Each glass piece casts its own shadow; a window shadow would
            // outline the invisible rectangle around them.
            window.hasShadow = false
            window.isMovableByWindowBackground = true
        }
    }
}

/// Quit rules and file opens. Closing a window flushes; quitting asks the
/// rules after a flush and only warns when the flush could not write.
public final class MacAppDelegate: NSObject, NSApplicationDelegate {
    private var closeObserver: NSObjectProtocol?

    public func applicationDidFinishLaunching(_ notification: Notification) {
        closeObserver = NotificationCenter.default.addObserver(forName: NSWindow.willCloseNotification, object: nil, queue: .main) { _ in
            MainActor.assumeIsolated { AppShell.current?.coordinator.flushAll() }
        }
    }

    public func application(_ application: NSApplication, open urls: [URL]) {
        for url in urls { AppShell.current?.coordinator.handle(url: url) }
    }

    public func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard let shell = AppShell.current else { return .terminateNow }
        switch shell.coordinator.quitDecision() {
        case .allow, .flushThenAllow:
            return .terminateNow
        case .warn(let reason):
            let alert = NSAlert()
            alert.messageText = "Quit Grovepad?"
            alert.informativeText = reason
            alert.alertStyle = .warning
            alert.addButton(withTitle: "Cancel")
            alert.addButton(withTitle: "Quit Anyway")
            return alert.runModal() == .alertSecondButtonReturn ? .terminateNow : .terminateCancel
        }
    }

    public func applicationWillTerminate(_ notification: Notification) {
        AppShell.current?.shutDown()
    }
}
#endif
