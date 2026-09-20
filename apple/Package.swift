// swift-tools-version: 6.0
// The native Grovepad port (docs/native-port-roadmap.md). Three libraries,
// one manifest: consumers depend on the product they need and nothing below
// GrovepadCore imports anything but Foundation.
import PackageDescription

let package = Package(
    name: "Grovepad",
    platforms: [
        .macOS("26.0"),
        .iOS("26.0"),
    ],
    products: [
        .library(name: "GrovepadCore", targets: ["GrovepadCore"]),
        .library(name: "GrovepadCanvas", targets: ["GrovepadCanvas"]),
        .library(name: "GrovepadChrome", targets: ["GrovepadChrome"]),
        .library(name: "GrovepadCloud", targets: ["GrovepadCloud"]),
        .library(name: "GrovepadCollaboration", targets: ["GrovepadCollaboration"]),
        .library(name: "GrovepadApp", targets: ["GrovepadApp"]),
        .library(name: "GrovepadHomeWidget", targets: ["GrovepadHomeWidget"]),
    ],
    dependencies: [
        // Accounts and sync (roadmap phase 6). Only GrovepadCloud may import it.
        .package(url: "https://github.com/supabase/supabase-swift.git", from: "2.0.0"),
    ],
    targets: [
        // Model types, canonical serializer, migrations, .grovepad package,
        // circuit engine, transforms, field and command tables. Foundation only.
        .target(
            name: "GrovepadCore",
            swiftSettings: [.swiftLanguageMode(.v5)]
        ),
        // The home-screen widget's contract with the app (docs/native-os-widgets.md):
        // the App Group files, their Codable shapes and the SwiftUI drawing of a
        // card. No dependencies, so the WidgetKit extension that links it stays small.
        .target(
            name: "GrovepadHomeWidget",
            swiftSettings: [.swiftLanguageMode(.v5)]
        ),
        // Camera, gestures, tiered renderer, edge paint, selection. Core Animation.
        .target(
            name: "GrovepadCanvas",
            dependencies: ["GrovepadCore"],
            swiftSettings: [.swiftLanguageMode(.v5)]
        ),
        // Every panel, sheet, dialog, screen and widget body, in SwiftUI.
        .target(
            name: "GrovepadChrome",
            dependencies: ["GrovepadCore", "GrovepadCanvas", "GrovepadCollaboration"],
            // Clash Display, the web's one typeface (src/index.css).
            resources: [.copy("Resources/Fonts"), .copy("Resources/Brand")],
            swiftSettings: [.swiftLanguageMode(.v5)]
        ),
        // A throwaway macOS preview shell so the finished engine pieces can be
        // tried by hand before the phase-5 chrome exists. Sources are guarded
        // with `#if os(macOS)` so iOS resolution still works.
        .executableTarget(
            name: "GrovepadPreview",
            dependencies: ["GrovepadCore", "GrovepadCanvas", "GrovepadChrome", "GrovepadApp"],
            exclude: ["README.md"],
            swiftSettings: [.swiftLanguageMode(.v5)]
        ),
        // The Yjs engine (yrs, Rust) as a static XCFramework, built by
        // `Yrs/build-xcframework.sh`. Only GrovepadCollaboration links it.
        .binaryTarget(
            name: "GrovepadYrsFFI",
            path: "Yrs/GrovepadYrsFFI.xcframework"
        ),
        // Realtime collaboration (docs/realtime-collaboration.md): the canvas
        // CRDT schema, awareness, offline queue and the session state machine
        // over transport protocols. No Supabase here; GrovepadCloud implements
        // the transports.
        .target(
            name: "GrovepadCollaboration",
            dependencies: ["GrovepadCore", "GrovepadYrsFFI"],
            swiftSettings: [.swiftLanguageMode(.v5)]
        ),
        // Supabase transports (Postgres tables, Storage bucket) and the auth
        // session over the pure protocols in GrovepadCore/Sync.
        .target(
            name: "GrovepadCloud",
            dependencies: [
                "GrovepadCore",
                "GrovepadCollaboration",
                .product(name: "Supabase", package: "supabase-swift"),
            ],
            swiftSettings: [.swiftLanguageMode(.v5)]
        ),
        // The app layer the Xcode target under `App/` assembles: coordinator
        // (document, store, autosave, device state, circuit driver, sync,
        // media, subscription), the AppKit / UIKit canvas hosts, login and
        // account surfaces, share sheet, haptics, system menus, the scene.
        .target(
            name: "GrovepadApp",
            dependencies: ["GrovepadCore", "GrovepadCanvas", "GrovepadChrome", "GrovepadCloud", "GrovepadCollaboration", "GrovepadHomeWidget"],
            swiftSettings: [.swiftLanguageMode(.v5)]
        ),
        .testTarget(
            name: "GrovepadCoreTests",
            dependencies: ["GrovepadCore"],
            swiftSettings: [.swiftLanguageMode(.v5)]
        ),
        .testTarget(
            name: "GrovepadCanvasTests",
            dependencies: ["GrovepadCanvas"],
            swiftSettings: [.swiftLanguageMode(.v5)]
        ),
        .testTarget(
            name: "GrovepadChromeTests",
            dependencies: ["GrovepadChrome"],
            swiftSettings: [.swiftLanguageMode(.v5)]
        ),
        .testTarget(
            name: "GrovepadCloudTests",
            dependencies: ["GrovepadCloud"],
            swiftSettings: [.swiftLanguageMode(.v5)]
        ),
        .testTarget(
            name: "GrovepadCollaborationTests",
            dependencies: ["GrovepadCollaboration"],
            swiftSettings: [.swiftLanguageMode(.v5)]
        ),
        .testTarget(
            name: "GrovepadAppTests",
            dependencies: ["GrovepadApp", "GrovepadHomeWidget"],
            swiftSettings: [.swiftLanguageMode(.v5)]
        ),
    ]
)
