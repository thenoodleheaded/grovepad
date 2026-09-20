import Foundation
import GrovepadCore

// ---------------------------------------------------------------------------
// Port of `y-protocols/awareness` (the parts the runtime uses): per-client
// JSON states with Lamport clocks, the binary update format browsers send,
// removal, and the 30 s outdated sweep. Byte for byte the same encoding:
//
//   varUint(count) · [ varUint(clientID) · varUint(clock) · varString(JSON) ]*
//
// Awareness is ephemeral: it is never written to the board or the CRDT log.
// ---------------------------------------------------------------------------

public final class Awareness {
    /// `outdatedTimeout`: a remote state not renewed for this long is dropped.
    public static let outdatedTimeoutMs = 30_000.0

    public struct Meta: Equatable {
        public var clock: UInt64
        public var lastUpdated: Double
    }

    public struct Change: Equatable {
        public var added: [UInt64] = []
        public var updated: [UInt64] = []
        public var removed: [UInt64] = []
        /// Clients whose state arrived again unchanged (`filteredUpdated`).
        public var unchanged: [UInt64] = []

        public var isEmpty: Bool { added.isEmpty && updated.isEmpty && removed.isEmpty && unchanged.isEmpty }
    }

    public enum Origin: Equatable {
        case local
        case remote
    }

    public let clientId: UInt64
    public private(set) var states: [UInt64: JSONObject] = [:]
    public private(set) var meta: [UInt64: Meta] = [:]
    /// Fired after every applied change (`awareness.on('update')`).
    public var onUpdate: ((Change, Origin) -> Void)?
    private let now: () -> Double

    public init(clientId: UInt64, now: @escaping () -> Double = { Date().timeIntervalSince1970 * 1000 }) {
        self.clientId = clientId
        self.now = now
        setLocalState(JSONObject())
    }

    public var localState: JSONObject? { states[clientId] }

    /// `setLocalState`: `nil` announces that this client left.
    public func setLocalState(_ state: JSONObject?) {
        let previousMeta = meta[clientId]
        let clock = previousMeta.map { $0.clock + 1 } ?? 0
        let previous = states[clientId]
        if let state { states[clientId] = state } else { states[clientId] = nil }
        meta[clientId] = Meta(clock: clock, lastUpdated: now())
        var change = Change()
        if state == nil {
            if previous != nil { change.removed.append(clientId) }
        } else if previous == nil {
            change.added.append(clientId)
        } else if previous != state {
            change.updated.append(clientId)
        } else {
            change.unchanged.append(clientId)
        }
        if !change.isEmpty { onUpdate?(change, .local) }
    }

    /// `encodeAwarenessUpdate(awareness, clients)`.
    public func encodeUpdate(clients: [UInt64]) -> Data {
        var writer = Lib0Writer()
        writer.writeVarUint(UInt64(clients.count))
        for id in clients {
            writer.writeVarUint(id)
            writer.writeVarUint(meta[id]?.clock ?? 0)
            writer.writeVarString(states[id].map { JSONWriter.stringify(.object($0)) } ?? "null")
        }
        return writer.bytes
    }

    /// `applyAwarenessUpdate(awareness, update, origin)`.
    public func applyUpdate(_ update: Data, origin: Origin = .remote) throws {
        var reader = Lib0Reader(update)
        let timestamp = now()
        var change = Change()
        let count = try reader.readVarUint()
        for _ in 0..<count {
            let id = try reader.readVarUint()
            var clock = try reader.readVarUint()
            let text = try reader.readVarString()
            let parsed = try JSONParser.parse(text)
            let state: JSONObject?
            switch parsed {
            case .null: state = nil
            case .object(let object): state = object
            default: throw CollaborationError("Awareness state is not an object")
            }
            let clientMeta = meta[id]
            let previous = states[id]
            let currentClock = clientMeta?.clock ?? 0
            guard currentClock < clock || (currentClock == clock && state == nil && states[id] != nil) else { continue }
            if state == nil {
                // A peer cannot remove this client's live state; answer by
                // renewing it with a higher clock.
                if id == clientId, localState != nil {
                    clock += 1
                } else {
                    states[id] = nil
                }
            } else {
                states[id] = state
            }
            meta[id] = Meta(clock: clock, lastUpdated: timestamp)
            if clientMeta == nil, state != nil {
                change.added.append(id)
            } else if clientMeta != nil, state == nil {
                change.removed.append(id)
            } else if let state {
                if state != previous { change.updated.append(id) } else { change.unchanged.append(id) }
            }
        }
        if !change.isEmpty { onUpdate?(change, origin) }
    }

    /// `removeAwarenessStates(awareness, clients, origin)`.
    public func removeStates(_ clients: [UInt64], origin: Origin) {
        var removed: [UInt64] = []
        for id in clients where states[id] != nil {
            states[id] = nil
            if id == clientId, let current = meta[id] {
                meta[id] = Meta(clock: current.clock + 1, lastUpdated: now())
            }
            removed.append(id)
        }
        if !removed.isEmpty { onUpdate?(Change(removed: removed), origin) }
    }

    /// The periodic check (every `outdatedTimeout / 10`): renew the local
    /// state at half the timeout, drop remote states past it.
    public func checkOutdated() {
        let time = now()
        if localState != nil, let local = meta[clientId], Self.outdatedTimeoutMs / 2 <= time - local.lastUpdated {
            setLocalState(localState)
        }
        var removed: [UInt64] = []
        for (id, entry) in meta where id != clientId && Self.outdatedTimeoutMs <= time - entry.lastUpdated && states[id] != nil {
            removed.append(id)
        }
        for id in removed { states[id] = nil }
        if !removed.isEmpty { onUpdate?(Change(removed: removed.sorted()), .remote) }
    }

    /// `awareness.destroy()`: announce leaving.
    public func destroy() {
        setLocalState(nil)
        onUpdate = nil
    }
}

// MARK: - lib0 varints

struct Lib0Writer {
    private(set) var bytes = Data()

    mutating func writeVarUint(_ value: UInt64) {
        var number = value
        while number > 0x7F {
            bytes.append(UInt8(0x80 | (number & 0x7F)))
            number >>= 7
        }
        bytes.append(UInt8(number))
    }

    mutating func writeVarString(_ string: String) {
        let utf8 = Array(string.utf8)
        writeVarUint(UInt64(utf8.count))
        bytes.append(contentsOf: utf8)
    }
}

struct Lib0Reader {
    private let bytes: [UInt8]
    private var position = 0

    init(_ data: Data) { bytes = [UInt8](data) }

    mutating func readVarUint() throws -> UInt64 {
        var number: UInt64 = 0
        var shift: UInt64 = 0
        while true {
            guard position < bytes.count else { throw CollaborationError("Unexpected end of awareness update") }
            let byte = bytes[position]
            position += 1
            guard shift < 64 else { throw CollaborationError("Awareness integer out of range") }
            number |= UInt64(byte & 0x7F) << shift
            shift += 7
            if byte < 0x80 { return number }
        }
    }

    mutating func readVarString() throws -> String {
        let length = Int(try readVarUint())
        guard length <= bytes.count - position else { throw CollaborationError("Unexpected end of awareness update") }
        let slice = bytes[position..<position + length]
        position += length
        return String(decoding: slice, as: UTF8.self)
    }
}
