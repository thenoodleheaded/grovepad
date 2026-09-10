import Foundation
import Tauri
import WidgetKit

private let suiteName = "group.app.grovepad.widgets"
private let payloadKey = "note_widget_payload_v1"
private let widgetKind = "GrovepadNoteWidget"

private final class SyncNoteWidgetArgs: Decodable {
    let payload: String
}

final class NativeWidgetPlugin: Plugin {
    @objc public func syncNoteWidget(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(SyncNoteWidgetArgs.self)
        guard let defaults = UserDefaults(suiteName: suiteName) else {
            invoke.reject("The Grovepad widget App Group is unavailable")
            return
        }

        let changed = defaults.string(forKey: payloadKey) != args.payload
        if changed {
            defaults.set(args.payload, forKey: payloadKey)
            defaults.synchronize()
            // Tauri links this package through swift-rs, which builds it with no
            // iOS deployment target, so WidgetKit's iOS 14 API is not statically
            // available even though the app itself targets 14.0. Guard the call
            // rather than the whole plugin: the payload must still be written on
            // any OS, only the timeline reload is version-gated.
            if #available(iOS 14.0, *) {
                WidgetCenter.shared.reloadTimelines(ofKind: widgetKind)
            }
        }
        invoke.resolve(["supported": true, "changed": changed])
    }
}

@_cdecl("init_plugin_native_widget")
func initPlugin() -> Plugin {
    NativeWidgetPlugin()
}
