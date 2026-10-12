#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p build/BrandaPager.app/Contents/MacOS
sdk="$(xcrun --sdk macosx --show-sdk-path)"
for arch in arm64 x86_64; do
  xcrun swiftc Pager.swift -O -sdk "$sdk" -target "$arch-apple-macosx12.0" -framework AppKit -framework WebKit -o "build/BrandaPager-$arch"
done
lipo -create build/BrandaPager-arm64 build/BrandaPager-x86_64 -output build/BrandaPager.app/Contents/MacOS/BrandaPager
cp Info.plist build/BrandaPager.app/Contents/Info.plist
plutil -lint build/BrandaPager.app/Contents/Info.plist
codesign --force --sign - build/BrandaPager.app
codesign --verify --strict --verbose=2 build/BrandaPager.app
build/BrandaPager.app/Contents/MacOS/BrandaPager --self-test
ditto -c -k --keepParent build/BrandaPager.app build/branda-pager-macos.zip
shasum -a 256 build/branda-pager-macos.zip > build/SHA256SUMS
