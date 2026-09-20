import SwiftUI
import ImageIO

// ---------------------------------------------------------------------------
// The brand marks the sign-in screen and the boot splash draw:
//
//   GrovepadLogo      the "gp" sprout (`public/brand/logo_{light,dark}_borderless.png`,
//                     bundled as `Resources/Brand`)
//   GoogleMark        Google's four-colour G, from the web's `GoogleMark` SVG
//   SVGPathShape      the tiny path-data reader the G needs (M L H V C S Q Z,
//                     absolute and relative, implicit repeats)
// ---------------------------------------------------------------------------

public struct GrovepadLogo: View {
    /// The sprout for dark grounds (a light "g") and for paper (a dark "g"),
    /// the web's `logo_light_borderless` / `logo_dark_borderless`.
    private static let onDark = load("logo_light_borderless")
    private static let onLight = load("logo_dark_borderless")

    private static func load(_ name: String) -> CGImage? {
        guard let url = Bundle.module.url(forResource: name, withExtension: "png", subdirectory: "Brand"),
              let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
        return CGImageSourceCreateImageAtIndex(source, 0, nil)
    }

    @Environment(\.colorScheme) private var colorScheme

    public init() {}

    public var body: some View {
        if let image = colorScheme == .light ? (GrovepadLogo.onLight ?? GrovepadLogo.onDark) : GrovepadLogo.onDark {
            Image(decorative: image, scale: 1)
                .resizable()
                .interpolation(.high)
                .aspectRatio(contentMode: .fit)
                .accessibilityHidden(true)
        } else {
            Image(systemName: "leaf.fill").resizable().aspectRatio(contentMode: .fit).foregroundStyle(Color(hex: "#63ff00"))
        }
    }
}

/// Google's G on a 24-unit grid, scaled to its frame.
public struct GoogleMark: View {
    private static let parts: [(String, String)] = [
        ("#4285F4", "M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l-.02.15 3.5 2.7.24.03c2.2-2.1 3.5-5.1 3.5-8.6"),
        ("#34A853", "M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.8-2.9c-1 .7-2.4 1.2-4.1 1.2-3.2 0-5.8-2.1-6.8-5l-.14.01-3.7 2.8-.05.13C3.3 21.3 7.3 24 12 24"),
        ("#FBBC05", "M5.2 14.4c-.3-.7-.4-1.5-.4-2.4 0-.8.2-1.6.4-2.4l-.01-.16-3.7-2.9-.12.06C.5 8.2 0 10 0 12s.5 3.8 1.4 5.4l3.8-3"),
        ("#EB4335", "M12 4.6c2.3 0 3.8 1 4.7 1.8l3.4-3.3C18 1.2 15.2 0 12 0 7.3 0 3.3 2.7 1.4 6.6l3.8 3c1-2.9 3.6-5 6.8-5"),
    ]

    public init() {}

    public var body: some View {
        ZStack {
            ForEach(GoogleMark.parts.indices, id: \.self) { index in
                SVGPathShape(GoogleMark.parts[index].1, viewBox: CGSize(width: 24, height: 24))
                    .fill(Color(hex: GoogleMark.parts[index].0))
            }
        }
        .aspectRatio(1, contentMode: .fit)
        .accessibilityHidden(true)
    }
}

/// Path data in a `viewBox`, scaled to fit the shape's rect.
public struct SVGPathShape: Shape {
    private let path: Path
    private let viewBox: CGSize

    public init(_ data: String, viewBox: CGSize) {
        self.path = SVGPathShape.parse(data)
        self.viewBox = viewBox
    }

    public func path(in rect: CGRect) -> Path {
        let scale = min(rect.width / viewBox.width, rect.height / viewBox.height)
        let dx = rect.minX + (rect.width - viewBox.width * scale) / 2
        let dy = rect.minY + (rect.height - viewBox.height * scale) / 2
        return path.applying(CGAffineTransform(a: scale, b: 0, c: 0, d: scale, tx: dx, ty: dy))
    }

    static func parse(_ data: String) -> Path {
        var tokens: [Character] = []
        var numbers: [[CGFloat]] = []
        var current = ""
        var group: [CGFloat] = []
        func flushNumber() {
            if let value = Double(current) { group.append(CGFloat(value)) }
            current = ""
        }
        for char in data {
            if char.isLetter {
                flushNumber()
                if !tokens.isEmpty { numbers.append(group) }
                group = []
                tokens.append(char)
            } else if char == "-" {
                flushNumber()
                current = "-"
            } else if char == "." {
                if current.contains(".") { flushNumber() }
                current.append(char)
            } else if char.isNumber {
                current.append(char)
            } else {
                flushNumber()
            }
        }
        flushNumber()
        if !tokens.isEmpty { numbers.append(group) }

        var path = Path()
        var point = CGPoint.zero
        var start = CGPoint.zero
        var lastControl: CGPoint?
        for (command, args) in zip(tokens, numbers) {
            let relative = command.isLowercase
            let arity: Int
            switch command.uppercased() {
            case "M", "L": arity = 2
            case "H", "V": arity = 1
            case "C": arity = 6
            case "S", "Q": arity = 4
            default: arity = 0
            }
            if arity == 0 {
                path.closeSubpath()
                point = start
                lastControl = nil
                continue
            }
            var index = 0
            var first = true
            while index + arity <= args.count {
                let a = Array(args[index..<index + arity])
                index += arity
                let base = relative ? point : .zero
                func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: base.x + x, y: base.y + y) }
                switch command.uppercased() {
                case "M":
                    let target = p(a[0], a[1])
                    if first { path.move(to: target); start = target } else { path.addLine(to: target) }
                    point = target
                    lastControl = nil
                case "L":
                    point = p(a[0], a[1]); path.addLine(to: point); lastControl = nil
                case "H":
                    point = CGPoint(x: (relative ? point.x : 0) + a[0], y: point.y); path.addLine(to: point); lastControl = nil
                case "V":
                    point = CGPoint(x: point.x, y: (relative ? point.y : 0) + a[0]); path.addLine(to: point); lastControl = nil
                case "C":
                    let c1 = p(a[0], a[1]), c2 = p(a[2], a[3]), end = p(a[4], a[5])
                    path.addCurve(to: end, control1: c1, control2: c2)
                    point = end; lastControl = c2
                case "S":
                    let c1 = lastControl.map { CGPoint(x: 2 * point.x - $0.x, y: 2 * point.y - $0.y) } ?? point
                    let c2 = p(a[0], a[1]), end = p(a[2], a[3])
                    path.addCurve(to: end, control1: c1, control2: c2)
                    point = end; lastControl = c2
                case "Q":
                    let c = p(a[0], a[1]), end = p(a[2], a[3])
                    path.addQuadCurve(to: end, control: c)
                    point = end; lastControl = nil
                default: break
                }
                first = false
            }
        }
        return path
    }
}
