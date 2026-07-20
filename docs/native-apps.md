# Building Grovepad as native apps

Grovepad ships as one web codebase wrapped by [Tauri 2](https://tauri.app): the
same `dist/` frontend runs inside a native shell on macOS, Windows, Linux,
iOS/iPadOS, and Android. The shell owns OS integration — `.grovepad` file
association and open-with, the single-instance guard, and the native Note
home-screen widget ([runbook](native-os-widgets.md)).

## One-time machine prerequisites

| Platform | Requirements |
|---|---|
| All | Node 20+, Rust stable (`rustup`), `npm install` run once |
| macOS desktop | Xcode + command-line tools; `xcodegen` (`brew install xcodegen`) for the widget extension |
| Windows desktop | Visual Studio Build Tools (MSVC), WebView2 runtime (bundled by installer) |
| Linux desktop | `webkit2gtk-4.1`, `libayatana-appindicator`, standard Tauri Linux deps |
| iOS/iPadOS | Xcode, an Apple Developer team, Rust targets `aarch64-apple-ios` (+ `aarch64-apple-ios-sim` for simulator) |
| Android | JDK 17 (`brew install openjdk@17`), Android SDK + NDK, Rust targets `aarch64-linux-android` (+ the armv7/i686/x86_64 triples for universal builds) |

Android builds read the SDK from the environment. On this repository's
reference setup (Homebrew command-line tools) that is:

```sh
export JAVA_HOME="$(brew --prefix openjdk@17)/libexec/openjdk.jdk/Contents/Home"
export ANDROID_HOME="$(brew --prefix)/share/android-commandlinetools"
export NDK_HOME="$ANDROID_HOME/ndk/<installed-version>"
```

## Dev loop

`npm run tauri:dev` opens the desktop shell against the Vite dev server at the
`devUrl` port in [tauri.conf.json](../src-tauri/tauri.conf.json) (5180). Start
that server yourself (`npm run dev -- --port 5180`) — the Tauri config
deliberately does not spawn one, so an already-running editor/browser dev
session is reused instead of fighting over the port.

`npm run tauri:android:dev` and `npm run tauri:ios:dev` do the same against an
emulator/simulator or a connected device.

## Release builds

| Target | Command | Output |
|---|---|---|
| macOS app + DMG | `npm run tauri:build` (on macOS) | `src-tauri/target/release/bundle/macos`, `…/dmg` |
| Windows installer | `npm run tauri:build` (on Windows) | `…/bundle/msi`, `…/bundle/nsis` |
| Linux packages | `npm run tauri:build` (on Linux) | `…/bundle/deb`, `…/bundle/rpm`, `…/bundle/appimage` |
| Android APK + AAB | `npm run tauri:android:build` | `src-tauri/gen/android/app/build/outputs/` |
| Android quick debug APK | `npm run tauri:android:build:debug` | same, `universal/debug/app-universal-debug.apk` |
| iOS/iPadOS IPA | `npm run tauri:ios:build` | `src-tauri/gen/apple/build/` |

Bundle identity, icons, window defaults, and the `.grovepad` file association
live in [tauri.conf.json](../src-tauri/tauri.conf.json). macOS-only bundle
steps (App Group entitlements, the widget-extension build via
`scripts/embed-macos-widget.sh`, and its `Contents/PlugIns` embedding) are
merged automatically from
[tauri.macos.conf.json](../src-tauri/tauri.macos.conf.json) — plain
`npm run tauri:build` on macOS already produces an app containing
`GrovepadNoteWidget.appex`.

## Signing

- **macOS**: set `APPLE_SIGNING_IDENTITY` (Developer ID for direct
  distribution). Without it the app and widget are ad-hoc signed — fine for
  local testing, not for release. Notarize the DMG before shipping.
- **iOS**: select the team once in `src-tauri/gen/apple/app.xcodeproj` (both
  the app and `GrovepadNoteWidget` targets); the App Group
  `group.com.grovepad.widgets` must exist in the developer account.
- **Android**: provide a keystore via the standard Tauri Android signing
  configuration for release AABs; debug builds use the debug keystore and the
  `.debug` application-id suffix from `tauri.conf.json`.
- **Windows**: optional Authenticode certificate via Tauri's `windows` signing
  config.

## CI: building every target from a tag push

[.github/workflows/native-release.yml](../.github/workflows/native-release.yml)
builds macOS (universal app + DMG), Windows (MSI + NSIS), Linux (deb/rpm/AppImage),
Android (APK + AAB), and iOS (IPA) on every `v*` tag push, or on demand via
"Run workflow". It works with **zero secrets configured** — desktop builds
ad-hoc sign, Android falls back to an unsigned debug APK, and iOS falls back
to the simulator compile-check — and each signed path turns on automatically
the moment its secret group exists in the repo's Settings → Secrets. No
workflow edit is needed to go from unsigned dry run to signed release.

| Secret | Used for | How to get it |
|---|---|---|
| `APPLE_CERTIFICATE` | macOS + iOS code signing | Export your Developer ID (macOS) or Distribution (iOS) certificate + private key from Keychain Access as a `.p12`, then `base64 -i cert.p12 \| pbcopy` |
| `APPLE_CERTIFICATE_PASSWORD` | Unlocks the `.p12` above | The password you set when exporting it |
| `APPLE_SIGNING_IDENTITY` | Selects the cert for macOS bundling | `security find-identity -v -p codesigning`, copy the identity string, e.g. `Developer ID Application: Your Name (TEAMID)` |
| `APPLE_TEAM_ID` | Notarization + iOS signing | Apple Developer account → Membership |
| `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` | macOS notarization | An [app-specific password](https://support.apple.com/en-us/102654) for your Apple ID |
| `IOS_PROVISIONING_PROFILE_BASE64` | iOS signing | Download the profile from the Developer portal, `base64 -i profile.mobileprovision \| pbcopy` |
| `WINDOWS_CERTIFICATE` | Windows Authenticode signing | `base64 -i cert.pfx \| pbcopy` |
| `WINDOWS_CERTIFICATE_PASSWORD` | Unlocks the `.pfx` above | The password you set when exporting it |
| `ANDROID_KEYSTORE_BASE64` | Android release signing | `keytool -genkeypair` to create a release keystore once, then `base64 -i release.keystore \| pbcopy` — **back this keystore up somewhere durable**; losing it means you can never update the app under the same identity on Google Play |
| `ANDROID_KEYSTORE_PASSWORD` / `ANDROID_KEY_ALIAS` / `ANDROID_KEY_PASSWORD` | Android release signing | Whatever you set when generating the keystore above |

The App Group `group.com.grovepad.widgets` (used by the Note home-screen
widget) must exist in the same Apple Developer account before the signed
macOS/iOS jobs will produce a working widget — see [native-os-widgets.md](native-os-widgets.md).

## Verification ladder

1. `npm run check:full` — the web payload every shell wraps.
2. `cargo test --manifest-path src-tauri/Cargo.toml` — shell logic and the
   Note-widget payload contract (compiles the Swift WidgetKit bridge on macOS).
3. `npm run tauri:android:build:debug` — full Rust cross-compile, plugin
   manifest merge, and APK assembly.
4. `xcodebuild -project src-tauri/gen/apple/app.xcodeproj -scheme GrovepadNoteWidget -sdk iphonesimulator -configuration debug CODE_SIGNING_ALLOWED=NO build`
   — iOS widget-extension compile without signing.
5. `npm run tauri:build -- --bundles app` on macOS, then confirm
   `Grovepad.app/Contents/PlugIns/GrovepadNoteWidget.appex` exists.
6. Device smoke per [manual smoke checklist](manual-smoke-checklist.md) and the
   [native widget runbook](native-os-widgets.md): open-with on a `.grovepad`
   file, and add/edit/remove of the home-screen Note on a signed build.

Windows and Linux bundles must be produced on (or in CI runners for) their own
operating systems — Tauri does not cross-bundle desktop targets.

## Store submission

Android's release signing is already wired and CI-ready (see the secrets
table above). The remaining store-listing work — screenshots, description
copy, privacy policy, data-safety declaration — is tracked in
[play-store-submission.md](play-store-submission.md).
