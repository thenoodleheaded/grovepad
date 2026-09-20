import Foundation
import GrovepadCore

// ---------------------------------------------------------------------------
// Pure fling math for the gesture engine (`engine/camera/glidePhysics.ts`) —
// separated so release-velocity estimation is unit-testable without pointer
// events.
// ---------------------------------------------------------------------------

/// A pointer sample with the time it was taken, in milliseconds.
public struct TimedPoint: Equatable, Sendable {
    public var x: Double
    public var y: Double
    public var time: Double

    public init(x: Double, y: Double, time: Double) {
        self.x = x
        self.y = y
        self.time = time
    }
}

public enum FlingPhysics {
    /// Only samples inside this window count toward release velocity: a finger
    /// that stopped before lifting must produce zero, not its old speed.
    public static let windowMs = 140.0
    /// Below this release speed a fling is a tap-stop, not a glide.
    public static let minSpeed = 60.0
    /// Ceiling keeps a wild sample from launching the board into orbit.
    public static let maxSpeed = 4200.0
}

/// Release velocity in screen px/s from the recent sample trail.
public func flingVelocity(_ samples: [TimedPoint]) -> Vector2D {
    if samples.count < 2 { return .zero }
    let last = samples[samples.count - 1]
    let cutoff = last.time - FlingPhysics.windowMs
    var first = samples[0]
    for sample in samples where sample.time >= cutoff {
        first = sample
        break
    }
    let dt = last.time - first.time
    if dt <= 0 { return .zero }
    let vx = ((last.x - first.x) / dt) * 1000
    let vy = ((last.y - first.y) / dt) * 1000
    let speed = (vx * vx + vy * vy).squareRoot()
    if speed < FlingPhysics.minSpeed { return .zero }
    if speed > FlingPhysics.maxSpeed {
        let scale = FlingPhysics.maxSpeed / speed
        return Vector2D(x: vx * scale, y: vy * scale)
    }
    return Vector2D(x: vx, y: vy)
}

/// Trim a sample trail to the fling window around its newest entry, keeping
/// at least two samples.
public func trimSamples(_ samples: inout [TimedPoint], now: Double) {
    let cutoff = now - FlingPhysics.windowMs
    while samples.count > 2 && samples[0].time < cutoff {
        samples.removeFirst()
    }
}
