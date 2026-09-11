#!/bin/bash
# Xcode's "Build Rust Code" step for the iOS app (see src-tauri/gen/apple/project.yml).
#
# Lets the app build and run from Xcode's Run button alone. Tauri's own step,
# `tauri ios xcode-script`, only works while `tauri ios dev|build --open` is
# running in a terminal, because it asks that command for its build settings.
# When such a command is running this defers to it untouched. Otherwise it
# rebuilds the web frontend if it changed, starts a stand-in that answers with
# the settings `tauri ios build` would send, and runs the same Tauri step.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

# Xcode runs build steps with a bare PATH that has no Rust toolchain and may
# have no Node.
export PATH="$HOME/.cargo/bin:/opt/homebrew/opt/rustup/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v npm >/dev/null 2>&1 || ! command -v cargo >/dev/null 2>&1; then
  PATH="$PATH:$(/bin/zsh -lc 'printf %s "$PATH"' 2>/dev/null || true)"
fi
for tool in node npm cargo; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "error: '$tool' was not found. Install it, or add its folder to PATH in scripts/ios/xcode-build-rust.sh." >&2
    exit 1
  fi
done

identifier="$(node -p "require('./src-tauri/tauri.conf.json').identifier")"
temp_dir="${TMPDIR:-/tmp}"
addr_file="${temp_dir%/}/${identifier}-server-addr"

tauri_command_running() {
  [[ -s "$addr_file" ]] || return 1
  local addr
  addr="$(cat "$addr_file")"
  nc -z -G 1 "${addr%:*}" "${addr##*:}" >/dev/null 2>&1
}

if tauri_command_running; then
  exec npm run -- tauri ios xcode-script "$@"
fi

# The frontend is baked into the app, so rebuild it whenever anything it is
# built from is newer than the last build.
frontend_inputs=(src public index.html package.json package-lock.json vite.config.ts tsconfig.json tsconfig.app.json .env .env.local .env.production .env.production.local)
if [[ ! -f dist/index.html ]] || [[ -n "$(find "${frontend_inputs[@]}" -newer dist/index.html -print -quit 2>/dev/null)" ]]; then
  echo "Building the web frontend (npm run build)..."
  npm run build
else
  echo "Web frontend is up to date; skipping npm run build."
fi

rm -f "$addr_file"
node scripts/ios/xcodeCliOptionsServer.mjs "$addr_file" "$$" &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true; rm -f "$addr_file"' EXIT

for _ in $(seq 100); do
  tauri_command_running && break
  if ! kill -0 "$server_pid" 2>/dev/null; then
    echo "error: the Tauri settings stand-in exited before it started." >&2
    exit 1
  fi
  sleep 0.1
done
if ! tauri_command_running; then
  echo "error: the Tauri settings stand-in did not start within 10 seconds." >&2
  exit 1
fi

npm run -- tauri ios xcode-script "$@"
