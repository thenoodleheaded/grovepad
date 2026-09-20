import Foundation
import GrovepadCore

// ---------------------------------------------------------------------------
// The glass budget (roadmap decision 5). System glass containers go to the
// chrome and to at most a handful of cards nearest the pointer; every other
// card is a flat tinted layer. The budget honours the system
// reduce-transparency setting by handing out nothing at all.
//
// Membership has hysteresis so a pointer jittering between two cards does
// not flicker glass on and off: a card keeps its glass until another card is
// clearly nearer than it, by `hysteresisMargin` world units.
// ---------------------------------------------------------------------------

public struct GlassCard: Equatable, Sendable {
    public var id: String
    public var frame: WorldRect

    public init(id: String, frame: WorldRect) {
        self.id = id
        self.frame = frame
    }
}

public struct GlassBudget: Equatable, Sendable {
    public var limit: Int
    public var reduceTransparency: Bool
    /// A challenger must be nearer than an incumbent by this much before it
    /// takes the incumbent's glass.
    public var hysteresisMargin: Double

    /// The cards currently allowed to use system glass.
    public private(set) var allowed: Set<String> = []

    public init(limit: Int = 6, reduceTransparency: Bool = false, hysteresisMargin: Double = 24) {
        self.limit = max(0, limit)
        self.reduceTransparency = reduceTransparency
        self.hysteresisMargin = hysteresisMargin
    }

    /// Distance from a world point to a rect's nearest edge; 0 inside.
    public static func distance(from point: Vector2D, to rect: WorldRect) -> Double {
        let dx = max(rect.x - point.x, 0, point.x - rect.maxX)
        let dy = max(rect.y - point.y, 0, point.y - rect.maxY)
        return (dx * dx + dy * dy).squareRoot()
    }

    /// Re-evaluate against the pointer's world position and the live and
    /// resting card frames. A nil pointer (left the canvas) keeps the set as
    /// it was, minus cards that no longer exist.
    @discardableResult
    public mutating func update(pointer: Vector2D?, cards: [GlassCard]) -> Set<String> {
        if reduceTransparency || limit == 0 {
            allowed = []
            return allowed
        }
        let present = Set(cards.map(\.id))
        allowed = allowed.intersection(present)
        guard let pointer else {
            // A budget that only ever grants is not a budget: a lowered
            // limit (Settings → visual quality) has to take glass back, and
            // it has to do so even while the pointer is off the canvas.
            if allowed.count > limit { allowed = Set(allowed.sorted().prefix(limit)) }
            return allowed
        }

        var distances: [String: Double] = [:]
        distances.reserveCapacity(cards.count)
        for card in cards { distances[card.id] = GlassBudget.distance(from: pointer, to: card.frame) }
        let ranked = cards.map { ($0.id, distances[$0.id]!) }.sorted { a, b in
            a.1 != b.1 ? a.1 < b.1 : a.0 < b.0
        }

        var next = allowed
        // Over budget (the limit dropped since the last pass): the nearest
        // incumbents keep their glass, the rest hand it back.
        if next.count > limit {
            next = Set(next.sorted { a, b in
                distances[a]! != distances[b]! ? distances[a]! < distances[b]! : a < b
            }.prefix(limit))
        }
        for (id, distance) in ranked {
            if next.contains(id) { continue }
            if next.count < limit {
                next.insert(id)
                continue
            }
            // Full: only displace the farthest incumbent when this card is
            // clearly nearer than it.
            guard let farthest = next.max(by: { distances[$0]! < distances[$1]! }) else { break }
            let farthestDistance = distances[farthest]!
            if distance + hysteresisMargin < farthestDistance {
                next.remove(farthest)
                next.insert(id)
            } else {
                // Everything after this is at least as far; nothing else can win.
                break
            }
        }
        allowed = next
        return allowed
    }

    public func allows(_ id: String) -> Bool {
        allowed.contains(id)
    }
}
