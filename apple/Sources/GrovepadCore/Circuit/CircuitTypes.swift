import Foundation

// ---------------------------------------------------------------------------
// Circuit vocabulary shared by the model, the engine and the field tables
// (`types/circuit.ts`, `types/fieldConnections.ts`, `widgets/contracts/fields.ts`).
// ---------------------------------------------------------------------------

/// One sample of a series field.
public struct SeriesPoint: Equatable, Hashable, Sendable {
    public var t: Double
    public var v: Double

    public init(t: Double, v: Double) {
        self.t = t
        self.v = v
    }

    public init?(json: JSONValue) {
        guard let object = json.objectValue, let t = object.number("t"), let v = object.number("v") else { return nil }
        self.init(t: t, v: v)
    }

    public var json: JSONValue {
        var object = JSONObject()
        object["t"] = .number(t)
        object["v"] = .number(v)
        return .object(object)
    }
}

/// `FieldValue = number | boolean | string | SeriesPoint[]`.
public enum FieldValue: Equatable, Hashable, Sendable {
    case number(Double)
    case bool(Bool)
    case text(String)
    case series([SeriesPoint])

    public var json: JSONValue {
        switch self {
        case .number(let value): return .number(value)
        case .bool(let value): return .bool(value)
        case .text(let value): return .string(value)
        case .series(let points): return .array(points.map(\.json))
        }
    }

    /// A field value from JSON as the pack encodes it; anything else is nil.
    public init?(json: JSONValue) {
        switch json {
        case .number(let value): self = .number(value)
        case .bool(let value): self = .bool(value)
        case .string, .utf16: self = .text(json.stringValue ?? "")
        case .array(let items):
            var points: [SeriesPoint] = []
            for item in items {
                guard let point = SeriesPoint(json: item) else { return nil }
                points.append(point)
            }
            self = .series(points)
        default: return nil
        }
    }
}

/// The value flavor of a bindable field — display formatting and port colour.
public enum FieldValueType: String, CaseIterable, Sendable {
    case number
    case boolean
    case text
    case series
}

/// Advisory semantic tag; never gates a connection (widget constitution III.3).
public enum SemanticUnit: String, CaseIterable, Sendable {
    case percent
    case ratio
    case currency
    case count
    case durationSeconds = "duration_s"
    case dateISO = "date_iso"
    case none
}

/// The no-code computation layer riding on value wires (`WireTransform`).
public enum WireTransform: Equatable, Hashable, Sendable {
    case identity
    case scale(factor: Double)
    case offset(amount: Double)
    case clamp(min: Double, max: Double)
    case mapRange(inMin: Double, inMax: Double, outMin: Double, outMax: Double)
    case round
    case invert
    case threshold(value: Double)
    case format(template: String)

    public static let ops: [String] = ["identity", "scale", "offset", "clamp", "map_range", "round", "invert", "threshold", "format"]

    public var op: String {
        switch self {
        case .identity: return "identity"
        case .scale: return "scale"
        case .offset: return "offset"
        case .clamp: return "clamp"
        case .mapRange: return "map_range"
        case .round: return "round"
        case .invert: return "invert"
        case .threshold: return "threshold"
        case .format: return "format"
        }
    }

    public static func label(for op: String) -> String {
        switch op {
        case "identity": return "Pass through"
        case "scale": return "Multiply"
        case "offset": return "Add"
        case "clamp": return "Clamp"
        case "map_range": return "Map range"
        case "round": return "Round"
        case "invert": return "Invert"
        case "threshold": return "Threshold"
        case "format": return "Format text"
        default: return op
        }
    }

    public static func hint(for op: String) -> String {
        switch op {
        case "identity": return "Deliver the value unchanged"
        case "scale": return "value × factor"
        case "offset": return "value + amount"
        case "clamp": return "Keep the value between min and max"
        case "map_range": return "Re-map one numeric range onto another"
        case "round": return "Round to the nearest integer"
        case "invert": return "NOT for booleans, negate for numbers"
        case "threshold": return "true when value ≥ threshold"
        case "format": return "Insert the value into a text template ({value})"
        default: return ""
        }
    }

    /// `defaultTransform(op)` — a fresh parameter set for the inspector.
    public static func `default`(for op: String) -> WireTransform? {
        switch op {
        case "identity": return .identity
        case "scale": return .scale(factor: 2)
        case "offset": return .offset(amount: 1)
        case "clamp": return .clamp(min: 0, max: 100)
        case "map_range": return .mapRange(inMin: 0, inMax: 100, outMin: 0, outMax: 1)
        case "round": return .round
        case "invert": return .invert
        case "threshold": return .threshold(value: 1)
        case "format": return .format(template: "{value}")
        default: return nil
        }
    }

    /// `isValidTransform`: the strict shape the persistence layer accepts.
    public init?(json: JSONValue?) {
        guard let object = json?.objectValue, let op = object.string("op") else { return nil }
        switch op {
        case "identity": self = .identity
        case "round": self = .round
        case "invert": self = .invert
        case "scale":
            guard let factor = object.number("factor") else { return nil }
            self = .scale(factor: factor)
        case "offset":
            guard let amount = object.number("amount") else { return nil }
            self = .offset(amount: amount)
        case "clamp":
            guard let lo = object.number("min"), let hi = object.number("max") else { return nil }
            self = .clamp(min: lo, max: hi)
        case "map_range":
            guard let inMin = object.number("inMin"), let inMax = object.number("inMax"),
                  let outMin = object.number("outMin"), let outMax = object.number("outMax") else { return nil }
            self = .mapRange(inMin: inMin, inMax: inMax, outMin: outMin, outMax: outMax)
        case "threshold":
            guard let value = object.number("value") else { return nil }
            self = .threshold(value: value)
        case "format":
            guard object["template"]?.isString == true, let template = object.string("template"), template.utf16.count <= 400 else { return nil }
            self = .format(template: template)
        default: return nil
        }
    }

    /// The record shape the web app writes for a new transform.
    public var json: JSONValue {
        var object = JSONObject()
        object["op"] = .string(op)
        switch self {
        case .identity, .round, .invert: break
        case .scale(let factor): object["factor"] = .number(factor)
        case .offset(let amount): object["amount"] = .number(amount)
        case .clamp(let lo, let hi):
            object["min"] = .number(lo)
            object["max"] = .number(hi)
        case .mapRange(let inMin, let inMax, let outMin, let outMax):
            object["inMin"] = .number(inMin)
            object["inMax"] = .number(inMax)
            object["outMin"] = .number(outMin)
            object["outMax"] = .number(outMax)
        case .threshold(let value): object["value"] = .number(value)
        case .format(let template): object["template"] = .string(template)
        }
        return .object(object)
    }

    /// `suggestTransform`: the one obviously-correct conversion, or nil.
    public static func suggested(from: SemanticUnit?, to: SemanticUnit?) -> WireTransform? {
        guard let from, let to, from != .none, to != .none, from != to else { return nil }
        if from == .ratio, to == .percent { return .scale(factor: 100) }
        if from == .percent, to == .ratio { return .scale(factor: 0.01) }
        if from == .count, to == .percent { return .clamp(min: 0, max: 100) }
        return nil
    }
}

/// Wire colour language — one hue per value flavor (`VALUE_TYPE_COLORS`).
public enum WireColors {
    public static func hex(for type: FieldValueType) -> String {
        switch type {
        case .number: return "#31a6ff"
        case .boolean: return "#1fe58c"
        case .text: return "#b46bff"
        case .series: return "#ffab1a"
        }
    }

    public static let trigger = "#ff5470"
}
