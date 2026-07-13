//! Theme identifiers shared with the frontend, used to build the tray's Theme
//! submenu. Only `id` + display `name` are needed on the Rust side; the actual
//! colors live in `src/themes.ts`. Keep the ids in sync with that file.

pub struct ThemeMeta {
    pub id: &'static str,
    pub name: &'static str,
}

pub const THEMES: &[ThemeMeta] = &[
    ThemeMeta {
        id: "pitch",
        name: "Pitch Green",
    },
    ThemeMeta {
        id: "madrid",
        name: "Real Madrid",
    },
    ThemeMeta {
        id: "barca",
        name: "Barcelona",
    },
    ThemeMeta {
        id: "united",
        name: "Man United",
    },
];
