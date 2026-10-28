use base64::Engine;
use ed25519_dalek::{Signature, VerifyingKey};
use serde::{Deserialize, Serialize};

pub const EMBEDDED_PUBLIC_KEY_HEX: &str =
    "256f8f978f4e725ab3295771ea276be6918d1e6bb1262cbfc10ce2fadb7170ac";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicensePayload {
    pub edition: String,
    pub issued_at: i64,
    pub license_key: String,
    pub licensee_email: String,
    pub licensee_name: String,
    #[serde(default)]
    pub company: String,
    pub machine_id: String,
    #[serde(rename = "type")]
    pub license_type: String,
    #[serde(default = "default_version")]
    pub version: i32,
}

fn default_version() -> i32 {
    1
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicenseFile {
    pub payload_b64: String,
    pub signature: String,
    #[serde(default)]
    pub installed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicenseCheckResult {
    pub is_valid: bool,
    pub status: String, // VALID, NOT_ACTIVATED, TAMPERED_OR_INVALID, MACHINE_MISMATCH
    pub message: String,
    pub machine_id: String,
    pub payload: Option<LicensePayload>,
}

/// Vérifie l'authenticité cryptographique de la licence et sa correspondance matérielle.
pub fn verify_license_data(
    file_content: &str,
    current_machine_id: &str,
    override_public_key_hex: Option<&str>,
) -> LicenseCheckResult {
    let pubkey_hex = override_public_key_hex.unwrap_or(EMBEDDED_PUBLIC_KEY_HEX);

    let license_file: LicenseFile = match serde_json::from_str(file_content) {
        Ok(lf) => lf,
        Err(_) => {
            return LicenseCheckResult {
                is_valid: false,
                status: "TAMPERED_OR_INVALID".into(),
                message: "Format du fichier de licence corrompu ou illisible.".into(),
                machine_id: current_machine_id.into(),
                payload: None,
            }
        }
    };

    // 1. Décodage de la clé publique Ed25519
    let pubkey_bytes = match hex::decode(pubkey_hex) {
        Ok(bytes) if bytes.len() == 32 => {
            let mut arr = [0u8; 32];
            arr.copy_from_slice(&bytes);
            arr
        }
        _ => {
            return LicenseCheckResult {
                is_valid: false,
                status: "INTERNAL_ERROR".into(),
                message: "Clé publique de vérification invalide.".into(),
                machine_id: current_machine_id.into(),
                payload: None,
            }
        }
    };

    let verifying_key = match VerifyingKey::from_bytes(&pubkey_bytes) {
        Ok(k) => k,
        Err(_) => {
            return LicenseCheckResult {
                is_valid: false,
                status: "INTERNAL_ERROR".into(),
                message: "Échec d'initialisation de la clé publique Ed25519.".into(),
                machine_id: current_machine_id.into(),
                payload: None,
            }
        }
    };

    // 2. Décodage de la signature (64 octets hexadécimaux)
    let sig_bytes = match hex::decode(&license_file.signature) {
        Ok(bytes) if bytes.len() == 64 => {
            let mut arr = [0u8; 64];
            arr.copy_from_slice(&bytes);
            arr
        }
        _ => {
            return LicenseCheckResult {
                is_valid: false,
                status: "TAMPERED_OR_INVALID".into(),
                message: "Signature cryptographique invalide ou altérée.".into(),
                machine_id: current_machine_id.into(),
                payload: None,
            }
        }
    };

    let signature = Signature::from_bytes(&sig_bytes);

    // 3. Décodage base64 du payload canonique
    let payload_bytes = match base64::engine::general_purpose::STANDARD.decode(&license_file.payload_b64) {
        Ok(bytes) => bytes,
        Err(_) => {
            return LicenseCheckResult {
                is_valid: false,
                status: "TAMPERED_OR_INVALID".into(),
                message: "Payload de licence corrompu (base64 invalide).".into(),
                machine_id: current_machine_id.into(),
                payload: None,
            }
        }
    };

    // 4. Vérification stricte de la signature Ed25519
    if let Err(e) = verifying_key.verify_strict(&payload_bytes, &signature) {
        return LicenseCheckResult {
            is_valid: false,
            status: "TAMPERED_OR_INVALID".into(),
            message: format!("Signature Ed25519 invalide : licence contrefaite ou modifiée ({})", e),
            machine_id: current_machine_id.into(),
            payload: None,
        };
    }

    // 5. Désérialisation du payload vérifié
    let payload: LicensePayload = match serde_json::from_slice(&payload_bytes) {
        Ok(p) => p,
        Err(e) => {
            return LicenseCheckResult {
                is_valid: false,
                status: "TAMPERED_OR_INVALID".into(),
                message: format!("Payload de licence non conforme ({})", e),
                machine_id: current_machine_id.into(),
                payload: None,
            }
        }
    };

    // 6. Contrôle de liaison matérielle (Machine ID)
    let expected_machine_id = current_machine_id.trim().to_lowercase();
    let license_machine_id = payload.machine_id.trim().to_lowercase();

    if license_machine_id != expected_machine_id {
        return LicenseCheckResult {
            is_valid: false,
            status: "MACHINE_MISMATCH".into(),
            message: "Cette licence est liée à un autre PC. Un transfert administrateur est requis.".into(),
            machine_id: current_machine_id.into(),
            payload: Some(payload),
        };
    }

    // 7. Contrôle d'édition commerciale complète
    if payload.edition != "COMMERCIAL" {
        return LicenseCheckResult {
            is_valid: false,
            status: "INVALID_EDITION".into(),
            message: format!("Édition non reconnue: {}", payload.edition),
            machine_id: current_machine_id.into(),
            payload: Some(payload),
        };
    }

    // Licence 100% valide et conforme
    LicenseCheckResult {
        is_valid: true,
        status: "VALID".into(),
        message: "Licence commerciale permanente active et vérifiée.".into(),
        machine_id: current_machine_id.into(),
        payload: Some(payload),
    }
}
