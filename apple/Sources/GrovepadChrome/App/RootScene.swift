import SwiftUI
import GrovepadCore
import GrovepadCanvas

// ---------------------------------------------------------------------------
// Scene composition, platform-neutral. The app target hands in the canvas
// host as a slot (`AnyView`; the Core Animation host lives there) and the
// services; this file decides where every surface sits:
//
//   Mac    — NavigationSplitView: sidebar (library + tree) · canvas + toolbar
//   iPhone — full-screen canvas, mode dock, every panel a bottom sheet
//   iPad   — collapsible sidebar, dock where the web puts it (bottom centre)
//
// The split is by measured width (ChromeAdaptation), never by device name.
// ---------------------------------------------------------------------------

/// Everything the scene composes over. Built once by the app target.
@Observable
public final class ChromeEnvironment {
    public let document: BoardDocument
    public let chrome: ChromeState
    public let tabs: CanvasTabsModel
    public let toasts: ToastModel
    public let deletion: DeletionDialogModel
    public let settings: SettingsModel
    public let library: LibraryModel
    public let tree: CanvasTreeModel
    public let addWidget: AddWidgetModel
    public let palette: CommandPaletteModel
    @ObservationIgnored public var camera: ChromeCamera?
    /// Realtime collaboration, when the app has a cloud backend. Set by the
    /// app target after the account layer exists; observed so the controls
    /// appear as soon as it is.
    public var collaboration: CollaborationChromeModel? {
        didSet { settings.collaboration = collaboration }
    }

    public init(document: BoardDocument, camera: ChromeCamera?, deviceState: DeviceState? = nil, settingsStore: KeyValueStore = UserDefaults.standard, pickerPrefs: WidgetPickerPrefs = InMemoryWidgetPickerPrefs(), toastScheduler: ToastScheduler = MainQueueToastScheduler(), analyticsConfigured: Bool = false) {
        self.document = document
        self.camera = camera
        let chrome = ChromeState()
        self.chrome = chrome
        let tabs = CanvasTabsModel(document: document, deviceState: deviceState)
        self.tabs = tabs
        let toasts = ToastModel(scheduler: toastScheduler)
        toasts.bind(to: document)
        self.toasts = toasts
        let deletion = DeletionDialogModel(document: document)
        self.deletion = deletion
        settings = SettingsModel(document: document, chrome: chrome, store: settingsStore, analyticsConfigured: analyticsConfigured)
        settings.toast = { [weak toasts] in toasts?.add($0) }
        library = LibraryModel(document: document, tabs: tabs, chrome: chrome)
        library.requestDeletion = { [weak deletion] in deletion?.request($0) }
        library.toast = { [weak toasts] in toasts?.add($0) }
        tree = CanvasTreeModel(document: document, tabs: tabs, chrome: chrome, camera: camera)
        tree.requestDeletion = { [weak deletion] in deletion?.request($0) }
        addWidget = AddWidgetModel(document: document, prefs: pickerPrefs)
        palette = CommandPaletteModel(document: document, chrome: chrome, tabs: tabs, services: PaletteServices(
            camera: camera,
            openShortcuts: { [weak chrome] in chrome?.shortcutsOpen = true },
            openSettingsData: { [weak chrome] in chrome?.openSettings(.data) },
            openTree: { [weak chrome] in chrome?.treeOpen = true }
        ))
    }

    public var toolbar: ToolbarModel { ToolbarModel(document: document, chrome: chrome, tabs: tabs, camera: camera) }
    public var zoom: ZoomControlsModel { ZoomControlsModel(document: document, camera: camera, chrome: chrome) }
    public var modeDock: ModeDockModel { ModeDockModel(toolbar: toolbar) }

    public var contextMenuActions: ContextMenuActions {
        ContextMenuActions(
            navigate: { [weak self] in self?.tabs.navigate(to: $0) },
            startRenaming: { [weak self] in self?.chrome.renamingWidgetId = $0 },
            requestDeletion: { [weak self] in self?.deletion.request($0) },
            close: { [weak self] in self?.chrome.closeContextMenu() }
        )
    }

    public var shortcutActions: ShortcutsModel.Actions {
        ShortcutsModel.Actions(
            frame: { [weak self] in self?.zoom.frameSelectionOrBoard() },
            zoomIn: { [weak self] in self?.zoom.zoomIn() },
            resetZoom: { [weak self] in self?.zoom.resetZoom() },
            quickAdd: { [weak self] in self?.toolbar.openAddWidget() },
            undo: { [weak self] in self?.document.undo() },
            redo: { [weak self] in self?.document.redo() },
            duplicate: { [weak self] in guard let self else { return }; self.document.duplicateWidgets(self.document.selection) },
            palette: { [weak self] in self?.chrome.openPalette() },
            close: { [weak self] in self?.chrome.shortcutsOpen = false }
        )
    }
}

public struct RootScene: View {
    @Bindable private var environment: ChromeEnvironment
    private let canvas: AnyView
    @State private var sidebarVisibility: NavigationSplitViewVisibility = .automatic

    /// `canvas` is the app target's Core Animation host, wrapped.
    public init(environment: ChromeEnvironment, canvas: AnyView) {
        self._environment = Bindable(environment)
        self.canvas = canvas
    }

    private var adaptation: ChromeAdaptation { environment.chrome.adaptation }

    public var body: some View {
        Group {
            if adaptation.isPhone {
                phoneLayout
            } else {
                splitLayout
            }
        }
        .environment(\.chromeAdaptation, adaptation)
        .environment(\.touchChrome, adaptation.touchChrome)
        // The app's typeface for every piece of text that does not set its
        // own (list rows, alerts' fields, form labels).
        .font(.grove(size: 13))
        .chromeSurface()
        .preferredColorScheme(environment.settings.preferredColorScheme)
        .background(GeometryReader { proxy in
            Color.clear.onAppear { measure(proxy.size) }.onChange(of: proxy.size) { _, size in measure(size) }
        })
        .overlay { galleries }
        .overlaySurfaces(environment)
        .collaborationInviteDialog(environment.collaboration)
    }

    /// Mac and iPad: the widget library fills the window over the blurred
    /// board (`WidgetGalleryView`). Phones keep the bottom sheets.
    @ViewBuilder
    private var galleries: some View {
        let chrome = environment.chrome
        Group {
            if !adaptation.isPhone, let anchor = chrome.addWidgetAnchor {
                AddWidgetGallery(model: environment.addWidget, at: anchor, chrome: chrome)
                    .transition(.opacity.combined(with: .scale(scale: 0.985)))
            } else if !adaptation.isPhone, chrome.treeShaper.isPickerOpen {
                GhostNodePickerGallery(library: environment.addWidget, shaper: chrome.treeShaper)
                    .transition(.opacity.combined(with: .scale(scale: 0.985)))
            }
        }
        .environment(\.chromeAdaptation, adaptation)
        .environment(\.touchChrome, adaptation.touchChrome)
        .animation(.easeOut(duration: 0.18), value: chrome.addWidgetOpen)
        .animation(.easeOut(duration: 0.18), value: chrome.treeShaper.isPickerOpen)
    }

    private func measure(_ size: CGSize) {
        environment.chrome.viewportSize = Size(width: size.width, height: size.height)
    }

    private var toolbar: ToolbarModel { environment.toolbar }

    /// Mac and iPad: the system sidebar (workspaces + canvas outline), the
    /// canvas as the detail, the web's top bar as the window toolbar.
    private var splitLayout: some View {
        NavigationSplitView(columnVisibility: $sidebarVisibility) {
            BoardSidebarView(tree: environment.tree, library: environment.library, camera: environment.camera)
                .navigationSplitViewColumnWidth(min: 220, ideal: 264, max: 380)
                // The sidebar opens and closes from View ▸ Show Sidebar
                // (⌃⌘S) and by dragging its edge; no toolbar button for it.
                .toolbar(removing: .sidebarToggle)
        } detail: {
            canvasStage
                // Still named for the Window menu, Mission Control and
                // Handoff; the name itself is drawn by the toolbar's menu.
                .navigationTitle(environment.document.canvasName(environment.document.activeCanvasId) ?? "Canvas")
                .toolbar { CanvasWindowToolbar(model: toolbar, settings: environment.settings) }
                #if os(macOS)
                .toolbar(removing: .title)
                // No bar: the controls float as glass over the canvas.
                .toolbarBackgroundVisibility(.hidden, for: .windowToolbar)
                #endif
        }
        .navigationSplitViewStyle(.balanced)
    }

    /// iPhone: the canvas fills the screen; the web's floating bar and dock.
    private var phoneLayout: some View {
        canvasStage
    }

    private var canvasStage: some View {
        ZStack {
            canvas.ignoresSafeArea()
            CanvasVignette().ignoresSafeArea()
            if let collaboration = environment.collaboration {
                // Other people's selections sit on the board, under chrome.
                CollaborationWorldOverlay(model: collaboration, document: environment.document, chrome: environment.chrome)
                    .ignoresSafeArea()
            }
            if environment.chrome.treeShaper.isActive {
                GhostTreeOverlay(shaper: environment.chrome.treeShaper, chrome: environment.chrome).ignoresSafeArea()
            } else {
                EmptyCanvasView(document: environment.document, onAddWidget: { environment.toolbar.openAddWidget() }, onSearch: { environment.chrome.openPalette() })
            }
            VStack(spacing: 8) {
                if adaptation.isPhone {
                    CanvasToolbarView(model: environment.toolbar)
                } else {
                    // The account sits under the traffic lights, the open
                    // canvas tabs beside it.
                    HStack(alignment: .center, spacing: 10) {
                        FloatingAccountButton(chrome: environment.chrome, settings: environment.settings)
                        CanvasTabsView(model: environment.tabs)
                        Spacer()
                    }
                    .padding(.leading, 14)
                    .padding(.top, 8)
                }
                if let collaboration = environment.collaboration {
                    FollowBanner(model: collaboration)
                    #if !os(macOS)
                    HStack {
                        Spacer()
                        CollaborationControl(model: collaboration, document: environment.document)
                    }
                    .padding(.horizontal, 12)
                    #endif
                }
                Spacer()
                ShaperHUDView(shaper: environment.chrome.treeShaper, document: environment.document)
                HStack(alignment: .bottom) {
                    if adaptation.isPhone {
                        Spacer()
                        CanvasModeDockView(model: environment.modeDock)
                        Spacer()
                        ZoomControlsView(model: environment.zoom)
                    } else {
                        // Navigation bottom-left, the map bottom-right. Zoom is
                        // pinch, wheel and ⌘+/⌘−/⌘0; Undo/Redo live up top.
                        CanvasNavigationPill(toolbar: environment.toolbar, library: environment.library)
                        Spacer()
                        #if !os(macOS)
                        // iPad: the touch tools (Navigate/Select) a finger needs.
                        CanvasModeDockView(model: environment.modeDock)
                        Spacer()
                        #endif
                        CanvasMinimapView(document: environment.document, chrome: environment.chrome, camera: environment.camera)
                    }
                }
                .padding(.horizontal, 12)
                .padding(.bottom, 12)
            }
            #if os(macOS)
            if !adaptation.isPhone {
                // Search and Undo/Redo float in the window's top-right corner,
                // as far from the top edge as from the right one; multiplayer
                // sits on the row below (the web's `top-right-row2`).
                VStack(alignment: .trailing, spacing: 10) {
                    CanvasTrailingControls(model: environment.toolbar)
                    if let collaboration = environment.collaboration {
                        CollaborationControl(model: collaboration, document: environment.document)
                    }
                }
                .padding(.top, CanvasTrailingControls.macMargin)
                .padding(.trailing, CanvasTrailingControls.macMargin)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                .ignoresSafeArea(.container, edges: .top)
            }
            #endif
            if let collaboration = environment.collaboration {
                // Pointers ride over cards and under the floating chrome.
                RemoteCursorLayer(model: collaboration, chrome: environment.chrome)
                    .ignoresSafeArea()
            }
            ToastStack(model: environment.toasts).frame(maxHeight: .infinity, alignment: .bottom)
            if !adaptation.isPhone {
                // Grows out of the floating account button, over the chrome.
                AccountPanelLayer(chrome: environment.chrome, settings: environment.settings)
            }
            // Over everything on the canvas, in the canvas's own points: the
            // drum grows out of the card title it was opened from.
            if let roller = environment.chrome.skinRoller {
                SkinRollerView(model: roller).id(ObjectIdentifier(roller))
            }
            // A double-clicked card, lifted over the whole canvas.
            if let request = environment.chrome.fullscreen {
                WidgetFullscreenSheet(request: request, document: environment.document) { [weak chrome = environment.chrome] in
                    chrome?.fullscreen = nil
                }
                .id(request.widgetId)
            }
        }
    }
}

/// A soft darkening toward the window's edges, always on, over the board and
/// under every piece of chrome. It never takes a click.
struct CanvasVignette: View {
    var body: some View {
        EllipticalGradient(
            colors: [.clear, GlassTokens.vignette],
            center: .center,
            startRadiusFraction: 0.42,
            endRadiusFraction: 0.98
        )
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

private extension View {
    /// Every sheet, dialog and drawer, placed by `.chromePanel`. On a phone
    /// the tree is a sheet too (the sidebar does not exist there).
    func overlaySurfaces(_ environment: ChromeEnvironment) -> some View {
        let chrome = environment.chrome
        return self
            .chromePanel(isPresented: Binding(get: { chrome.addWidgetOpen && chrome.adaptation.isPhone }, set: { if !$0 { chrome.closeAddWidget() } })) {
                AddWidgetSheet(model: environment.addWidget, at: chrome.addWidgetAnchor ?? .zero, chrome: chrome)
            }
            .chromePanel(isPresented: Binding(get: { chrome.treeShaper.isPickerOpen && chrome.adaptation.isPhone }, set: { if !$0 { chrome.treeShaper.closePicker() } })) {
                GhostNodePickerSheet(library: environment.addWidget, shaper: chrome.treeShaper)
            }
            .chromePanel(isPresented: Binding(get: { chrome.paletteOpen }, set: { chrome.paletteOpen = $0 })) {
                CommandPaletteView(model: environment.palette).onAppear { environment.palette.open() }
            }
            .settingsSurface(chrome: chrome, settings: environment.settings)
            .chromePanel(isPresented: Binding(get: { chrome.shortcutsOpen }, set: { chrome.shortcutsOpen = $0 })) {
                ShortcutsOverlayView(actions: environment.shortcutActions)
            }
            .chromePanel(isPresented: Binding(get: { chrome.treeOpen && chrome.adaptation.isPhone }, set: { if !$0 { chrome.treeOpen = false } })) {
                CanvasTreeDrawerView(model: environment.tree)
            }
            .chromePanel(isPresented: Binding(get: { environment.deletion.isPresented }, set: { if !$0 { environment.deletion.close() } })) {
                DeletionDialog(model: environment.deletion)
            }
    }
}

private struct SettingsSurface: ViewModifier {
    #if os(macOS)
    @Environment(\.openSettings) private var openSettings
    #endif
    let chrome: ChromeState
    let settings: SettingsModel

    func body(content: Content) -> some View {
        #if os(macOS)
        // A Mac has one place for settings, the Settings window (⌘,): any
        // request for the panel (palette verb, menu, toolbar) opens it.
        content.onChange(of: chrome.settingsOpen) { _, open in
            guard open else { return }
            chrome.settingsOpen = false
            openSettings()
        }
        #else
        content.chromePanel(isPresented: Binding(get: { chrome.settingsOpen }, set: { chrome.settingsOpen = $0 })) {
            SettingsView(model: settings)
        }
        #endif
    }
}

private extension View {
    func settingsSurface(chrome: ChromeState, settings: SettingsModel) -> some View {
        modifier(SettingsSurface(chrome: chrome, settings: settings))
    }
}
