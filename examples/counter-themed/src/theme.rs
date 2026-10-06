// src/theme.rs — sketch; adapt to fusor new scaffolding / web-sys features
use wasm_bindgen::JsCast;
use web_sys::HtmlElement;

pub fn current_theme() -> &'static str {
    let doc = web_sys::window()
        .and_then(|w| w.document())
        .expect("document");
    let el = doc.document_element().expect("html");
    match el.get_attribute("data-theme").as_deref() {
        Some("dark") => "dark",
        _ => "light",
    }
}

pub fn set_theme(theme: &str) {
    let doc = web_sys::window()
        .and_then(|w| w.document())
        .expect("document");
    let el = doc.document_element().expect("html");
    let _ = el.set_attribute("data-theme", theme);
    if theme == "dark" {
        let _ = el.class_list().add_1("dark");
    } else {
        let _ = el.class_list().remove_1("dark");
    }
    if let Some(storage) = web_sys::window()
        .and_then(|w| w.local_storage().ok().flatten())
    {
        let _ = storage.set_item("theme", theme);
    }
}

pub fn toggle_theme() {
    if current_theme() == "dark" {
        set_theme("light");
    } else {
        set_theme("dark");
    }
}
