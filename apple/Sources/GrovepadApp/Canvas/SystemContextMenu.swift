import Foundation
import GrovepadCore
import GrovepadChrome
#if canImport(AppKit)
import AppKit
#elseif canImport(UIKit)
import UIKit
#endif

// ---------------------------------------------------------------------------
// The widget context menu as the system draws it, over the one
// `ContextMenuModel` row list: an `NSMenu` on the Mac (right-click / held
// press on a card), a `UIMenu` for a pointer's secondary click on iPad, and
// the system action sheet for a finger's held press on iOS (through the
// Chrome presenter, which anchors the iPad popover on the press rect).
// Delete is destructive; a dismissed menu runs nothing.
// ---------------------------------------------------------------------------

public enum SystemContextMenu {
    #if canImport(AppKit)
    /// The rows as menu items; each item runs the row through the model.
    @MainActor
    public static func menu(model: ContextMenuModel, document: BoardDocument, actions: ContextMenuActions) -> NSMenu {
        let menu = NSMenu(title: model.title)
        menu.autoenablesItems = false
        let runner = MenuRunner(model: model, document: document, actions: actions)
        menu.delegate = runner
        objc_setAssociatedObject(menu, &runnerKey, runner, .OBJC_ASSOCIATION_RETAIN)
        for row in model.rows {
            if row.separatorBefore { menu.addItem(.separator()) }
            let item = NSMenuItem(title: row.label, action: #selector(MenuRunner.run(_:)), keyEquivalent: "")
            item.target = runner
            item.representedObject = row.id.rawValue
            item.image = NSImage(systemSymbolName: row.symbol, accessibilityDescription: row.label)
            if row.danger {
                item.attributedTitle = NSAttributedString(string: row.label, attributes: [.foregroundColor: NSColor.systemRed])
            }
            menu.addItem(item)
        }
        return menu
    }

    @MainActor
    final class MenuRunner: NSObject, NSMenuDelegate {
        let model: ContextMenuModel
        let document: BoardDocument
        let actions: ContextMenuActions
        private var ran = false

        init(model: ContextMenuModel, document: BoardDocument, actions: ContextMenuActions) {
            self.model = model
            self.document = document
            self.actions = actions
        }

        @objc func run(_ sender: NSMenuItem) {
            guard let raw = sender.representedObject as? String, let id = ContextMenuRow.ID(rawValue: raw) else { return }
            ran = true
            model.run(id, document: document, actions: actions)
        }

        /// Dismissed without a choice: the chrome's request closes, nothing runs.
        func menuDidClose(_ menu: NSMenu) {
            let ran = self.ran
            DispatchQueue.main.async { [actions] in if !ran { actions.close() } }
        }
    }
    #elseif canImport(UIKit)
    /// A pointer's secondary click on iPad: the system menu.
    @MainActor
    public static func menu(model: ContextMenuModel, document: BoardDocument, actions: ContextMenuActions) -> UIMenu {
        var children: [UIMenuElement] = []
        var group: [UIAction] = []
        func flushGroup() {
            guard !group.isEmpty else { return }
            children.append(children.isEmpty ? UIMenu(options: .displayInline, children: group) : UIMenu(options: .displayInline, children: group))
            group = []
        }
        for row in model.rows {
            if row.separatorBefore { flushGroup() }
            let action = UIAction(title: row.label, image: UIImage(systemName: row.symbol), attributes: row.danger ? [.destructive] : []) { _ in
                model.run(row.id, document: document, actions: actions)
            }
            group.append(action)
        }
        flushGroup()
        return UIMenu(title: model.title, children: children)
    }

    /// A finger's held press: the system action sheet, then the chosen row.
    @MainActor
    public static func presentActionSheet(model: ContextMenuModel, document: BoardDocument, actions: ContextMenuActions, from rect: CGRect, in presenter: UIViewController) {
        NativeActionSheetPresenter.present(model.actionSheet, from: rect, in: presenter) { index in
            if let id = model.row(atSheetIndex: index) {
                model.run(id, document: document, actions: actions)
            } else {
                actions.close()
            }
        }
    }
    #endif
}

#if canImport(AppKit)
nonisolated(unsafe) private var runnerKey = 0
#endif
