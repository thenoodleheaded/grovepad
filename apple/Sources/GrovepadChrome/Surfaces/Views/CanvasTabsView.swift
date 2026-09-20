import SwiftUI
import GrovepadCore

/// The open-canvas row: hidden on phones and with one tab; each tab is a
/// 44 pt button with its own visible close; "+" opens the origin canvas.
public struct CanvasTabsView: View {
    @Environment(\.chromeAdaptation) private var adaptation
    private let model: CanvasTabsModel

    public init(model: CanvasTabsModel) { self.model = model }

    public var body: some View {
        if model.isRowVisible(adaptation) {
            ChromePlate {
                HStack(spacing: 4) {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 4) {
                            ForEach(model.openTabs, id: \.id) { tab in
                                let selected = tab.id == model.activeTabId
                                HStack(spacing: 2) {
                                    Button { model.activate(tab.id) } label: {
                                        Text(model.name(of: tab))
                                            .font(.grove(size: 12, weight: .medium))
                                            .lineLimit(1)
                                            .frame(maxWidth: 176)
                                            .padding(.leading, 10)
                                            .frame(minHeight: GlassTokens.touchTarget)
                                            .contentShape(Rectangle())
                                    }
                                    .buttonStyle(.plain)
                                    .accessibilityAddTraits(selected ? .isSelected : [])
                                    GhostButton("xmark", label: "Close \(model.name(of: tab)) tab") { model.close(tab.id) }
                                }
                                .background(selected ? Color.lift.opacity(0.1) : .clear, in: Capsule())
                            }
                        }
                    }
                    ChromeButton("plus", label: "Open a new tab on this workspace's origin canvas", disabled: model.rootCanvasId == nil) {
                        if let root = model.rootCanvasId { model.open(root) }
                    }
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Open canvases")
        }
    }
}
