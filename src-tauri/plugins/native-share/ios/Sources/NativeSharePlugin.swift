import Foundation
import Tauri
import UIKit

private final class ShareFileArgs: Decodable {
    let fileName: String
    let base64: String
}

final class NativeSharePlugin: Plugin {
    /// Hand a file to iOS's share sheet.
    ///
    /// This exists because WKWebView ignores an `<a download>` click outright,
    /// which made every export in the app a button that appeared to work and
    /// produced nothing. The sheet is also the answer an iPhone owner expects:
    /// Files, Mail, AirDrop and the rest are where a file goes on this device,
    /// not a downloads folder.
    @objc public func shareFile(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(ShareFileArgs.self)

        // The name becomes a path component, so it must stay a plain name. Rust
        // checks this too; neither side is allowed to assume the other did.
        let name = (args.fileName as NSString).lastPathComponent
        guard !name.isEmpty, name != ".", name != ".." else {
            invoke.reject("The file name is not a plain name")
            return
        }
        guard let data = Data(base64Encoded: args.base64) else {
            invoke.reject("The file payload is not valid base64")
            return
        }

        // A unique directory per share: two exports on the same day carry the
        // same filename, and writing both to the temp root would have the
        // second overwrite a file the first sheet may still be reading.
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("share-\(UUID().uuidString)", isDirectory: true)
        let url = directory.appendingPathComponent(name)
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            try data.write(to: url, options: .atomic)
        } catch {
            invoke.reject("Could not stage the file to share: \(error.localizedDescription)")
            return
        }

        DispatchQueue.main.async {
            guard let presenter = Self.topViewController() else {
                try? FileManager.default.removeItem(at: directory)
                invoke.reject("No view controller is available to present the share sheet")
                return
            }

            let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
            // iPad presents this as a popover and RAISES if it has no anchor.
            // The webview fills the window, so the window's own centre is the
            // only honest anchor available from here.
            if let popover = sheet.popoverPresentationController {
                popover.sourceView = presenter.view
                popover.sourceRect = CGRect(
                    x: presenter.view.bounds.midX,
                    y: presenter.view.bounds.midY,
                    width: 0,
                    height: 0
                )
                popover.permittedArrowDirections = []
            }
            // The staged copy has to outlive the sheet, so it is cleaned up on
            // dismissal rather than on return — otherwise AirDrop and Mail can
            // be handed a file that has already been deleted.
            sheet.completionWithItemsHandler = { _, _, _, _ in
                try? FileManager.default.removeItem(at: directory)
            }

            presenter.present(sheet, animated: true) {
                // Resolve once the sheet is up. What the person picks after
                // that is between them and iOS; the app only needs to know it
                // must not fall back to a download that cannot work here.
                invoke.resolve()
            }
        }
    }

    /// The frontmost controller, following presentations. Tauri presents its own
    /// controllers (the Apple sign-in sheet, for one), and presenting onto a
    /// controller that is already covered silently shows nothing.
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

@_cdecl("init_plugin_native_share")
func initPlugin() -> Plugin {
    NativeSharePlugin()
}
