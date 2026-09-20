import Foundation
import GrovepadCore
#if canImport(AppKit)
import AppKit
#elseif canImport(UIKit)
import UIKit
#endif

// ---------------------------------------------------------------------------
// One way to hand a finished file to the person who asked for it (the web's
// `utils/fileDelivery.ts`): the system share sheet on iPhone and iPad
// (`UIActivityViewController`, anchored on iPad), the sharing picker on the
// Mac (`NSSharingServicePicker`). Both take a real file, so the archive is
// written to a scratch folder first. Callers phrase their confirmation from
// the returned route: an iPhone owner has no downloads folder.
// ---------------------------------------------------------------------------

public enum DeliveryRoute: String, Equatable, Sendable {
    case shared
    case saved
}

public enum ShareExport {
    /// `Grovepad — <title> <yyyy-MM-dd>.grovepad`, safe for every file system.
    public static func fileName(title: String, date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        var safe = title.trimmingCharacters(in: .whitespacesAndNewlines)
        for bad in ["/", ":", "\\", "\n", "\r", "\t"] { safe = safe.replacingOccurrences(of: bad, with: "-") }
        if safe.isEmpty { safe = "Board" }
        if safe.count > 60 { safe = String(safe.prefix(60)) }
        return "Grovepad — \(safe) \(formatter.string(from: date)).grovepad"
    }

    /// Write the bytes under a fresh scratch folder (one per export, so two
    /// exports of the same name never fight).
    public static func temporaryFile(bytes: [UInt8], fileName: String, fileManager: FileManager = .default) throws -> URL {
        let folder = AppPaths.exportsDirectory(fileManager: fileManager).appendingPathComponent(UUID().uuidString, isDirectory: true)
        try fileManager.createDirectory(at: folder, withIntermediateDirectories: true)
        let url = folder.appendingPathComponent(fileName.components(separatedBy: "/").last ?? fileName)
        try Data(bytes).write(to: url, options: .atomic)
        return url
    }

    #if canImport(AppKit)
    /// The sharing picker beside `view` at `rect` (view coordinates).
    @MainActor
    public static func present(fileURL: URL, from view: NSView, at rect: NSRect) -> DeliveryRoute {
        let picker = NSSharingServicePicker(items: [fileURL])
        picker.show(relativeTo: rect, of: view, preferredEdge: .minY)
        return .shared
    }
    #elseif canImport(UIKit)
    /// The share sheet from `presenter`, anchored at `rect` for iPad's popover.
    @MainActor
    public static func present(fileURL: URL, from presenter: UIViewController, at rect: CGRect) -> DeliveryRoute {
        let controller = UIActivityViewController(activityItems: [fileURL], applicationActivities: nil)
        if let popover = controller.popoverPresentationController {
            popover.sourceView = presenter.view
            popover.sourceRect = rect
        }
        presenter.present(controller, animated: true)
        return .shared
    }
    #endif
}
