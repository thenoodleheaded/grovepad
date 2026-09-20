import SwiftUI
import GrovepadCore
#if canImport(UIKit)
import UIKit
#endif

// ---------------------------------------------------------------------------
// The context menu's two presenters over one `ContextMenuModel`: a system
// menu (`Menu` / `.contextMenu`) on the Mac and iPad pointer, and the
// system action sheet (UIAlertController) on iOS — never the glass popover,
// never both at once. Delete is destructive (red); dismissing changes nothing.
// ---------------------------------------------------------------------------

public struct WidgetContextMenuContent: View {
    private let model: ContextMenuModel
    private let document: BoardDocument
    private let actions: ContextMenuActions

    public init(model: ContextMenuModel, document: BoardDocument, actions: ContextMenuActions) {
        self.model = model
        self.document = document
        self.actions = actions
    }

    public var body: some View {
        ForEach(model.rows) { row in
            if row.separatorBefore { Divider() }
            Button(role: row.danger ? .destructive : nil) {
                model.run(row.id, document: document, actions: actions)
            } label: {
                Label(row.label, systemImage: row.symbol)
            }
        }
    }
}

public extension View {
    /// Attach the widget menu to a card: a right-click / held press opens
    /// the system menu with the model's rows.
    func widgetContextMenu(widgetId: String, document: BoardDocument, actions: ContextMenuActions) -> some View {
        contextMenu {
            if let model = ContextMenuModel(widgetId: widgetId, document: document) {
                WidgetContextMenuContent(model: model, document: document, actions: actions)
            }
        }
    }
}

#if canImport(UIKit)
/// `presentNativeMenu` on iOS: the action sheet, anchored to the press on
/// iPad (a zero-size rect at the point; iPhone ignores it). Presented once
/// per opening; the completion receives the chosen index or nil.
public enum NativeActionSheetPresenter {
    @MainActor
    public static func present(_ sheet: ContextMenuModel.ActionSheet, from sourceRect: CGRect, in presenter: UIViewController, completion: @escaping (Int?) -> Void) {
        guard !sheet.items.isEmpty else { completion(nil); return }
        let controller = UIAlertController(title: sheet.title, message: nil, preferredStyle: .actionSheet)
        for (index, item) in sheet.items.enumerated() {
            controller.addAction(UIAlertAction(title: item.label, style: item.danger ? .destructive : .default) { _ in completion(index) })
        }
        controller.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completion(nil) })
        if let popover = controller.popoverPresentationController {
            popover.sourceView = presenter.view
            popover.sourceRect = sourceRect
        }
        presenter.present(controller, animated: true)
    }
}
#endif
