import XCTest
import SwiftUI
import GrovepadCore
@testable import GrovepadChrome

#if canImport(AppKit)
/// The app stands on its own ground in either theme: near-black `#080a09`
/// in dark, the web's paper `#f4f5f6` in light. Two things kept breaking that
/// in the simulator and neither was caught by a "renders something" smoke
/// test: a resting bitmap composited over an opaque backing, and a chrome
/// surface drawn on the system's default material instead of the app's.
/// Both are pixel facts, so both are asserted as pixels here, per theme.
final class AppearanceTests: XCTestCase {
    struct Pixel: Hashable {
        var r: Int
        var g: Int
        var b: Int
        var a: Int
        var isNearWhite: Bool { a > 8 && r > 200 && g > 200 && b > 200 }
        var isDark: Bool { r < 90 && g < 90 && b < 90 }
        /// This (premultiplied) pixel composited over an opaque ground.
        func over(r gr: Int, g gg: Int, b gb: Int) -> Pixel {
            let rest = 255 - a
            return Pixel(r: r + rest * gr / 255, g: g + rest * gg / 255, b: b + rest * gb / 255, a: 255)
        }
        /// The app's own ground: opaque, and dark. An untinted render has
        /// alpha 0, which reads as "dark" but means "nothing is behind it".
        var isGround: Bool { a > 200 && isDark }
        /// The light theme's paper: opaque and near-white.
        var isPaper: Bool { a > 200 && r > 225 && g > 225 && b > 225 }
    }

    /// Premultiplied BGRA is what `ImageRenderer` hands back; un-premultiply
    /// so a translucent light plate does not read as dark.
    func pixel(_ image: CGImage, x: Int, y: Int) throws -> Pixel {
        let data = try XCTUnwrap(image.dataProvider?.data)
        let bytes = CFDataGetBytePtr(data)!
        let offset = y * image.bytesPerRow + x * 4
        let alpha = Int(bytes[offset + 3])
        func lift(_ value: UInt8) -> Int {
            guard alpha > 0, alpha < 255 else { return Int(value) }
            return min(255, Int((Double(value) / Double(alpha)) * 255))
        }
        return Pixel(r: lift(bytes[offset + 2]), g: lift(bytes[offset + 1]), b: lift(bytes[offset]), a: alpha)
    }

    func corners(_ image: CGImage) throws -> [Pixel] {
        [
            try pixel(image, x: 0, y: 0),
            try pixel(image, x: image.width - 1, y: 0),
            try pixel(image, x: 0, y: image.height - 1),
            try pixel(image, x: image.width - 1, y: image.height - 1),
        ]
    }

    /// The most common pixel on a coarse sample — the surface's plate.
    func dominant(_ image: CGImage) throws -> Pixel {
        var counts: [Pixel: Int] = [:]
        let step = max(1, min(image.width, image.height) / 20)
        for y in stride(from: 0, to: image.height, by: step) {
            for x in stride(from: 0, to: image.width, by: step) {
                counts[try pixel(image, x: x, y: y), default: 0] += 1
            }
        }
        return counts.max { $0.value < $1.value }!.key
    }

    // MARK: - Resting bitmaps

    /// A resting face is a rounded tile. Outside the corner radius it is
    /// nothing at all, so the canvas can composite it over the board's own
    /// ground. An opaque renderer backing fills those corners with the
    /// default light page and paints a white square behind every resting
    /// card on a dark canvas.
    func testRestingBitmapCornersAreTransparent() throws {
        let (document, _, _) = makeDocument()
        let id = try XCTUnwrap(document.createWidget(type: "text", at: .zero, title: "Note"))
        let widget = try XCTUnwrap(document.widget(id))
        let provider = WidgetBitmapProvider()
        let face = WidgetRendererRegistry.renderer(for: widget.type).restingFaceMeasured(widget)
        let size = RestingFaceMeasure.size(of: face.model, widgetSize: widget.size)
        let image = try XCTUnwrap(provider.restingBitmap(for: widget, size: size, scale: 2))
        for corner in try corners(image) {
            XCTAssertEqual(corner.a, 0, "a rounded tile's corner is transparent, not an opaque page")
            XCTAssertFalse(corner.isNearWhite, "a resting tile never carries a white backing")
        }
        // The middle of the tile is the dark backplate, so the render itself
        // is not simply blank.
        let middle = try pixel(image, x: image.width / 2, y: image.height / 2)
        #if os(macOS)
        // On the Mac the face is frosted glass: translucent, with the canvas
        // blurring the board behind it — but never blank.
        XCTAssertGreaterThan(middle.a, 120, "the frosted tile is not blank")
        XCTAssertLessThan(middle.a, 250, "the glass face lets the aura through faintly")
        #else
        XCTAssertGreaterThan(middle.a, 200, "the tile itself is opaque")
        #endif
        let onGround = middle.over(r: 8, g: 10, b: 9)
        XCTAssertTrue(onGround.isDark, "on the dark ground the backplate is dark, got \(onGround)")

        // The same tile in the light theme is the silver card, and switching
        // the theme moves the data version so the canvas repaints it once.
        let darkVersion = provider.dataVersion(for: widget)
        provider.colorScheme = .light
        XCTAssertNotEqual(provider.dataVersion(for: widget), darkVersion, "a theme change must invalidate resting tiles")
        let light = try XCTUnwrap(provider.restingBitmap(for: widget, size: size, scale: 2))
        let lightMiddle = try pixel(light, x: light.width / 2, y: light.height / 2)
        XCTAssertGreaterThan(lightMiddle.a, 120)
        let onPaper = lightMiddle.over(r: 244, g: 245, b: 246)
        XCTAssertTrue(onPaper.r > 200 && onPaper.g > 200 && onPaper.b > 200, "the light backplate is silver, got \(onPaper)")
        for corner in try corners(light) { XCTAssertEqual(corner.a, 0, "light tiles keep transparent corners") }
    }

    // MARK: - Chrome surfaces

    /// Renders a surface as a window in `scheme` would resolve it.
    func render<V: View>(_ view: V, width: Double, scheme: ColorScheme = .dark) -> CGImage? {
        let adaptation = ChromeAdaptation(width: width, activeInput: width < 640 ? .touch : .mouse)
        return WidgetBitmapProvider.render(
            view
                .environment(\.chromeAdaptation, adaptation)
                .environment(\.touchChrome, adaptation.touchChrome),
            scale: 1,
            colorScheme: scheme
        )
    }

    /// Every temporary surface sits on the app's own plate. The system's
    /// default background is a light page, and a surface that forgets its
    /// plate renders black-on-white inside a `#080a09` app.
    func testEveryChromeSurfaceSitsOnTheAppsGroundInBothThemes() throws {
        for scheme in [ColorScheme.dark, .light] {
            try assertSurfacesStandOnGround(scheme)
        }
    }

    func assertSurfacesStandOnGround(_ scheme: ColorScheme) throws {
        let (document, _, _) = makeDocument()
        _ = document.createWidget(type: "text", at: .zero, title: "A")
        let environment = ChromeEnvironment(
            document: document,
            camera: RecordingCamera(),
            settingsStore: InMemoryKeyValueStore(),
            pickerPrefs: InMemoryWidgetPickerPrefs(favorites: ["counter"]),
            toastScheduler: ManualToastScheduler()
        )
        environment.toasts.add("Hello")
        environment.document.selectWidgets(environment.document.board.widgets.keys)
        // Each surface as the scene presents it: `chromePanel` and
        // `RootScene` both put the app's ground and appearance under it.
        var surfaces: [(String, CGImage?)] = []
        let render = { (view: AnyView, width: Double) in self.render(view, width: width, scheme: scheme) }
        surfaces.append(("add widget", render(AnyView(AddWidgetSheet(model: environment.addWidget, at: .zero, chrome: environment.chrome).frame(width: 390, height: 520).chromeSurface()), 390)))
        surfaces.append(("command palette", render(AnyView(CommandPaletteView(model: environment.palette).frame(width: 390, height: 420).chromeSurface()), 390)))
        surfaces.append(("settings", render(AnyView(SettingsView(model: environment.settings).frame(width: 390, height: 520).chromeSurface()), 390)))
        surfaces.append(("tree drawer", render(AnyView(CanvasTreeDrawerView(model: environment.tree).frame(width: 390, height: 400).chromeSurface()), 390)))
        surfaces.append(("library", render(AnyView(LibraryGridView(model: environment.library).frame(width: 390, height: 400).chromeSurface()), 390)))
        surfaces.append(("confirm dialog", render(AnyView(ConfirmDialogView(model: .deleteWorkspace(named: "Studies", onConfirm: {}, onClose: {})).frame(width: 340, height: 220).chromeSurface()), 390)))
        surfaces.append(("shortcuts", render(AnyView(ShortcutsOverlayView(actions: environment.shortcutActions).frame(width: 390, height: 420).chromeSurface()), 390)))
        surfaces.append(("toasts", render(AnyView(ToastStack(model: environment.toasts).frame(width: 390, height: 120).chromeSurface()), 390)))
        surfaces.append(("toolbar", render(AnyView(CanvasToolbarView(model: environment.toolbar).frame(width: 390, height: 60).chromeSurface()), 390)))
        surfaces.append(("mode dock", render(AnyView(CanvasModeDockView(model: environment.modeDock).frame(width: 390, height: 70).chromeSurface()), 390)))
        for (name, image) in surfaces {
            let image = try XCTUnwrap(image, "\(name) renders")
            let plate = try dominant(image)
            if scheme == .dark {
                XCTAssertFalse(plate.isNearWhite, "\(name) renders on a light page in dark: \(plate)")
                XCTAssertTrue(plate.isGround, "\(name) is not on the app's dark ground: \(plate)")
            } else {
                XCTAssertTrue(plate.isPaper, "\(name) is not on the app's paper in light: \(plate)")
            }
        }
    }

    /// The seam itself: the surface lays the app's ground under the content
    /// and lets the chosen appearance through — light ink on dark ground,
    /// dark ink on paper.
    func testChromeSurfaceFollowsTheChosenAppearance() throws {
        struct Probe: View {
            var body: some View {
                Text("Grovepad")
                    .font(.grove(size: 20, weight: .bold))
                    .foregroundStyle(Color.primary)
                    .frame(width: 120, height: 60)
            }
        }
        for scheme in [ColorScheme.dark, .light] {
            let image = try XCTUnwrap(render(Probe().chromeSurface(fillsScreen: false), width: 390, scheme: scheme))
            let plate = try dominant(image)
            XCTAssertTrue(scheme == .dark ? plate.isGround : plate.isPaper, "the surface stands on the \(scheme) ground: \(plate)")
            var sawInk = false
            for x in stride(from: 0, to: image.width, by: 2) {
                for y in stride(from: 0, to: image.height, by: 2) {
                    let p = try pixel(image, x: x, y: y)
                    if scheme == .dark ? p.isNearWhite : (p.a > 200 && p.isDark) { sawInk = true }
                }
            }
            XCTAssertTrue(sawInk, "ink did not contrast with the \(scheme) ground")
        }
    }

    /// The typeface ships in the package and reaches the font manager.
    func testClashDisplayIsBundledAndRegistered() {
        GroveFont.register()
        XCTAssertTrue(GroveFont.isAvailable, "the Clash Display faces are missing from the bundle")
        for face in GroveFont.faces {
            let font = CTFontCreateWithName(face as CFString, 12, nil)
            XCTAssertEqual(CTFontCopyPostScriptName(font) as String, face, "\(face) did not register")
        }
    }
}
#endif
