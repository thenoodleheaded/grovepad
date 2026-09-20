import Foundation

/// An id-keyed collection with JavaScript object ordering: array-index keys
/// first in numeric order, then insertion order. Every board record map
/// (`widgets`, `relations`, …) is one of these, so iteration and the bytes
/// written from it match what the web app does with a plain object.
public struct OrderedMap<Value> {
    private var storage: [String: Value] = [:]
    private var insertion: [String] = []
    private var hasIndexKeys = false

    public init() {}

    public init(_ pairs: [(String, Value)]) {
        for (key, value) in pairs { self[key] = value }
    }

    public var isEmpty: Bool { storage.isEmpty }
    public var count: Int { storage.count }

    public var keys: [String] {
        guard hasIndexKeys else { return insertion }
        var indexed: [(UInt32, String)] = []
        var others: [String] = []
        for key in insertion {
            if let index = JSONObject.arrayIndex(key) { indexed.append((index, key)) } else { others.append(key) }
        }
        indexed.sort { $0.0 < $1.0 }
        return indexed.map(\.1) + others
    }

    public var values: [Value] { keys.map { storage[$0]! } }

    public var entries: [(key: String, value: Value)] { keys.map { ($0, storage[$0]!) } }

    public subscript(key: String) -> Value? {
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
    public mutating func removeValue(forKey key: String) -> Value? {
        guard let removed = storage.removeValue(forKey: key) else { return nil }
        if let position = insertion.firstIndex(of: key) { insertion.remove(at: position) }
        return removed
    }

    public mutating func merge(_ other: OrderedMap<Value>) {
        for (key, value) in other.entries { self[key] = value }
    }

    public func merging(_ other: OrderedMap<Value>) -> OrderedMap<Value> {
        var copy = self
        copy.merge(other)
        return copy
    }

    public func mapValues<T>(_ transform: (Value) throws -> T) rethrows -> OrderedMap<T> {
        var result = OrderedMap<T>()
        for (key, value) in entries { result[key] = try transform(value) }
        return result
    }

    public func filter(_ isIncluded: (String, Value) throws -> Bool) rethrows -> OrderedMap<Value> {
        var result = OrderedMap<Value>()
        for (key, value) in entries where try isIncluded(key, value) { result[key] = value }
        return result
    }
}

extension OrderedMap: Equatable where Value: Equatable {
    public static func == (lhs: OrderedMap<Value>, rhs: OrderedMap<Value>) -> Bool {
        lhs.storage == rhs.storage && lhs.keys == rhs.keys
    }
}

extension OrderedMap: Hashable where Value: Hashable {
    public func hash(into hasher: inout Hasher) {
        for (key, value) in entries {
            hasher.combine(key)
            hasher.combine(value)
        }
    }
}

extension OrderedMap: Sequence {
    public func makeIterator() -> IndexingIterator<[(key: String, value: Value)]> {
        entries.makeIterator()
    }
}

extension OrderedMap: ExpressibleByDictionaryLiteral {
    public init(dictionaryLiteral elements: (String, Value)...) {
        for (key, value) in elements { self[key] = value }
    }
}

public extension OrderedMap where Value == JSONObject {
    /// The map as a JSON object, in the same order.
    var json: JSONValue {
        var object = JSONObject()
        for (key, value) in entries { object[key] = .object(value) }
        return .object(object)
    }
}
