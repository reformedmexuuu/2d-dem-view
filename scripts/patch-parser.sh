#!/usr/bin/env bash
# Patches the demoparser2 sources so the wasm build works in browsers:
#  1. std::time (Instant/SystemTime) panics on wasm32 -> use the web-time drop-in crate.
#  2. Adds setPanicHook() so Rust panics are reported instead of an opaque "unreachable".
set -e
DP="$1"
PARSER="$DP/src/parser"

# 1. web-time instead of std::time
files=$(grep -rlE 'std::time' "$PARSER/src" || true)
if [ -n "$files" ]; then
  echo "Patching std::time in:"; echo "$files"
  sed -i -E 's/std::time::/web_time::/g' $files
  if ! grep -q '^web-time' "$PARSER/Cargo.toml"; then
    sed -i -E '0,/^\[dependencies\]/s//[dependencies]\nweb-time = "1"/' "$PARSER/Cargo.toml"
  fi
fi

# 2. panic hook
LIB="$DP/src/wasm/src/lib.rs"
if ! grep -q setPanicHook "$LIB"; then
cat >> "$LIB" <<'RS'

#[wasm_bindgen]
pub fn setPanicHook() {
    std::panic::set_hook(Box::new(|info| {
        web_sys::console::error_1(&JsValue::from_str(&format!("PANIC: {}", info)));
    }));
}
RS
fi
