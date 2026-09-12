// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "tauri-plugin-native-menu",
    platforms: [
        .iOS(.v14),
        .macOS(.v11),
    ],
    products: [
        .library(
            name: "tauri-plugin-native-menu",
            type: .static,
            targets: ["tauri-plugin-native-menu"]
        ),
    ],
    dependencies: [
        .package(name: "Tauri", path: "../.tauri/tauri-api"),
    ],
    targets: [
        .target(
            name: "tauri-plugin-native-menu",
            dependencies: [.byName(name: "Tauri")],
            path: "Sources"
        ),
    ]
)
