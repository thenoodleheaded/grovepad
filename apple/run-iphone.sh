#!/bin/sh
# Build the native Grovepad and run it on the iPhone simulator.
# Boots a simulator first if none is running.
set -e
cd "$(dirname "$0")"

if ! xcrun simctl list devices booted | grep -q iPhone; then
  echo "Booting a simulator..."
  xcrun simctl boot "iPhone 17" 2>/dev/null || true
  open -a Simulator
  sleep 8
fi

xcodebuild -project App/Grovepad.xcodeproj -scheme Grovepad \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -derivedDataPath .build/xcode-sim build "$@"

APP=$(find .build/xcode-sim/Build/Products -name 'Grovepad.app' -path '*iphonesimulator*' | head -1)
xcrun simctl install booted "$APP"
xcrun simctl launch booted app.grovepad.native
open -a Simulator
