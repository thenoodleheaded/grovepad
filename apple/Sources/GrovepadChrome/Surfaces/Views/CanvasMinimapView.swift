import SwiftUI
import GrovepadCore
import GrovepadCanvas

// ---------------------------------------------------------------------------
// The minimap (`CanvasNavigator.tsx`): every card on the open canvas as a
// coloured block, the window's view as a lime frame, press or drag to glide
// there. Collapses to a single button; the choice is remembered per device
// under the web's own key. Bottom-right on regular widths (the web keeps it
// bottom-left; there the navigation pill has that corner).
// ---------------------------------------------------------------------------

public enum MinimapGeometry {
    public static let width: Double = 184
    public static let height: Double = 116
    public static let pad: Double = 9
    public static let storageKey = "grovepad:minimap"

    /// `colorFor(type)`: a stable hue per widget type.
    public static func color(for type: String) -> String {
        let colors = ["#a78bfa", "#22d3ee", "#84cc16", "#f59e0b", "#f472b6", "#60a5fa"]
        var hash: Int32 = 0
        for unit in type.utf16 { hash = hash &* 31 &+ Int32(unit) }
        return colors[Int(hash.magnitude % UInt32(colors.count))]
    }

    /// The world extent the map shows and the world→map scale. The web
    /// pins the board to the map's top-left; a tall column of cards then
    /// hugs one edge, so the extent is widened (never scaled) to centre it.
    public static func frame(for widgets: [Widget]) -> (extent: WorldRect, scale: Double) {
        var extent = CameraFraming.boundsForWidgets(widgets) ?? WorldRect(x: -600, y: -360, width: 1200, height: 720)
        let scale = min((width - pad * 2) / max(1, extent.width), (height - pad * 2) / max(1, extent.height))
        let slackX = (width - pad * 2) / scale - extent.width
        let slackY = (height - pad * 2) / scale - extent.height
        extent = WorldRect(x: extent.x - slackX / 2, y: extent.y - slackY / 2, width: extent.width + slackX, height: extent.height + slackY)
        return (extent, scale)
    }

    /// The window's view in map points.
    public static func viewport(transform: CanvasTransform, viewportSize: Size, extent: WorldRect, scale: Double) -> CGRect {
        let zoom = max(transform.zoom, 0.0001)
        let x = -transform.x / zoom
        let y = -transform.y / zoom
        return CGRect(
            x: pad + (x - extent.x) * scale,
            y: pad + (y - extent.y) * scale,
            width: max(3, viewportSize.width / zoom * scale),
            height: max(3, viewportSize.height / zoom * scale)
        )
    }

    /// The pan that centres the window on the world point under a map point.
    public static func pan(forMapPoint point: CGPoint, extent: WorldRect, scale: Double, viewportSize: Size, zoom: Double) -> Vector2D {
        let worldX = extent.x + (Double(point.x) - pad) / scale
        let worldY = extent.y + (Double(point.y) - pad) / scale
        return Vector2D(x: viewportSize.width / 2 - worldX * zoom, y: viewportSize.height / 2 - worldY * zoom)
    }
}

public struct CanvasMinimapView: View {
    private let document: BoardDocument
    private let chrome: ChromeState
    private let camera: ChromeCamera?
    @State private var collapsed: Bool

    public init(document: BoardDocument, chrome: ChromeState, camera: ChromeCamera?) {
        self.document = document
        self.chrome = chrome
        self.camera = camera
        _collapsed = State(initialValue: UserDefaults.standard.string(forKey: MinimapGeometry.storageKey) == "collapsed")
    }

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    private func setCollapsed(_ value: Bool) {
        // One quick spring drives both directions: the same glass plate
        // resizes between the button and the map, anchored bottom-right, so
        // opening and closing are the same motion played either way.
        withAnimation(reduceMotion ? nil : .spring(response: 0.26, dampingFraction: 0.88)) {
            collapsed = value
        }
        UserDefaults.standard.set(value ? "collapsed" : "open", forKey: MinimapGeometry.storageKey)
    }

    public var body: some View {
        HStack(alignment: .bottom, spacing: 4) {
            if !collapsed {
                Button { setCollapsed(true) } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(.secondary)
                        .frame(width: 28, height: 28)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .transition(.opacity)
                .help("Collapse minimap")
                .accessibilityLabel("Collapse minimap")
            }
            plate
        }
    }

    /// The glass plate. Its frame and corner radius animate; everything
    /// inside is laid out at full size and clipped to the plate, so nothing
    /// can spill past the edge while it grows or shrinks.
    private var plate: some View {
        let width = collapsed ? 40.0 : MinimapGeometry.width
        let height = collapsed ? 40.0 : MinimapGeometry.height
        let radius: CGFloat = collapsed ? 20 : 16
        return ZStack(alignment: .bottomTrailing) {
            map
                .opacity(collapsed ? 0 : 1)
                .allowsHitTesting(!collapsed)
            Button { setCollapsed(false) } label: {
                Image(systemName: "map")
                    .font(.system(size: 15, weight: .medium))
                    .frame(width: 40, height: 40)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .opacity(collapsed ? 1 : 0)
            .allowsHitTesting(collapsed)
            .help("Open minimap")
            .accessibilityLabel("Open minimap")
            .accessibilityHidden(!collapsed)
        }
        .frame(width: width, height: height, alignment: .bottomTrailing)
        .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
        .modifier(MinimapGlass(radius: radius, plain: reduceTransparency))
    }

    private var map: some View {
        let widgets = document.board.widgets(on: document.activeCanvasId)
        let (extent, scale) = MinimapGeometry.frame(for: widgets)
        let transform = chrome.cameraTransform
        let viewportSize = camera?.viewportSize ?? chrome.viewportSize
        return Canvas { context, _ in
            for widget in widgets {
                let rect = CGRect(
                    x: MinimapGeometry.pad + (widget.position.x - extent.x) * scale,
                    y: MinimapGeometry.pad + (widget.position.y - extent.y) * scale,
                    width: max(2, widget.size.width * scale),
                    height: max(2, widget.size.height * scale)
                )
                context.fill(Path(roundedRect: rect, cornerRadius: 1.5), with: .color(Color(hex: MinimapGeometry.color(for: widget.type)).opacity(0.65)))
            }
            let view = MinimapGeometry.viewport(transform: transform, viewportSize: viewportSize, extent: extent, scale: scale)
            let frame = Path(roundedRect: view, cornerRadius: 2)
            context.fill(frame, with: .color(Color.tone("#a3e635", light: "#4d7c0f").opacity(0.05)))
            context.stroke(frame, with: .color(Color.tone("#a3e635", light: "#4d7c0f")), lineWidth: 1.2)
        }
        .frame(width: MinimapGeometry.width, height: MinimapGeometry.height)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .contentShape(Rectangle())
        .gesture(
            DragGesture(minimumDistance: 0).onChanged { value in
                guard let camera else { return }
                let pan = MinimapGeometry.pan(forMapPoint: value.location, extent: extent, scale: scale, viewportSize: camera.viewportSize, zoom: camera.zoom)
                camera.animateView(pan: pan, zoom: camera.zoom, durationMs: 160)
            }
        )
        .accessibilityElement()
        .accessibilityLabel("Canvas minimap. Click or drag to navigate.")
    }
}

/// The minimap's glass: the system material, or the
/// opaque plate when Reduce Transparency is on.
private struct MinimapGlass: ViewModifier {
    let radius: CGFloat
    let plain: Bool

    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
        if plain {
            content
                .background(GlassTokens.plate, in: shape)
                .overlay(shape.strokeBorder(GlassTokens.stroke, lineWidth: 1))
                .shadow(color: GlassTokens.floatShadow, radius: 9, x: 0, y: 0)
        } else {
            content
                .glassEffect(.regular.interactive(), in: shape)
                .shadow(color: GlassTokens.floatShadow, radius: 9, x: 0, y: 0)
        }
    }
}
