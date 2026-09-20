import Foundation

// ---------------------------------------------------------------------------
// The JSON model the whole port rests on.
//
// Board bytes must come out of Swift exactly as JavaScript's JSON.stringify
// would write them (storage contract, law 6; roadmap decision 7). That has two
// consequences no ordinary Codable model can meet:
//
// 1. Objects are ORDERED the way JavaScript orders own properties: canonical
//    array-index keys ("0", "2", "10") first in ascending numeric order, then
//    every other key in insertion order. Assigning to an existing key keeps
//    its position; assigning a new key appends.
// 2. Strings may be ill-formed UTF-16 (a lone surrogate JavaScript happily
//    stores), which a Swift `String` cannot hold. Those are kept verbatim as
//    `.utf16` and written back as the same `\udxxx` escapes.
//
// Every persisted record (widget, relation, glue…) is a JSONObject with typed
// accessors on top, so unknown fields survive and key order is never invented.
//
// Keys are Swift strings. A lone surrogate inside a KEY is carried through by
// mapping it onto the last 2048 code points of plane 16 (U+10F800…U+10FFFF)
// and mapped back on output, which is exact for every real key and lossy
// only for a key that genuinely contains one of those private-use characters
// — the one documented limitation of this layer.
// ---------------------------------------------------------------------------

public enum JSONValue: Equatable, Hashable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    /// Ill-formed UTF-16 text (lone surrogates), preserved verbatim.
    case utf16([UInt16])
    case array([JSONValue])
    case object(JSONObject)

    public var isNull: Bool { if case .null = self { return true } else { return false } }

    public var boolValue: Bool? { if case .bool(let value) = self { return value } else { return nil } }

    public var numberValue: Double? { if case .number(let value) = self { return value } else { return nil } }

    /// A well-formed string. Ill-formed text is returned lossily (U+FFFD for
    /// each lone surrogate), which is what every reader that displays or
    /// computes over it should see.
    public var stringValue: String? {
        switch self {
        case .string(let value): return value
        case .utf16(let units): return String(decoding: units, as: UTF16.self)
        default: return nil
        }
    }

    /// True for `.string` and `.utf16` alike (JavaScript `typeof === 'string'`).
    public var isString: Bool {
        switch self {
        case .string, .utf16: return true
        default: return false
        }
    }

    public var arrayValue: [JSONValue]? { if case .array(let value) = self { return value } else { return nil } }

    public var objectValue: JSONObject? { if case .object(let value) = self { return value } else { return nil } }

    /// `typeof value === 'object' && value !== null && !Array.isArray(value)`.
    public var isRecord: Bool { if case .object = self { return true } else { return false } }

    /// `typeof value === 'number' && Number.isFinite(value)`; JSON numbers are always finite.
    public var finiteNumber: Double? { numberValue }

    public subscript(key: String) -> JSONValue? {
        get { objectValue?[key] }
    }

    public subscript(index: Int) -> JSONValue? {
        guard case .array(let items) = self, index >= 0, index < items.count else { return nil }
        return items[index]
    }
}

extension JSONValue: ExpressibleByStringLiteral, ExpressibleByIntegerLiteral, ExpressibleByFloatLiteral,
    ExpressibleByBooleanLiteral, ExpressibleByNilLiteral, ExpressibleByArrayLiteral, ExpressibleByDictionaryLiteral
{
    public init(stringLiteral value: String) { self = .string(value) }
    public init(integerLiteral value: Int) { self = .number(Double(value)) }
    public init(floatLiteral value: Double) { self = .number(value) }
    public init(booleanLiteral value: Bool) { self = .bool(value) }
    public init(nilLiteral: ()) { self = .null }
    public init(arrayLiteral elements: JSONValue...) { self = .array(elements) }
    public init(dictionaryLiteral elements: (String, JSONValue)...) {
        var object = JSONObject()
        for (key, value) in elements { object[key] = value }
        self = .object(object)
    }
}

/// An insertion-ordered JSON object with JavaScript property ordering.
public struct JSONObject: Equatable, Hashable {
    private var storage: [String: JSONValue] = [:]
    /// Every key in insertion order, index-like or not.
    private var insertion: [String] = []
    /// Whether any key is a canonical array index; only then does iteration
    /// need to reorder.
    private var hasIndexKeys = false

    public init() {}

    public init(_ pairs: [(String, JSONValue)]) {
        for (key, value) in pairs { self[key] = value }
    }

    public var isEmpty: Bool { storage.isEmpty }
    public var count: Int { storage.count }

    /// Keys in JavaScript own-property order.
    public var keys: [String] {
        guard hasIndexKeys else { return insertion }
        var indexed: [(UInt32, String)] = []
        var others: [String] = []
        for key in insertion {
            if let index = JSONObject.arrayIndex(key) { indexed.append((index, key)) }
            else { others.append(key) }
        }
        indexed.sort { $0.0 < $1.0 }
        return indexed.map(\.1) + others
    }

    /// `(key, value)` pairs in JavaScript own-property order.
    public var entries: [(key: String, value: JSONValue)] {
        keys.map { ($0, storage[$0]!) }
    }

    public var values: [JSONValue] { keys.map { storage[$0]! } }

    public subscript(key: String) -> JSONValue? {
        get { storage[key] }
        set {
            if let newValue {
                if storage.updateValue(newValue, forKey: key) == nil {
                    insertion.append(key)
                    if !hasIndexKeys, JSONObject.arrayIndex(key) != nil { hasIndexKeys = true }
                }
            } else {
                removeValue(forKey: key)
            }
        }
    }

    public func contains(_ key: String) -> Bool { storage[key] != nil }

    @discardableResult
    public mutating func removeValue(forKey key: String) -> JSONValue? {
        guard let removed = storage.removeValue(forKey: key) else { return nil }
        if let position = insertion.firstIndex(of: key) { insertion.remove(at: position) }
        return removed
    }

    /// JavaScript object spread: every key of `other` assigned in its order.
    public mutating func merge(_ other: JSONObject) {
        for (key, value) in other.entries { self[key] = value }
    }

    /// `{ ...self, ...other }`.
    public func merging(_ other: JSONObject) -> JSONObject {
        var copy = self
        copy.merge(other)
        return copy
    }

    /// A copy without the given keys (`delete obj[key]`).
    public func removing(_ removedKeys: [String]) -> JSONObject {
        var copy = self
        for key in removedKeys { copy.removeValue(forKey: key) }
        return copy
    }

    /// A copy keeping only the keys the predicate accepts, in the same order.
    public func filter(_ isIncluded: (String, JSONValue) -> Bool) -> JSONObject {
        var copy = JSONObject()
        for (key, value) in entries where isIncluded(key, value) { copy[key] = value }
        return copy
    }

    public static func == (lhs: JSONObject, rhs: JSONObject) -> Bool {
        lhs.storage == rhs.storage && lhs.keys == rhs.keys
    }

    public func hash(into hasher: inout Hasher) {
        for (key, value) in entries {
            hasher.combine(key)
            hasher.combine(value)
        }
    }

    /// First private-use code point standing in for a lone surrogate in a key.
    public static let illFormedKeyBase: UInt32 = 0x10F800

    /// A key that was ill-formed UTF-16 on the wire, made storable.
    public static func keyFromIllFormedUTF16(_ units: [UInt16]) -> String {
        var scalars = String.UnicodeScalarView()
        var index = 0
        while index < units.count {
            let unit = units[index]
            if (0xD800...0xDBFF).contains(unit), index + 1 < units.count, (0xDC00...0xDFFF).contains(units[index + 1]) {
                let high = UInt32(unit - 0xD800), low = UInt32(units[index + 1] - 0xDC00)
                scalars.append(Unicode.Scalar(0x10000 + (high << 10) + low)!)
                index += 2
                continue
            }
            if (0xD800...0xDFFF).contains(unit) {
                scalars.append(Unicode.Scalar(illFormedKeyBase + UInt32(unit - 0xD800))!)
            } else {
                scalars.append(Unicode.Scalar(unit)!)
            }
            index += 1
        }
        return String(scalars)
    }

    /// A canonical array index: the decimal form of an integer in 0…2^32−2
    /// with no leading zeros, sign, or whitespace. Such keys iterate first,
    /// in numeric order, on every JavaScript object.
    public static func arrayIndex(_ key: String) -> UInt32? {
        let utf8 = key.utf8
        guard !utf8.isEmpty, utf8.count <= 10 else { return nil }
        var value: UInt64 = 0
        var first = true
        for byte in utf8 {
            guard byte >= 48, byte <= 57 else { return nil }
            if first, byte == 48, utf8.count > 1 { return nil }
            first = false
            value = value * 10 + UInt64(byte - 48)
        }
        guard value <= 4_294_967_294 else { return nil }
        return UInt32(value)
    }
}

extension JSONObject: ExpressibleByDictionaryLiteral {
    public init(dictionaryLiteral elements: (String, JSONValue)...) {
        for (key, value) in elements { self[key] = value }
    }
}

// MARK: - Conveniences shared by every record type

public extension JSONObject {
    func string(_ key: String) -> String? { self[key]?.stringValue }
    func number(_ key: String) -> Double? { self[key]?.numberValue }
    func bool(_ key: String) -> Bool? { self[key]?.boolValue }
    func object(_ key: String) -> JSONObject? { self[key]?.objectValue }
    func array(_ key: String) -> [JSONValue]? { self[key]?.arrayValue }
    /// `typeof value === 'string'` — true for ill-formed strings too.
    func isString(_ key: String) -> Bool { self[key]?.isString ?? false }
}
