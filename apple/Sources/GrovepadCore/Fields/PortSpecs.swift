import Foundation

// ---------------------------------------------------------------------------
// Port lists (`utils/portGeometry.ts`, the list half — rail math lives in
// GrovepadCanvas). Output ports are every readable field; input ports are the
// settable fields followed by the commands. A port's index is its rail slot.
// ---------------------------------------------------------------------------

public enum PortKind: String, Sendable {
    case field
    case command
}

public struct PortSpec: Equatable, Hashable, Sendable {
    /// Field key, or command key for command ports.
    public let key: String
    public let label: String
    public let kind: PortKind
    /// Field ports only.
    public let valueType: FieldValueType?
    /// Field ports only — advisory, drives auto-suggested transforms.
    public let unit: SemanticUnit?
    /// Command ports only — whether `run` reads the trigger wire's payload.
    public let acceptsPayload: Bool
    /// Position in its rail — the port slot.
    public let index: Int

    public init(key: String, label: String, kind: PortKind, valueType: FieldValueType? = nil, unit: SemanticUnit? = nil, acceptsPayload: Bool = false, index: Int) {
        self.key = key
        self.label = label
        self.kind = kind
        self.valueType = valueType
        self.unit = unit
        self.acceptsPayload = acceptsPayload
        self.index = index
    }
}

private final class PortCache: @unchecked Sendable {
    private let lock = NSLock()
    private var outputs: [String: [PortSpec]] = [:]
    private var inputs: [String: [PortSpec]] = [:]

    static let shared = PortCache()

    func outputPorts(for type: String) -> [PortSpec] {
        lock.lock()
        defer { lock.unlock() }
        if let cached = outputs[type] { return cached }
        let ports = fieldsFor(type).enumerated().map { index, field in
            PortSpec(key: field.key, label: field.label, kind: .field, valueType: field.valueType, unit: field.unit, index: index)
        }
        outputs[type] = ports
        return ports
    }

    func inputPorts(for type: String) -> [PortSpec] {
        lock.lock()
        defer { lock.unlock() }
        if let cached = inputs[type] { return cached }
        var ports: [PortSpec] = []
        for field in fieldsFor(type) where field.set != nil {
            ports.append(PortSpec(key: field.key, label: field.label, kind: .field, valueType: field.valueType, unit: field.unit, index: ports.count))
        }
        for command in commandsFor(type) {
            ports.append(PortSpec(key: command.key, label: command.label, kind: .command, acceptsPayload: command.acceptsPayload, index: ports.count))
        }
        inputs[type] = ports
        return ports
    }
}

/// Every readable field — anything can be listened to.
public func outputPortsFor(_ type: String) -> [PortSpec] {
    PortCache.shared.outputPorts(for: type)
}

/// Settable fields, then commands — everything a wire can drive.
public func inputPortsFor(_ type: String) -> [PortSpec] {
    PortCache.shared.inputPorts(for: type)
}

public func findOutputPort(_ type: String, _ key: String) -> PortSpec? {
    outputPortsFor(type).first { $0.key == key }
}

public func findInputPort(_ type: String, _ key: String, _ kind: PortKind) -> PortSpec? {
    inputPortsFor(type).first { $0.key == key && $0.kind == kind }
}
