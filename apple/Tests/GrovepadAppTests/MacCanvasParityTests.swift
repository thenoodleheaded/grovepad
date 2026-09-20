#if canImport(AppKit)
import XCTest
import AppKit
import SwiftUI
import GrovepadCore
import GrovepadCanvas
import GrovepadChrome
@testable import GrovepadApp

/// The Mac canvas against the web's card behaviour: a hovered resting tile
/// stays a tile (and a click still opens it), cards cast the shared shadow,
/// relation and dependency lines reach the edge layer and open their own
/// menu, the web's bare keys drive the canvas, a mouse drag moves a tile, an
/// open card resizes from its outline, and the Edit menu's clipboard works.
@MainActor
final class MacCanvasParityTests: XCTestCase {
    private var directory: URL!
    private var window: NSWindow!
    private var coordinator: AppCoordinator!
    private var host: MacCanvasHostView!

    override func setUp() {
        super.setUp()
        directory = AppFixtures.temporaryDirectory("parity")
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1000, height: 700), styleMask: [.titled], backing: .buffered, defer: false)
        coordinator = AppFixtures.coordinator(directory: directory, timers: ManualTimerSource())
        coordinator.start()
        let session = coordinator.makeSession()
        host = MacCanvasHostView(session: session, screenScale: 2)
        host.frame = NSRect(x: 0, y: 0, width: 1000, height: 700)
        window.contentView = host
        host.layout()
    }

    override func tearDown() {
        coordinator.dispose()
        window.orderOut(nil)
        window = nil
        try? FileManager.default.removeItem(at: directory)
        super.tearDown()
    }

    private var document: BoardDocument { coordinator.document }
    private var interaction: CanvasInteraction { host.interaction }

    private func settle() {
        let expectation = expectation(description: "turn")
        DispatchQueue.main.async { expectation.fulfill() }
        wait(for: [expectation], timeout: 1)
        host.sync()
    }

    private func box(_ id: String) -> WorldRect {
        displayedWidgetRect(document.widget(id)!, restContext: interaction.restContext())
    }

    private func screenCentre(_ id: String) -> Vector2D {
        let rect = box(id)
        return interaction.toScreen(Vector2D(x: rect.x + rect.width / 2, y: rect.y + rect.height / 2))
    }

    private func mouse(_ phase: PointerPhase, _ point: Vector2D, shift: Bool = false) -> PointerEvent {
        PointerEvent(id: 1, kind: .mouse, phase: phase, point: point, button: 0, timestamp: 0, modifiers: shift ? .shift : [], isEmptyCanvas: true)
    }

    private func makeCard(_ type: String = "counter", dx: Double = 0) throws -> String {
        let centre = host.viewportCentreWorld
        let id = try XCTUnwrap(document.createWidget(type: type, at: Vector2D(x: centre.x + dx, y: centre.y), title: "Card"))
        document.clearSelection()
        settle()
        return id
    }

    // MARK: - Hover and click

    func testAHoveredRestingTileStaysATileAndAClickStillOpensIt() throws {
        let id = try makeCard()
        XCTAssertTrue(interaction.restContext().isResting(document.widget(id)!), "the card starts at rest")
        document.hoverWidgetId = id
        settle()
        XCTAssertFalse(interaction.controller.liveCardIds.contains(id), "hover never swaps the tile for a full card")
        XCTAssertTrue(interaction.controller.restingCardIds.contains(id))

        let point = screenCentre(id)
        XCTAssertEqual(interaction.pointerDown(mouse(.down, point)), .card(id))
        interaction.pointerUp(mouse(.up, point))
        settle()
        XCTAssertEqual(document.expandedWidgetId, id, "the click opens the card")
        XCTAssertTrue(interaction.controller.liveCardIds.contains(id), "and only now it is a live view")
    }

    func testRestingTilesCastTheSharedShadowAndLiftUnderThePointer() throws {
        let id = try makeCard()
        let layer = try XCTUnwrap(interaction.controller.hostLayer.cardLayers[id])
        XCTAssertEqual(Double(layer.shadowRadius), CardShadow.radius)
        XCTAssertNotNil(layer.shadowPath, "an explicit silhouette, never an offscreen alpha pass")
        let resting = layer.shadowOpacity
        XCTAssertGreaterThan(resting, 0)
        document.hoverWidgetId = id
        settle()
        XCTAssertGreaterThan(layer.shadowOpacity, resting, "hover deepens the shadow")
        XCTAssertTrue(layer.isLifted)
    }

    func testAMouseDragOnARestingTileMovesIt() throws {
        let id = try makeCard()
        let before = document.widget(id)!.position
        let start = screenCentre(id)
        interaction.pointerDown(mouse(.down, start))
        interaction.pointerMove(mouse(.move, Vector2D(x: start.x + 60, y: start.y + 20)))
        interaction.pointerMove(mouse(.move, Vector2D(x: start.x + 200, y: start.y + 80)))
        interaction.pointerUp(mouse(.up, Vector2D(x: start.x + 200, y: start.y + 80)))
        settle()
        let after = document.widget(id)!.position
        XCTAssertGreaterThan(after.x, before.x + 100, "the tile followed the mouse")
        XCTAssertNil(document.expandedWidgetId, "a drag is not a click")
        XCTAssertTrue(document.canUndo)
    }

    // MARK: - Lines

    func testRelationAndDependencyLinesReachTheEdgeLayerAndOpenTheirMenu() throws {
        let a = try makeCard(dx: -400)
        let b = try makeCard(dx: 300)
        let c = try makeCard(dx: 900)
        let parent = try XCTUnwrap(document.addRelation(from: a, to: b, type: .parent))
        let dependency = try XCTUnwrap(document.addRelation(from: b, to: c, type: .blocker))
        settle()
        let ids = interaction.coordinator.edgeDescriptors.map(\.id)
        XCTAssertTrue(ids.contains(parent), "the relation line is drawn")
        XCTAssertTrue(ids.contains(dependency), "the dependency line is drawn")

        let line = try XCTUnwrap(interaction.coordinator.edgeDescriptors.first { $0.id == parent })
        XCTAssertEqual(interaction.pressTarget(atWorld: line.mid), .line(parent), "a line is not a wire")
        var opened: RelationLineMenuModel?
        interaction.onLineMenu = { model, _ in opened = model }
        interaction.pointerDown(mouse(.down, interaction.toScreen(line.mid)))
        XCTAssertEqual(opened?.relationId, parent)

        let menu = try XCTUnwrap(opened)
        menu.run(.changeType(.cousin), document: document)
        XCTAssertEqual(document.board.relations[parent]?.type, .cousin)
        menu.run(.reverse, document: document)
        XCTAssertEqual(document.board.relations[parent]?.fromId, b)
        menu.run(.delete, document: document)
        XCTAssertNil(document.board.relations[parent])
    }

    // MARK: - Keys

    func testTheWebsBareKeysDriveTheCanvas() throws {
        let id = try makeCard()
        document.select(id)
        let before = document.widget(id)!.position
        interaction.perform(.nudge(dx: 40, dy: 0))
        XCTAssertEqual(document.widget(id)!.position.x, before.x + 40)
        interaction.perform(.nudge(dx: 0, dy: 1))
        XCTAssertEqual(document.widget(id)!.position.y, before.y + 1, "a fine nudge is not snapped back")

        interaction.perform(.selectTool)
        XCTAssertEqual(interaction.chrome.interactionMode, .select)
        interaction.perform(.navigateTool)
        XCTAssertEqual(interaction.chrome.interactionMode, .navigate)

        interaction.perform(.dependencyLink)
        XCTAssertEqual(interaction.chrome.pendingLink, PendingLink(fromId: id, type: .blocker))
        interaction.perform(.escape)
        XCTAssertNil(interaction.chrome.pendingLink)
        interaction.perform(.escape)
        XCTAssertTrue(document.selection.isEmpty, "Esc clears the selection, as on the web")

        interaction.perform(.showShortcuts)
        XCTAssertTrue(interaction.chrome.shortcutsOpen)
    }

    func testKeyTableMatchesTheWeb() {
        XCTAssertEqual(CanvasKeyRouting.keyDown(.arrow(.left), modifiers: [], editableTargetFocused: false), .nudge(dx: -40, dy: 0))
        XCTAssertEqual(CanvasKeyRouting.keyDown(.arrow(.down), modifiers: .shift, editableTargetFocused: false), .nudge(dx: 0, dy: 160))
        XCTAssertEqual(CanvasKeyRouting.keyDown(.arrow(.up), modifiers: .option, editableTargetFocused: false), .nudge(dx: 0, dy: -1))
        XCTAssertNil(CanvasKeyRouting.keyDown(.arrow(.left), modifiers: [.command, .option], editableTargetFocused: false), "⌘⌥← is the tab menu's")
        XCTAssertEqual(CanvasKeyRouting.keyDown(.f, modifiers: [], editableTargetFocused: false), .frameSelectionOrBoard)
        XCTAssertNil(CanvasKeyRouting.keyDown(.f, modifiers: [.command, .shift], editableTargetFocused: false), "⇧⌘F is the menu's")
        XCTAssertEqual(CanvasKeyRouting.keyDown(.plus, modifiers: [], editableTargetFocused: false), .zoomIn)
        XCTAssertNil(CanvasKeyRouting.keyDown(.zero, modifiers: .command, editableTargetFocused: false), "⌘0 is the menu's")
        XCTAssertNil(CanvasKeyRouting.keyDown(.h, modifiers: [], editableTargetFocused: true), "a letter typed into a card is the card's")
        XCTAssertEqual(MacCanvasHostView.canvasKey(keyCode: 123, characters: nil), .arrow(.left))
        XCTAssertEqual(MacCanvasHostView.canvasKey(keyCode: 4, characters: "h"), .h)
        XCTAssertEqual(MacCanvasHostView.canvasKey(keyCode: 24, characters: "="), .plus)
        XCTAssertEqual(MacCanvasHostView.canvasKey(keyCode: 44, characters: "/"), .question)
    }

    // MARK: - Circuits frozen

    func testTheCircuitSystemIsFrozenEverywhere() throws {
        XCTAssertFalse(CircuitFeature.isEnabled, "the app ships with circuits off")
        document.setCircuitMode(true)
        XCTAssertFalse(document.circuitUI.circuitMode, "nothing can switch Circuit Mode on")
        XCTAssertNil(CanvasKeyRouting.keyDown(.w, modifiers: [], editableTargetFocused: false), "W is inert")
        XCTAssertFalse(MenuCommandTable.rows.contains { $0.title == "Circuit Mode" }, "no menu item")

        let source = try makeCard("number_input", dx: -300)
        let target = try makeCard(dx: 300)
        let wire = try XCTUnwrap(document.addValueConnection(from: source, field: "value", to: target, field: "count"))
        document.hoverWidgetId = source
        settle()
        XCTAssertTrue(host.mountedRailIds.isEmpty, "no port rails over a hovered card")
        XCTAssertFalse(interaction.coordinator.edgeDescriptors.contains { $0.id == wire }, "no wire is drawn")
        XCTAssertNotNil(document.board.connections[wire], "but the wire stays in the board, untouched")
    }

    // MARK: - Skins

    func testTheSkinPickerListsEverySkinAndWearsTheChosenOne() throws {
        let id = try makeCard()
        let model = try XCTUnwrap(SkinPickerModel(document: document, widgetId: id))
        let definition = try XCTUnwrap(WidgetRegistry.definition(for: "counter"))
        XCTAssertEqual(model.rows.map(\.value), definition.skins.map(\.value))
        XCTAssertEqual(model.rows.filter(\.isCurrent).count, 1)
        let other = try XCTUnwrap(model.rows.first { !$0.isCurrent })
        XCTAssertTrue(model.choose(other.value, document: document))
        XCTAssertEqual(definition.skinValue(in: document.widget(id)!.data), other.value)
        XCTAssertFalse(try XCTUnwrap(SkinPickerModel(document: document, widgetId: id)).choose(other.value, document: document), "wearing it again changes nothing")
        document.undo()
        XCTAssertNotEqual(definition.skinValue(in: document.widget(id)!.data), other.value, "one undo step")
    }

    func testTheIconCellIsTheSkinButtonNotTheMoveHandle() throws {
        let id = try makeCard("text")
        interaction.expand(id)
        settle()
        let rect = box(id)
        let icon = Vector2D(x: rect.x + 14, y: rect.y - widgetTitleRowHeight / 2)
        XCTAssertNil(interaction.titleStripWidgetId(atWorld: icon), "a press on the icon reaches the skin button")
        XCTAssertEqual(interaction.titleStripWidgetId(atWorld: Vector2D(x: rect.x + 60, y: icon.y)), id, "the name is still the handle")
    }

    // MARK: - Drag feel

    func testADragFollowsThePointerAtOnceAndTheDropGlidesOntoTheGrid() throws {
        let id = try makeCard()
        let start = screenCentre(id)
        let layer = try XCTUnwrap(interaction.controller.hostLayer.cardLayers[id])
        interaction.pointerDown(mouse(.down, start))
        XCTAssertEqual(document.selection, [id], "the press selects, as on the web")
        interaction.pointerMove(mouse(.move, Vector2D(x: start.x + 3, y: start.y)))
        XCTAssertTrue(interaction.isCardDragging, "3 points starts a mouse drag")
        interaction.pointerMove(mouse(.move, Vector2D(x: start.x + 57, y: start.y + 13)))
        XCTAssertEqual(Double(layer.position.x), document.widget(id)!.position.x, accuracy: 0.001, "the tile moved this frame, before any sync")
        XCTAssertTrue(interaction.controller.isMovingCards)
        interaction.pointerUp(mouse(.up, Vector2D(x: start.x + 57, y: start.y + 13)))
        settle()
        let position = document.widget(id)!.position
        XCTAssertEqual(position.x.truncatingRemainder(dividingBy: CanvasGeometry.gridSize), 0, "the drop lands on the grid")
        XCTAssertNotNil(layer.animation(forKey: "gp.position"), "and glides there instead of jumping")
        XCTAssertFalse(interaction.controller.isMovingCards)
    }

    func testMovingACardDoesNotRepaintItsTile() throws {
        let id = try makeCard()
        let widget = document.widget(id)!
        var moved = widget
        moved.position = Vector2D(x: widget.position.x + 400, y: widget.position.y)
        XCTAssertEqual(interaction.bitmaps.dataVersion(for: widget), interaction.bitmaps.dataVersion(for: moved))
    }

    // MARK: - Open cards take clicks at any zoom

    /// The regression behind "none of the buttons are pressable": AppKit
    /// gives SwiftUI controls no clicks when their hosting view sits under
    /// a bounds-scaled parent. The card layer stays unscaled and each card
    /// scales itself, so a real click lands at any zoom.
    func testOpenCardsLiveInAnUnscaledLayerAndScaleThemselves() throws {
        let id = try makeCard("text")
        interaction.expand(id)
        host.camera.setView(Vector2D(x: 37, y: -21), 0.64)
        settle()
        let cards = try XCTUnwrap(host.subviews.first { $0 is LiveCardsView })
        XCTAssertEqual(cards.bounds.size, cards.frame.size, "the card layer is never scaled")
        XCTAssertEqual(interaction.liveHost.camera.zoom, 0.64, accuracy: 1e-9)
        let view = try XCTUnwrap(cards.subviews.first { String(describing: type(of: $0)).contains("LiveCardHostingView") })
        let world = WidgetCardView.mountFrame(for: document.widget(id)!, frame: box(id), definition: WidgetRegistry.definition(for: "text"))
        let origin = interaction.toScreen(Vector2D(x: world.x, y: world.y))
        XCTAssertEqual(view.frame.origin.x, origin.x, accuracy: 0.5)
        XCTAssertEqual(view.frame.origin.y, origin.y, accuracy: 0.5)
        XCTAssertEqual(view.frame.width, world.width * 0.64, accuracy: 0.5, "placed in viewport points")
    }

    func testAButtonScaledByItsOwnCardTakesARealClick() {
        final class Flipped: NSView { override var isFlipped: Bool { true } }
        for zoom in [0.6, 1.0, 1.5] {
            var taps = 0
            let root = Flipped(frame: NSRect(x: 0, y: 0, width: 1000, height: 700))
            window.contentView = root
            let content = Button("Tap") { taps += 1 }.frame(width: 200, height: 100)
                .scaleEffect(zoom, anchor: .topLeading)
                .frame(width: 200 * zoom, height: 100 * zoom, alignment: .topLeading)
            let button = NSHostingView(rootView: content)
            button.frame = NSRect(x: 100, y: 100, width: 200 * zoom, height: 100 * zoom)
            root.addSubview(button)
            window.makeKeyAndOrderFront(nil)
            root.layoutSubtreeIfNeeded()
            let centre = button.convert(NSPoint(x: 100 * zoom, y: 50 * zoom), to: nil)
            for type in [NSEvent.EventType.leftMouseDown, .leftMouseUp] {
                window.sendEvent(NSEvent.mouseEvent(with: type, location: centre, modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: window.windowNumber, context: nil, eventNumber: 0, clickCount: 1, pressure: 1)!)
            }
            RunLoop.main.run(until: Date().addingTimeInterval(0.15))
            XCTAssertEqual(taps, 1, "a click reaches the button at \(zoom)×")
        }
        window.contentView = host
    }

    // MARK: - Tile glass, ring and shadow

    func testTheTileCarriesItsRingAndCastsItsShadowDownward() throws {
        let id = try makeCard()
        let layer = try XCTUnwrap(interaction.controller.hostLayer.cardLayers[id])
        XCTAssertFalse(layer.isSelectedRing)
        document.select(id)
        settle()
        XCTAssertTrue(layer.isSelectedRing, "the ring is the tile's own layer, so it leans with the tile")
        XCTAssertLessThan(layer.shadowOffset.height, 0, "on the Mac, down the screen is a negative CA offset")
        XCTAssertTrue(layer.backgroundFilters?.isEmpty ?? true, "no per-tile backdrop filter (it dropped tiles mid-zoom and cost the frame rate)")
        XCTAssertTrue(interaction.liveHost.makeContext(document.widget(id)!)?.glassAllowed ?? false, "open cards wear real glass")
    }

    // MARK: - Scale states (rest · open · icon · full screen)

    func testADoubleClickLiftsTheCardIntoTheFullScreenSheet() throws {
        let id = try makeCard()
        interaction.doubleClickCard(id)
        let request = try XCTUnwrap(interaction.chrome.fullscreen)
        XCTAssertEqual(request.widgetId, id)
        let box = box(id)
        let origin = interaction.toScreen(Vector2D(x: box.x, y: box.y))
        XCTAssertEqual(request.origin.x, origin.x, accuracy: 0.5, "the sheet grows out of the card's box on screen")
        XCTAssertEqual(WidgetSheetGeometry.margin(for: CGSize(width: 1000, height: 700)), 29)
        XCTAssertEqual(WidgetSheetGeometry.margin(for: CGSize(width: 300, height: 200)), 16)
        XCTAssertEqual(WidgetSheetGeometry.margin(for: CGSize(width: 3000, height: 2000)), 56)
    }

    func testARestingTileIsNotScaledAndAnIconCannotBePulledOut() throws {
        let id = try makeCard()
        let tile = box(id)
        let corner = interaction.toScreen(Vector2D(x: tile.x + tile.width - 1, y: tile.y + tile.height - 1))
        // Its edge is a scale drag (tile ↔ icon); a small pull changes nothing.
        XCTAssertTrue(interaction.resizeBegin(atScreen: corner))
        interaction.resizeMove(toScreen: Vector2D(x: corner.x + 30, y: corner.y + 30))
        interaction.resizeEnd(atScreen: Vector2D(x: corner.x + 30, y: corner.y + 30))
        settle()
        XCTAssertEqual(box(id), tile, "a resting face is never resized")
        document.setIconified(id, true)
        settle()

        let icon = box(id)
        let edge = interaction.toScreen(Vector2D(x: icon.x + icon.width - 1, y: icon.y + icon.height - 1))
        XCTAssertFalse(interaction.resizeBegin(atScreen: edge), "an icon's edge answers nothing")
        XCTAssertEqual(document.widget(id)?.iconified, true, "an icon has no pull-out to a card")
        XCTAssertEqual(box(id).width, CanvasGeometry.iconifiedSize.width)
    }

    func testAClickedIconPeeksOpenAsItsFullCard() throws {
        let id = try makeCard()
        document.setIconified(id, true)
        settle()
        interaction.tapCard(id)
        settle()
        XCTAssertEqual(document.expandedWidgetId, id)
        XCTAssertEqual(document.widget(id)?.iconified, true, "the record stays an icon")
        let context = try XCTUnwrap(interaction.liveHost.makeContext(document.widget(id)!))
        XCTAssertNotEqual(context.widget.iconified, true, "the view is the card, not the glyph")
        XCTAssertGreaterThan(context.widget.size.width, 120)
    }

    func testTheGridRedrawsAndTheAuraOnlyMovesWhileTheCameraMoves() throws {
        _ = try makeCard()
        let host = interaction.controller.hostLayer
        host.gridLayer.displayIfNeeded()
        let pool = try XCTUnwrap(host.auraLayer.sublayers?.first)
        let image = pool.contents as AnyObject?
        let before = pool.frame
        let gridDraws = host.gridLayer.drawCount
        self.host.camera.setView(Vector2D(x: self.host.camera.frame.pan.x + 30, y: self.host.camera.frame.pan.y), self.host.camera.frame.zoom * 1.1)
        host.gridLayer.displayIfNeeded()
        XCTAssertEqual(host.gridLayer.drawCount, gridDraws + 1, "the grid is redrawn for the new zoom, never scaled (owner, 18 Sep 2026)")
        XCTAssertTrue(CATransform3DIsIdentity(host.gridLayer.transform))
        XCTAssertNotEqual(pool.frame, before, "the aura's pool moved with the camera")
        XCTAssertTrue(pool.contents as AnyObject? === image, "and was not repainted")
    }

    // MARK: - Rename

    func testF2RenamesARestingCardInItsOpenTitleRow() throws {
        let id = try makeCard()
        document.select(id)
        XCTAssertEqual(CanvasKeyRouting.keyDown(.f2, modifiers: [], editableTargetFocused: false), .rename)
        XCTAssertEqual(MacCanvasHostView.canvasKey(keyCode: 120, characters: nil), .f2)
        interaction.perform(.rename)
        settle()
        settle()
        XCTAssertEqual(document.expandedWidgetId, id, "the tile opens so its name can be edited")
        let actions = try XCTUnwrap(interaction.liveHost.makeContext(document.widget(id)!)?.actions)
        XCTAssertTrue(actions.isRenaming)
        actions.finishRename("Groceries")
        XCTAssertEqual(document.widget(id)?.title, "Groceries")
        XCTAssertNil(interaction.chrome.renamingWidgetId)

        interaction.chrome.renamingWidgetId = id
        interaction.liveHost.makeContext(document.widget(id)!)?.actions?.finishRename(nil)
        XCTAssertEqual(document.widget(id)?.title, "Groceries", "a cancelled rename keeps the name")
    }

    // MARK: - Resize

    func testAnOpenCardResizesFromItsOutline() throws {
        let id = try makeCard("text")
        interaction.expand(id)
        settle()
        // A note fits its text: let that land before measuring.
        settle()
        let start = document.widget(id)!.size
        let rect = box(id)
        let rightEdge = interaction.toScreen(Vector2D(x: rect.x + rect.width - 2, y: rect.y + rect.height / 2))
        let target = try XCTUnwrap(interaction.resizeTarget(atScreen: rightEdge))
        XCTAssertEqual(target.id, id)
        XCTAssertEqual(target.edge, .right)
        let centre = screenCentre(id)
        XCTAssertNil(interaction.resizeTarget(atScreen: centre), "the interior belongs to the card")

        XCTAssertTrue(interaction.resizeBegin(atScreen: rightEdge))
        let zoom = host.camera.frame.zoom
        let end = Vector2D(x: rightEdge.x + 120 * zoom, y: rightEdge.y)
        interaction.resizeMove(toScreen: end)
        interaction.resizeEnd(atScreen: end)
        let after = document.widget(id)!.size
        XCTAssertEqual(after.width, start.width + 120, accuracy: CanvasGeometry.gridSize, "the right edge followed the pointer")
        XCTAssertEqual(after.height, start.height, "the other axis held")
        XCTAssertFalse(interaction.isResizing)
    }

    // MARK: - Clipboard

    func testCopyPasteAndSelectAll() throws {
        let id = try makeCard()
        document.select(id)
        interaction.copySelection()
        XCTAssertTrue(interaction.canPaste)
        let count = document.board.widgets(on: document.activeCanvasId).count
        interaction.paste()
        XCTAssertEqual(document.board.widgets(on: document.activeCanvasId).count, count + 1)
        let pasted = try XCTUnwrap(document.selection.first)
        XCTAssertNotEqual(pasted, id)
        XCTAssertEqual(document.widget(pasted)?.title, "Card", "a paste keeps the title (only duplicate adds \" copy\")")

        interaction.cutSelection()
        XCTAssertNil(document.widget(pasted))
        interaction.paste()
        XCTAssertEqual(document.board.widgets(on: document.activeCanvasId).count, count + 1, "a cut card pastes back")

        interaction.selectAll()
        XCTAssertEqual(Set(document.selection), Set(document.board.widgets(on: document.activeCanvasId).map(\.id)))
    }
}
#endif
