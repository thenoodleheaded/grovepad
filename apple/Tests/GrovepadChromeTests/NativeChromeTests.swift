import XCTest
import SwiftUI
import GrovepadCore
import GrovepadCanvas
@testable import GrovepadChrome

/// The native chrome pass: the appearance setting, the card's favourite
/// action and its bytes, and the minimap's geometry.
final class NativeChromeTests: XCTestCase {
    // MARK: Appearance

    func testAppearanceFollowsTheSystemByDefaultAndMapsToAColourScheme() {
        let (document, _, _) = makeDocument()
        let model = SettingsModel(document: document, chrome: ChromeState(), store: InMemoryKeyValueStore())
        XCTAssertEqual(model.preferences.appearance, .system)
        XCTAssertNil(model.preferredColorScheme, "System leaves the scheme to the OS")
        model.update { $0.appearance = .light }
        XCTAssertEqual(model.preferredColorScheme, .light)
        model.update { $0.appearance = .dark }
        XCTAssertEqual(model.preferredColorScheme, .dark)
    }

    func testAnUnknownStoredAppearanceFallsBackToSystem() {
        let store = InMemoryKeyValueStore()
        store.set("{\"appearance\":\"sepia\"}", forKey: SettingsModel.storageKey)
        let (document, _, _) = makeDocument()
        XCTAssertEqual(SettingsModel(document: document, chrome: ChromeState(), store: store).preferences.appearance, .system)
    }

    func testAnotherWindowsChangeReachesThisWindowsModel() {
        let store = InMemoryKeyValueStore()
        let (document, _, _) = makeDocument()
        let first = SettingsModel(document: document, chrome: ChromeState(), store: store)
        let second = SettingsModel(document: document, chrome: ChromeState(), store: store)
        let followed = expectation(description: "second window follows")
        DispatchQueue.main.async {
            first.update { $0.appearance = .light }
            DispatchQueue.main.async {
                XCTAssertEqual(second.preferences.appearance, .light)
                followed.fulfill()
            }
        }
        wait(for: [followed], timeout: 2)
    }

    // MARK: Favourite

    /// `toggleWidgetFavorite` spreads `favorite: !favorite`: un-starring
    /// leaves an explicit `false`, never a removed key.
    func testToggleFavoriteWritesTheWebsBytesAndIsOneUndoStep() throws {
        let (document, undo, _) = makeDocument()
        let id = try XCTUnwrap(document.createWidget(type: "counter", at: .zero, title: "Count"))
        XCTAssertNil(document.widget(id)?.metadata.record["favorite"])
        document.toggleFavorite(id)
        XCTAssertEqual(document.widget(id)?.metadata.record["favorite"], .bool(true))
        document.toggleFavorite(id)
        XCTAssertEqual(document.widget(id)?.metadata.record["favorite"], .bool(false))
        undo.undo()
        XCTAssertEqual(document.widget(id)?.metadata.record["favorite"], .bool(true))
    }

    // MARK: Minimap

    func testMinimapColourMatchesTheWebHash() {
        // `colorFor` in CanvasNavigator.tsx, worked by hand for two types.
        func web(_ type: String) -> String {
            let colors = ["#a78bfa", "#22d3ee", "#84cc16", "#f59e0b", "#f472b6", "#60a5fa"]
            var hash: Int64 = 0
            for unit in type.utf16 {
                hash = (hash * 31 + Int64(unit)) & 0xFFFF_FFFF
                if hash >= 0x8000_0000 { hash -= 0x1_0000_0000 }
            }
            return colors[Int(abs(hash) % Int64(colors.count))]
        }
        for type in ["counter", "text", "mood_tracker", "canvas_node", "a_very_long_widget_type_name_that_overflows"] {
            XCTAssertEqual(MinimapGeometry.color(for: type), web(type), type)
        }
    }

    func testMinimapViewportAndPanRoundTrip() {
        let extent = WorldRect(x: 0, y: 0, width: 1660, height: 980)
        let scale = min((MinimapGeometry.width - MinimapGeometry.pad * 2) / extent.width, (MinimapGeometry.height - MinimapGeometry.pad * 2) / extent.height)
        let viewportSize = Size(width: 1000, height: 600)
        let transform = CanvasTransform(x: -200, y: -100, zoom: 0.5)
        let view = MinimapGeometry.viewport(transform: transform, viewportSize: viewportSize, extent: extent, scale: scale)
        XCTAssertEqual(view.minX, MinimapGeometry.pad + 400 * scale, accuracy: 0.0001)
        XCTAssertEqual(view.width, 2000 * scale, accuracy: 0.0001)
        // Pressing the centre of that frame keeps the view where it is.
        let pan = MinimapGeometry.pan(forMapPoint: CGPoint(x: view.midX, y: view.midY), extent: extent, scale: scale, viewportSize: viewportSize, zoom: 0.5)
        XCTAssertEqual(pan.x, -200, accuracy: 0.001)
        XCTAssertEqual(pan.y, -100, accuracy: 0.001)
    }
}
