import SwiftUI
import GrovepadCore

// ---------------------------------------------------------------------------
// Canvas (`components/widgets/modules/CanvasNodeWidget.tsx`,
// `canvasNodeSkinModel.ts`, `restingFaces/visual.ts canvasNodeRestingFace`).
// A door into another canvas. No title chrome: the card carries the canvas
// name in its own face. Skins: portal (one-line doorplate), cover (name and
// a subtitle pocket), live_thumbnail (name; the miniature is not ported yet).
// The skin field is `skin`; a structural exemption with no circuit fields.
// ---------------------------------------------------------------------------

public struct CanvasNodeWidget: WidgetRenderer {
    public static let type = "canvas_node"
    static let skins: Set<String> = ["portal", "cover", "live_thumbnail"]

    public init() {}

    static func skin(_ data: JSONObject) -> String {
        let raw = data.str("skin")
        return skins.contains(raw) ? raw : "portal"
    }

    public func cardBody(_ context: WidgetCardContext) -> some View {
        let data = context.data
        let skin = CanvasNodeWidget.skin(data)
        let canvasId = data.str("canvasId")
        let name = context.canvasName(canvasId) ?? context.widget.title
        let accent = Color(hex: context.accent)
        return Group {
            switch skin {
            case "cover":
                VStack(alignment: .leading, spacing: 6) {
                    doorplate(name: name, symbol: "folder.fill", accent: accent, open: { context.openCanvas(canvasId) })
                    let subtitle = data.skinState("cover").str("subtitle")
                    CardTextField("Subtitle", text: subtitle) { next in
                        context.update { data in
                            var states = data.object("skinStates") ?? JSONObject()
                            var cover = states.object("cover") ?? JSONObject()
                            cover["subtitle"] = .string(String(next.prefix(160)))
                            states["cover"] = .object(cover)
                            data["skinStates"] = .object(states)
                        }
                    }
                    .foregroundStyle(.secondary)
                }
            case "live_thumbnail":
                VStack(alignment: .leading, spacing: 6) {
                    doorplate(name: name, symbol: "rectangle.3.group", accent: accent, open: { context.openCanvas(canvasId) })
                    Well {
                        Text("Miniature arrives with the canvas preview (phase 8)")
                            .font(GlassType.label)
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, minHeight: 48)
                    }
                }
            default:
                doorplate(name: name, symbol: "folder.fill", accent: accent, open: { context.openCanvas(canvasId) })
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// The one-line doorplate: glyph, canvas name, and the open action. The
    /// whole line is the tap target (44 pt), never a hover-only affordance.
    private func doorplate(name: String, symbol: String, accent: Color, open: @escaping () -> Void) -> some View {
        Button(action: open) {
            HStack(spacing: 8) {
                Image(systemName: symbol)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(accent)
                Text(name.isEmpty ? "Canvas" : name)
                    .font(.grove(size: 14, weight: .semibold))
                    .lineLimit(1)
                Spacer(minLength: 0)
                Image(systemName: "arrow.up.right")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.secondary)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Open \(name)")
        .touchTarget()
    }

    public func restingBody(_ context: WidgetRestContext) -> some View {
        WidgetRestingFaceView(context: context)
    }

    /// The fixed doorplate for the worn skin (`CANVAS_TILES`); the cover
    /// carries its own subtitle pocket.
    public func restingFace(_ widget: Widget) -> RestingFaceModel {
        let data = widget.data
        let skin = CanvasNodeWidget.skin(data)
        if skin == "cover" {
            let subtitle = JavaScript.trim(String(data.skinState("cover").str("subtitle").prefix(160)))
            return .canvas(skin: skin, subtitle: subtitle.isEmpty ? nil : RestText.compact(subtitle, 90))
        }
        return .canvas(skin: skin)
    }
}
