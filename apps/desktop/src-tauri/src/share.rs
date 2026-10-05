#[tauri::command]
pub async fn share_app_archive() -> Result<Vec<u8>, String> {
    #[cfg(target_os = "macos")]
    {
        tauri::async_runtime::spawn_blocking(|| {
            let executable = std::env::current_exe().map_err(|_| "Cannot locate this app")?;
            let app = executable.parent().and_then(|p| p.parent()).and_then(|p| p.parent())
                .filter(|p| p.extension().is_some_and(|e| e == "app"))
                .ok_or("Sharing the installer is available in the installed Mac app, not development mode")?;
            let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|_| "Clock error")?.as_nanos();
            let folder = std::env::temp_dir().join(format!("tandem-share-{}-{}",std::process::id(),stamp));
            std::fs::create_dir(&folder).map_err(|_| "Cannot create temporary archive")?;
            let archive=folder.join("Tandem.zip");
            // Only the executable application bundle is copied. WebView vault data lives
            // outside the bundle and is never included. No shell or caller-supplied path.
            let result=(||{
                let status=std::process::Command::new("/usr/bin/ditto")
                    .args(["-c","-k","--sequesterRsrc","--keepParent"])
                    .arg(app).arg(&archive).status().map_err(|_| "Cannot prepare the installer")?;
                if !status.success(){return Err("Installer preparation failed");}
                std::fs::read(&archive).map_err(|_| "Cannot read the installer")
            })();
            let _ = std::fs::remove_dir_all(&folder);
            result.map_err(String::from)
        }).await.map_err(|_| "Installer task failed".to_string())?
    }
    #[cfg(not(target_os = "macos"))]
    { Err("Use the installer built for this operating system".to_string()) }
}

#[tauri::command]
pub fn open_whatsapp(url: String) -> Result<(), String> {
    if !url.starts_with("https://wa.me/?text=") || url.chars().any(char::is_control) {
        return Err("Invalid WhatsApp share link".to_string());
    }
    #[cfg(target_os = "macos")]
    {
        let status=std::process::Command::new("/usr/bin/open").arg(url).status().map_err(|_| "Could not open WhatsApp")?;
        if status.success(){Ok(())}else{Err("Could not open WhatsApp. Use Copy link instead.".to_string())}
    }
    #[cfg(not(target_os = "macos"))]
    { Err("Use Copy link and paste it into WhatsApp".to_string()) }
}
