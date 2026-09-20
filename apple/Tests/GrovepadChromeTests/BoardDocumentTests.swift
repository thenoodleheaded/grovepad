import XCTest
import Observation
import GrovepadCore
import GrovepadCanvas
@testable import GrovepadChrome

/// The document's mutation vocabulary beyond the per-widget gate: cascade
/// deletion, duplication with cloned wires, the single-writer rule, the
/// circuit driver running on the document, and the seams the app wires.
final class BoardDocumentTests: XCTestCase {

    /// These tests exercise the circuit system, which the app ships frozen
    /// (`CircuitFeature`); each switches it on for itself only.
    override func invokeTest() {
        let previous = CircuitFeature.isEnabled
        CircuitFeature.isEnabled = true
        defer { CircuitFeature.isEnabled = previous }
        super.invokeTest()
    }
    // MARK: Cascade delete

    func testDeleteCascadesRelationsWiresAndGlues() throws {
        let (document, _, _) = makeDocument()
        let a = document.createWidget(type: "text", at: .zero, title: "A")!
        let b = document.createWidget(type: "counter", at: Vector2D(x: 400, y: 0), title: "B")!
        let c = document.createWidget(type: "toggle", at: Vector2D(x: 800, y: 0), title: "C")!
        let relation = try XCTUnwrap(document.addRelation(from: a, to: b, type: .parent))
        let wire = try XCTUnwrap(document.addValueConnection(from: a, field: "text", to: b, field: "count"))
        let survivorWire = try XCTUnwrap(document.addTriggerConnection(from: a, field: "text", to: c, command: "reset", edge: .change))
        let pair = try XCTUnwrap(document.addGlue([a, b]))
        let trio = try XCTUnwrap(document.addGlue([a, b, c]))
        XCTAssertNil(document.board.glues[pair], "a member joining another cluster leaves the old one, which dissolves")
        let before = document.board

        document.select(b)
        let impact = document.deleteWidgets([b])
        XCTAssertEqual(impact.removedWidgetIds, [b])
        XCTAssertNil(document.widget(b))
        XCTAssertNil(document.board.relations[relation], "relation lost an endpoint")
        XCTAssertNil(document.board.connections[wire], "wire lost an endpoint")
        XCTAssertNotNil(document.board.connections[survivorWire], "a wire between survivors stays")
        XCTAssertEqual(document.board.glues[trio]?.widgetIds, [a, c], "the cluster closes ranks")
        XCTAssertEqual(document.selection, [a, c], "selecting a member selected its cluster; the survivors stay selected")

        document.deleteWidgets([c])
        XCTAssertNil(document.board.glues[trio], "fewer than two members drops the glue")
        XCTAssertNil(document.board.connections[survivorWire])

        document.undo()
        document.undo()
        XCTAssertEqual(document.board, before, "both deletions undo exactly")
    }

    func testLockedWidgetsAreNotDeleted() throws {
        let (document, _, _) = makeDocument()
        let a = document.createWidget(type: "text", at: .zero, title: "A")!
        document.setLocked([a], true)
        let impact = document.deleteWidgets([a])
        XCTAssertTrue(impact.removedWidgetIds.isEmpty)
        XCTAssertNotNil(document.widget(a))
    }

    func testDeletingACanvasCardDeletesItsBranch() throws {
        let (document, _, _) = makeDocument()
        let door = document.createWidget(type: "canvas_node", at: .zero, title: "Inside")!
        let inner = document.widget(door)!.data.string("canvasId")!
        document.navigate(to: inner)
        XCTAssertEqual(document.activeCanvasId, inner)
        let deeper = document.createWidget(type: "canvas_node", at: .zero, title: "Deeper")!
        let deepest = document.widget(deeper)!.data.string("canvasId")!
        let note = document.createWidget(type: "text", at: .zero, title: "Note inside")!
        document.navigate(to: deepest)
        let leaf = document.createWidget(type: "counter", at: .zero, title: "Leaf")!
        XCTAssertEqual(document.board.canvases.count, 3)

        let impact = document.deleteWidgets([door])
        XCTAssertEqual(Set(impact.removedCanvasIds), [inner, deepest])
        XCTAssertEqual(Set(impact.removedWidgetIds), [door, deeper, note, leaf])
        XCTAssertEqual(document.board.canvases.keys, ["root"])
        XCTAssertTrue(document.board.widgets.isEmpty)
        XCTAssertEqual(document.activeCanvasId, "root", "standing inside the branch climbs out to the root")
    }

    // MARK: Duplicate

    func testDuplicateClonesWiresBetweenDuplicatedWidgets() throws {
        let (document, _, _) = makeDocument()
        let a = document.createWidget(type: "counter", at: Vector2D(x: 0, y: 0), title: "A")!
        let b = document.createWidget(type: "number_input", at: Vector2D(x: 400, y: 0), title: "B")!
        let c = document.createWidget(type: "toggle", at: Vector2D(x: 800, y: 0), title: "C")!
        let inside = try XCTUnwrap(document.addValueConnection(from: a, field: "count", to: b, field: "value"))
        let outside = try XCTUnwrap(document.addTriggerConnection(from: c, field: "value", to: a, command: "reset", edge: .rising))
        let relation = try XCTUnwrap(document.addRelation(from: a, to: b, type: .cousin))
        document.updateWidgetData(a) { $0["count"] = .number(5) }

        let clones = document.duplicateWidgets([a, b], mint: .counting(prefix: "dup-"))
        XCTAssertEqual(clones, ["dup-0001", "dup-0002"])
        XCTAssertEqual(document.selection, clones)
        let cloneA = try XCTUnwrap(document.widget("dup-0001"))
        XCTAssertEqual(cloneA.title, "A copy")
        XCTAssertEqual(cloneA.position, Vector2D(x: 40, y: 40))
        XCTAssertEqual(cloneA.data, document.widget(a)!.data)
        XCTAssertEqual(cloneA.canvasId, "root")
        XCTAssertEqual(cloneA.record.keys, document.widget(a)!.record.keys)

        XCTAssertEqual(document.board.connections.count, 3, "the inside wire is cloned, the outside one is not")
        let cloned = try XCTUnwrap(document.board.connections.values.first { $0.fromId == "dup-0001" })
        XCTAssertEqual(cloned.toId, "dup-0002")
        XCTAssertEqual(cloned.toField, "value")
        XCTAssertNotEqual(cloned.id, inside)
        XCTAssertNotNil(document.board.connections[outside])
        XCTAssertEqual(document.board.relations.count, 2)
        XCTAssertNotEqual(document.board.relations.values.last?.id, relation)
        XCTAssertEqual(document.board.relations.values.last?.fromId, "dup-0001")
    }

    func testDuplicatingACanvasCardCopiesItsBoard() throws {
        let (document, _, _) = makeDocument()
        let door = document.createWidget(type: "canvas_node", at: .zero, title: "Door")!
        let inner = document.widget(door)!.data.string("canvasId")!
        document.navigate(to: inner)
        let note = document.createWidget(type: "text", at: .zero, title: "Inside")!
        document.navigate(to: "root")

        let clones = document.duplicateWidgets([door], mint: .counting(prefix: "dup-"))
        let cloneDoor = try XCTUnwrap(document.widget(clones[0]))
        XCTAssertEqual(cloneDoor.title, "Door copy")
        let cloneCanvasId = try XCTUnwrap(cloneDoor.data.string("canvasId"))
        XCTAssertNotEqual(cloneCanvasId, inner)
        let cloneCanvas = try XCTUnwrap(document.canvas(cloneCanvasId))
        XCTAssertEqual(cloneCanvas.name, "Door copy")
        XCTAssertEqual(cloneCanvas.parentCanvasId, "root")
        let insideClones = document.board.widgets(on: cloneCanvasId)
        XCTAssertEqual(insideClones.count, 1)
        XCTAssertEqual(insideClones[0].title, "Inside")
        XCTAssertNotEqual(insideClones[0].id, note)
        XCTAssertEqual(document.board.widgets(on: inner).count, 1, "the source board is untouched")
    }

    // MARK: Wires

    func testSingleWriterRuleReplacesTheEarlierValueWire() throws {
        let (document, _, _) = makeDocument()
        let a = document.createWidget(type: "counter", at: .zero, title: "A")!
        let b = document.createWidget(type: "counter", at: .zero, title: "B")!
        let target = document.createWidget(type: "number_input", at: .zero, title: "T")!
        let first = try XCTUnwrap(document.addValueConnection(from: a, field: "count", to: target, field: "value"))
        let second = try XCTUnwrap(document.addValueConnection(from: b, field: "count", to: target, field: "value"))
        XCTAssertNil(document.board.connections[first], "one incoming value wire per target field")
        XCTAssertNotNil(document.board.connections[second])
        XCTAssertEqual(document.board.connections.count, 1)

        XCTAssertNil(document.addValueConnection(from: a, field: "nope", to: target, field: "value"), "unknown source field")
        XCTAssertNil(document.addValueConnection(from: a, field: "count", to: target, field: "nope"), "unknown target field")
        XCTAssertNil(document.addValueConnection(from: a, field: "count", to: a, field: "count"), "self wire")
        let trigger = try XCTUnwrap(document.addTriggerConnection(from: a, field: "count", to: target, command: "reset", edge: .rising))
        XCTAssertEqual(document.addTriggerConnection(from: a, field: "count", to: target, command: "reset", edge: .falling), trigger, "an identical trigger wire is a no-op re-draw")
        XCTAssertNil(document.addTriggerConnection(from: a, field: "count", to: target, command: "explode", edge: .rising))

        document.setConnectionTransform(second, .scale(factor: 2))
        XCTAssertEqual(document.board.connections[second]?.transform, .scale(factor: 2))
        document.setConnectionEnabled(second, false)
        XCTAssertEqual(document.board.connections[second]?.enabled, false)
        document.setConnectionEdge(trigger, .change)
        XCTAssertEqual(document.board.connections[trigger]?.edge, .change)
        document.removeConnection(second)
        XCTAssertNil(document.board.connections[second])
    }

    func testVersionStampsMoveWithTheRightMaps() throws {
        let (document, _, _) = makeDocument()
        let a = document.createWidget(type: "counter", at: .zero, title: "A")!
        let b = document.createWidget(type: "number_input", at: .zero, title: "B")!
        let widgets = document.widgetsVersion
        let connections = document.connectionsVersion
        _ = document.addValueConnection(from: a, field: "count", to: b, field: "value")
        XCTAssertEqual(document.widgetsVersion, widgets, "drawing a wire leaves widgets alone")
        XCTAssertEqual(document.connectionsVersion, connections + 1)
        document.runCommand(a, "increment")
        XCTAssertEqual(document.widgetsVersion, widgets + 1)
        XCTAssertEqual(document.connectionsVersion, connections + 1)
        document.undo()
        XCTAssertEqual(document.widgetsVersion, widgets + 2, "undo bumps both stamps")
        XCTAssertEqual(document.connectionsVersion, connections + 2)
        document.loadBoard(makeBoard())
        XCTAssertEqual(document.widgetsVersion, widgets + 3)
        XCTAssertEqual(document.connectionsVersion, connections + 3)
        XCTAssertFalse(document.canUndo, "a load clears history")
    }

    // MARK: The driver on the document

    func testCircuitDriverDeliversOnEditWithoutUndoEntries() throws {
        let (document, undo, clock) = makeDocument()
        let counter = document.createWidget(type: "counter", at: .zero, title: "Counter")!
        let number = document.createWidget(type: "number_input", at: .zero, title: "Number")!
        let scheduler = FakeScheduler()
        let driver = CircuitDriver(host: document, scheduler: scheduler, clock: clock.clock, minter: .counting(prefix: "wave-"))
        let dispose = driver.start()
        defer { dispose() }
        undo.removeAllActions()

        // Drawing the wire delivers the current value at once.
        clock.advance(ms: 1000)
        let wire = try XCTUnwrap(document.addValueConnection(from: counter, field: "count", to: number, field: "value", transform: .scale(factor: 10)))
        XCTAssertEqual(document.widget(number)?.data.number("value"), 0)
        XCTAssertEqual(undo.undoActionName, "Wire")

        clock.advance(ms: 1000)
        document.runCommand(counter, "increment")
        XCTAssertEqual(document.widget(counter)?.data.number("count"), 1)
        XCTAssertEqual(document.widget(number)?.data.number("value"), 10, "the wire delivered on edit")
        XCTAssertEqual(undo.undoActionName, "Edit", "the delivery registered no undo step of its own")

        clock.advance(ms: 1000)
        document.runCommand(counter, "increment")
        XCTAssertEqual(document.widget(number)?.data.number("value"), 20)

        // Undo restores the board before the last tap; the driver baselines it.
        document.undo()
        XCTAssertEqual(document.widget(counter)?.data.number("count"), 1)
        XCTAssertEqual(document.widget(number)?.data.number("value"), 10, "undo restores the snapshot, the driver stays quiet")
        document.undo()
        XCTAssertEqual(document.widget(number)?.data.number("value"), 0)
        XCTAssertEqual(undo.undoActionName, "Wire", "only the wire draw is left to undo")

        // Tapping through the field setter goes the same way as a wire.
        clock.advance(ms: 1000)
        document.setField(counter, "count", .number(4))
        XCTAssertEqual(document.widget(number)?.data.number("value"), 40)
        XCTAssertNotNil(document.board.connections[wire])
        XCTAssertEqual(document.circuitUI.firePulses[wire], clock.now, "the delivery pulse lands in the circuit UI state")
    }

    func testTriggerWireFiresACommandAndRecordsThePulse() throws {
        let (document, _, clock) = makeDocument()
        let toggle = document.createWidget(type: "toggle", at: .zero, title: "Switch")!
        let counter = document.createWidget(type: "counter", at: .zero, title: "Counter")!
        let driver = CircuitDriver(host: document, scheduler: FakeScheduler(), clock: clock.clock, minter: .counting(prefix: "wave-"))
        let dispose = driver.start()
        defer { dispose() }
        let wire = try XCTUnwrap(document.addTriggerConnection(from: toggle, field: "value", to: counter, command: "increment", edge: .rising))
        XCTAssertEqual(document.widget(counter)?.data.number("count"), 0, "drawing a rising trigger on a false source fires nothing")
        document.setField(toggle, "value", .bool(true))
        XCTAssertEqual(document.widget(counter)?.data.number("count"), 1)
        XCTAssertEqual(document.circuitUI.firePulses[wire], clock.now)
        document.setField(toggle, "value", .bool(false))
        XCTAssertEqual(document.widget(counter)?.data.number("count"), 1, "falling edge does not fire a rising wire")
    }

    // MARK: Gestures, rename, pin, autosave

    func testDragGestureIsOneUndoStepAndSnaps() throws {
        let (document, undo, _) = makeDocument()
        let a = document.createWidget(type: "text", at: .zero, title: "A")!
        let locked = document.createWidget(type: "text", at: Vector2D(x: 400, y: 0), title: "L")!
        document.setLocked([locked], true)
        undo.removeAllActions()
        document.beginGesture(named: "Move")
        document.moveWidgets([a, locked], by: Vector2D(x: 13, y: 7))
        document.moveWidgets([a, locked], by: Vector2D(x: 10, y: 10))
        XCTAssertEqual(document.widget(a)?.position, Vector2D(x: 23, y: 17))
        XCTAssertEqual(document.widget(locked)?.position, Vector2D(x: 400, y: 0), "locked never moves")
        XCTAssertFalse(undo.canUndo, "nothing registers mid-gesture")
        document.snapWidgetsToGrid([a])
        document.endGesture()
        XCTAssertEqual(document.widget(a)?.position, Vector2D(x: 40, y: 0))
        XCTAssertTrue(undo.canUndo)
        document.undo()
        XCTAssertEqual(document.widget(a)?.position, .zero, "one step for the whole drag")
        XCTAssertFalse(undo.canUndo)
        document.nudgeWidgets([a], by: Vector2D(x: 40, y: 0))
        XCTAssertEqual(document.widget(a)?.position, Vector2D(x: 40, y: 0))
    }

    /// The Undo/Redo buttons redraw only when something they read changes;
    /// `UndoManager` is not observable, so the document must tick for it.
    func testUndoRedoAvailabilityIsObservable() throws {
        let (document, _, _) = makeDocument()
        var fired = 0
        func watch() {
            withObservationTracking { _ = (document.canUndo, document.canRedo) } onChange: { fired += 1 }
        }
        watch()
        _ = document.createWidget(type: "text", at: .zero, title: "A")
        XCTAssertEqual(fired, 1, "a first edit enables Undo")
        XCTAssertTrue(document.canUndo)
        watch()
        document.undo()
        XCTAssertEqual(fired, 2, "undo enables Redo and disables Undo")
        XCTAssertTrue(document.canRedo)
        XCTAssertFalse(document.canUndo)
        watch()
        document.beginGesture(named: "Move")
        document.endGesture()
        document.redo()
        XCTAssertEqual(fired, 3, "redo disables Redo again")
    }

    func testRenamingACanvasCardRenamesItsCanvas() throws {
        let (document, _, _) = makeDocument()
        let door = document.createWidget(type: "canvas_node", at: .zero, title: "Door")!
        let inner = document.widget(door)!.data.string("canvasId")!
        document.renameWidget(door, title: "Front door")
        XCTAssertEqual(document.canvasName(inner), "Front door")
        document.renameCanvas(inner, name: "Back door")
        XCTAssertEqual(document.widget(door)?.title, "Back door")
    }

    func testPinningAnOpenCardHoldsItOpenAndMakesRoomForItsNeighbours() throws {
        let (document, _, _) = makeDocument()
        document.restingTileSize = WidgetRestContextFactory.restingTileSize
        let id = document.createWidget(type: "counter", at: Vector2D(x: 200, y: 200), title: "C")!
        let tile = WidgetRestContextFactory.restingTileSize(document.widget(id)!)!
        let neighbour = document.createWidget(type: "counter", at: Vector2D(x: 200 + tile.width + 24, y: 200), title: "N")!
        document.expandedWidgetId = id
        let before = document.widget(neighbour)!.position
        document.setPinned(id, true)
        XCTAssertNil(document.expandedWidgetId, "the pin holds the card open, not the click")
        let card = document.widget(id)!
        let full = card.size
        XCTAssertFalse(WidgetRestContextFactory.make().isResting(card))
        let a = CGRect(x: card.position.x, y: card.position.y, width: full.width, height: full.height)
        let n = document.widget(neighbour)!
        let b = CGRect(x: n.position.x, y: n.position.y, width: n.size.width, height: n.size.height)
        XCTAssertFalse(a.intersects(b), "the neighbours space out around the pinned card")
        XCTAssertNotEqual(n.position, before)
    }

    func testPinningAnIconCommitsThePeekAndUnpinningRestoresIt() throws {
        let (document, _, _) = makeDocument()
        let id = document.createWidget(type: "counter", at: Vector2D(x: 200, y: 200), title: "C")!
        document.restingTileSize = WidgetRestContextFactory.restingTileSize
        document.setIconified(id, true)
        // Park the icon where the absorbed peek offset lands on the grid, so
        // the round trip below is exact (the web snaps the absorbed anchor too).
        let parked = document.widget(id)!.position
        document.beginGesture(named: "Move")
        document.moveWidgets([id], by: Vector2D(x: 100 - parked.x, y: 60 - parked.y))
        document.endGesture()
        let icon = document.widget(id)!
        XCTAssertEqual(icon.position, Vector2D(x: 100, y: 60))
        document.setPinned(id, true)
        let pinned = document.widget(id)!
        XCTAssertEqual(pinned.iconified, false)
        XCTAssertEqual(pinned.size, Size(width: 280, height: 200))
        XCTAssertEqual(pinned.position, .zero, "pinning a peeked icon absorbs the centring offset")
        XCTAssertEqual(pinned.metadata.pinnedFrom?.objectValue?.string("kind"), "icon")
        XCTAssertEqual(pinned.metadata.record.keys, ["badges", "pinned", "pinnedFrom"])
        document.setPinned(id, false)
        let restored = document.widget(id)!
        XCTAssertEqual(restored.iconified, true)
        XCTAssertEqual(restored.size, icon.size)
        XCTAssertEqual(restored.position, icon.position, "pin and unpin round-trip the icon")
        XCTAssertNil(restored.metadata.pinnedFrom)
        XCTAssertFalse(restored.metadata.pinned)
    }

    func testAutosaveAndListenersFireOnEveryCommit() throws {
        let (document, _, _) = makeDocument()
        var saved: [Board] = []
        var notified = 0
        document.autosave = { saved.append($0) }
        let unsubscribe = document.subscribe { notified += 1 }
        let id = document.createWidget(type: "text", at: .zero, title: "A")!
        document.updateWidgetData(id) { $0["text"] = .string("x") }
        document.applyWireWrites([id: ["text": "y"]])
        document.updateWidgetData(id) { _ in } // no change, no save
        XCTAssertEqual(saved.count, 3)
        XCTAssertEqual(notified, 3)
        XCTAssertEqual(saved.last, document.board)
        unsubscribe()
        document.undo()
        XCTAssertEqual(notified, 3, "unsubscribed")
        XCTAssertEqual(saved.count, 4, "undo autosaves too")
    }

    func testSelectionFollowsTheBoard() throws {
        let (document, _, _) = makeDocument()
        let a = document.createWidget(type: "text", at: .zero, title: "A")!
        let b = document.createWidget(type: "text", at: .zero, title: "B")!
        document.select(a)
        document.select(b, additive: true)
        XCTAssertEqual(document.selection, [a, b])
        document.select(a, additive: true)
        XCTAssertEqual(document.selection, [b])
        document.selectWidgets([a, b, a, "ghost"])
        XCTAssertEqual(document.selection, [a, b])
        document.undo()
        XCTAssertEqual(document.selection, [a], "undoing a creation drops it from the selection")
        document.clearSelection()
        XCTAssertTrue(document.selection.isEmpty)
    }
}
