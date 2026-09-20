import XCTest
import SwiftUI
@testable import GrovepadChrome

final class WidgetFaceTests: XCTestCase {
    func testEveryGeneratedFaceParsesIntoDrawableShapes() {
        for (index, markup) in WidgetFacesData.faces.enumerated() {
            let shapes = WidgetFaces.parse(markup)
            XCTAssertFalse(shapes.isEmpty, "face \(index) drew nothing")
            for shape in shapes {
                let box = WidgetFaces.path(for: shape).boundingRect
                XCTAssertTrue(box.minX > -2 && box.maxX < 28 && box.minY > -2 && box.maxY < 22, "face \(index) left its 26×20 field: \(box)")
            }
        }
    }

    func testFacesKeepTheWebsInksAndFallBackToTheFamily() {
        // Text is three ruled lines, the first loud and the rest at MID.
        let text = WidgetFaces.shapes(type: "__none__", category: "notes")
        XCTAssertEqual(text.count, 3)
        XCTAssertEqual(text.map(\.opacity), [1, 0.6, 0.6])
        XCTAssertTrue(text.allSatisfy { $0.strokes && !$0.fills })
        for type in WidgetRegistry.orderedDefinitions().map(\.type) {
            XCTAssertNotNil(WidgetFacesData.faceByType[type], "\(type) has no web face")
        }
    }

    func testArcsAndRelativeCommandsLandWhereTheyShould() {
        let path = SVGPathData.path("M3 10a5 5 0 0 1 10 0h4v-2z")
        let box = path.boundingRect
        XCTAssertEqual(box.minX, 3, accuracy: 0.01)
        XCTAssertEqual(box.maxX, 17, accuracy: 0.01)
        XCTAssertEqual(box.minY, 5, accuracy: 0.05, "a half circle of radius 5 rises to y 5")
        XCTAssertEqual(WidgetFaces.numbers("-1.5.5,2e1"), [-1.5, 0.5, 20])
    }
}
