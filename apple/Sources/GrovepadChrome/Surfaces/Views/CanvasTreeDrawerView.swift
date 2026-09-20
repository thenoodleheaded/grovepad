import SwiftUI
import GrovepadCore

// ---------------------------------------------------------------------------
// The canvas tree drawer: canvas rows with a disclosure, card rows beneath,
// row actions (move, rename, delete) always present and 44 pt, and the
// "Move" chooser as a chrome panel (a bottom sheet on phones).
// ---------------------------------------------------------------------------

public struct CanvasTreeDrawerView: View {
    @Bindable private var model: CanvasTreeModel
    @State private var renameText = ""

    public init(model: CanvasTreeModel) { self._model = Bindable(model) }

    public var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text(model.workspace?.name ?? "Workspace").font(.grove(size: 12, weight: .semibold))
                Spacer()
                GhostButton("xmark", label: "Close canvas tree") { model.close() }
            }
            .padding(.horizontal, 12)
            .frame(minHeight: GlassTokens.touchTarget)
            Divider()
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(model.entries, id: \.key) { entry in
                        row(entry)
                    }
                }
                .padding(8)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Canvas tree")
        .chromePanel(isPresented: Binding(get: { model.movingCanvasId != nil }, set: { if !$0 { model.movingCanvasId = nil } })) {
            moveChooser
        }
    }

    @ViewBuilder
    private func row(_ entry: CanvasOutlineEntry) -> some View {
        let indent = CGFloat(entry.level - 1) * 14
        switch entry.kind {
        case .canvas:
            if let canvas = model.document.canvas(entry.id) {
                HStack(spacing: 4) {
                    GhostButton(model.isExpanded(canvas.id) ? "chevron.down" : "chevron.right", label: model.isExpanded(canvas.id) ? "Collapse \(canvas.name)" : "Expand \(canvas.name)") {
                        model.toggleExpanded(canvas.id)
                    }
                    .opacity(model.hasChildren(canvas.id) ? 1 : 0.25)
                    if model.renamingCanvasId == canvas.id {
                        TextField("Canvas name", text: $renameText)
                            .textFieldStyle(.plain)
                            .onSubmit { model.rename(canvas.id, to: renameText) }
                        GhostButton("xmark", label: "Cancel rename") { model.renamingCanvasId = nil }
                    } else {
                        Button { model.open(canvas.id) } label: {
                            HStack(spacing: 6) {
                                Image(systemName: "doc").font(.system(size: 11))
                                Text(canvas.name).font(GlassType.body).lineLimit(1)
                                Spacer(minLength: 0)
                                Text("\(model.cardCount(canvas.id))").font(GlassType.label).foregroundStyle(.tertiary)
                            }
                            .foregroundStyle(canvas.id == model.document.activeCanvasId ? Color.tone("#c4b5fd", light: "#6d28d9") : Color.primary.opacity(0.85))
                            .frame(minHeight: GlassTokens.touchTarget)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("\(canvas.name), \(model.cardCount(canvas.id)) cards")
                        .accessibilityAddTraits(canvas.id == model.document.activeCanvasId ? .isSelected : [])
                        if model.canMoveOrDelete(canvas.id) {
                            GhostButton("folder", label: "Move \(canvas.name)") { model.movingCanvasId = canvas.id }
                        }
                        GhostButton("pencil", label: "Rename \(canvas.name)") {
                            renameText = canvas.name
                            model.renamingCanvasId = canvas.id
                        }
                        if model.canMoveOrDelete(canvas.id) {
                            GhostButton("trash", label: "Delete \(canvas.name)") { model.deleteCanvas(canvas.id) }
                        }
                    }
                }
                .padding(.leading, indent)
            }
        case .widget:
            if let widget = model.document.widget(entry.id) {
                Button { model.activateWidget(widget.id) } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "square.fill").font(.system(size: 6)).foregroundStyle(Color(hex: "#34d399").opacity(0.7))
                        VStack(alignment: .leading, spacing: 1) {
                            Text(widget.title).font(GlassType.body).lineLimit(1)
                            Text(WidgetRegistry.definition(for: widget.type)?.label ?? widget.type).font(GlassType.label).foregroundStyle(.tertiary)
                        }
                        Spacer(minLength: 0)
                    }
                    .frame(minHeight: GlassTokens.touchTarget)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .padding(.leading, indent + 16)
                .accessibilityLabel("\(widget.title), \(WidgetRegistry.definition(for: widget.type)?.label ?? widget.type) card")
                .accessibilityAddTraits(model.document.isSelected(widget.id) ? .isSelected : [])
            }
        }
    }

    private var moveChooser: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Move “\(model.movingCanvasId.flatMap { model.document.canvasName($0) } ?? "canvas")”").font(.grove(size: 13, weight: .semibold))
                    Text("Choose its new parent canvas.").font(GlassType.label).foregroundStyle(.secondary)
                }
                Spacer()
                GhostButton("xmark", label: "Cancel moving canvas") { model.movingCanvasId = nil }
            }
            if model.moveTargets.isEmpty {
                Text("No other legal parent canvas.").font(GlassType.body).foregroundStyle(.secondary).frame(maxWidth: .infinity, minHeight: 88)
            }
            ForEach(model.moveTargets, id: \.id) { target in
                Button { model.move(to: target.id) } label: {
                    Label(target.name, systemImage: "doc").font(GlassType.body).frame(maxWidth: .infinity, minHeight: GlassTokens.touchTarget, alignment: .leading).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(16)
        .frame(minWidth: 280)
    }
}
