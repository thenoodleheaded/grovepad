import Foundation
import Tauri
import WidgetKit

private let suiteName = "group.com.grovepad.widgets"
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
            WidgetCenter.shared.reloadTimelines(ofKind: widgetKind)
        }
        invoke.resolve(["supported": true, "changed": changed])
    }
}

@_cdecl("init_plugin_native_widget")
func initPlugin() -> Plugin {
    NativeWidgetPlugin()
}
