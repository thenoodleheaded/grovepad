import XCTest
import GrovepadCore
@testable import GrovepadChrome

/// Deletion asks only for a cascade; toasts queue, retire and auto-dismiss on
/// an injected clock; the circuit's damped-loop message lands as a toast.
final class SurfacesDialogsAndToastsTests: XCTestCase {
    func testPlainDeletionRunsAtOnceAndACascadeWaitsForTheDialog() throws {
        let (document, _, _) = makeDocument()
        let dialog = DeletionDialogModel(document: document)
        let text = document.createWidget(type: "text", at: .zero, title: "Note")!
        dialog.request([text])
        XCTAssertNil(document.widget(text), "no descendants: deleted immediately")
        XCTAssertFalse(dialog.isPresented)

        let door = document.createWidget(type: "canvas_node", at: .zero, title: "Inner")!
        let inner = try XCTUnwrap(document.widget(door)?.data.string("canvasId"))
        dialog.request([door])
        XCTAssertNil(document.widget(door), "an empty nested canvas is one canvas with no descendants: immediate")
        document.undo()
        document.navigate(to: inner)
        _ = document.createWidget(type: "counter", at: .zero, title: "Deep")
        document.navigate(to: "root")

        dialog.request([door])
        XCTAssertTrue(dialog.isPresented)
        XCTAssertNotNil(document.widget(door), "waits for confirmation")
        XCTAssertEqual(dialog.description, "This removes 2 widgets across 1 nested canvas. You can immediately restore the entire deletion with Undo.")
        XCTAssertEqual(dialog.confirmLabel, "Delete subtree")
        dialog.close()
        XCTAssertFalse(dialog.isPresented)
        XCTAssertNotNil(document.widget(door))

        dialog.request([door])
        dialog.confirm()
        XCTAssertNil(document.widget(door))
        XCTAssertFalse(document.board.canvases.contains(inner))
        XCTAssertFalse(dialog.isPresented)
        document.undo()
        XCTAssertNotNil(document.widget(door))

        document.setLocked([door], true)
        dialog.request([door])
        XCTAssertFalse(dialog.isPresented, "a locked card is skipped by the impact")
        XCTAssertNotNil(document.widget(door))

        let confirm = ConfirmDialogModel.deleteWorkspace(named: "Studies", onConfirm: {}, onClose: {})
        XCTAssertEqual(confirm.title, "Delete “Studies”?")
        XCTAssertTrue(confirm.destructive)
        XCTAssertEqual(confirm.confirmLabel, "Delete workspace")
        XCTAssertEqual(confirm.cancelLabel, "Cancel")
    }

    func testToastQueueRetiresOldOnesAndAutoDismisses() {
        let scheduler = ManualToastScheduler()
        let toasts = ToastModel(scheduler: scheduler, mint: .counting(prefix: "t-"))
        toasts.add("one")
        scheduler.advance(ms: 100)
        toasts.add("two")
        scheduler.advance(ms: 100)
        toasts.add("three")
        scheduler.advance(ms: 100)
        XCTAssertEqual(toasts.toasts.filter { !$0.leaving }.count, 3)
        toasts.add("four")
        XCTAssertEqual(toasts.toasts.count, 4)
        XCTAssertTrue(toasts.toasts[0].leaving, "the oldest bows out when a fourth lands")
        XCTAssertEqual(toasts.toasts.filter { !$0.leaving }.map(\.message), ["two", "three", "four"])
        scheduler.advance(ms: ToastModel.exitFailsafeMs)
        XCTAssertEqual(toasts.toasts.map(\.message), ["two", "three", "four"], "the failsafe removes a retired toast")

        scheduler.advance(ms: ToastModel.defaultDurationMs - ToastModel.exitFailsafeMs - 200)
        XCTAssertTrue(toasts.toasts[0].leaving, "two's 2.8 s is up")
        XCTAssertFalse(toasts.toasts[1].leaving, "three's is not")
        scheduler.advance(ms: ToastModel.exitFailsafeMs)
        XCTAssertEqual(toasts.toasts.map(\.message), ["three", "four"])
        scheduler.advance(ms: 10_000)
        XCTAssertTrue(toasts.toasts.isEmpty)

        for index in 0..<8 { toasts.add("burst \(index)") }
        XCTAssertEqual(toasts.toasts.count, ToastModel.hardLimit, "past the ceiling the oldest drop outright")
        scheduler.advance(ms: 10_000)
        XCTAssertTrue(toasts.toasts.isEmpty)
    }

    func testDangerAndActionToastsLingerAndTheActionRuns() {
        let scheduler = ManualToastScheduler()
        let toasts = ToastModel(scheduler: scheduler, mint: .counting(prefix: "t-"))
        var ran = 0
        let id = toasts.add("Deleted workspace", action: ToastAction(label: "Undo") { ran += 1 })
        toasts.add("Could not save", tone: .danger)
        scheduler.advance(ms: ToastModel.defaultDurationMs + ToastModel.exitFailsafeMs)
        XCTAssertEqual(toasts.toasts.count, 2, "both linger past the default")
        toasts.runAction(id)
        XCTAssertEqual(ran, 1)
        XCTAssertTrue(toasts.toasts[0].leaving)
        toasts.dismiss(id)
        XCTAssertEqual(toasts.toasts.count, 2, "dismiss is idempotent")
        toasts.remove(id)
        XCTAssertEqual(toasts.toasts.map(\.message), ["Could not save"])
        scheduler.advance(ms: ToastModel.attentionDurationMs)
        XCTAssertTrue(toasts.toasts.isEmpty)
    }

    func testTheDocumentsMessagesBecomeToasts() {
        let (document, _, _) = makeDocument()
        let toasts = ToastModel(scheduler: ManualToastScheduler(), mint: .counting(prefix: "t-"))
        toasts.bind(to: document)
        document.notifyLoopDamped("Circuit loop damped: A → B")
        XCTAssertEqual(toasts.toasts.map(\.message), ["Circuit loop damped: A → B"])
        XCTAssertEqual(toasts.toasts[0].tone, .info)
    }
}
