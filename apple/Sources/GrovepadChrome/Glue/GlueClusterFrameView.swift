import SwiftUI
import GrovepadCore
import GrovepadCanvas

// ---------------------------------------------------------------------------
// The group frame (`components/widgets/GlueClusterChrome.tsx` + the
// `.gp-group-*` rules in `04-controls.css`): for every group on the active
// canvas, an unbroken boundary line above and below the members and, above
// the top line, a title row with a widget's own anatomy — a tinted group
// icon square, the bold editable name, then the group's STATIC buttons
// (Complete all when a checklist is aboard, Favorite all, Delete group) and
// its own Collapse/Expand and Ungroup. No pill, no plate. Also the ⌥-drag
// previews: a solid halo on the weld target, a dashed outline on a member
// about to be pulled out.
//
// The model is pure world geometry; the view draws it in viewport points
// through the camera (hosting views never live under a bounds-scaled parent).
// ---------------------------------------------------------------------------

/// One group's frame, in world units.
public struct GlueFrame: Equatable, Identifiable {
    public var id: String
    /// `clusterChromeEnvelope`: the members and the name rows they float
    /// (the weld and reflow geometry, shared with the web).
    public var envelope: WorldRect
    /// The members as they are drawn at rest (tiles, glue insets applied):
    /// what the lines and the title row are measured from, so they hug the
    /// cards the eye sees rather than the headroom the rules reserve.
    public var members: WorldRect
    public var name: String?
    public var collapsed: Bool
    public var allCompleted: Bool
    public var allFavorite: Bool
    public var anyChecklist: Bool
    public var memberIds: [String]

    /// The gap between the members and each line: 0.2 of a grid cell.
    public static let lineGap = CanvasGeometry.gridSize * 0.2
    /// `.gp-group-line`: 2 px.
    public static let lineThickness = 2.0
    public static let titleHeight = GlueGeometry.titleRowHeight

    /// The top line's top edge and the bottom line's top edge.
    public var topLineY: Double { members.y - GlueFrame.lineGap - GlueFrame.lineThickness }
    public var bottomLineY: Double { members.y + members.height + GlueFrame.lineGap }
    /// The title row stands directly on the top line.
    public var titleY: Double { topLineY - GlueFrame.titleHeight }
    /// The two boundary lines, in world units. The canvas host paints them
    /// inside the world layer so they ride the camera with the cards.
    public var boundaryLines: [WorldRect] {
        [topLineY, bottomLineY].map { WorldRect(x: members.x, y: $0, width: members.width, height: GlueFrame.lineThickness) }
    }
    /// The title row's hit rect (the painted row only, `clusterTitleRowRect`).
    public var titleRect: WorldRect {
        let trimmed = name?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let label = trimmed.isEmpty ? "Group" : trimmed
        let width = GlueGeometry.titleIcon + min(GlueGeometry.nameMax, Double(label.utf16.count) * GlueGeometry.nameChar) + GlueGeometry.titleButton * GlueGeometry.titleButtonsMax
        return WorldRect(x: members.x, y: titleY, width: width, height: GlueFrame.titleHeight)
    }
}

/// An ⌥-drag preview outline around one card's drawn box.
public struct GlueIntentOutline: Equatable {
    public enum Kind: Equatable { case weldTarget, pullOff }
    public var kind: Kind
    public var rect: WorldRect
    public var accent: String
}

public enum GlueFrameModel {
    /// Every group on `canvasId` with two or more members.
    /// `drawnRect` is each member as drawn at rest; nil reads the stored box.
    public static func frames(board: Board, canvasId: String, measure: GlueMeasure = .registry, drawnRect: ((Widget) -> WorldRect)? = nil) -> [GlueFrame] {
        board.glues.values.compactMap { glue -> GlueFrame? in
            let members = glue.widgetIds.compactMap { board.widgets[$0] }
            guard members.count >= 2, members[0].canvasId == canvasId,
                  let env = GlueGeometry.chromeEnvelope(glue.widgetIds, widgets: board.widgets, measure: measure) else { return nil }
            let rects = members.map { drawnRect?($0) ?? $0.frame }
            let minX = rects.map(\.x).min()!, minY = rects.map(\.y).min()!
            let maxX = rects.map { $0.x + $0.width }.max()!, maxY = rects.map { $0.y + $0.height }.max()!
            return GlueFrame(
                id: glue.id, envelope: env, members: WorldRect(x: minX, y: minY, width: maxX - minX, height: maxY - minY),
                name: glue.name, collapsed: glue.collapsed,
                allCompleted: members.allSatisfy { $0.metadata.completed },
                allFavorite: members.allSatisfy { $0.metadata.favorite },
                anyChecklist: members.contains { $0.type == "checklist" },
                memberIds: members.map(\.id)
            )
        }
    }

    /// The weld target's halo and the pulled member's dashed outline.
    public static func intents(document: BoardDocument, drawnRect: (Widget) -> WorldRect) -> [GlueIntentOutline] {
        var result: [GlueIntentOutline] = []
        if let target = document.glueIntent.flatMap({ document.widget($0.targetId) }) {
            result.append(GlueIntentOutline(kind: .weldTarget, rect: drawnRect(target), accent: CardAccent.accent(for: target)))
        }
        if let pulled = document.unglueIntentWidgetId.flatMap({ document.widget($0) }) {
            result.append(GlueIntentOutline(kind: .pullOff, rect: drawnRect(pulled), accent: CardAccent.accent(for: pulled)))
        }
        return result
    }
}

/// What the frame's buttons do; the host closes over the document.
public struct GlueFrameActions {
    public var rename: (String, String) -> Void
    public var toggleCompleted: (GlueFrame) -> Void
    public var toggleFavorite: (GlueFrame) -> Void
    public var delete: (GlueFrame) -> Void
    public var setCollapsed: (String, Bool) -> Void
    public var ungroup: (String) -> Void

    public init(
        rename: @escaping (String, String) -> Void, toggleCompleted: @escaping (GlueFrame) -> Void,
        toggleFavorite: @escaping (GlueFrame) -> Void, delete: @escaping (GlueFrame) -> Void,
        setCollapsed: @escaping (String, Bool) -> Void, ungroup: @escaping (String) -> Void
    ) {
        self.rename = rename
        self.toggleCompleted = toggleCompleted
        self.toggleFavorite = toggleFavorite
        self.delete = delete
        self.setCollapsed = setCollapsed
        self.ungroup = ungroup
    }
}

/// Every frame and preview on the canvas, in viewport points.
public struct GlueClusterLayerView: View {
    public var frames: [GlueFrame]
    public var intents: [GlueIntentOutline]
    public var zoom: Double
    public var pan: Vector2D
    public var actions: GlueFrameActions

    public init(frames: [GlueFrame], intents: [GlueIntentOutline], zoom: Double, pan: Vector2D, actions: GlueFrameActions) {
        self.frames = frames
        self.intents = intents
        self.zoom = zoom
        self.pan = pan
        self.actions = actions
    }

    /// `--gp-relation-outline`, the frame's one hue.
    static let outline = Color.adaptive(light: Color(hex: EdgeColors.relationOutlineLight), dark: Color(hex: EdgeColors.relationOutlineDark))

    func screen(_ x: Double, _ y: Double) -> CGPoint {
        CGPoint(x: x * zoom + pan.x, y: y * zoom + pan.y)
    }

    public var body: some View {
        ZStack(alignment: .topLeading) {
            ForEach(intents.indices, id: \.self) { index in intentOutline(intents[index]) }
            // Neither the boundary lines nor the title rows are drawn here:
            // SwiftUI re-lays this layer a frame after the camera moves, so
            // anything placed by it trailed the cards through every zoom.
            // `CanvasHostLayer` paints the lines in the world layer and each
            // title row has its own host view (`GlueTitleRoot`).
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    /// `[data-glue-target]`: solid 2 px outline 6 px out plus a 6 px ring at
    /// 22 %; `[data-unglue-intent]`: dashed 2 px, 7 px out.
    @ViewBuilder
    func intentOutline(_ intent: GlueIntentOutline) -> some View {
        let accent = Color(hex: intent.accent)
        let out = intent.kind == .weldTarget ? 6.0 : 7.0
        let rect = WorldRect(x: intent.rect.x - out, y: intent.rect.y - out, width: intent.rect.width + out * 2, height: intent.rect.height + out * 2)
        let origin = screen(rect.x, rect.y)
        let radius = CGFloat((GlassTokens.r0 + out) * zoom)
        Group {
            if intent.kind == .weldTarget {
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .strokeBorder(accent.mix(with: .white, by: 0.3), lineWidth: CGFloat(2 * zoom))
                    .background(
                        RoundedRectangle(cornerRadius: radius, style: .continuous)
                            .strokeBorder(accent.opacity(0.22), lineWidth: CGFloat(6 * zoom))
                            .padding(CGFloat(-6 * zoom))
                    )
            } else {
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .strokeBorder(accent.mix(with: .white, by: 0.18), style: StrokeStyle(lineWidth: CGFloat(2 * zoom), dash: [CGFloat(6 * zoom), CGFloat(4 * zoom)]))
            }
        }
        .frame(width: CGFloat(rect.width * zoom), height: CGFloat(rect.height * zoom))
        .offset(x: origin.x, y: origin.y)
        .allowsHitTesting(false)
    }
}

/// One group's title row for its own host view.
public final class GlueTitleModel: ObservableObject {
    @Published public var frame: GlueFrame
    public var actions: GlueFrameActions

    public init(frame: GlueFrame, actions: GlueFrameActions) {
        self.frame = frame
        self.actions = actions
    }
}

/// A group's title row standing on its top line. The host sets the view's
/// frame on every camera commit, in the same commit as the cards; only the
/// scale travels through SwiftUI, and anchored on the row's bottom edge a
/// scale that lands a frame late never lifts the row off its line.
public struct GlueTitleRoot: View {
    @ObservedObject var model: GlueTitleModel
    @ObservedObject var camera: LiveCardCamera

    /// World width reserved for the row (the widest name plus every button).
    public static let width = 480.0

    public init(model: GlueTitleModel, camera: LiveCardCamera) {
        self.model = model
        self.camera = camera
    }

    public var body: some View {
        let zoom = CGFloat(camera.zoom)
        let width = CGFloat(GlueTitleRoot.width), height = CGFloat(GlueFrame.titleHeight)
        GlueFrameTitleRow(frame: model.frame, actions: model.actions)
            .fixedSize()
            .frame(width: width, height: height, alignment: .bottomLeading)
            .scaleEffect(zoom, anchor: .bottomLeading)
            .frame(width: width * zoom, height: height * zoom, alignment: .bottomLeading)
    }
}

/// `.gp-group-bar`: icon, name, buttons, at world scale (the caller zooms it).
struct GlueFrameTitleRow: View {
    let frame: GlueFrame
    let actions: GlueFrameActions
    @State private var editing = false
    @State private var draft = ""
    @State private var hovering = false
    @FocusState private var nameFocused: Bool

    /// `--gp-widget-muted-text` on the dark board; green-gray on paper.
    static let ink = Color.adaptive(light: Color(red: 0.36, green: 0.41, blue: 0.37), dark: Color(white: 0.64))

    var body: some View {
        HStack(spacing: 2) {
            // `.gp-group-icon`: 28 px tinted square in the frame's hue.
            Image(systemName: "square.on.square.dashed")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(GlueClusterLayerView.outline)
                .frame(width: 28, height: 28)
                .background(RoundedRectangle(cornerRadius: 6, style: .continuous).fill(GlueClusterLayerView.outline.opacity(0.11)))
                .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous).strokeBorder(GlueClusterLayerView.outline.opacity(0.19), lineWidth: 1))
                .accessibilityHidden(true)
            name
                .padding(.horizontal, 4)
            if frame.anyChecklist {
                button(frame.allCompleted ? "checkmark.circle.fill" : "checkmark", label: "Complete all", on: frame.allCompleted) { actions.toggleCompleted(frame) }
            }
            button(frame.allFavorite ? "star.fill" : "star", label: "Favorite all", on: frame.allFavorite) { actions.toggleFavorite(frame) }
            button("trash", label: "Delete group", on: false) { actions.delete(frame) }
            button(frame.collapsed ? "arrow.up.left.and.arrow.down.right" : "arrow.down.right.and.arrow.up.left",
                   label: frame.collapsed ? "Expand all widgets" : "Collapse all widgets", on: false) {
                actions.setCollapsed(frame.id, !frame.collapsed)
            }
            button("rectangle.split.2x1", label: "Ungroup widgets", on: false) { actions.ungroup(frame.id) }
        }
        .frame(height: GlueFrame.titleHeight)
        .foregroundStyle(GlueFrameTitleRow.ink)
        // Quiet by default; the cards stay the subject.
        .opacity(hovering || editing ? 1 : 0.72)
        .animation(.easeOut(duration: 0.15), value: hovering)
        .onHover { hovering = $0 }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Group \(frame.name ?? "")")
    }

    @ViewBuilder
    var name: some View {
        if editing {
            TextField("Group", text: $draft)
                .textFieldStyle(.plain)
                .font(.grove(size: 12, weight: .bold))
                .frame(width: 96)
                .focused($nameFocused)
                .onSubmit { commit() }
                #if os(macOS)
                .onExitCommand { editing = false }
                #endif
                .onChange(of: nameFocused) { _, focused in if !focused && editing { commit() } }
                .onAppear { nameFocused = true }
                .accessibilityLabel("Group name")
        } else {
            let trimmed = frame.name ?? ""
            Text(trimmed.isEmpty ? "Group" : trimmed)
                .font(.grove(size: 12, weight: .bold))
                .tracking(0.12)
                .lineLimit(1)
                .truncationMode(.tail)
                .frame(maxWidth: 200, alignment: .leading)
                .onTapGesture(count: 2) {
                    draft = frame.name ?? ""
                    editing = true
                }
                .help("Double-click to rename")
        }
    }

    private func commit() {
        editing = false
        actions.rename(frame.id, draft)
    }

    /// `.gp-group-btn`: a 20 px round cell; a toggled one wears the outline.
    private func button(_ symbol: String, label: String, on: Bool, action: @escaping () -> Void) -> some View {
        GlueFrameButton(symbol: symbol, label: label, on: on, action: action)
    }
}

struct GlueFrameButton: View {
    let symbol: String
    let label: String
    let on: Bool
    let action: () -> Void
    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 10, weight: .semibold))
                .frame(width: 20, height: 20)
                .background(Circle().fill(hovering ? Color.primary.opacity(0.10) : .clear))
                .foregroundStyle(on ? GlueClusterLayerView.outline : GlueFrameTitleRow.ink)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .help(label)
        .accessibilityLabel(label)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}
