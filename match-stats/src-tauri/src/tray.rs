//! System tray: a dynamically-rendered icon that shows the current GPU
//! temperature as a colored badge, plus a menu (Show/Hide, Theme, Start with
//! Windows, Quit).
//!
//! Windows does not draw text next to a tray icon, so the temperature is
//! rasterised directly into the icon bitmap using a tiny hardcoded 5×7 pixel
//! font. This keeps the whole thing dependency-free (only `tauri`) and avoids
//! bundling a TTF font.

use tauri::image::Image;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_autostart::ManagerExt;

use crate::themes::THEMES;

pub const TRAY_ID: &str = "match-stats-tray";
const ICON_SIZE: u32 = 64;

// 5×7 bitmap glyphs for the digits 0-9. Each row uses the low 5 bits (MSB = left).
#[rustfmt::skip]
const DIGITS: [[u8; 7]; 10] = [
    [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110], // 0
    [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110], // 1
    [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111], // 2
    [0b11111, 0b00010, 0b00100, 0b00010, 0b00001, 0b10001, 0b01110], // 3
    [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010], // 4
    [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110], // 5
    [0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110], // 6
    [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000], // 7
    [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110], // 8
    [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100], // 9
];

/// Badge background color for a temperature (matches the widget's thresholds).
/// `None` (no reading yet) renders a neutral grey.
fn badge_color(temp: Option<i32>) -> (u8, u8, u8) {
    match temp {
        None => (95, 105, 115),               // idle grey
        Some(t) if t < 60 => (39, 190, 110),  // green
        Some(t) if t <= 80 => (230, 165, 25), // amber
        Some(_) => (226, 72, 55),             // red
    }
}

/// Render a 64×64 RGBA badge icon: a colored disc with the temperature drawn on
/// it. With `None` it renders a plain neutral disc (used before the first read).
fn render_badge(temp: Option<i32>) -> Image<'static> {
    let size = ICON_SIZE as i32;
    let mut buf = vec![0u8; (ICON_SIZE * ICON_SIZE * 4) as usize];

    let put = |buf: &mut Vec<u8>, x: i32, y: i32, (r, g, b): (u8, u8, u8), a: u8| {
        if x < 0 || y < 0 || x >= size || y >= size {
            return;
        }
        let i = ((y * size + x) * 4) as usize;
        buf[i] = r;
        buf[i + 1] = g;
        buf[i + 2] = b;
        buf[i + 3] = a;
    };

    // Filled disc background.
    let (bg, cx, cy, radius) = (badge_color(temp), 31.5f32, 31.5f32, 31.0f32);
    for y in 0..size {
        for x in 0..size {
            let dx = x as f32 - cx;
            let dy = y as f32 - cy;
            let dist = (dx * dx + dy * dy).sqrt();
            if dist <= radius {
                // 1px feathered edge for smoother antialiasing.
                let a = if dist > radius - 1.0 {
                    (255.0 * (radius - dist).clamp(0.0, 1.0)) as u8
                } else {
                    255
                };
                put(&mut buf, x, y, bg, a);
            }
        }
    }

    if let Some(t) = temp {
        // Text color: dark on amber for contrast, white otherwise.
        let text: (u8, u8, u8) = if (60..=80).contains(&t) {
            (20, 20, 20)
        } else {
            (255, 255, 255)
        };

        let s = t.clamp(0, 999).to_string();
        let n = s.len() as i32;
        let scale: i32 = match n {
            1 => 7,
            2 => 5,
            _ => 3,
        };
        let glyph_w = 5 * scale;
        let gap = scale;
        let total_w = n * glyph_w + (n - 1) * gap;
        let mut x0 = (size - total_w) / 2;
        let y0 = (size - 7 * scale) / 2;

        for ch in s.chars() {
            let d = ch as usize - '0' as usize;
            let glyph = DIGITS[d];
            for (row, bits) in glyph.iter().enumerate() {
                for col in 0..5 {
                    if bits & (1 << (4 - col)) != 0 {
                        for py in 0..scale {
                            for px in 0..scale {
                                put(
                                    &mut buf,
                                    x0 + col * scale + px,
                                    y0 + row as i32 * scale + py,
                                    text,
                                    255,
                                );
                            }
                        }
                    }
                }
            }
            x0 += glyph_w + gap;
        }
    }

    Image::new_owned(buf, ICON_SIZE, ICON_SIZE)
}

/// Build the tray icon and its menu, and wire up the menu / click handlers.
pub fn setup_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "toggle", "Show / Hide", true, None::<&str>)?;

    // Theme submenu — selecting emits `set-theme` to the widget, which applies
    // and persists it.
    let mut theme_items: Vec<MenuItem<R>> = Vec::new();
    for theme in THEMES.iter() {
        theme_items.push(MenuItem::with_id(
            app,
            format!("theme:{}", theme.id),
            theme.name,
            true,
            None::<&str>,
        )?);
    }
    let theme_refs: Vec<&dyn tauri::menu::IsMenuItem<R>> = theme_items
        .iter()
        .map(|i| i as &dyn tauri::menu::IsMenuItem<R>)
        .collect();
    let theme_menu = Submenu::with_items(app, "Theme", true, &theme_refs)?;

    let autostart_enabled = app.autolaunch().is_enabled().unwrap_or(false);
    let autostart = CheckMenuItem::with_id(
        app,
        "autostart",
        "Start with Windows",
        true,
        autostart_enabled,
        None::<&str>,
    )?;

    let sep = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&show, &theme_menu, &autostart, &sep, &quit])?;

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(render_badge(None))
        .tooltip("Match Stats — waiting for kick-off…")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "toggle" => toggle_window(app),
            "quit" => app.exit(0),
            "autostart" => {
                let mgr = app.autolaunch();
                let now_enabled = mgr.is_enabled().unwrap_or(false);
                let _ = if now_enabled {
                    mgr.disable()
                } else {
                    mgr.enable()
                };
                autostart.set_checked(!now_enabled).ok();
            }
            other => {
                if let Some(id) = other.strip_prefix("theme:") {
                    let _ = app.emit("set-theme", id.to_string());
                }
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

/// Update the tray badge + tooltip with the latest GPU temperature.
/// Called from the frontend on each poll. `temp = None` shows the neutral badge.
#[tauri::command]
pub fn set_tray_temp(app: AppHandle, temp: Option<i32>) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };
    let _ = tray.set_icon(Some(render_badge(temp)));
    let tooltip = match temp {
        Some(t) => format!("Match Stats — GPU {t}°C"),
        None => "Match Stats — kick-off pending…".to_string(),
    };
    let _ = tray.set_tooltip(Some(&tooltip));
}

fn toggle_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(win) = app.get_webview_window("main") {
        match win.is_visible() {
            Ok(true) => {
                let _ = win.hide();
            }
            _ => {
                let _ = win.show();
                let _ = win.set_focus();
            }
        }
    }
}

fn show_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}
