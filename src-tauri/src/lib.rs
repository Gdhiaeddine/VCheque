use std::fs;
use tauri::Manager;

#[tauri::command]
fn get_templates_config_path(app: tauri::AppHandle) -> Result<String, String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    let file_path = config_dir.join("cheque-templates.json");
    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
fn load_templates_config(app: tauri::AppHandle) -> Result<String, String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let file_path = config_dir.join("cheque-templates.json");
    if file_path.exists() {
        fs::read_to_string(&file_path).map_err(|e| e.to_string())
    } else {
        Ok(String::new())
    }
}

#[tauri::command]
fn save_templates_config(app: tauri::AppHandle, content: String) -> Result<String, String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    let file_path = config_dir.join("cheque-templates.json");
    fs::write(&file_path, content).map_err(|e| e.to_string())?;
    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
fn open_templates_config_folder(app: tauri::AppHandle) -> Result<(), String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let file_path = config_dir.join("cheque-templates.json");
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        if file_path.exists() {
            let _ = Command::new("explorer")
                .arg(format!("/select,{}", file_path.display()))
                .spawn();
        } else {
            let _ = Command::new("explorer").arg(&config_dir).spawn();
        }
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .setup(|app| {
            // Assure que l'icône de la fenêtre native Windows (barre de titre avec - et X) est toujours affichée
            let icon = tauri::include_image!("icons/icon.png");
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_icon(icon);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_templates_config_path,
            load_templates_config,
            save_templates_config,
            open_templates_config_folder
        ])
        .run(tauri::generate_context!())
        .expect("erreur lors du lancement de Chèque Studio");
}