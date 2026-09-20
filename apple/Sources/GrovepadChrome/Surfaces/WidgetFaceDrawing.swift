import Foundation
import SwiftUI

// ---------------------------------------------------------------------------
// The picker's widget faces. Port of `components/ui/widgetFaces.tsx`: every
// widget is drawn as a miniature of its own layout on a 26×20 field, stroked
// in one ink, so shape alone says which widget and colour is spent only on
// the lit row. The drawings themselves are generated from the web source
// (`WidgetFacesData.generated.swift`); this file draws the small SVG subset
// they use — line, rect, circle, ellipse, path and g (opacity, fill, stroke,
// stroke-width, stroke-dasharray, rotate transforms).
// ---------------------------------------------------------------------------

public struct WidgetFaceShape: Equatable, Sendable {
    public enum Kind: Equatable, Sendable {
        case line(x1: Double, y1: Double, x2: Double, y2: Double)
        case rect(x: Double, y: Double, width: Double, height: Double, rx: Double, ry: Double)
        case ellipse(cx: Double, cy: Double, rx: Double, ry: Double)
        case path(String)
    }

    public var kind: Kind
    /// Every ancestor's opacity multiplied in.
    public var opacity: Double
    public var fills: Bool
    public var strokes: Bool
    public var strokeWidth: Double
    public var dash: [Double]
    /// Rotation in degrees about a point (SVG `rotate(a cx cy)`), outermost first.
    public var rotations: [Rotation]

    public struct Rotation: Equatable, Sendable {
        public var degrees: Double
        public var cx: Double
        public var cy: Double
    }
}

public enum WidgetFaces {
    public static let viewBox = CGSize(width: 26, height: 20)
    public static let strokeWidth = 1.45

    /// The face a type wears: its own drawing, else its family's.
    public static func shapes(type: String, category: String) -> [WidgetFaceShape] {
        let index = WidgetFacesData.faceByType[type] ?? WidgetFacesData.faceByCategory[category] ?? WidgetFacesData.faceByCategory["structure"] ?? 0
        return cache.shapes(index)
    }

    private static let cache = FaceCache()

    private final class FaceCache: @unchecked Sendable {
        private var parsed: [Int: [WidgetFaceShape]] = [:]
        private let lock = NSLock()

        func shapes(_ index: Int) -> [WidgetFaceShape] {
            lock.lock()
            defer { lock.unlock() }
            if let hit = parsed[index] { return hit }
            let faces = WidgetFacesData.faces
            let shapes = faces.indices.contains(index) ? WidgetFaces.parse(faces[index]) : []
            parsed[index] = shapes
            return shapes
        }
    }

    // MARK: - Markup

    private struct Style {
        var opacity = 1.0
        var fills = false
        var strokes = true
        var strokeWidth = WidgetFaces.strokeWidth
        var dash: [Double] = []
        var rotations: [WidgetFaceShape.Rotation] = []
    }

    /// Parses the generated markup (well-formed, attribute values quoted).
    public static func parse(_ markup: String) -> [WidgetFaceShape] {
        var shapes: [WidgetFaceShape] = []
        var stack = [Style()]
        let scanner = Scanner(string: markup)
        scanner.charactersToBeSkipped = nil
        while !scanner.isAtEnd {
            _ = scanner.scanUpToString("<")
            guard scanner.scanString("<") != nil else { break }
            if scanner.scanString("/") != nil {
                let name = scanner.scanUpToString(">") ?? ""
                _ = scanner.scanString(">")
                if name == "g", stack.count > 1 { stack.removeLast() }
                continue
            }
            let name = scanner.scanCharacters(from: .letters) ?? ""
            let body = scanner.scanUpToString(">") ?? ""
            _ = scanner.scanString(">")
            let attributes = attributes(in: body)
            var style = stack[stack.count - 1]
            apply(attributes, to: &style)
            if name == "g" {
                if !body.hasSuffix("/") { stack.append(style) }
                continue
            }
            let n = { (key: String) in Double(attributes[key] ?? "") ?? 0 }
            let kind: WidgetFaceShape.Kind
            switch name {
            case "line": kind = .line(x1: n("x1"), y1: n("y1"), x2: n("x2"), y2: n("y2"))
            case "rect":
                let rx = attributes["rx"].flatMap(Double.init) ?? attributes["ry"].flatMap(Double.init) ?? 0
                let ry = attributes["ry"].flatMap(Double.init) ?? rx
                kind = .rect(x: n("x"), y: n("y"), width: n("width"), height: n("height"), rx: rx, ry: ry)
            case "circle": kind = .ellipse(cx: n("cx"), cy: n("cy"), rx: n("r"), ry: n("r"))
            case "ellipse": kind = .ellipse(cx: n("cx"), cy: n("cy"), rx: n("rx"), ry: n("ry"))
            case "path": kind = .path(attributes["d"] ?? "")
            default: continue
            }
            shapes.append(WidgetFaceShape(kind: kind, opacity: style.opacity, fills: style.fills, strokes: style.strokes, strokeWidth: style.strokeWidth, dash: style.dash, rotations: style.rotations))
        }
        return shapes
    }

    private static func attributes(in body: String) -> [String: String] {
        var result: [String: String] = [:]
        let scanner = Scanner(string: body)
        scanner.charactersToBeSkipped = .whitespacesAndNewlines
        let nameCharacters = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-:"))
        while !scanner.isAtEnd {
            guard let key = scanner.scanCharacters(from: nameCharacters) else { break }
            guard scanner.scanString("=\"") != nil else { continue }
            let value = scanner.scanUpToString("\"") ?? ""
            _ = scanner.scanString("\"")
            result[key] = value
        }
        return result
    }

    private static func apply(_ attributes: [String: String], to style: inout Style) {
        if let value = attributes["opacity"].flatMap(Double.init) { style.opacity *= value }
        if let fill = attributes["fill"] { style.fills = fill != "none" }
        if let stroke = attributes["stroke"] { style.strokes = stroke != "none" }
        if let width = attributes["stroke-width"].flatMap(Double.init) { style.strokeWidth = width }
        if let dash = attributes["stroke-dasharray"] { style.dash = numbers(dash) }
        if let transform = attributes["transform"], transform.hasPrefix("rotate(") {
            let values = numbers(String(transform.dropFirst(7).dropLast()))
            if let degrees = values.first {
                style.rotations.append(.init(degrees: degrees, cx: values.count > 2 ? values[1] : 0, cy: values.count > 2 ? values[2] : 0))
            }
        }
    }

    static func numbers(_ text: String) -> [Double] {
        var result: [Double] = []
        var reader = NumberReader(text)
        while let value = reader.next() { result.append(value) }
        return result
    }

    // MARK: - Geometry

    /// The shape's outline in face units (26×20), rotations applied.
    public static func path(for shape: WidgetFaceShape) -> Path {
        var path: Path
        switch shape.kind {
        case let .line(x1, y1, x2, y2):
            path = Path()
            path.move(to: CGPoint(x: x1, y: y1))
            path.addLine(to: CGPoint(x: x2, y: y2))
        case let .rect(x, y, width, height, rx, ry):
            let rect = CGRect(x: x, y: y, width: width, height: height)
            path = rx > 0 || ry > 0
                ? Path(roundedRect: rect, cornerSize: CGSize(width: min(rx, width / 2), height: min(ry, height / 2)), style: .circular)
                : Path(rect)
        case let .ellipse(cx, cy, rx, ry):
            path = Path(ellipseIn: CGRect(x: cx - rx, y: cy - ry, width: rx * 2, height: ry * 2))
        case let .path(data):
            path = SVGPathData.path(data)
        }
        for rotation in shape.rotations.reversed() {
            let transform = CGAffineTransform(translationX: rotation.cx, y: rotation.cy)
                .rotated(by: rotation.degrees * .pi / 180)
                .translatedBy(x: -rotation.cx, y: -rotation.cy)
            path = path.applying(transform)
        }
        return path
    }
}

/// Reads SVG numbers: `-1.5.5` is -1.5 then .5, exponents allowed.
struct NumberReader {
    private let chars: [Character]
    private(set) var index = 0

    init(_ text: String) { chars = Array(text) }

    var isAtEnd: Bool {
        mutating get { skipSeparators(); return index >= chars.count }
    }

    mutating func skipSeparators() {
        while index < chars.count, chars[index] == " " || chars[index] == "," || chars[index] == "\n" || chars[index] == "\t" { index += 1 }
    }

    /// Peeks whether a number starts here (after separators).
    mutating func atNumber() -> Bool {
        skipSeparators()
        guard index < chars.count else { return false }
        let c = chars[index]
        return c.isNumber || c == "-" || c == "+" || c == "."
    }

    mutating func next() -> Double? {
        guard atNumber() else { return nil }
        var text = ""
        if chars[index] == "-" || chars[index] == "+" { text.append(chars[index]); index += 1 }
        var sawDot = false
        while index < chars.count {
            let c = chars[index]
            if c.isNumber { text.append(c); index += 1 }
            else if c == ".", !sawDot { sawDot = true; text.append(c); index += 1 }
            else if c == "e" || c == "E" {
                text.append(c); index += 1
                if index < chars.count, chars[index] == "-" || chars[index] == "+" { text.append(chars[index]); index += 1 }
            } else { break }
        }
        return Double(text)
    }

    /// An arc flag: a single 0 or 1, which may run straight into the next number.
    mutating func flag() -> Bool? {
        skipSeparators()
        guard index < chars.count, chars[index] == "0" || chars[index] == "1" else { return nil }
        defer { index += 1 }
        return chars[index] == "1"
    }

    mutating func command() -> Character? {
        skipSeparators()
        guard index < chars.count, chars[index].isLetter, chars[index] != "e", chars[index] != "E" else { return nil }
        defer { index += 1 }
        return chars[index]
    }
}

/// SVG path data → `Path`: M L H V C S Q T A Z, absolute and relative.
enum SVGPathData {
    static func path(_ data: String) -> Path {
        var path = Path()
        var reader = NumberReader(data)
        var current = CGPoint.zero
        var start = CGPoint.zero
        var lastControl: CGPoint?
        var lastQuad: CGPoint?
        var command: Character = "M"
        while !reader.isAtEnd {
            if let next = reader.command() { command = next } else if !reader.atNumber() { break }
            let relative = command.isLowercase
            let base = relative ? current : .zero
            func point() -> CGPoint? {
                guard let x = reader.next(), let y = reader.next() else { return nil }
                return CGPoint(x: base.x + x, y: base.y + y)
            }
            var control: CGPoint?
            var quad: CGPoint?
            switch command.uppercased() {
            case "M":
                guard let p = point() else { return path }
                path.move(to: p)
                current = p
                start = p
                // Further pairs after a moveto are implicit linetos.
                command = relative ? "l" : "L"
            case "L":
                guard let p = point() else { return path }
                path.addLine(to: p)
                current = p
            case "H":
                guard let x = reader.next() else { return path }
                current = CGPoint(x: relative ? current.x + x : x, y: current.y)
                path.addLine(to: current)
            case "V":
                guard let y = reader.next() else { return path }
                current = CGPoint(x: current.x, y: relative ? current.y + y : y)
                path.addLine(to: current)
            case "C":
                guard let c1 = point(), let c2 = point(), let p = point() else { return path }
                path.addCurve(to: p, control1: c1, control2: c2)
                control = c2
                current = p
            case "S":
                let c1 = lastControl.map { CGPoint(x: 2 * current.x - $0.x, y: 2 * current.y - $0.y) } ?? current
                guard let c2 = point(), let p = point() else { return path }
                path.addCurve(to: p, control1: c1, control2: c2)
                control = c2
                current = p
            case "Q":
                guard let c = point(), let p = point() else { return path }
                path.addQuadCurve(to: p, control: c)
                quad = c
                current = p
            case "T":
                let c = lastQuad.map { CGPoint(x: 2 * current.x - $0.x, y: 2 * current.y - $0.y) } ?? current
                guard let p = point() else { return path }
                path.addQuadCurve(to: p, control: c)
                quad = c
                current = p
            case "A":
                guard let rx = reader.next(), let ry = reader.next(), let rotation = reader.next(),
                      let large = reader.flag(), let sweep = reader.flag(), let p = point() else { return path }
                addArc(&path, from: current, to: p, rx: rx, ry: ry, rotation: rotation, large: large, sweep: sweep)
                current = p
            case "Z":
                path.closeSubpath()
                current = start
            default:
                return path
            }
            lastControl = control
            lastQuad = quad
        }
        return path
    }

    /// SVG's endpoint arc, converted to its centre form and drawn as cubics.
    static func addArc(_ path: inout Path, from p0: CGPoint, to p1: CGPoint, rx rxIn: Double, ry ryIn: Double, rotation: Double, large: Bool, sweep: Bool) {
        var rx = abs(rxIn), ry = abs(ryIn)
        guard rx > 0, ry > 0, p0 != p1 else {
            if p0 != p1 { path.addLine(to: p1) }
            return
        }
        let phi = rotation * .pi / 180
        let cosPhi = cos(phi), sinPhi = sin(phi)
        let dx = (p0.x - p1.x) / 2, dy = (p0.y - p1.y) / 2
        let x1 = cosPhi * dx + sinPhi * dy
        let y1 = -sinPhi * dx + cosPhi * dy
        let lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry)
        if lambda > 1 { rx *= lambda.squareRoot(); ry *= lambda.squareRoot() }
        let numerator = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1
        let denominator = rx * rx * y1 * y1 + ry * ry * x1 * x1
        var factor = (max(0, numerator) / denominator).squareRoot()
        if large == sweep { factor = -factor }
        let cxp = factor * rx * y1 / ry
        let cyp = -factor * ry * x1 / rx
        let cx = cosPhi * cxp - sinPhi * cyp + (p0.x + p1.x) / 2
        let cy = sinPhi * cxp + cosPhi * cyp + (p0.y + p1.y) / 2
        func angle(_ ux: Double, _ uy: Double, _ vx: Double, _ vy: Double) -> Double {
            atan2(ux * vy - uy * vx, ux * vx + uy * vy)
        }
        let theta1 = angle(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry)
        var delta = angle((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry)
        if !sweep, delta > 0 { delta -= 2 * .pi }
        if sweep, delta < 0 { delta += 2 * .pi }
        let segments = max(1, Int((abs(delta) / (.pi / 2)).rounded(.up)))
        let step = delta / Double(segments)
        let k = 4.0 / 3.0 * tan(step / 4)
        func onEllipse(_ t: Double) -> (CGPoint, CGPoint) {
            let x = rx * cos(t), y = ry * sin(t)
            let point = CGPoint(x: cx + cosPhi * x - sinPhi * y, y: cy + sinPhi * x + cosPhi * y)
            let tx = -rx * sin(t), ty = ry * cos(t)
            let tangent = CGPoint(x: cosPhi * tx - sinPhi * ty, y: sinPhi * tx + cosPhi * ty)
            return (point, tangent)
        }
        var t = theta1
        for index in 0..<segments {
            let (a, ta) = onEllipse(t)
            let (b, tb) = onEllipse(t + step)
            let end = index == segments - 1 ? p1 : b
            path.addCurve(to: end, control1: CGPoint(x: a.x + k * ta.x, y: a.y + k * ta.y), control2: CGPoint(x: b.x - k * tb.x, y: b.y - k * tb.y))
            t += step
        }
    }
}

/// One widget's miniature, fitted into its frame (the web's `WidgetFace`:
/// `viewBox 0 0 26 20`, meet, centred), inked in `color`.
public struct WidgetFaceView: View {
    private let shapes: [WidgetFaceShape]
    private let color: Color

    public init(type: String, category: String, color: Color) {
        shapes = WidgetFaces.shapes(type: type, category: category)
        self.color = color
    }

    public var body: some View {
        Canvas { context, size in
            let box = WidgetFaces.viewBox
            let scale = min(size.width / box.width, size.height / box.height)
            guard scale > 0 else { return }
            let offset = CGPoint(x: (size.width - box.width * scale) / 2, y: (size.height - box.height * scale) / 2)
            let fit = CGAffineTransform(translationX: offset.x, y: offset.y).scaledBy(x: scale, y: scale)
            for shape in shapes {
                let path = WidgetFaces.path(for: shape).applying(fit)
                let ink = color.opacity(shape.opacity)
                if shape.fills { context.fill(path, with: .color(ink)) }
                if shape.strokes {
                    context.stroke(path, with: .color(ink), style: StrokeStyle(lineWidth: shape.strokeWidth * scale, lineCap: .round, lineJoin: .round, dash: shape.dash.map { $0 * scale }))
                }
            }
        }
        .accessibilityHidden(true)
    }
}
