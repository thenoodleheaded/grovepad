import Foundation
import GrovepadCore

// ---------------------------------------------------------------------------
// Marquee selection (`utils/marqueeSelection.ts`, plus the hit rect and the
// pointer-intent table the gesture engine reads from
// `utils/canvasGesturePolicy.ts`).
// ---------------------------------------------------------------------------

/// How a finished marquee combines with what was already selected.
///
/// A plain box replaces the selection, which is what every canvas tool does
/// and what makes an empty drag a deliberate "select nothing". Shift keeps the
/// additive behaviour — shift is also the gesture that STARTS a marquee in
/// navigate mode, so a shift-drag must never throw away the selection the user
/// is building. Alt removes the boxed widgets from the selection.
public enum MarqueeMode: String, Sendable {
    case replace
    case add
    case subtract
}

public func marqueeModeFor(shift: Bool, alt: Bool) -> MarqueeMode {
    if alt { return .subtract }
    if shift { return .add }
    return .replace
}

/// JavaScript-Set semantics: first occurrence wins and order is insertion.
public func mergeMarqueeSelection(current: [String], boxed: [String], mode: MarqueeMode) -> [String] {
    var boxedOrdered: [String] = []
    var boxedSeen = Set<String>()
    for id in boxed where boxedSeen.insert(id).inserted { boxedOrdered.append(id) }
    if mode == .replace { return boxedOrdered }
    var next: [String] = []
    var seen = Set<String>()
    for id in current where seen.insert(id).inserted { next.append(id) }
    for id in boxedOrdered {
        if mode == .subtract {
            if seen.remove(id) != nil { next.removeAll { $0 == id } }
        } else if seen.insert(id).inserted {
            next.append(id)
        }
    }
    return next
}

/// The on-screen box a widget draws at rest (`restingFootprintWidget`): the
/// resting tile while it rests, the stored frame otherwise. Owned by whoever
/// knows the registry; the canvas only ever calls it.
public typealias RestingFootprint = (Widget) -> WorldRect

/// The box a marquee has to touch: what the card actually draws, not the
/// dormant stored size. A resting card is an icon tile, so hit-testing the
/// stored box boxed cards from a patch of canvas the user can see is empty.
public func marqueeHitRect(_ widget: Widget, footprint: RestingFootprint) -> WorldRect {
    footprint(widget)
}

/// Every widget on `canvasId` whose drawn footprint strictly overlaps `rect`,
/// in the order the widgets were given.
public func marqueeBoxedIds(
    in rect: WorldRect,
    widgets: [Widget],
    canvasId: String,
    footprint: RestingFootprint
) -> [String] {
    var boxed: [String] = []
    for widget in widgets where widget.canvasId == canvasId {
        if rect.overlaps(marqueeHitRect(widget, footprint: footprint)) {
            boxed.append(widget.id)
        }
    }
    return boxed
}

// MARK: - Pointer intent (`utils/canvasGesturePolicy.ts`)

/// `utils/adaptiveInput.ts`: three modes, not two. Connect is what makes the
/// policy's final `none` reachable — a press on empty canvas in Connect mode
/// starts no gesture at all, because the drag belongs to the wire being
/// drawn. Dropping the case made that line dead and turned a connect-mode
/// press into a camera pan.
public enum InteractionMode: String, Sendable, CaseIterable {
    case navigate
    case select
    case connect
}

public enum CanvasPointerIntent: Sendable {
    case pan
    case select
    case zoomRegion
    case none
}

public enum CanvasGesturePolicy {
    /// Pointer travel before a press becomes a drag, in screen px.
    public static let dragThreshold = 4.0

    public static func pressMoved(from start: Vector2D, to current: Vector2D) -> Bool {
        abs(current.x - start.x) >= dragThreshold || abs(current.y - start.y) >= dragThreshold
    }

    /// One decision table for mouse, trackpad clicks, touch, and Pencil.
    /// Two-finger pinch is resolved before this function because it always
    /// owns navigation.
    public static func resolveIntent(
        button: Int,
        interactionMode: InteractionMode,
        isEmptyCanvas: Bool,
        isSpaceHeld: Bool,
        isZHeld: Bool,
        isShiftHeld: Bool
    ) -> CanvasPointerIntent {
        if button == 1 { return .pan }
        if button != 0 || !isEmptyCanvas { return .none }
        if isSpaceHeld { return .pan }
        if isZHeld { return .zoomRegion }
        if isShiftHeld || interactionMode == .select { return .select }
        if interactionMode == .navigate { return .pan }
        return .none
    }
}
