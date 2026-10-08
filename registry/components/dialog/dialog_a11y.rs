//! Focus-trap decisions for Dialog. No browser types live here, so `cargo test`
//! can exercise the behavior the DOM glue in `dialog.rs` applies.

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Focusable {
    pub disabled: bool,
    pub hidden: bool,
    pub tab_index: i32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FocusTarget {
    Item(usize),
    Panel,
}

/// Tab order: positive tabindex ascending, then tabindex 0 in source order.
/// Disabled, hidden, and tabindex < 0 nodes are not in the order.
pub fn tab_order(items: &[Focusable]) -> Vec<usize> {
    let mut positive = Vec::new();
    let mut zero = Vec::new();
    for (index, item) in items.iter().enumerate() {
        if item.disabled || item.hidden || item.tab_index < 0 {
            continue;
        }
        if item.tab_index > 0 {
            positive.push(index);
        } else {
            zero.push(index);
        }
    }
    positive.sort_by_key(|index| items[*index].tab_index);
    positive.extend(zero);
    positive
}

pub fn initial_focus(items: &[Focusable]) -> FocusTarget {
    match tab_order(items).first() {
        Some(index) => FocusTarget::Item(*index),
        None => FocusTarget::Panel,
    }
}

/// `current` is an index into `items`, or `None` when focus is outside the dialog.
pub fn focus_on_tab(items: &[Focusable], current: Option<usize>, shift: bool) -> FocusTarget {
    let order = tab_order(items);
    if order.is_empty() {
        return FocusTarget::Panel;
    }
    let position = current.and_then(|index| order.iter().position(|candidate| *candidate == index));
    let next = match (position, shift) {
        (None, true) => order[order.len() - 1],
        (None, false) => order[0],
        (Some(0), true) => order[order.len() - 1],
        (Some(index), true) => order[index - 1],
        (Some(index), false) if index + 1 == order.len() => order[0],
        (Some(index), false) => order[index + 1],
    };
    FocusTarget::Item(next)
}

pub fn is_escape(key: &str) -> bool {
    key == "Escape" || key == "Esc"
}

pub fn is_tab(key: &str) -> bool {
    key == "Tab"
}

/// Restore focus to the control that opened the dialog when it is still in the
/// document and was not inside the dialog itself.
pub fn should_restore_focus(had_opener: bool, opener_connected: bool, opener_inside_dialog: bool) -> bool {
    had_opener && opener_connected && !opener_inside_dialog
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(tab_index: i32) -> Focusable {
        Focusable { disabled: false, hidden: false, tab_index }
    }

    #[test]
    fn initial_focus_is_the_first_tabbable_control() {
        let items = [item(-1), item(0), item(0)];
        assert_eq!(initial_focus(&items), FocusTarget::Item(1));
    }

    #[test]
    fn initial_focus_uses_the_panel_when_nothing_is_tabbable() {
        let items = [
            Focusable { disabled: true, hidden: false, tab_index: 0 },
            item(-1),
        ];
        assert_eq!(initial_focus(&items), FocusTarget::Panel);
        assert_eq!(initial_focus(&[]), FocusTarget::Panel);
    }

    #[test]
    fn tab_wraps_and_shift_tab_wraps() {
        let items = [item(0), item(0), item(0)];
        assert_eq!(focus_on_tab(&items, Some(2), false), FocusTarget::Item(0));
        assert_eq!(focus_on_tab(&items, Some(0), true), FocusTarget::Item(2));
        assert_eq!(focus_on_tab(&items, Some(0), false), FocusTarget::Item(1));
        assert_eq!(focus_on_tab(&items, Some(1), true), FocusTarget::Item(0));
    }

    #[test]
    fn focus_outside_the_dialog_is_pulled_back_in() {
        let items = [item(0), item(0)];
        assert_eq!(focus_on_tab(&items, None, false), FocusTarget::Item(0));
        assert_eq!(focus_on_tab(&items, None, true), FocusTarget::Item(1));
    }

    #[test]
    fn disabled_hidden_and_negative_tabindex_are_skipped() {
        let items = [
            Focusable { disabled: true, hidden: false, tab_index: 0 },
            Focusable { disabled: false, hidden: true, tab_index: 0 },
            item(-1),
            item(0),
        ];
        assert_eq!(tab_order(&items), vec![3]);
        assert_eq!(focus_on_tab(&items, Some(3), false), FocusTarget::Item(3));
    }

    #[test]
    fn positive_tabindex_comes_before_source_order() {
        let items = [item(0), item(2), item(1), item(0)];
        assert_eq!(tab_order(&items), vec![2, 1, 0, 3]);
    }

    #[test]
    fn escape_and_tab_keys() {
        assert!(is_escape("Escape"));
        assert!(is_escape("Esc"));
        assert!(!is_escape("Enter"));
        assert!(is_tab("Tab"));
        assert!(!is_tab("Escape"));
    }

    #[test]
    fn restore_focus_only_when_the_opener_is_still_outside() {
        assert!(should_restore_focus(true, true, false));
        assert!(!should_restore_focus(false, true, false));
        assert!(!should_restore_focus(true, false, false));
        assert!(!should_restore_focus(true, true, true));
    }
}
