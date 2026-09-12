// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "tauri-plugin-native-haptics",
    platforms: [
        .iOS(.v14),
        .macOS(.v11),
    ],
    products: [
        .library(
            name: "tauri-plugin-native-haptics",
            type: .static,
            targets: ["tauri-plugin-native-haptics"]
        ),
    ],
    dependencies: [
        .package(name: "Tauri", path: "../.tauri/tauri-api"),
    ],
    targets: [
        .target(
            name: "tauri-plugin-native-haptics",
            dependencies: [.byName(name: "Tauri")],
            path: "Sources"
        ),
    ]
)
