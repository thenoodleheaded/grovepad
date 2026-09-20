import Foundation
import Observation
import GrovepadCore

// ---------------------------------------------------------------------------
// Confirmation and deletion dialogs (`ConfirmDialog.tsx`,
// `WidgetDeletionDialog.tsx`, `store/useWidgetDeletionDialogStore.ts`).
// One compact surface, neutral / primary / destructive actions, no
// categories. A deletion only asks when it takes more than what was
// pointed at: descendants on nested canvases, or more than one canvas.
// ---------------------------------------------------------------------------

public struct ConfirmDialogModel {
    public var title: String
    public var description: String
    public var confirmLabel: String
    public var cancelLabel: String
    public var secondaryLabel: String?
    public var destructive: Bool
    public var onConfirm: () -> Void
    public var onSecondary: (() -> Void)?
    public var onClose: () -> Void

    public init(title: String, description: String, confirmLabel: String = "Confirm", cancelLabel: String = "Cancel", secondaryLabel: String? = nil, destructive: Bool = false, onConfirm: @escaping () -> Void, onSecondary: (() -> Void)? = nil, onClose: @escaping () -> Void = {}) {
        self.title = title
        self.description = description
        self.confirmLabel = confirmLabel
        self.cancelLabel = cancelLabel
        self.secondaryLabel = secondaryLabel
        self.destructive = destructive
        self.onConfirm = onConfirm
        self.onSecondary = onSecondary
        self.onClose = onClose
    }

    /// The workspace deletion confirmation from the workspace menu.
    public static func deleteWorkspace(named name: String, onConfirm: @escaping () -> Void, onClose: @escaping () -> Void) -> ConfirmDialogModel {
        ConfirmDialogModel(
            title: "Delete “\(name)”?",
            description: "Every canvas, widget, connection, and glue cluster inside this workspace will be removed. You can immediately undo this from the confirmation toast.",
            confirmLabel: "Delete workspace", destructive: true, onConfirm: onConfirm, onClose: onClose
        )
    }
}

public struct PendingWidgetDeletion: Equatable {
    public var ids: [String]
    public var impact: BoardDocument.DeletionImpact
}

@Observable
public final class DeletionDialogModel {
    public let document: BoardDocument
    public private(set) var pending: PendingWidgetDeletion?

    public init(document: BoardDocument) {
        self.document = document
    }

    /// `request`: locked cards are already skipped by the impact; a plain
    /// deletion runs at once, a cascade waits for the dialog.
    public func request(_ ids: [String]) {
        let impact = document.deletionImpact(of: ids)
        guard !impact.directWidgetIds.isEmpty else { return }
        let descendants = impact.removedWidgetIds.count - impact.directWidgetIds.count
        if descendants > 0 || impact.removedCanvasIds.count > 1 {
            pending = PendingWidgetDeletion(ids: impact.directWidgetIds, impact: impact)
            return
        }
        document.deleteWidgets(impact.directWidgetIds)
    }

    public func close() { pending = nil }

    public func confirm() {
        guard let pending else { return }
        self.pending = nil
        document.deleteWidgets(pending.ids)
    }

    public var isPresented: Bool { pending != nil }

    public var title: String { "Delete this nested canvas and its contents?" }

    public var description: String {
        let widgets = pending?.impact.removedWidgetIds.count ?? 0
        let canvases = pending?.impact.removedCanvasIds.count ?? 0
        return "This removes \(widgets) widget\(widgets == 1 ? "" : "s") across \(canvases) nested canvas\(canvases == 1 ? "" : "es"). You can immediately restore the entire deletion with Undo."
    }

    public var confirmLabel: String { "Delete subtree" }

    public var dialog: ConfirmDialogModel {
        ConfirmDialogModel(title: title, description: description, confirmLabel: confirmLabel, destructive: true, onConfirm: { [weak self] in self?.confirm() }, onClose: { [weak self] in self?.close() })
    }
}
