import XCTest
import GrovepadCore
@testable import GrovepadChrome

/// The top bar, zoom row and mode dock over the document and a recording camera.
final class SurfacesToolbarTests: XCTestCase {

    /// These tests exercise the circuit system, which the app ships frozen
    /// (`CircuitFeature`); each switches it on for itself only.
    override func invokeTest() {
        let previous = CircuitFeature.isEnabled
        CircuitFeature.isEnabled = true
        defer { CircuitFeature.isEnabled = previous }
        super.invokeTest()
    }
    private func fixture() -> (BoardDocument, ChromeState, CanvasTabsModel, RecordingCamera, ToolbarModel) {
        let (document, _, _) = makeDocument()
        let chrome = ChromeState()
        let tabs = CanvasTabsModel(document: document, mint: .counting(prefix: "tab-"))
        let camera = RecordingCamera()
        return (document, chrome, tabs, camera, ToolbarModel(document: document, chrome: chrome, tabs: tabs, camera: camera))
    }

    func testModesAndCircuitToggleAgree() {
        let (document, chrome, _, _, toolbar) = fixture()
        toolbar.toggleCircuitMode()
        XCTAssertTrue(document.circuitUI.circuitMode)
        XCTAssertEqual(chrome.interactionMode, .connect)
        toolbar.setMode(.select)
        XCTAssertFalse(document.circuitUI.circuitMode, "picking a tool leaves Circuit mode")
        XCTAssertEqual(chrome.interactionMode, .select)
        toolbar.toggleCircuitMode()
        toolbar.toggleCircuitMode()
        XCTAssertEqual(chrome.interactionMode, .navigate)

        let dock = ModeDockModel(toolbar: toolbar)
        XCTAssertTrue(dock.isVisible(ChromeAdaptation(width: 390)))
        XCTAssertFalse(dock.isVisible(ChromeAdaptation(width: 1400)))
        XCTAssertTrue(dock.isVisible(ChromeAdaptation(width: 1400, activeInput: .touch)))
        XCTAssertTrue(dock.showsHistory(ChromeAdaptation(width: 800)))
        XCTAssertFalse(dock.showsHistory(ChromeAdaptation(width: 1400, activeInput: .touch)))
        dock.select(ModeDockModel.tools[1])
        XCTAssertEqual(chrome.interactionMode, .select)
        XCTAssertTrue(dock.isPressed(ModeDockModel.tools[1], chrome.adaptation))
    }

    func testBreadcrumbsCollapseDeepPaths() throws {
        let (document, _, _, _, toolbar) = fixture()
        XCTAssertFalse(toolbar.isAtRootOnly, "the fixture root is named Root, not Origin")
        XCTAssertEqual(toolbar.breadcrumbs.map(\.name), ["Root"])
        var names = ["A", "B", "C", "D"]
        var ids: [String] = []
        while !names.isEmpty {
            let door = document.createWidget(type: "canvas_node", at: .zero, title: names.removeFirst())!
            let canvasId = try XCTUnwrap(document.widget(door)?.data.string("canvasId"))
            ids.append(canvasId)
            document.navigate(to: canvasId)
        }
        let crumbs = toolbar.breadcrumbs
        XCTAssertEqual(crumbs.map(\.name), ["Root", "…", "C", "D"])
        XCTAssertTrue(crumbs[1].isEllipsis)
        XCTAssertTrue(crumbs[3].isCurrent)
        toolbar.openBreadcrumb(crumbs[0])
        XCTAssertEqual(document.activeCanvasId, "root")
        XCTAssertEqual(toolbar.breadcrumbs.map(\.name), ["Root"])
        toolbar.openBreadcrumb(crumbs[3])
        XCTAssertEqual(document.activeCanvasId, "root", "a stale current crumb is inert")
        toolbar.openBreadcrumb(Breadcrumb(canvasId: ids[3], name: "D", isCurrent: false), command: true)
        XCTAssertEqual(document.activeCanvasId, "root", "⌘ opens a background tab")
        XCTAssertEqual(toolbar.tabs.openTabs.count, 2)
    }

    func testToolbarOpensSurfacesAtTheViewCentre() {
        let (_, chrome, _, camera, toolbar) = fixture()
        camera.pan = Vector2D(x: -100, y: -50)
        camera.zoom = 2
        toolbar.openAddWidget()
        XCTAssertEqual(chrome.addWidgetAnchor, Vector2D(x: 300, y: 175))
        toolbar.openPalette()
        toolbar.openSettings()
        toolbar.openTree()
        toolbar.openShortcuts()
        XCTAssertTrue(chrome.paletteOpen && chrome.settingsOpen && chrome.treeOpen && chrome.shortcutsOpen)
        XCTAssertTrue(toolbar.overflowVisible(ChromeAdaptation(width: 800)))
        XCTAssertFalse(toolbar.overflowVisible(ChromeAdaptation(width: 1400)))
        XCTAssertTrue(toolbar.overflowShowsSearch(ChromeAdaptation(width: 390)))
    }

    func testZoomControlsStepPresetAndFrame() {
        let (document, _, _, camera, _) = fixture()
        let zoom = ZoomControlsModel(document: document, camera: camera)
        XCTAssertEqual(zoom.zoomPercent, 100)
        zoom.zoomIn()
        XCTAssertEqual(zoom.zoomPercent, 125)
        zoom.zoomOut()
        XCTAssertEqual(zoom.zoomPercent, 100)
        zoom.zoomTo(percent: 200)
        XCTAssertEqual(camera.zoom, 2)
        zoom.resetZoom()
        XCTAssertEqual(camera.zoom, 1)
        XCTAssertEqual(ZoomControlsModel.presets, [25, 50, 75, 100, 150, 200])

        zoom.frameBoard()
        XCTAssertEqual(camera.log.last, "fitAll", "an empty board frames the origin")
        _ = document.createWidget(type: "text", at: Vector2D(x: 80, y: 80), title: "A")
        zoom.frameBoard()
        XCTAssertEqual(camera.log.last?.hasPrefix("fitRect:80,80,"), true)
        XCTAssertTrue(zoom.showsHistory(ChromeAdaptation(width: 1400)))
        XCTAssertFalse(zoom.showsHistory(ChromeAdaptation(width: 800)))

        let b = document.createWidget(type: "text", at: Vector2D(x: 2000, y: 2000), title: "B")!
        document.select(b)
        zoom.frameSelectionOrBoard()
        XCTAssertEqual(camera.log.last?.hasPrefix("fitRect:2000,2000,"), true)
    }

    /// Touch adaptation, question 5: nothing may be reachable only by a key,
    /// a modifier or a hover. On a phone the zoom row hides its own Frame
    /// button and there is no ⌘0 or F, so the dock has to carry Fit — plus
    /// Undo, Redo and the zoom steps, none of which have a key either.
    func testThePhoneReachesFitUndoRedoAndZoomWithoutAKeyboard() {
        let (document, chrome, tabs, camera, toolbar) = fixture()
        let phone = ChromeAdaptation(width: 390, activeInput: .touch)
        let desktop = ChromeAdaptation(width: 1400, activeInput: .mouse)
        let dock = ModeDockModel(toolbar: toolbar)
        let zoom = ZoomControlsModel(document: document, camera: camera)

        XCTAssertTrue(dock.isVisible(phone), "the dock is the phone's chrome")
        XCTAssertTrue(dock.showsFrame(phone), "Fit is in the dock on a phone")
        XCTAssertTrue(dock.showsHistory(phone), "Undo/Redo are in the dock on a phone")
        // Never both: the zoom row owns them at desktop width instead.
        XCTAssertFalse(dock.showsFrame(desktop))
        XCTAssertFalse(dock.showsHistory(desktop))
        XCTAssertTrue(zoom.showsHistory(desktop))

        // And the dock's Fit is the same rule the zoom row runs.
        _ = document.createWidget(type: "text", at: Vector2D(x: 80, y: 80), title: "A")
        dock.frameBoard()
        let fromDock = camera.log.last
        zoom.frameBoard()
        XCTAssertEqual(fromDock, camera.log.last, "one framing rule, two buttons")

        // The overflow menu carries it too, where the coordinator looked.
        XCTAssertTrue(toolbar.overflowVisible(phone))

        // The keyboard hint is the one thing a phone must NOT be offered:
        // `activeInput` starts at `.mouse` and a tap arrives as a click.
        XCTAssertFalse(ChromeAdaptation(width: 390).hasKeyboardHints, "a phone is never offered ⌘K")
        XCTAssertFalse(ChromeAdaptation(width: 390, activeInput: .keyboard).hasKeyboardHints)
        XCTAssertTrue(desktop.hasKeyboardHints)
        XCTAssertFalse(ChromeAdaptation(width: 1400, activeInput: .touch).hasKeyboardHints)
        _ = chrome
        _ = tabs
    }
}
