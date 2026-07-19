#!/usr/bin/env bash
# Builds TVDeploy and packages it into a double-clickable "TV Deploy.app".
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

swift build -c release

APP_NAME="TV Deploy"
APP_DIR="$APP_NAME.app"
BIN_NAME="TVDeploy"
BUILD_BIN=".build/release/$BIN_NAME"

rm -rf "$APP_DIR"
mkdir -p "$APP_DIR/Contents/MacOS"
cp "$BUILD_BIN" "$APP_DIR/Contents/MacOS/$BIN_NAME"

cat > "$APP_DIR/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>$APP_NAME</string>
    <key>CFBundleDisplayName</key>
    <string>$APP_NAME</string>
    <key>CFBundleIdentifier</key>
    <string>com.iptvplayer.tvdeploy</string>
    <key>CFBundleExecutable</key>
    <string>$BIN_NAME</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>LSMinimumSystemVersion</key>
    <string>13.0</string>
    <key>LSUIElement</key>
    <true/>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
PLIST

echo "Built '$APP_DIR'"
echo "Run it:      open \"$APP_DIR\""
echo "Or install:  cp -r \"$APP_DIR\" /Applications/"
