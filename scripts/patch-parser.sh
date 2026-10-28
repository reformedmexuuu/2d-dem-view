#!/usr/bin/env bash
# Adds an exported setPanicHook() to the demoparser2 wasm crate so Rust panics
# are reported through console.error instead of an opaque "unreachable".
set -e
LIB="$1/src/wasm/src/lib.rs"
grep -q setPanicHook "$LIB" && exit 0
cat >> "$LIB" <<'RS'

#[wasm_bindgen]
pub fn setPanicHook() {
    std::panic::set_hook(Box::new(|info| {
        web_sys::console::error_1(&JsValue::from_str(&format!("PANIC: {}", info)));
    }));
}
RS
