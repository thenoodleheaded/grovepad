// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "tauri-plugin-native-widget",
    platforms: [
        .iOS(.v14),
        .macOS(.v11),
    ],
    products: [
        .library(
            name: "tauri-plugin-native-widget",
            type: .static,
            targets: ["tauri-plugin-native-widget"]
        ),
    ],
    dependencies: [
        .package(name: "Tauri", path: "../.tauri/tauri-api"),
    ],
    targets: [
        .target(
            name: "tauri-plugin-native-widget",
            dependencies: [.byName(name: "Tauri")],
            path: "Sources"
        ),
    ]
)
