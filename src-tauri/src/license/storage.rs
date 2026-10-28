use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const LICENSE_FILENAME: &str = "cheque-studio-license.lic";

pub fn get_license_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .or_else(|_| app.path().app_config_dir())
        .map_err(|e| format!("Impossible de déterminer le dossier de données : {}", e))?;

    fs::create_dir_all(&app_dir)
        .map_err(|e| format!("Impossible de créer le dossier de configuration : {}", e))?;

    Ok(app_dir.join(LICENSE_FILENAME))
}

pub fn read_installed_license(app: &AppHandle) -> Result<Option<String>, String> {
    let path = get_license_file_path(app)?;
    if !path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Erreur lors de la lecture du fichier de licence : {}", e))?;

    Ok(Some(content))
}

pub fn save_license_data(app: &AppHandle, content: &str) -> Result<PathBuf, String> {
    let path = get_license_file_path(app)?;
    fs::write(&path, content)
        .map_err(|e| format!("Erreur lors de l'enregistrement de la licence : {}", e))?;

    Ok(path)
}

pub fn remove_installed_license(app: &AppHandle) -> Result<(), String> {
    let path = get_license_file_path(app)?;
    if path.exists() {
        fs::remove_file(&path)
            .map_err(|e| format!("Erreur lors de la suppression de la licence : {}", e))?;
    }
    Ok(())
}
