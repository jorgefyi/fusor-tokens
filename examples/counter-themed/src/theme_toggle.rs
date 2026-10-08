use crate::theme;
use fusor::prelude::*;

#[derive(FromInputs)]
pub struct ThemeToggle {
    #[local(init = signal(theme::current_theme().to_owned()))]
    theme: Signal<String>,
}

impl ThemeToggle {
    fn set_light(&self) {
        theme::set_theme("light");
        self.theme.set("light".to_owned());
    }

    fn set_dark(&self) {
        theme::set_theme("dark");
        self.theme.set("dark".to_owned());
    }
}

fusor::template!("web/components/theme_toggle.html");
