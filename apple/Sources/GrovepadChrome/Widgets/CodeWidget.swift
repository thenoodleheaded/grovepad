import SwiftUI
import GrovepadCore

// ---------------------------------------------------------------------------
// Code Snippet (`components/widgets/modules/CodeWidget.tsx`,
// `restingFaces/text.ts codeRestingFace`). One monospace block with a
// language tag and one-tap copy. `code` is written through the field setter
// (`fieldDescriptor("code", "code").set`) so a keystroke and a wire land the
// same way; `language` is a plain field. The skin field is `skin`.
//
// Skins: editor, terminal, config and compact_snippet are presentations of
// the same block (the web dresses them with CSS) and draw here as tint and
// measure; diff and runnable_example are schema extensions and render the
// editor with a one-line note, their pockets untouched.
// ---------------------------------------------------------------------------

public struct CodeWidget: WidgetRenderer {
    public static let type = "code"
    static let skins: Set<String> = ["editor", "terminal", "config", "compact_snippet", "diff", "runnable_example"]
    static let extensionSkins: Set<String> = ["diff", "runnable_example"]
    static let lineLimit = 5

    public init() {}

    static func skin(_ data: JSONObject) -> String {
        let raw = data.str("skin")
        return skins.contains(raw) ? raw : "editor"
    }

    public func cardBody(_ context: WidgetCardContext) -> some View {
        let data = context.data
        let skin = CodeWidget.skin(data)
        let accent = Color(hex: context.accent)
        let terminal = skin == "terminal" || skin == "config"
        let binding = Binding<String>(
            get: { context.data.str("code") },
            set: { next in
                context.update { data in
                    if let setter = fieldDescriptor("code", "code")?.set {
                        data = setter(data, .text(next), context.mint)
                    }
                }
            }
        )
        return VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 6) {
                ForEach(["#ef4444", "#f59e0b", "#10b981"], id: \.self) { hex in
                    Circle().fill(Color(hex: hex).opacity(0.5)).frame(width: 8, height: 8)
                }
                Spacer(minLength: 0)
                CardTextField("Language", text: data.str("language")) { next in
                    context.update { $0["language"] = .string(next) }
                }
                .frame(width: 72)
                .multilineTextAlignment(.trailing)
                .foregroundStyle(.secondary)
                CopyButton(label: "Copy code") { NotesAndStudyFamily.copyToPasteboard(context.data.str("code")) }
            }
            .frame(minHeight: GlassTokens.touchTarget)
            if CodeWidget.extensionSkins.contains(skin) {
                NotesSkinNote("Shown as the editor — the \(skin.replacingOccurrences(of: "_", with: " ")) skin arrives with its details later.")
            }
            Well {
                TextKitEditor(
                    text: binding,
                    style: TextEditorStyle(
                        fontSize: skin == "compact_snippet" ? 10 : 11,
                        monospaced: true,
                        textColor: terminal ? accent : Color.primary.opacity(0.85),
                        lineSpacing: skin == "compact_snippet" ? 2 : 5
                    ),
                    placeholder: terminal ? "$ " : "// paste or type code…"
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    public func restingBody(_ context: WidgetRestContext) -> some View {
        WidgetRestingFaceView(context: context)
    }

    /// `codeRestingFace`: the first non-blank lines as written (clipped,
    /// never compacted), the language as the eyebrow with the line count. A
    /// snippet skin keeps two lines; a terminal prefixes its prompt; a diff
    /// colours by its gutter. Monospaced and un-wrapped, as the web's `lines`.
    public func restingFace(_ widget: Widget) -> RestingFaceModel {
        let data = widget.data
        let code = data.str("code")
        if JavaScript.trim(code).isEmpty { return .icon }
        let language = data.trimmedStr("language")
        let skin = CodeWidget.skin(data)
        let source = code.replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(of: "\r", with: "\n").split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
        let budget = skin == "compact_snippet" ? 2 : CodeWidget.lineLimit
        let lines = source.filter { !JavaScript.trim($0).isEmpty }.prefix(budget)
        let model = RestingFaceModel.lines(
            lines: lines.enumerated().map { index, line -> RestLine in
                let clipped = NotesAndStudyFamily.clip(line, 30)
                let bare = line.drop(while: { $0 == " " || $0 == "\t" })
                let tone: RestTone? = skin == "diff" && bare.hasPrefix("+") ? .good : skin == "diff" && bare.hasPrefix("-") ? .bad : nil
                return RestLine(key: "line-\(index)", left: skin == "terminal" ? "$ \(clipped)" : clipped, tone: tone)
            },
            eyebrow: RestEyebrow(label: RestText.compact(language.isEmpty ? "Code" : language, 14), note: "\(source.count) lines"),
            mono: true
        )
        return NotesAndStudyFamily.dressed(model, type: CodeWidget.type, data: data)
    }
}

/// The copy control with its short acknowledgement (`useTransientValue`).
struct CopyButton: View {
    let label: String
    let action: () -> Void
    @State private var copied = false

    var body: some View {
        Button {
            action()
            copied = true
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 1_200_000_000)
                copied = false
            }
        } label: {
            Image(systemName: copied ? "checkmark" : "doc.on.doc")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(copied ? Color(hex: "#34d399") : Color.primary.opacity(0.8))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(copied ? "Copied" : label)
        .touchTarget()
    }
}
