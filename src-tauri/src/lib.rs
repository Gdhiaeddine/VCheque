use std::fs;
use tauri::Manager;

pub mod license;

#[tauri::command]
fn get_hardware_id() -> Result<String, String> {
    license::get_hardware_id()
}

#[tauri::command]
fn check_license_status(app: tauri::AppHandle) -> Result<license::LicenseCheckResult, String> {
    license::check_license_status(&app)
}

#[tauri::command]
async fn activate_license_online(
    app: tauri::AppHandle,
    license_key: String,
    server_url: Option<String>,
) -> Result<license::LicenseCheckResult, String> {
    license::activate_license_online(&app, &license_key, server_url.as_deref()).await
}

#[tauri::command]
fn import_offline_license(
    app: tauri::AppHandle,
    license_content: String,
) -> Result<license::LicenseCheckResult, String> {
    license::import_offline_license(&app, &license_content)
}

#[tauri::command]
fn deactivate_license(app: tauri::AppHandle) -> Result<(), String> {
    license::deactivate_license(&app)
}

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

#[tauri::command]
fn save_file_dialog(
    default_filename: String,
    filter_name: String,
    filter_ext: String,
    bytes: Vec<u8>,
) -> Result<Option<String>, String> {
    let dialog = rfd::FileDialog::new()
        .set_file_name(&default_filename)
        .add_filter(&filter_name, &[&filter_ext]);

    if let Some(path) = dialog.save_file() {
        fs::write(&path, &bytes).map_err(|e| e.to_string())?;
        let path_str = path.to_string_lossy().to_string();

        #[cfg(target_os = "windows")]
        {
            use std::process::Command;
            let _ = Command::new("explorer")
                .arg(format!("/select,{}", path_str))
                .spawn();
        }

        Ok(Some(path_str))
    } else {
        Ok(None)
    }
}

#[tauri::command]
fn save_pdf_dialog(default_filename: String, bytes: Vec<u8>) -> Result<Option<String>, String> {
    let dialog = rfd::FileDialog::new()
        .set_file_name(&default_filename)
        .add_filter("Document PDF (*.pdf)", &["pdf"]);

    if let Some(path) = dialog.save_file() {
        fs::write(&path, &bytes).map_err(|e| e.to_string())?;
        let path_str = path.to_string_lossy().to_string();

        #[cfg(target_os = "windows")]
        {
            use std::process::Command;
            let _ = Command::new("explorer")
                .arg(format!("/select,{}", path_str))
                .spawn();
        }

        Ok(Some(path_str))
    } else {
        Ok(None)
    }
}

#[tauri::command]
fn save_pdf_to_downloads(app: tauri::AppHandle, filename: String, bytes: Vec<u8>) -> Result<String, String> {
    let download_dir = app.path().download_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&download_dir).map_err(|e| e.to_string())?;
    let file_path = download_dir.join(&filename);
    fs::write(&file_path, &bytes).map_err(|e| e.to_string())?;
    let path_str = file_path.to_string_lossy().to_string();

    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let _ = Command::new("explorer")
            .arg(format!("/select,{}", path_str))
            .spawn();
    }

    Ok(path_str)
}

#[tauri::command]
fn pick_folder_dialog(default_path: Option<String>) -> Result<Option<String>, String> {
    let mut dialog = rfd::FileDialog::new();
    if let Some(ref path) = default_path {
        if !path.is_empty() {
            dialog = dialog.set_directory(path);
        }
    }
    if let Some(folder_path) = dialog.pick_folder() {
        Ok(Some(folder_path.to_string_lossy().to_string()))
    } else {
        Ok(None)
    }
}

#[tauri::command]
fn get_app_data_dir(app: tauri::AppHandle) -> Result<String, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    Ok(app_dir.to_string_lossy().to_string())
}

#[tauri::command]
fn open_folder_path(folder_path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        use std::path::Path;
        let p = Path::new(&folder_path);
        if !p.exists() {
            let _ = fs::create_dir_all(p);
        }
        let _ = Command::new("explorer").arg(&folder_path).spawn();
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
            open_templates_config_folder,
            save_file_dialog,
            save_pdf_dialog,
            save_pdf_to_downloads,
            pick_folder_dialog,
            get_app_data_dir,
            open_folder_path,
            get_hardware_id,
            check_license_status,
            activate_license_online,
            import_offline_license,
            deactivate_license
        ])
        .run(tauri::generate_context!())
        .expect("erreur lors du lancement de Chèque Studio");
}