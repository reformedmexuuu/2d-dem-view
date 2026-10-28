#!/usr/bin/env bash
# Builds the demoparser2 WASM parser from the latest source (github.com/LaihoE/demoparser)
# into public/parser. Falls back to the (older) npm package if the source build fails.
# Needs: rustup, protoc (apt: protobuf-compiler), wasm-pack.
set -uo pipefail
OUT="$(pwd)/public/parser"
WORK="$(mktemp -d)"
mkdir -p "$OUT"

build_source() {
  git clone --depth 1 https://github.com/LaihoE/demoparser "$WORK/dp" || return 1
  (cd "$WORK/dp" && echo "demoparser commit: $(git log -1 --format='%h %cd')")
  rustup target add wasm32-unknown-unknown || return 1
  command -v wasm-pack >/dev/null || npm i -g wasm-pack || cargo install wasm-pack --locked || return 1
  (cd "$WORK/dp/src/wasm" && wasm-pack build --release --target no-modules --out-dir "$WORK/pkg") || return 1
  cp "$WORK/pkg/demoparser2.js" "$WORK/pkg/demoparser2_bg.wasm" "$OUT/"
}

build_npm() {
  (cd "$WORK" && npm pack demoparser2 --silent && tar xzf demoparser2-*.tgz) || return 1
  cp "$WORK/package/demoparser2.js" "$WORK/package/demoparser2_bg.wasm" "$OUT/"
}

if build_source; then
  echo "Parser: built from source"
  echo "source" > "$OUT/origin.txt"
elif build_npm; then
  echo "::warning::Parser source build failed, using older npm package"
  echo "npm" > "$OUT/origin.txt"
else
  echo "::error::Could not obtain demoparser2"
  exit 1
fi
ls -la "$OUT"
