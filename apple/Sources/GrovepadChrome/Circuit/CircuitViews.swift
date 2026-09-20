import SwiftUI
import GrovepadCore
import GrovepadCanvas

// ---------------------------------------------------------------------------
// The circuit UI in SwiftUI, thin over the pure models: the port rail on a
// card (`PortRail.tsx`), the field picker a body drop opens, the wire
// inspector (`WireInspector` in WireLayer.tsx), the Circuit Mode toolbar
// toggle, and the panel placement rule (sheet on phones, popover elsewhere —
// the `gp-sheet` recipe from docs/touch-adaptation.md). Every control wears
// the 44 pt floor; port hit boxes extend invisibly around the drawn dot and
// never move it (widget constitution III.4).
// ---------------------------------------------------------------------------

/// `body[data-circuit-mode] .gp-widget-card { filter: saturate(0.82) }`.
public enum CircuitModeStyle {
    public static let cardSaturation = 0.82
}

public extension View {
    /// Cards step back while the live graph illuminates.
    func circuitModeDesaturation(_ active: Bool) -> some View {
        saturation(active ? CircuitModeStyle.cardSaturation : 1)
    }

    /// Where a circuit panel sits: the phone sheet (bottom, medium detent,
    /// drag to dismiss) or a desktop popover. One recipe, no twelfth copy.
    func circuitPanel<Content: View>(isPresented: Binding<Bool>, isPhone: Bool, @ViewBuilder content: @escaping () -> Content) -> some View {
        Group {
            if isPhone {
                sheet(isPresented: isPresented) {
                    content().presentationDetents([.medium, .large]).presentationDragIndicator(.visible)
                }
            } else {
                popover(isPresented: isPresented) { content() }
            }
        }
    }
}

// MARK: - Port rail

/// The dots on one card. Drawn in the card's own coordinate space (world
/// units; the world layer scales them), so a dot sits exactly where
/// `PortGeometry` says the wire will land. Output dots start a wire drag
/// (or arm the tap path); input dots complete one.
public struct PortRailView: View {
    private let widget: Widget
    private let rail: PortRail
    private let circuitUI: CircuitUIState
    private let zoom: Double
    private let controller: LinkingController
    private let localToWorld: (CGPoint) -> Vector2D
    private let localToScreen: (CGPoint) -> Vector2D
    @Environment(\.touchChrome) private var touchChrome
    @State private var session: DragSession?

    private struct DragSession {
        var key: String
        var start: CGPoint
        var moved = false
    }

    /// `localToWorld` maps a point in the rail's coordinate space (the card's
    /// footprint, origin top-left) to world; the default assumes the rail is
    /// laid over the footprint one-to-one. `localToScreen` anchors the field
    /// picker; it defaults to the world point.
    public init(
        widget: Widget,
        rail: PortRail,
        circuitUI: CircuitUIState,
        zoom: Double,
        controller: LinkingController,
        localToWorld: ((CGPoint) -> Vector2D)? = nil,
        localToScreen: ((CGPoint) -> Vector2D)? = nil
    ) {
        self.widget = widget
        self.rail = rail
        self.circuitUI = circuitUI
        self.zoom = zoom
        self.controller = controller
        let frame = rail.frame
        let toWorld: (CGPoint) -> Vector2D = localToWorld ?? { Vector2D(x: frame.x + Double($0.x), y: frame.y + Double($0.y)) }
        self.localToWorld = toWorld
        self.localToScreen = localToScreen ?? toWorld
    }

    private var drag: WireDrag? { circuitUI.wireDrag }
    private var showsLabels: Bool { PortRailModel.showsLabels(circuitUI: circuitUI) }
    private var hitEdge: CGFloat { CGFloat(max(PortRailModel.dotDiameter, PortRailModel.touchTarget / max(zoom, 0.0001))) }
    /// `TAP_SLOP_PX`, in the rail's world units.
    private var tapSlop: CGFloat { CGFloat(GestureTuning.longPressSlopPx / max(zoom, 0.0001)) }

    public var body: some View {
        ZStack(alignment: .topLeading) {
            if PortRailModel.showsOutputs(widgetId: widget.id, drag: drag) {
                ForEach(rail.outputs, id: \.key) { handle in
                    outputDot(handle)
                        .position(x: CGFloat(handle.local.x), y: CGFloat(handle.local.y))
                }
            }
            ForEach(rail.inputs, id: \.inputIdentity) { handle in
                inputDot(handle)
                    .position(x: CGFloat(handle.local.x), y: CGFloat(handle.local.y))
            }
        }
        .frame(width: CGFloat(rail.frame.width), height: CGFloat(rail.frame.height), alignment: .topLeading)
        .coordinateSpace(name: "gp-port-rail")
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Circuit ports for \(widget.title)")
    }

    private func dot(_ handle: PortHandle, filled: Bool, glow: Bool) -> some View {
        let color = Color(hex: handle.color)
        let size = CGFloat(PortRailModel.dotDiameter)
        return Group {
            if handle.kind == .command {
                RoundedRectangle(cornerRadius: 2)
                    .fill(filled ? color : Color(hex: "#0c1017"))
                    .overlay(RoundedRectangle(cornerRadius: 2).stroke(color, lineWidth: 1.5))
                    .frame(width: size * 0.8, height: size * 0.8)
                    .rotationEffect(.degrees(45))
            } else {
                Circle()
                    .fill(filled ? color : Color(hex: "#0c1017"))
                    .overlay(Circle().stroke(color, lineWidth: 1.5))
                    .frame(width: size, height: size)
            }
        }
        .scaleEffect(glow ? 1.5 : 1)
        .shadow(color: color.opacity(glow ? 0.9 : 0.45), radius: glow ? 6 : 3)
    }

    private func label(_ handle: PortHandle) -> some View {
        Text(handle.label)
            .font(.grove(size: 9, weight: .semibold))
            .foregroundStyle(Color(hex: handle.color))
            .padding(.horizontal, 5)
            .padding(.vertical, 1)
            .background(RoundedRectangle(cornerRadius: 6).fill(Color(hex: "#090c12").opacity(0.92)))
            .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color(hex: handle.color).opacity(0.35), lineWidth: 1))
            .fixedSize()
            .allowsHitTesting(false)
    }

    private func outputDot(_ handle: PortHandle) -> some View {
        let active = drag?.fromId == widget.id && drag?.fromField == handle.key
        return ZStack {
            Color.clear.frame(width: hitEdge, height: hitEdge)
            dot(handle, filled: active, glow: active)
            if showsLabels || active {
                label(handle).offset(x: 14 + CGFloat(handle.label.count) * 2.6)
            }
        }
        .contentShape(Rectangle())
        .accessibilityLabel("Start connection from \(handle.label) output of \(widget.title)")
        .accessibilityAddTraits(active ? .isSelected : [])
        .gesture(
            DragGesture(minimumDistance: 0, coordinateSpace: .named("gp-port-rail"))
                .onChanged { value in
                    if session == nil {
                        let armed = controller.beginDrag(fromWidget: widget.id, field: handle.key, at: localToWorld(value.startLocation))
                        session = DragSession(key: armed ? handle.key : "", start: value.startLocation)
                    }
                    guard var current = session, current.key == handle.key else { return }
                    let dx = value.location.x - current.start.x
                    let dy = value.location.y - current.start.y
                    if !current.moved, (dx * dx + dy * dy).squareRoot() > tapSlop { current.moved = true }
                    session = current
                    if current.moved { controller.moveDrag(toWorld: localToWorld(value.location)) }
                }
                .onEnded { value in
                    defer { session = nil }
                    guard let current = session, current.key == handle.key else { return }
                    // A tap chooses this output and leaves every input target
                    // active; a second tap on the same output disarms it.
                    if !current.moved { return }
                    controller.endDrag(atWorld: localToWorld(value.location), screen: localToScreen(value.location))
                }
        )
    }

    private func inputDot(_ handle: PortHandle) -> some View {
        let compatible = handle.isCompatible(with: drag, on: widget.id)
        let hot = handle.isHot(in: drag, on: widget.id)
        return Button {
            controller.tapInput(widget: widget.id, port: handle.spec)
        } label: {
            ZStack {
                Color.clear.frame(width: hitEdge, height: hitEdge)
                dot(handle, filled: hot, glow: hot)
                if showsLabels || hot {
                    label(handle)
                        .rotationEffect(handle.kind == .command ? .degrees(-45) : .zero, anchor: .trailing)
                        .offset(x: -(14 + CGFloat(handle.label.count) * 2.6))
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!compatible)
        .opacity(compatible || drag == nil ? 1 : 0.6)
        .accessibilityLabel("Connect to \(handle.label) \(handle.kind == .command ? "command" : "input") of \(widget.title)")
    }
}

extension PortHandle {
    /// `in-${kind}-${key}`: a field and a command may share a key.
    var inputIdentity: String { "\(kind.rawValue)-\(key)" }
}

// MARK: - Field picker

/// A wire dropped on a card body chooses its landing input (`FieldPicker`).
public struct WireFieldPickerView: View {
    private let controller: LinkingController
    private let drop: PendingWireDrop
    private let onDone: () -> Void

    public init(controller: LinkingController, drop: PendingWireDrop, onDone: @escaping () -> Void = {}) {
        self.controller = controller
        self.drop = drop
        self.onDone = onDone
    }

    private var targetTitle: String { controller.document.widget(drop.toId)?.title ?? "" }
    private var ports: [PortSpec] { controller.pendingDropPorts }

    public var body: some View {
        let fields = ports.filter { $0.kind == .field }
        let commands = ports.filter { $0.kind == .command }
        ScrollView {
            VStack(alignment: .leading, spacing: 2) {
                HStack {
                    (Text("Wire into ").foregroundStyle(.secondary) + Text(targetTitle).fontWeight(.medium))
                        .font(.grove(size: 12))
                    Spacer()
                    GhostButton("xmark", label: "Cancel") {
                        controller.dismissPendingDrop()
                        onDone()
                    }
                }
                .padding(.horizontal, 8)
                if !fields.isEmpty { GlassLabel("Set a value").padding(.horizontal, 12).padding(.top, 4) }
                ForEach(fields, id: \.key) { port in row(port) }
                if !commands.isEmpty { GlassLabel("Trigger an action").padding(.horizontal, 12).padding(.top, 6) }
                ForEach(commands, id: \.key) { port in row(port) }
                if fields.isEmpty, commands.isEmpty {
                    Text("This widget accepts no inputs.").font(.grove(size: 11)).foregroundStyle(.secondary).padding(12)
                }
            }
            .padding(6)
        }
        .frame(minWidth: 224)
        .accessibilityLabel("Wire into \(targetTitle)")
    }

    private func row(_ port: PortSpec) -> some View {
        let color = Color(hex: port.kind == .command ? WireColors.trigger : WireColors.hex(for: port.valueType ?? .text))
        return Button {
            controller.resolvePendingDrop(port: port)
            onDone()
        } label: {
            HStack(spacing: 8) {
                Group {
                    if port.kind == .command {
                        RoundedRectangle(cornerRadius: 2).fill(color).frame(width: 8, height: 8).rotationEffect(.degrees(45))
                    } else {
                        Circle().fill(color).frame(width: 8, height: 8)
                    }
                }
                Text(port.label).font(.grove(size: 12))
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .touchTarget()
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Wire inspector

/// Everything about one wire: `Source·Field → Target·Field`, kind, the
/// transform picker with inline parameters (value wires, or payload-reading
/// commands), the edge picker (trigger wires), enable/disable, delete, and
/// the damping notice with one-tap re-arm. Reads the document live so a
/// commit from the engine or undo re-renders it.
public struct WireInspectorView: View {
    private let document: BoardDocument
    private let connectionId: String
    private let onClose: () -> Void

    public init(document: BoardDocument, connectionId: String, onClose: @escaping () -> Void = {}) {
        self.document = document
        self.connectionId = connectionId
        self.onClose = onClose
    }

    public var body: some View {
        if let model = WireInspectorModel(document: document, connectionId: connectionId) {
            InspectorBody(model: model, onClose: onClose)
        } else {
            Text("This wire is gone.").font(.grove(size: 11)).foregroundStyle(.secondary).padding(12)
        }
    }

    struct InspectorBody: View {
        let model: WireInspectorModel
        let onClose: () -> Void

        var body: some View {
            let accent = Color(hex: model.accent)
            ScrollView {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(model.kindLabel.uppercased())
                                .font(.grove(size: 10, weight: .semibold))
                                .tracking(1.2)
                                .foregroundStyle(accent)
                            HStack(spacing: 4) {
                                Text(model.sourceLabel).lineLimit(1)
                                Image(systemName: "arrow.right").font(.system(size: 8)).foregroundStyle(.tertiary)
                                Text(model.targetLabel).lineLimit(1)
                            }
                            .font(.grove(size: 10))
                            .foregroundStyle(.secondary)
                            .accessibilityLabel(model.title)
                        }
                        Spacer()
                        GhostButton("xmark", label: "Close") {
                            model.close()
                            onClose()
                        }
                    }

                    if model.damped {
                        Island {
                            HStack(alignment: .top, spacing: 6) {
                                Image(systemName: "exclamationmark.triangle").font(.system(size: 11)).foregroundStyle(Color(hex: EdgeColors.wireDamped))
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(WireInspectorModel.dampedNotice).font(.grove(size: 10)).foregroundStyle(Color.tone("#fca5a5", light: "#b91c1c"))
                                    Button("Re-arm") { model.rearm() }
                                        .buttonStyle(.plain)
                                        .font(.grove(size: 10, weight: .semibold))
                                        .underline()
                                        .touchTarget()
                                }
                            }
                        }
                    }

                    if model.showsTransform { transformSection(model) }

                    if model.isTrigger, let edge = model.edge {
                        Island {
                            VStack(alignment: .leading, spacing: 4) {
                                GlassLabel("Fires when source…")
                                Picker("Fires when source…", selection: Binding(get: { edge }, set: { model.setEdge($0) })) {
                                    ForEach(model.edges, id: \.self) { candidate in Text(candidate.label).tag(candidate) }
                                }
                                .labelsHidden()
                                .touchTarget()
                            }
                        }
                    }

                    Button {
                        model.toggleEnabled()
                    } label: {
                        Label(model.enabledLabel, systemImage: model.enabled ? "pause.circle" : "play.circle")
                            .font(.grove(size: 12))
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .touchTarget()

                    Button {
                        model.delete()
                        onClose()
                    } label: {
                        Label("Delete wire", systemImage: "trash")
                            .font(.grove(size: 12))
                            .foregroundStyle(Color(hex: "#f87171"))
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .touchTarget()
                }
                .padding(8)
            }
            .frame(minWidth: 256)
        }

        private func transformSection(_ model: WireInspectorModel) -> some View {
            Island {
                VStack(alignment: .leading, spacing: 6) {
                    GlassLabel(model.transformHeading)
                    Picker(model.transformHeading, selection: Binding(get: { model.op }, set: { model.setOp($0) })) {
                        ForEach(model.ops, id: \.self) { op in Text(model.label(for: op)).tag(op) }
                    }
                    .labelsHidden()
                    .touchTarget()
                    Text(model.hint).font(.grove(size: 9)).foregroundStyle(.tertiary)
                    if !model.params.isEmpty {
                        let columns = [GridItem(.flexible()), GridItem(.flexible())]
                        LazyVGrid(columns: columns, spacing: 6) {
                            ForEach(model.params, id: \.key) { param in
                                Well {
                                    VStack(alignment: .leading, spacing: 2) {
                                        GlassLabel(param.label)
                                        TextField(param.label, value: Binding(get: { param.value }, set: { model.setParam(param.key, $0) }), format: .number)
                                            .textFieldStyle(.plain)
                                            .font(.grove(size: 12).monospacedDigit())
                                            .accessibilityLabel(param.label)
                                    }
                                }
                                .touchTarget()
                            }
                        }
                    }
                    if let template = model.template {
                        Well {
                            VStack(alignment: .leading, spacing: 2) {
                                GlassLabel("Template ({value})")
                                TextField("Format template", text: Binding(get: { template }, set: { model.setTemplate($0) }))
                                    .textFieldStyle(.plain)
                                    .font(.grove(size: 12))
                                    .accessibilityLabel("Format template")
                            }
                        }
                        .touchTarget()
                    }
                    if let suggestionLabel = model.suggestionLabel {
                        Button {
                            model.applySuggestion()
                        } label: {
                            Label("Suggested: \(suggestionLabel)", systemImage: "wand.and.stars")
                                .font(.grove(size: 11))
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .touchTarget()
                    }
                }
            }
        }
    }
}

// MARK: - Circuit Mode toggle

/// The toolbar ⚡: illuminates the live graph. The `W` shortcut is bound by
/// the app's command table, not here.
public struct CircuitModeToggle: View {
    private let document: BoardDocument

    public init(document: BoardDocument) {
        self.document = document
    }

    public var body: some View {
        let active = document.circuitUI.circuitMode
        Button {
            document.setCircuitMode(!active)
        } label: {
            Image(systemName: "bolt.fill")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(active ? Color(hex: WireColors.trigger) : Color.primary.opacity(0.8))
                .frame(width: 28, height: 28)
                .background(RoundedRectangle(cornerRadius: 8).fill(active ? Color(hex: WireColors.trigger).opacity(0.16) : Color.clear))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Circuit Mode")
        .accessibilityAddTraits(active ? .isSelected : [])
        .help("Circuit Mode (W)")
        .touchTarget()
    }
}
