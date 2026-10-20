import type { AppSettings } from "../types";

export const APP_SETTINGS_KEY = "cheque-studio-app-settings-v1";

export const DEFAULT_APP_SETTINGS: AppSettings = {
  // Montant en lettres
  letterCase: "sentence",
  currencyTextVariant: "dinars-algeriens",
  textSurroundSymbol: "none",
  zeroCentsMention: "none",

  // Montant en chiffres
  numericSecuritySymbol: "hash",
  numericCurrencySuffix: "none",
  decimalSeparator: "comma",

  // Valeurs par défaut du formulaire
  defaultPlace: "Alger",
  defaultIsCrossed: true
};

/**
 * Charge les paramètres de l'application depuis localStorage avec fallback vers les valeurs par défaut
 */
export function loadAppSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(APP_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_APP_SETTINGS, ...parsed };
    }
  } catch (err) {
    console.warn("Erreur lecture app settings:", err);
  }
  return DEFAULT_APP_SETTINGS;
}

/**
 * Enregistre les paramètres dans localStorage
 */
export function saveAppSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(settings));
  } catch (err) {
    console.error("Erreur sauvegarde app settings:", err);
  }
}

/**
 * Réinitialise les réglages par défaut
 */
export function resetAppSettings(): AppSettings {
  saveAppSettings(DEFAULT_APP_SETTINGS);
  return DEFAULT_APP_SETTINGS;
}

/**
 * Exporte une sauvegarde complète (Réglages + Modèles + Historique) sous forme de fichier JSON
 */
export function exportFullBackup(): void {
  try {
    const settings = loadAppSettings();
    const templatesRaw = localStorage.getItem("cheque-studio-models-config-v1");
    const historyRaw = localStorage.getItem("cheque-studio-history-v1");

    const backupData = {
      backupDate: new Date().toISOString(),
      appVersion: "0.1.0",
      settings,
      templates: templatesRaw ? JSON.parse(templatesRaw) : [],
      history: historyRaw ? JSON.parse(historyRaw) : []
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute(
      "download",
      `cheque-studio-backup-complet-${new Date().toISOString().split("T")[0]}.json`
    );
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  } catch (err) {
    console.error("Erreur lors de l'export du backup complet:", err);
  }
}
