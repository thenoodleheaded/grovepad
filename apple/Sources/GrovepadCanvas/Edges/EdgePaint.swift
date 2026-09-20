import Foundation
import GrovepadCore

// ---------------------------------------------------------------------------
// Shared canvas edge paint system (`components/canvas/CanvasEdge.tsx` and the
// `.gp-canvas-edge-*` rules in `index.css`, with the per-variant values from
// RelationLines.tsx, DependencyLines.tsx and WireLayer.tsx).
//
// Relation, dependency, and circuit layers own different geometry and
// semantics, but use one paint stack: highlight → track → halo → main → flow
// → semantic accessory → hit target. Only the active edge animates.
// ---------------------------------------------------------------------------

public enum EdgeVariant: String, Sendable {
    case relation
    case dependency
    case wire
}

public enum EdgeLineCap: Sendable {
    case round
    case butt
}

/// One stroke in the stack. Widths are screen pixels (`non-scaling-stroke`);
/// the renderer divides by zoom. `dash` is in screen pixels too.
public struct EdgeLayerStyle: Equatable, Sendable {
    /// `#rrggbb` (or `#rrggbbaa`).
    public var color: String
    public var width: Double
    public var opacity: Double
    public var dash: [Double]?
    public var lineCap: EdgeLineCap
    /// The dash marches (`gp-edge-dash-march`) while true and motion is allowed.
    public var animated: Bool

    public init(color: String, width: Double, opacity: Double = 1, dash: [Double]? = nil, lineCap: EdgeLineCap = .round, animated: Bool = false) {
        self.color = color
        self.width = width
        self.opacity = opacity
        self.dash = dash
        self.lineCap = lineCap
        self.animated = animated
    }
}

/// A one-shot delivery pulse (`gp-wire-fire`): a bright dash that sweeps
/// source → target over 900 ms and fades. `dash` and `phase` are fractions
/// of the path length (`pathLength={1}`).
public struct EdgePulseStyle: Equatable, Sendable {
    public var color: String
    public var width: Double
    public var durationMs: Double
    public var dashFractions: [Double]
    public var phaseFrom: Double
    public var phaseTo: Double
    /// Distinguishes one firing from the next: a new key restarts the sweep.
    public var key: Double

    public static let durationMs = 900.0
}

public struct EdgePaintStack: Equatable, Sendable {
    public var highlight: EdgeLayerStyle?
    public var track: EdgeLayerStyle?
    public var halo: EdgeLayerStyle?
    public var main: EdgeLayerStyle
    public var flow: EdgeLayerStyle?
    public var pulse: EdgePulseStyle?
    /// Invisible stroke width that answers the pointer, in screen pixels.
    public var hitWidth: Double
    /// Conflict relations and dependencies carry an arrowhead at the end.
    public var endArrowColor: String?
}

/// What an edge IS. Geometry and semantics stay with each layer; this is the
/// value it hands to `edgePaint(for:)`.
public enum EdgeSemantics: Equatable, Sendable {
    case relation(type: RelationType, strict: Bool, hoverAccent: String?)
    case dependency
    case wire(valueType: FieldValueType?, isTrigger: Bool, enabled: Bool, damped: Bool)
}

public struct EdgeDescriptor: Equatable, Sendable {
    public var id: String
    public var route: CubicCurve
    public var mid: Vector2D
    public var semantics: EdgeSemantics
    /// An endpoint widget is hovered (`data-connected`).
    public var connected: Bool
    /// A resolvable relation/dependency has been marked resolved.
    public var resolved: Bool
    /// A wire whose transform cannot apply (`data-warning`).
    public var warning: Bool
    /// On the critical path.
    public var highlighted: Bool
    /// The edge itself is under the pointer (`:hover`).
    public var hovered: Bool
    /// The last delivery timestamp for a wire; a change replays the pulse.
    public var pulseKey: Double?

    public init(
        id: String,
        route: CubicCurve,
        mid: Vector2D,
        semantics: EdgeSemantics,
        connected: Bool = false,
        resolved: Bool = false,
        warning: Bool = false,
        highlighted: Bool = false,
        hovered: Bool = false,
        pulseKey: Double? = nil
    ) {
        self.id = id
        self.route = route
        self.mid = mid
        self.semantics = semantics
        self.connected = connected
        self.resolved = resolved
        self.warning = warning
        self.highlighted = highlighted
        self.hovered = hovered
        self.pulseKey = pulseKey
    }

    public var variant: EdgeVariant {
        switch semantics {
        case .relation: return .relation
        case .dependency: return .dependency
        case .wire: return .wire
        }
    }
}

/// What the whole canvas is doing, which the CSS reads from `body`/media.
public struct EdgePaintContext: Equatable, Sendable {
    /// `body[data-circuit-mode]`: wires step forward.
    public var circuitMode: Bool
    /// `prefers-reduced-motion`: no dash marches, no pulses.
    public var reducedMotion: Bool
    /// `[data-theme="light"]` swaps the parent relation outline.
    public var lightTheme: Bool

    public init(circuitMode: Bool = false, reducedMotion: Bool = false, lightTheme: Bool = false) {
        self.circuitMode = circuitMode
        self.reducedMotion = reducedMotion
        self.lightTheme = lightTheme
    }
}

public enum EdgeColors {
    /// `--gp-relation-outline`, dark and light.
    public static let relationOutlineDark = "#94a3b8"
    public static let relationOutlineLight = "#5f6d63"
    public static let coParent = "#7dd3fc"
    public static let cousin = "#737373"
    public static let blocker = "#dc2626"
    public static let conflict = "#f97316"
    public static let relationMuted = "#525252"
    public static let relationFlow = "#4ade80"
    public static let criticalPath = "#34d399"
    public static let activePress = "#34d399"
    public static let dependency = "#f59e0b"
    public static let dependencyResolved = "#64748b"
    public static let wireDisabled = "#525b6b"
    public static let wireDamped = "#f87171"
    public static let wireWarning = "#f87171"
}

/// The one function that turns a descriptor into strokes.
public func edgePaint(for edge: EdgeDescriptor, context: EdgePaintContext = EdgePaintContext()) -> EdgePaintStack {
    switch edge.semantics {
    case let .relation(type, strict, hoverAccent):
        return relationPaint(edge, type: type, strict: strict, hoverAccent: hoverAccent, context: context)
    case .dependency:
        return dependencyPaint(edge, context: context)
    case let .wire(valueType, isTrigger, enabled, damped):
        return wirePaint(edge, valueType: valueType, isTrigger: isTrigger, enabled: enabled, damped: damped, context: context)
    }
}

private func relationPaint(_ edge: EdgeDescriptor, type: RelationType, strict: Bool, hoverAccent: String?, context: EdgePaintContext) -> EdgePaintStack {
    let baseColor: String
    let baseWidth: Double
    var dash: [Double]?
    switch type {
    case .parent:
        baseColor = context.lightTheme ? EdgeColors.relationOutlineLight : EdgeColors.relationOutlineDark
        baseWidth = 2
    case .coParent:
        baseColor = EdgeColors.coParent
        baseWidth = 1.6
    case .cousin:
        baseColor = EdgeColors.cousin
        baseWidth = 1.4
        dash = [5, 5]
    case .blocker:
        baseColor = EdgeColors.blocker
        baseWidth = 1.8
        dash = [6, 4]
    case .conflict:
        baseColor = EdgeColors.conflict
        baseWidth = 1.8
    }
    // A strict parent edge is load-bearing — the parent moves the child — so
    // it draws heavier than a soft line, which is only a drawn meaning.
    let strictEdge = type == .parent && strict
    let mainWidth = strictEdge ? baseWidth + 1 : baseWidth
    let resolvable = type == .blocker || type == .conflict
    let muted = resolvable && edge.resolved
    let stroke = muted ? EdgeColors.relationMuted : baseColor
    let connected = edge.connected
    let accent = hoverAccent ?? EdgeColors.relationFlow

    // Relations replace their solid stroke with directional dotted flow on
    // hover; a widget-connected state uses the same transition.
    var main = EdgeLayerStyle(color: stroke, width: mainWidth, opacity: 1, dash: dash)
    if edge.hovered { main.opacity = 0 }
    if connected {
        main.color = hoverAccent ?? stroke
        main.opacity = 0.2
    }
    // The halo exists for the `:active` press (opacity .55); at rest and on
    // hover it stays invisible, as the CSS default has it.
    let halo = EdgeLayerStyle(color: stroke, width: 7, opacity: 0)
    let flowVisible = edge.hovered || connected
    let flow = EdgeLayerStyle(color: accent, width: 2, opacity: flowVisible ? 1 : 0, dash: [2, 6], animated: flowVisible && !context.reducedMotion)
    return EdgePaintStack(
        highlight: edge.highlighted ? EdgeLayerStyle(color: EdgeColors.criticalPath, width: 6, opacity: 0.35) : nil,
        track: nil,
        halo: halo,
        main: main,
        flow: flow,
        pulse: nil,
        hitWidth: 14,
        endArrowColor: type == .conflict ? stroke : nil
    )
}

private func dependencyPaint(_ edge: EdgeDescriptor, context: EdgePaintContext) -> EdgePaintStack {
    let stroke = edge.resolved ? EdgeColors.dependencyResolved : EdgeColors.dependency
    var track = EdgeLayerStyle(color: stroke, width: 6, opacity: 0.12)
    if edge.hovered || edge.connected { track.opacity = 0.22 }
    if edge.resolved { track.opacity = 0.06 }
    var main = EdgeLayerStyle(color: stroke, width: edge.resolved ? 1.5 : 2.2, opacity: 1, dash: edge.resolved ? [4, 6] : nil)
    if edge.hovered { main.opacity = 0 }
    if edge.connected {
        // `--gp-edge-accent` is the dependency stroke itself.
        main.color = EdgeColors.dependency
        main.opacity = 0.3
    }
    let flowVisible = edge.hovered || edge.connected
    let flow = EdgeLayerStyle(color: EdgeColors.dependency, width: 2.2, opacity: flowVisible ? 1 : 0, dash: [2, 6], animated: flowVisible && !context.reducedMotion)
    return EdgePaintStack(
        highlight: edge.highlighted ? EdgeLayerStyle(color: EdgeColors.criticalPath, width: 7, opacity: 0.38) : nil,
        track: track,
        halo: EdgeLayerStyle(color: stroke, width: 8, opacity: 0),
        main: main,
        flow: flow,
        pulse: nil,
        hitWidth: 16,
        endArrowColor: stroke
    )
}

private func wirePaint(_ edge: EdgeDescriptor, valueType: FieldValueType?, isTrigger: Bool, enabled: Bool, damped: Bool, context: EdgePaintContext) -> EdgePaintStack {
    let typeColor = isTrigger ? WireColors.trigger : WireColors.hex(for: valueType ?? .text)
    let stroke = damped ? EdgeColors.wireDamped : (enabled ? typeColor : EdgeColors.wireDisabled)
    // Circuit wires remain solid and type-coloured. Hover only strengthens
    // their existing stroke; delivery pulses remain one-shot overlays.
    var main = EdgeLayerStyle(
        color: stroke,
        width: isTrigger ? 1.8 : 2.1,
        opacity: 0.6,
        dash: isTrigger ? [5, 5] : (!enabled ? [2, 5] : nil)
    )
    var halo = EdgeLayerStyle(color: stroke, width: 7, opacity: 0)
    // Applied in CSS cascade order, not in the order they read.
    // `.gp-canvas-edge-wire:hover …` scores (0,3,0); the warning rule scores
    // (0,3,0) too but sits later in the sheet, so it wins on opacity; and
    // `body[data-circuit-mode] .gp-canvas-edge-wire …` scores (0,3,1), so it
    // beats BOTH on opacity. `stroke-width` and `stroke` are declared only by
    // hover and warning respectively, so those survive whatever wins above.
    if edge.hovered {
        halo.opacity = 0.14
        main.opacity = 1
        main.width = 2.4
    }
    if edge.warning {
        main.color = EdgeColors.wireWarning
        main.opacity = context.reducedMotion ? 1 : 0.9
        // NOTE: the web's hovered-warning rule is `gp-wire-warn`, an OPACITY
        // throb (0.45 ↔ 1 over 1.1 s), not the dash march `animated` drives —
        // and a warning value wire has no dash for a march to move. Not
        // ported: `EdgeLayerStyle` has no opacity keyframe yet.
    }
    if context.circuitMode {
        main.opacity = 0.95
        halo.opacity = 0.1
    }
    var pulse: EdgePulseStyle?
    if let key = edge.pulseKey, enabled, !damped, !context.reducedMotion {
        pulse = EdgePulseStyle(
            color: stroke,
            width: 3.4,
            durationMs: EdgePulseStyle.durationMs,
            dashFractions: [0.35, 1],
            phaseFrom: 1,
            phaseTo: -0.35,
            key: key
        )
    }
    return EdgePaintStack(
        highlight: nil,
        track: nil,
        halo: halo,
        main: main,
        flow: nil,
        pulse: pulse,
        hitWidth: 16,
        endArrowColor: nil
    )
}
