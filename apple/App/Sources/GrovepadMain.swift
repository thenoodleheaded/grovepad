import SwiftUI
import GrovepadApp

// The whole app lives in the `GrovepadApp` library (tested by
// `GrovepadAppTests`); this target only supplies the bundle, the signing
// identity, the asset catalog and the Info.plist entries `project.yml` fills.
@main
struct GrovepadMain: App {
    var body: some Scene {
        GrovepadAppScene()
    }
}
