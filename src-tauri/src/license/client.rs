use serde::{Deserialize, Serialize};

#[derive(Serialize)]
struct ActivationRequest<'a> {
    license_key: &'a str,
    machine_id: &'a str,
    machine_name: &'a str,
    os_info: &'a str,
    app_version: &'a str,
}

#[derive(Deserialize)]
struct ApiResponse<T> {
    success: bool,
    data: Option<T>,
    error: Option<String>,
    code: Option<String>,
}

#[derive(Deserialize)]
struct ActivationData {
    payload_b64: String,
    signature: String,
}

#[cfg(debug_assertions)]
const DEFAULT_SERVER_URL: &str = "http://localhost:8000/api/v1/license/activate";

#[cfg(not(debug_assertions))]
const DEFAULT_SERVER_URL: &str = "https://virtanis.net/api/v1/license/activate";

pub async fn perform_online_activation(
    license_key: &str,
    machine_id: &str,
    server_url_override: Option<&str>,
) -> Result<String, String> {
    let url = server_url_override.unwrap_or(DEFAULT_SERVER_URL);
    let computer_name = std::env::var("COMPUTERNAME").unwrap_or_else(|_| "PC-CLIENT".into());
    let os_info = std::env::consts::OS;

    let payload = ActivationRequest {
        license_key: license_key.trim(),
        machine_id: machine_id.trim(),
        machine_name: &computer_name,
        os_info,
        app_version: "1.0.0",
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(12))
        .build()
        .map_err(|e| format!("Erreur initialisation client HTTP: {}", e))?;

    let response = client
        .post(url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| {
            if e.is_connect() || e.is_timeout() {
                "Impossible de joindre le serveur d'activation. Vérifiez votre connexion Internet.".into()
            } else {
                format!("Erreur réseau lors de l'activation: {}", e)
            }
        })?;

    let status = response.status();
    let body_text = response
        .text()
        .await
        .map_err(|e| format!("Réponse illisible du serveur: {}", e))?;

    let parsed: ApiResponse<ActivationData> = serde_json::from_str(&body_text).map_err(|_| {
        format!(
            "Réponse serveur non reconnue (HTTP {}): {}",
            status.as_u16(),
            body_text
        )
    })?;

    if !parsed.success {
        let err_msg = parsed
            .error
            .unwrap_or_else(|| "Erreur inconnue lors de l'activation".into());
        let code = parsed.code.unwrap_or_default();

        if code == "ALREADY_ACTIVATED_ON_ANOTHER_PC" || status.as_u16() == 409 {
            return Err("Cette licence est déjà activée sur un autre PC. Veuillez contacter l'administrateur pour autoriser le transfert.".into());
        } else if code == "LICENSE_REVOKED" || status.as_u16() == 403 {
            return Err("Cette licence a été révoquée par l'administrateur.".into());
        } else if code == "LICENSE_NOT_FOUND" || status.as_u16() == 404 {
            return Err("Clé de licence invalide ou introuvable.".into());
        }

        return Err(err_msg);
    }

    let data = parsed
        .data
        .ok_or_else(|| "Aucune donnée de licence reçue du serveur.".to_string())?;

    // Construction du document JSON de licence locale
    let local_license = serde_json::json!({
        "payload_b64": data.payload_b64,
        "signature": data.signature,
        "installed_at": chrono_fallback_now(),
    });

    serde_json::to_string_pretty(&local_license)
        .map_err(|e| format!("Erreur formatage licence locale : {}", e))
}

fn chrono_fallback_now() -> String {
    // Timestamp basique sans dépendance externe
    format!("installed_{:?}", std::time::SystemTime::now())
}
