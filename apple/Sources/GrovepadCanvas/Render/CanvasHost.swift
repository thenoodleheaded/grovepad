#if canImport(QuartzCore)
import Foundation
import QuartzCore
import CoreGraphics
import CoreText
import GrovepadCore
#if canImport(CoreImage)
import CoreImage
#endif

// ---------------------------------------------------------------------------
// The Core Animation world (roadmap decision 4).
//
// One host layer holds one world layer. Pan and zoom set ONE transform on
// that world layer and nothing else. Inside it:
//
// - a `CardLayer` per resting card, whose `contents` is a cached bitmap the
//   chrome renders from the card's body, again on a data version change and,
//   after the camera rests, at a sharper scale when zoomed in;
// - live cards, mounted as real views by whoever implements `LiveCardHost`
//   (the Chrome layer) — the canvas never sees a view;
// - the `EdgeLayer`.
//
// The `CanvasHostController` wires a CameraEngine and a ResidencyController
// to the host layer and applies board, selection and hover changes.
//
// No zoom or pan level of detail (owner's decision, 18 Sep 2026): every card
// on the active canvas keeps its resting tile at every zoom and through every
// pan — no far-tier placeholder boxes, no culling window, no grid bitmap
// scaled mid-motion.
// ---------------------------------------------------------------------------

/// Supplies the resting bitmap for a card. Implemented by the chrome layer,
/// which knows how to render a widget body.
public protocol RestingBitmapProvider: AnyObject {
    /// Changes whenever the card would draw differently; a stable value keeps
    /// the cached bitmap.
    func dataVersion(for widget: Widget) -> Int
    /// The bitmap for `widget` drawn at `size` world units, `scale` pixels per
    /// world unit. Nil leaves the previous bitmap (or a tinted block) in place.
    func restingBitmap(for widget: Widget, size: Size, scale: CGFloat) -> CGImage?
    /// The card has left the canvas (deleted, or another canvas is shown),
    /// so anything held for it may go. A provider that keeps no cache
    /// ignores this.
    func releaseBitmap(for id: String)
}

public extension RestingBitmapProvider {
    func releaseBitmap(for id: String) {}
}

/// Mounts and unmounts the real views of live cards inside the world layer.
public protocol LiveCardHost: AnyObject {
    func mountLiveCard(_ widget: Widget, frame: WorldRect, in worldLayer: CALayer)
    func updateLiveCard(_ widget: Widget, frame: WorldRect)
    func unmountLiveCard(id: String)
    /// Mount opening out of a resting tile at `tile` (the web's expand glide);
    /// nil opens in place.
    func mountLiveCard(_ widget: Widget, frame: WorldRect, in worldLayer: CALayer, openingFrom tile: WorldRect?)
    /// A frame refresh that glides (a drop settling onto the grid).
    func updateLiveCard(_ widget: Widget, frame: WorldRect, animated: Bool)
    /// A drag frame: move only, the content has not changed.
    func moveLiveCard(_ widget: Widget, frame: WorldRect)
    /// Leave, fading out when `animated` (the card closing back to its tile).
    func unmountLiveCard(id: String, animated: Bool)
    /// Leave by shrinking into the resting tile at `tile` (world units),
    /// wherever the open card sits relative to it.
    func unmountLiveCard(id: String, animated: Bool, closingInto tile: WorldRect?)
}

public extension LiveCardHost {
    func mountLiveCard(_ widget: Widget, frame: WorldRect, in worldLayer: CALayer, openingFrom tile: WorldRect?) {
        mountLiveCard(widget, frame: frame, in: worldLayer)
    }
    func updateLiveCard(_ widget: Widget, frame: WorldRect, animated: Bool) { updateLiveCard(widget, frame: frame) }
    func moveLiveCard(_ widget: Widget, frame: WorldRect) { updateLiveCard(widget, frame: frame) }
    func unmountLiveCard(id: String, animated: Bool) { unmountLiveCard(id: id) }
    func unmountLiveCard(id: String, animated: Bool, closingInto tile: WorldRect?) { unmountLiveCard(id: id, animated: animated) }
}

/// The card motion tokens of `index.css`: `--gp-motion-layout` (300 ms, run 30 % faster here: 210 ms) on
/// `--gp-ease-layout`, `--gp-motion-fast` (150 ms) on `--gp-ease-out`, the
/// hover lift (`scale: 1.010; translate: 0 -1px`) and the magnetic lean of
/// `widgetMagnetism.ts` (x = nx·3, y = ny·2 − 1, n in −1…1 from the centre).
public enum CardMotion {
    public static let layoutDuration = 0.21
    public static let fastDuration = 0.15
    /// Closing and the tile's return: short, so a close never lingers.
    public static let closeDuration = 0.098
    /// Opening a card out of its tile and closing it back: one ease of this
    /// length (`WidgetCardView.openAnimation`), fastest on its first frame.
    public static let openDuration = 0.21
    /// Slack after `openDuration` before a closing card's view may go.
    public static let openSettleSlack = 0.04
    /// The body's own fade: in from the first frame of the glide, out at once.
    public static let contentInDuration = 0.098
    public static let contentInDelay = 0.0
    public static let contentOutDuration = 0.049
    public static let layoutControlPoints: (Float, Float, Float, Float) = (0.22, 1, 0.36, 1)
    public static let outControlPoints: (Float, Float, Float, Float) = (0.16, 1, 0.3, 1)
    public static let hoverScale = 1.01
    public static let hoverRise = 1.0
    /// Card drag threshold in screen points (`DRAG_THRESHOLD`, `pointerDrag.ts`).
    public static let dragThreshold = 3.0

    public static var layoutEase: CAMediaTimingFunction {
        CAMediaTimingFunction(controlPoints: layoutControlPoints.0, layoutControlPoints.1, layoutControlPoints.2, layoutControlPoints.3)
    }
    public static var outEase: CAMediaTimingFunction {
        CAMediaTimingFunction(controlPoints: outControlPoints.0, outControlPoints.1, outControlPoints.2, outControlPoints.3)
    }

    /// `magneticOffset`: the lean toward a pointer at (nx, ny), each clamped.
    public static func lean(nx: Double, ny: Double) -> CGSize {
        let x = max(-1, min(1, nx))
        let y = max(-1, min(1, ny))
        return CGSize(width: x * 3, height: y * 2 - hoverRise)
    }
}

/// The soft shadow every card casts on the board: wide and faint, so a card
/// reads as lifted off the ground without a hard dark rim. One value for the
/// resting tile (a Core Animation shadow) and the live card (SwiftUI reads the
/// same numbers), so a card never changes weight as it crosses a tier.
public enum CardShadow {
    public static let radius: Double = 18
    public static let offsetY: Double = 8
    /// Under the pointer (`0 10px 30px` on the web): wider and lower.
    public static let liftedRadius: Double = 22
    public static let liftedOffsetY: Double = 12
    /// Core Animation casts a layer's shadow in the platform's base
    /// coordinates, which a flipped world does not flip: on the Mac a
    /// positive offset threw the shadow UP, where it read as a dark ghost
    /// card behind the tile. This turns "down the screen" into CA's sign.
    public static var caSign: Double {
        #if os(macOS)
        return -1
        #else
        return 1
        #endif
    }

    /// The shadow's silhouette: the card's outline with its middle cut away,
    /// so a frosted tile never shows its own shadow through the glass (CSS
    /// box shadows are never painted under their box either).
    public static func silhouette(_ bounds: CGRect, radius: CGFloat) -> CGPath {
        let path = CGMutablePath()
        path.addRoundedRect(in: bounds, cornerWidth: radius, cornerHeight: radius)
        let inset = min(bounds.width, bounds.height) * 0.5 > 26 ? 24.0 : 0
        guard inset > 0 else { return path }
        let inner = bounds.insetBy(dx: inset, dy: inset)
        // Mirrored, the inner outline winds the other way: a hole.
        var mirror = CGAffineTransform(translationX: inner.midX, y: 0).scaledBy(x: -1, y: 1).translatedBy(x: -inner.midX, y: 0)
        path.addPath(CGPath(roundedRect: inner, cornerWidth: max(0, radius - inset / 2), cornerHeight: max(0, radius - inset / 2), transform: &mirror))
        return path
    }
    /// Opacity of the shadow colour at rest and under the pointer.
    public static func opacity(dark: Bool, lifted: Bool = false) -> Float {
        dark ? (lifted ? 0.5 : 0.36) : (lifted ? 0.17 : 0.11)
    }
    /// Black on the dark ground; a green-grey ink on paper, which reads as a
    /// shadow rather than a smudge.
    public static func color(dark: Bool) -> CGColor {
        dark ? CGColor(srgbRed: 0, green: 0, blue: 0, alpha: 1) : CGColor(srgbRed: 30 / 255, green: 40 / 255, blue: 34 / 255, alpha: 1)
    }
}

/// One resting card: position/bounds from the widget frame, contents a bitmap.
public final class CardLayer: CALayer {
    public let widgetId: String
    public internal(set) var dataVersion: Int?
    /// Pixels per world unit the current bitmap was rendered at.
    public internal(set) var renderedScale: CGFloat?
    /// Whether the pointer is over this card (a deeper shadow).
    public private(set) var isLifted = false
    /// The magnetic lean toward the pointer, nil when not hovered.
    public private(set) var lean: CGSize?
    /// The selection ring, the tile's own so it leans and lifts with it.
    let ringLayer = CAShapeLayer()
    let ringBorderLayer = CAShapeLayer()
    public var isSelectedRing: Bool { !ringLayer.isHidden }
    /// The light a tile takes under the pointer: its border in the accent
    /// with a soft glow. The tile's picture is never touched by a hover.
    let hoverLightLayer = CAShapeLayer()
    public private(set) var isLit = false

    init(widgetId: String) {
        self.widgetId = widgetId
        super.init()
        anchorPoint = .zero
        contentsGravity = .resize
        // Far out a tile is drawn many times smaller than its bitmap:
        // mipmapped filtering keeps it a clean miniature instead of a
        // shimmering one.
        minificationFilter = .trilinear
        // The accent block a card wears until its tile arrives is a card, not
        // a square: the same rounded silhouette as the tile.
        cornerRadius = CGFloat(CanvasHostLayer.cardCornerRadius)
        actions = ["position": NSNull(), "bounds": NSNull(), "contents": NSNull(), "backgroundColor": NSNull(), "hidden": NSNull(), "cornerRadius": NSNull(), "shadowPath": NSNull(), "shadowColor": NSNull(), "transform": NSNull(), "shadowOpacity": NSNull(), "shadowRadius": NSNull(), "shadowOffset": NSNull(), "opacity": NSNull(), "zPosition": NSNull()]
        shadowRadius = CGFloat(CardShadow.radius)
        shadowOffset = CGSize(width: 0, height: CardShadow.offsetY * CardShadow.caSign)
        applyShadow(dark: true, lifted: false)
        for ring in [ringLayer, ringBorderLayer] {
            ring.fillColor = nil
            ring.isHidden = true
            ring.actions = ["path": NSNull(), "hidden": NSNull(), "strokeColor": NSNull(), "shadowColor": NSNull(), "position": NSNull(), "bounds": NSNull()]
            addSublayer(ring)
        }
        hoverLightLayer.fillColor = nil
        hoverLightLayer.lineWidth = 1
        hoverLightLayer.opacity = 0
        hoverLightLayer.shadowOffset = .zero
        hoverLightLayer.shadowRadius = 10
        hoverLightLayer.shadowOpacity = 1
        hoverLightLayer.actions = ["path": NSNull(), "opacity": NSNull(), "strokeColor": NSNull(), "shadowColor": NSNull(), "position": NSNull(), "bounds": NSNull()]
        addSublayer(hoverLightLayer)
        ringLayer.lineWidth = 3
        ringLayer.shadowOffset = .zero
        ringLayer.shadowRadius = 15
        ringLayer.shadowOpacity = 1
        ringBorderLayer.lineWidth = 1
        // No backdrop blur on tiles: a Core Image background filter per tile
        // re-ran every frame under the moving camera, cost the canvas its
        // frame rate, and Core Animation dropped filtered layers outright
        // mid-zoom (tiles vanished, leaving only their aura). The tile's own
        // near-opaque glass face carries the look instead.
    }

    /// The web's selected card: a 3 pt ring of the accent at 30 % just
    /// outside the box with a 30 pt glow at 24 %, and an accent border.
    func setSelected(_ selected: Bool, accent: CGColor) {
        ringLayer.isHidden = !selected
        ringBorderLayer.isHidden = !selected
        guard selected else { return }
        ringLayer.strokeColor = accent.copy(alpha: 0.3)
        ringLayer.shadowColor = accent.copy(alpha: 0.24)
        ringBorderLayer.strokeColor = accent.copy(alpha: 0.75)
        layoutRing()
    }

    /// Light the tile up (or let it go dark) over `--gp-motion-fast`.
    func setLit(_ lit: Bool, accent: CGColor, animated: Bool) {
        guard lit != isLit else { return }
        isLit = lit
        if lit {
            hoverLightLayer.strokeColor = accent.copy(alpha: 0.55)
            hoverLightLayer.shadowColor = accent.copy(alpha: 0.4)
            layoutLight()
        }
        let target: Float = lit ? 1 : 0
        if animated {
            let animation = CABasicAnimation(keyPath: "opacity")
            animation.fromValue = hoverLightLayer.presentation()?.opacity ?? hoverLightLayer.opacity
            animation.toValue = target
            animation.duration = CardMotion.fastDuration
            animation.timingFunction = CardMotion.outEase
            hoverLightLayer.add(animation, forKey: "gp.light")
        }
        hoverLightLayer.opacity = target
    }

    /// Set `keyPath` on a ring/light layer, gliding from where it is drawn now
    /// when the card's own box is gliding (the paths have no implicit
    /// animation, so without this the ring jumped to the new size at once and
    /// stood detached from the tile while it grew or shrank).
    private func setPath(_ layer: CAShapeLayer, _ keyPath: String, _ value: CGPath, animated: Bool) {
        if animated {
            let animation = CABasicAnimation(keyPath: keyPath)
            animation.fromValue = layer.presentation()?.value(forKeyPath: keyPath) ?? layer.value(forKeyPath: keyPath)
            animation.toValue = value
            animation.duration = CardMotion.layoutDuration
            animation.timingFunction = CardMotion.layoutEase
            layer.add(animation, forKey: "gp.\(keyPath)")
        }
        layer.setValue(value, forKeyPath: keyPath)
    }

    private func layoutLight(animated: Bool = false) {
        let radius = cornerRadius
        let path = CGPath(roundedRect: bounds.insetBy(dx: 0.5, dy: 0.5), cornerWidth: max(0, radius - 0.5), cornerHeight: max(0, radius - 0.5), transform: nil)
        setPath(hoverLightLayer, "path", path, animated: animated)
        // The glow's shape given up front: without it Core Animation renders
        // the stroke offscreen every frame just to find its silhouette.
        setPath(hoverLightLayer, "shadowPath", path.copy(strokingWithWidth: hoverLightLayer.lineWidth, lineCap: .butt, lineJoin: .round, miterLimit: 1), animated: animated)
    }

    private func layoutRing(animated: Bool = false) {
        if isLit { layoutLight(animated: animated) }
        guard !ringLayer.isHidden else { return }
        let radius = cornerRadius
        let ring = CGPath(roundedRect: bounds.insetBy(dx: -1.5, dy: -1.5), cornerWidth: radius + 1.5, cornerHeight: radius + 1.5, transform: nil)
        setPath(ringLayer, "path", ring, animated: animated)
        setPath(ringLayer, "shadowPath", ring.copy(strokingWithWidth: ringLayer.lineWidth, lineCap: .butt, lineJoin: .round, miterLimit: 1), animated: animated)
        setPath(ringBorderLayer, "path", CGPath(roundedRect: bounds.insetBy(dx: 0.5, dy: 0.5), cornerWidth: max(0, radius - 0.5), cornerHeight: max(0, radius - 0.5), transform: nil), animated: animated)
    }

    /// Theme and hover in, shadow out. The opacity eases (the only animated
    /// property here), so a hover reads as a lift, not a flicker.
    func applyShadow(dark: Bool, lifted: Bool, animated: Bool = false) {
        let changed = lifted != isLifted
        isLifted = lifted
        shadowColor = CardShadow.color(dark: dark)
        let opacity = CardShadow.opacity(dark: dark, lifted: lifted)
        let radius = CGFloat(lifted ? CardShadow.liftedRadius : CardShadow.radius)
        let offset = CGSize(width: 0, height: (lifted ? CardShadow.liftedOffsetY : CardShadow.offsetY) * CardShadow.caSign)
        if animated, changed {
            ease("shadowOpacity", to: opacity, duration: CardMotion.fastDuration, timing: CardMotion.outEase)
            ease("shadowRadius", to: radius, duration: CardMotion.fastDuration, timing: CardMotion.outEase)
            ease("shadowOffset", to: offset, duration: CardMotion.fastDuration, timing: CardMotion.outEase)
        }
        shadowOpacity = opacity
        shadowRadius = radius
        shadowOffset = offset
        // A lifted card rides above its neighbours (the web's hover z-index).
        zPosition = lifted ? 1 : 0
        if !lifted, lean != nil { setLean(nil, animated: animated) }
    }

    /// Hover: the magnetic lean plus the 1 % lift, about the card's centre.
    /// Each pointer move retargets from where the card is on screen, which
    /// is the web's per-frame exponential follow in Core Animation terms.
    /// The rubber band of a scale drag (`paintElastic`): the tile stretches
    /// per axis about the sides the drag leaves pinned (`pinned` is each
    /// axis's fixed point as a fraction of the box), never past the web's
    /// 0.78–1.22 rails.
    private(set) var elastic: (x: Double, y: Double, pinned: CGPoint)?

    private func elasticTransform(_ x: Double, _ y: Double, pinned: CGPoint) -> CATransform3D {
        let sx = CGFloat(x), sy = CGFloat(y)
        return CATransform3DConcat(
            CATransform3DMakeScale(sx, sy, 1),
            CATransform3DMakeTranslation(bounds.width * pinned.x * (1 - sx), bounds.height * pinned.y * (1 - sy), 0)
        )
    }

    func setElastic(x: Double, y: Double, pinned: CGPoint) {
        let cx = min(1.22, max(0.78, x)), cy = min(1.22, max(0.78, y))
        elastic = (cx, cy, pinned)
        transform = elasticTransform(cx, cy, pinned: pinned)
    }

    /// Let go of the band (`gp-elastic-release`): a stretched tile does not
    /// snap flat, it recoils through a small counter-overshoot over 340 ms,
    /// in proportion to how far it was pulled.
    func releaseElastic(animated: Bool) {
        guard let held = elastic else { return }
        elastic = nil
        guard animated, held.x != 1 || held.y != 1 else { transform = CATransform3DIdentity; return }
        func at(_ k: Double) -> NSValue {
            NSValue(caTransform3D: elasticTransform(1 + (1 - held.x) * k, 1 + (1 - held.y) * k, pinned: held.pinned))
        }
        let animation = CAKeyframeAnimation(keyPath: "transform")
        animation.values = [
            NSValue(caTransform3D: elasticTransform(held.x, held.y, pinned: held.pinned)),
            at(0.34), at(-0.12),
            NSValue(caTransform3D: CATransform3DIdentity),
        ]
        animation.keyTimes = [0, 0.55, 0.8, 1]
        animation.timingFunctions = [CAMediaTimingFunction(controlPoints: 0.33, 0.7, 0.4, 1)]
        animation.duration = 0.34
        add(animation, forKey: "gp.elastic")
        transform = CATransform3DIdentity
    }

    func setLean(_ next: CGSize?, animated: Bool) {
        lean = next
        let target = liftTransform()
        if animated { ease("transform", to: target, duration: CardMotion.fastDuration, timing: CardMotion.outEase) }
        transform = target
    }

    private func liftTransform() -> CATransform3D {
        guard let lean else { return CATransform3DIdentity }
        let scale = CGFloat(CardMotion.hoverScale)
        let w = bounds.width, h = bounds.height
        // anchorPoint is the top-left corner: scale about the centre by
        // shifting half the growth back, then lean.
        let dx = lean.width - w * (scale - 1) / 2
        let dy = lean.height - h * (scale - 1) / 2
        return CATransform3DConcat(CATransform3DMakeScale(scale, scale, 1), CATransform3DMakeTranslation(dx, dy, 0))
    }

    /// One explicit animation from what is on screen now to `value`.
    private func ease(_ keyPath: String, to value: Any, duration: Double, timing: CAMediaTimingFunction) {
        let animation = CABasicAnimation(keyPath: keyPath)
        animation.fromValue = presentation()?.value(forKeyPath: keyPath) ?? self.value(forKeyPath: keyPath)
        animation.toValue = value
        animation.duration = duration
        animation.timingFunction = timing
        add(animation, forKey: "gp.\(keyPath)")
    }

    /// Fade in (a card closing back to its tile).
    /// The tile returns only as the closing card lands on it: the two wear
    /// the same glass, so showing both at once would read as a double pane.
    func fadeIn() {
        let animation = CABasicAnimation(keyPath: "opacity")
        animation.fromValue = 0
        animation.toValue = 1
        animation.beginTime = CACurrentMediaTime() + CardMotion.openDuration * 0.5
        animation.duration = CardMotion.openDuration * 0.5
        animation.fillMode = .backwards
        animation.timingFunction = CardMotion.layoutEase
        add(animation, forKey: "gp.fade")
    }

    override init(layer: Any) {
        widgetId = (layer as? CardLayer)?.widgetId ?? ""
        super.init(layer: layer)
    }

    required init?(coder: NSCoder) {
        nil
    }

    /// `animated` glides from where the card is drawn now (a drop settling
    /// onto the grid) on the layout curve; otherwise the move is immediate.
    func setFrame(_ rect: WorldRect, animated: Bool = false) {
        let nextPosition = CGPoint(x: rect.x, y: rect.y)
        let nextBounds = CGRect(x: 0, y: 0, width: rect.width, height: rect.height)
        if nextPosition == position, nextBounds == bounds { return }
        let radius = CGFloat(min(CanvasHostLayer.cardCornerRadius, rect.width / 2, rect.height / 2))
        // An explicit path keeps the shadow off the offscreen pass: without
        // it Core Animation derives the silhouette from the bitmap's alpha
        // every frame, which a board of tiles cannot afford.
        let path = CardShadow.silhouette(nextBounds, radius: radius)
        if animated {
            ease("position", to: nextPosition, duration: CardMotion.layoutDuration, timing: CardMotion.layoutEase)
            if nextBounds != bounds {
                ease("bounds", to: nextBounds, duration: CardMotion.layoutDuration, timing: CardMotion.layoutEase)
                ease("shadowPath", to: path, duration: CardMotion.layoutDuration, timing: CardMotion.layoutEase)
            }
        }
        position = nextPosition
        bounds = nextBounds
        cornerRadius = radius
        shadowPath = path
        layoutRing(animated: animated)
        if lean != nil { transform = liftTransform() }
    }

    /// A resting tile has transparent corners so the board's ground shows
    /// through them. Once it is in place it paints the whole card, so the
    /// accent placeholder behind it has to go — left on, it fills exactly
    /// the corners the tile deliberately leaves empty.
    func setRestingBitmap(_ image: CGImage, version: Int, scale: CGFloat) {
        contents = image
        dataVersion = version
        renderedScale = scale
        contentsScale = scale
        backgroundColor = nil
    }
}

/// What the group-drag preview shows, in world units.
public struct GlueIntentPaint: Equatable {
    /// Where the dragged card will sit if released now.
    public var slot: WorldRect?
    /// The card it will join.
    public var target: WorldRect?
    /// The dragged card, when a release would take it out of its group.
    public var pulling: WorldRect?
    /// The joined card's accent (hex).
    public var accent: String
    /// The card being dragged: it thins while a slot shows, so the slot
    /// reads through it.
    public var draggedId: String?

    public init(slot: WorldRect? = nil, target: WorldRect? = nil, pulling: WorldRect? = nil, accent: String, draggedId: String? = nil) {
        self.draggedId = draggedId
        self.slot = slot
        self.target = target
        self.pulling = pulling
        self.accent = accent
    }
}

/// The host: `worldLayer` carries the camera transform, everything on the
/// board lives inside it.
public final class CanvasHostLayer: CALayer {
    /// The one card silhouette on this side: the glass backplate radius
    /// (`--gp-r0`), shared by the resting tile and its placeholder so a card
    /// never changes shape. `GlassTokens` lives above this module, so the
    /// number is stated once here.
    public static let cardCornerRadius: Double = 22

    /// The ambient aura, in screen space beneath the grid.
    public let auraLayer = AuraLayer()
    /// The grid, in screen space beneath the world, seen only through
    /// `gridReveal` — the aura's pools — so it shows around the cards and
    /// nowhere else.
    public let gridLayer = GridLayer()
    public let gridReveal = GridRevealLayer()
    public let worldLayer = CALayer()
    public let edgeLayer = EdgeLayer()
    /// Group boundary lines (`.gp-group-line`), in world units beneath the
    /// cards: inside the world layer they move with the camera transform in
    /// the same commit as the cards, never a frame behind.
    public let glueLineLayer = CALayer()
    public private(set) var glueLines: [WorldRect] = []
    private var glueLineDark = true
    /// The ⌘/⌥-drag preview, in world units beneath the cards: the slot the
    /// dragged card will land in, a ring on the card it will join, or a
    /// dashed outline round a card about to leave its group.
    public let glueIntentLayer = CALayer()
    public private(set) var glueIntent: GlueIntentPaint?
    private let intentSlot = CAShapeLayer()
    private let intentRing = CAShapeLayer()
    private let intentPull = CAShapeLayer()
    public private(set) var cardLayers: [String: CardLayer] = [:]
    /// The theme card shadows are cast in; `setCardShadows` repaints them.
    public private(set) var cardShadowDark = true
    /// The card under the pointer, which casts the lifted shadow.
    public private(set) var liftedCardId: String?
    /// `prefers-reduced-motion`: no glides, no lean, no fades.
    public var reducedMotion = false
    public var screenScale: CGFloat = 1 {
        didSet {
            edgeLayer.screenScale = screenScale
            gridLayer.contentsScale = screenScale
            gridLayer.setNeedsDisplay()
        }
    }
    /// The focus blur round an open card: ONE still image of the board round
    /// the card, blurred once when the card opens — strongly at the card,
    /// thinning to nothing `focusReach` away (a variable blur) — and faded
    /// into the live board at its rim. Opening and closing only grow or
    /// shrink its mask and fade it, so a glide costs the compositor nothing.
    /// (Live background-filter rings re-blurred the board on every frame of
    /// every glide, at 120 Hz, and made opening a card stutter.) In world
    /// units, so it moves with the camera like the cards.
    public let focusLayer = CALayer()
    private let focusMask = CALayer()
    public private(set) var focusRect: WorldRect?
    /// The board region the current image covers, and the zoom it was taken at.
    public private(set) var focusRegion: WorldRect?
    private var focusZoom = 0.0
    public static let focusReach = CanvasGeometry.gridSize * 3
    /// Blur radius at the card, in screen points; it thins to 0 at the rim.
    public static let focusBlurRadius = 9.0
    /// Snapshots taken so far (test seam: a glide never takes one).
    public private(set) var focusCaptures = 0
    /// Number of transform writes (test seam).
    public private(set) var transformWrites = 0
    private var cameraFrame: CameraFrame?

    public override init() {
        super.init()
        #if os(macOS)
        // AppKit layers are y-up; the world is y-down like the web.
        isGeometryFlipped = true
        #endif
        actions = ["sublayers": NSNull(), "bounds": NSNull(), "position": NSNull()]
        worldLayer.anchorPoint = .zero
        worldLayer.position = .zero
        worldLayer.bounds = .zero
        worldLayer.actions = ["transform": NSNull(), "sublayers": NSNull()]
        addSublayer(auraLayer)
        addSublayer(gridLayer)
        gridLayer.mask = gridReveal
        auraLayer.reveal = gridReveal
        addSublayer(worldLayer)
        glueLineLayer.anchorPoint = .zero
        glueLineLayer.actions = ["sublayers": NSNull()]
        worldLayer.addSublayer(glueLineLayer)
        glueIntentLayer.anchorPoint = .zero
        glueIntentLayer.actions = ["sublayers": NSNull()]
        for shape in [intentSlot, intentRing, intentPull] {
            shape.actions = ["path": NSNull(), "position": NSNull(), "bounds": NSNull(), "lineWidth": NSNull(), "lineDashPattern": NSNull(), "fillColor": NSNull(), "strokeColor": NSNull(), "hidden": NSNull()]
            shape.fillColor = nil
            shape.isHidden = true
            glueIntentLayer.addSublayer(shape)
        }
        worldLayer.addSublayer(glueIntentLayer)
        worldLayer.addSublayer(edgeLayer)
        focusLayer.anchorPoint = .zero
        focusLayer.opacity = 0
        // Above a lifted (hovered) tile too.
        focusLayer.zPosition = 2
        focusLayer.isHidden = true
        focusLayer.contentsGravity = .resize
        focusLayer.actions = ["position": NSNull(), "bounds": NSNull(), "hidden": NSNull(), "contents": NSNull(), "opacity": NSNull()]
        focusMask.anchorPoint = .zero
        focusMask.actions = ["position": NSNull(), "bounds": NSNull(), "contentsScale": NSNull()]
        focusMask.contents = CanvasHostLayer.featherImage
        let side = Double(CanvasHostLayer.featherSide)
        let centre = Double(CanvasHostLayer.featherSide / 2)
        focusMask.contentsCenter = CGRect(x: centre / side, y: centre / side, width: 1 / side, height: 1 / side)
        // The fade runs the whole reach, card to rim.
        focusMask.contentsScale = CGFloat(centre / CanvasHostLayer.focusReach)
        focusLayer.mask = focusMask
        worldLayer.addSublayer(focusLayer)
        edgeLayer.anchorPoint = .zero
        edgeLayer.position = .zero
        edgeLayer.bounds = .zero
        edgeLayer.actions = ["sublayers": NSNull()]
    }

    public override init(layer: Any) {
        super.init(layer: layer)
    }

    public required init?(coder: NSCoder) {
        nil
    }

    /// Blur the board round an open card (`rect`, the card as drawn), or
    /// lift it (`nil`). With a `transition` the blur grows out of `tile`
    /// (the card's resting tile) as it opens and shrinks back into it as it
    /// closes, fading as it goes. The image is taken only when the card
    /// opens, grows, or the zoom has moved on — never during a glide.
    public func setFocus(_ rect: WorldRect?, tile: WorldRect? = nil, dark: Bool, transition: LayerTransition?) {
        let wasOn = focusRect != nil
        let transition = reducedMotion ? nil : transition
        let reach = CanvasHostLayer.focusReach
        func maskFrame(_ around: WorldRect, in region: WorldRect) -> CGRect {
            CGRect(x: around.x - reach - region.x, y: around.y - reach - region.y, width: around.width + reach * 2, height: around.height + reach * 2)
        }
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        if let rect {
            let region = WorldRect(x: rect.x - reach, y: rect.y - reach, width: rect.width + reach * 2, height: rect.height + reach * 2)
            let zoom = cameraFrame?.zoom ?? 1
            let stale = focusRegion != region || abs(zoom / max(focusZoom, 0.0001) - 1) > 0.15
            if !wasOn || stale {
                // The picture now (cheap, and it must read the layer tree
                // here); the blur on a background queue, landing a few
                // milliseconds into the fade-in, where it cannot be seen late.
                if let shot = snapshotBoard(region: region, dark: dark) {
                    CanvasHostLayer.focusQueue.async { [weak self] in
                        let image = CanvasHostLayer.blurFocus(shot.board, scale: shot.scale, zoom: shot.zoom, dark: dark)
                        DispatchQueue.main.async {
                            guard let self, self.focusRegion == region else { return }
                            CATransaction.begin()
                            CATransaction.setDisableActions(true)
                            self.focusLayer.contents = image
                            CATransaction.commit()
                        }
                    }
                }
                focusRegion = region
                focusZoom = zoom
                focusLayer.frame = CGRect(x: region.x, y: region.y, width: region.width, height: region.height)
            }
            let full = maskFrame(rect, in: region)
            if !wasOn, let tile, let transition {
                // Opening: the mask starts on the tile and grows with the card.
                focusMask.frame = maskFrame(tile, in: region)
                transition.setFrame(focusMask, full)
            } else {
                focusMask.frame = full
            }
            focusLayer.isHidden = false
        } else if wasOn, let tile, let transition, let region = focusRegion {
            // Closing: shrink back into the tile while fading.
            transition.setFrame(focusMask, maskFrame(tile, in: region))
        }
        CATransaction.commit()
        focusRect = rect
        guard wasOn != (rect != nil) else { return }
        let target: Float = rect == nil ? 0 : 1
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        if let transition {
            let shown = focusLayer.presentation()?.opacity ?? focusLayer.opacity
            CATransaction.setCompletionBlock { [weak self] in
                guard let self, self.focusRect == nil else { return }
                self.focusLayer.isHidden = true
                self.focusLayer.contents = nil
                self.focusRegion = nil
            }
            focusLayer.opacity = target
            transition.animate(focusLayer, "opacity", from: NSNumber(value: shown))
        } else {
            focusLayer.opacity = target
            focusLayer.isHidden = rect == nil
            if rect == nil {
                focusLayer.contents = nil
                focusRegion = nil
            }
        }
        CATransaction.commit()
    }

    #if canImport(CoreImage)
    /// One GPU context for every snapshot: creating one costs more than the blur.
    private static let focusContext = CIContext(options: [.cacheIntermediates: false])
    #endif
    private static let focusQueue = DispatchQueue(label: "app.grovepad.focus-blur", qos: .userInteractive)

    /// The board in `region` as it is drawn now — the glow, the grid, the
    /// tiles and lines, everything in this layer but the focus image —
    /// blurred strongest at the card (the region inset by `focusReach`) and
    /// not at all at the rim, with a faint dim riding the same falloff.
    /// Rendered at one pixel per screen point: it is soft anyway.
    func captureFocusImage(region: WorldRect, dark: Bool) -> CGImage? {
        guard let shot = snapshotBoard(region: region, dark: dark) else { return nil }
        return CanvasHostLayer.blurFocus(shot.board, scale: shot.scale, zoom: shot.zoom, dark: dark)
    }

    /// The board in `region`, unblurred (main thread: it reads the layer tree).
    func snapshotBoard(region: WorldRect, dark: Bool) -> (board: CGImage, scale: Double, zoom: Double)? {
        focusCaptures += 1
        #if canImport(CoreImage)
        guard let camera = cameraFrame, camera.zoom > 0 else { return nil }
        let zoom = camera.zoom
        // Pixels per world unit: one per screen point, capped so a huge card
        // at a deep zoom never asks for a huge bitmap.
        let longest = max(region.width, region.height) * zoom
        let scale = zoom * min(1, 1400 / max(longest, 1))
        let width = max(1, Int((region.width * scale).rounded(.up)))
        let height = max(1, Int((region.height * scale).rounded(.up)))
        guard let space = CGColorSpace(name: CGColorSpace.sRGB),
              let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0, space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        // Paint the canvas colour first: the layers above it are translucent.
        context.setFillColor(CGColor(gray: dark ? 0.02 : 0.96, alpha: 1))
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        // Host space is y-down with the world at `world × zoom + pan`; the
        // bitmap is y-up, so flip, then bring the region's corner to 0,0.
        let k = scale / zoom
        context.translateBy(x: 0, y: CGFloat(height))
        context.scaleBy(x: CGFloat(k), y: CGFloat(-k))
        context.translateBy(x: CGFloat(-(region.x * zoom + camera.pan.x)), y: CGFloat(-(region.y * zoom + camera.pan.y)))
        let wasHidden = focusLayer.isHidden
        focusLayer.isHidden = true
        render(in: context)
        focusLayer.isHidden = wasHidden
        guard let board = context.makeImage() else { return nil }
        return (board, scale, zoom)
        #else
        return nil
        #endif
    }

    /// The blur itself: pure Core Image on an immutable picture, so it runs
    /// off the main thread (`setFocus`) and the glide never waits for it.
    static func blurFocus(_ board: CGImage, scale: Double, zoom: Double, dark: Bool) -> CGImage? {
        #if canImport(CoreImage)
        guard let space = CGColorSpace(name: CGColorSpace.sRGB) else { return nil }
        let width = board.width, height = board.height

        // The falloff: 1 over the card, easing to 0 at the rim.
        let extent = CGRect(x: 0, y: 0, width: width, height: height)
        let inset = CanvasHostLayer.focusReach * scale
        let core = extent.insetBy(dx: inset * 0.85, dy: inset * 0.85)
        let falloff = CIImage(color: .white).cropped(to: core)
            .composited(over: CIImage(color: .black).cropped(to: extent))
            .clampedToExtent()
            .applyingGaussianBlur(sigma: inset * 0.38)
            .cropped(to: extent)
        let input = CIImage(cgImage: board)
        let blurred = input.clampedToExtent().applyingFilter("CIMaskedVariableBlur", parameters: [
            "inputMask": falloff,
            kCIInputRadiusKey: CanvasHostLayer.focusBlurRadius * scale / zoom,
        ]).cropped(to: extent)
        let dimmed = blurred.applyingFilter("CIColorMatrix", parameters: [
            "inputRVector": CIVector(x: dark ? 0.8 : 0.955, y: 0, z: 0, w: 0),
            "inputGVector": CIVector(x: 0, y: dark ? 0.8 : 0.955, z: 0, w: 0),
            "inputBVector": CIVector(x: 0, y: 0, z: dark ? 0.8 : 0.955, w: 0),
        ])
        let output = dimmed.applyingFilter("CIBlendWithMask", parameters: [
            kCIInputBackgroundImageKey: blurred,
            kCIInputMaskImageKey: falloff,
        ]).cropped(to: extent)
        return focusContext.createCGImage(output, from: extent, format: .RGBA8, colorSpace: space)
        #else
        return nil
        #endif
    }

    /// Side of the ring mask bitmap: a fade `featherSide / 2` pixels deep
    /// round a one-pixel centre that stretches to the card.
    static let featherSide = 129

    /// The ring's alpha: solid at the card, falling to nothing at the rim
    /// along a long ease (cosine), round every corner too, so the ring has
    /// no edge and no box shape to see.
    static let featherImage: CGImage? = {
        let side = featherSide
        let depth = Double(side / 2)
        guard let context = CGContext(data: nil, width: side, height: side, bitsPerComponent: 8, bytesPerRow: side * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue),
              let data = context.data?.assumingMemoryBound(to: UInt8.self) else { return nil }
        let centre = Double(side) / 2
        for y in 0..<side {
            for x in 0..<side {
                let dx = max(abs(Double(x) + 0.5 - centre) - 0.5, 0)
                let dy = max(abs(Double(y) + 0.5 - centre) - 0.5, 0)
                let t = min(1, (dx * dx + dy * dy).squareRoot() / depth)
                let alpha = 0.5 + 0.5 * cos(t * .pi)
                let value = UInt8((alpha * 255).rounded())
                let i = (y * side + x) * 4
                data[i] = value; data[i + 1] = value; data[i + 2] = value; data[i + 3] = value
            }
        }
        return context.makeImage()
    }()

    /// screen = world × zoom + pan. One transform, no other layer touched.
    public func setCamera(_ frame: CameraFrame) {
        transformWrites += 1
        let transform = CATransform3DConcat(
            CATransform3DMakeScale(CGFloat(frame.zoom), CGFloat(frame.zoom), 1),
            CATransform3DMakeTranslation(CGFloat(frame.pan.x), CGFloat(frame.pan.y), 0)
        )
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        worldLayer.transform = transform
        CATransaction.commit()
        let zoomChanged = cameraFrame?.zoom != frame.zoom
        cameraFrame = frame
        auraLayer.update(frame: frame, viewport: bounds.size)
        updateGrids(frame)
        if zoomChanged, !glueLines.isEmpty { layoutGlueLines() }
        if zoomChanged, glueIntent != nil { layoutGlueIntent() }
    }

    /// Show (or clear) the group-drag preview. Called on every drag frame.
    public func setGlueIntent(_ paint: GlueIntentPaint?) {
        guard paint != glueIntent else { return }
        let thinned = glueIntent?.slot != nil ? glueIntent?.draggedId : nil
        let thinning = paint?.slot != nil ? paint?.draggedId : nil
        if thinned != thinning {
            CATransaction.begin()
            CATransaction.setAnimationDuration(0.12)
            if let thinned { cardLayers[thinned]?.opacity = 1 }
            if let thinning { cardLayers[thinning]?.opacity = 0.78 }
            CATransaction.commit()
        }
        glueIntent = paint
        layoutGlueIntent()
    }

    /// Hairlines stay the same on screen at every zoom.
    private func layoutGlueIntent() {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        defer { CATransaction.commit() }
        let zoom = max(cameraFrame?.zoom ?? 1, 0.0001)
        let radius = CanvasHostLayer.cardCornerRadius
        func path(_ rect: WorldRect, out: Double) -> CGPath {
            let box = CGRect(x: rect.x - out, y: rect.y - out, width: rect.width + out * 2, height: rect.height + out * 2)
            let r = min(radius + out, box.width / 2, box.height / 2)
            return CGPath(roundedRect: box, cornerWidth: r, cornerHeight: r, transform: nil)
        }
        let paint = glueIntent
        let accent = paint.map { CGColor.fromHex($0.accent) } ?? CGColor(gray: 1, alpha: 1)
        if let slot = paint?.slot {
            intentSlot.path = path(slot, out: 0)
            intentSlot.fillColor = accent.copy(alpha: 0.14)
            intentSlot.strokeColor = accent.copy(alpha: 0.75)
            intentSlot.lineWidth = 1.5 / zoom
            intentSlot.lineDashPattern = [NSNumber(value: 6 / zoom), NSNumber(value: 4 / zoom)]
            intentSlot.isHidden = false
        } else {
            intentSlot.isHidden = true
        }
        if let target = paint?.target {
            intentRing.path = path(target, out: 5 / zoom)
            intentRing.shadowPath = intentRing.path?.copy(strokingWithWidth: 2 / zoom, lineCap: .butt, lineJoin: .round, miterLimit: 1)
            intentRing.strokeColor = accent.copy(alpha: 0.85)
            intentRing.lineWidth = 2 / zoom
            intentRing.shadowColor = accent
            intentRing.shadowOpacity = 0.55
            intentRing.shadowRadius = 8
            intentRing.shadowOffset = .zero
            intentRing.isHidden = false
        } else {
            intentRing.isHidden = true
        }
        if let pulling = paint?.pulling {
            intentPull.path = path(pulling, out: 6 / zoom)
            intentPull.strokeColor = CanvasHostLayer.glueLineColor(dark: glueLineDark).copy(alpha: 0.9)
            intentPull.lineWidth = 1.5 / zoom
            intentPull.lineDashPattern = [NSNumber(value: 5 / zoom), NSNumber(value: 5 / zoom)]
            intentPull.isHidden = false
        } else {
            intentPull.isHidden = true
        }
    }

    /// `--gp-relation-outline` at 45 % × 0.55, per theme.
    static func glueLineColor(dark: Bool) -> CGColor {
        CGColor.fromHex(dark ? EdgeColors.relationOutlineDark : EdgeColors.relationOutlineLight).copy(alpha: 0.45 * 0.55)!
    }

    /// Replace the group boundary lines (world rects, 2 units tall).
    public func setGlueLines(_ lines: [WorldRect], dark: Bool) {
        guard lines != glueLines || dark != glueLineDark else { return }
        glueLines = lines
        glueLineDark = dark
        layoutGlueLines()
    }

    /// One rounded layer per line, zooming with the board like the cards
    /// and the connector lines (one thickness relative to the cards at every
    /// zoom); never thinner on screen than the connectors' hairline.
    private func layoutGlueLines() {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        defer { CATransaction.commit() }
        var layers = glueLineLayer.sublayers ?? []
        while layers.count > glueLines.count { layers.removeLast().removeFromSuperlayer() }
        while layers.count < glueLines.count {
            let line = CALayer()
            line.actions = ["position": NSNull(), "bounds": NSNull(), "backgroundColor": NSNull(), "cornerRadius": NSNull()]
            glueLineLayer.addSublayer(line)
            layers.append(line)
        }
        let zoom = max(cameraFrame?.zoom ?? 1, 0.0001)
        let color = CanvasHostLayer.glueLineColor(dark: glueLineDark)
        for (line, rect) in zip(layers, glueLines) {
            let height = max(rect.height, EdgeGroupLayer.hairline / zoom)
            line.frame = CGRect(x: rect.x, y: rect.y + (rect.height - height) / 2, width: max(0, rect.width), height: height)
            line.cornerRadius = height / 2
            line.backgroundColor = color
        }
    }

    /// The grid follows the camera; the reveal mask stays pinned to the
    /// viewport inside the sliding grid.
    private func updateGrids(_ frame: CameraFrame) {
        gridLayer.update(frame: frame, viewport: bounds.size)
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        let viewport = CGRect(x: -gridLayer.position.x, y: -gridLayer.position.y, width: bounds.width, height: bounds.height)
        // The mask lives in the grid's own space; the pools inside it are
        // in viewport points.
        gridReveal.bounds = CGRect(origin: .zero, size: viewport.size)
        gridReveal.position = CGPoint(x: viewport.minX, y: viewport.minY)
        CATransaction.commit()
    }

    /// The canvas's `gridIntensity` (0–100).
    public func setGridIntensity(_ percent: Double) {
        gridLayer.setIntensity(percent)
        if let cameraFrame { updateGrids(cameraFrame) }
    }

    public override func layoutSublayers() {
        super.layoutSublayers()
        if let cameraFrame {
            auraLayer.update(frame: cameraFrame, viewport: bounds.size)
            updateGrids(cameraFrame)
        }
    }

    func cardLayer(for id: String) -> CardLayer {
        if let existing = cardLayers[id] { return existing }
        let layer = CardLayer(widgetId: id)
        layer.contentsScale = screenScale
        layer.applyShadow(dark: cardShadowDark, lifted: id == liftedCardId)
        cardLayers[id] = layer
        // Cards sit above the group lines and below the edges.
        // Above every line: a line runs under a card, never across it.
        worldLayer.insertSublayer(layer, below: focusLayer)
        return layer
    }

    /// Recast every card's shadow for a theme and the hovered card.
    public func setCardShadows(dark: Bool, lifted: String?) {
        guard dark != cardShadowDark || lifted != liftedCardId else { return }
        let previous = liftedCardId
        let themeChanged = dark != cardShadowDark
        cardShadowDark = dark
        liftedCardId = lifted
        if themeChanged {
            for (id, layer) in cardLayers { layer.applyShadow(dark: dark, lifted: id == lifted) }
        } else {
            for id in [previous, lifted].compactMap({ $0 }) {
                cardLayers[id]?.applyShadow(dark: dark, lifted: id == lifted, animated: !reducedMotion)
            }
        }
    }

    func removeCardLayer(_ id: String, fading: Bool = false) {
        guard let layer = cardLayers.removeValue(forKey: id) else { return }
        guard fading, !reducedMotion else { layer.removeFromSuperlayer(); return }
        // The tile fades out while the open card comes up over it (the
        // web's resting-face crossfade), then leaves.
        CATransaction.begin()
        CATransaction.setCompletionBlock { layer.removeFromSuperlayer() }
        let animation = CABasicAnimation(keyPath: "opacity")
        animation.fromValue = 1
        animation.toValue = 0
        // Quickly: the open card's glass is the tile's, already over it.
        animation.duration = CardMotion.contentInDuration
        animation.timingFunction = CardMotion.layoutEase
        layer.opacity = 0
        layer.add(animation, forKey: "gp.fade")
        CATransaction.commit()
    }

    /// The hovered card leans toward the pointer at (nx, ny) from its centre.
    public func setHoverLean(_ id: String?, nx: Double, ny: Double) {
        for (other, layer) in cardLayers where other != id && layer.lean != nil { layer.setLean(nil, animated: !reducedMotion) }
        guard let id, let layer = cardLayers[id], !reducedMotion else { return }
        layer.setLean(CardMotion.lean(nx: nx, ny: ny), animated: true)
    }
}

/// Board state the controller renders from.
/// How much a card gives up on each edge when drawn: a glued member carves
/// half the seam out of every welded edge (`glueMemberInsets`), so its
/// stored box stays on the grid while the painted one leaves the gap.
public struct CardInsets: Equatable, Hashable, Sendable {
    public var top: Double
    public var left: Double
    public var bottom: Double
    public var right: Double

    public init(top: Double = 0, left: Double = 0, bottom: Double = 0, right: Double = 0) {
        self.top = top
        self.left = left
        self.bottom = bottom
        self.right = right
    }

    public static let zero = CardInsets()

    public func apply(to rect: WorldRect) -> WorldRect {
        WorldRect(x: rect.x + left, y: rect.y + top, width: rect.width - left - right, height: rect.height - top - bottom)
    }
}

public struct CanvasHostInput {
    public var widgets: [Widget]
    /// Per-card draw insets (glued members); absent means none.
    public var insets: [String: CardInsets] = [:]
    public var edges: [EdgeDescriptor]
    /// Set when this snapshot opens or closes a card: what moves because of
    /// it (the glow) glides on the card's curve.
    public var transition: LayerTransition?
    public var selection: Set<String>
    public var hover: String?
    public var editing: Set<String>
    public var wired: Set<String>
    /// The canvas's dot grid strength, 0–100.
    public var gridIntensity: Double

    public init(widgets: [Widget], edges: [EdgeDescriptor] = [], selection: Set<String> = [], hover: String? = nil, editing: Set<String> = [], wired: Set<String> = [], gridIntensity: Double = 100) {
        self.widgets = widgets
        self.edges = edges
        self.selection = selection
        self.hover = hover
        self.editing = editing
        self.wired = wired
        self.gridIntensity = gridIntensity
    }

    /// The same input wearing per-card draw insets.
    public func withInsets(_ insets: [String: CardInsets]) -> CanvasHostInput {
        var copy = self
        copy.insets = insets
        return copy
    }
}

public final class CanvasHostController {
    public let camera: CameraEngine
    public let residency: ResidencyController
    public let hostLayer: CanvasHostLayer
    public weak var bitmapProvider: RestingBitmapProvider?
    public weak var liveHost: LiveCardHost?
    /// A card's accent: its placeholder block, selection ring and glow.
    /// Defaults to the widget's metadata accent, then a neutral grey.
    public var accentColor: (Widget) -> String = { $0.metadata.accent ?? "#3f3f46" }

    private var widgetsById: [String: Widget] = [:]
    /// Draw insets from the last input (glued members carve their seams).
    public private(set) var insets: [String: CardInsets] = [:]
    private var edges: [EdgeDescriptor] = []
    private var liveIds: Set<String> = []
    private var unsubscribe: (() -> Void)?
    /// Cards whose next frame refresh glides (a drop settling on the grid).
    private var settling: Set<String> = []

    /// The expand glide out of the tile and the close back into it. The
    /// owner wants them (18 Sep 2026) starting on the very click, which is
    /// why the Mac builds the card on the press (`prewarm`); false opens
    /// and closes in place.
    public var animatesOpenClose = true
    /// A drag or resize is under way: bitmaps wait for the release.
    public var isMovingCards = false

    public init(camera: CameraEngine, restContext: RestContext, screenScale: CGFloat = 1) {
        self.camera = camera
        let host = CanvasHostLayer()
        host.screenScale = screenScale
        hostLayer = host
        residency = ResidencyController(restContext: restContext)
        camera.worldTransformSink = { [weak host] frame in host?.setCamera(frame) }
        unsubscribe = camera.onFrame { [weak self] frame in self?.cameraDidCommit(frame) }
        host.setCamera(camera.frame)
        // The line layer's zoom is the camera's from the first frame; every
        // stroke width anyone applies is divided by it.
        host.edgeLayer.setZoom(camera.frame.zoom)
    }

    deinit {
        unsubscribe?()
        sharpenWork?.cancel()
    }

    public var restContext: RestContext {
        get { residency.restContext }
        set { residency.restContext = newValue }
    }

    /// The viewport changed size: cards newly in view may want sharper tiles.
    public func viewportSizeDidChange() {
        scheduleSharpen()
    }

    /// The per-frame path: the transform was already written by the sink.
    /// Nothing is mounted, unmounted or swapped for a cheaper face here —
    /// every card is already a tile. Edge strokes keep their screen width.
    private func cameraDidCommit(_ frame: CameraFrame) {
        hostLayer.edgeLayer.setZoom(frame.zoom)
        scheduleSharpen()
    }

    // MARK: Resting bitmap sharpness

    /// How long the camera rests before tiles in view are re-rendered at
    /// the zoom's scale (so a zoomed-in tile is not a blurry blow-up).
    public static let sharpenDelay: TimeInterval = 0.15
    /// Tiles within this many screen points of the viewport count as in view.
    static let sharpenMargin = 200.0
    private var sharpenWork: DispatchWorkItem?

    /// Pixels per world unit a tile should be rendered at for `zoom`: the
    /// screen scale, raised in half steps when zoomed in so a tile stays
    /// crisp. Zoomed out it stays at the screen scale (never lower): the
    /// same picture, just drawn smaller.
    public func restingBitmapScale(zoom: Double) -> CGFloat {
        let steps = max(1, (zoom * 2).rounded(.up) / 2)
        return hostLayer.screenScale * CGFloat(steps)
    }

    /// The scale a tile should carry right now: sharp when it is in (or
    /// next to) the viewport, the screen scale otherwise, so a board zoomed
    /// in and panned across does not keep every tile it passed at 3×.
    private func desiredScale(for layer: CardLayer, viewport: WorldRect, sharp: CGFloat) -> CGFloat {
        let rect = WorldRect(x: layer.position.x, y: layer.position.y, width: layer.bounds.width, height: layer.bounds.height)
        return rect.intersects(viewport) ? sharp : hostLayer.screenScale
    }

    private func sharpenViewport() -> WorldRect {
        worldRectForViewport(CameraViewport(frame: camera.frame, viewportSize: camera.viewportSize), screenPadding: CanvasHostController.sharpenMargin)
    }

    private func scheduleSharpen() {
        sharpenWork?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.sharpenRestingBitmaps() }
        sharpenWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + CanvasHostController.sharpenDelay, execute: work)
    }

    /// Re-render tiles whose bitmap scale no longer suits the camera: tiles
    /// in view go up to the zoom's scale, tiles out of view go back down to
    /// the screen scale. The face never changes, only its resolution. Runs
    /// once the camera rests (`sharpenDelay`); public as a test seam.
    public func sharpenRestingBitmaps() {
        guard !isMovingCards, let provider = bitmapProvider else { return }
        let viewport = sharpenViewport()
        let sharp = restingBitmapScale(zoom: camera.frame.zoom)
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        for (id, layer) in hostLayer.cardLayers {
            guard let rendered = layer.renderedScale, let version = layer.dataVersion, let widget = widgetsById[id] else { continue }
            let scale = desiredScale(for: layer, viewport: viewport, sharp: sharp)
            if rendered == scale { continue }
            let size = Size(width: layer.bounds.width, height: layer.bounds.height)
            if let image = provider.restingBitmap(for: widget, size: size, scale: scale) {
                layer.setRestingBitmap(image, version: version, scale: scale)
            }
        }
        CATransaction.commit()
    }

    /// Apply a new board snapshot and interaction state.
    public func apply(_ input: CanvasHostInput) {
        var byId: [String: Widget] = [:]
        byId.reserveCapacity(input.widgets.count)
        for widget in input.widgets { byId[widget.id] = widget }
        widgetsById = byId
        insets = input.insets
        edges = input.edges
        hostLayer.setGridIntensity(input.gridIntensity)
        residency.setWidgets(input.widgets)
        // Hover is not urgent: under the pointer a card only lights up. A
        // card goes live when it is clicked (selected), edited or wired —
        // never because the pointer passed over it (a pinned card that went
        // live on hover swapped its resting face for the full card).
        var urgent = input.selection.union(input.editing).union(input.wired)
        // A card showing its resting face stays a bitmap however urgent it is.
        // A live view draws the full card, which squeezed into the tile read
        // as a card "expanding" under the pointer — and, being a real view,
        // it swallowed the press that should have opened the card. Only an
        // open card (or a type that never rests) mounts live.
        let context = residency.restContext
        // An icon is a glyph: selected (a group member is selected with its
        // group) it stays a picture too, so it can never sit over an open
        // card, and opening it glides out of the icon like a tile does.
        urgent = urgent.filter { id in
            byId[id].map { widget in
                !context.isResting(widget) && !(widget.iconified == true && context.expandedWidgetId != widget.id)
            } ?? false
        }
        residency.urgentIds = urgent
        let diff = residency.replan()
        reconcile(diff)
        settling.removeAll()
        setHover(input.hover)
        for (id, layer) in hostLayer.cardLayers {
            let selected = input.selection.contains(id)
            if selected != layer.isSelectedRing || selected, let widget = byId[id] {
                layer.setSelected(selected, accent: CGColor.fromHex(accentColor(widget)))
            }
        }
        if !isMovingCards { refreshRestingBitmaps() }
        // Every card glows from where it is actually drawn (resting or open).
        hostLayer.auraLayer.setEmitters(input.widgets.map { AuraEmitter(id: $0.id, rect: displayedWidgetRect($0, restContext: context), accent: accentColor($0)) }, transition: input.transition)
    }

    /// The card under the pointer lifts and lights up; the one it left goes
    /// dark. Touches two layers and nothing else, so it can run on every
    /// hover change without a board sync.
    public func setHover(_ id: String?) {
        hostLayer.setCardShadows(dark: hostLayer.cardShadowDark, lifted: id)
        for (other, layer) in hostLayer.cardLayers where layer.isLit && other != id {
            layer.setLit(false, accent: CGColor(gray: 0, alpha: 0), animated: !hostLayer.reducedMotion)
        }
        if let id, let layer = hostLayer.cardLayers[id], let widget = widgetsById[id] {
            layer.setLit(true, accent: CGColor.fromHex(accentColor(widget)), animated: !hostLayer.reducedMotion)
        }
    }

    /// The box a card is painted in: its displayed box, pulled in by its
    /// draw insets unless it is ephemerally open over its tile.
    public func drawnRect(_ widget: Widget) -> WorldRect {
        let context = residency.restContext
        let rect = displayedWidgetRect(widget, restContext: context)
        guard let inset = insets[widget.id], !context.isRestExpanded(widget) else { return rect }
        return inset.apply(to: rect)
    }

    /// The widget a live card is mounted from: a glued member's copy sits at
    /// its inset box, so the card view (which sizes itself from the record)
    /// and its frame agree.
    func drawnWidget(_ widget: Widget) -> Widget {
        let context = residency.restContext
        guard let inset = insets[widget.id], inset != .zero, !context.isRestExpanded(widget), !context.isResting(widget) else { return widget }
        let rect = inset.apply(to: WorldRect(x: widget.position.x, y: widget.position.y, width: widget.size.width, height: widget.size.height))
        var copy = widget
        copy.position = Vector2D(x: rect.x, y: rect.y)
        copy.size = Size(width: rect.width, height: rect.height)
        return copy
    }

    /// The next frame refresh of these cards glides instead of jumping.
    public func settle(_ ids: [String]) {
        guard !hostLayer.reducedMotion else { return }
        settling.formUnion(ids)
    }

    /// A drag frame, applied at once: only the moved cards' frames, without
    /// waiting for the next board sync or touching anything else.
    public func moveCards(_ widgets: [Widget]) {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        var glows: [String: WorldRect] = [:]
        for widget in widgets {
            widgetsById[widget.id] = widget
            // The glow travels with the card, in the same commit.
            glows[widget.id] = displayedWidgetRect(widget, restContext: residency.restContext)
            let rect = drawnRect(widget)
            if let layer = hostLayer.cardLayers[widget.id] {
                layer.setFrame(rect)
            } else if liveIds.contains(widget.id) {
                liveHost?.moveLiveCard(drawnWidget(widget), frame: rect)
            }
        }
        hostLayer.auraLayer.moveEmitters(glows)
        CATransaction.commit()
    }

    /// A resting tile under a scale drag stretches like rubber, per axis
    /// about the sides the drag leaves pinned. Nothing outlines where it
    /// would land: crossing the line changes the state on the spot.
    public func previewElastic(_ id: String, x: Double, y: Double, pinned: CGPoint) {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        hostLayer.cardLayers[id]?.setElastic(x: x, y: y, pinned: pinned)
        CATransaction.commit()
    }

    /// The tile recoils out of its stretch.
    public func releaseElastic(_ id: String) {
        hostLayer.cardLayers[id]?.releaseElastic(animated: !hostLayer.reducedMotion)
    }

    /// A frame shown on a resting tile without touching the board (a tile
    /// rubber-banding under a crush); the next apply puts it back.
    /// An icon under a scale drag: its frame AND its face at the size it has
    /// this frame. A bitmap left at its old size and stretched would swell
    /// the corners with the box; drawn at the size it wears, the radius is
    /// the same at 2×2, 3×3 and everywhere between.
    public func previewIconFrame(_ widget: Widget, _ rect: WorldRect) {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        defer { CATransaction.commit() }
        guard let layer = hostLayer.cardLayers[widget.id] else { return }
        layer.setFrame(rect)
        guard let provider = bitmapProvider, let scale = layer.renderedScale,
              let image = provider.restingBitmap(for: widget, size: Size(width: rect.width, height: rect.height), scale: scale) else { return }
        layer.setRestingBitmap(image, version: layer.dataVersion ?? 0, scale: scale)
    }

    public func previewCardFrame(_ id: String, _ rect: WorldRect) {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        hostLayer.cardLayers[id]?.setFrame(rect)
        CATransaction.commit()
    }

    /// Convenience over a Board and its active canvas.
    public func apply(board: Board, canvasId: String, edges: [EdgeDescriptor] = [], selection: Set<String> = [], hover: String? = nil, editing: Set<String> = [], wired: Set<String> = []) {
        apply(CanvasHostInput(widgets: board.widgets(on: canvasId), edges: edges, selection: selection, hover: hover, editing: editing, wired: wired, gridIntensity: board.canvases[canvasId]?.gridIntensity ?? 100))
    }

    private func reconcile(_ diff: ResidencyDiff) {
        guard let plan = residency.plan else { return }
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        defer { CATransaction.commit() }

        let opening = Set(diff.entered(.live))
        let closing = Set(diff.left(.live))
        var openingFrom: [String: WorldRect] = [:]
        for id in diff.left(.resting) {
            if opening.contains(id), let layer = hostLayer.cardLayers[id] {
                openingFrom[id] = WorldRect(x: layer.position.x, y: layer.position.y, width: layer.bounds.width, height: layer.bounds.height)
            }
            hostLayer.removeCardLayer(id, fading: animatesOpenClose && opening.contains(id))
            // Only when the card has left the canvas altogether (deleted, or
            // another canvas is shown). A card that merely went live is
            // still here and will want its tile back the moment it rests.
            if plan.tiers[id] == nil { bitmapProvider?.releaseBitmap(for: id) }
        }
        for id in diff.left(.live) where liveIds.remove(id) != nil {
            // Closing back to its tile fades; leaving the canvas does not.
            let animated = animatesOpenClose && plan.tiers[id] == .resting && !hostLayer.reducedMotion
            liveHost?.unmountLiveCard(id: id, animated: animated, closingInto: animated ? widgetsById[id].map(drawnRect) : nil)
        }

        for id in diff.entered(.resting) {
            guard let widget = widgetsById[id] else { continue }
            let layer = hostLayer.cardLayer(for: id)
            layer.setFrame(drawnRect(widget))
            layer.backgroundColor = CGColor.fromHex(accentColor(widget))
            if animatesOpenClose, closing.contains(id), !hostLayer.reducedMotion { layer.fadeIn() }
        }
        for id in diff.entered(.live) {
            guard let widget = widgetsById[id] else { continue }
            liveIds.insert(id)
            liveHost?.mountLiveCard(drawnWidget(widget), frame: drawnRect(widget), in: hostLayer.worldLayer, openingFrom: animatesOpenClose && !hostLayer.reducedMotion ? openingFrom[id] : nil)
        }
        // Cards that stayed resting or live still need their frames refreshed
        // against the new snapshot.
        for id in plan.orderedIds {
            guard let widget = widgetsById[id] else { continue }
            let rect = drawnRect(widget)
            switch plan.tiers[id] {
            case .resting?:
                hostLayer.cardLayers[id]?.setFrame(rect, animated: settling.contains(id))
            case .live?:
                if liveIds.contains(id), !opening.contains(id) { liveHost?.updateLiveCard(drawnWidget(widget), frame: rect, animated: settling.contains(id)) }
            case nil:
                break
            }
        }

        // Every edge stays mounted: none pops in or out under a pan.
        hostLayer.edgeLayer.apply(edges, visibleWorldRect: CanvasHostController.everywhere, zoom: camera.frame.zoom)
    }

    /// A world rect covering the whole board (no culling).
    static let everywhere = WorldRect(x: -1e9, y: -1e9, width: 2e9, height: 2e9)

    /// Re-read every resting card's data version and refresh only the
    /// bitmaps whose version moved, at the scale that suits the camera now.
    public func refreshRestingBitmaps() {
        guard let provider = bitmapProvider else { return }
        let viewport = sharpenViewport()
        let sharp = restingBitmapScale(zoom: camera.frame.zoom)
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        for (id, layer) in hostLayer.cardLayers {
            guard let widget = widgetsById[id] else { continue }
            let version = provider.dataVersion(for: widget)
            if layer.dataVersion == version { continue }
            let size = Size(width: layer.bounds.width, height: layer.bounds.height)
            let scale = desiredScale(for: layer, viewport: viewport, sharp: sharp)
            if let image = provider.restingBitmap(for: widget, size: size, scale: scale) {
                layer.setRestingBitmap(image, version: version, scale: scale)
            }
        }
        CATransaction.commit()
    }

    /// The resting tile a card opened over was shown first (the opener
    /// revealed the card ahead of the board's sync): fade it out now, in the
    /// same frame, and let the planner find it gone when it catches up.
    public func fadeOutTile(_ id: String) {
        hostLayer.removeCardLayer(id, fading: animatesOpenClose)
    }

    // Test seams.
    public var liveCardIds: Set<String> { liveIds }
    public var restingCardIds: Set<String> { Set(hostLayer.cardLayers.keys) }
}
#endif
