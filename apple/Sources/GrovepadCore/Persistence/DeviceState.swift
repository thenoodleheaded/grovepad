import Foundation

// ---------------------------------------------------------------------------
// Port of `src/utils/persistedDeviceState.ts` and `resolveCanvasTabs` from
// `src/store/canvasTabs.ts`. Device state is local navigation only — active
// workspace and canvas, parked cameras, the tab row — and never enters a
// board document (storage contract: "device state is not document state").
// ---------------------------------------------------------------------------

public enum DeviceStateCodec {
    /// `resolvePersistedDeviceState(raw, board, legacyFallback)`.
    ///
    /// - raw: the stored `grovepad-device` payload, or nil/anything else.
    /// - legacyFallback: the navigation fields an older board payload still
    ///   embedded (see `legacyFallback(from:)`), used when `raw` is not a
    ///   current device payload.
    /// - mint: ids for tabs the resolver has to seed (`crypto.randomUUID`).
    public static func resolvePersistedDeviceState(
        _ raw: JSONValue?,
        workspaces: OrderedMap<Workspace>,
        canvases: OrderedMap<CanvasMeta>,
        legacyFallback: JSONObject? = nil,
        mint: IdMinter = .system
    ) -> DeviceState {
        let source: JSONObject = isCurrentDevicePayload(raw) ? raw!.objectValue! : (legacyFallback ?? JSONObject())

        // `requested && workspaces[requested]`: an empty id is falsy and falls through.
        let activeWorkspaceId: String = {
            if let requested = JS.key(source["activeWorkspaceId"]), !requested.isEmpty, workspaces.contains(requested) { return requested }
            return workspaces.keys.first ?? ""
        }()
        let activeCanvasId: String = {
            if let requested = JS.key(source["activeCanvasId"]), !requested.isEmpty, let canvas = canvases[requested],
               JS.key(canvas.record["workspaceId"]) == activeWorkspaceId { return requested }
            if let root = workspaces[activeWorkspaceId].flatMap({ JS.key($0.record["rootCanvasId"]) }) { return root }
            return canvases.keys.first ?? ""
        }()

        var canvasViews = OrderedMap<CanvasView>()
        for (canvasId, view) in (source.object("canvasViews") ?? JSONObject()).entries {
            guard canvases.contains(canvasId), let record = view.objectValue else { continue }
            guard let pan = Vector2D(json: record["pan"]), let zoom = record.number("zoom") else { continue }
            canvasViews[canvasId] = CanvasView(pan: pan, zoom: CanvasGeometry.clampZoom(zoom))
        }

        // A payload written before tabs existed, or with a malformed tab list,
        // reads as no tabs; the resolver then seeds one on the active canvas.
        var openTabs: [CanvasTab] = []
        for tab in source.array("openTabs") ?? [] {
            guard let record = tab.objectValue, let id = JS.key(record["id"]), let canvasId = JS.key(record["canvasId"]) else { continue }
            openTabs.append(CanvasTab(id: id, canvasId: canvasId))
        }
        let activeTabId = JS.key(source["activeTabId"]) ?? ""
        let tabs = resolveCanvasTabs(openTabs: openTabs, activeTabId: activeTabId, activeCanvasId: activeCanvasId, canvases: canvases, mint: mint)

        return DeviceState(
            activeWorkspaceId: activeWorkspaceId,
            activeCanvasId: tabs.activeCanvasId.isEmpty ? activeCanvasId : tabs.activeCanvasId,
            canvasViews: canvasViews,
            openTabs: tabs.openTabs,
            activeTabId: tabs.activeTabId
        )
    }

    /// Convenience over the parsed board's own topology.
    public static func resolvePersistedDeviceState(_ raw: JSONValue?, board: Board, legacyFallback: JSONObject? = nil, mint: IdMinter = .system) -> DeviceState {
        resolvePersistedDeviceState(raw, workspaces: board.workspaces, canvases: board.canvases, legacyFallback: legacyFallback, mint: mint)
    }

    /// The navigation fields a hydrated board resolved from a legacy payload,
    /// in the shape `resolvePersistedDeviceState` accepts as its fallback.
    public static func legacyFallback(from board: Board) -> JSONObject {
        var fallback = JSONObject()
        fallback["activeWorkspaceId"] = .string(board.activeWorkspaceId)
        fallback["activeCanvasId"] = .string(board.activeCanvasId)
        fallback["canvasViews"] = canvasViewsJSON(board.canvasViews)
        return fallback
    }

    private static func isCurrentDevicePayload(_ value: JSONValue?) -> Bool {
        guard let object = value?.objectValue else { return false }
        return object["format"] == .string(BoardFormat.deviceFormat) && object["v"] == .number(Double(BoardFormat.deviceVersion))
    }

    /// `serializePersistedDeviceState(state)` in the web's key order.
    public static func serializePersistedDeviceState(_ state: DeviceState) -> JSONObject {
        var payload = JSONObject()
        payload["format"] = .string(BoardFormat.deviceFormat)
        payload["v"] = .number(Double(BoardFormat.deviceVersion))
        payload["activeWorkspaceId"] = .string(state.activeWorkspaceId)
        payload["activeCanvasId"] = .string(state.activeCanvasId)
        payload["canvasViews"] = canvasViewsJSON(state.canvasViews)
        payload["openTabs"] = .array(state.openTabs.map { tab in
            var record = JSONObject()
            record["id"] = .string(tab.id)
            record["canvasId"] = .string(tab.canvasId)
            return .object(record)
        })
        payload["activeTabId"] = .string(state.activeTabId)
        return payload
    }

    public static func serializedText(_ state: DeviceState) -> String {
        JSONWriter.stringify(.object(serializePersistedDeviceState(state)))
    }

    static func canvasViewsJSON(_ views: OrderedMap<CanvasView>) -> JSONValue {
        var object = JSONObject()
        for (canvasId, view) in views.entries {
            var record = JSONObject()
            record["pan"] = view.pan.json()
            record["zoom"] = .number(view.zoom)
            object[canvasId] = .object(record)
        }
        return .object(object)
    }

    // MARK: - Canvas tabs

    /// The invariant every tab mutation keeps: the active tab points at `activeCanvasId`.
    public struct CanvasTabPosition: Equatable {
        public var openTabs: [CanvasTab]
        public var activeTabId: String
        public var activeCanvasId: String

        public init(openTabs: [CanvasTab], activeTabId: String, activeCanvasId: String) {
            self.openTabs = openTabs
            self.activeTabId = activeTabId
            self.activeCanvasId = activeCanvasId
        }
    }

    /// `resolveCanvasTabs`: repair the tab row against the canvases that still
    /// exist. A tab whose canvas is gone is dropped; if it was the active one,
    /// its slot is refilled in place by the canvas the board fell back to.
    public static func resolveCanvasTabs(
        openTabs input: [CanvasTab],
        activeTabId: String,
        activeCanvasId requestedCanvasId: String,
        canvases: OrderedMap<CanvasMeta>,
        mint: IdMinter = .system
    ) -> CanvasTabPosition {
        var seenTabIds = Set<String>()
        var surviving: [CanvasTab] = []
        var activeIndex = -1
        var refillIndex = -1
        for tab in input {
            let kept = !seenTabIds.contains(tab.id) && canvases.contains(tab.canvasId)
            if tab.id == activeTabId, activeIndex < 0, refillIndex < 0 {
                if kept { activeIndex = surviving.count } else { refillIndex = surviving.count }
            }
            if !kept { continue }
            seenTabIds.insert(tab.id)
            surviving.append(tab)
        }

        var activeCanvasId = requestedCanvasId
        if !canvases.contains(activeCanvasId) {
            let index = max(activeIndex, 0)
            activeCanvasId = index < surviving.count ? surviving[index].canvasId : (canvases.keys.first ?? "")
        }
        if activeCanvasId.isEmpty { return CanvasTabPosition(openTabs: [], activeTabId: "", activeCanvasId: "") }

        if activeIndex >= 0 {
            var active = surviving[activeIndex]
            if active.canvasId != activeCanvasId {
                active.canvasId = activeCanvasId
                surviving[activeIndex] = active
            }
            return CanvasTabPosition(openTabs: surviving, activeTabId: active.id, activeCanvasId: activeCanvasId)
        }

        if let alreadyOpen = surviving.first(where: { $0.canvasId == activeCanvasId }) {
            return CanvasTabPosition(openTabs: surviving, activeTabId: alreadyOpen.id, activeCanvasId: activeCanvasId)
        }

        let replacement = CanvasTab(id: mint(), canvasId: activeCanvasId)
        let at = refillIndex >= 0 ? min(refillIndex, surviving.count) : surviving.count
        surviving.insert(replacement, at: at)
        return CanvasTabPosition(openTabs: surviving, activeTabId: replacement.id, activeCanvasId: activeCanvasId)
    }
}
