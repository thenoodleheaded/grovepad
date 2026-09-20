import Foundation
import GrovepadCore

// ---------------------------------------------------------------------------
// Small pure rules from the web runtime:
// - `safePresence` / `publishParticipants` (collaborationRuntime.ts)
// - `resolveFollowTarget` (followTarget.ts)
// - `canToggleCanvasSharing`, `revokeCanvasSharing` (canvasSharing.ts)
// - the local awareness state (`LocalPresenceState`)
// ---------------------------------------------------------------------------

public enum PresenceRules {
    static let fallbackColor = "#60a5fa"

    /// `safePresence`: untrusted awareness in, a bounded participant out.
    public static func parse(clientId: UInt64, state: JSONObject, now: Double) -> CollaborationPresence? {
        guard let userId = state.string("userId"), let name = state.string("name"), let color = state.string("color"),
              let roleName = state.string("role"), let role = CollaborationRole(rawValue: roleName) else { return nil }
        let cursor: Vector2D? = {
            guard let cursor = state.object("cursor"), let x = finite(cursor["x"]), let y = finite(cursor["y"]) else { return nil }
            return Vector2D(x: x, y: y)
        }()
        let camera: CollaborationCamera? = {
            guard let camera = state.object("camera"), let pan = camera.object("pan"),
                  let x = finite(pan["x"]), let y = finite(pan["y"]), let zoom = finite(camera["zoom"]) else { return nil }
            return CollaborationCamera(pan: Vector2D(x: x, y: y), zoom: zoom)
        }()
        let selected = (state.array("selectedWidgetIds") ?? []).compactMap(\.stringValue).prefix(500)
        return CollaborationPresence(
            clientId: clientId,
            userId: userId,
            name: String(decoding: Array(name.utf16.prefix(80)), as: UTF16.self),
            color: isHexColor(color) ? color : fallbackColor,
            role: role,
            cursor: cursor,
            selectedWidgetIds: Array(selected),
            editingWidgetId: state.string("editingWidgetId"),
            camera: camera,
            lastSeenAt: finite(state["lastSeenAt"]) ?? now
        )
    }

    static func finite(_ value: JSONValue?) -> Double? {
        guard let number = value?.numberValue, number.isFinite else { return nil }
        return number
    }

    /// `/^#[\da-f]{6}$/i`.
    static func isHexColor(_ value: String) -> Bool {
        let scalars = Array(value.unicodeScalars)
        guard scalars.count == 7, scalars[0] == "#" else { return false }
        return scalars.dropFirst().allSatisfy { $0.properties.isASCIIHexDigit }
    }

    /// Every parseable participant, sorted by name then client id
    /// (`localeCompare`, then numeric).
    public static func participants(_ states: [UInt64: JSONObject], now: Double) -> [CollaborationPresence] {
        states.compactMap { parse(clientId: $0.key, state: $0.value, now: now) }.sorted { left, right in
            let order = left.name.localizedCompare(right.name)
            if order != .orderedSame { return order == .orderedAscending }
            return left.clientId < right.clientId
        }
    }

    /// `LocalPresenceState`, in the web's key order.
    public static func localState(
        userId: String, name: String, color: String, role: CollaborationRole,
        cursor: Vector2D?, selectedWidgetIds: [String], editingWidgetId: String?,
        camera: CollaborationCamera?, lastSeenAt: Double
    ) -> JSONObject {
        var state = JSONObject()
        state["userId"] = .string(userId)
        state["name"] = .string(name)
        state["color"] = .string(color)
        state["role"] = .string(role.rawValue)
        state["cursor"] = cursor.map(pointJSON) ?? .null
        state["selectedWidgetIds"] = .array(selectedWidgetIds.map(JSONValue.string))
        state["editingWidgetId"] = editingWidgetId.map(JSONValue.string) ?? .null
        state["camera"] = camera.map(cameraJSON) ?? .null
        state["lastSeenAt"] = .number(lastSeenAt)
        return state
    }

    public static func pointJSON(_ point: Vector2D) -> JSONValue {
        var object = JSONObject()
        object["x"] = .number(point.x)
        object["y"] = .number(point.y)
        return .object(object)
    }

    public static func cameraJSON(_ camera: CollaborationCamera) -> JSONValue {
        var object = JSONObject()
        object["pan"] = pointJSON(camera.pan)
        object["zoom"] = .number(camera.zoom)
        return .object(object)
    }
}

/// `resolveFollowTarget`: following hands the camera to someone else, so a
/// target who left must end following rather than lock the camera forever.
public struct FollowResolution: Equatable {
    public var followingClientId: UInt64?
    public var camera: CollaborationCamera?
}

public func resolveFollowTarget(_ participants: [CollaborationPresence], following: UInt64?) -> FollowResolution {
    guard let following, let followed = participants.first(where: { $0.clientId == following }) else {
        return FollowResolution(followingClientId: nil, camera: nil)
    }
    return FollowResolution(followingClientId: following, camera: followed.camera)
}

public enum CanvasSharingRules {
    /// `canToggleCanvasSharing`: a shared canvas with no resolved role keeps
    /// its switch so a failed startup can be recovered; the server still
    /// checks ownership before access is revoked.
    public static func canToggle(shared: Bool, hasSession: Bool, configured: Bool, role: CollaborationRole?, busy: Bool) -> Bool {
        guard hasSession, configured, !busy else { return false }
        return !shared || role == nil || role == .owner
    }
}
