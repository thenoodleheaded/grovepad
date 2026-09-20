#if os(macOS)
import AppKit
import Foundation
import GrovepadCore
import GrovepadCanvas
import GrovepadChrome

/// A hands-off run through the shell, for a build machine that cannot click:
/// `GROVEPAD_PREVIEW_SMOKE=1 GROVEPAD_PREVIEW_STORE=/tmp/x swift run GrovepadPreview`
/// creates two cards,
/// opens one, wires them through the linking controller, edits the source,
/// checks the driver delivered, undoes, flips Circuit Mode, waits for the
/// autosave and quits with 0 on success, 1 on the first failed check.
enum PreviewSmoke {
    @MainActor
    static func run(_ app: PreviewAppDelegate) {
        Task { @MainActor in
            var failures: [String] = []
            func check(_ condition: Bool, _ label: String) {
                print(condition ? "  ok   \(label)" : "  FAIL \(label)")
                if !condition { failures.append(label) }
            }
            func settle() async { try? await Task.sleep(nanoseconds: 150_000_000) }

            let document = app.document
            let canvas = app.canvas!
            await settle()
            check(document.board.widgets.isEmpty, "the smoke store starts empty (set GROVEPAD_PREVIEW_STORE to a scratch folder)")
            check(app.window.isVisible, "window is visible")
            check(canvas.bounds.width > 100 && canvas.bounds.height > 100, "canvas has a size (\(Int(canvas.bounds.width))×\(Int(canvas.bounds.height)))")

            let centre = canvas.viewportCentreWorld
            let source = document.createWidget(type: "number_input", at: Vector2D(x: centre.x - 400, y: centre.y), title: "Number")!
            let target = document.createWidget(type: "counter", at: Vector2D(x: centre.x + 200, y: centre.y), title: "Tally")!
            canvas.expand(target)
            await settle()
            check(canvas.controller.liveCardIds.contains(target), "the opened card is live")
            check(canvas.liveHost.mountedIds.contains(target), "its WidgetCardView is mounted")
            check(canvas.controller.restingCardIds.contains(source), "the other card rests as a tile")
            check(canvas.controller.hostLayer.isGeometryFlipped, "the hosted world layer kept its y-down flip under AppKit")

            // Wire number.value → counter.count the way a rail drag does.
            let context = canvas.restContext()
            let targetWidget = document.widget(target)!
            let inputs = inputPortsFor("counter")
            let countIndex = inputs.firstIndex { $0.key == "count" && $0.kind == .field } ?? 0
            let frame = displayedWidgetRect(targetWidget, restContext: context)
            let dot = PortGeometry.portWorldPosition(frame: frame, side: .input, index: countIndex, count: inputs.count)
            check(canvas.linking.beginDrag(fromWidget: source, field: "value", at: .zero), "a drag starts from the number's output")
            canvas.linking.moveDrag(toWorld: dot)
            await settle()
            check(!canvas.coordinator.ghostLayer.isHidden, "the ghost wire follows the drag")
            let outcome = canvas.linking.endDrag(atWorld: dot)
            var wireId: String?
            if case .connected(let id) = outcome { wireId = id }
            check(wireId != nil, "dropping on the count port draws a wire")
            await settle()
            check(canvas.coordinator.lastFrame.descriptors.map(\.id) == [wireId ?? ""], "the coordinator describes the wire")
            check(canvas.controller.hostLayer.edgeLayer.mountedEdgeIds == Set([wireId ?? ""]), "the edge layer mounts it")

            document.setField(source, "value", .number(7))
            await settle()
            check(num(document.widget(target)?.data["count"]) == 7, "the driver delivered 7 into the counter")
            check(document.undoManager?.undoActionName == "Edit", "the top undo step is the number edit")
            document.undo()
            await settle()
            check(document.board.connections.contains(wireId ?? ""), "undo kept the wire (only the edit was undone)")
            check(document.board.widgets.count == 2, "undo kept both cards")
            check(num(document.widget(source)?.data["value"]) != 7, "undo reverted the number edit")
            check(num(document.widget(target)?.data["count"]) != 7, "undo reverted the delivered count with it")

            document.setCircuitMode(true)
            await settle()
            check(canvas.mountedRailIds == Set([source, target]), "Circuit Mode mounts a rail on both cards")
            check(canvas.coordinator.lastFrame.chips.count == 1, "the wire wears a value chip")
            document.setCircuitMode(false)

            canvas.mouseDownOnEmptyCanvasForSmoke()
            await settle()
            check(document.expandedWidgetId == nil && document.selection.isEmpty, "a press on empty canvas closes and deselects")

            try? await Task.sleep(nanoseconds: 900_000_000)
            check(FileManager.default.fileExists(atPath: app.store.indexURL.path), "autosave wrote index.json")

            document.deleteWidgets([source, target])
            try? await Task.sleep(nanoseconds: 700_000_000)
            print(failures.isEmpty ? "SMOKE OK" : "SMOKE FAILED: \(failures.count) check(s)")
            exit(failures.isEmpty ? 0 : 1)
        }
    }
}
#endif
