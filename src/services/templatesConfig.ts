import { invoke } from "@tauri-apps/api/core";
import type { BankTemplate } from "../types";
import { defaultBankTemplates } from "../banksData";

export const LOCAL_TEMPLATES_KEY = "cheque-studio-models-config-v1";

function isTauriEnvironment(): boolean {
  return typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__);
}

/**
 * Charge les modèles bancaires depuis le fichier de configuration physique JSON (ex: cheque-templates.json)
 */
export async function loadTemplatesFromConfigFile(): Promise<BankTemplate[]> {
  if (isTauriEnvironment()) {
    try {
      const rawContent = await invoke<string>("load_templates_config");
      if (rawContent && rawContent.trim().length > 0) {
        const parsed: BankTemplate[] = JSON.parse(rawContent);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Fusion intelligente : ajoute automatiquement tous les nouveaux modèles officiels de banques
          const existingIds = new Set(parsed.map((p) => p.id));
          const missingDefaults = defaultBankTemplates.filter((def) => !existingIds.has(def.id));

          // Met également à jour backgroundImage pour les modèles qui n'avaient pas encore leur scan officiel
          const updatedParsed = parsed.map((item) => {
            const def = defaultBankTemplates.find((d) => d.id === item.id);
            if (def && (!item.backgroundImage || item.backgroundImage.includes("/src/assets/"))) {
              return { ...item, backgroundImage: def.backgroundImage };
            }
            return item;
          });

          if (missingDefaults.length > 0 || updatedParsed.some((item, idx) => item.backgroundImage !== parsed[idx].backgroundImage)) {
            const merged = [...updatedParsed, ...missingDefaults];
            const updatedJson = JSON.stringify(merged, null, 2);
            await invoke<string>("save_templates_config", { content: updatedJson }).catch(console.error);
            localStorage.setItem(LOCAL_TEMPLATES_KEY, updatedJson);
            return merged;
          }

          localStorage.setItem(LOCAL_TEMPLATES_KEY, JSON.stringify(parsed));
          return parsed;
        }
      }

      // Si le fichier n'existe pas encore ou est vide, sauvegarder tous les modèles par défaut dans le fichier
      const initialJson = JSON.stringify(defaultBankTemplates, null, 2);
      await invoke<string>("save_templates_config", { content: initialJson });
      localStorage.setItem(LOCAL_TEMPLATES_KEY, initialJson);
      return defaultBankTemplates;
    } catch (err) {
      console.warn("Erreur lecture fichier configuration Tauri, fallback localStorage:", err);
    }
  }

  // Fallback mode web / navigateur
  try {
    const saved = localStorage.getItem(LOCAL_TEMPLATES_KEY);
    if (saved) {
      const parsed: BankTemplate[] = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const existingIds = new Set(parsed.map((p) => p.id));
        const missingDefaults = defaultBankTemplates.filter((def) => !existingIds.has(def.id));
        const updatedParsed = parsed.map((item) => {
          const def = defaultBankTemplates.find((d) => d.id === item.id);
          if (def && (!item.backgroundImage || item.backgroundImage.includes("/src/assets/"))) {
            return { ...item, backgroundImage: def.backgroundImage };
          }
          return item;
        });
        if (missingDefaults.length > 0) {
          const merged = [...updatedParsed, ...missingDefaults];
          localStorage.setItem(LOCAL_TEMPLATES_KEY, JSON.stringify(merged));
          return merged;
        }
        return parsed;
      }
    }
  } catch {}

  return defaultBankTemplates;
}

/**
 * Enregistre les modèles bancaires dans le fichier de configuration JSON (formaté avec indentation pour être facilement lisible et copiable)
 */
export async function saveTemplatesToConfigFile(templates: BankTemplate[]): Promise<string> {
  const formattedJson = JSON.stringify(templates, null, 2);

  // Mettre à jour le cache local
  try {
    localStorage.setItem(LOCAL_TEMPLATES_KEY, formattedJson);
  } catch {}

  if (isTauriEnvironment()) {
    try {
      const savedPath = await invoke<string>("save_templates_config", { content: formattedJson });
      return savedPath;
    } catch (err) {
      console.error("Erreur écriture fichier configuration Tauri:", err);
      throw err;
    }
  }

  return "localStorage (Navigateur Web)";
}

/**
 * Récupère le chemin absolu du fichier de configuration sur le disque de l'utilisateur
 */
export async function getConfigFilePath(): Promise<string> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<string>("get_templates_config_path");
    } catch (err) {
      console.error("Erreur récupération chemin config:", err);
    }
  }
  return "Fichier interne (Navigateur)";
}

/**
 * Ouvre le dossier contenant le fichier de configuration dans l'Explorateur de fichiers de Windows
 */
export async function openConfigFileFolder(): Promise<void> {
  if (isTauriEnvironment()) {
    try {
      await invoke("open_templates_config_folder");
    } catch (err) {
      console.error("Erreur ouverture dossier config:", err);
    }
  }
}

/**
 * Télécharge une copie du fichier de configuration JSON (Export direct)
 */
export function exportTemplatesFile(templates: BankTemplate[]): void {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(templates, null, 2));
  const downloadAnchor = document.createElement("a");
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `cheque-templates-export-${new Date().toISOString().split("T")[0]}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}
