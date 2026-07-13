// Match Stats — Tauri backend entry point.
//
// Wires up:
//   * single-instance   — only one widget at a time (focuses the existing one)
//   * autostart         — optional "Start with Windows"
//   * window-state      — remembers the widget's on-screen position
//   * store             — persists the selected theme
//   * http              — polls LibreHardwareMonitor without CORS issues
//   * tray              — GPU-temp badge icon + menu

mod themes;
mod tray;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // Single-instance must be the FIRST plugin registered. Desktop only.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.show();
                let _ = win.unminimize();
                let _ = win.set_focus();
            }
        }));
    }

    builder = builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_store::Builder::new().build());

    #[cfg(desktop)]
    {
        builder = builder
            .plugin(
                tauri_plugin_window_state::Builder::default()
                    // Only remember position — the size is driven by the widget mode.
                    .with_state_flags(tauri_plugin_window_state::StateFlags::POSITION)
                    .build(),
            )
            .plugin(tauri_plugin_autostart::init(
                tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                Some(vec!["--minimized"]),
            ));
    }

    builder
        .invoke_handler(tauri::generate_handler![tray::set_tray_temp])
        .setup(|app| {
            #[cfg(desktop)]
            tray::setup_tray(app.handle())?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
