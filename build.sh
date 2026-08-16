#!/usr/bin/env bash
# Build the extension zip for store submission
# Run from the repo root: ./build.sh

set -e

VERSION=$(grep '"version"' src/manifest.json | sed 's/.*: "\(.*\)".*/\1/')
OUTPUT="store-assets/planner-lens-v${VERSION}.zip"

mkdir -p store-assets
rm -f "$OUTPUT"

cd src
zip -r "../$OUTPUT" . -x ".*"
cd ..

echo "Built: $OUTPUT ($(du -h "$OUTPUT" | cut -f1))"
echo "Upload this file to Chrome Web Store and Firefox Add-ons."
