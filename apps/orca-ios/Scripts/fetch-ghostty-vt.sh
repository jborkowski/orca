#!/usr/bin/env bash
# Download Ghostty tip libghostty-vt XCFramework (iOS + simulator + macOS).
# Why: binaries are large / tip-moving — keep them out of git; rehydrate locally.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENDOR="$ROOT/Vendor"
URL="${GHOSTTY_VT_URL:-https://github.com/ghostty-org/ghostty/releases/download/tip/ghostty-vt.xcframework.zip}"
mkdir -p "$VENDOR"
cd "$VENDOR"
curl -fL -o ghostty-vt.xcframework.zip "$URL"
rm -rf ghostty-vt.xcframework
unzip -qo ghostty-vt.xcframework.zip
rm -f ghostty-vt.xcframework.zip
echo "Installed $VENDOR/ghostty-vt.xcframework"
