#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod share;
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![share::share_app_archive,share::open_whatsapp])
        .run(tauri::generate_context!())
        .expect("Unable to start Tandem");
}
