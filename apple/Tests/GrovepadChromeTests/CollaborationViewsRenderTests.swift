import XCTest
import SwiftUI
import GrovepadCore
import GrovepadCanvas
import GrovepadCollaboration
@testable import GrovepadChrome

/// The multiplayer chrome renders in every state it can be in: the control,
/// each panel tab for an owner and a viewer, other people's cursors and
/// selections. `GROVEPAD_RENDER_DIR` writes the images out for a look.
@MainActor
final class CollaborationViewsRenderTests: XCTestCase {
    /// A document-backed host; the runtime is never started (no transport).
    private final class Host: CollaborationBoardHost {
        let document: BoardDocument
        init(_ document: BoardDocument) { self.document = document }
        var board: Board { document.board }
        var activeCanvasId: String { document.activeCanvasId }
        var selectedWidgetIds: [String] { document.selection }
        var camera: CollaborationCamera? { nil }
        var isOnline: Bool { true }
        func applyCollaborativeBoard(_ board: Board) { document.applyCollaborativeBoard(board) }
        func setCamera(_ camera: CollaborationCamera) {}
        func setEditingLocked(_ locked: Bool) { document.setEditingLocked(locked) }
        func setHistory(_ history: CollaborativeHistory?) {}
        func observeBoard(_ listener: @escaping () -> Void) -> () -> Void { document.subscribe(listener) }
        func observeSelection(_ listener: @escaping () -> Void) -> () -> Void { {} }
        func observeCamera(_ listener: @escaping () -> Void) -> () -> Void { {} }
        func observePointer(_ listener: @escaping (Vector2D?) -> Void) -> () -> Void { {} }
        func setCanvasShared(_ canvasId: String, shared: Bool) { document.setCanvasShared(canvasId, shared: shared) }
        func adoptSharedCanvas(_ canvasId: String, name: String) throws { _ = document.adoptSharedCanvas(canvasId, name: name) }
    }

    private func fixture(role: CollaborationRole) -> (BoardDocument, CollaborationChromeModel, ChromeState, String) {
        let (document, _, _) = makeDocument()
        let note = document.createWidget(type: "text", at: Vector2D(x: 80, y: 60), title: "Plan")!
        document.setCanvasShared(document.activeCanvasId, shared: true)
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("render-\(UUID().uuidString)")
        let runtime = CollaborationRuntime(host: Host(document), queue: OfflineUpdateQueue(root: directory), configured: true) { nil }
        let state = runtime.state
        state.status = .connected
        state.role = role
        state.canvasId = document.activeCanvasId
        state.localClientId = 1
        state.participants = [
            CollaborationPresence(clientId: 1, userId: "me", name: "Amir Hamza", color: "#34d399", role: role),
            CollaborationPresence(clientId: 2, userId: "ada", name: "Ada Lovelace", color: "#60a5fa", role: .editor,
                                  cursor: Vector2D(x: 300, y: 120), selectedWidgetIds: [note], editingWidgetId: note),
            CollaborationPresence(clientId: 3, userId: "vera", name: "Vera", color: "#f472b6", role: .viewer),
        ]
        state.comments = [
            CollaborationComment(id: "c1", canvasId: "x", authorId: "ada", parentId: nil, widgetId: nil, body: "Can we split this plan into weeks?", createdAt: "2026-09-19T08:30:00Z"),
            CollaborationComment(id: "c2", canvasId: "x", authorId: "me", parentId: "c1", widgetId: nil, body: "Yes — doing it now.", createdAt: "2026-09-19T08:32:00.123Z"),
        ]
        let model = CollaborationChromeModel(runtime: runtime)
        model.accountUserId = "me"
        let chrome = ChromeState()
        return (document, model, chrome, note)
    }

    private func render<V: View>(_ view: V, _ name: String, size: CGSize) throws {
        let renderer = ImageRenderer(content: view.frame(width: size.width, height: size.height).background(Color(hex: "#0a0a0a")).environment(\.colorScheme, .dark))
        renderer.scale = 2
        let image = try XCTUnwrap(renderer.cgImage, "\(name) did not render")
        XCTAssertGreaterThan(image.width, 0)
        if let directory = ProcessInfo.processInfo.environment["GROVEPAD_RENDER_DIR"] {
            #if canImport(AppKit)
            let bitmap = NSBitmapImageRep(cgImage: image)
            try bitmap.representation(using: .png, properties: [:])?.write(to: URL(fileURLWithPath: directory).appendingPathComponent("\(name).png"))
            #endif
        }
    }

    func testPanelTabsRenderForAnOwner() throws {
        let (document, model, _, _) = fixture(role: .owner)
        for tab in CollaborationChromeModel.Tab.allCases {
            model.tab = tab
            try render(CollaborationPanel(model: model, document: document), "panel-owner-\(tab.rawValue)", size: CGSize(width: 340, height: 560))
        }
        // The panel's scroll view is AppKit-backed (offscreen it draws as a
        // placeholder), so the tab bodies are drawn directly as well.
        try render(PeopleTab(model: model, document: document).padding(14), "tab-people", size: CGSize(width: 340, height: 200))
        try render(ShareTab(model: model, document: document).padding(14), "tab-share", size: CGSize(width: 340, height: 520))
        try render(CommentsTab(model: model).padding(14), "tab-comments", size: CGSize(width: 340, height: 360))
    }

    func testPanelRendersForAViewerWhileReconnecting() throws {
        let (document, model, _, _) = fixture(role: .viewer)
        model.state.status = .reconnecting
        model.state.pendingUpdates = 3
        for tab in [CollaborationChromeModel.Tab.share, .comments] {
            model.tab = tab
            try render(CollaborationPanel(model: model, document: document), "panel-viewer-\(tab.rawValue)", size: CGSize(width: 340, height: 480))
        }
    }

    func testControlCursorsAndSelectionsRender() throws {
        let (document, model, chrome, _) = fixture(role: .editor)
        try render(CollaborationControl(model: model, document: document), "control", size: CGSize(width: 360, height: 60))
        model.follow(2)
        try render(FollowBanner(model: model), "follow-banner", size: CGSize(width: 360, height: 60))
        chrome.cameraTransform = CanvasTransform(x: 40, y: 30, zoom: 1)
        try render(ZStack {
            CollaborationWorldOverlay(model: model, document: document, chrome: chrome)
            RemoteCursorLayer(model: model, chrome: chrome)
        }, "world", size: CGSize(width: 640, height: 400))
    }
}
