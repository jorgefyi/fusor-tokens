//! Counter themed example.
//!
//! `theme.rs` is the Fusor/wasm toggle from the blueprint. It is not declared
//! as a module here, so `cargo check` on the host does not need web-sys.
//! Copy it into a real `fusor new` app and call `toggle_theme` from the button.

pub fn app_name() -> &'static str {
    "counter-themed"
}
