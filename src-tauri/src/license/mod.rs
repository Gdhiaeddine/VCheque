pub mod client;
pub mod hardware;
pub mod storage;
pub mod verifier;

use tauri::AppHandle;
pub use verifier::{LicenseCheckResult, LicensePayload};

/// Obtient l'identifiant matériel unique de la machine locale.
pub fn get_hardware_id() -> Result<String, String> {
    hardware::get_machine_id()
}

/// Vérifie l'état de la licence installée sur ce poste.
pub fn check_license_status(app: &AppHandle) -> Result<LicenseCheckResult, String> {
    let machine_id = hardware::get_machine_id()?;

    let license_content = match storage::read_installed_license(app)? {
        Some(content) => content,
        None => {
            return Ok(LicenseCheckResult {
                is_valid: false,
                status: "NOT_ACTIVATED".into(),
                message: "Application non activée. Veuillez saisir votre clé de licence commerciale.".into(),
                machine_id,
                payload: None,
            });
        }
    };

    Ok(verifier::verify_license_data(&license_content, &machine_id, None))
}

/// Active la licence par Internet et l'enregistre localement.
pub async fn activate_license_online(
    app: &AppHandle,
    license_key: &str,
    server_url: Option<&str>,
) -> Result<LicenseCheckResult, String> {
    let machine_id = hardware::get_machine_id()?;

    let license_json = client::perform_online_activation(license_key, &machine_id, server_url).await?;

    // Valider avant de sauvegarder
    let check = verifier::verify_license_data(&license_json, &machine_id, None);
    if !check.is_valid {
        return Err(format!("Validation de la licence reçue échouée: {}", check.message));
    }

    storage::save_license_data(app, &license_json)?;

    Ok(check)
}

/// Importe un fichier de licence signé hors-ligne (.lic) et l'enregistre localement.
pub fn import_offline_license(
    app: &AppHandle,
    license_content: &str,
) -> Result<LicenseCheckResult, String> {
    let machine_id = hardware::get_machine_id()?;

    let check = verifier::verify_license_data(license_content, &machine_id, None);
    if !check.is_valid {
        return Err(format!("Fichier de licence invalide: {}", check.message));
    }

    storage::save_license_data(app, license_content)?;

    Ok(check)
}

/// Supprime la licence locale.
pub fn deactivate_license(app: &AppHandle) -> Result<(), String> {
    storage::remove_installed_license(app)
}

#[cfg(test)]
mod tests {
    use super::verifier::*;
    use base64::Engine;
    use ed25519_dalek::{Signer, SigningKey};

    #[test]
    fn test_valid_ed25519_license_passes_verification() {
        let seed = [7u8; 32];
        let signing_key = SigningKey::from_bytes(&seed);
        let verifying_key = signing_key.verifying_key();
        let pubkey_hex = hex::encode(verifying_key.as_bytes());

        let machine_id = "test-machine-id-123456789";

        let canonical_payload = format!(
            r#"{{"edition":"COMMERCIAL","issued_at":1730124000,"license_key":"VCHQ-TEST-1234","licensee_email":"test@dz.com","licensee_name":"Test User","machine_id":"{}","type":"PERMANENT","version":1}}"#,
            machine_id
        );

        let signature = signing_key.sign(canonical_payload.as_bytes());
        let signature_hex = hex::encode(signature.to_bytes());
        let payload_b64 = base64::engine::general_purpose::STANDARD.encode(canonical_payload.as_bytes());

        let license_file_content = serde_json::json!({
            "payload_b64": payload_b64,
            "signature": signature_hex,
            "installed_at": "2026-10-28T14:00:00Z"
        }).to_string();

        let result = verify_license_data(&license_file_content, machine_id, Some(&pubkey_hex));
        assert!(result.is_valid, "La licence valide doit être acceptée");
        assert_eq!(result.status, "VALID");
        assert_eq!(result.payload.unwrap().licensee_name, "Test User");
    }

    #[test]
    fn test_tampered_payload_is_rejected() {
        let seed = [9u8; 32];
        let signing_key = SigningKey::from_bytes(&seed);
        let verifying_key = signing_key.verifying_key();
        let pubkey_hex = hex::encode(verifying_key.as_bytes());

        let machine_id = "test-machine-id-123456789";

        let canonical_payload = format!(
            r#"{{"edition":"COMMERCIAL","issued_at":1730124000,"license_key":"VCHQ-TEST-1234","licensee_email":"test@dz.com","licensee_name":"Original User","machine_id":"{}","type":"PERMANENT","version":1}}"#,
            machine_id
        );

        let signature = signing_key.sign(canonical_payload.as_bytes());
        let signature_hex = hex::encode(signature.to_bytes());

        // Altération d'un seul mot dans le payload
        let tampered_payload = format!(
            r#"{{"edition":"COMMERCIAL","issued_at":1730124000,"license_key":"VCHQ-TEST-1234","licensee_email":"test@dz.com","licensee_name":"Pirate User","machine_id":"{}","type":"PERMANENT","version":1}}"#,
            machine_id
        );
        let tampered_b64 = base64::engine::general_purpose::STANDARD.encode(tampered_payload.as_bytes());

        let license_file_content = serde_json::json!({
            "payload_b64": tampered_b64,
            "signature": signature_hex,
            "installed_at": "2026-10-28T14:00:00Z"
        }).to_string();

        let result = verify_license_data(&license_file_content, machine_id, Some(&pubkey_hex));
        assert!(!result.is_valid, "Le payload altéré doit être rejeté");
        assert_eq!(result.status, "TAMPERED_OR_INVALID");
    }

    #[test]
    fn test_copied_license_to_other_pc_fails_machine_mismatch() {
        let seed = [11u8; 32];
        let signing_key = SigningKey::from_bytes(&seed);
        let verifying_key = signing_key.verifying_key();
        let pubkey_hex = hex::encode(verifying_key.as_bytes());

        let original_pc = "pc-original-11111";
        let other_pc = "pc-stolen-22222";

        let canonical_payload = format!(
            r#"{{"edition":"COMMERCIAL","issued_at":1730124000,"license_key":"VCHQ-TEST-1234","licensee_email":"test@dz.com","licensee_name":"Legit User","machine_id":"{}","type":"PERMANENT","version":1}}"#,
            original_pc
        );

        let signature = signing_key.sign(canonical_payload.as_bytes());
        let signature_hex = hex::encode(signature.to_bytes());
        let payload_b64 = base64::engine::general_purpose::STANDARD.encode(canonical_payload.as_bytes());

        let license_file_content = serde_json::json!({
            "payload_b64": payload_b64,
            "signature": signature_hex,
            "installed_at": "2026-10-28T14:00:00Z"
        }).to_string();

        // Tentative de vérification sur l'autre PC
        let result = verify_license_data(&license_file_content, other_pc, Some(&pubkey_hex));
        assert!(!result.is_valid, "La licence copiée sur un autre PC doit être rejetée");
        assert_eq!(result.status, "MACHINE_MISMATCH");
    }
}
