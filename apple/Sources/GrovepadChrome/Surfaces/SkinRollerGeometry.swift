import Foundation

// ---------------------------------------------------------------------------
// The physics and layout maths behind the skin roller: a line-for-line port
// of `skinRollerGeometry.ts`, kept free of SwiftUI so the drum can be tested
// directly.
//
// One number drives everything: `offset`, the distance the drum has been
// rolled, in points. `offset / rowHeight` is the (fractional) index sitting
// in the selection lane, so offset 0 is the first skin and the drum always
// settles on a whole multiple of `rowHeight`.
//
// The one native addition is `project`: the web hands `rotateX` +
// `translateZ` to CSS 3D; SwiftUI has no shared perspective between sibling
// views, so the same barrel is projected here by hand (a row's lift, its
// magnification and its foreshortening) with the same radius and perspective.
// ---------------------------------------------------------------------------

public enum SkinRollerGeometry {
    /// Height of one skin row, and therefore the travel between two detents.
    public static let rowHeight: Double = 52

    /// Degrees of barrel rotation between neighbouring rows (the web's
    /// legibility budget: at 12° the third row out keeps four fifths of its
    /// height once projected).
    public static let angleStep: Double = 12

    /// Barrel radius that makes `angleStep` advance the surface by one row.
    public static let drumRadius: Double = rowHeight / (2 * tan(angleStep * .pi / 360))

    /// How much the projection magnifies the lane row.
    public static let projectionScale: Double = 1.312

    /// The perspective distance that projects this barrel at `projectionScale`.
    public static let drumPerspective: Double = (drumRadius / (1 - 1 / projectionScale)).rounded()

    /// Rows further than this from the lane have rotated past the horizon.
    static let horizon: Double = 90 / angleStep

    /// How far from the lane the drum dissolves (inside the horizon).
    static let fadeRows: Double = min(6, horizon)

    /// Resistance constant for the stretch past either end. Lower drags harder.
    static let rubber: Double = 0.55

    /// A pull past the end, fed through a curve that approaches `limit` but
    /// never reaches it: a wall with give.
    public static func rubberBand(_ overshoot: Double, limit: Double = rowHeight) -> Double {
        guard overshoot > 0 else { return 0 }
        return (1 - 1 / ((overshoot / limit) * rubber + 1)) * limit
    }

    /// Applies the end resistance to a raw dragged offset.
    public static func resistOffset(_ raw: Double, count: Int, rowHeight: Double = rowHeight) -> Double {
        let max = Double(Swift.max(0, count - 1)) * rowHeight
        if raw < 0 { return -rubberBand(-raw, limit: rowHeight) }
        if raw > max { return max + rubberBand(raw - max, limit: rowHeight) }
        return raw
    }

    /// True while the drum is stretched past either end.
    public static func isPastEnd(_ offset: Double, count: Int, rowHeight: Double = rowHeight) -> Bool {
        offset < 0 || offset > Double(max(0, count - 1)) * rowHeight
    }

    /// Which row is in the lane right now — always a real, in-range index.
    public static func index(forOffset offset: Double, count: Int, rowHeight: Double = rowHeight) -> Int {
        guard count > 0 else { return 0 }
        // JavaScript's Math.round: halves round up, including negative ones.
        let rounded = Int((offset / rowHeight + 0.5).rounded(.down))
        return min(count - 1, max(0, rounded))
    }

    /// Where the drum comes to rest from here: the nearest whole row.
    public static func settledOffset(_ offset: Double, count: Int, rowHeight: Double = rowHeight) -> Double {
        Double(index(forOffset: offset, count: count, rowHeight: rowHeight)) * rowHeight
    }

    /// Rows this far from the lane or nearer stay perfectly sharp.
    static let sharpRows: Double = 3
    /// The full out-of-focus blur worn by every row past the ramp.
    static let edgeBlur: Double = 6
    /// How many rows past the sharp zone it takes to reach the full blur.
    static let blurRampRows: Double = 1

    public struct RowPlacement: Equatable, Sendable {
        /// Barrel rotation, in degrees. 0 means the row is in the lane.
        public var rotateX: Double
        /// Flat-list travel, used when motion is reduced.
        public var translateY: Double
        public var opacity: Double
        public var blur: Double
        public var zIndex: Double
        public var hidden: Bool
    }

    /// `placeRow`: one row relative to the current offset.
    public static func placeRow(_ index: Int, offset: Double, rowHeight: Double = rowHeight) -> RowPlacement {
        let distance = Double(index) - offset / rowHeight
        let away = abs(distance)
        let rotate = -distance * angleStep
        return RowPlacement(
            rotateX: rotate == 0 ? 0 : rotate,
            translateY: distance * rowHeight,
            opacity: away >= fadeRows ? 0 : max(0, 1 - pow(away / fadeRows, 1.4)),
            blur: min(edgeBlur, max(0, (away - sharpRows) / blurRampRows) * edgeBlur),
            zIndex: max(0, 100 - (away * 10).rounded()),
            hidden: away >= fadeRows
        )
    }

    /// Where a placed row lands on screen, relative to the lane's centre line.
    public struct Projection: Equatable, Sendable {
        /// Vertical travel of the row's centre from the lane's centre.
        public var y: Double
        /// Magnification from riding nearer the eye (the lane's is `projectionScale`).
        public var scale: Double
        /// Foreshortening: how much of its height a tilted row keeps.
        public var squash: Double
    }

    /// The barrel projected by hand: a row rotated `rotateX` degrees and pushed
    /// out `drumRadius`, seen from `drumPerspective` away.
    public static func project(_ placement: RowPlacement, reducedMotion: Bool = false) -> Projection {
        if reducedMotion { return Projection(y: placement.translateY, scale: 1, squash: 1) }
        let angle = -placement.rotateX * .pi / 180
        let depth = drumRadius * cos(angle)
        let scale = drumPerspective / (drumPerspective - depth)
        return Projection(y: drumRadius * sin(angle) * scale, scale: scale, squash: max(0, cos(angle)))
    }

    /// Wheel travel that counts as one deliberate notch of scrolling.
    public static let wheelNotch: Double = 40

    /// Accumulated wheel travel converted into whole row steps; the rest stays banked.
    public static func wheelSteps(_ accumulated: Double, notch: Double = wheelNotch) -> (steps: Int, remainder: Double) {
        let steps = (accumulated / notch).rounded(.towardZero)
        return (Int(steps), accumulated - steps * notch)
    }

    /// One frame of the settle spring: a critically damped pull toward
    /// `target` (~150 ms to arrive), frame-rate independent.
    public static func stepSettle(_ offset: Double, target: Double, elapsedMs: Double) -> Double {
        let remaining = target - offset
        if abs(remaining) < 0.5 { return target }
        let t = 1 - exp(-elapsedMs / 55)
        return offset + remaining * t
    }
}
