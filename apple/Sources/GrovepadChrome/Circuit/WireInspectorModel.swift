import Foundation
import GrovepadCore

// ---------------------------------------------------------------------------
// The wire inspector's view model (`WireInspector` in WireLayer.tsx): one
// connection, read once from the document, with every edit routed back
// through the document's connection actions (`setConnectionTransform`,
// `setConnectionEdge`, `setConnectionEnabled`, `removeConnection`). Pure
// data plus thin write methods; no SwiftUI.
// ---------------------------------------------------------------------------

/// One editable number on a transform (`numberInput` rows).
public struct TransformParam: Equatable, Sendable {
    public var key: String
    public var label: String
    public var value: Double
}

public struct WireInspectorModel {
    public let connectionId: String
    public let connection: Connection
    public let source: Widget
    public let target: Widget
    /// Loop breaker tripped on this wire.
    public let damped: Bool
    private let document: BoardDocument

    /// Nil when the wire or either endpoint is gone (the popover closes).
    public init?(document: BoardDocument, connectionId: String) {
        guard let connection = document.board.connections[connectionId],
              let source = document.widget(connection.fromId), let target = document.widget(connection.toId) else { return nil }
        self.document = document
        self.connectionId = connectionId
        self.connection = connection
        self.source = source
        self.target = target
        self.damped = document.circuitUI.dampedIds.contains(connectionId)
    }

    // MARK: - Reads

    public var kind: WireKind { connection.kind }
    public var isTrigger: Bool { connection.kind == .trigger }
    public var kindLabel: String { isTrigger ? "Trigger wire" : "Value wire" }

    public var sourceField: FieldDescriptor? { fieldDescriptor(source.type, connection.fromField) }
    public var targetField: FieldDescriptor? { connection.toField.flatMap { fieldDescriptor(target.type, $0) } }
    public var targetCommand: PortSpec? { connection.command.flatMap { findInputPort(target.type, $0, .command) } }

    public var sourceFieldLabel: String { sourceField?.label ?? connection.fromField }
    public var targetFieldLabel: String {
        if isTrigger { return targetCommand?.label ?? connection.command ?? "" }
        return targetField?.label ?? connection.toField ?? ""
    }

    /// `truncate(title, 15)`.
    static func truncate(_ text: String, _ limit: Int) -> String {
        let units = Array(text.utf16)
        guard units.count > limit else { return text }
        return String(decoding: units.prefix(max(0, limit - 1)), as: UTF16.self) + "…"
    }

    public var sourceLabel: String { "\(WireInspectorModel.truncate(source.title, 15))·\(sourceFieldLabel)" }
    public var targetLabel: String { "\(WireInspectorModel.truncate(target.title, 15))·\(targetFieldLabel)" }
    /// `Source · Field → Target · Field`.
    public var title: String { "\(sourceLabel) → \(targetLabel)" }

    /// One hue for the wire, its ports and this panel's heading.
    public var accent: String {
        isTrigger ? WireColors.trigger : WireColors.hex(for: sourceField?.valueType ?? .text)
    }

    /// Value wires always carry a transform; trigger wires only show one
    /// when the target command actually reads the payload.
    public var showsTransform: Bool { !isTrigger || targetCommand?.acceptsPayload == true }
    public var transformHeading: String { isTrigger ? "Payload transform" : "Transform" }

    public var transform: WireTransform { connection.transform ?? .identity }
    public var op: String { transform.op }
    public var ops: [String] { WireTransform.ops }
    public func label(for op: String) -> String { WireTransform.label(for: op) }
    public var hint: String { WireTransform.hint(for: op) }

    /// The inline number parameters of the current transform, in row order.
    public var params: [TransformParam] {
        switch transform {
        case .identity, .round, .invert, .format: return []
        case .scale(let factor): return [TransformParam(key: "factor", label: "Factor", value: factor)]
        case .offset(let amount): return [TransformParam(key: "amount", label: "Amount", value: amount)]
        case .clamp(let lo, let hi): return [TransformParam(key: "min", label: "Min", value: lo), TransformParam(key: "max", label: "Max", value: hi)]
        case .mapRange(let inMin, let inMax, let outMin, let outMax):
            return [
                TransformParam(key: "inMin", label: "In min", value: inMin),
                TransformParam(key: "inMax", label: "In max", value: inMax),
                TransformParam(key: "outMin", label: "Out min", value: outMin),
                TransformParam(key: "outMax", label: "Out max", value: outMax),
            ]
        case .threshold(let value): return [TransformParam(key: "value", label: "At least", value: value)]
        }
    }

    /// The `format` template, when the transform is one.
    public var template: String? {
        if case .format(let template) = transform { return template }
        return nil
    }

    public var edge: TriggerEdge? { isTrigger ? (connection.edge ?? .rising) : nil }
    public var edges: [TriggerEdge] { TriggerEdge.allCases }
    public var enabled: Bool { connection.enabled }
    public var enabledLabel: String { enabled ? "Disable wire" : "Enable wire" }

    /// The one obviously-correct conversion for this pair of semantic units,
    /// offered as a one-tap prefill when it differs from the current transform.
    public var suggestion: WireTransform? {
        guard !isTrigger, let suggested = WireTransform.suggested(from: sourceField?.unit, to: targetField?.unit) else { return nil }
        return suggested == transform ? nil : suggested
    }

    public var suggestionLabel: String? {
        guard let suggestion else { return nil }
        switch suggestion {
        case .scale(let factor): return "Multiply by \(JavaScript.numberString(factor))"
        case .clamp(let lo, let hi): return "Clamp \(JavaScript.numberString(lo))–\(JavaScript.numberString(hi))"
        default: return WireTransform.label(for: suggestion.op)
        }
    }

    public static let dampedNotice = "Loop breaker tripped — this wire was oscillating and is paused."

    // MARK: - Writes

    /// Switching the op resets its parameters to `defaultTransform(op)`.
    public func setOp(_ op: String) {
        guard let next = WireTransform.default(for: op) else { return }
        document.setConnectionTransform(connectionId, next)
    }

    /// `{ ...transform, key: value }` for one number parameter; other keys
    /// and the op are untouched. Unknown keys are ignored.
    public func setParam(_ key: String, _ value: Double) {
        let next: WireTransform?
        switch (transform, key) {
        case (.scale, "factor"): next = .scale(factor: value)
        case (.offset, "amount"): next = .offset(amount: value)
        case (.clamp(_, let hi), "min"): next = .clamp(min: value, max: hi)
        case (.clamp(let lo, _), "max"): next = .clamp(min: lo, max: value)
        case (.mapRange(_, let inMax, let outMin, let outMax), "inMin"): next = .mapRange(inMin: value, inMax: inMax, outMin: outMin, outMax: outMax)
        case (.mapRange(let inMin, _, let outMin, let outMax), "inMax"): next = .mapRange(inMin: inMin, inMax: value, outMin: outMin, outMax: outMax)
        case (.mapRange(let inMin, let inMax, _, let outMax), "outMin"): next = .mapRange(inMin: inMin, inMax: inMax, outMin: value, outMax: outMax)
        case (.mapRange(let inMin, let inMax, let outMin, _), "outMax"): next = .mapRange(inMin: inMin, inMax: inMax, outMin: outMin, outMax: value)
        case (.threshold, "value"): next = .threshold(value: value)
        default: next = nil
        }
        guard let next else { return }
        document.setConnectionTransform(connectionId, next)
    }

    public func setTemplate(_ template: String) {
        guard case .format = transform else { return }
        document.setConnectionTransform(connectionId, .format(template: template))
    }

    public func setEdge(_ edge: TriggerEdge) {
        guard isTrigger else { return }
        document.setConnectionEdge(connectionId, edge)
    }

    public func toggleEnabled() {
        document.setConnectionEnabled(connectionId, !enabled)
    }

    public func delete() {
        document.removeConnection(connectionId)
        document.updateCircuitUI { $0.closeInspector() }
    }

    /// Re-arm: lift the loop breaker (the web's `clearDamped`). Any wire edit
    /// also lifts it through the driver rule; this is the one-tap path that
    /// changes nothing else.
    public func rearm() {
        document.clearDamped()
    }

    public func applySuggestion() {
        guard let suggestion else { return }
        document.setConnectionTransform(connectionId, suggestion)
    }

    public func close() {
        document.updateCircuitUI { $0.closeInspector() }
    }
}
