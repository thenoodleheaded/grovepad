import SwiftUI
import GrovepadCore

// ---------------------------------------------------------------------------
// The top bar, the zoom row and the mode dock as thin SwiftUI over their
// models. Every control is a `ChromeButton` (44 pt floor); words appear at
// tablet width and up; what drops out of the bar on a phone lives in the
// overflow menu, which is a system `Menu` (touch-sized rows, no hover).
// ---------------------------------------------------------------------------

public struct CanvasToolbarView: View {
    @Environment(\.chromeAdaptation) private var adaptation
    private let model: ToolbarModel

    public init(model: ToolbarModel) { self.model = model }

    public var body: some View {
        HStack(alignment: .top, spacing: 8) {
            ChromePlate {
                HStack(spacing: 2) {
                    ChromeButton("sidebar.left", label: "Open canvas tree") { model.openTree() }
                    if !adaptation.isPhone {
                        Text("grovepad").font(.grove(size: 12, weight: .bold)).padding(.horizontal, 6)
                    }
                    Text(model.workspaceName)
                        .font(.grove(size: 12, weight: .medium))
                        .lineLimit(1)
                        .frame(maxWidth: 176)
                        .padding(.horizontal, 8)
                        .frame(minHeight: GlassTokens.touchTarget)
                        .accessibilityLabel("Workspace: \(model.workspaceName)")
                    if adaptation.viewportClass == .desktop {
                        ChromeButton("chevron.left", label: "Previous view (Alt+Left)", disabled: !model.canGoBack) { model.goBack() }
                        ChromeButton("chevron.right", label: "Next view (Alt+Right)", disabled: !model.canGoForward) { model.goForward() }
                        BreadcrumbsView(model: model)
                    }
                }
            }
            Spacer(minLength: 0)
            ChromePlate {
                HStack(spacing: 2) {
                    ChromeButton("plus.square", label: "Widget", showsLabel: !adaptation.isPhone) { model.openAddWidget() }
                    if CircuitFeature.isEnabled {
                        ChromeButton("bolt", label: model.circuitMode ? "Exit Circuit mode (W)" : "Enter Circuit mode (W)", pressed: model.circuitMode) { model.toggleCircuitMode() }
                    }
                    if !adaptation.isPhone {
                        ChromeButton("magnifyingglass", label: "Search (⌘K)") { model.openPalette() }
                    }
                    if adaptation.viewportClass == .desktop {
                        ChromeButton("slider.horizontal.3", label: "Settings") { model.openSettings() }
                    }
                    if model.overflowVisible(adaptation) {
                        Menu {
                            if model.overflowShowsSearch(adaptation) {
                                Button { model.openPalette() } label: { Label("Search", systemImage: "magnifyingglass") }
                            }
                            Button { model.shapeTree() } label: { Label("Shape a tree", systemImage: "point.3.connected.trianglepath.dotted") }
                            Button { model.frameBoard() } label: { Label("Fit board", systemImage: "arrow.up.left.and.arrow.down.right") }
                            Button { model.openShortcuts() } label: { Label("Controls & shortcuts", systemImage: "keyboard") }
                            Button { model.openSettings() } label: { Label("Settings", systemImage: "slider.horizontal.3") }
                        } label: {
                            Image(systemName: "ellipsis").font(.system(size: 13, weight: .semibold)).frame(minWidth: GlassTokens.touchTarget, minHeight: GlassTokens.touchTarget).contentShape(Rectangle())
                        }
                        .menuStyle(.borderlessButton)
                        .menuIndicator(.hidden)
                        .accessibilityLabel("More canvas actions")
                        .touchTarget()
                    }
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.top, 8)
    }
}

/// Origin / … / Parent / Current. Every crumb but the last is a button.
public struct BreadcrumbsView: View {
    private let model: ToolbarModel

    public init(model: ToolbarModel) { self.model = model }

    public var body: some View {
        HStack(spacing: 2) {
            if model.isAtRootOnly {
                Text("Origin").font(.grove(size: 12)).foregroundStyle(.secondary).padding(.horizontal, 4)
            } else {
                ForEach(Array(model.breadcrumbs.enumerated()), id: \.offset) { index, crumb in
                    if crumb.isEllipsis {
                        Text("…").font(.grove(size: 12)).foregroundStyle(.tertiary)
                    } else {
                        Button { model.openBreadcrumb(crumb) } label: {
                            Text(crumb.name)
                                .font(.grove(size: 12, weight: crumb.isCurrent ? .medium : .regular))
                                .foregroundStyle(crumb.isCurrent ? Color.primary : Color.secondary)
                                .lineLimit(1)
                                .frame(maxWidth: 128)
                                .padding(.horizontal, 6)
                                .frame(minHeight: GlassTokens.touchTarget)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .disabled(crumb.isCurrent)
                    }
                    if index < model.breadcrumbs.count - 1 {
                        Image(systemName: "chevron.right").font(.system(size: 9)).foregroundStyle(.tertiary)
                    }
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Canvas path")
    }
}

/// The bottom-right zoom row. Presets are a system `Menu` (44 pt rows);
/// the percentage is the menu's own label.
public struct ZoomControlsView: View {
    @Environment(\.chromeAdaptation) private var adaptation
    private let model: ZoomControlsModel

    public init(model: ZoomControlsModel) { self.model = model }

    public var body: some View {
        ChromePlate {
            HStack(spacing: 2) {
                if model.showsHistory(adaptation) {
                    ChromeButton("arrow.uturn.backward", label: "Undo (⌘Z)", disabled: !model.document.canUndo) { model.document.undo() }
                    ChromeButton("arrow.uturn.forward", label: "Redo (⇧⌘Z)", disabled: !model.document.canRedo) { model.document.redo() }
                    Divider().frame(height: 20)
                }
                ChromeButton("minus", label: "Zoom out (-)") { model.zoomOut() }
                Menu {
                    Button("Fit board (F)") { model.frameBoard() }
                    Divider()
                    ForEach(ZoomControlsModel.presets, id: \.self) { preset in
                        Button("\(preset)%") { model.zoomTo(percent: preset) }
                    }
                } label: {
                    Text("\(model.zoomPercent)%")
                        .font(.grove(size: 12).monospacedDigit())
                        .frame(minWidth: 48, minHeight: GlassTokens.touchTarget)
                        .contentShape(Rectangle())
                }
                .menuStyle(.borderlessButton)
                .menuIndicator(.hidden)
                .accessibilityLabel("Zoom level — pick a preset")
                ChromeButton("plus", label: "Zoom in (+)") { model.zoomIn() }
                if !adaptation.isPhone {
                    Divider().frame(height: 20)
                    ChromeButton("arrow.up.left.and.arrow.down.right", label: "Frame board (F)") { model.frameBoard() }
                }
            }
        }
    }
}

/// The thumb-reach dock: Navigate, Select, and Undo/Redo below desktop width.
public struct CanvasModeDockView: View {
    @Environment(\.chromeAdaptation) private var adaptation
    private let model: ModeDockModel

    public init(model: ModeDockModel) { self.model = model }

    public var body: some View {
        if model.isVisible(adaptation) {
            ChromePlate {
                HStack(spacing: 4) {
                    ForEach(ModeDockModel.tools, id: \.mode) { tool in
                        ChromeButton(tool.symbol, label: tool.label, pressed: model.isPressed(tool, adaptation)) { model.select(tool) }
                    }
                    if model.showsFrame(adaptation) {
                        Divider().frame(height: 20)
                        ChromeButton("arrow.up.left.and.arrow.down.right", label: "Fit board") { model.frameBoard() }
                    }
                    if model.showsHistory(adaptation) {
                        Divider().frame(height: 20)
                        ChromeButton("arrow.uturn.backward", label: "Undo", disabled: !model.toolbar.canUndo) { model.toolbar.undo() }
                        ChromeButton("arrow.uturn.forward", label: "Redo", disabled: !model.toolbar.canRedo) { model.toolbar.redo() }
                    }
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Canvas tools")
        }
    }
}
