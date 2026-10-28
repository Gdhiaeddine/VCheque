import { invoke } from "@tauri-apps/api/core";

export interface LicensePayload {
  edition: string;
  issued_at: number;
  license_key: string;
  licensee_email: string;
  licensee_name: string;
  company?: string;
  machine_id: string;
  type: string;
  version: number;
}

export interface LicenseCheckResult {
  is_valid: boolean;
  status: "VALID" | "NOT_ACTIVATED" | "TAMPERED_OR_INVALID" | "MACHINE_MISMATCH" | "INTERNAL_ERROR" | string;
  message: string;
  machine_id: string;
  payload?: LicensePayload | null;
}

/**
 * Récupère l'empreinte matérielle unique du PC local.
 */
export async function getHardwareId(): Promise<string> {
  try {
    return await invoke<string>("get_hardware_id");
  } catch (err: any) {
    console.error("Erreur récupération hardware ID:", err);
    return "MATERIEL-INDETERMINE";
  }
}

/**
 * Vérifie le statut de la licence installée sur ce poste (vérification 100% hors-ligne).
 */
export async function checkLicenseStatus(): Promise<LicenseCheckResult> {
  try {
    return await invoke<LicenseCheckResult>("check_license_status");
  } catch (err: any) {
    console.error("Erreur vérification licence locale:", err);
    return {
      is_valid: false,
      status: "INTERNAL_ERROR",
      message: String(err?.message || err || "Erreur inconnue"),
      machine_id: "",
      payload: null,
    };
  }
}

/**
 * Active la licence en ligne auprès du serveur d'activation.
 */
export async function activateLicenseOnline(
  licenseKey: string,
  serverUrl?: string
): Promise<LicenseCheckResult> {
  return await invoke<LicenseCheckResult>("activate_license_online", {
    licenseKey: licenseKey.trim().toUpperCase(),
    serverUrl: serverUrl || null,
  });
}

/**
 * Importe et installe un fichier de licence signé hors ligne (.lic).
 */
export async function importOfflineLicense(licenseContent: string): Promise<LicenseCheckResult> {
  return await invoke<LicenseCheckResult>("import_offline_license", {
    licenseContent: licenseContent.trim(),
  });
}

/**
 * Désinstalle la licence locale.
 */
export async function deactivateLicense(): Promise<void> {
  await invoke("deactivate_license");
}
