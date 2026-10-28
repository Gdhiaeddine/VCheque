use sha2::{Digest, Sha256};

const SALT: &str = "VCHEQUE-HARDWARE-SALT-2026-PERMANENT";

/// Calcule l'empreinte matérielle unique et stable de la machine.
/// Sous Windows, s'appuie sur la clé de registre immuable MachineGuid
/// combinée au nom de machine et au sel cryptographique applicatif.
pub fn get_machine_id() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::HKEY_LOCAL_MACHINE;
        use winreg::RegKey;

        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        let crypto_key = hklm
            .open_subkey("SOFTWARE\\Microsoft\\Cryptography")
            .map_err(|e| format!("Impossible d'accéder au registre Windows Cryptography: {}", e))?;

        let machine_guid: String = crypto_key
            .get_value("MachineGuid")
            .map_err(|e| format!("MachineGuid introuvable dans le registre: {}", e))?;

        let computer_name = std::env::var("COMPUTERNAME").unwrap_or_else(|_| "DESKTOP-PC".into());

        let mut hasher = Sha256::new();
        hasher.update(SALT.as_bytes());
        hasher.update(machine_guid.trim().as_bytes());
        hasher.update(computer_name.trim().as_bytes());

        let result = hex::encode(hasher.finalize());
        Ok(result)
    }

    #[cfg(not(target_os = "windows"))]
    {
        let hostname = std::env::var("HOSTNAME")
            .or_else(|_| std::env::var("USER"))
            .unwrap_or_else(|_| "DEV-FALLBACK".into());

        let mut hasher = Sha256::new();
        hasher.update(SALT.as_bytes());
        hasher.update(hostname.as_bytes());

        Ok(hex::encode(hasher.finalize()))
    }
}
