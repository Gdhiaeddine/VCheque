import type { PrinterPreset, PrintSettings } from "../types";

export const PRINTER_PRESETS_KEY = "cheque-studio-printer-presets-v1";
export const LEGACY_PRINT_SETTINGS_KEY = "cheque-studio-print-settings-v1";

export const DEFAULT_PRINTER_PRESETS: PrinterPreset[] = [
  {
    id: "preset-standard-center",
    name: "Imprimante Standard (Centré)",
    paperFormat: "a4-portrait",
    placement: "center",
    offsetX: 0,
    offsetY: 0,
    rotation: 0,
    showBorderGuide: false,
    isDefault: true,
    notes: "Alimentation standard au centre de la feuille A4.",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  },
  {
    id: "preset-top-feed",
    name: "Bac Manuel Supérieur (Haut-Centre)",
    paperFormat: "a4-portrait",
    placement: "top-center",
    offsetX: 0,
    offsetY: 0,
    rotation: 0,
    showBorderGuide: false,
    isDefault: false,
    notes: "Insertion par le haut du bac feuille à feuille.",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  }
];

/**
 * Charge les profils d'imprimante depuis localStorage avec migration automatique
 */
export function loadPrinterPresets(): PrinterPreset[] {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(PRINTER_PRESETS_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }

    // Migration transparente si l'utilisateur possède déjà des printSettings personnalisés
    const legacyRaw = typeof localStorage !== "undefined" ? localStorage.getItem(LEGACY_PRINT_SETTINGS_KEY) : null;
    if (legacyRaw) {
      const legacySettings = JSON.parse(legacyRaw) as Partial<PrintSettings>;
      if (legacySettings && (legacySettings.offsetX !== undefined || legacySettings.placement !== undefined)) {
        const migratedPreset: PrinterPreset = {
          id: "preset-migrated-default",
          name: "Mon Imprimante Principale",
          paperFormat: legacySettings.paperFormat || "a4-portrait",
          placement: legacySettings.placement || "center",
          offsetX: legacySettings.offsetX ?? 0,
          offsetY: legacySettings.offsetY ?? 0,
          rotation: legacySettings.rotation ?? 0,
          showBorderGuide: Boolean(legacySettings.showBorderGuide),
          isDefault: true,
          notes: "Profil migré depuis vos réglages précédents.",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        const initialList = [migratedPreset, ...DEFAULT_PRINTER_PRESETS.slice(1)];
        savePrinterPresets(initialList);
        return initialList;
      }
    }
  } catch (err) {
    console.warn("Erreur lecture printer presets:", err);
  }

  // Fallback usine
  return DEFAULT_PRINTER_PRESETS;
}

/**
 * Enregistre la liste des profils dans localStorage
 */
export function savePrinterPresets(presets: PrinterPreset[]): PrinterPreset[] {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(PRINTER_PRESETS_KEY, JSON.stringify(presets));
    }
  } catch (err) {
    console.error("Erreur sauvegarde printer presets:", err);
  }
  return presets;
}

/**
 * Récupère le profil actif (marqué isDefault ou le premier de la liste)
 */
export function getActivePrinterPreset(presets?: PrinterPreset[]): PrinterPreset {
  const list = presets || loadPrinterPresets();
  const found = list.find((p) => p.isDefault);
  return found || list[0] || DEFAULT_PRINTER_PRESETS[0];
}

/**
 * Convertit un PrinterPreset en PrintSettings compatible avec le moteur d'impression
 */
export function presetToPrintSettings(preset: PrinterPreset): PrintSettings {
  return {
    paperFormat: preset.paperFormat,
    placement: preset.placement,
    offsetX: preset.offsetX,
    offsetY: preset.offsetY,
    rotation: preset.rotation,
    showBorderGuide: preset.showBorderGuide
  };
}

/**
 * Crée un nouveau profil à partir d'un objet PrintSettings
 */
export function createPresetFromSettings(
  name: string,
  settings: PrintSettings,
  isDefault: boolean = false,
  notes?: string,
  printerName?: string
): PrinterPreset {
  const now = new Date().toISOString();
  return {
    id: `preset-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    name: name.trim() || `Profil Imprimante ${new Date().toLocaleDateString("fr-FR")}`,
    printerName: printerName?.trim(),
    paperFormat: settings.paperFormat,
    placement: settings.placement,
    offsetX: settings.offsetX,
    offsetY: settings.offsetY,
    rotation: settings.rotation,
    showBorderGuide: settings.showBorderGuide,
    isDefault,
    notes: notes?.trim(),
    createdAt: now,
    updatedAt: now
  };
}

/**
 * Ajoute ou met à jour un profil d'imprimante
 */
export function upsertPrinterPreset(
  presetData: Partial<PrinterPreset> & { name: string },
  currentList?: PrinterPreset[]
): { presets: PrinterPreset[]; savedPreset: PrinterPreset } {
  const list = [...(currentList || loadPrinterPresets())];
  const now = new Date().toISOString();

  let targetId = presetData.id;
  const existingIndex = targetId ? list.findIndex((p) => p.id === targetId) : -1;

  let savedPreset: PrinterPreset;

  if (existingIndex >= 0) {
    savedPreset = {
      ...list[existingIndex],
      ...presetData,
      updatedAt: now
    };
    list[existingIndex] = savedPreset;
  } else {
    targetId = targetId || `preset-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    savedPreset = {
      id: targetId,
      name: presetData.name.trim(),
      printerName: presetData.printerName?.trim(),
      paperFormat: presetData.paperFormat || "a4-portrait",
      placement: presetData.placement || "center",
      offsetX: presetData.offsetX ?? 0,
      offsetY: presetData.offsetY ?? 0,
      rotation: presetData.rotation ?? 0,
      showBorderGuide: Boolean(presetData.showBorderGuide),
      isDefault: Boolean(presetData.isDefault),
      notes: presetData.notes?.trim(),
      createdAt: now,
      updatedAt: now
    };
    list.push(savedPreset);
  }

  // Si le nouveau/modifié est marqué par défaut, retirer le statut par défaut des autres
  if (savedPreset.isDefault) {
    list.forEach((p) => {
      if (p.id !== savedPreset.id) p.isDefault = false;
    });
  }

  savePrinterPresets(list);
  return { presets: list, savedPreset };
}

/**
 * Définit un profil comme étant le profil par défaut
 */
export function setDefaultPrinterPreset(id: string, currentList?: PrinterPreset[]): PrinterPreset[] {
  const list = (currentList || loadPrinterPresets()).map((p) => ({
    ...p,
    isDefault: p.id === id
  }));
  savePrinterPresets(list);
  return list;
}

/**
 * Supprime un profil d'imprimante (ne supprime pas s'il s'agit du seul profil restant)
 */
export function deletePrinterPreset(id: string, currentList?: PrinterPreset[]): { presets: PrinterPreset[]; success: boolean } {
  const list = currentList || loadPrinterPresets();
  if (list.length <= 1) {
    return { presets: list, success: false };
  }

  const filtered = list.filter((p) => p.id !== id);
  // Si le profil supprimé était par défaut, donner le statut au premier de la liste restante
  const wasDefault = list.find((p) => p.id === id)?.isDefault;
  if (wasDefault && filtered.length > 0) {
    filtered[0].isDefault = true;
  }

  savePrinterPresets(filtered);
  return { presets: filtered, success: true };
}
