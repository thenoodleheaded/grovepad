import Foundation
import SwiftUI
import GrovepadCore
#if canImport(AppKit)
import AppKit
import Quartz
#else
import UIKit
import QuickLook
#endif

// The Quick Look preview for a `.grovepad` file (roadmap phase 7): reads
// the package with `GrovepadPackage.read` (GrovepadCore only — no chrome, no
// cloud) and shows `PackageSummary` in SwiftUI. A file that is not a
// package shows the reason instead of failing the preview.

#if canImport(AppKit)
final class PreviewViewController: NSViewController, QLPreviewingController {
    override func loadView() {
        view = NSView(frame: NSRect(x: 0, y: 0, width: 520, height: 420))
    }

    func preparePreviewOfFile(at url: URL) async throws {
        let summary = PackagePreview.load(url)
        let host = NSHostingView(rootView: PackageSummaryView(state: summary, fileName: url.lastPathComponent))
        host.frame = view.bounds
        host.autoresizingMask = [.width, .height]
        view.subviews.forEach { $0.removeFromSuperview() }
        view.addSubview(host)
    }
}
#else
final class PreviewViewController: UIViewController, QLPreviewingController {
    func preparePreviewOfFile(at url: URL) async throws {
        let summary = PackagePreview.load(url)
        let host = UIHostingController(rootView: PackageSummaryView(state: summary, fileName: url.lastPathComponent))
        addChild(host)
        host.view.frame = view.bounds
        host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(host.view)
        host.didMove(toParent: self)
    }
}
#endif

enum PackagePreview {
    enum State {
        case summary(PackageSummary)
        case failure(String)
    }

    static func load(_ url: URL) -> State {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        do {
            let bytes = [UInt8](try Data(contentsOf: url))
            return .summary(PackageSummary.build(try GrovepadPackage.read(bytes)))
        } catch {
            return .failure("\(error)")
        }
    }
}

struct PackageSummaryView: View {
    let state: PackagePreview.State
    let fileName: String

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 10) {
                    Image(systemName: "square.grid.2x2.fill").font(.title2).foregroundStyle(.tint)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(fileName).font(.headline).lineLimit(1)
                        Text("Grovepad board").font(.subheadline).foregroundStyle(.secondary)
                    }
                }
                switch state {
                case .failure(let reason):
                    Text("This file could not be read as a Grovepad board.").font(.body)
                    Text(reason).font(.caption).foregroundStyle(.secondary)
                case .summary(let summary):
                    Text(summary.headline).font(.body.weight(.semibold))
                    if summary.mediaCount > 0 {
                        Text("\(summary.mediaCount) media file\(summary.mediaCount == 1 ? "" : "s")").font(.caption).foregroundStyle(.secondary)
                    }
                    ForEach(Array(summary.workspaces.enumerated()), id: \.offset) { _, workspace in
                        HStack {
                            Text(workspace.name).font(.subheadline.weight(.semibold))
                            Spacer()
                            Text("\(workspace.canvasCount) canvas\(workspace.canvasCount == 1 ? "" : "es") · \(workspace.cardCount) card\(workspace.cardCount == 1 ? "" : "s")")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    Divider()
                    ForEach(Array(summary.canvases.enumerated()), id: \.offset) { _, canvas in
                        VStack(alignment: .leading, spacing: 3) {
                            HStack {
                                Text(canvas.name).font(.subheadline)
                                Spacer()
                                Text("\(canvas.cardCount)").font(.caption.monospacedDigit()).foregroundStyle(.secondary)
                            }
                            if !canvas.firstCardTitles.isEmpty {
                                Text(canvas.firstCardTitles.joined(separator: " · ")).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                            }
                        }
                    }
                    if summary.canvasCount > summary.canvases.count {
                        Text("… and \(summary.canvasCount - summary.canvases.count) more").font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
