import Foundation
import Observation
import GrovepadCore

// ---------------------------------------------------------------------------
// The skin roller's behaviour (`WidgetSkinRoller.tsx`), apart from its
// paint. The card's title grows in place into a rolling drum of skins over
// the blurred board; a click wears the skin in the lane (one undo step via
// `BoardDocument.setSkin`) and the drum folds away; Escape leaves unchanged.
//
// What carries over from the web: the tap slop that separates a click from
// a drag (and a press past it never becomes a click), the rubber-banded
// ends, the settle spring, the row pressed being captured at press time,
// arrow / Home / End / Return / Space / Escape, and the three ticks —
// detent as a row crosses into the lane, limit against an end, commit.
//
// What is native: a trackpad does not step a row per notch the way the web's
// wheel does. It carries the drum under the fingers, momentum and all, and
// the spring settles it when the fingers (or the momentum) let go — so the
// Force Touch trackpad clicks once for every skin that passes the lane. A
// notched mouse wheel still steps one row at a time.
// ---------------------------------------------------------------------------

/// The physical ticks the roller reports (the web's `haptic()` names).
public enum SkinRollerTick: String, Sendable {
    case detent
    case commit
    case limit
}

@Observable
public final class SkinRollerModel {
    public enum Phase: Equatable, Sendable {
        /// The one painted frame where the drum is still title-sized.
        case folded
        /// The unfurl in flight.
        case opening
        /// Rolling: rows paint their placement the frame it is computed.
        case open
        /// Committed or dismissed; the drum dissolves.
        case closing
    }

    /// Where the drum grows from, in the canvas's screen points.
    public struct Anchor: Equatable, Sendable {
        /// The title row's leading edge.
        public var left: Double
        /// The title row's vertical centre — the lane sits on it.
        public var centreY: Double
        /// The title row's on-screen height.
        public var height: Double
        /// The card's icon tile: where the chosen icon glides home to.
        public var iconCentre: Vector2D
        public var iconSize: Double

        public init(left: Double, centreY: Double, height: Double, iconCentre: Vector2D, iconSize: Double) {
            self.left = left
            self.centreY = centreY
            self.height = height
            self.iconCentre = iconCentre
            self.iconSize = iconSize
        }
    }

    /// Pointer travel below which a press is a click (`TAP_SLOP_PX`).
    public static let tapSlop: Double = 8
    /// How long the drum takes to unfurl, and to close again.
    public static let openMs: Double = 260
    public static let closeMs: Double = 300
    /// The longest a row's fade-in waits behind the lane's.
    public static let rowStaggerMs: Double = 120
    /// The icon tile's own size in the drum (the web's h-9 w-9).
    public static let iconTile: Double = 36
    /// The drum's width before projection (`min(340px, 70vw)`).
    public static let drumWidth: Double = 340

    public let widgetId: String
    public let rows: [SkinPickerModel.Row]
    public let anchor: Anchor
    public let reducedMotion: Bool

    public private(set) var offset: Double
    public private(set) var phase: Phase = .folded
    /// The skin the drum was committed on, once it has been.
    public private(set) var committedValue: String?

    @ObservationIgnored private let onCommit: (String) -> Void
    @ObservationIgnored private let onTick: (SkinRollerTick) -> Void
    @ObservationIgnored private let onFinish: () -> Void
    @ObservationIgnored private var target: Double?
    @ObservationIgnored private var detent: Int
    @ObservationIgnored private var press: Press?
    @ObservationIgnored private var scroll: ScrollTrack?
    @ObservationIgnored private var wheelBank: Double = 0
    @ObservationIgnored private var ticker: Timer?
    @ObservationIgnored private var lastFrame: Date?
    @ObservationIgnored private var finished = false

    private struct Press {
        var startTravel: Double
        var startOffset: Double
        var moved: Double = 0
        /// Latches once the press passes the slop; a drag never becomes a click.
        var dragging = false
        /// The row pressed, captured at press time rather than at release.
        var pressedIndex: Int?
    }

    private struct ScrollTrack {
        /// The drum's position before end resistance, fed by finger travel.
        var raw: Double
        /// Momentum hit an end: the rest of the fling is ignored.
        var spent = false
    }

    public init(widgetId: String, rows: [SkinPickerModel.Row], anchor: Anchor, reducedMotion: Bool, onCommit: @escaping (String) -> Void, onTick: @escaping (SkinRollerTick) -> Void = { _ in }, onFinish: @escaping () -> Void) {
        self.widgetId = widgetId
        self.rows = rows
        self.anchor = anchor
        self.reducedMotion = reducedMotion
        self.onCommit = onCommit
        self.onTick = onTick
        self.onFinish = onFinish
        let start = rows.firstIndex(where: \.isCurrent) ?? 0
        offset = Double(start) * SkinRollerGeometry.rowHeight
        detent = start
    }

    /// The picker model's rows for a widget, or nil when it has no skins.
    public convenience init?(document: BoardDocument, widgetId: String, anchor: Anchor, reducedMotion: Bool, onTick: @escaping (SkinRollerTick) -> Void = { _ in }, onFinish: @escaping () -> Void) {
        guard let picker = SkinPickerModel(document: document, widgetId: widgetId) else { return nil }
        self.init(widgetId: widgetId, rows: picker.rows, anchor: anchor, reducedMotion: reducedMotion, onCommit: { [weak document] value in
            guard let document else { return }
            picker.choose(value, document: document)
        }, onTick: onTick, onFinish: onFinish)
    }

    deinit { ticker?.invalidate() }

    public var count: Int { rows.count }
    public var activeIndex: Int { SkinRollerGeometry.index(forOffset: offset, count: count) }
    public var isClosing: Bool { phase == .closing }

    // MARK: - Unfurl

    /// The folded frame has been painted: grow into the drum.
    public func unfurl() {
        guard phase == .folded else { return }
        phase = reducedMotion ? .open : .opening
    }

    /// The unfurl and its stagger have played out: roll frame-for-frame.
    public func settleOpen() {
        if phase == .opening { phase = .open }
    }

    // MARK: - Rolling

    /// Writes a drum position and reports any detent crossed on the way.
    private func apply(_ next: Double) {
        offset = next
        let landed = activeIndex
        if landed != detent {
            detent = landed
            onTick(.detent)
        }
    }

    /// Rolls to a row, clamped; pushing past an end ticks the limit.
    public func roll(to index: Int) {
        guard !isClosing, count > 0 else { return }
        let clamped = min(count - 1, max(0, index))
        if index != clamped, clamped == activeIndex { onTick(.limit) }
        settle(to: Double(clamped) * SkinRollerGeometry.rowHeight)
    }

    public func roll(by steps: Int) { roll(to: activeIndex + steps) }

    /// Runs the settle spring toward a resting offset.
    private func settle(to goal: Double) {
        target = goal
        if reducedMotion {
            apply(goal)
            target = nil
            return
        }
        startTicker()
    }

    /// One spring frame; false once the drum has come to rest.
    @discardableResult
    public func advance(ms elapsed: Double) -> Bool {
        guard let goal = target else { return false }
        let next = SkinRollerGeometry.stepSettle(offset, target: goal, elapsedMs: min(64, elapsed))
        apply(next)
        if next == goal {
            target = nil
            return false
        }
        return true
    }

    private func startTicker() {
        guard ticker == nil else { return }
        lastFrame = Date()
        let timer = Timer(timeInterval: 1.0 / 120, repeats: true) { [weak self] timer in
            guard let self else { timer.invalidate(); return }
            let now = Date()
            let elapsed = now.timeIntervalSince(self.lastFrame ?? now) * 1000
            self.lastFrame = now
            if !self.advance(ms: elapsed) { self.stopTicker() }
        }
        RunLoop.main.add(timer, forMode: .common)
        ticker = timer
    }

    private func stopTicker() {
        ticker?.invalidate()
        ticker = nil
    }

    /// Any hand on the drum takes it from the spring.
    private func stopSettling() {
        target = nil
        stopTicker()
    }

    // MARK: - Pointer

    /// A press anywhere on the surface; `row` is the row under it, if any.
    public func pressBegan(row: Int?) {
        guard !isClosing else { return }
        stopSettling()
        scroll = nil
        press = Press(startTravel: 0, startOffset: offset, pressedIndex: row)
    }

    /// The press has travelled `travel` points vertically since it began.
    public func pressMoved(travel: Double) {
        guard var drag = press, !isClosing else { return }
        defer { press = drag }
        drag.moved = max(drag.moved, abs(travel))
        // Below the slop the drum must not move at all — a mouse's
        // one-point jitter is not a drag. Past it, it is a drag for good,
        // starting from where the pointer crossed the line.
        if !drag.dragging {
            guard drag.moved > Self.tapSlop else { return }
            drag.dragging = true
            drag.startTravel = travel
            drag.startOffset = offset
            return
        }
        // Pulling down brings earlier skins into the lane, like a real barrel.
        let raw = drag.startOffset - (travel - drag.startTravel)
        let next = SkinRollerGeometry.resistOffset(raw, count: count)
        if SkinRollerGeometry.isPastEnd(next, count: count), !SkinRollerGeometry.isPastEnd(offset, count: count) { onTick(.limit) }
        apply(next)
    }

    /// The press let go (or was cancelled).
    public func pressEnded(cancelled: Bool = false) {
        guard let drag = press else { return }
        press = nil
        guard !isClosing else { return }
        if drag.dragging || cancelled {
            settle(to: SkinRollerGeometry.settledOffset(offset, count: count))
            return
        }
        // A click on the lane — or anywhere off the drum — wears the lane's
        // skin; on a row merely visible above or below, it rolls that one in.
        let clicked = drag.pressedIndex ?? activeIndex
        if clicked != activeIndex { roll(to: clicked) } else { commit() }
    }

    // MARK: - Scrolling

    /// A notched mouse wheel: one row per notch. `deltaY` is AppKit's sign
    /// (positive is the wheel rolled up, toward earlier skins).
    public func wheelNotch(deltaY: Double) {
        guard !isClosing, deltaY != 0 else { return }
        scroll = nil
        roll(by: deltaY > 0 ? -1 : 1)
    }

    /// Precise deltas with no gesture phases (some mice): banked into whole
    /// rows exactly as the web's wheel is.
    public func wheelTravel(deltaY: Double) {
        guard !isClosing else { return }
        wheelBank -= deltaY
        let (steps, remainder) = SkinRollerGeometry.wheelSteps(wheelBank)
        wheelBank = remainder
        if steps != 0 { roll(by: steps) }
    }

    /// Fingers landed on the trackpad (or a fling began): the drum follows.
    public func trackBegan(momentum: Bool = false) {
        guard !isClosing else { return }
        if momentum, scroll?.spent == true { return }
        stopSettling()
        scroll = ScrollTrack(raw: offset)
    }

    /// Finger or momentum travel, AppKit's sign: content moves with the
    /// fingers, so moving them down brings earlier skins into the lane.
    public func track(deltaY: Double, momentum: Bool = false) {
        guard !isClosing, var track = scroll, !track.spent else { return }
        track.raw -= deltaY
        let next = SkinRollerGeometry.resistOffset(track.raw, count: count)
        let wasPast = SkinRollerGeometry.isPastEnd(offset, count: count)
        let isPast = SkinRollerGeometry.isPastEnd(next, count: count)
        if isPast, !wasPast { onTick(.limit) }
        if momentum, isPast {
            // A fling does not grind into the wall; it lands on the end row.
            track.spent = true
            scroll = track
            settle(to: SkinRollerGeometry.settledOffset(next, count: count))
            return
        }
        scroll = track
        apply(next)
    }

    /// The fingers (or the momentum) let go: settle on the nearest row. A
    /// fling that follows takes the drum back from the spring.
    public func trackEnded() {
        guard !isClosing, scroll != nil else { return }
        let spent = scroll?.spent == true
        if !spent { settle(to: SkinRollerGeometry.settledOffset(offset, count: count)) }
    }

    /// The momentum ran out.
    public func momentumEnded() {
        guard !isClosing else { return }
        let spent = scroll?.spent == true
        scroll = nil
        if !spent { settle(to: SkinRollerGeometry.settledOffset(offset, count: count)) }
    }

    // MARK: - Leaving

    /// Wear the skin in the lane, hand its icon back to the title, and leave.
    public func commit() {
        guard !isClosing, rows.indices.contains(activeIndex) else { return }
        stopSettling()
        let chosen = rows[activeIndex]
        offset = Double(activeIndex) * SkinRollerGeometry.rowHeight
        committedValue = chosen.value
        onCommit(chosen.value)
        onTick(.commit)
        close()
    }

    /// Escape: leave without changing anything.
    public func dismiss() {
        guard !isClosing else { return }
        stopSettling()
        close()
    }

    private func close() {
        press = nil
        scroll = nil
        phase = .closing
        if reducedMotion { finish() }
    }

    /// The close has played out: take the drum off the screen. Idempotent.
    public func finish() {
        guard !finished else { return }
        finished = true
        stopTicker()
        onFinish()
    }

    // MARK: - Geometry for paint and hit-testing

    /// The lane row's magnification (the projection at rotation 0).
    public var laneScale: Double {
        SkinRollerGeometry.project(SkinRollerGeometry.placeRow(0, offset: 0), reducedMotion: reducedMotion).scale
    }

    /// Folded, the lane is exactly the title it grew out of.
    public var foldScale: Double {
        anchor.height / (SkinRollerGeometry.rowHeight * laneScale)
    }

    /// The row whose projected band contains `point`, nearest the lane first.
    public func row(at point: Vector2D) -> Int? {
        var best: (index: Int, away: Double)?
        for index in rows.indices {
            let place = SkinRollerGeometry.placeRow(index, offset: offset)
            guard !place.hidden else { continue }
            let projection = SkinRollerGeometry.project(place, reducedMotion: reducedMotion)
            let half = SkinRollerGeometry.rowHeight * projection.scale * projection.squash / 2
            let centre = anchor.centreY + projection.y
            let right = anchor.left + Self.drumWidth * projection.scale
            guard point.x >= anchor.left, point.x <= right, abs(point.y - centre) <= half else { continue }
            let away = abs(Double(index) - offset / SkinRollerGeometry.rowHeight)
            if best == nil || away < best!.away { best = (index, away) }
        }
        return best?.index
    }

    /// How far, and how much smaller, the chosen icon travels to land on the
    /// card's own icon tile — in the lane row's unscaled space.
    public var iconFlight: (dx: Double, dy: Double, scale: Double) {
        let scale = laneScale
        let fromX = anchor.left + (Self.iconTile / 2) * scale
        let fromY = anchor.centreY
        return ((anchor.iconCentre.x - fromX) / scale, (anchor.iconCentre.y - fromY) / scale, anchor.iconSize / (Self.iconTile * scale))
    }
}
