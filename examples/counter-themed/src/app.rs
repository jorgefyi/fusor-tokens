use crate::theme_toggle::ThemeToggle;
use fusor::prelude::*;

struct App {
    count: Signal<i32>,
}

impl App {
    fn new() -> Self {
        Self { count: signal(0) }
    }

    fn increment(&self) {
        self.count.update(|n| *n += 1);
    }

    fn decrement(&self) {
        self.count.update(|n| *n -= 1);
    }
}

fusor::template!("web/index.html");
