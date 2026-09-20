import XCTest
import SwiftUI
import GrovepadCore
@testable import GrovepadChrome

/// The skin roller (`WidgetSkinRoller.tsx`, `skinRollerGeometry.ts`): the
/// drum's maths, its click-versus-drag rule, the trackpad and wheel input,
/// the ticks it reports and how it leaves.
final class SkinRollerTests: XCTestCase {
    private typealias G = SkinRollerGeometry
    private let row = SkinRollerGeometry.rowHeight

    private final class Recorder {
        var ticks: [SkinRollerTick] = []
        var committed: [String] = []
        var finished = 0
    }

    private func roller(count: Int = 5, current: Int = 2, reducedMotion: Bool = true) -> (SkinRollerModel, Recorder) {
        let recorder = Recorder()
        let rows = (0..<count).map { SkinPickerModel.Row(value: "s\($0)", label: "Skin \($0)", accent: "#60a5fa", symbol: "circle", isCurrent: $0 == current) }
        let anchor = SkinRollerModel.Anchor(left: 100, centreY: 300, height: 32, iconCentre: Vector2D(x: 115, y: 300), iconSize: 26)
        let model = SkinRollerModel(widgetId: "w", rows: rows, anchor: anchor, reducedMotion: reducedMotion,
                                    onCommit: { recorder.committed.append($0) },
                                    onTick: { recorder.ticks.append($0) },
                                    onFinish: { recorder.finished += 1 })
        model.unfurl()
        return (model, recorder)
    }

    // MARK: - Geometry (the web's numbers)

    func testTheBarrelMatchesTheWebConstants() {
        XCTAssertEqual(G.drumRadius, 247.37, accuracy: 0.01)
        XCTAssertEqual(G.drumPerspective, 1040)
        let lane = G.project(G.placeRow(2, offset: 2 * row))
        XCTAssertEqual(lane.y, 0)
        XCTAssertEqual(lane.squash, 1)
        XCTAssertEqual(lane.scale, 1.312, accuracy: 0.001, "the lane rides the drum's magnification")
        let below = G.project(G.placeRow(3, offset: 2 * row))
        XCTAssertGreaterThan(below.y, 0, "the next skin sits under the lane")
        XCTAssertLessThan(below.squash, 1)
        XCTAssertEqual(G.project(G.placeRow(1, offset: 2 * row)).y, -below.y, accuracy: 1e-9)
    }

    func testRowsFadeAndBlurAwayFromTheLane() {
        XCTAssertEqual(G.placeRow(0, offset: 0).opacity, 1)
        XCTAssertEqual(G.placeRow(3, offset: 0).blur, 0, "three rows each way stay sharp")
        XCTAssertEqual(G.placeRow(4, offset: 0).blur, 6)
        XCTAssertTrue(G.placeRow(6, offset: 0).hidden)
        XCTAssertFalse(G.placeRow(5, offset: 0).hidden)
    }

    func testEndsResistAndIndexRoundsLikeJavaScript() {
        XCTAssertEqual(G.resistOffset(-1000, count: 5), -G.rubberBand(1000), accuracy: 1e-9)
        XCTAssertGreaterThan(G.resistOffset(-1000, count: 5), -row, "never a full row past the end")
        XCTAssertEqual(G.resistOffset(100, count: 5), 100)
        XCTAssertEqual(G.index(forOffset: row / 2, count: 5), 1, "halves round up")
        XCTAssertEqual(G.index(forOffset: -row / 2, count: 5), 0)
        XCTAssertEqual(G.index(forOffset: 99 * row, count: 5), 4)
        XCTAssertEqual(G.wheelSteps(-95).steps, -2)
        XCTAssertEqual(G.wheelSteps(-95).remainder, -15)
    }

    // MARK: - Pointer

    func testAClickOnTheLaneWearsItAndLeaves() {
        let (model, recorder) = roller()
        model.pressBegan(row: 2)
        model.pressMoved(travel: 3)
        model.pressEnded()
        XCTAssertEqual(recorder.committed, ["s2"])
        XCTAssertEqual(recorder.ticks, [.commit])
        XCTAssertEqual(model.phase, .closing)
        XCTAssertEqual(recorder.finished, 1, "reduced motion leaves at once")
    }

    func testAClickOnANeighbourRollsItInRatherThanWearingIt() {
        let (model, recorder) = roller()
        model.pressBegan(row: 4)
        model.pressEnded()
        XCTAssertEqual(model.activeIndex, 4)
        XCTAssertTrue(recorder.committed.isEmpty)
        XCTAssertEqual(recorder.ticks, [.detent])
    }

    func testAPressPastTheSlopIsADragForGood() {
        let (model, recorder) = roller()
        model.pressBegan(row: 2)
        model.pressMoved(travel: -8)
        XCTAssertEqual(model.offset, 2 * row, "the slop never moves the drum")
        model.pressMoved(travel: -9)
        model.pressMoved(travel: -9 - row)
        XCTAssertEqual(model.activeIndex, 3, "dragging up brings later skins into the lane")
        model.pressMoved(travel: -9)
        model.pressEnded()
        XCTAssertTrue(recorder.committed.isEmpty, "dragged back to where it started, still not a click")
        XCTAssertEqual(model.offset, 2 * row)
        XCTAssertEqual(recorder.ticks, [.detent, .detent])
    }

    func testDraggingPastAnEndTicksTheLimitOnce() {
        let (model, recorder) = roller(current: 0)
        model.pressBegan(row: 0)
        model.pressMoved(travel: 20)
        model.pressMoved(travel: 60)
        model.pressMoved(travel: 90)
        XCTAssertLessThan(model.offset, 0)
        XCTAssertEqual(recorder.ticks, [.limit])
        model.pressEnded()
        XCTAssertEqual(model.offset, 0, "settles back on the first skin")
    }

    func testThePressedRowIsFoundOnTheProjectedDrum() {
        let (model, _) = roller()
        XCTAssertEqual(model.row(at: Vector2D(x: 200, y: 300)), 2)
        XCTAssertEqual(model.row(at: Vector2D(x: 200, y: 300 + row)), 3)
        XCTAssertNil(model.row(at: Vector2D(x: 50, y: 300)), "left of the drum is off it")
    }

    // MARK: - Trackpad and wheel

    func testATrackpadCarriesTheDrumAndTicksEveryDetent() {
        let (model, recorder) = roller(current: 0, reducedMotion: false)
        model.trackBegan()
        for _ in 0..<13 { model.track(deltaY: -10) }
        XCTAssertEqual(model.offset, 130)
        XCTAssertEqual(model.activeIndex, 3)
        XCTAssertEqual(recorder.ticks, [.detent, .detent, .detent], "one tick per skin through the lane")
        model.trackEnded()
        while model.advance(ms: 16) {}
        XCTAssertEqual(model.offset, 3 * row, "settles on the nearest skin")
    }

    func testAFlingThatHitsTheEndLandsOnTheLastSkin() {
        let (model, recorder) = roller(count: 3, current: 1, reducedMotion: false)
        model.trackBegan()
        model.track(deltaY: -20)
        model.trackEnded()
        model.trackBegan(momentum: true)
        for _ in 0..<10 { model.track(deltaY: -30, momentum: true) }
        XCTAssertEqual(recorder.ticks.filter { $0 == .limit }.count, 1)
        model.momentumEnded()
        while model.advance(ms: 16) {}
        XCTAssertEqual(model.activeIndex, 2)
        XCTAssertEqual(model.offset, 2 * row)
    }

    func testANotchedWheelStepsOneSkinAndStopsAtTheEnds() {
        let (model, recorder) = roller(count: 3, current: 1)
        model.wheelNotch(deltaY: -1)
        XCTAssertEqual(model.activeIndex, 2)
        model.wheelNotch(deltaY: -1)
        XCTAssertEqual(model.activeIndex, 2)
        XCTAssertEqual(recorder.ticks, [.detent, .limit])
        model.wheelNotch(deltaY: 3)
        XCTAssertEqual(model.activeIndex, 1)
    }

    // MARK: - Leaving

    func testDismissChangesNothing() {
        let (model, recorder) = roller()
        model.roll(by: 1)
        model.dismiss()
        XCTAssertTrue(recorder.committed.isEmpty)
        XCTAssertEqual(recorder.finished, 1)
        model.commit()
        XCTAssertTrue(recorder.committed.isEmpty, "a closing drum takes no more input")
    }

    func testTheIconFlightLandsOnTheCardsIconTile() {
        let (model, _) = roller()
        let flight = model.iconFlight
        let scale = model.laneScale
        XCTAssertEqual(100 + 18 * scale + flight.dx * scale, 115, accuracy: 1e-9)
        XCTAssertEqual(36 * scale * flight.scale, 26, accuracy: 1e-9)
        XCTAssertEqual(model.foldScale * row * scale, 32, accuracy: 1e-9, "folded, the lane is the title")
    }

    func testTheRollerWearsTheSkinThroughTheDocument() throws {
        let (document, _, _) = makeDocument()
        let id = try XCTUnwrap(document.createWidget(type: "counter", at: Vector2D(x: 0, y: 0), title: "Counter"))
        let definition = try XCTUnwrap(WidgetRegistry.definition(for: "counter"))
        let anchor = SkinRollerModel.Anchor(left: 0, centreY: 0, height: 32, iconCentre: .zero, iconSize: 26)
        let model = try XCTUnwrap(SkinRollerModel(document: document, widgetId: id, anchor: anchor, reducedMotion: true, onFinish: {}))
        XCTAssertEqual(model.rows.map(\.value), definition.skins.map(\.value))
        model.roll(by: 1)
        let chosen = model.rows[model.activeIndex].value
        model.commit()
        XCTAssertEqual(definition.skinValue(in: document.widget(id)!.data), chosen)
        document.undo()
        XCTAssertNotEqual(definition.skinValue(in: document.widget(id)!.data), chosen, "one undo step")
    }

    func testTheRollerRenders() {
        let (model, _) = roller(reducedMotion: false)
        XCTAssertNotNil(WidgetBitmapProvider.render(SkinRollerView(model: model).frame(width: 800, height: 600), scale: 1))
    }
}
