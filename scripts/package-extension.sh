#!/bin/bash
# Packages the Chrome extension into a .crx and copies it to email-extractor/static/
# Usage: ./scripts/package-extension.sh
# Requires: Google Chrome installed, extension.pem in project root

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
EXTENSION_DIR="$ROOT_DIR/chrome-extension"
OUTPUT_DIR="$ROOT_DIR/email-extractor/static"
KEY_FILE="$ROOT_DIR/extension.pem"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

if [ ! -f "$KEY_FILE" ]; then
  echo "Error: extension.pem not found at $KEY_FILE"
  echo "Keep your .pem key safe — it must be the same one used each time to preserve the extension ID."
  exit 1
fi

if [ ! -f "$CHROME" ]; then
  echo "Error: Google Chrome not found at: $CHROME"
  exit 1
fi

mkdir -p "$OUTPUT_DIR"

"$CHROME" \
  --pack-extension="$EXTENSION_DIR" \
  --pack-extension-key="$KEY_FILE" \
  --no-message-box 2>/dev/null

mv "$ROOT_DIR/chrome-extension.crx" "$OUTPUT_DIR/extension.crx"

echo "Done — email-extractor/static/extension.crx is ready to commit"
