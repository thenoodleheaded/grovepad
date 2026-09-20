import SwiftUI
import GrovepadCore
#if os(macOS)
import AppKit
#endif

// ---------------------------------------------------------------------------
// The tree shaper's surfaces:
//
//   GhostTreeOverlay   the sketch on the canvas (`GhostTreeShaper.tsx`)
//   ShaperHUDView      the bottom banner with Cancel / Create Tree (`ShaperHUD.tsx`)
//   GhostNodePickerSheet  the widget library in selection mode
//                      (`AddWidgetModal` with `selection`)
//
// The overlay is screen-space SwiftUI laid over the canvas host: it follows
// `ChromeState.cameraTransform` (moved every camera frame) and draws the tree
// in world units under one `scaleEffect`, so strokes and dashes scale with
// zoom exactly as the web's SVG inside the world transform does. Drags are
// measured in the overlay's own (screen) space, as the web's `clientX`.
//
// Touch answers: every point is at least 40 world units and its press area
// is padded to the 44 pt floor on screen; drag is the only way to shape (as
// on the web) but choosing widgets is a tap; multi-select is shift-click with
// a keyboard and the Select tool on touch (no modifier needed); Cancel is a
// visible button, Escape is an addition. Reduced motion drops the pop.
// ---------------------------------------------------------------------------

public struct GhostTreeOverlay: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var colorScheme
    private let shaper: TreeShaperModel
    private let chrome: ChromeState
    @State private var pressedId: String?

    private static let space = "gp-ghost-tree"
    /// Room around the tree for shadows and the enlarged press areas.
    private static let margin = 40.0

    public init(shaper: TreeShaperModel, chrome: ChromeState) {
        self.shaper = shaper
        self.chrome = chrome
    }

    public var body: some View {
        let nodes = shaper.renderedNodes
        let transform = chrome.cameraTransform
        ZStack(alignment: .topLeading) {
            if let bounds = GhostTreeOverlay.bounds(nodes) {
                let origin = CanvasGeometry.worldToScreen(Vector2D(x: bounds.x, y: bounds.y), transform: transform)
                world(nodes, bounds: bounds, zoom: transform.zoom)
                    .frame(width: bounds.width, height: bounds.height, alignment: .topLeading)
                    .scaleEffect(transform.zoom, anchor: .topLeading)
                    .offset(x: origin.x, y: origin.y)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .coordinateSpace(.named(GhostTreeOverlay.space))
        .animation(reduceMotion ? nil : .spring(response: 0.3, dampingFraction: 0.82), value: nodes)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Tree shaper")
    }

    static func bounds(_ nodes: [GhostTreeNode]) -> WorldRect? {
        guard !nodes.isEmpty else { return nil }
        var minX = Double.infinity, minY = Double.infinity, maxX = -Double.infinity, maxY = -Double.infinity
        for node in nodes {
            let grid = GhostTree.grid(count: node.widgetTypes.count)
            minX = min(minX, node.x)
            minY = min(minY, node.y)
            maxX = max(maxX, node.x + grid.width)
            maxY = max(maxY, node.y + grid.height)
        }
        return WorldRect(x: minX - margin, y: minY - margin, width: maxX - minX + margin * 2, height: maxY - minY + margin * 2)
    }

    private func accents(_ node: GhostTreeNode) -> [String] {
        node.widgetTypes.isEmpty ? [GhostTree.emptyAccent] : node.widgetTypes.map { WidgetRegistry.definition(for: $0)?.accent ?? GhostTree.emptyAccent }
    }

    @ViewBuilder
    private func world(_ nodes: [GhostTreeNode], bounds: WorldRect, zoom: Double) -> some View {
        let byId = Dictionary(nodes.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        ZStack(alignment: .topLeading) {
            // Ropes: parent's bottom centre to child's top centre.
            ForEach(nodes.filter { $0.parentId != nil }) { node in
                if let parentId = node.parentId, let parent = byId[parentId] {
                    rope(from: parent, to: node, bounds: bounds)
                }
            }
            ForEach(nodes) { node in
                cell(node, zoom: zoom)
                    .offset(x: node.x - bounds.x, y: node.y - bounds.y)
            }
        }
    }

    private func rope(from parent: GhostTreeNode, to node: GhostTreeNode, bounds: WorldRect) -> some View {
        let parentGrid = GhostTree.grid(count: parent.widgetTypes.count)
        let nodeGrid = GhostTree.grid(count: node.widgetTypes.count)
        let px = parent.x + parentGrid.width / 2 - bounds.x
        let py = parent.y + parentGrid.height - bounds.y
        let nx = node.x + nodeGrid.width / 2 - bounds.x
        let ny = node.y - bounds.y
        let path = Path { path in
            path.move(to: CGPoint(x: px, y: py))
            path.addCurve(to: CGPoint(x: nx, y: ny), control1: CGPoint(x: px, y: py + 24), control2: CGPoint(x: nx, y: ny - 24))
        }
        let colors = accents(node)
        let closing = shaper.isClosing(node.id)
        return ZStack {
            ForEach(Array(colors.enumerated()), id: \.offset) { index, color in
                let dash = GhostTree.accentDash(index: index, count: colors.count)
                path.stroke(Color(hex: color).opacity(0.96), style: StrokeStyle(lineWidth: 2, lineCap: .round, dash: dash.pattern.map { CGFloat($0) }, dashPhase: dash.phase))
            }
        }
        .shadow(color: .black.opacity(colorScheme == .dark ? 0.78 : 0.3), radius: 1, y: 1)
        .opacity(closing ? 0 : 1)
        .allowsHitTesting(false)
    }

    private func cell(_ node: GhostTreeNode, zoom: Double) -> some View {
        let grid = GhostTree.grid(count: node.widgetTypes.count)
        let colors = accents(node)
        let selected = shaper.isSelected(node.id)
        let closing = shaper.isClosing(node.id)
        let contour = GhostTree.contour(grid).map(GhostTreeOverlay.path) ?? Path()
        // The press area reaches the 44 pt floor on screen however far out
        // the camera is.
        let reach = max(0, (GlassTokens.touchTarget / max(zoom, 0.05) - min(grid.width, grid.height)) / 2)
        return ZStack(alignment: .topLeading) {
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(selected ? Color(hex: GhostTree.emptyAccent).opacity(0.22) : Color.black.opacity(colorScheme == .dark ? 0.25 : 0.06))
                .shadow(color: .black.opacity(colorScheme == .dark ? 0.28 : 0.1), radius: 9)
            ZStack {
                ForEach(Array(colors.enumerated()), id: \.offset) { index, color in
                    let dash = GhostTree.accentDash(index: index, count: colors.count)
                    contour.stroke(Color(hex: color).opacity(0.98), style: StrokeStyle(lineWidth: selected ? 3.15 : 2.35, lineCap: .round, dash: dash.pattern.map { CGFloat($0) }, dashPhase: dash.phase))
                }
            }
            .shadow(color: .black.opacity(colorScheme == .dark ? 0.78 : 0.3), radius: 1, y: 1)
            if node.widgetTypes.isEmpty {
                Image(systemName: "plus")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Color(hex: "#c4b5fd"))
                    .shadow(color: Color(hex: GhostTree.emptyAccent).opacity(0.72), radius: 3.5)
                    .frame(width: grid.width, height: grid.height)
            } else {
                ForEach(Array(node.widgetTypes.enumerated()), id: \.element) { index, type in
                    let accent = WidgetRegistry.definition(for: type)?.accent ?? GhostTree.emptyAccent
                    let placement = grid.placements[index]
                    Image(systemName: WidgetSymbols.symbol(for: type))
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(Color.inked(accent))
                        .frame(width: GhostTree.iconSize, height: GhostTree.iconSize)
                        .background(Color(hex: accent).opacity(0.14), in: RoundedRectangle(cornerRadius: 7, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 7, style: .continuous).strokeBorder(Color.lift.opacity(0.055), lineWidth: 1))
                        .offset(x: placement.x, y: placement.y)
                }
            }
        }
        .frame(width: grid.width, height: grid.height, alignment: .topLeading)
        .scaleEffect(closing ? 0.78 : 1, anchor: .top)
        .opacity(closing ? 0 : 1)
        .transition(reduceMotion ? .opacity : .scale(scale: 0.82, anchor: .top).combined(with: .opacity))
        .contentShape(Rectangle().inset(by: -reach))
        .gesture(press(node.id, zoom: zoom))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(node.widgetTypes.isEmpty ? "Choose widgets for this tree point" : "Edit this tree bundle of \(node.widgetTypes.count) widgets")
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
        .accessibilityAction { shaper.pressBegan(node.id); shaper.pressEnded(node.id, additive: false) }
        #if os(macOS)
        .help(node.widgetTypes.isEmpty
              ? "Choose widgets · shift-click to multi-select · drag up/down for children · left/right for siblings"
              : "Edit widgets · shift-click to multi-select · drag up/down for children · left/right for siblings")
        #endif
    }

    private func press(_ id: String, zoom: Double) -> some Gesture {
        DragGesture(minimumDistance: 0, coordinateSpace: .named(GhostTreeOverlay.space))
            .onChanged { value in
                if pressedId != id {
                    pressedId = id
                    shaper.pressBegan(id)
                }
                shaper.pressMoved(id, translation: Vector2D(x: value.translation.width, y: value.translation.height), zoom: chrome.cameraTransform.zoom)
            }
            .onEnded { _ in
                pressedId = nil
                shaper.pressEnded(id, additive: additiveTap)
            }
    }

    /// Shift on a keyboard; the Select tool on touch.
    private var additiveTap: Bool {
        #if os(macOS)
        if NSEvent.modifierFlags.contains(.shift) { return true }
        #endif
        return chrome.interactionMode == .select
    }

    static func path(_ contour: GhostContour) -> Path {
        Path { path in
            path.move(to: CGPoint(x: contour.start.x, y: contour.start.y))
            for corner in contour.corners {
                path.addQuadCurve(to: CGPoint(x: corner.end.x, y: corner.end.y), control: CGPoint(x: corner.control.x, y: corner.control.y))
                path.addLine(to: CGPoint(x: corner.lineTo.x, y: corner.lineTo.y))
            }
            path.closeSubpath()
        }
    }
}

// MARK: - HUD

/// While shaping, the only chrome is one pill: ✕ on the left cancels, ✓ on
/// the right (painted green) creates the tree. The web's explanatory banner
/// (`ShaperHUD.tsx`) is left out by the owner's call; its sentence survives
/// as the pill's accessibility value and the ✓'s tooltip.
public struct ShaperHUDView: View {
    private let shaper: TreeShaperModel
    private let document: BoardDocument

    public init(shaper: TreeShaperModel, document: BoardDocument) {
        self.shaper = shaper
        self.document = document
    }

    public var body: some View {
        if let config = shaper.config {
            let count = config.widgetCount
            let unconfigured = config.unconfiguredCount
            let status = unconfigured > 0
                ? "\(unconfigured) \(unconfigured == 1 ? "point needs" : "points need") widgets — press a dotted + to choose"
                : "\(count) \(count == 1 ? "widget" : "widgets") will be created"
            HStack(spacing: 0) {
                Button { shaper.cancel() } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(Color.primary.opacity(0.85))
                        .frame(width: 60, height: GlassTokens.touchTarget)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .help("Cancel (Esc)")
                .accessibilityLabel("Cancel tree")
                Button { shaper.commit(into: document) } label: {
                    Image(systemName: "checkmark")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 60, height: GlassTokens.touchTarget)
                        .background(Color(hex: "#059669").opacity(unconfigured > 0 ? 0.4 : 1))
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(unconfigured > 0)
                .keyboardShortcut(.defaultAction)
                .help(unconfigured > 0 ? status : "Create tree · \(status) (Return)")
                .accessibilityLabel("Create tree")
            }
            .clipShape(Capsule())
            .floatingPill()
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Tree shaper")
            .accessibilityValue("\(config.nodes.count) nodes. \(status)")
            .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }
}

// MARK: - Picker (selection mode)

public struct GhostNodePickerSheet: View {
    @Environment(\.chromeAdaptation) private var adaptation
    @Bindable private var library: AddWidgetModel
    private let shaper: TreeShaperModel
    private let initialTypes: [String]
    @State private var selected: [String]
    @State private var lockedReason: String?

    public init(library: AddWidgetModel, shaper: TreeShaperModel) {
        self._library = Bindable(library)
        self.shaper = shaper
        let initial = shaper.pickerInitialTypes
        self.initialTypes = initial
        self._selected = State(initialValue: initial)
    }

    public var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                TextField("Search widgets to add…", text: Binding(get: { library.query }, set: { library.setQuery($0) }))
                    .textFieldStyle(.plain)
                    .font(.grove(size: 15))
                    .onSubmit { if let lit = library.litEntry { toggle(lit) } }
                GhostButton("xmark", label: "Close") { shaper.closePicker() }
            }
            .padding(.horizontal, 16)
            .frame(minHeight: 56)
            if let lockedReason {
                Text(lockedReason).font(GlassType.body).foregroundStyle(Color(hex: "#fbbf24")).padding(.horizontal, 16).padding(.bottom, 6)
            }
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(library.groups) { group in
                        if let label = group.label { GlassLabel(label).padding(.horizontal, 16).padding(.top, 18).padding(.bottom, 6) }
                        ForEach(group.entries) { entry in row(entry) }
                    }
                }
                .padding(.bottom, 12)
            }
            footer
        }
        .frame(minWidth: adaptation.isPhone ? 0 : 408, maxWidth: adaptation.isPhone ? .infinity : 408, minHeight: 360)
        .onAppear { library.setQuery("") }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Choose widgets for this tree point")
    }

    private func toggle(_ entry: AddWidgetEntry) {
        if let reason = entry.lockedReason {
            lockedReason = reason
            return
        }
        lockedReason = nil
        if let index = selected.firstIndex(of: entry.type) { selected.remove(at: index) } else { selected.append(entry.type) }
    }

    private func row(_ entry: AddWidgetEntry) -> some View {
        let isOn = selected.contains(entry.type)
        return Button { toggle(entry) } label: {
            HStack(spacing: 14) {
                WidgetFaceView(type: entry.type, category: entry.category.rawValue, color: isOn ? Color.inked(entry.accent) : AddWidgetSheet.faceInk)
                    .frame(width: 29, height: 22)
                    .opacity(entry.isLocked ? 0.45 : 1)
                Text(entry.label)
                    .font(.grove(size: 14, weight: .medium))
                    .foregroundStyle(isOn ? AddWidgetSheet.litLabelInk : AddWidgetSheet.labelInk)
                    .lineLimit(1)
                Spacer(minLength: 0)
                if entry.isLocked {
                    Text("Locked").font(GlassType.label).foregroundStyle(.tertiary)
                }
                Image(systemName: isOn ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 16))
                    .foregroundStyle(isOn ? Color(hex: entry.accent) : Color.primary.opacity(0.3))
            }
            .padding(.horizontal, 16)
            .frame(minHeight: 44)
            .background(Color(hex: entry.accent).opacity(isOn ? 0.1 : 0), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 10)
        .accessibilityLabel(entry.isLocked ? "\(entry.label), locked: \(entry.lockedReason ?? "")" : entry.label)
        .accessibilityAddTraits(isOn ? .isSelected : [])
    }

    private var footer: some View {
        HStack(spacing: 6) {
            (Text("\(selected.count)").fontWeight(.semibold) + Text(" selected"))
                .font(.grove(size: 11))
                .monospacedDigit()
                .foregroundStyle(.secondary)
            Spacer(minLength: 0)
            if !initialTypes.isEmpty {
                footerButton("Clear node") { shaper.confirmPicker([]) }
            }
            footerButton("Cancel") { shaper.closePicker() }
            Button { shaper.confirmPicker(selected) } label: {
                Text("Add")
                    .font(.grove(size: 12, weight: .semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 16)
                    .frame(minHeight: GlassTokens.touchTarget)
                    .background(Color(hex: "#059669"), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(selected.isEmpty)
            .opacity(selected.isEmpty ? 0.35 : 1)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
    }

    private func footerButton(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.grove(size: 12, weight: .medium))
                .padding(.horizontal, 12)
                .frame(minHeight: GlassTokens.touchTarget)
                .background(Color.lift.opacity(0.06), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
