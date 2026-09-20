import XCTest
import GrovepadCore
@testable import GrovepadChrome

/// The context menu's rows per widget state, the effect of each row through
/// the document, and the action-sheet shape iOS presents.
final class SurfacesContextMenuTests: XCTestCase {
    private func labels(_ model: ContextMenuModel?) -> [String] { model?.rows.map(\.id.rawValue) ?? [] }

    func testRowsPerWidgetState() throws {
        let (document, _, _) = makeDocument()
        let text = document.createWidget(type: "text", at: .zero, title: "Note")!
        let door = document.createWidget(type: "canvas_node", at: Vector2D(x: 400, y: 0), title: "Inner")!
        let child = document.createWidget(type: "counter", at: Vector2D(x: 800, y: 0), title: "Child")!

        XCTAssertNil(ContextMenuModel(widgetId: "gone", document: document))
        XCTAssertEqual(labels(ContextMenuModel(widgetId: text, document: document)), ["duplicate", "rename", "lock", "delete"])
        XCTAssertEqual(labels(ContextMenuModel(widgetId: door, document: document)).first, "open-canvas")
        XCTAssertEqual(ContextMenuModel(widgetId: text, document: document)?.rows.map(\.label), ["Duplicate", "Rename (F2)", "Lock widget", "Delete"])
        XCTAssertEqual(ContextMenuModel(widgetId: text, document: document, nativeMenu: true)?.rows[1].label, "Rename", "no key hint in the system sheet")

        document.setLocked([text], true)
        XCTAssertEqual(ContextMenuModel(widgetId: text, document: document)?.rows[2].label, "Unlock widget")
        document.setLocked([text], false)

        _ = document.addGlue([text, child])
        XCTAssertTrue(labels(ContextMenuModel(widgetId: text, document: document)).contains("unglue"))

        _ = document.addRelation(from: text, to: child, type: .parent)
        let family = try XCTUnwrap(ContextMenuModel(widgetId: text, document: document))
        XCTAssertEqual(family.rows.first { $0.id == .strictHold }?.label, "Release strict hold")
        XCTAssertTrue(family.rows.first { $0.id == .strictHold }!.separatorBefore)
        XCTAssertFalse(labels(ContextMenuModel(widgetId: child, document: document)).contains("strict-hold"), "a leaf has no family to hold")

        document.setStrictHold([text], false)
        XCTAssertEqual(ContextMenuModel(widgetId: text, document: document)?.rows.first { $0.id == .strictHold }?.label, "Hold family strictly")
        _ = document.addRelation(from: child, to: door, type: .parent)
        let inherited = document.resolveStrictHold(door)
        XCTAssertEqual(inherited.strict, false)
        XCTAssertEqual(inherited.inheritedFrom, text, "released by the nearest ancestor that decided")
        _ = document.addRelation(from: door, to: text, type: .parent)
        XCTAssertEqual(ContextMenuModel(widgetId: door, document: document)?.rows.first { $0.id == .strictHold }?.label, "Hold family strictly (released by Note)")

        document.selectWidgets([text, child, door])
        let many = try XCTUnwrap(ContextMenuModel(widgetId: child, document: document))
        XCTAssertEqual(many.actionIds, [text, child, door], "a pressed card inside the selection acts on all of it")
        XCTAssertEqual(many.rows.first { $0.id == .duplicate }?.label, "Duplicate 3")
        XCTAssertEqual(many.rows.first { $0.id == .lock }?.label, "Lock 3")
        XCTAssertEqual(many.rows.last?.label, "Delete 3")
        XCTAssertTrue(many.rows.last!.danger)
        document.clearSelection()
        XCTAssertEqual(ContextMenuModel(widgetId: child, document: document)?.actionIds, [child])
    }

    func testRunningRowsMutatesTheDocumentWithUndo() throws {
        let (document, _, _) = makeDocument()
        let chrome = ChromeState()
        let text = document.createWidget(type: "text", at: .zero, title: "Note")!
        let door = document.createWidget(type: "canvas_node", at: Vector2D(x: 400, y: 0), title: "Inner")!
        let inner = try XCTUnwrap(document.widget(door)?.data.string("canvasId"))
        var navigated: [String] = []
        var deletions: [[String]] = []
        var closed = 0
        let actions = ContextMenuActions(navigate: { navigated.append($0) }, startRenaming: { chrome.renamingWidgetId = $0 }, requestDeletion: { deletions.append($0) }, close: { closed += 1 })
        func menu(_ id: String) -> ContextMenuModel { ContextMenuModel(widgetId: id, document: document)! }

        menu(door).run(.openCanvas, document: document, actions: actions)
        XCTAssertEqual(navigated, [inner])
        menu(text).run(.duplicate, document: document, actions: actions)
        XCTAssertEqual(document.board.widgets.count, 3)
        document.undo()
        XCTAssertEqual(document.board.widgets.count, 2)
        menu(text).run(.rename, document: document, actions: actions)
        XCTAssertEqual(chrome.renamingWidgetId, text)
        document.selectWidgets([text, door])
        document.setLocked([door], true)
        menu(text).run(.lock, document: document, actions: actions)
        XCTAssertTrue(document.widget(text)!.metadata.locked && document.widget(door)!.metadata.locked, "the pressed card decides the direction")
        document.undo()
        XCTAssertFalse(document.widget(text)!.metadata.locked)
        document.setLocked([door], false)
        document.clearSelection()

        _ = document.addGlue([text, door])
        menu(text).run(.unglue, document: document, actions: actions)
        XCTAssertTrue(document.board.glues.isEmpty)
        document.undo()
        XCTAssertEqual(document.board.glues.count, 1)

        _ = document.addRelation(from: text, to: door, type: .parent)
        menu(text).run(.strictHold, document: document, actions: actions)
        XCTAssertEqual(document.widget(text)?.metadata.record.bool("strictHold"), false, "released is stored explicitly")
        menu(text).run(.strictHold, document: document, actions: actions)
        XCTAssertEqual(document.widget(text)?.metadata.record.bool("strictHold"), true)
        document.undo()
        XCTAssertEqual(document.widget(text)?.metadata.record.bool("strictHold"), false)

        menu(text).run(.delete, document: document, actions: actions)
        XCTAssertEqual(deletions, [[text]])
        XCTAssertEqual(closed, 8, "every row closes the menu")
    }

    func testActionSheetShapeAndIndexMapping() throws {
        let (document, _, _) = makeDocument()
        let text = document.createWidget(type: "text", at: .zero, title: "Note")!
        let model = try XCTUnwrap(ContextMenuModel(widgetId: text, document: document, nativeMenu: true))
        let sheet = model.actionSheet
        XCTAssertEqual(sheet.title, "Note")
        XCTAssertEqual(sheet.items.map(\.label), ["Duplicate", "Rename", "Lock widget", "Delete"])
        XCTAssertEqual(sheet.items.map(\.danger), [false, false, false, true], "Delete is red")
        XCTAssertEqual(model.row(atSheetIndex: 3), .delete)
        XCTAssertNil(model.row(atSheetIndex: nil), "dismissing changes nothing")
        XCTAssertNil(model.row(atSheetIndex: 9))
        document.renameWidget(text, title: "")
        XCTAssertNil(ContextMenuModel(widgetId: text, document: document)?.actionSheet.title)
    }
}
