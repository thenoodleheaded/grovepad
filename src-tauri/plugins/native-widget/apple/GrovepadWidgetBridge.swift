import Foundation
import WidgetKit

private let grovepadSuiteName = "group.com.grovepad.widgets"
private let grovepadPayloadKey = "note_widget_payload_v1"
private let grovepadWidgetKind = "GrovepadNoteWidget"

/// macOS desktop bridge. Returns 1 when storage changed, 0 when the payload
/// was already current, and a negative value when the App Group is unavailable.
@_cdecl("grovepad_sync_note_widget")
public func grovepadSyncNoteWidget(_ payloadPointer: UnsafePointer<CChar>?) -> Int32 {
    guard let payloadPointer else { return -2 }
    guard let defaults = UserDefaults(suiteName: grovepadSuiteName) else { return -3 }
    let payload = String(cString: payloadPointer)
    guard defaults.string(forKey: grovepadPayloadKey) != payload else { return 0 }
    defaults.set(payload, forKey: grovepadPayloadKey)
    defaults.synchronize()
    WidgetCenter.shared.reloadTimelines(ofKind: grovepadWidgetKind)
    return 1
}
