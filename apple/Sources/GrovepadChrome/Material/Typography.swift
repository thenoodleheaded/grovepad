import SwiftUI
import CoreText

// ---------------------------------------------------------------------------
// The app's typeface. The web sets `--font-sans: 'Clash Display'` on the
// whole document (src/index.css) and vendors the five faces into
// public/fonts; the same five faces ship here in `Resources/Fonts` as
// TrueType (converted from those woff2 files, names repaired so each face has
// a PostScript name) and are registered for the process on first use.
//
// SF Symbols keep the system font: an icon's weight follows the font it is
// given, and Clash Display carries no symbol metrics.
// ---------------------------------------------------------------------------

public enum GroveFont {
    /// PostScript names of the bundled faces, lightest first.
    public static let faces = ["ClashDisplay-Light", "ClashDisplay-Regular", "ClashDisplay-Medium", "ClashDisplay-Semibold", "ClashDisplay-Bold"]

    /// Registers the bundled faces once per process. Safe to call from any
    /// view body; the work happens on the first call only.
    public static func register() { _ = registered }

    private static let registered: Bool = {
        guard let urls = Bundle.module.urls(forResourcesWithExtension: "ttf", subdirectory: "Fonts") ?? Bundle.module.urls(forResourcesWithExtension: "ttf", subdirectory: nil) else { return false }
        for url in urls {
            // `.process`: the faces live as long as the app does. A face that
            // is already registered (a second window, a test run) reports an
            // error we do not care about.
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        }
        return !urls.isEmpty
    }()

    /// Whether the faces reached the font manager (test seam).
    public static var isAvailable: Bool { registered }

    /// The face for a SwiftUI weight: the web ships 300–700, so lighter and
    /// heavier weights clamp to the nearest face.
    public static func face(for weight: Font.Weight) -> String {
        switch weight {
        case .ultraLight, .thin, .light: return faces[0]
        case .medium: return faces[2]
        case .semibold: return faces[3]
        case .bold, .heavy, .black: return faces[4]
        default: return faces[1]
        }
    }
}

public extension Font {
    /// Clash Display at a fixed point size — the drop-in for
    /// `.system(size:weight:)` everywhere text (not an icon) is set.
    static func grove(size: CGFloat, weight: Font.Weight = .regular) -> Font {
        GroveFont.register()
        return .custom(GroveFont.face(for: weight), fixedSize: size)
    }

    /// Clash Display that follows the reader's text size, for long-form
    /// chrome (settings, sheets) where Dynamic Type should apply.
    static func grove(_ style: Font.TextStyle, size: CGFloat, weight: Font.Weight = .regular) -> Font {
        GroveFont.register()
        return .custom(GroveFont.face(for: weight), size: size, relativeTo: style)
    }
}
