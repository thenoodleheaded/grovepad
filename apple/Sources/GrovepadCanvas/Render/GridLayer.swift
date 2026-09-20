#if canImport(QuartzCore)
import Foundation
import QuartzCore
import CoreGraphics
import GrovepadCore

// ---------------------------------------------------------------------------
// The dot grid behind the board. Port of `components/canvas/GridLayer.tsx`:
// one dot per 40-unit cell, centred 1 unit in from the cell's corner, radius
// ~1.2 units, in `--gp-grid-fine` (lime at 13 % on the dark ground), faded by
// the canvas's `gridIntensity`.
//
// The web paints a million-unit plane inside the transformed world. Here the
// layer lives in screen space, one cell larger than the viewport each way:
// a pan only slides it by the pan modulo one cell (no redraw), and it
// redraws only when the zoom or the viewport size changes. Below
// `minimumSpacing` screen points the dots would melt into a haze, so the
// grid fades out and then hides.
//
// Deviations (owner's calls, 18 Sep 2026): no dots — the grid is 1 pt
// hairlines on the cell lines; and it is seen only through soft pools around
// the cards (`GridRevealLayer`, the aura's pools as the layer's mask), so
// empty canvas shows no grid at all and the work sits on a lit one.
// ---------------------------------------------------------------------------

public final class GridLayer: CALayer {
    public static let dotOffset: Double = 1
    /// The hairlines on the dark theme, at full strength where the reveal
    /// mask is whole (next to a card).
    public static let defaultLineColor = CGColor(srgbRed: 134 / 255, green: 239 / 255, blue: 172 / 255, alpha: 0.11)
    /// Hairline width in screen points (does not scale with zoom).
    public static let lineWidth: Double = 1
    /// Screen spacing at which the grid is gone, and at which it is whole.
    public static let minimumSpacing: Double = 8
    public static let fullSpacing: Double = 14

    public var lineColor: CGColor = GridLayer.defaultLineColor {
        didSet { setNeedsDisplay() }
    }
    /// `gridIntensity / 100`, clamped to 0…1.
    public private(set) var intensity: Double = 1
    /// Draw calls so far (test seam).
    public private(set) var drawCount = 0
    /// Cell size in screen points the current bitmap was drawn for.
    public private(set) var drawnSpacing: Double = 0
    private var zoom: Double = 1

    public override init() {
        super.init()
        anchorPoint = .zero
        needsDisplayOnBoundsChange = true
        actions = ["position": NSNull(), "bounds": NSNull(), "contents": NSNull(), "hidden": NSNull(), "opacity": NSNull(), "contentsScale": NSNull(), "transform": NSNull()]
    }

    public override init(layer: Any) {
        super.init(layer: layer)
        if let other = layer as? GridLayer {
            lineColor = other.lineColor
            intensity = other.intensity
            zoom = other.zoom
            drawnSpacing = other.drawnSpacing
        }
    }

    public required init?(coder: NSCoder) {
        nil
    }

    public func setIntensity(_ percent: Double) {
        let next = min(max(percent / 100, 0), 1)
        guard next != intensity else { return }
        intensity = next
    }

    /// Place the grid for `frame` over a viewport of `viewport` points.
    public func update(frame: CameraFrame, viewport: CGSize) {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        defer { CATransaction.commit() }
        let spacing = CanvasGeometry.gridSize * frame.zoom
        let fade = min(max((spacing - GridLayer.minimumSpacing) / (GridLayer.fullSpacing - GridLayer.minimumSpacing), 0), 1)
        let alpha = fade * intensity
        guard alpha > 0, spacing.isFinite, viewport.width > 0, viewport.height > 0 else {
            isHidden = true
            return
        }
        isHidden = false
        opacity = Float(alpha)
        let size = CGSize(width: viewport.width + spacing * 2, height: viewport.height + spacing * 2)
        // Every zoom draws the cells afresh for the new spacing: the grid is
        // never a scaled copy of an older picture (owner's decision, 18 Sep
        // 2026 — no zoom/pan render shortcuts).
        if spacing != drawnSpacing || bounds.size != size {
            redraw(spacing: spacing, zoom: frame.zoom, size: size)
        }
        // The cell corner nearest above-left of the viewport origin, one cell
        // further out so a sub-cell pan never uncovers an edge.
        position = CGPoint(x: GridLayer.phase(frame.pan.x, spacing) - spacing, y: GridLayer.phase(frame.pan.y, spacing) - spacing)
    }

    private func redraw(spacing: Double, zoom: Double, size: CGSize) {
        self.zoom = zoom
        drawnSpacing = spacing
        bounds = CGRect(origin: .zero, size: size)
        setNeedsDisplay()
    }

    /// `value` modulo `spacing`, always in 0..<spacing.
    static func phase(_ value: Double, _ spacing: Double) -> Double {
        let remainder = value.truncatingRemainder(dividingBy: spacing)
        return remainder < 0 ? remainder + spacing : remainder
    }

    public override func draw(in ctx: CGContext) {
        drawCount += 1
        let spacing = drawnSpacing
        guard spacing > 0 else { return }
        let radius = GridLayer.lineWidth / 2
        let offset = GridLayer.dotOffset * zoom
        let clip = bounds
        let firstColumn = max(Int(((clip.minX - offset - radius) / spacing).rounded(.down)), 0)
        let lastColumn = Int(((clip.maxX - offset + radius) / spacing).rounded(.up))
        let firstRow = max(Int(((clip.minY - offset - radius) / spacing).rounded(.down)), 0)
        let lastRow = Int(((clip.maxY - offset + radius) / spacing).rounded(.up))
        guard lastColumn >= firstColumn, lastRow >= firstRow else { return }
        // Normalise to y-down: the cells are laid out from
        // the layer's top-left corner, which is the camera's cell corner.
        ctx.saveGState()
        defer { ctx.restoreGState() }
        if ctx.ctm.d >= 0 {
            ctx.translateBy(x: 0, y: bounds.height)
            ctx.scaleBy(x: 1, y: -1)
        }
        let lines = CGMutablePath()
        for column in firstColumn...lastColumn {
            let x = Double(column) * spacing + offset
            lines.move(to: CGPoint(x: x, y: clip.minY))
            lines.addLine(to: CGPoint(x: x, y: clip.maxY))
        }
        for row in firstRow...lastRow {
            let y = Double(row) * spacing + offset
            lines.move(to: CGPoint(x: clip.minX, y: y))
            lines.addLine(to: CGPoint(x: clip.maxX, y: y))
        }
        ctx.setStrokeColor(lineColor)
        ctx.setLineWidth(GridLayer.lineWidth)
        ctx.addPath(lines)
        ctx.strokePath()
    }
}
/// The mask that lets the lit grid show: the aura's pools as soft white, in
/// viewport space — one sublayer per pool showing the same small falloff
/// image, laid out by the aura whenever its pools move (no drawing). It
/// follows the pools even when the Ambient glow switch is off (the grid
/// still lights around the work); the lightest visual quality places none.
public final class GridRevealLayer: CALayer {
    /// How the light fades from a card's centre to the pool's rim.
    static let falloff: [(location: CGFloat, alpha: CGFloat)] = [(0, 1), (0.35, 0.85), (0.65, 0.4), (0.85, 0.12), (1, 0)]
    static let image: CGImage? = {
        guard let space = CGColorSpace(name: CGColorSpace.sRGB) else { return nil }
        return AuraLayer.radialImage(falloff.map { ($0.location, CGColor(colorSpace: space, components: [1, 1, 1, $0.alpha])!) })
    }()

    weak var aura: AuraLayer?
    /// Pools placed by the last layout (test seam).
    public private(set) var paintedCount = 0
    private var pools: [String: CALayer] = [:]

    public override init() {
        super.init()
        anchorPoint = .zero
        actions = ["position": NSNull(), "bounds": NSNull(), "sublayers": NSNull(), "hidden": NSNull(), "transform": NSNull()]
    }

    public override init(layer: Any) {
        super.init(layer: layer)
        if let other = layer as? GridRevealLayer { aura = other.aura }
    }

    public required init?(coder: NSCoder) {
        nil
    }

    func layout(_ rects: [(emitter: AuraEmitter, rect: CGRect)], transition: LayerTransition? = nil) {
        place(rects, in: self, pool: &pools, transition: transition) { _ in GridRevealLayer.image }
        paintedCount = rects.count
    }
}
#endif
