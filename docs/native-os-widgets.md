# Native Note widgets

Grovepad can show one Note card in the operating system’s widget gallery on
iPhone, iPad, Android, and macOS. The Note remains editable in Grovepad. The
native widget is a small, read-only copy that refreshes after the user pauses
typing.

## How a person uses it

1. In the installed Grovepad app, open a Note card’s context menu.
2. Choose **Use in home-screen widget**.
3. Open the device’s widget gallery and add **Grovepad Note**.
4. To replace it, choose the same action on another Note. To clear it, choose
   **Remove from home-screen widget** on the selected Note.

The selected card ID is stored only on that device. It is intentionally not
part of the board, cloud sync, undo history, exports, or duplicates.

## Data and performance contract

The frontend derives a versioned JSON snapshot containing only `id`, `title`,
`text`, `color`, `mode`, and `attribution`. Text is capped at 4,096 characters,
the whole payload is validated again in Rust, and native storage is not touched
when the serialized snapshot is unchanged.

Typing is debounced for 240 ms. If an edit arrives while a native update is in
flight, only the newest snapshot is sent next. Failures use three bounded
retries and never interrupt local board editing.

Apple uses App Group UserDefaults at `group.com.grovepad.widgets` and asks only
the `GrovepadNoteWidget` timeline to reload. Its timeline policy is `.never`, so
there is no periodic wakeup. Android uses app-private SharedPreferences (the
app and AppWidget share a UID), sends an explicit update broadcast only when
placed widgets exist, and declares `updatePeriodMillis=0`.

## Source ownership

- React/runtime contract: `src/utils/nativeNoteWidget.ts`,
  `src/runtime/nativeNoteWidgetSync.ts`, and
  `src/store/useNativeWidgetStore.ts`.
- Tauri validation and command: `src-tauri/src/lib.rs`.
- Native Tauri bridge: `src-tauri/plugins/native-widget/`.
- Shared Apple WidgetKit view: `src-tauri/native/apple/GrovepadNoteWidget.swift`.
- Generated iOS/iPadOS host: `src-tauri/gen/apple/`.
- Generated Android host: `src-tauri/gen/android/`; the plugin’s manifest,
  resources, and Kotlin are merged into it during Tauri builds.

## Signing and release setup

The App Group identifier must exist in the Apple Developer account and be
enabled for both `com.grovepad.desktop` and
`com.grovepad.desktop.GrovepadNoteWidget`. Select the same development team for
the app and widget targets in Xcode. Unsigned simulator builds verify code and
layout, but shared App Group storage requires a correctly signed device build.

For iOS/iPadOS, open `src-tauri/gen/apple/app.xcodeproj` through the normal
Tauri iOS workflow; the app target embeds `GrovepadNoteWidget`.

For macOS, the normal Tauri bundle step runs `scripts/embed-macos-widget.sh`
first. The script compiles and signs the extension, then Tauri's macOS file map
embeds it under `Contents/PlugIns` before the app and DMG are signed. The
`npm run tauri:build:macos-widget` alias is available for clarity. Set
`APPLE_SIGNING_IDENTITY` to the intended Developer ID or Apple Development
identity for distribution; without it, the extension uses ad-hoc signing for
local structural testing only.

Android needs no additional storage permission or background worker. A normal
`npx tauri android build` includes the local plugin and its Glance receiver.

## Verification commands

```sh
npx vitest run src/utils/nativeNoteWidget.test.ts src/runtime/nativeNoteWidgetSync.test.ts
cargo test --manifest-path src-tauri/Cargo.toml

cd src-tauri/gen/android
./gradlew :tauri-plugin-native-widget:assembleDebug

# Full arm64 debug APK
cd ../../..
npx tauri android build --debug --target aarch64 --apk --ci
```

Apple extension compilation is checked with the `GrovepadNoteWidget` target in
the generated iOS project and with the macOS project generated from
`src-tauri/native/apple/project.yml`. A macOS `tauri build --bundles app`
should contain `Contents/PlugIns/GrovepadNoteWidget.appex`.
