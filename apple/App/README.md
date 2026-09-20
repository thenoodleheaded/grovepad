# Grovepad — the native app target

One Xcode project, one multiplatform app target (`Grovepad`, destinations
macOS, iPad and iPhone) plus two multiplatform extensions it embeds —
`GrovepadNoteWidget` (WidgetKit, `NoteWidget/`) and `GrovepadQuickLook`
(the `.grovepad` preview, `QuickLook/`) — assembling the Swift package at `..`:
`GrovepadApp` (the app layer: coordinator, canvas hosts, login, account,
share sheet, haptics, system menus, the scene) over `GrovepadChrome`,
`GrovepadCanvas`, `GrovepadCore` and `GrovepadCloud`. The app target itself
holds `Sources/GrovepadMain.swift` (`@main`), `Sources/GrovepadShortcuts.swift`
(the App Intents registration and the Siri phrases, which must live in the app
target), the asset catalog, the entitlements and the Info.plist entries
`project.yml` fills. The widget extension has no package dependency (its
reader is pinned to the app's payload constants by `IntegrationNoteWidgetTests`);
the Quick Look extension links `GrovepadCore` only.

## Generate

`Grovepad.xcodeproj`, `Info.plist` and `Grovepad.entitlements` are generated
from `project.yml` (xcodegen 2.45, `brew install xcodegen`). After editing
`project.yml`:

```sh
cd apple/App
xcodegen generate
```

## Build and run

Mac, from a terminal (`apple/`):

```sh
xcodebuild -project App/Grovepad.xcodeproj -scheme Grovepad \
  -destination 'platform=macOS' -derivedDataPath .build/xcode build
open .build/xcode/Build/Products/Debug/Grovepad.app
```

That command needs a Mac App Development provisioning profile for
`app.grovepad.native` (the entitlements include Sign in with Apple and an App
Group, both of which require one). Xcode creates it on first Run once the
Mac is registered in the developer account (Xcode ▸ Settings ▸ Accounts, or
the "register device" prompt in the signing pane). Until then, a build signed
to run locally, without the two restricted entitlements:

```sh
xcodebuild -project App/Grovepad.xcodeproj -scheme Grovepad \
  -destination 'platform=macOS' -derivedDataPath .build/xcode \
  CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY=- DEVELOPMENT_TEAM= \
  PROVISIONING_PROFILE_SPECIFIER= \
  "CODE_SIGN_ENTITLEMENTS=$PWD/App/Grovepad.local.entitlements" build
```

(The entitlements path must be absolute: the override reaches every package
target in the build, and a relative path resolves against each of them. It
reaches the two extensions too, so under local signing the widget has no App
Group and shows its empty line — the payload file the app writes lands in
`~/Library/Group Containers/group.app.grovepad.native/` regardless.)

iPhone / iPad Simulator:

```sh
xcodebuild -project App/Grovepad.xcodeproj -scheme Grovepad \
  -destination 'generic/platform=iOS Simulator' -derivedDataPath .build/xcode-sim build
xcrun simctl boot "iPhone 17"
xcrun simctl install booted .build/xcode-sim/Build/Products/Debug-iphonesimulator/Grovepad.app
xcrun simctl launch booted app.grovepad.native
```

A real iPhone or iPad: open `App/Grovepad.xcodeproj` in Xcode, pick the
device and press Run (automatic signing, team `4BV47RN242`).

## Supabase values (accounts and sync)

`Config/Supabase.xcconfig` holds two blank entries, `GROVEPAD_SUPABASE_URL`
and `GROVEPAD_SUPABASE_ANON_KEY`, that land in Info.plist and are read by
`CloudSettings` in `GrovepadApp`. Blank means no account service: the app
runs as a guest with every local feature and never shows the login page.

To turn accounts on, create `Config/Supabase.local.xcconfig` (gitignored; the
main file includes it when it exists):

```
GROVEPAD_SUPABASE_URL = https:/$()/ijzmhkyhjptaitfxjlcu.supabase.co
GROVEPAD_SUPABASE_ANON_KEY = <the anon / publishable key>
```

Note the `/$()/` in the URL: xcconfig reads `//` as a comment. Never put a
key in `Supabase.xcconfig` itself or in `project.yml`. Owner steps before a
live sign-in, from `apple/AGENTS.md`: add `grovepad://auth/callback` to
Supabase's redirect URL list; register the App Store product ids in
`StoreKitEntitlementMapping.products`; and, because this target's bundle id
is `app.grovepad.native` (below), either add that id to the Apple provider's
Client IDs in Supabase and enable Sign in with Apple on it in the developer
portal, or switch the id to `app.grovepad`.

## Bundle id

`app.grovepad.native`, on purpose. The Tauri app is `app.grovepad`; the two
cannot be installed side by side on one device if they share an id, and the
owner is testing the Tauri iPhone build on a device today. When the native
app takes over, change `PRODUCT_BUNDLE_IDENTIFIER` in `project.yml` to
`app.grovepad` (everything else — Apple sign-in client id, App Group, App
Store products — is already written for that id), regenerate, and expect the
install to replace the Tauri app.

## Where things live

- Board store, device state, sync baselines and caches:
  `~/Library/Application Support/app.grovepad.native/` (Mac) or the sandbox
  equivalent (iOS), see `AppPaths`.
- Widget-picker favourites and recents: UserDefaults
  (`UserDefaultsWidgetPickerPrefs`).
- Share-sheet exports: a scratch folder under the temporary directory.
- The WidgetKit Note payload: `note-widget-payload-v1.json` in the App Group
  container `group.app.grovepad.native` (or `note-widget/` beside the store
  when the build has no container); the chosen card id in UserDefaults
  (`grovepad:native-note-widget:v1`).
- Spotlight: the `app.grovepad.native.board` domain of the system index,
  rebuilt on every launch.

## What is verified and what is not

Verified on the build Mac (see `apple/AGENTS.md`): the `GrovepadAppTests`
suites; the preview shell's hands-off smoke over the same canvas host; the
macOS build (signed to run locally) and its launch; the iOS Simulator build
and launch.

Also verified: both extensions build and embed on both platforms, register
with `pluginkit` on the Mac and in the simulator, and the App Intents
metadata is extracted into the app bundle.

Not exercised: signing with a real profile (needs the Mac registered in the
developer account); a real iPhone or iPad; sign-in, sync and account
deletion against the live Supabase project; StoreKit sandbox purchases;
Google's web session; the share sheet and the action sheet under a real
finger; the phase-7 device gates — the tick-list is in `../SMOKE.md`
(WidgetKit under a real App Group, Siri / Shortcuts, Spotlight results,
Handoff, Files open-with, Quick Look rendering, Scribble, Taptic).
