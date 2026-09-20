import SwiftUI
import GrovepadCore

/// The command palette: search line, three-destination tabs, results on the
/// left, a preview on the right (stacked on a phone). Every row is 56 pt.
public struct CommandPaletteView: View {
    @Environment(\.chromeAdaptation) private var adaptation
    @Bindable private var model: CommandPaletteModel

    public init(model: CommandPaletteModel) { self._model = Bindable(model) }

    public var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                TextField("Search widgets or actions…", text: Binding(get: { model.query }, set: { model.setQuery($0) }))
                    .textFieldStyle(.plain)
                    .font(.grove(size: 14))
                    .onSubmit { if let focused = model.focusedResult { model.execute(focused) } }
                GhostButton("xmark", label: "Close palette") { model.close() }
            }
            .padding(.horizontal, 16)
            .frame(minHeight: 52)
            Divider()
            HStack(spacing: 4) {
                ForEach(PaletteCategory.allCases, id: \.self) { tab in
                    Button { model.setCategory(tab) } label: {
                        Text(tab.label)
                            .font(.grove(size: 12, weight: .medium))
                            .foregroundStyle(model.category == tab ? Color.tone("#d1fae5", light: "#065f46") : Color.secondary)
                            .frame(maxWidth: .infinity, minHeight: GlassTokens.touchTarget)
                            .background(model.category == tab ? Color.lift.opacity(0.1) : .clear, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(model.category == tab ? .isSelected : [])
                }
            }
            .padding(8)
            let results = model.results
            let layout = adaptation.isPhone ? AnyLayout(VStackLayout(spacing: 0)) : AnyLayout(HStackLayout(spacing: 0))
            layout {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        if results.isEmpty {
                            Text("No results").font(GlassType.body).foregroundStyle(.secondary).frame(maxWidth: .infinity, minHeight: 120)
                        }
                        ForEach(Array(results.enumerated()), id: \.element.id) { index, result in
                            Button {
                                model.focusedIndex = index
                                model.execute(result)
                            } label: {
                                HStack(alignment: .top, spacing: 10) {
                                    Image(systemName: symbol(result)).font(.system(size: 10, weight: .semibold)).foregroundStyle(tint(result)).frame(width: 18, height: 18).background(tint(result).opacity(0.15), in: RoundedRectangle(cornerRadius: 4))
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(result.title).font(.grove(size: 12, weight: .medium)).lineLimit(1)
                                        Text(result.subtitle).font(.grove(size: 10)).foregroundStyle(.secondary).lineLimit(1)
                                    }
                                    Spacer(minLength: 0)
                                }
                                .padding(.horizontal, 12)
                                .frame(minHeight: 56)
                                .background(index == model.focusedIndex ? Color.lift.opacity(0.08) : .clear)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityAddTraits(index == model.focusedIndex ? .isSelected : [])
                        }
                    }
                }
                .frame(maxWidth: adaptation.isPhone ? .infinity : 260)
                if !adaptation.isPhone { Divider() }
                preview(model.focusedResult)
            }
        }
        .frame(minWidth: adaptation.isPhone ? 0 : 640, minHeight: 360)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Command palette")
    }

    private func symbol(_ result: PaletteResult) -> String {
        switch result.kind {
        case .canvas: return "folder"
        case .widget: return "square.stack"
        case .action: return result.isCreate ? "plus.square" : "bolt"
        }
    }

    private func tint(_ result: PaletteResult) -> Color {
        switch result.kind {
        case .canvas: return Color(hex: "#fbbf24")
        case .widget: return Color(hex: "#34d399")
        case .action: return result.isCreate ? Color(hex: "#38bdf8") : Color(hex: "#a78bfa")
        }
    }

    @ViewBuilder
    private func preview(_ result: PaletteResult?) -> some View {
        if let result {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: symbol(result)).foregroundStyle(tint(result))
                    VStack(alignment: .leading, spacing: 2) {
                        Text(result.title).font(.grove(size: 12, weight: .semibold))
                        Text(result.subtitle).font(.grove(size: 11)).foregroundStyle(.secondary)
                    }
                }
                Well {
                    VStack(alignment: .leading, spacing: 6) {
                        previewRow("Type", result.kind == .action ? (result.isCreate ? "Create Widget" : "Canvas Action") : result.kind == .canvas ? "Canvas" : "Widget")
                        if let canvasId = result.canvasId {
                            previewRow(result.kind == .canvas ? "Path" : "Canvas", model.document.canvasPath(to: canvasId).map(\.name).joined(separator: " › "))
                        }
                        if result.kind == .canvas {
                            let count = model.document.board.widgets(on: result.id).count
                            previewRow("Cards", count == 1 ? "1 card" : "\(count) cards")
                        }
                    }
                }
                if result.kind != .action {
                    Text(result.kind == .canvas ? "Press Enter to open this canvas" : "Press Enter to leap to this widget").font(GlassType.label).foregroundStyle(Color.tone("#6ee7b7", light: "#047857"))
                }
                Spacer(minLength: 0)
            }
            .padding(16)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        } else {
            Text("Select a result to preview").font(GlassType.body).foregroundStyle(.tertiary).frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private func previewRow(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label.uppercased()).font(GlassType.label).foregroundStyle(.tertiary)
            Spacer()
            Text(value).font(.grove(size: 11)).lineLimit(1)
        }
    }
}
