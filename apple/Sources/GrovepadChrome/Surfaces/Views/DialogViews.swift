import SwiftUI
import GrovepadCore

// ---------------------------------------------------------------------------
// One compact surface for confirmations and the deletion warning; the toast
// stack; the empty-canvas plate; the shortcuts overlay.
// ---------------------------------------------------------------------------

public struct ConfirmDialogView: View {
    private let model: ConfirmDialogModel

    public init(model: ConfirmDialogModel) { self.model = model }

    public var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .top, spacing: 14) {
                Image(systemName: "exclamationmark.triangle")
                    .font(.system(size: 17))
                    .foregroundStyle(model.destructive ? Color.tone("#fca5a5", light: "#b91c1c") : Color.tone("#fcd34d", light: "#b45309"))
                    .frame(width: 40, height: 40)
                    .background((model.destructive ? Color(hex: "#f87171") : Color(hex: "#fbbf24")).opacity(0.1), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                VStack(alignment: .leading, spacing: 4) {
                    Text(model.title).font(.grove(size: 13, weight: .semibold))
                    Text(model.description).font(.grove(size: 11)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                }
            }
            HStack(spacing: 8) {
                Spacer(minLength: 0)
                dialogButton(model.cancelLabel, tone: .neutral) { model.onClose() }
                if let secondary = model.secondaryLabel, let onSecondary = model.onSecondary {
                    dialogButton(secondary, tone: .neutral) { onSecondary(); model.onClose() }
                }
                dialogButton(model.confirmLabel, tone: model.destructive ? .destructive : .primary) { model.onConfirm(); model.onClose() }
            }
        }
        .padding(20)
        .frame(maxWidth: 384)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(model.title)
    }

    private enum Tone { case neutral, primary, destructive }

    private func dialogButton(_ title: String, tone: Tone, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.grove(size: 12, weight: .semibold))
                .foregroundStyle(tone == .destructive ? Color.tone("#fecaca", light: "#991b1b") : tone == .primary ? Color.tone("#d1fae5", light: "#065f46") : Color.primary.opacity(0.85))
                .padding(.horizontal, 14)
                .frame(minHeight: GlassTokens.touchTarget)
                .background(
                    tone == .destructive ? Color(hex: "#f87171").opacity(0.18) : tone == .primary ? Color(hex: "#34d399").opacity(0.18) : Color.lift.opacity(0.08),
                    in: RoundedRectangle(cornerRadius: 12, style: .continuous)
                )
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// The nested-canvas deletion warning, presented while the model is pending.
public struct DeletionDialog: View {
    private let model: DeletionDialogModel

    public init(model: DeletionDialogModel) { self.model = model }

    public var body: some View {
        ConfirmDialogView(model: model.dialog)
    }
}

/// Bottom-centre toast stack, above the selection bar, below dialogs.
public struct ToastStack: View {
    private let model: ToastModel

    public init(model: ToastModel) { self.model = model }

    public var body: some View {
        VStack(spacing: 8) {
            ForEach(model.toasts) { toast in
                HStack(spacing: 10) {
                    Text(toast.message).font(.grove(size: 12)).foregroundStyle(toast.tone == .danger ? Color.tone("#fecaca", light: "#991b1b") : Color.primary.opacity(0.9))
                    if let action = toast.action {
                        Button(action.label) { model.runAction(toast.id) }
                            .buttonStyle(.plain)
                            .font(.grove(size: 12, weight: .semibold))
                            .foregroundStyle(Color.tone("#6ee7b7", light: "#047857"))
                            .touchTarget()
                    }
                    GhostButton("xmark", label: "Dismiss") { model.dismiss(toast.id) }
                }
                .padding(.leading, 16)
                .padding(.trailing, 4)
                .frame(minHeight: GlassTokens.touchTarget)
                .background(GlassTokens.plate.opacity(0.94), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(GlassTokens.stroke))
                .opacity(toast.leaving ? 0 : 1)
                .animation(.easeOut(duration: 0.18), value: toast.leaving)
                .accessibilityElement(children: .contain)
                .accessibilityLabel(toast.message)
            }
        }
        .padding(.bottom, 80)
    }
}

/// The empty-canvas plate: one primary action, keyboard hints only where a
/// keyboard is plausible.
public struct EmptyCanvasView: View {
    @Environment(\.chromeAdaptation) private var adaptation
    private let document: BoardDocument
    private let onAddWidget: () -> Void
    private let onSearch: () -> Void

    public init(document: BoardDocument, onAddWidget: @escaping () -> Void, onSearch: @escaping () -> Void) {
        self.document = document
        self.onAddWidget = onAddWidget
        self.onSearch = onSearch
    }

    public var isEmpty: Bool { document.board.widgets(on: document.activeCanvasId).isEmpty }

    public var body: some View {
        #if os(macOS)
        if isEmpty {
            // The Mac shapes a tree by double-clicking the canvas and adds a
            // single widget with ⌘N; say so, quietly.
            Text("Double click to shape a tree · ⌘N adds a widget")
                .font(.grove(size: 14, weight: .medium))
                .foregroundStyle(.tertiary)
                .allowsHitTesting(false)
                .accessibilityLabel("Empty canvas. Double click to shape a tree, or press Command N to add a widget.")
        }
        #else
        cards
        #endif
    }

    @ViewBuilder
    private var cards: some View {
        if isEmpty {
            VStack(spacing: 14) {
                Image(systemName: "leaf").font(.system(size: 40, weight: .medium)).foregroundStyle(Color.tone("#6ee7b7", light: "#047857"))
                Text("Start with one useful thing").font(.grove(size: 17, weight: .semibold))
                Button(action: onAddWidget) {
                    Label("Add widget", systemImage: "plus")
                        .font(.grove(size: 13, weight: .semibold))
                        .foregroundStyle(Color(red: 0.05, green: 0.05, blue: 0.06))
                        .frame(maxWidth: .infinity, minHeight: GlassTokens.touchTarget)
                        .background(Color(hex: "#6ee7b7"), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                Button(action: onSearch) {
                    Label("Search", systemImage: "magnifyingglass")
                        .font(.grove(size: 12, weight: .medium))
                        .frame(maxWidth: .infinity, minHeight: GlassTokens.touchTarget)
                        .background(Color.lift.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                if adaptation.hasKeyboardHints {
                    Text("⌘K to search · ? for every shortcut").font(.grove(size: 11)).foregroundStyle(.secondary)
                }
            }
            .padding(28)
            .frame(maxWidth: 320)
            .background(GlassTokens.plate.opacity(0.9), in: RoundedRectangle(cornerRadius: 30, style: .continuous))
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Empty canvas actions")
        }
    }
}

/// The full controls reference with a visible close; actionable rows run.
public struct ShortcutsOverlayView: View {
    private let actions: ShortcutsModel.Actions

    public init(actions: ShortcutsModel.Actions) { self.actions = actions }

    public var body: some View {
        VStack(spacing: 0) {
            HStack {
                Label("Controls & shortcuts", systemImage: "keyboard").font(.grove(size: 13, weight: .semibold))
                Spacer()
                GhostButton("xmark", label: "Close shortcuts") { actions.close() }
            }
            .padding(.horizontal, 20)
            .frame(minHeight: 52)
            Divider()
            ScrollView {
                ShortcutTableView(actions: actions).padding(20)
            }
        }
        .frame(minWidth: 320, idealWidth: 640, minHeight: 320)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Controls and keyboard shortcuts")
    }
}
