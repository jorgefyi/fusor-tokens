use std::rc::Rc;

use fusor::prelude::*;

use crate::button::Button;
use crate::card::Card;
use crate::dialog::Dialog;
use crate::theme_toggle::ThemeToggle;

struct App {
    count: Signal<i32>,
    reset_open: Signal<bool>,
    increment: Rc<dyn Fn()>,
    decrement: Rc<dyn Fn()>,
    ask_reset: Rc<dyn Fn()>,
    cancel_reset: Rc<dyn Fn()>,
    confirm_reset: Rc<dyn Fn()>,
}

impl App {
    fn new() -> Self {
        let count = signal(0);
        let reset_open = signal(false);
        let increment = {
            let count = count.clone();
            Rc::new(move || count.update(|n| *n += 1)) as Rc<dyn Fn()>
        };
        let decrement = {
            let count = count.clone();
            Rc::new(move || count.update(|n| *n -= 1)) as Rc<dyn Fn()>
        };
        let ask_reset = {
            let reset_open = reset_open.clone();
            Rc::new(move || reset_open.set(true)) as Rc<dyn Fn()>
        };
        let cancel_reset = {
            let reset_open = reset_open.clone();
            Rc::new(move || reset_open.set(false)) as Rc<dyn Fn()>
        };
        let confirm_reset = {
            let count = count.clone();
            let reset_open = reset_open.clone();
            Rc::new(move || {
                count.set(0);
                reset_open.set(false);
            }) as Rc<dyn Fn()>
        };
        Self {
            count,
            reset_open,
            increment,
            decrement,
            ask_reset,
            cancel_reset,
            confirm_reset,
        }
    }
}

fusor::template!("web/index.html");
