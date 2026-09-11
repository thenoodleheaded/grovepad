// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "tauri-plugin-native-auth",
    platforms: [
        .iOS(.v14),
    ],
    products: [
        .library(
            name: "tauri-plugin-native-auth",
            type: .static,
            targets: ["tauri-plugin-native-auth"]
        ),
    ],
    dependencies: [
        .package(name: "Tauri", path: "../.tauri/tauri-api"),
    ],
    targets: [
        .target(
            name: "tauri-plugin-native-auth",
            dependencies: [.byName(name: "Tauri")],
            path: "Sources"
        ),
    ]
)
