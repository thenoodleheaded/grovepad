#if canImport(QuartzCore)
import Foundation
import QuartzCore
import CoreGraphics
import GrovepadCore

// ---------------------------------------------------------------------------
// The ambient aura behind the board. Port of
// `components/canvas/CanvasAuraLayer.tsx` + `auraTuning.ts`: every on-screen
// widget pools its own accent onto the canvas as a soft elliptical glow sized
// from its footprint, so a board reads as lit by its cards.
//
// Unlike the web it never repaints a buffer. Every pool is its own sublayer
// showing one small pre-rendered falloff image (cached per colour), stretched
// to the pool's ellipse. Moving a card, panning or zooming only sets a dozen
// sublayer frames — compositor work, no drawing — so the glow follows a
// dragged card every frame and nothing is ever missing at the viewport edge.
//
// Two deliberate differences from the web:
// - No buffer blur. The web adds a 10 px canvas blur; the five-stop falloff
//   upscaled from the low-resolution buffer is already soft, and a Core
//   Image pass per camera frame is not worth it.
// - Light theme multiplies without a blend mode. The web multiplies the
//   layer onto the paper; multiply over a constant ground is linear in the
//   source colour, so painting each pool pre-multiplied by the ground
//   (`ground × accent`) with ordinary compositing is the same picture and
//   works on iOS, where layer compositing filters do not.
// ---------------------------------------------------------------------------

/// Every knob the aura reads, per theme (`AuraThemeTuning`).
public struct AuraTuning: Equatable, Sendable {
    public var alpha: Double
    public var coreAlpha: Double
    public var reach: Double
    public var scatter: Double
    public var minRadius: Double
    public var maxRadius: Double
    public var maxEmitters: Int

    public static let dark = AuraTuning(alpha: 0.855, coreAlpha: 0.22, reach: 1.86, scatter: 1.5, minRadius: 0.1189, maxRadius: 0.5, maxEmitters: 13)
    /// Paper needs far more pigment than black needs light, so the light
    /// pools are denser and reach as far as the dark ones.
    public static let light = AuraTuning(alpha: 1, coreAlpha: 0.62, reach: 1.86, scatter: 1.2, minRadius: 0.1189, maxRadius: 0.5, maxEmitters: 13)
}

/// How much aura a visual quality tier may paint (`AURA_QUALITY_BUDGET`).
public struct AuraBudget: Equatable, Sendable {
    public var render: Bool
    public var emitters: Double
    public var alpha: Double
    public var buffer: Double

    public static let high = AuraBudget(render: true, emitters: 1, alpha: 1, buffer: 1)
    public static let balanced = AuraBudget(render: true, emitters: 0.5, alpha: 0.85, buffer: 0.7)
    /// The lightest tier paints nothing at all.
    public static let low = AuraBudget(render: false, emitters: 0, alpha: 0, buffer: 0.1)

    /// `auraTuningForQuality`.
    public func applied(to tuning: AuraTuning) -> AuraTuning {
        guard emitters != 1 || alpha != 1 else { return tuning }
        var next = tuning
        next.maxEmitters = max(1, Int((Double(tuning.maxEmitters) * emitters).rounded()))
        next.alpha = tuning.alpha * alpha
        return next
    }
}

/// One widget that glows: its displayed world rect and worn accent.
public struct AuraEmitter: Equatable, Sendable {
    public var id: String
    public var rect: WorldRect
    public var accent: String

    public init(id: String, rect: WorldRect, accent: String) {
        self.id = id
        self.rect = rect
        self.accent = accent
    }
}

public enum AuraGeometry {
    public struct Pool: Equatable, Sendable {
        /// Soft extension beyond every side of the widget, in screen points.
        public var halo: Double
        /// Full elliptical radii, including half the widget footprint.
        public var radiusX: Double
        public var radiusY: Double
    }

    /// `auraScreenPool`: sized with the zoom, so glows shrink with their cards.
    public static func screenPool(width: Double, height: Double, zoom: Double, viewport: CGSize, tuning: AuraTuning) -> Pool {
        guard width >= 0, height >= 0, zoom > 0, viewport.width > 0, viewport.height > 0 else {
            return Pool(halo: 0, radiusX: 0, radiusY: 0)
        }
        let edge = Double(min(viewport.width, viewport.height))
        let worldHalo = max(edge * tuning.minRadius, (width * height).squareRoot() * 0.45 * tuning.reach)
        let halo = min(worldHalo * zoom * (1 + tuning.scatter), edge * tuning.maxRadius * zoom)
        return Pool(halo: halo, radiusX: width * zoom / 2 + halo, radiusY: height * zoom / 2 + halo)
    }

    /// `auraBufferSize` as a scale: enough pixels for a smooth gradient, never
    /// a full-resolution bitmap per camera frame.
    public static func bufferScale(viewport: CGSize, quality: Double) -> Double {
        let longest = Double(max(viewport.width, viewport.height))
        guard longest > 0 else { return 0 }
        return min(0.65, 560 / longest) * min(1, max(0.1, quality))
    }
}

public final class AuraLayer: CALayer {
    /// The five-stop falloff, as shares of `alpha × coreAlpha`.
    static let falloff: [(location: CGFloat, share: Double)] = [(0, 1), (0.25, 0.6), (0.55, 0.25), (0.8, 0.08), (1, 0)]
    /// Side of a falloff image in pixels. The gradient is smooth enough that
    /// linear upsampling of this many pixels reads the same as a full paint.
    static let imageSide = 96

    public var isDark = true { didSet { if isDark != oldValue { images.removeAll(); restyle() } } }
    /// The canvas colour under the aura (the light theme multiplies onto it).
    public var ground = CGColor(srgbRed: 244 / 255, green: 245 / 255, blue: 246 / 255, alpha: 1) { didSet { if !isDark { images.removeAll(); layoutPools() } } }
    /// The user's Ambient glow switch.
    public var isEnabled = true { didSet { if isEnabled != oldValue { restyle() } } }
    public var budget = AuraBudget.high { didSet { if budget != oldValue { images.removeAll(); restyle() } } }
    /// Glued members always rank into the emitter set, so a cluster still pools.
    public var gluedIds: Set<String> = [] { didSet { if gluedIds != oldValue { layoutPools() } } }
    public private(set) var emitters: [AuraEmitter] = []
    private var emitterIndex: [String: Int] = [:]
    /// Layouts so far, and how many pools the last one placed (test seam).
    public private(set) var layoutCount = 0
    public private(set) var paintedCount = 0

    private var frame_ = CameraFrame(pan: .zero, zoom: 1)
    /// The camera the pools were placed for (the grid's reveal mask reads it).
    var cameraFrame: CameraFrame { frame_ }
    /// The grid's reveal mask: laid out with the same pools.
    weak var reveal: GridRevealLayer? { didSet { reveal?.aura = self; layoutPools() } }
    private var viewport = CGSize.zero
    private var colorCache: [String: [CGFloat]] = [:]
    /// One falloff image per accent (per theme, ground and budget).
    private var images: [String: CGImage] = [:]
    /// The pool sublayers, by emitter id.
    private var pools: [String: CALayer] = [:]

    public override init() {
        super.init()
        anchorPoint = .zero
        position = .zero
        actions = ["position": NSNull(), "bounds": NSNull(), "sublayers": NSNull(), "hidden": NSNull(), "opacity": NSNull(), "transform": NSNull()]
        restyle()
    }

    public override init(layer: Any) {
        super.init(layer: layer)
        if let other = layer as? AuraLayer {
            isDark = other.isDark
            ground = other.ground
            isEnabled = other.isEnabled
            budget = other.budget
            gluedIds = other.gluedIds
            emitters = other.emitters
            frame_ = other.frame_
            viewport = other.viewport
        }
    }

    public required init?(coder: NSCoder) {
        nil
    }

    public var paints: Bool { isEnabled && budget.render }

    public var tuning: AuraTuning { budget.applied(to: isDark ? .dark : .light) }

    private func restyle() {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        isHidden = !paints
        // The web's layer opacity per theme (0.85 on glass, 0.62 on paper).
        opacity = isDark ? 0.85 : 0.62
        CATransaction.commit()
        layoutPools()
    }

    /// A card opened or closed: its pool (and the grid revealed through it)
    /// grows or shrinks with it instead of jumping.
    public func setEmitters(_ next: [AuraEmitter], transition: LayerTransition? = nil) {
        guard next != emitters else { return }
        emitters = next
        emitterIndex = Dictionary(next.enumerated().map { ($1.id, $0) }, uniquingKeysWith: { first, _ in first })
        layoutPools(transition: transition)
    }

    /// A drag frame: these emitters moved. Only frames change.
    public func moveEmitters(_ rects: [String: WorldRect]) {
        var changed = false
        for (id, rect) in rects {
            guard let index = emitterIndex[id], emitters[index].rect != rect else { continue }
            emitters[index].rect = rect
            changed = true
        }
        if changed { layoutPools() }
    }

    /// The camera moved or the viewport changed size.
    public func update(frame: CameraFrame, viewport: CGSize) {
        guard frame != frame_ || viewport != self.viewport else { return }
        frame_ = frame
        self.viewport = viewport
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        bounds = CGRect(origin: .zero, size: viewport)
        CATransaction.commit()
        layoutPools()
    }

    /// The pools to paint this frame, strongest first (`CanvasAuraLayer`'s
    /// cull and rank: glued first, then larger on screen, then id).
    func visiblePools() -> [(emitter: AuraEmitter, pool: AuraGeometry.Pool)] {
        let tuning = tuning
        let zoom = frame_.zoom
        guard zoom > 0, viewport.width > 0, viewport.height > 0 else { return [] }
        var onScreen: [(emitter: AuraEmitter, pool: AuraGeometry.Pool, area: Double, glued: Bool)] = []
        for emitter in emitters {
            let rect = emitter.rect
            let pool = AuraGeometry.screenPool(width: rect.width, height: rect.height, zoom: zoom, viewport: viewport, tuning: tuning)
            let x = rect.x * zoom + frame_.pan.x, y = rect.y * zoom + frame_.pan.y
            let w = rect.width * zoom, h = rect.height * zoom
            if x + w + pool.halo < 0 || x - pool.halo > Double(viewport.width) || y + h + pool.halo < 0 || y - pool.halo > Double(viewport.height) { continue }
            onScreen.append((emitter, pool, w * h, gluedIds.contains(emitter.id)))
        }
        onScreen.sort { a, b in
            if a.glued != b.glued { return a.glued }
            if a.area != b.area { return a.area > b.area }
            return a.emitter.id < b.emitter.id
        }
        return onScreen.prefix(tuning.maxEmitters).map { ($0.emitter, $0.pool) }
    }

    /// Each pool's ellipse in viewport points.
    func poolRects() -> [(emitter: AuraEmitter, rect: CGRect)] {
        visiblePools().compactMap { emitter, pool in
            guard pool.radiusX > 0, pool.radiusY > 0 else { return nil }
            let rect = emitter.rect
            let cx = (rect.x + rect.width / 2) * frame_.zoom + frame_.pan.x
            let cy = (rect.y + rect.height / 2) * frame_.zoom + frame_.pan.y
            return (emitter, CGRect(x: cx - pool.radiusX, y: cy - pool.radiusY, width: pool.radiusX * 2, height: pool.radiusY * 2))
        }
    }

    /// Place every pool where its card now is. Frames only; images are
    /// rendered once per colour.
    func layoutPools(transition: LayerTransition? = nil) {
        layoutCount += 1
        guard budget.render else {
            place([], in: self, pool: &pools, image: { _ in nil })
            paintedCount = 0
            reveal?.layout([])
            return
        }
        let rects = poolRects()
        if paints {
            place(rects, in: self, pool: &pools, transition: transition) { [unowned self] emitter in self.image(for: emitter.accent) }
            paintedCount = rects.count
        } else {
            place([], in: self, pool: &pools, image: { _ in nil })
            paintedCount = 0
        }
        reveal?.layout(rects, transition: transition)
    }

    private func components(_ hex: String) -> [CGFloat] {
        if let hit = colorCache[hex] { return hit }
        let color = CGColor.fromHex(hex).converted(to: CGColorSpace(name: CGColorSpace.sRGB)!, intent: .defaultIntent, options: nil)
        // The web's fallback for an accent it cannot read: rgb(180 200 220).
        let fallback: [CGFloat] = [180 / 255, 200 / 255, 220 / 255]
        let parts = color?.components ?? fallback
        let rgb = parts.count >= 3 ? Array(parts.prefix(3)) : fallback
        colorCache[hex] = rgb
        return rgb
    }

    /// The falloff for one accent, pre-multiplied by the paper in the light
    /// theme (multiply over a constant ground, without a blend mode).
    private func image(for accent: String) -> CGImage? {
        if let hit = images[accent] { return hit }
        guard let space = CGColorSpace(name: CGColorSpace.sRGB) else { return nil }
        var rgb = components(accent)
        if !isDark { rgb = AuraLayer.paperPigment(rgb) }
        if !isDark, let ground = ground.converted(to: space, intent: .defaultIntent, options: nil)?.components, ground.count >= 3 {
            rgb = zip(rgb, ground.prefix(3)).map { $0 * $1 }
        }
        let peak = tuning.alpha * tuning.coreAlpha
        let stops = AuraLayer.falloff.map { (location: $0.location, color: CGColor(colorSpace: space, components: rgb + [CGFloat(peak * $0.share)])!) }
        let image = AuraLayer.radialImage(stops)
        images[accent] = image
        return image
    }

    /// `paperPigment`: the pigment a pool lays on paper. Accents are chosen to
    /// glow on black, so most are pale and multiply to nothing on white. Keeps
    /// the hue, caps lightness at 0.44 and holds saturation between 0.5 and 0.62; greys
    /// (chroma under 0.08) and anything malformed pass through.
    static func paperPigment(_ rgb: [CGFloat]) -> [CGFloat] {
        guard rgb.count == 3 else { return rgb }
        let r = Double(rgb[0]), g = Double(rgb[1]), b = Double(rgb[2])
        let hi = max(r, g, b), lo = min(r, g, b), delta = hi - lo
        guard delta >= 0.08 else { return rgb }
        var hue: Double
        if hi == r { hue = ((g - b) / delta).truncatingRemainder(dividingBy: 6) }
        else if hi == g { hue = (b - r) / delta + 2 }
        else { hue = (r - g) / delta + 4 }
        hue = (hue * 60 + 360).truncatingRemainder(dividingBy: 360)
        let lightness = min((hi + lo) / 2, 0.44)
        let saturation = min(max(delta / (1 - abs(hi + lo - 1)), 0.5), 0.62)
        let chroma = (1 - abs(2 * lightness - 1)) * saturation
        let x = chroma * (1 - abs((hue / 60).truncatingRemainder(dividingBy: 2) - 1))
        let m = lightness - chroma / 2
        let parts: [Double]
        switch hue {
        case ..<60: parts = [chroma, x, 0]
        case ..<120: parts = [x, chroma, 0]
        case ..<180: parts = [0, chroma, x]
        case ..<240: parts = [0, x, chroma]
        case ..<300: parts = [x, 0, chroma]
        default: parts = [chroma, 0, x]
        }
        // The web rounds to whole 0–255 channels; match it byte for byte.
        return parts.map { CGFloat(jsRound(($0 + m) * 255) / 255) }
    }

    /// A circle of `stops` from the centre to the rim, in a square bitmap.
    static func radialImage(_ stops: [(location: CGFloat, color: CGColor)]) -> CGImage? {
        let side = imageSide
        guard let space = CGColorSpace(name: CGColorSpace.sRGB),
              let context = CGContext(data: nil, width: side, height: side, bitsPerComponent: 8, bytesPerRow: 0, space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue),
              let gradient = CGGradient(colorsSpace: space, colors: stops.map(\.color) as CFArray, locations: stops.map(\.location)) else { return nil }
        let centre = CGPoint(x: Double(side) / 2, y: Double(side) / 2)
        context.drawRadialGradient(gradient, startCenter: centre, startRadius: 0, endCenter: centre, endRadius: CGFloat(side) / 2, options: [])
        return context.makeImage()
    }
}

/// A glide for geometry that follows a card opening or closing: the lines,
/// the glow and the focus blur move on the card's own curve and length, so
/// nothing around a card jumps while the card itself grows.
public struct LayerTransition: Sendable {
    public var duration: Double
    public var controlPoints: (Float, Float, Float, Float)

    public init(duration: Double, controlPoints: (Float, Float, Float, Float)) {
        self.duration = duration
        self.controlPoints = controlPoints
    }

    var timing: CAMediaTimingFunction {
        CAMediaTimingFunction(controlPoints: controlPoints.0, controlPoints.1, controlPoints.2, controlPoints.3)
    }

    /// Animate `keyPath` from what is on screen now to the model value
    /// already set on `layer`.
    func animate(_ layer: CALayer, _ keyPath: String, from: Any?) {
        guard let from else { return }
        let animation = CABasicAnimation(keyPath: keyPath)
        animation.fromValue = from
        animation.toValue = layer.value(forKeyPath: keyPath)
        animation.duration = duration
        animation.timingFunction = timing
        layer.add(animation, forKey: "gp.transition.\(keyPath)")
    }

    /// Move `layer` to `frame`, gliding from where it is drawn now.
    func setFrame(_ layer: CALayer, _ frame: CGRect) {
        let shown = layer.presentation() ?? layer
        let fromPosition = NSValue(point: shown.position), fromBounds = NSValue(rect: shown.bounds)
        layer.frame = frame
        animate(layer, "position", from: fromPosition)
        animate(layer, "bounds", from: fromBounds)
    }
}

#if os(macOS)
import AppKit
#else
import UIKit
extension NSValue {
    convenience init(point: CGPoint) { self.init(cgPoint: point) }
    convenience init(rect: CGRect) { self.init(cgRect: rect) }
}
#endif

/// Lay `rects` out as sublayers of `parent`, reusing one layer per emitter
/// id; layers for emitters no longer placed leave. With a `transition`, a
/// pool that is already showing glides to its new ellipse.
func place(_ rects: [(emitter: AuraEmitter, rect: CGRect)], in parent: CALayer, pool: inout [String: CALayer], transition: LayerTransition? = nil, image: (AuraEmitter) -> CGImage?) {
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    defer { CATransaction.commit() }
    var seen = Set<String>()
    for (emitter, rect) in rects {
        seen.insert(emitter.id)
        let layer: CALayer
        if let existing = pool[emitter.id] {
            layer = existing
        } else {
            layer = CALayer()
            layer.actions = ["position": NSNull(), "bounds": NSNull(), "contents": NSNull(), "hidden": NSNull()]
            layer.magnificationFilter = .linear
            parent.addSublayer(layer)
            pool[emitter.id] = layer
        }
        let contents = image(emitter)
        if (layer.contents as AnyObject?) !== (contents as AnyObject?) { layer.contents = contents }
        if layer.frame != rect {
            if let transition, !layer.frame.isEmpty { transition.setFrame(layer, rect) } else { layer.frame = rect }
        }
    }
    for (id, layer) in pool where !seen.contains(id) {
        layer.removeFromSuperlayer()
        pool[id] = nil
    }
}
#endif
