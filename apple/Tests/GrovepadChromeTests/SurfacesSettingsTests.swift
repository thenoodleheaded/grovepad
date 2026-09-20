import XCTest
import GrovepadCore
@testable import GrovepadChrome

/// Settings persistence, sanitising, the motion rule, canvas settings through
/// the document, and the plain-words analytics state.
final class SurfacesSettingsTests: XCTestCase {
    func testLoadsDefaultsSanitisesAndPersistsAsOneJSONObject() {
        let store = InMemoryKeyValueStore()
        store.set("{\"reduceMotion\":true,\"visualQuality\":\"ultra\",\"usageAnalytics\":false,\"appearance\":\"light\"}", forKey: SettingsModel.storageKey)
        let (document, _, _) = makeDocument()
        let chrome = ChromeState()
        let model = SettingsModel(document: document, chrome: chrome, store: store, analyticsConfigured: true)
        XCTAssertTrue(model.preferences.reduceMotion)
        XCTAssertEqual(model.preferences.visualQuality, .high, "an unknown tier falls back to high")
        XCTAssertFalse(model.preferences.usageAnalytics)
        XCTAssertEqual(model.preferences.appearance, .light)
        XCTAssertTrue(model.preferences.canvasAura, "missing keys keep their defaults")

        model.update { $0.visualQuality = .low; $0.canvasAura = false }
        XCTAssertEqual(store.values[SettingsModel.storageKey], "{\"reduceMotion\":true,\"canvasAura\":false,\"magneticHover\":true,\"visualQuality\":\"low\",\"usageAnalytics\":false,\"appearance\":\"light\"}")

        var toasts: [String] = []
        model.toast = { toasts.append($0) }
        model.reset()
        XCTAssertEqual(model.preferences, .defaults)
        XCTAssertEqual(toasts, ["Settings reset"])
        XCTAssertEqual(SettingsModel(document: document, chrome: chrome, store: store).preferences, .defaults)

        store.set("not json", forKey: SettingsModel.storageKey)
        XCTAssertEqual(SettingsModel(document: document, chrome: chrome, store: store).preferences, .defaults)
    }

    func testMotionRuleAndAppearanceToggle() {
        let (document, _, _) = makeDocument()
        let model = SettingsModel(document: document, chrome: ChromeState(), store: InMemoryKeyValueStore())
        XCTAssertFalse(model.motionReduced(systemReduceMotion: false))
        XCTAssertTrue(model.motionReduced(systemReduceMotion: true), "the system setting always wins")
        model.update { $0.visualQuality = .low }
        XCTAssertTrue(model.motionReduced(systemReduceMotion: false), "the light tier is motion-free")
        model.update { $0.visualQuality = .high; $0.reduceMotion = true }
        XCTAssertTrue(model.motionReduced(systemReduceMotion: false))
        model.toggleAppearance()
        XCTAssertEqual(model.preferences.appearance, .light)
        model.toggleAppearance()
        XCTAssertEqual(model.preferences.appearance, .dark)
    }

    func testCanvasSettingsGoThroughTheDocumentAsOneUndoStep() {
        let (document, _, clock) = makeDocument()
        let model = SettingsModel(document: document, chrome: ChromeState(), store: InMemoryKeyValueStore())
        XCTAssertEqual(model.gridIntensity, 100)
        model.setGridIntensity(42.6)
        model.setGridIntensity(30)
        model.setGridIntensity(-5)
        XCTAssertEqual(model.gridIntensity, 0, "clamped and rounded")
        model.setGridIntensity(250)
        XCTAssertEqual(model.gridIntensity, 100)
        model.setGridIntensity(55)
        document.undo()
        XCTAssertEqual(model.gridIntensity, 100, "a continuous drag is one undo step")

        clock.advance(ms: 2000)
        model.setLinksVisible(false)
        XCTAssertFalse(model.linksVisible)
        model.renameActiveCanvas(" Renamed ")
        XCTAssertEqual(model.activeCanvas?.name, "Renamed")
        model.renameActiveCanvas("   ")
        XCTAssertEqual(model.activeCanvas?.name, "Renamed")
        document.undo()
        XCTAssertEqual(model.activeCanvas?.name, "Root")
    }

    func testSectionsAndAnalyticsState() {
        let (document, _, _) = makeDocument()
        let chrome = ChromeState()
        XCTAssertEqual(SettingsModel.sections.map(\.rawValue), ["general", "controls", "canvas", "account", "data"])
        XCTAssertEqual(SettingsSection.controls.label, "Hotkeys")
        let off = SettingsModel(document: document, chrome: chrome, store: InMemoryKeyValueStore(), analyticsConfigured: false)
        XCTAssertEqual(off.analyticsState, .unconfigured)
        let on = SettingsModel(document: document, chrome: chrome, store: InMemoryKeyValueStore(), analyticsConfigured: true)
        XCTAssertEqual(on.analyticsState, .counting)
        on.update { $0.usageAnalytics = false }
        XCTAssertEqual(on.analyticsState, .optedOut)
        XCTAssertTrue(AnalyticsState.optedOut.hint.hasPrefix("Off."))
        on.section = .data
        XCTAssertEqual(chrome.settingsSection, .data)
        chrome.openSettings(.canvas)
        XCTAssertEqual(on.section, .canvas)
        XCTAssertTrue(on.isOpen)
        XCTAssertEqual(on.account, .signedOut)
        XCTAssertTrue(on.accountHint.hasPrefix("Sign in"))
    }
}
