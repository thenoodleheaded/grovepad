import Foundation

// ---------------------------------------------------------------------------
// The field and command table protocol (`widgets/contracts/fields.ts`).
//
// A widget type's field list is its circuit vocabulary: every field is an
// output port; a field with a setter is also an input port; commands are
// one-shot input ports. A field's index in its list IS its port slot, so the
// order of every table in this directory is load-bearing.
// ---------------------------------------------------------------------------

/// One bindable value inside a widget's data (`FieldDescriptor`).
public struct FieldDescriptor {
    public let key: String
    public let label: String
    public let valueType: FieldValueType
    /// Advisory semantic tag — drives suggested transforms, never gates a wire.
    public let unit: SemanticUnit?
    /// Re-read on the shared heartbeat while connected (wall-clock fields).
    public let timeSensitive: Bool
    /// Fast and total: reads the current value out of module data.
    public let get: (JSONObject) -> FieldValue
    /// Tolerant: coerces and clamps, assigns into the existing data in place
    /// (the web's `{ ...data, field: value }`). Absent = read-only source.
    /// The minter stands in for the web's inline `crypto.randomUUID()` (only
    /// bar_chart's series setter mints); determinism is injected, never global.
    public let set: ((JSONObject, FieldValue, IdMinter) -> JSONObject)?

    public init(
        key: String, label: String, valueType: FieldValueType, unit: SemanticUnit? = nil, timeSensitive: Bool = false,
        get: @escaping (JSONObject) -> FieldValue, set: ((JSONObject, FieldValue, IdMinter) -> JSONObject)? = nil
    ) {
        self.key = key
        self.label = label
        self.valueType = valueType
        self.unit = unit
        self.timeSensitive = timeSensitive
        self.get = get
        self.set = set
    }
}

/// A one-shot mutation a trigger wire can fire (`CommandDescriptor`).
public struct CommandDescriptor {
    public let key: String
    public let label: String
    /// True when `run` reads the payload and the inspector should offer a transform.
    public let acceptsPayload: Bool
    /// Apply one trigger delivery. The payload is the post-transform source
    /// value; the minter stands in for the web's inline `crypto.randomUUID()`.
    public let run: (JSONObject, FieldValue?, IdMinter) -> JSONObject

    public init(key: String, label: String, acceptsPayload: Bool = false, run: @escaping (JSONObject, FieldValue?, IdMinter) -> JSONObject) {
        self.key = key
        self.label = label
        self.acceptsPayload = acceptsPayload
        self.run = run
    }
}

// MARK: - Tolerant reads shared by every table

// The TypeScript reads typed data and would throw on a missing array or
// object; the port reads through these instead, so malformed data yields an
// empty or zero reading rather than a crash. Where the web would NOT throw
// (a missing primitive read as `undefined`), the same `undefined` semantics
// are reproduced by the callers.
extension JSONObject {
    /// `data.key` as an array of records, `[]` when absent or not an array.
    func records(_ key: String) -> [JSONObject] {
        (array(key) ?? []).map { $0.objectValue ?? JSONObject() }
    }

    /// `data.key` as raw array items, `[]` when absent.
    func items(_ key: String) -> [JSONValue] {
        array(key) ?? []
    }

    /// A string slot, `""` when absent or not a string (the web would throw on `.trim()`).
    func str(_ key: String) -> String {
        string(key) ?? ""
    }

    /// `String.prototype.trim()` of a string slot, empty when absent.
    func trimmed(_ key: String) -> String {
        JavaScript.trim(str(key))
    }

    /// A number slot, `0` when absent or not a number.
    func dbl(_ key: String) -> Double {
        number(key) ?? 0
    }

    /// `Number.isFinite(x) ? x : 0` for a slot.
    func finiteOrZero(_ key: String) -> Double {
        guard let value = number(key), value.isFinite else { return 0 }
        return value
    }

    /// The field-value reading of a primitive slot, or the typed default when
    /// the slot is missing or has no field-value shape.
    func fieldValue(_ key: String, default fallback: FieldValue) -> FieldValue {
        guard let raw = self[key], let value = FieldValue(loose: raw) else { return fallback }
        return value
    }

    /// `{ ...self, key: value }` for a single slot.
    func assigning(_ key: String, _ value: JSONValue) -> JSONObject {
        var copy = self
        copy[key] = value
        return copy
    }

    /// `{ ...self, key: items.map(transform) }` over an array of records.
    func mappingRecords(_ key: String, _ transform: (JSONObject) -> JSONObject) -> JSONObject {
        var copy = self
        copy[key] = .array(items(key).map { .object(transform($0.objectValue ?? JSONObject())) })
        return copy
    }
}

/// JavaScript `%` on doubles (truncating, sign of the dividend).
@inlinable func jsRemainder(_ lhs: Double, _ rhs: Double) -> Double {
    lhs.truncatingRemainder(dividingBy: rhs)
}
