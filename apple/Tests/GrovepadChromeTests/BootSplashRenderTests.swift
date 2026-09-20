import XCTest
import SwiftUI
import ImageIO
@testable import GrovepadChrome

@MainActor
final class BootSplashRenderTests: XCTestCase {
    /// Every moment of the splash renders, from the first frame to long after
    /// the entrance (the pulse keyframes and the glint wrap around).
    func testSplashRendersAcrossItsTimeline() throws {
        for t in [0.0, 0.3, 1.2, 2.2, 3.0, 9.7] {
            let renderer = ImageRenderer(content: BootSplashView(frozenAt: t).frame(width: 1200, height: 800))
            renderer.scale = 1
            XCTAssertNotNil(renderer.cgImage, "t = \(t)")
            // GROVEPAD_SNAPSHOT_DIR=… writes each moment out for a look.
            if let dir = ProcessInfo.processInfo.environment["GROVEPAD_SNAPSHOT_DIR"], let image = renderer.cgImage,
               let target = CGImageDestinationCreateWithURL(URL(fileURLWithPath: dir + "/splash-\(t).png") as CFURL, "public.png" as CFString, 1, nil) {
                CGImageDestinationAddImage(target, image, nil)
                CGImageDestinationFinalize(target)
            }
        }
    }

    func testGoogleMarkPathDataParses() {
        let shape = SVGPathShape("M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.1h6.5l-.02.15 3.5 2.7.24.03z", viewBox: CGSize(width: 24, height: 24))
        let bounds = shape.path(in: CGRect(x: 0, y: 0, width: 24, height: 24)).boundingRect
        XCTAssertEqual(bounds.minX, 12, accuracy: 0.01)
        XCTAssertEqual(bounds.maxX, 23.5, accuracy: 0.01)
    }
}
