import Foundation
import Tauri
import UIKit

private final class MenuItemArgs: Decodable {
    let label: String
    let danger: Bool?
}

private final class SourceRectArgs: Decodable {
    let x: Double
    let y: Double
    let width: Double
    let height: Double
}

private final class PresentMenuArgs: Decodable {
    let title: String?
    let items: [MenuItemArgs]
    let sourceRect: SourceRectArgs
}

final class NativeMenuPlugin: Plugin {
    /// Present the app's contextual actions as the system action sheet.
    ///
    /// Resolves with the chosen row, or a null index when the sheet was
    /// dismissed. Dismissal is an ordinary answer rather than a rejection:
    /// tapping outside is how iOS says "never mind", and the caller has to be
    /// able to tell that apart from the bridge failing.
    @objc public func presentMenu(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(PresentMenuArgs.self)
        guard !args.items.isEmpty else {
            invoke.reject("A menu needs at least one item")
            return
        }

        DispatchQueue.main.async {
            guard let presenter = Self.topViewController() else {
                invoke.reject("No view controller is available to present the menu")
                return
            }

            let sheet = UIAlertController(
                title: args.title,
                message: nil,
                preferredStyle: .actionSheet
            )

            for (index, item) in args.items.enumerated() {
                sheet.addAction(UIAlertAction(
                    title: item.label,
                    // iOS draws a destructive action in red on its own; the flag
                    // carries the same meaning the web menu gives it.
                    style: item.danger == true ? .destructive : .default,
                    handler: { _ in invoke.resolve(["index": index]) }
                ))
            }
            // Every sheet needs an explicit way out. A phone has no Escape key,
            // and on iPad a tap outside the popover is the only other route.
            sheet.addAction(UIAlertAction(title: "Cancel", style: .cancel, handler: { _ in
                invoke.resolve(["index": nil])
            }))

            // iPad presents an action sheet as a popover and RAISES without an
            // anchor. The rect arrives in CSS pixels, which are points here
            // because the webview's zoom is pinned to 1.
            if let popover = sheet.popoverPresentationController {
                popover.sourceView = presenter.view
                popover.sourceRect = CGRect(
                    x: args.sourceRect.x,
                    y: args.sourceRect.y,
                    width: args.sourceRect.width,
                    height: args.sourceRect.height
                )
            }

            presenter.present(sheet, animated: true)
        }
    }

    /// The frontmost controller, following presentations — presenting onto one
    /// that is already covered silently shows nothing.
    private static func topViewController() -> UIViewController? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let window = scenes.flatMap(\.windows).first { $0.isKeyWindow }
            ?? scenes.flatMap(\.windows).first
        var top = window?.rootViewController
        while let presented = top?.presentedViewController {
            top = presented
        }
        return top
    }
}

@_cdecl("init_plugin_native_menu")
func initPlugin() -> Plugin {
    NativeMenuPlugin()
}
