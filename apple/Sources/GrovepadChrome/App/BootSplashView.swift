import SwiftUI

// ---------------------------------------------------------------------------
// The boot splash, ported from the web's `index.html` (`.gp-splash--boot`):
// four stacked layers — aurora, a drifting line grid, a board of six cards
// whose wires draw themselves and then carry travelling pulses, a vignette —
// under the borderless logo, alone in the middle. The owner dropped the web's
// copy (18 Sep 2026) and asked for a louder field, so the glows, grid, cards
// and wires run brighter than the web's values.
//
// Every value below is the web's: delays, durations, cubic-bezier curves,
// the 1600×900 board drawn with `slice` fitting, the masks. The scene is one
// `TimelineView` reading elapsed time, so nothing keeps running once the
// splash is removed. Reduced motion shows the finished frame, held still.
// ---------------------------------------------------------------------------

public struct BootSplashView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var start = Date()
    /// A fixed moment of the scene (seconds in) instead of the clock: the
    /// render seam for tests.
    private let frozen: Double?

    public init() { frozen = nil }

    init(frozenAt seconds: Double) { frozen = seconds }

    public var body: some View {
        TimelineView(.animation(paused: reduceMotion)) { timeline in
            let t = frozen ?? (reduceMotion ? 60 : timeline.date.timeIntervalSince(start))
            GeometryReader { proxy in
                ZStack {
                    SplashField(t: t, size: proxy.size, palette: .dark)
                    SplashMark(t: t, size: proxy.size)
                }
                .frame(width: proxy.size.width, height: proxy.size.height)
            }
        }
        .background(SplashInk.ground)
        .ignoresSafeArea()
        .environment(\.colorScheme, .dark)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Grovepad is loading")
    }
}

// MARK: - Timing

enum SplashInk {
    static let accent = Color(red: 74 / 255, green: 222 / 255, blue: 128 / 255)
    static let cool = Color(red: 96 / 255, green: 140 / 255, blue: 1)
    static let ink = Color(red: 250 / 255, green: 250 / 255, blue: 250 / 255)
    static let ground = Color(hex: "#080a09")
    static let cell: CGFloat = 46
}

enum SplashCurve {
    /// `--gp-splash-out`: cubic-bezier(0.16, 1, 0.3, 1).
    static let out = UnitCurve.bezier(startControlPoint: UnitPoint(x: 0.16, y: 1), endControlPoint: UnitPoint(x: 0.3, y: 1))
    static let draw = UnitCurve.bezier(startControlPoint: UnitPoint(x: 0.22, y: 1), endControlPoint: UnitPoint(x: 0.36, y: 1))
    static let pulse = UnitCurve.bezier(startControlPoint: UnitPoint(x: 0.45, y: 0), endControlPoint: UnitPoint(x: 0.5, y: 1))
    static let scan = UnitCurve.bezier(startControlPoint: UnitPoint(x: 0.65, y: 0), endControlPoint: UnitPoint(x: 0.35, y: 1))

    /// Progress 0…1 of a one-shot animation of `duration` after `delay`.
    static func progress(_ t: Double, delay: Double, duration: Double, curve: UnitCurve = out) -> Double {
        let raw = min(max((t - delay) / duration, 0), 1)
        return curve.value(at: raw)
    }

    static func easeOut(_ x: Double) -> Double { 1 - pow(1 - x, 2) }
    static func easeInOut(_ x: Double) -> Double { x < 0.5 ? 2 * x * x : 1 - pow(-2 * x + 2, 2) / 2 }
}

/// A radial glow stretched to an ellipse: `radii` and `center` are fractions
/// of `size`, the colour fades to nothing at `fade` of the radius.
public func drawGlow(_ context: inout GraphicsContext, size: CGSize, center: CGPoint, radii: CGSize, color: Color, fade: CGFloat = 0.7) {
    var layer = context
    layer.translateBy(x: center.x * size.width, y: center.y * size.height)
    layer.scaleBy(x: radii.width * size.width, y: radii.height * size.height)
    layer.fill(Path(ellipseIn: CGRect(x: -1, y: -1, width: 2, height: 2)),
               with: .radialGradient(Gradient(stops: [.init(color: color, location: 0), .init(color: color.opacity(0), location: fade)]), center: .zero, startRadius: 0, endRadius: 1))
}

// MARK: - The backdrop (the splash's field without the mark)

/// The splash's living field — aurora, drifting grid, the six-card board
/// with its pulsing wires, the vignette — as a background for other scenes
/// (the sign-in scene). It keeps running (the aurora wanders, pulses loop)
/// and follows the colour scheme: the splash's own inks on dark, a paper
/// version on light. Reduced motion holds the finished frame.
public struct SplashBackdrop: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var colorScheme
    @State private var start = Date()
    private let frozen: Double?

    public init() { frozen = nil }

    init(frozenAt seconds: Double) { frozen = seconds }

    public var body: some View {
        let palette: SplashPalette = colorScheme == .dark ? .dark : .light
        TimelineView(.animation(paused: reduceMotion)) { timeline in
            let t = frozen ?? (reduceMotion ? 60 : timeline.date.timeIntervalSince(start))
            GeometryReader { proxy in
                SplashField(t: t, size: proxy.size, palette: palette)
                    .frame(width: proxy.size.width, height: proxy.size.height)
            }
        }
        .background(palette.ground)
        .clipped()
        .ignoresSafeArea()
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// The splash's inks. Dark is the splash itself; light keeps every layer and
/// swaps the glow-on-black values for paper: ink lines in the card ink, a
/// deeper leaf green that still reads on white, and a much softer vignette.
struct SplashPalette {
    let ground: Color
    let accent: Color
    let cool: Color
    let ink: Color
    /// The colour the vignette darkens toward, and how hard.
    let shade: Color
    let shadeStrength: Double
    /// Multiplies the aurora and focus-pool alphas.
    let glow: Double
    /// Card plates: a light wash on paper, a breath of white on black.
    let plate: Color

    static let dark = SplashPalette(
        ground: SplashInk.ground, accent: SplashInk.accent, cool: SplashInk.cool, ink: SplashInk.ink,
        shade: .black, shadeStrength: 1, glow: 1, plate: SplashInk.ink.opacity(0.04)
    )
    static let light = SplashPalette(
        ground: Color(hex: "#f4f6f3"), accent: Color(hex: "#2fa84f"), cool: Color(hex: "#4f7fe0"), ink: Color(hex: "#1a241e"),
        shade: Color(hex: "#1a241e"), shadeStrength: 0.22, glow: 1.25, plate: Color.white.opacity(0.6)
    )
}

// MARK: - The field

private struct SplashField: View {
    let t: Double
    let size: CGSize
    let palette: SplashPalette

    var body: some View {
        let arrive = SplashCurve.progress(t, delay: 0, duration: 1.8)
        ZStack {
            aurora
            grid
            if size.width > 720 { board }
            vignette
        }
        .opacity(arrive)
        .scaleEffect(1.09 - 0.09 * arrive)
    }

    private var aurora: some View {
        // Four pools that wander on slow, unrelated orbits.
        let a = 2 * .pi * t
        return Canvas { context, size in
            drawGlow(&context, size: size, center: CGPoint(x: 0.5 + 0.08 * sin(a / 11), y: 0.06 + 0.06 * cos(a / 9)), radii: CGSize(width: 0.5, height: 0.46), color: palette.accent.opacity(0.16 * palette.glow))
            drawGlow(&context, size: size, center: CGPoint(x: 0.86 + 0.07 * cos(a / 13), y: 0.94 + 0.05 * sin(a / 10)), radii: CGSize(width: 0.58, height: 0.52), color: palette.cool.opacity(0.14 * palette.glow), fade: 0.72)
            drawGlow(&context, size: size, center: CGPoint(x: 0.1 + 0.07 * sin(a / 8), y: 0.8 + 0.06 * cos(a / 12)), radii: CGSize(width: 0.46, height: 0.44), color: palette.accent.opacity(0.1 * palette.glow))
            drawGlow(&context, size: size, center: CGPoint(x: 0.5, y: 0.5), radii: CGSize(width: 0.22 + 0.02 * sin(a / 2.8), height: 0.26 + 0.02 * sin(a / 2.8)), color: palette.accent.opacity(0.07 * palette.glow))
        }
    }

    /// Oversized by 16 % each way and slid one cell per 12 s, so the loop is seamless.
    private var grid: some View {
        let shift = CGFloat((t / 12).truncatingRemainder(dividingBy: 1)) * SplashInk.cell
        return Canvas { context, size in
            var lines = Path()
            var x: CGFloat = 0
            while x <= size.width { lines.addRect(CGRect(x: x, y: 0, width: 1, height: size.height)); x += SplashInk.cell }
            var y: CGFloat = 0
            while y <= size.height { lines.addRect(CGRect(x: 0, y: y, width: size.width, height: 1)); y += SplashInk.cell }
            context.translateBy(x: shift, y: shift)
            context.fill(lines, with: .color(palette.ink.opacity(0.055)))
        }
        .padding(-0.16 * max(size.width, size.height))
        .mask(
            EllipticalGradient(stops: [
                .init(color: .clear, location: 0.06),
                .init(color: .black, location: 0.5),
                .init(color: .clear, location: 1),
            ], center: .center, startRadiusFraction: 0, endRadiusFraction: 1.1)
        )
    }

    private var board: some View {
        let drift = (1 - cos(2 * .pi * t / 16)) / 2
        return Canvas { context, size in
            let scale = max(size.width / 1600, size.height / 900)
            context.translateBy(x: (size.width - 1600 * scale) / 2, y: (size.height - 900 * scale) / 2)
            context.scaleBy(x: scale, y: scale)
            SplashBoard.draw(&context, t: t, palette: palette)
        }
        .mask(
            EllipticalGradient(stops: [
                .init(color: .clear, location: 0.16),
                .init(color: .black, location: 0.62),
            ], center: .center, startRadiusFraction: 0, endRadiusFraction: 1)
        )
        .offset(x: -28 * drift, y: 18 * drift)
    }

    private var vignette: some View {
        ZStack {
            EllipticalGradient(stops: [
                .init(color: .clear, location: 0.3),
                .init(color: palette.shade.opacity(0.58 * palette.shadeStrength), location: 1),
            ], center: UnitPoint(x: 0.5, y: 0.48), startRadiusFraction: 0, endRadiusFraction: 1.12)
            LinearGradient(stops: [
                .init(color: palette.shade.opacity(0.28 * palette.shadeStrength), location: 0),
                .init(color: .clear, location: 0.2),
                .init(color: .clear, location: 0.76),
                .init(color: palette.shade.opacity(0.32 * palette.shadeStrength), location: 1),
            ], startPoint: .top, endPoint: .bottom)
        }
    }
}

// MARK: - The board (1600 × 900)

enum SplashBoard {
    struct Card {
        let delay: Double
        let plate: CGRect
        let radius: CGFloat
        /// x, y, width; the head row is the first, the lit row the last.
        let rows: [CGRect]
        let lit: Bool
        let ports: [CGPoint]
        let spark: [CGPoint]
    }

    struct Wire {
        let delay: Double
        let path: Path
    }

    static func curve(_ a: CGPoint, _ c1: CGPoint, _ c2: CGPoint, _ b: CGPoint) -> Path {
        var path = Path()
        path.move(to: a)
        path.addCurve(to: b, control1: c1, control2: c2)
        return path
    }

    static func row(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat) -> CGRect { CGRect(x: x, y: y, width: w, height: 6) }

    static let wires: [Wire] = [
        Wire(delay: 0.6, path: curve(CGPoint(x: 198, y: 300), CGPoint(x: 198, y: 348), CGPoint(x: 249, y: 358), CGPoint(x: 249, y: 404))),
        Wire(delay: 0.82, path: curve(CGPoint(x: 249, y: 514), CGPoint(x: 249, y: 554), CGPoint(x: 174, y: 566), CGPoint(x: 174, y: 612))),
        Wire(delay: 0.72, path: curve(CGPoint(x: 1395, y: 282), CGPoint(x: 1395, y: 328), CGPoint(x: 1412, y: 340), CGPoint(x: 1412, y: 384))),
        Wire(delay: 0.94, path: curve(CGPoint(x: 1324, y: 433), CGPoint(x: 1262, y: 433), CGPoint(x: 1371, y: 506), CGPoint(x: 1371, y: 566))),
        Wire(delay: 1.1, path: curve(CGPoint(x: 348, y: 459), CGPoint(x: 660, y: 700), CGPoint(x: 1010, y: 736), CGPoint(x: 1280, y: 612))),
    ]

    static let cards: [Card] = [
        Card(delay: 0.18, plate: CGRect(x: 110, y: 200, width: 176, height: 100), radius: 16,
             rows: [row(132, 226, 66), row(132, 248, 130), row(132, 266, 100), row(132, 284, 58)], lit: true,
             ports: [CGPoint(x: 198, y: 300)], spark: []),
        Card(delay: 0.32, plate: CGRect(x: 150, y: 404, width: 198, height: 110), radius: 18,
             rows: [row(172, 430, 72), row(172, 452, 150), row(172, 470, 124), row(172, 488, 90)], lit: true,
             ports: [CGPoint(x: 249, y: 404), CGPoint(x: 249, y: 514), CGPoint(x: 348, y: 459)], spark: []),
        Card(delay: 0.46, plate: CGRect(x: 96, y: 612, width: 156, height: 86), radius: 14,
             rows: [row(118, 636, 58), row(118, 658, 108), row(118, 676, 74)], lit: true,
             ports: [CGPoint(x: 174, y: 612)], spark: []),
        Card(delay: 0.26, plate: CGRect(x: 1300, y: 178, width: 190, height: 104), radius: 16,
             rows: [row(1322, 204, 64), row(1322, 226, 140), row(1322, 244, 110), row(1322, 262, 68)], lit: true,
             ports: [CGPoint(x: 1395, y: 282)], spark: []),
        Card(delay: 0.4, plate: CGRect(x: 1324, y: 384, width: 176, height: 98), radius: 16,
             rows: [row(1346, 408, 56)], lit: false,
             ports: [CGPoint(x: 1412, y: 384), CGPoint(x: 1324, y: 433)],
             spark: [CGPoint(x: 1346, y: 464), CGPoint(x: 1372, y: 448), CGPoint(x: 1398, y: 456), CGPoint(x: 1424, y: 432), CGPoint(x: 1450, y: 440), CGPoint(x: 1476, y: 420)]),
        Card(delay: 0.54, plate: CGRect(x: 1280, y: 566, width: 182, height: 92), radius: 15,
             rows: [row(1302, 590, 68), row(1302, 612, 134), row(1302, 630, 90)], lit: true,
             ports: [CGPoint(x: 1371, y: 566), CGPoint(x: 1280, y: 612)], spark: []),
    ]

    static func draw(_ context: inout GraphicsContext, t: Double, palette: SplashPalette) {
        // Focus pools behind each cluster.
        for (center, radius, delay) in [(CGPoint(x: 249, y: 460), CGFloat(250), 0.0), (CGPoint(x: 1390, y: 310), CGFloat(230), 0.9)] {
            let p = SplashCurve.easeOut(min(max((t - delay) / 2.4, 0), 1))
            guard p > 0 else { continue }
            context.fill(Path(ellipseIn: CGRect(x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2)),
                         with: .radialGradient(Gradient(colors: [palette.accent.opacity(0.2 * p * palette.glow), palette.accent.opacity(0)]), center: center, startRadius: 0, endRadius: radius))
        }

        for wire in wires { drawWire(&context, wire, t: t, palette: palette) }
        for card in cards { drawCard(&context, card, t: t, palette: palette) }
    }

    private static func drawWire(_ context: inout GraphicsContext, _ wire: Wire, t: Double, palette: SplashPalette) {
        let drawn = SplashCurve.progress(t, delay: wire.delay, duration: 1.4, curve: SplashCurve.draw)
        if drawn > 0 {
            let box = wire.path.boundingRect
            context.stroke(wire.path.trimmedPath(from: 0, to: drawn),
                           with: .linearGradient(Gradient(colors: [palette.accent.opacity(0.14), palette.accent.opacity(0.55)]), startPoint: CGPoint(x: box.minX, y: box.minY), endPoint: CGPoint(x: box.minX, y: box.maxY)),
                           lineWidth: 1.8)
        }
        // The travelling value: 40 of 1000 units, keyframes 0 / 7 / 52 / 62 %.
        let local = t - wire.delay - 1.15
        guard local >= 0 else { return }
        let phase = local.truncatingRemainder(dividingBy: 2.6) / 2.6
        let offset: Double
        if phase < 0.52 {
            offset = 1000 - 960 * SplashCurve.pulse.value(at: phase / 0.52)
        } else if phase < 0.62 {
            offset = 40 - 40 * SplashCurve.pulse.value(at: (phase - 0.52) / 0.1)
        } else {
            offset = 0
        }
        let alpha: Double
        if phase < 0.07 { alpha = SplashCurve.pulse.value(at: phase / 0.07) }
        else if phase < 0.52 { alpha = 1 }
        else if phase < 0.62 { alpha = 1 - SplashCurve.pulse.value(at: (phase - 0.52) / 0.1) }
        else { alpha = 0 }
        guard alpha > 0.001 else { return }
        let from = (1000 - offset) / 1000
        let segment = wire.path.trimmedPath(from: max(from, 0), to: min(from + 0.04, 1))
        context.stroke(segment, with: .color(palette.accent.opacity(0.28 * alpha)), style: StrokeStyle(lineWidth: 11, lineCap: .round))
        context.stroke(segment, with: .color(palette.accent.opacity(alpha)), style: StrokeStyle(lineWidth: 2.4, lineCap: .round))
    }

    private static func drawCard(_ context: inout GraphicsContext, _ card: Card, t: Double, palette: SplashPalette) {
        let p = SplashCurve.progress(t, delay: card.delay, duration: 1.05)
        guard p > 0 else { return }
        var layer = context
        layer.opacity = p
        let center = CGPoint(x: card.plate.midX, y: card.plate.midY)
        let scale = 0.965 + 0.035 * p
        layer.translateBy(x: center.x, y: center.y + 26 * (1 - p))
        layer.scaleBy(x: scale, y: scale)
        layer.translateBy(x: -center.x, y: -center.y)

        let plate = Path(roundedRect: card.plate, cornerRadius: card.radius)
        layer.fill(plate, with: .color(palette.plate))
        layer.stroke(plate, with: .color(palette.ink.opacity(0.13)), lineWidth: 1)
        for (index, row) in card.rows.enumerated() {
            let ink: Color
            if index == 0 { ink = palette.ink.opacity(0.2) }
            else if card.lit && index == card.rows.count - 1 { ink = palette.accent.opacity(0.55) }
            else { ink = palette.ink.opacity(0.1) }
            layer.fill(Path(roundedRect: row, cornerRadius: 3), with: .color(ink))
        }
        if card.spark.count > 1 {
            var spark = Path()
            spark.addLines(card.spark)
            layer.stroke(spark, with: .color(palette.accent.opacity(0.6)), style: StrokeStyle(lineWidth: 2.4, lineCap: .round, lineJoin: .round))
        }
        for port in card.ports {
            layer.fill(Path(ellipseIn: CGRect(x: port.x - 4, y: port.y - 4, width: 8, height: 8)), with: .color(palette.accent.opacity(0.7)))
        }
    }
}

// MARK: - The mark

/// The borderless "gp" mark, alone in the middle: it settles in out of a blur
/// and then breathes slowly while the board wakes behind it.
private struct SplashMark: View {
    let t: Double
    let size: CGSize

    var body: some View {
        let arrive = SplashCurve.progress(t, delay: 0.1, duration: 1.1)
        let breathe = (1 - cos(2 * .pi * max(t - 1.2, 0) / 2.8)) / 2
        let side = min(max(min(size.width, size.height) * 0.16, 72), 128)
        GrovepadLogo()
            .frame(width: side, height: side)
            .shadow(color: SplashInk.accent.opacity(0.18 + 0.22 * breathe), radius: 24 + 14 * breathe)
            .scaleEffect((0.86 + 0.14 * arrive) * (1 + 0.025 * breathe))
            .opacity(arrive)
            .blur(radius: 10 * (1 - arrive))
    }
}
