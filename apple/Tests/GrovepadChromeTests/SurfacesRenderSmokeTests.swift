import XCTest
import SwiftUI
import GrovepadCore
@testable import GrovepadChrome

/// Every chrome surface renders through ImageRenderer on macOS, at phone and
/// desktop adaptation, and the composed scene builds.
final class SurfacesRenderSmokeTests: XCTestCase {
    #if canImport(AppKit)
    private func environment() throws -> ChromeEnvironment {
        let (document, _, _) = makeDocument()
        let camera = RecordingCamera()
        let environment = ChromeEnvironment(document: document, camera: camera, settingsStore: InMemoryKeyValueStore(), pickerPrefs: InMemoryWidgetPickerPrefs(favorites: ["counter"]), toastScheduler: ManualToastScheduler())
        let a = document.createWidget(type: "text", at: .zero, title: "A")!
        let b = document.createWidget(type: "counter", at: Vector2D(x: 400, y: 0), title: "B")!
        let door = document.createWidget(type: "canvas_node", at: Vector2D(x: 800, y: 0), title: "Inner")!
        _ = try XCTUnwrap(document.widget(door)?.data.string("canvasId"))
        _ = document.addRelation(from: a, to: b, type: .parent)
        document.selectWidgets([a, b])
        environment.tabs.open("root", activate: false)
        environment.toasts.add("Hello")
        environment.chrome.canvasVisits = ["root"]
        return environment
    }

    private func render<V: View>(_ view: V, phone: Bool, file: StaticString = #filePath, line: UInt = #line) throws -> CGImage {
        let adaptation = ChromeAdaptation(width: phone ? 390 : 1400, activeInput: phone ? .touch : .mouse)
        let image = try XCTUnwrap(WidgetBitmapProvider.render(view.environment(\.chromeAdaptation, adaptation).environment(\.touchChrome, adaptation.touchChrome), scale: 1), "\(V.self) renders", file: file, line: line)
        XCTAssertGreaterThanOrEqual(image.height, 44, "\(V.self) is at least one touch target tall", file: file, line: line)
        return image
    }

    func testEverySurfaceRendersAtPhoneAndDesktopWidth() throws {
        let env = try environment()
        let contextMenu = try XCTUnwrap(ContextMenuModel(widgetId: env.document.selection[0], document: env.document))
        for phone in [true, false] {
            _ = try render(LibraryGridView(model: env.library), phone: phone)
            _ = try render(CanvasTreeDrawerView(model: env.tree), phone: phone)
            _ = try render(CanvasToolbarView(model: env.toolbar).frame(width: phone ? 390 : 1200), phone: phone)
            _ = try render(ZoomControlsView(model: env.zoom), phone: phone)
            _ = try render(AddWidgetSheet(model: env.addWidget, at: .zero, chrome: env.chrome).frame(width: phone ? 390 : 408, height: 500), phone: phone)
            _ = try render(CommandPaletteView(model: env.palette).frame(width: phone ? 390 : 680, height: 420), phone: phone)
            _ = try render(SettingsView(model: env.settings).frame(width: phone ? 390 : 540), phone: phone)
            _ = try render(ConfirmDialogView(model: .deleteWorkspace(named: "Studies", onConfirm: {}, onClose: {})), phone: phone)
            _ = try render(ToastStack(model: env.toasts), phone: phone)
            #if os(macOS)
            // The Mac's empty canvas is a one-line hint (double-click shapes a tree),
            // not a control, so the touch-target floor does not apply.
            XCTAssertNotNil(WidgetBitmapProvider.render(EmptyCanvasView(document: BoardDocument(board: makeBoard()), onAddWidget: {}, onSearch: {}), scale: 1))
            #else
            _ = try render(EmptyCanvasView(document: BoardDocument(board: makeBoard()), onAddWidget: {}, onSearch: {}), phone: phone)
            #endif
            _ = try render(CanvasNavigationPill(toolbar: env.toolbar, library: env.library), phone: phone)
            _ = try render(ShortcutsOverlayView(actions: env.shortcutActions).frame(width: phone ? 390 : 640, height: 500), phone: phone)
        }
        // The system menu's rows are the system's size; only the content must build.
        XCTAssertNotNil(WidgetBitmapProvider.render(Menu("Menu") { WidgetContextMenuContent(model: contextMenu, document: env.document, actions: env.contextMenuActions) }, scale: 1))
        // The dock and the tab row are conditional on the adaptation.
        XCTAssertNotNil(WidgetBitmapProvider.render(CanvasModeDockView(model: env.modeDock).environment(\.chromeAdaptation, ChromeAdaptation(width: 390)), scale: 1))
        XCTAssertNotNil(WidgetBitmapProvider.render(CanvasTabsView(model: env.tabs).environment(\.chromeAdaptation, ChromeAdaptation(width: 1400)), scale: 1))
        env.deletion.request([env.document.board.widgets.values.first { $0.type == "canvas_node" }!.id])
        if env.deletion.isPresented { _ = try render(DeletionDialog(model: env.deletion), phone: false) }
    }

    func testSettingsSectionsAllRender() throws {
        let env = try environment()
        for section in SettingsModel.sections {
            env.settings.section = section
            _ = try render(SettingsView(model: env.settings).frame(width: 540), phone: false)
        }
    }

    func testRootSceneComposesOnEveryWidth() throws {
        let env = try environment()
        for width in [390.0, 800.0, 1400.0] {
            env.chrome.viewportSize = Size(width: width, height: 800)
            let scene = RootScene(environment: env, canvas: AnyView(Color.black)).frame(width: width, height: 800)
            XCTAssertNotNil(WidgetBitmapProvider.render(scene, scale: 1), "RootScene at \(width) pt")
        }
    }
    #endif
}
