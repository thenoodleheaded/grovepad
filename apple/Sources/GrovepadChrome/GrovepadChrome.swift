// GrovepadChrome — every panel, sheet, dialog, screen and widget body.
// Phase 3 (docs/native-port-roadmap.md): registry, renderer protocol, glass
// material, document model and the first eight widgets. Phase 5 adds chrome.
import GrovepadCore
import GrovepadCanvas

/// SwiftUI exports a `Widget` protocol (WidgetKit); inside this module the
/// name always means the board record.
public typealias Widget = GrovepadCore.Widget
