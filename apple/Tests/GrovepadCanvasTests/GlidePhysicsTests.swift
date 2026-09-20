import XCTest
import GrovepadCore
@testable import GrovepadCanvas

/// `engine/camera/glidePhysics.test.ts`, scenario for scenario.
final class GlidePhysicsTests: XCTestCase {
    func testDerivesReleaseVelocityFromTheRecentSampleWindow() {
        let samples = [
            TimedPoint(x: 0, y: 0, time: 0),
            TimedPoint(x: 60, y: 0, time: 60),
            TimedPoint(x: 120, y: 0, time: 120),
        ]
        let v = flingVelocity(samples)
        XCTAssertEqual(v.x, 1000, accuracy: 0.005)
        XCTAssertEqual(v.y, 0)
    }

    func testReadsAFingerThatStoppedBeforeLiftingAsZeroVelocity() {
        let samples = [
            TimedPoint(x: 0, y: 0, time: 0),
            TimedPoint(x: 400, y: 0, time: 40),
            TimedPoint(x: 400, y: 0, time: 300), // held still, then released
        ]
        XCTAssertEqual(flingVelocity(samples), .zero)
    }

    func testCapsRunawayVelocitiesAndIgnoresSubThresholdReleases() {
        let wild = flingVelocity([
            TimedPoint(x: 0, y: 0, time: 0),
            TimedPoint(x: 9000, y: 0, time: 100),
        ])
        XCTAssertLessThanOrEqual((wild.x * wild.x + wild.y * wild.y).squareRoot(), FlingPhysics.maxSpeed + 1e-6)
        XCTAssertEqual(
            flingVelocity([
                TimedPoint(x: 0, y: 0, time: 0),
                TimedPoint(x: 2, y: 0, time: 100),
            ]),
            .zero
        )
    }

    func testTrimsTheTrailToTheWindowWhileKeepingAtLeastTwoSamples() {
        var samples = [
            TimedPoint(x: 0, y: 0, time: 0),
            TimedPoint(x: 1, y: 0, time: 10),
            TimedPoint(x: 2, y: 0, time: 500),
            TimedPoint(x: 3, y: 0, time: 510),
        ]
        trimSamples(&samples, now: 510)
        XCTAssertEqual(samples.count, 2)
        XCTAssertEqual(samples[0].time, 500)
    }

    func testConstantsMatchTheWeb() {
        XCTAssertEqual(FlingPhysics.windowMs, 140)
        XCTAssertEqual(FlingPhysics.minSpeed, 60)
        XCTAssertEqual(FlingPhysics.maxSpeed, 4200)
    }
}
