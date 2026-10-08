//! Card copied by `tesso add card`.
//!
//! `title` and `description` are static strings (`title="Shift"`). The body
//! is the caller's HTML, placed with `<Children>`.

use fusor::prelude::*;

#[derive(FromInputs)]
pub struct Card {
    #[input]
    title: &'static str,
    #[input]
    description: &'static str,
}

fusor::template!("web/components/card.html");
