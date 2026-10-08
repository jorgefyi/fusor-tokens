//! Dialog copied by `tesso add dialog`.
//!
//! `open` is a `Signal<bool>` the page owns. While it is true this module calls
//! `showModal()` on the native `<dialog>`; when it becomes false it calls
//! `close()`. The browser traps focus, renders the dialog in the top layer, and
//! makes the rest of the page inert. Escape fires `cancel` on the topmost dialog
//! only.
//!
//! Fusor has no element ref, so the dialog node is found with
//! `[data-tesso-dialog]` once when `open` becomes true. Safari and Firefox do
//! not focus a button on click, and the browser would restore `<body>` on close,
//! so the last `pointerdown` target is kept as an opener fallback.
//!
//! Stacking, opener choice, and the inert-background decision live in
//! `dialog_a11y` and are covered by `cargo test`.

use std::cell::{Cell, RefCell};
use std::rc::Rc;

use fusor::prelude::*;
use wasm_bindgen::closure::Closure;
use wasm_bindgen::{JsCast, JsValue};

use crate::dialog_a11y::{self, OpenerChoice, OpenerFacts};

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
    /// Set when this dialog receives `cancel` but it was not the top dialog.
    /// Some browsers close every modal on one Escape and the event is not
    /// cancelable, so `close` puts the dialog back.
    reject_close: Rc<Cell<bool>>,
    _effect: fusor::CleanupEffect,
}

impl fusor::FromInputs for Dialog {
    type Inputs = DialogInputs;
    type Error = std::convert::Infallible;

    fn from_inputs(inputs: Self::Inputs, _owner: OwnerHandle) -> Result<Self, Self::Error> {
        install_pointer_tracker();
        let instance_id = next_instance_id();
        let title_id = format!("{instance_id}-title");
        let description_id = format!("{instance_id}-description");
        let open = inputs.open;
        let watched = open.clone();
        let id_for_effect = instance_id.clone();
        let opener = Rc::new(RefCell::new(None));
        let choice = Rc::new(Cell::new(OpenerChoice::None));
        let generation = Rc::new(Cell::new(0u32));
        let reject_close = Rc::new(Cell::new(false));
        let effect = fusor::effect_with_cleanup({
            let opener = Rc::clone(&opener);
            let choice = Rc::clone(&choice);
            let generation = Rc::clone(&generation);
            move || {
                let token = generation.get().wrapping_add(1);
                generation.set(token);
                let opened = Rc::new(Cell::new(false));
                reconcile(Reconcile {
                    id: id_for_effect.clone(),
                    want_open: watched.get(),
                    generation: Rc::clone(&generation),
                    token,
                    opener: Rc::clone(&opener),
                    choice: Rc::clone(&choice),
                    opened: Rc::clone(&opened),
                    deferred: false,
                });
                Session {
                    id: id_for_effect.clone(),
                    generation: Rc::clone(&generation),
                    token,
                    opener: Rc::clone(&opener),
                    choice: Rc::clone(&choice),
                    opened,
                }
            }
        });
        Ok(Self {
            open,
            title: inputs.title,
            description: inputs.description,
            instance_id,
            title_id,
            description_id,
            reject_close,
            _effect: effect,
        })
    }
}

impl Dialog {
    fn close(&self) {
        self.open.set(false);
    }

    /// A click on the dialog box, outside the panel, is the backdrop.
    /// `::backdrop` itself is not a click target.
    fn on_backdrop_click(&self, event: &web_sys::Event) {
        let Some(dialog) = find_dialog(&self.instance_id) else {
            return;
        };
        let Some(target) = event_element(event) else {
            return;
        };
        if same_element(&target, &dialog) {
            self.close();
        }
    }

    /// Escape fires `cancel` on the top dialog. Chrome also fires it, not
    /// cancelable, on every modal under that one and then closes them all.
    /// Claim the key for the dialog that was top, and mark the others so
    /// `close` can put them back.
    fn on_cancel(&self, event: &web_sys::Event) {
        let _ = event.prevent_default();
        if claim_escape(&self.instance_id) {
            let open = self.open.clone();
            defer(move || open.set(false));
        } else {
            self.reject_close.set(true);
            let id = self.instance_id.clone();
            // Queue the reopen before the top dialog queues its focus restore,
            // so showModal() cannot steal the opener.
            defer(move || reopen_dialog(&id));
            let flag = Rc::clone(&self.reject_close);
            let id = self.instance_id.clone();
            defer(move || {
                if dialog_is_open(&id) {
                    flag.set(false);
                }
            });
        }
    }

    fn on_native_close(&self) {
        if self.reject_close.replace(false) {
            return;
        }
        self.close();
    }
}

fusor::template!("web/components/dialog.html");

struct Session {
    id: String,
    generation: Rc<Cell<u32>>,
    token: u32,
    opener: Rc<RefCell<Option<web_sys::Element>>>,
    choice: Rc<Cell<OpenerChoice>>,
    opened: Rc<Cell<bool>>,
}

impl Drop for Session {
    fn drop(&mut self) {
        if self.generation.get() == self.token {
            self.generation.set(self.token.wrapping_add(1));
        }
        if self.opened.replace(false) {
            dismiss(&self.id, &self.opener, &self.choice);
        }
    }
}

struct Reconcile {
    id: String,
    want_open: bool,
    generation: Rc<Cell<u32>>,
    token: u32,
    opener: Rc<RefCell<Option<web_sys::Element>>>,
    choice: Rc<Cell<OpenerChoice>>,
    opened: Rc<Cell<bool>>,
    deferred: bool,
}

fn reconcile(task: Reconcile) {
    if task.generation.get() != task.token {
        return;
    }
    if !task.want_open {
        if task.opened.get() || dialog_is_open(&task.id) {
            dismiss(&task.id, &task.opener, &task.choice);
            task.opened.set(false);
        }
        return;
    }
    let Some(dialog) = find_dialog(&task.id) else {
        if !task.deferred {
            defer_reconcile(task);
        }
        return;
    };
    if dialog.open() {
        return;
    }
    remember_opener(&task.id, &task.opener, &task.choice);
    if dialog.show_modal().is_err() {
        if !task.deferred {
            defer_reconcile(task);
        }
        return;
    }
    task.opened.set(true);
    let id = task.id.clone();
    with_stack(|stack| stack.open(id));
    sync_scroll_lock();
}

fn defer_reconcile(task: Reconcile) {
    defer(move || {
        reconcile(Reconcile {
            deferred: true,
            ..task
        });
    });
}

fn dismiss(id: &str, opener: &RefCell<Option<web_sys::Element>>, choice: &Cell<OpenerChoice>) {
    if let Some(dialog) = find_dialog(id) {
        if dialog.open() {
            dialog.close();
        }
    }
    pop_dialog(id);
    restore_focus(id, opener, choice);
    sync_scroll_lock();
}

fn pop_dialog(id: &str) {
    with_stack(|stack| {
        if !stack.is_open(id) {
            return;
        }
        if dialog_a11y::allows_escape(stack.is_top(id)) {
            let _ = stack.escape();
        } else {
            stack.close(id);
        }
    });
}

fn dialog_is_open(id: &str) -> bool {
    find_dialog(id).is_some_and(|dialog| dialog.open())
}

fn reopen_dialog(id: &str) {
    let Some(dialog) = find_dialog(id) else {
        return;
    };
    if dialog.open() {
        return;
    }
    let previous = active_element().filter(|element| {
        let node: &web_sys::Node = element.unchecked_ref();
        let root: &web_sys::Node = dialog.unchecked_ref();
        root.contains(Some(node))
    });
    if dialog.show_modal().is_err() {
        return;
    }
    if let Some(element) = previous
        .as_ref()
        .and_then(|element| element.dyn_ref::<web_sys::HtmlElement>())
    {
        let _ = element.focus();
    }
}

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

thread_local! {
    static STACK: RefCell<dialog_a11y::ModalStack> = const { RefCell::new(dialog_a11y::ModalStack::new()) };
    static ESCAPE_GATE: RefCell<dialog_a11y::EscapeGate> = const { RefCell::new(dialog_a11y::EscapeGate::new()) };
}

fn with_stack<T>(apply: impl FnOnce(&mut dialog_a11y::ModalStack) -> T) -> T {
    STACK.with(|stack| apply(&mut stack.borrow_mut()))
}

/// `thread_local!` inside `with_stack` would be a different stack for every
/// return type, so opening and reading the top would not see the same dialogs.
fn claim_escape(id: &str) -> bool {
    let is_top = with_stack(|stack| dialog_a11y::allows_escape(stack.is_top(id)));
    ESCAPE_GATE.with(|gate| {
        let first = gate.borrow().is_empty();
        let allowed = gate.borrow_mut().claim(id, is_top);
        if first && allowed {
            defer(|| ESCAPE_GATE.with(|gate| gate.borrow_mut().reset()));
        }
        allowed
    })
}

fn sync_scroll_lock() {
    let inert = with_stack(|stack| stack.background_inert());
    let Some(root) = web_sys::window()
        .and_then(|window| window.document())
        .and_then(|document| document.document_element())
    else {
        return;
    };
    let classes = root.class_list();
    if inert {
        let _ = classes.add_1("tesso-dialog-open");
    } else {
        let _ = classes.remove_1("tesso-dialog-open");
    }
}

thread_local! {
    static POINTER_OPENER: RefCell<Option<web_sys::Element>> = const { RefCell::new(None) };
}

fn install_pointer_tracker() {
    thread_local! {
        static INSTALLED: Cell<bool> = const { Cell::new(false) };
    }
    if INSTALLED.with(|installed| installed.replace(true)) {
        return;
    }
    let Some(document) = web_sys::window().and_then(|window| window.document()) else {
        INSTALLED.with(|installed| installed.set(false));
        return;
    };
    let closure = Closure::wrap(Box::new(|event: web_sys::Event| {
        record_pointer_target(&event);
    }) as Box<dyn Fn(web_sys::Event)>);
    if document
        .add_event_listener_with_callback_and_bool(
            "pointerdown",
            closure.as_ref().unchecked_ref(),
            true,
        )
        .is_ok()
    {
        closure.forget();
    } else {
        INSTALLED.with(|installed| installed.set(false));
    }
}

fn record_pointer_target(event: &web_sys::Event) {
    let Some(element) = event_element(event) else {
        return;
    };
    let Some(control) = opener_control(&element) else {
        return;
    };
    POINTER_OPENER.with(|slot| *slot.borrow_mut() = Some(control));
}

fn opener_control(start: &web_sys::Element) -> Option<web_sys::Element> {
    let mut current = Some(start.clone());
    while let Some(element) = current {
        if is_opener_control(&element) {
            return Some(element);
        }
        current = element.parent_element();
    }
    None
}

fn is_opener_control(element: &web_sys::Element) -> bool {
    let tag = element.tag_name().to_ascii_lowercase();
    match tag.as_str() {
        "button" | "a" | "input" | "select" | "textarea" => true,
        _ => element
            .get_attribute("tabindex")
            .and_then(|value| value.parse::<i32>().ok())
            .is_some_and(|index| index >= 0),
    }
}

fn remember_opener(
    id: &str,
    slot: &RefCell<Option<web_sys::Element>>,
    choice: &Cell<OpenerChoice>,
) {
    let active = active_element();
    let pointer = POINTER_OPENER.with(|slot| slot.borrow().clone());
    let picked = dialog_a11y::choose_opener(
        active.as_ref().map(|element| facts(element, id)),
        pointer.as_ref().map(|element| facts(element, id)),
    );
    let element = match picked {
        OpenerChoice::Active => active,
        OpenerChoice::Pointer => pointer,
        OpenerChoice::None => None,
    };
    *slot.borrow_mut() = element;
    choice.set(picked);
}

fn facts(element: &web_sys::Element, id: &str) -> OpenerFacts {
    let node: &web_sys::Node = element.unchecked_ref();
    let tag = element.tag_name().to_ascii_lowercase();
    let inside = find_dialog(id).is_some_and(|dialog| {
        let root: &web_sys::Node = dialog.unchecked_ref();
        root.contains(Some(node))
    });
    OpenerFacts {
        connected: node.is_connected(),
        inside_dialog: inside,
        is_body_or_html: tag == "body" || tag == "html",
    }
}

fn restore_focus(id: &str, slot: &RefCell<Option<web_sys::Element>>, choice: &Cell<OpenerChoice>) {
    let picked = choice.replace(OpenerChoice::None);
    let Some(element) = slot.borrow_mut().take() else {
        return;
    };
    let id = id.to_string();
    // `close()` moves focus after the close event, back to whatever was focused
    // at `showModal()`. Restore on the next turn so that move does not win.
    defer(move || {
        let node: &web_sys::Node = element.unchecked_ref();
        let inside = find_dialog(&id).is_some_and(|dialog| {
            let root: &web_sys::Node = dialog.unchecked_ref();
            root.contains(Some(node))
        });
        if dialog_a11y::should_restore_focus(picked, node.is_connected(), inside) {
            if let Some(html) = element.dyn_ref::<web_sys::HtmlElement>() {
                let _ = html.focus();
            }
        }
    });
}

fn find_dialog(id: &str) -> Option<web_sys::HtmlDialogElement> {
    let element = web_sys::window()?
        .document()?
        .query_selector(&format!("[data-tesso-dialog=\"{id}\"]"))
        .ok()
        .flatten()?;
    element.dyn_into::<web_sys::HtmlDialogElement>().ok()
}

fn active_element() -> Option<web_sys::Element> {
    web_sys::window()?.document()?.active_element()
}

fn event_element(event: &web_sys::Event) -> Option<web_sys::Element> {
    let target = event.target()?;
    if let Some(element) = target.dyn_ref::<web_sys::Element>() {
        return Some(element.clone());
    }
    target.dyn_ref::<web_sys::Node>()?.parent_element()
}

fn same_element(left: &web_sys::Element, right: &web_sys::Element) -> bool {
    let left: &JsValue = left.as_ref();
    let right: &JsValue = right.as_ref();
    left == right
}

fn defer(work: impl FnOnce() + 'static) {
    let Some(window) = web_sys::window() else {
        return;
    };
    let closure = Closure::once(work);
    if window
        .set_timeout_with_callback_and_timeout_and_arguments_0(closure.as_ref().unchecked_ref(), 0)
        .is_ok()
    {
        closure.forget();
    }
}
