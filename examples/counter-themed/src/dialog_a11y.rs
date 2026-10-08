//! Stacking and opener decisions for Dialog. No browser types live here, so
//! `cargo test` can exercise the behavior the DOM glue in `dialog.rs` applies.
//!
//! The browser's modal `<dialog>` traps focus, renders in the top layer, and
//! makes the rest of the page inert. This module decides which dialog Escape
//! applies to, which element opened it, and whether the page behind is inert.

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct OpenerFacts {
    pub connected: bool,
    pub inside_dialog: bool,
    pub is_body_or_html: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OpenerChoice {
    Active,
    Pointer,
    None,
}

#[derive(Debug, Default)]
pub struct ModalStack {
    open: Vec<String>,
}

impl ModalStack {
    pub const fn new() -> Self {
        Self { open: Vec::new() }
    }

    /// Push `id` if it is not already open. A second open does not stack it twice.
    pub fn open(&mut self, id: impl Into<String>) {
        let id = id.into();
        if !self.is_open(&id) {
            self.open.push(id);
        }
    }

    pub fn close(&mut self, id: &str) {
        self.open.retain(|existing| existing != id);
    }

    pub fn is_open(&self, id: &str) -> bool {
        self.open.iter().any(|existing| existing == id)
    }

    pub fn is_top(&self, id: &str) -> bool {
        self.open.last().is_some_and(|top| top == id)
    }

    /// Close only the top dialog. Dialogs under it stay open.
    pub fn escape(&mut self) -> Option<String> {
        self.open.pop()
    }

    pub fn background_inert(&self) -> bool {
        !self.open.is_empty()
    }
}

fn usable(facts: &OpenerFacts) -> bool {
    facts.connected && !facts.inside_dialog && !facts.is_body_or_html
}

/// Prefer the focused control. Safari and Firefox leave focus on `<body>` after
/// a click, so the pointer target is the fallback.
pub fn choose_opener(active: Option<OpenerFacts>, pointer: Option<OpenerFacts>) -> OpenerChoice {
    if active.as_ref().is_some_and(usable) {
        OpenerChoice::Active
    } else if pointer.as_ref().is_some_and(usable) {
        OpenerChoice::Pointer
    } else {
        OpenerChoice::None
    }
}

pub fn should_restore_focus(choice: OpenerChoice, connected: bool, inside_dialog: bool) -> bool {
    choice != OpenerChoice::None && connected && !inside_dialog
}

/// Escape applies only to the dialog at the top of the stack.
pub fn allows_escape(is_top: bool) -> bool {
    is_top
}

/// One Escape can deliver `cancel` to every open dialog. The first top dialog
/// claims it; later `cancel` events in that same key, even if a dialog becomes
/// top because the first one already closed, do not.
#[derive(Debug, Default)]
pub struct EscapeGate {
    chosen: Option<String>,
}

impl EscapeGate {
    pub const fn new() -> Self {
        Self { chosen: None }
    }

    pub fn is_empty(&self) -> bool {
        self.chosen.is_none()
    }

    pub fn claim(&mut self, id: &str, is_top: bool) -> bool {
        if let Some(chosen) = &self.chosen {
            return chosen == id;
        }
        if !is_top {
            return false;
        }
        self.chosen = Some(id.to_string());
        true
    }

    pub fn reset(&mut self) {
        self.chosen = None;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn control() -> OpenerFacts {
        OpenerFacts {
            connected: true,
            inside_dialog: false,
            is_body_or_html: false,
        }
    }

    #[test]
    fn escape_closes_only_the_top_dialog() {
        let mut stack = ModalStack::new();
        stack.open("reset");
        stack.open("details");
        assert!(stack.background_inert());
        assert!(allows_escape(stack.is_top("details")));
        assert!(!allows_escape(stack.is_top("reset")));

        assert_eq!(stack.escape().as_deref(), Some("details"));
        assert!(stack.is_open("reset"));
        assert!(!stack.is_open("details"));
        assert!(stack.is_top("reset"));
        assert!(stack.background_inert());

        assert_eq!(stack.escape().as_deref(), Some("reset"));
        assert!(!stack.background_inert());
        assert_eq!(stack.escape(), None);
    }

    #[test]
    fn pointer_opener_when_the_active_element_is_body() {
        let body = OpenerFacts {
            connected: true,
            inside_dialog: false,
            is_body_or_html: true,
        };
        assert_eq!(
            choose_opener(Some(body), Some(control())),
            OpenerChoice::Pointer
        );
        assert!(should_restore_focus(OpenerChoice::Pointer, true, false));
        assert!(!should_restore_focus(OpenerChoice::None, true, false));
        assert!(!should_restore_focus(OpenerChoice::Pointer, false, false));
        assert!(!should_restore_focus(OpenerChoice::Pointer, true, true));
    }

    #[test]
    fn background_is_inert_while_any_dialog_is_open() {
        let mut stack = ModalStack::new();
        assert!(!stack.background_inert());
        stack.open("reset");
        assert!(stack.background_inert());
        stack.open("details");
        stack.close("reset");
        assert!(stack.is_open("details"));
        assert!(stack.is_top("details"));
        assert!(stack.background_inert());
        stack.close("details");
        assert!(!stack.background_inert());
    }

    #[test]
    fn a_real_focused_control_wins_over_the_pointer_target() {
        assert_eq!(
            choose_opener(Some(control()), Some(control())),
            OpenerChoice::Active
        );
        assert!(should_restore_focus(OpenerChoice::Active, true, false));
    }

    #[test]
    fn an_opener_inside_the_dialog_or_disconnected_is_skipped() {
        let inside = OpenerFacts {
            connected: true,
            inside_dialog: true,
            is_body_or_html: false,
        };
        let gone = OpenerFacts {
            connected: false,
            inside_dialog: false,
            is_body_or_html: false,
        };
        assert_eq!(
            choose_opener(Some(inside), Some(control())),
            OpenerChoice::Pointer
        );
        assert_eq!(
            choose_opener(Some(gone), Some(control())),
            OpenerChoice::Pointer
        );
        assert_eq!(choose_opener(Some(inside), Some(gone)), OpenerChoice::None);
        assert_eq!(choose_opener(None, None), OpenerChoice::None);
        assert!(!should_restore_focus(OpenerChoice::Active, true, true));
        assert!(!should_restore_focus(OpenerChoice::Active, false, false));
    }

    #[test]
    fn one_escape_closes_only_the_dialog_that_was_top_when_it_started() {
        let mut gate = EscapeGate::new();
        assert!(gate.claim("details", true));
        assert!(!gate.claim("reset", false));
        // The top dialog may already have left the stack before the lower cancel.
        assert!(!gate.claim("reset", true));
        assert!(gate.claim("details", false));
        gate.reset();
        assert!(gate.claim("reset", true));
    }

    #[test]
    fn a_lower_dialog_cannot_take_the_escape_from_the_top() {
        let mut gate = EscapeGate::new();
        assert!(!gate.claim("reset", false));
        assert!(gate.claim("details", true));
        assert!(!gate.claim("reset", false));
    }

    #[test]
    fn opening_the_same_dialog_twice_does_not_stack_it_twice() {
        let mut stack = ModalStack::new();
        stack.open("reset");
        stack.open("reset");
        assert!(stack.is_top("reset"));
        assert_eq!(stack.escape().as_deref(), Some("reset"));
        assert!(!stack.background_inert());
    }
}
