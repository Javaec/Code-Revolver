use crate::{extract_info_from_auth, get_codex_auth_file, CodexAuthFile};
use std::fs;
use tauri::{Emitter, Manager};

pub fn setup_tray<R: tauri::Runtime>(app: &tauri::App<R>) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
    use tauri::tray::TrayIconBuilder;

    let codex_auth = get_codex_auth_file();
    let account_info = if codex_auth.exists() {
        if let Ok(content) = fs::read_to_string(&codex_auth) {
            if let Ok(auth) = serde_json::from_str::<CodexAuthFile>(&content) {
                let (email, _, _, _) = extract_info_from_auth(&auth);
                format!("Current: {}", email)
            } else {
                "Current: Unknown".to_string()
            }
        } else {
            "Current: Not Configured".to_string()
        }
    } else {
        "Current: Not Configured".to_string()
    };

    let account_item = MenuItem::with_id(app, "account", &account_info, false, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let show = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?;
    let refresh = MenuItem::with_id(app, "refresh", "Refresh", true, None::<&str>)?;
    let separator2 = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&account_item, &separator, &show, &refresh, &separator2, &quit])?;

    TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "refresh" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.emit("tray-refresh", ());
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::Click { button: tauri::tray::MouseButton::Left, .. } = event {
                if let Some(window) = tray.app_handle().get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}
