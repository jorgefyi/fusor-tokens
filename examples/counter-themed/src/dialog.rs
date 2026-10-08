//! Dialog copied by `tesso add dialog`.
//!
//! Fusor has no focus or dialog helper. While `open` is true this module traps
//! Tab inside the panel, closes on Escape, and returns focus to the element
//! that opened it. The decisions live in `dialog_a11y` so they can be tested
//! without a browser; this file applies them to the DOM.
//!
//! `open` is a `Signal<bool>` the page owns. `title` and `description` are
//! static strings and are the accessible name and description.

use std::cell::{Cell, RefCell};
use std::rc::Rc;

use fusor::prelude::*;
use wasm_bindgen::closure::Closure;
use wasm_bindgen::{JsCast, JsValue};

use crate::dialog_a11y::{self, FocusTarget, Focusable};

pub struct DialogInputs {
    pub open: Signal<bool>,
    pub title: &'static str,
    pub description: &'static str,
}

pub struct Dialog {
    open: Signal<bool>,
    title: &'static str,
    description: &'static str,
    instance_id: String,
    title_id: String,
    description_id: String,
    _effect: fusor::CleanupEffect,
}

impl fusor::FromInputs for Dialog {
    type Inputs = DialogInputs;
    type Error = std::convert::Infallible;

    fn from_inputs(inputs: Self::Inputs, _owner: OwnerHandle) -> Result<Self, Self::Error> {
        let instance_id = next_instance_id();
        let title_id = format!("{instance_id}-title");
        let description_id = format!("{instance_id}-description");
        let open = inputs.open;
        let watched = open.clone();
        let id_for_effect = instance_id.clone();
        let opener = Rc::new(RefCell::new(None));
        let generation = Rc::new(Cell::new(0u32));
        let opener_for_effect = Rc::clone(&opener);
        let generation_for_effect = Rc::clone(&generation);
        let effect = fusor::effect_with_cleanup(move || {
            if !watched.get() {
                restore_focus(&opener_for_effect);
                return None;
            }
            remember_opener(&id_for_effect, &opener_for_effect);
            let token = generation_for_effect.get().wrapping_add(1);
            generation_for_effect.set(token);
            Some(Session::arm(
                id_for_effect.clone(),
                watched.clone(),
                Rc::clone(&generation_for_effect),
                token,
            ))
        });
        Ok(Self {
            open,
            title: inputs.title,
            description: inputs.description,
            instance_id,
            title_id,
            description_id,
            _effect: effect,
        })
    }
}

impl Dialog {
    fn close(&self) {
        self.open.set(false);
    }
}

fusor::template!("web/components/dialog.html");

fn next_instance_id() -> String {
    thread_local! {
        static NEXT: Cell<u32> = const { Cell::new(1) };
    }
    NEXT.with(|next| {
        let id = next.get();
        next.set(id + 1);
        format!("tesso-dialog-{id}")
    })
}

struct Session {
    generation: Rc<Cell<u32>>,
    token: u32,
    trap: Rc<RefCell<Option<KeyTrap>>>,
    locked: Rc<Cell<bool>>,
}

impl Session {
    fn arm(id: String, open: Signal<bool>, generation: Rc<Cell<u32>>, token: u32) -> Self {
        let trap = Rc::new(RefCell::new(None));
        let locked = Rc::new(Cell::new(false));
        poll_until_mounted(
            id,
            open,
            Rc::clone(&generation),
            token,
            Rc::clone(&trap),
            Rc::clone(&locked),
            0,
        );
        Self { generation, token, trap, locked }
    }
}

/// Frames to wait before choosing initial focus. Fusor applies `hidden` and fills
/// `<Children>` after the signal effect, so the first timeout can see a panel
/// with no buttons yet.
const FOCUS_SETTLE_ATTEMPTS: u8 = 3;
const FOCUS_GIVE_UP_ATTEMPTS: u8 = 8;

impl Drop for Session {
    fn drop(&mut self) {
        if self.generation.get() == self.token {
            self.generation.set(self.token.wrapping_add(1));
        }
        self.trap.borrow_mut().take();
        if self.locked.replace(false) {
            set_scroll_lock(false);
        }
    }
}

fn poll_until_mounted(
    id: String,
    open: Signal<bool>,
    generation: Rc<Cell<u32>>,
    token: u32,
    trap: Rc<RefCell<Option<KeyTrap>>>,
    locked: Rc<Cell<bool>>,
    attempt: u8,
) {
    defer(move || {
        if generation.get() != token || !open.get() {
            return;
        }
        let panel = shown_panel(&id);
        let Some(panel) = panel else {
            if attempt < FOCUS_GIVE_UP_ATTEMPTS {
                poll_until_mounted(id, open, generation, token, trap, locked, attempt + 1);
            }
            return;
        };
        if trap.borrow().is_none() {
            match install_listener(&id, open.clone()) {
                Some(key_trap) => {
                    *trap.borrow_mut() = Some(key_trap);
                    if !locked.replace(true) {
                        set_scroll_lock(true);
                    }
                }
                None if attempt < FOCUS_GIVE_UP_ATTEMPTS => {
                    poll_until_mounted(id, open, generation, token, trap, locked, attempt + 1);
                    return;
                }
                None => return,
            }
        }
        let target = dialog_a11y::initial_focus(&descriptions(&panel));
        let waiting_for_controls = matches!(target, FocusTarget::Panel) && attempt < FOCUS_GIVE_UP_ATTEMPTS;
        if attempt < FOCUS_SETTLE_ATTEMPTS || waiting_for_controls {
            poll_until_mounted(id, open, generation, token, trap, locked, attempt + 1);
            return;
        }
        // A Tab that arrived before this frame already moved focus inside the panel.
        if focus_is_inside_dialog(&id, &panel) {
            return;
        }
        focus_target(&panel, target);
    });
}

fn shown_panel(id: &str) -> Option<web_sys::Element> {
    let root = dialog_root(id)?;
    if root.has_attribute("hidden") {
        return None;
    }
    panel_element(&root)
}

fn focus_is_inside_dialog(id: &str, panel: &web_sys::Element) -> bool {
    let Some(active) = active_element() else { return false };
    if same_element(&active, panel) {
        return false;
    }
    dialog_root(id).is_some_and(|root| contains(&root, &active))
}

struct KeyTrap {
    closure: Rc<Closure<dyn Fn(web_sys::Event)>>,
}

impl Drop for KeyTrap {
    fn drop(&mut self) {
        if let Some(document) = web_sys::window().and_then(|window| window.document()) {
            let _ = document.remove_event_listener_with_callback_and_bool(
                "keydown",
                self.closure.as_js_value().unchecked_ref(),
                true,
            );
        }
        let closure = Rc::clone(&self.closure);
        defer(move || drop(closure));
    }
}

fn install_listener(id: &str, open: Signal<bool>) -> Option<KeyTrap> {
    let id = id.to_owned();
    let closure = Closure::wrap(Box::new(move |event: web_sys::Event| {
        on_key(&id, &open, &event);
    }) as Box<dyn Fn(web_sys::Event)>);
    let document = web_sys::window()?.document()?;
    document
        .add_event_listener_with_callback_and_bool("keydown", closure.as_ref().unchecked_ref(), true)
        .ok()?;
    Some(KeyTrap { closure: Rc::new(closure) })
}

fn on_key(id: &str, open: &Signal<bool>, event: &web_sys::Event) {
    let Some(keyboard) = event.dyn_ref::<web_sys::KeyboardEvent>() else { return };
    let key = keyboard.key();
    if dialog_a11y::is_escape(&key) {
        event.prevent_default();
        event.stop_propagation();
        open.set(false);
        return;
    }
    if dialog_a11y::is_tab(&key) {
        event.prevent_default();
        event.stop_propagation();
        let Some(root) = dialog_root(id) else { return };
        let Some(panel) = panel_element(&root) else { return };
        let elements = focusable_elements(&panel);
        let current = active_element().and_then(|active| {
            elements.iter().position(|element| same_element(element, &active))
        });
        let target = dialog_a11y::focus_on_tab(&descriptions_of(&elements), current, keyboard.shift_key());
        focus_resolved(&panel, &elements, target);
    }
}

fn focus_target(panel: &web_sys::Element, target: FocusTarget) {
    let elements = focusable_elements(panel);
    focus_resolved(panel, &elements, target);
}

fn focus_resolved(panel: &web_sys::Element, elements: &[web_sys::Element], target: FocusTarget) {
    match target {
        FocusTarget::Item(index) => {
            if let Some(element) = elements.get(index) {
                focus_element(element);
            } else {
                focus_element(panel);
            }
        }
        FocusTarget::Panel => focus_element(panel),
    }
}

fn descriptions(panel: &web_sys::Element) -> Vec<Focusable> {
    descriptions_of(&focusable_elements(panel))
}

fn descriptions_of(elements: &[web_sys::Element]) -> Vec<Focusable> {
    elements.iter().map(describe).collect()
}

fn describe(element: &web_sys::Element) -> Focusable {
    let tab_index = element.get_attribute("tabindex").and_then(|value| value.parse().ok()).unwrap_or(0);
    Focusable {
        disabled: element.has_attribute("disabled") || element.get_attribute("aria-disabled").as_deref() == Some("true"),
        hidden: is_hidden(element),
        tab_index,
    }
}

fn focusable_elements(panel: &web_sys::Element) -> Vec<web_sys::Element> {
    let Ok(list) = panel.query_selector_all(
        "a[href], button, input:not([type=\"hidden\"]), select, textarea, [tabindex]",
    ) else {
        return Vec::new();
    };
    let mut elements = Vec::new();
    for index in 0..list.length() {
        let Some(node) = list.item(index) else { continue };
        let Some(element) = node.dyn_ref::<web_sys::Element>() else { continue };
        elements.push(element.clone());
    }
    elements
}

fn is_hidden(element: &web_sys::Element) -> bool {
    let mut current = Some(element.clone());
    while let Some(node) = current {
        if node.has_attribute("hidden") || node.get_attribute("aria-hidden").as_deref() == Some("true") {
            return true;
        }
        current = node.parent_element();
    }
    false
}

fn remember_opener(id: &str, slot: &RefCell<Option<web_sys::Element>>) {
    let Some(active) = active_element() else { return };
    let inside = dialog_root(id).is_some_and(|root| contains(&root, &active));
    if !inside {
        *slot.borrow_mut() = Some(active);
    }
}

fn restore_focus(slot: &RefCell<Option<web_sys::Element>>) {
    let Some(element) = slot.borrow_mut().take() else { return };
    let node: &web_sys::Node = element.unchecked_ref();
    if dialog_a11y::should_restore_focus(true, node.is_connected(), false) {
        focus_element(&element);
    }
}

fn dialog_root(id: &str) -> Option<web_sys::Element> {
    web_sys::window()?
        .document()?
        .query_selector(&format!("[data-tesso-dialog=\"{id}\"]"))
        .ok()
        .flatten()
}

fn panel_element(root: &web_sys::Element) -> Option<web_sys::Element> {
    root.query_selector("[data-tesso-dialog-panel]").ok().flatten()
}

fn active_element() -> Option<web_sys::Element> {
    web_sys::window()?.document()?.active_element()
}

fn contains(root: &web_sys::Element, node: &web_sys::Element) -> bool {
    let root_node: &web_sys::Node = root.unchecked_ref();
    let child: &web_sys::Node = node.unchecked_ref();
    root_node.contains(Some(child))
}

fn same_element(left: &web_sys::Element, right: &web_sys::Element) -> bool {
    let left: &JsValue = left.as_ref();
    let right: &JsValue = right.as_ref();
    left == right
}

fn focus_element(element: &web_sys::Element) {
    if let Some(html) = element.dyn_ref::<web_sys::HtmlElement>() {
        let _ = html.focus();
    }
}

fn set_scroll_lock(lock: bool) {
    thread_local! {
        static DEPTH: Cell<i32> = const { Cell::new(0) };
    }
    DEPTH.with(|depth| {
        let next = (depth.get() + if lock { 1 } else { -1 }).max(0);
        depth.set(next);
        let Some(root) = web_sys::window().and_then(|window| window.document()).and_then(|document| document.document_element()) else {
            return;
        };
        let classes = root.class_list();
        if next > 0 {
            let _ = classes.add_1("tesso-dialog-open");
        } else {
            let _ = classes.remove_1("tesso-dialog-open");
        }
    });
}

fn defer(work: impl FnOnce() + 'static) {
    let Some(window) = web_sys::window() else { return };
    let closure = Closure::once(work);
    if window
        .set_timeout_with_callback_and_timeout_and_arguments_0(closure.as_ref().unchecked_ref(), 0)
        .is_ok()
    {
        closure.forget();
    }
}
