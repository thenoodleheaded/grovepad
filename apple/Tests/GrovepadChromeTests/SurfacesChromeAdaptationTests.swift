import XCTest
import GrovepadCore
@testable import GrovepadChrome

/// The pure touch-adaptation rules (`adaptiveChrome.ts`, `adaptiveInput.ts`,
/// `tapGesture.ts`) and the panel placement law.
final class SurfacesChromeAdaptationTests: XCTestCase {
    func testViewportClassIsDecidedByWidthAlone() {
        XCTAssertEqual(ChromeAdaptation.viewportClass(forWidth: 375), .phone)
        XCTAssertEqual(ChromeAdaptation.viewportClass(forWidth: 639), .phone)
        XCTAssertEqual(ChromeAdaptation.viewportClass(forWidth: 640), .tablet)
        XCTAssertEqual(ChromeAdaptation.viewportClass(forWidth: 1023), .tablet)
        XCTAssertEqual(ChromeAdaptation.viewportClass(forWidth: 1024), .desktop)
        XCTAssertTrue(ChromeAdaptation(width: 360).isPhone)
        XCTAssertFalse(ChromeAdaptation(width: 800).isPhone)
    }

    func testTouchChromeIsEveryPhoneAndTabletAndAnyTouchSession() {
        XCTAssertTrue(ChromeAdaptation(width: 375, activeInput: .mouse).touchChrome)
        XCTAssertTrue(ChromeAdaptation(width: 800, activeInput: .keyboard).touchChrome)
        XCTAssertFalse(ChromeAdaptation(width: 1400, activeInput: .mouse).touchChrome)
        XCTAssertTrue(ChromeAdaptation(width: 1400, activeInput: .touch).touchChrome)
        XCTAssertTrue(ChromeAdaptation(width: 1400, activeInput: .pen).touchChrome)
    }

    func testHistoryRidesInTheDockBelowDesktopAndInTheZoomRowAtDesktop() {
        XCTAssertTrue(ChromeAdaptation.modeDockShowsHistory(.phone))
        XCTAssertTrue(ChromeAdaptation.modeDockShowsHistory(.tablet))
        XCTAssertFalse(ChromeAdaptation.modeDockShowsHistory(.desktop))
    }

    func testTabRowNeverOnPhoneAndOnlyWithSomethingToSwitchBetween() {
        XCTAssertFalse(ChromeAdaptation.isCanvasTabRowVisible(.phone, openTabCount: 3))
        XCTAssertFalse(ChromeAdaptation.isCanvasTabRowVisible(.desktop, openTabCount: 1))
        XCTAssertTrue(ChromeAdaptation.isCanvasTabRowVisible(.desktop, openTabCount: 2))
        XCTAssertTrue(ChromeAdaptation.isCanvasTabRowVisible(.tablet, openTabCount: 2))
    }

    func testMinimapAndSelectMoreRules() {
        XCTAssertTrue(ChromeAdaptation.isMinimapExpanded(.desktop, desktopCollapsed: false, compactExpanded: false))
        XCTAssertFalse(ChromeAdaptation.isMinimapExpanded(.phone, desktopCollapsed: false, compactExpanded: false))
        XCTAssertTrue(ChromeAdaptation.isMinimapExpanded(.desktop, desktopCollapsed: false, compactExpanded: true, shortViewport: true))
        XCTAssertTrue(ChromeAdaptation.offersSelectMore(touchChrome: true, interactionMode: .navigate))
        XCTAssertFalse(ChromeAdaptation.offersSelectMore(touchChrome: true, interactionMode: .select))
        XCTAssertFalse(ChromeAdaptation.offersSelectMore(touchChrome: true, interactionMode: .connect))
        XCTAssertFalse(ChromeAdaptation.offersSelectMore(touchChrome: false, interactionMode: .navigate))
    }

    func testPanelPlacementLaw() {
        XCTAssertEqual(PanelPlacement.resolve(isPhone: true, anchored: true), .bottomSheet)
        XCTAssertEqual(PanelPlacement.resolve(isPhone: true, anchored: false), .bottomSheet)
        XCTAssertEqual(PanelPlacement.resolve(isPhone: false, anchored: true), .popover)
        XCTAssertEqual(PanelPlacement.resolve(isPhone: false, anchored: false), .centeredDialog)
    }

    func testTapVocabularyThresholdsAndClassification() {
        XCTAssertEqual(TapVocabulary.tapSlopPx, 8)
        XCTAssertEqual(TapVocabulary.doubleTapMs, 300)
        XCTAssertEqual(TapVocabulary.doubleTapSlopPx, 28)
        XCTAssertEqual(TapVocabulary.longPressMs, 500)
        let origin = Vector2D.zero
        XCTAssertEqual(TapVocabulary.classify(down: origin, up: Vector2D(x: 3, y: 3), upAtMs: 1000, previousTap: nil), .tap)
        XCTAssertEqual(TapVocabulary.classify(down: origin, up: Vector2D(x: 12, y: 0), upAtMs: 1000, previousTap: nil), .moved)
        XCTAssertEqual(TapVocabulary.classify(down: origin, up: origin, upAtMs: 1200, previousTap: (Vector2D(x: 10, y: 10), 1000)), .doubleTap)
        XCTAssertEqual(TapVocabulary.classify(down: origin, up: origin, upAtMs: 1400, previousTap: (origin, 1000)), .tap, "outside the window")
        XCTAssertEqual(TapVocabulary.classify(down: origin, up: origin, upAtMs: 1100, previousTap: (Vector2D(x: 40, y: 0), 1000)), .tap, "outside the double-tap slop")
    }

    /// `tapTravelled` in `utils/tapGesture.ts` is a PER-AXIS box test —
    /// `Math.abs(dx) > slop || Math.abs(dy) > slop` — not a radius. A finger
    /// that rolls 6 pt on each axis is inside the box (8 pt) and outside the
    /// circle (8.49 pt), so a radius test turns a tap into a drag on exactly
    /// the diagonal wobble a thumb makes. The canvas gesture engine's
    /// long-press cancel IS a radius (`Math.hypot(...) > 8` in
    /// `gestureEngine.ts`); the two rules are different on purpose.
    func testTapTravelIsTheWebsPerAxisBoxNotARadius() {
        let origin = Vector2D.zero
        XCTAssertFalse(TapVocabulary.travelled(from: origin, to: Vector2D(x: 6, y: 6)), "inside the box on both axes")
        XCTAssertFalse(TapVocabulary.travelled(from: origin, to: Vector2D(x: 8, y: 8)), "exactly on the slop is not past it")
        XCTAssertTrue(TapVocabulary.travelled(from: origin, to: Vector2D(x: 9, y: 0)))
        XCTAssertTrue(TapVocabulary.travelled(from: origin, to: Vector2D(x: 0, y: -9)))
        XCTAssertFalse(TapVocabulary.travelled(from: origin, to: Vector2D(x: -8, y: 8)), "sign does not matter")
        // The same rule at the double-tap slop.
        XCTAssertFalse(TapVocabulary.travelled(from: origin, to: Vector2D(x: 20, y: 20), slop: TapVocabulary.doubleTapSlopPx))
        XCTAssertTrue(TapVocabulary.travelled(from: origin, to: Vector2D(x: 29, y: 0), slop: TapVocabulary.doubleTapSlopPx))
        // Which is what `classify` then reads.
        XCTAssertEqual(TapVocabulary.classify(down: origin, up: Vector2D(x: 6, y: 6), upAtMs: 1000, previousTap: nil), .tap)
        XCTAssertEqual(
            TapVocabulary.classify(down: origin, up: origin, upAtMs: 1100, previousTap: (Vector2D(x: 20, y: 20), 1000)),
            .doubleTap,
            "a second tap 20 pt off on each axis is still the same target"
        )
    }

    func testChromeStateDerivesAdaptationFromMeasuredWindow() {
        let chrome = ChromeState()
        chrome.viewportSize = Size(width: 390, height: 844)
        XCTAssertTrue(chrome.adaptation.isPhone)
        chrome.viewportSize = Size(width: 1440, height: 900)
        chrome.activeInput = .pen
        XCTAssertEqual(chrome.adaptation.viewportClass, .desktop)
        XCTAssertTrue(chrome.adaptation.touchChrome)
    }
}
