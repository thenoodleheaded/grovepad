import Foundation
import GrovepadCore

// ---------------------------------------------------------------------------
// Widget residency: which cards are live views and which are resting tiles,
// plus the rest-context decisions of `utils/widgetRest.ts`.
//
// Deviation from the web (owner's decision, 18 Sep 2026): no virtualization
// and no level of detail. The web's `widgetVirtualization.ts` retained
// window, its centre-first hydrate/release batches and its below-20 % image
// tier are NOT ported — they made cards pop in and out while panning and
// turn into placeholder boxes when zoomed far out. Every card on the active
// canvas is mounted as its resting tile at every zoom; only open, edited or
// wired cards are live views.
// ---------------------------------------------------------------------------

public struct CameraViewport: Equatable, Sendable {
    public var pan: Vector2D
    public var zoom: Double
    public var viewportSize: Size

    public init(pan: Vector2D, zoom: Double, viewportSize: Size) {
        self.pan = pan
        self.zoom = zoom
        self.viewportSize = viewportSize
    }

    public init(frame: CameraFrame, viewportSize: Size) {
        self.init(pan: frame.pan, zoom: frame.zoom, viewportSize: viewportSize)
    }
}

/// The world rect the screen viewport covers, grown by `screenPadding`
/// screen pixels on every side.
public func worldRectForViewport(_ camera: CameraViewport, screenPadding: Double = 0) -> WorldRect {
    let zoom = camera.zoom > 0 ? camera.zoom : 1
    return WorldRect(
        x: (-camera.pan.x - screenPadding) / zoom,
        y: (-camera.pan.y - screenPadding) / zoom,
        width: (camera.viewportSize.width + screenPadding * 2) / zoom,
        height: (camera.viewportSize.height + screenPadding * 2) / zoom
    )
}

// MARK: - Rest context (`utils/widgetRest.ts`, decisions only)

/// The resting-face decisions the canvas needs, with the registry-owned
/// parts injected. `restingSize` answers "what tile does this widget rest
/// as" (nil when its type has no resting face); `isRestEligible` is the full
/// rule — a user-authored icon and a pinned card never rest.
public struct RestContext {
    public var expandedWidgetId: String?
    /// The offset captured when the expanded card opened. Absent means "not
    /// expanded, or nothing to offset".
    public var expandedOffset: Vector2D?
    public var restingSize: (Widget) -> Size?
    public var isRestEligible: (Widget) -> Bool
    /// The card an icon without a parked `expandedSize` peeks open to (the
    /// registry's default size, supplied by the chrome).
    public var iconOpenSize: (Widget) -> Size? = { _ in nil }

    public init(
        expandedWidgetId: String? = nil,
        expandedOffset: Vector2D? = nil,
        restingSize: @escaping (Widget) -> Size?,
        isRestEligible: @escaping (Widget) -> Bool
    ) {
        self.expandedWidgetId = expandedWidgetId
        self.expandedOffset = expandedOffset
        self.restingSize = restingSize
        self.isRestEligible = isRestEligible
    }

    /// The stock eligibility rule from `restEligible`: a type with a resting
    /// face, not iconified, not pinned.
    public init(expandedWidgetId: String? = nil, expandedOffset: Vector2D? = nil, restingSize: @escaping (Widget) -> Size?) {
        self.init(expandedWidgetId: expandedWidgetId, expandedOffset: expandedOffset, restingSize: restingSize) { widget in
            RestContext.stockEligibility(widget, hasRestingFace: restingSize(widget) != nil)
        }
    }

    public static func stockEligibility(_ widget: Widget, hasRestingFace: Bool) -> Bool {
        // A widget of an unknown type (a retired module in a loaded board)
        // has no registry entry: never resting.
        if !hasRestingFace { return false }
        // A user-authored icon state outranks the resting system entirely.
        if widget.iconified == true { return false }
        // Pinned means held open: the card keeps its stored footprint exactly.
        if widget.metadata.pinned { return false }
        return true
    }

    /// Nothing rests: every widget draws its stored box (a canvas with no
    /// registry, tests).
    public static let none = RestContext(restingSize: { _ in nil }, isRestEligible: { _ in false })

    /// Whether clicking this icon opens it as an ephemeral peek rather than
    /// as a durable scale change.
    public func iconPeeksOpen(_ widget: Widget) -> Bool {
        if widget.iconified != true { return false }
        if restingSize(widget) == nil { return false }
        return !widget.metadata.pinned
    }

    /// Whether this widget currently shows its resting face.
    public func isResting(_ widget: Widget) -> Bool {
        isRestEligible(widget) && expandedWidgetId != widget.id
    }

    /// Whether this widget is the one currently expanded out of its resting
    /// face — or peeked open out of its icon, which is the same slot.
    public func isRestExpanded(_ widget: Widget) -> Bool {
        if expandedWidgetId != widget.id { return false }
        return isRestEligible(widget) || iconPeeksOpen(widget)
    }

    /// The card an icon opens into. The registry default is not reachable
    /// from here, so a peeked icon without a parked `expandedSize` opens at
    /// its stored box (deviation from `expandedIconSize`, recorded).
    public func expandedIconSize(_ widget: Widget) -> Size {
        if widget.iconified != true { return widget.size }
        return widget.expandedSize ?? iconOpenSize(widget) ?? widget.size
    }

    /// Content-derived footprint of the resting tile, falling back to the
    /// stored box for a type that reports none.
    public func restingTileSize(_ widget: Widget) -> Size {
        restingSize(widget) ?? widget.size
    }

    /// The size the widget actually occupies on screen right now.
    public func effectiveSize(_ widget: Widget) -> Size {
        if isResting(widget) { return restingTileSize(widget) }
        if isRestExpanded(widget) { return expandedIconSize(widget) }
        return widget.size
    }

    /// The offset an expanded card is currently drawn at — frozen for the
    /// life of the expansion, never recomputed from the live size.
    public func expansionOffset(_ widget: Widget) -> Vector2D {
        if !isRestExpanded(widget) { return .zero }
        return expandedOffset ?? .zero
    }

    /// The widget at its idle footprint (`restingFootprintWidget`): the tile
    /// when it rests, the stored box otherwise. Deliberately ignores the
    /// ephemeral expansion — the plate and its bounds stay put around tiles.
    public func restingFootprint(_ widget: Widget) -> WorldRect {
        var idle = self
        idle.expandedWidgetId = nil
        idle.expandedOffset = nil
        let size = idle.isResting(widget) ? idle.restingTileSize(widget) : widget.size
        return WorldRect(x: widget.position.x, y: widget.position.y, width: size.width, height: size.height)
    }
}

/// The box the user can currently see, including an ephemeral rest expansion.
public func displayedWidgetRect(_ widget: Widget, restContext: RestContext) -> WorldRect {
    // Not `widget.size`: a peeked-open icon is stored at its little square and
    // drawn as the whole card.
    let size = restContext.effectiveSize(widget)
    let offset = restContext.isRestExpanded(widget) ? restContext.expansionOffset(widget) : .zero
    return WorldRect(
        x: widget.position.x + offset.x,
        y: widget.position.y + offset.y,
        width: size.width,
        height: size.height
    )
}

// MARK: - Residency controller

/// The two residency tiers. There is no zoom- or camera-based level of
/// detail (owner's decision, 18 Sep 2026): every card on the active canvas
/// is mounted as its tile at every zoom and through every pan, and only an
/// urgent card (open, editing, wired) is a live view.
public enum ResidencyTier: Sendable, CaseIterable {
    /// A real hosted view: an open card, or one being edited or wired.
    case live
    /// One layer showing the card's cached resting bitmap.
    case resting
}

public struct ResidencyPlan: Equatable, Sendable {
    /// Every card on the active canvas, in board order (paint order).
    public var orderedIds: [String]
    public var tiers: [String: ResidencyTier]
}

/// What changed between two plans, per tier.
public struct ResidencyDiff: Equatable, Sendable {
    public var entered: [ResidencyTier: [String]] = [:]
    public var left: [ResidencyTier: [String]] = [:]

    public var isEmpty: Bool {
        entered.values.allSatisfy(\.isEmpty) && left.values.allSatisfy(\.isEmpty)
    }

    public func entered(_ tier: ResidencyTier) -> [String] { entered[tier] ?? [] }
    public func left(_ tier: ResidencyTier) -> [String] { left[tier] ?? [] }
}

/// Keeps the per-card tier. The camera plays no part: a pan or zoom never
/// replans, mounts or unmounts anything. Board and urgency changes replan.
public final class ResidencyController {
    public var restContext: RestContext
    /// Open, editing, wired — every id that must be a live view.
    public var urgentIds: Set<String> = []

    public private(set) var widgets: [String: Widget] = [:]
    public private(set) var widgetOrder: [String] = []
    public private(set) var plan: ResidencyPlan?

    public init(restContext: RestContext) {
        self.restContext = restContext
    }

    public var tiers: [String: ResidencyTier] { plan?.tiers ?? [:] }

    public func tier(of id: String) -> ResidencyTier? { plan?.tiers[id] }

    /// Replace the cards the controller plans over (the active canvas).
    public func setWidgets(_ list: [Widget]) {
        var map: [String: Widget] = [:]
        map.reserveCapacity(list.count)
        var order: [String] = []
        order.reserveCapacity(list.count)
        for widget in list {
            map[widget.id] = widget
            order.append(widget.id)
        }
        widgets = map
        widgetOrder = order
    }

    /// Rebuild the tiers now, and report what moved.
    @discardableResult
    public func replan() -> ResidencyDiff {
        var tiers: [String: ResidencyTier] = [:]
        tiers.reserveCapacity(widgetOrder.count)
        for id in widgetOrder {
            tiers[id] = urgentIds.contains(id) ? .live : .resting
        }
        let next = ResidencyPlan(orderedIds: widgetOrder, tiers: tiers)
        let diff = ResidencyController.diff(from: plan, to: next)
        plan = next
        return diff
    }

    static func diff(from previous: ResidencyPlan?, to next: ResidencyPlan) -> ResidencyDiff {
        var result = ResidencyDiff()
        let before = previous?.tiers ?? [:]
        for id in next.orderedIds {
            let tier = next.tiers[id]!
            if before[id] != tier { result.entered[tier, default: []].append(id) }
        }
        if let previous {
            for id in previous.orderedIds {
                let tier = previous.tiers[id]!
                if next.tiers[id] != tier { result.left[tier, default: []].append(id) }
            }
        }
        return result
    }
}
