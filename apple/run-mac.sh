#!/bin/sh
# Build and open the native Grovepad on this Mac.
#
# It signs the app to run locally only, which is what lets it launch without a
# provisioning profile. That costs the two restricted entitlements: Sign in
# with Apple and the App Group the home-screen widget reads. Everything else
# works. Once this Mac is registered in the developer account (Xcode, Settings,
# Accounts) you can drop everything from CODE_SIGN_STYLE onwards and get those
# two back.
set -e
cd "$(dirname "$0")"

# Release by default: a Debug build runs the canvas several times slower
# (unoptimised Swift), which reads as a low frame rate. `CONFIG=Debug
# ./run-mac.sh` for a debuggable build.
CONFIG="${CONFIG:-Release}"

# This Mac's chip only: the collaboration engine (Yrs XCFramework) ships no
# Intel slice, so a universal Release build fails to link.

xcodebuild -project App/Grovepad.xcodeproj -scheme Grovepad \
  -configuration "$CONFIG" \
  -destination 'platform=macOS' -derivedDataPath .build/xcode \
  ONLY_ACTIVE_ARCH=YES \
  CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY=- DEVELOPMENT_TEAM= \
  PROVISIONING_PROFILE_SPECIFIER= \
  "CODE_SIGN_ENTITLEMENTS=$PWD/App/Grovepad.local.entitlements" \
  build "$@"

open ".build/xcode/Build/Products/$CONFIG/Grovepad.app"
