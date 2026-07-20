#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
widget_root="$repo_root/src-tauri/native/apple"
derived_data="$widget_root/build/DerivedData"
configuration="${CONFIGURATION:-Release}"
identity="${APPLE_SIGNING_IDENTITY:--}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  exit 0
fi

xcodegen generate --spec "$widget_root/project.yml" --project "$widget_root"
xcodebuild \
  -project "$widget_root/GrovepadNoteWidget.xcodeproj" \
  -scheme GrovepadNoteWidget \
  -configuration "$configuration" \
  -derivedDataPath "$derived_data" \
  CODE_SIGNING_ALLOWED=NO \
  build

appex="$derived_data/Build/Products/$configuration/GrovepadNoteWidget.appex"
codesign --force --sign "$identity" \
  --entitlements "$widget_root/GrovepadNoteWidget.entitlements" \
  "$appex"
codesign --verify --strict "$appex"
