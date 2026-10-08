//! Theme switch: `data-theme` and `.dark` on `<html>`, persisted in localStorage.
//! web/index.html applies the stored value before first paint.

fn root() -> Option<web_sys::Element> {
    web_sys::window()?.document()?.document_element()
}

/// The theme on `<html>`, or the OS preference when none is stored yet.
pub fn current_theme() -> &'static str {
    match root().and_then(|el| el.get_attribute("data-theme")).as_deref() {
        Some("dark") => "dark",
        Some("light") => "light",
        _ => {
            let os_dark = web_sys::window()
                .and_then(|w| w.match_media("(prefers-color-scheme: dark)").ok().flatten())
                .is_some_and(|mq| mq.matches());
            if os_dark { "dark" } else { "light" }
        }
    }
}

pub fn set_theme(theme: &str) {
    let Some(el) = root() else { return };
    let _ = el.set_attribute("data-theme", theme);
    let classes = el.class_list();
    let _ = if theme == "dark" { classes.add_1("dark") } else { classes.remove_1("dark") };
    if let Some(storage) = web_sys::window().and_then(|w| w.local_storage().ok().flatten()) {
        let _ = storage.set_item("theme", theme);
    }
}
