import XCTest
import GrovepadCore
@testable import GrovepadChrome

/// The close/quit decision table and the shortcut table.
final class SurfacesQuitAndShortcutsTests: XCTestCase {
    func testQuitDecisionTable() {
        XCTAssertEqual(QuitRules.decide(QuitContext()), .allow)
        XCTAssertEqual(QuitRules.decide(QuitContext(localSave: .saved)), .allow)
        XCTAssertEqual(QuitRules.decide(QuitContext(cloudPushPending: true)), .flushThenAllow)
        XCTAssertTrue(QuitRules.decide(QuitContext(gestureDirty: true)).blocks)
        XCTAssertTrue(QuitRules.decide(QuitContext(localSave: .saving)).blocks)
        XCTAssertTrue(QuitRules.decide(QuitContext(localSave: .error)).blocks)
        if case .warn(let reason) = QuitRules.decide(QuitContext(localSave: .error)) {
            XCTAssertTrue(reason.contains("could not be read"))
        } else {
            XCTFail("paused writes must warn")
        }
        XCTAssertEqual(QuitRules.decide(QuitContext(gestureDirty: true, localSave: .saved, cloudPushPending: true)), .warn(reason: "A change is still waiting to be saved."))
        XCTAssertEqual(QuitRules.flushOrder, ["board", "device", "view"])
        XCTAssertEqual(QuitRules.FlushMoment.allCases.count, 4)
        XCTAssertTrue(QuitRules.showsUnsavedIndicator(QuitContext(localSave: .error)))
        XCTAssertFalse(QuitRules.showsUnsavedIndicator(QuitContext(localSave: .saving)), "autosave is never 'edited' to the person")
    }

    func testShortcutTableAndActionableRows() {
        XCTAssertEqual(ShortcutsModel.sections.map(\.title), ["Touch & trackpad", "Canvas", "Create & edit", "Selection", "Find & navigate"])
        XCTAssertEqual(ShortcutsModel.rowCount, 52)
        let allLabels = Set(ShortcutsModel.sections.flatMap(\.rows).map(\.label))
        for action in ShortcutAction.allCases {
            XCTAssertTrue(allLabels.contains(action.rawValue), "\(action.rawValue) is a row")
        }
        XCTAssertTrue(ShortcutsModel.isActionable("Undo"))
        XCTAssertFalse(ShortcutsModel.isActionable("Pan the canvas"))

        var log: [String] = []
        let actions = ShortcutsModel.Actions(
            frame: { log.append("frame") }, zoomIn: { log.append("zoomIn") }, resetZoom: { log.append("reset") },
            quickAdd: { log.append("quickAdd") }, undo: { log.append("undo") }, redo: { log.append("redo") },
            duplicate: { log.append("duplicate") }, palette: { log.append("palette") }, close: { log.append("close") }
        )
        XCTAssertTrue(ShortcutsModel.run("Undo", actions))
        XCTAssertTrue(ShortcutsModel.run("Command palette — searches every canvas", actions))
        XCTAssertFalse(ShortcutsModel.run("Pan the canvas", actions))
        XCTAssertEqual(log, ["undo", "close", "palette", "close"], "an actionable row runs, then the overlay closes")
    }
}
