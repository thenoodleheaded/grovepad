import Foundation
import GrovepadCore
import GrovepadCanvas

// ---------------------------------------------------------------------------
// UITouch → PointerEvent, as data. Kept free of UIKit so the rule is tested
// on the build Mac:
//
//   - a finger is `.touch`: the gesture engine's touch path (one finger
//     pans per mode, two fingers pinch, release flings, a still finger opens
//     the widget library after LONG_PRESS_MS);
//   - a Pencil is `.pen`: it never enters the touch table, so it can never
//     pinch or fling, and — because the live card's own view receives the
//     contact first — it never pans a text field; on empty canvas it pans
//     like a mouse drag would;
//   - an indirect pointer (trackpad / mouse on iPad) is `.mouse`.
//
// Pointer ids are minted per contact so two fingers never share one.
// ---------------------------------------------------------------------------

public enum TouchContactKind: Equatable, Sendable {
    case finger
    case pencil
    case indirectPointer
}

public enum TouchPointerTranslation {
    public static func kind(for contact: TouchContactKind) -> PointerKind {
        switch contact {
        case .finger: return .touch
        case .pencil: return .pen
        case .indirectPointer: return .mouse
        }
    }

    /// Build the engine event for one contact sample. `timestamp` is
    /// seconds on the touch's clock (`UITouch.timestamp`), converted to ms.
    public static func event(id: Int, contact: TouchContactKind, phase: PointerPhase, point: Vector2D, timestampSeconds: Double, isEmptyCanvas: Bool = true, modifiers: PointerModifiers = []) -> PointerEvent {
        PointerEvent(
            id: id, kind: kind(for: contact), phase: phase,
            point: point, button: 0,
            timestamp: timestampSeconds * 1000,
            modifiers: modifiers,
            isEmptyCanvas: isEmptyCanvas
        )
    }

    /// Hands out stable ids per live contact, reusing none while a contact
    /// is down.
    public struct ContactTable {
        private var ids: [ObjectIdentifier: Int] = [:]
        private var next = 1

        public init() {}

        public var liveCount: Int { ids.count }

        public mutating func id(for contact: AnyObject) -> Int {
            let key = ObjectIdentifier(contact)
            if let id = ids[key] { return id }
            let id = next
            next += 1
            ids[key] = id
            return id
        }

        public mutating func release(_ contact: AnyObject) -> Int? {
            ids.removeValue(forKey: ObjectIdentifier(contact))
        }

        public mutating func releaseAll() { ids.removeAll() }
    }
}
