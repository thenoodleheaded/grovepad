import SwiftUI
import GrovepadCore

// ---------------------------------------------------------------------------
// Text (`components/widgets/modules/TextWidget.tsx`, `textSkinModel.ts`,
// `utils/restingFaces` `noteRestModel`). One note, three skins: plain,
// sticky, typewriter. The body edits `data.text` through TextKit 2; the
// skin field is `mode`.
//
// Skins: plain and typewriter change measure and colour; sticky tints the
// paper. Sticky ink (strokes) and the markdown layer are not ported yet.
// ---------------------------------------------------------------------------

public struct TextWidget: WidgetRenderer {
    public static let type = "text"
    static let skins: Set<String> = ["plain", "sticky", "typewriter"]

    public init() {}

    static func skin(_ data: JSONObject) -> String {
        let raw = data.str("mode")
        return skins.contains(raw) ? raw : "plain"
    }

    public func cardBody(_ context: WidgetCardContext) -> some View {
        let skin = TextWidget.skin(context.data)
        let style: TextEditorStyle = switch skin {
        case "typewriter": TextEditorStyle(fontSize: 13, monospaced: true, textColor: Color(hex: context.accent), lineSpacing: 5)
        case "sticky": TextEditorStyle(fontSize: 14, monospaced: false, textColor: Color(red: 0.2, green: 0.16, blue: 0.02), lineSpacing: 3)
        default: TextEditorStyle(fontSize: 13, monospaced: false, textColor: .primary, lineSpacing: 3)
        }
        let binding = Binding<String>(
            get: { context.data.str("text") },
            set: { next in
                // `onChange({ ...data, text: nextText, mode: skin })`
                context.update { data in
                    data["text"] = .string(next)
                    data["mode"] = .string(skin)
                }
            }
        )
        // A lone full-card text control has no second island (Article XIX):
        // the editor sits directly on the backplate. Sticky paints its paper.
        return TextKitEditor(text: binding, style: style, placeholder: "Write…")
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .padding(skin == "sticky" ? 8 : 0)
            .background(skin == "sticky" ? Color(hex: "#fcd34d").opacity(0.85) : Color.clear)
            .clipShape(RoundedRectangle(cornerRadius: skin == "sticky" ? GlassTokens.r1 : 0, style: .continuous))
    }

    public func restingBody(_ context: WidgetRestContext) -> some View {
        WidgetRestingFaceView(context: context)
    }

    /// `noteRestModel`: an empty note rests as a bare icon; anything written
    /// rests as the card's own page at NOTE_REST_SCALE.
    public func restingFace(_ widget: Widget) -> RestingFaceModel {
        let data = widget.data
        let skin = TextWidget.skin(data)
        let written = data.str("text")
        let inked = skin == "sticky" && !(data.skinState("sticky").array("strokes") ?? []).isEmpty
        if JavaScript.trim(written).isEmpty, !inked { return .icon }
        return .note(skin: skin)
    }
}
