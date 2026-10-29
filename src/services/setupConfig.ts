import { invoke } from "@tauri-apps/api/core";
import type { CompanyRecord, BankAccountRecord, UserRecord } from "../types";
import {
  saveCompanyRecord,
  setActiveCompanyId,
  saveBankAccount,
  saveUser,
  setActiveUser,
  getSecuritySettings,
  saveSecuritySettings,
  logAuditEvent,
  getDatabase
} from "./db";
import { generateSalt, hashPin } from "./security";
import { loadAppSettings, saveAppSettings } from "./appSettings";

export const SETUP_COMPLETED_KEY = "vcheque_setup_completed";
export const CUSTOM_DATA_DIR_KEY = "vcheque_custom_data_dir";

export interface InitialSetupData {
  dataDir: string;
  defaultPlace: string;
  autoBackupEnabled: boolean;
  company: {
    name: string;
    legalForm: string;
    nif?: string;
    nis?: string;
    rc?: string;
    articleImposition?: string;
    address?: string;
    phone?: string;
    email?: string;
    bank?: {
      bankName: string;
      accountNumber: string;
      templateId: string;
    };
  };
  admin: {
    displayName: string;
    username: string;
    pin: string;
    requirePinOnStartup: boolean;
  };
}

function isTauriEnvironment(): boolean {
  return typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__);
}

/**
 * Vérifie si l'application a déjà accompli l'assistant d'initialisation
 */
export function isSetupCompleted(): boolean {
  try {
    return localStorage.getItem(SETUP_COMPLETED_KEY) === "true";
  } catch {
    return false;
  }
}

/**
 * Marque l'initialisation comme terminée
 */
export function markSetupCompleted(): void {
  try {
    localStorage.setItem(SETUP_COMPLETED_KEY, "true");
  } catch (err) {
    console.warn("Erreur marquage setup completed:", err);
  }
}

/**
 * Réinitialise l'état d'initialisation (utile pour relancer l'assistant depuis les paramètres)
 */
export function resetSetupCompleted(): void {
  try {
    localStorage.removeItem(SETUP_COMPLETED_KEY);
  } catch {}
}

/**
 * Récupère le chemin du dossier de stockage des données (AppData ou chemin personnalisé)
 */
export async function getDataStoragePath(): Promise<string> {
  // 1. Vérifier si un chemin personnalisé a déjà été configuré
  try {
    const custom = localStorage.getItem(CUSTOM_DATA_DIR_KEY);
    if (custom && custom.trim().length > 0) {
      return custom.trim();
    }
  } catch {}

  // 2. Si environnement Tauri, demander le répertoire AppData standard
  if (isTauriEnvironment()) {
    try {
      const appData = await invoke<string>("get_app_data_dir");
      if (appData) return appData;
    } catch (err) {
      console.warn("Erreur get_app_data_dir Tauri:", err);
    }
  }

  // 3. Fallback standard Windows / Web
  return "C:\\Users\\AppData\\Roaming\\com.chequestudio.algerie";
}

/**
 * Ouvre le dialogue natif de sélection de dossier
 */
export async function pickFolderDialog(defaultPath?: string): Promise<string | null> {
  if (isTauriEnvironment()) {
    try {
      const res = await invoke<string | null>("pick_folder_dialog", { defaultPath: defaultPath || null });
      return res;
    } catch (err) {
      console.warn("Erreur pick_folder_dialog:", err);
    }
  }
  return null;
}

/**
 * Ouvre un répertoire dans l'Explorateur Windows
 */
export async function openFolder(folderPath: string): Promise<void> {
  if (isTauriEnvironment()) {
    try {
      await invoke("open_folder_path", { folderPath });
    } catch (err) {
      console.warn("Erreur open_folder_path:", err);
    }
  }
}

/**
 * Applique la configuration initiale au premier démarrage
 */
export async function applyInitialSetup(data: InitialSetupData): Promise<{
  company: CompanyRecord;
  admin: UserRecord;
}> {
  // 1. Mémoriser le dossier de données et les préférences d'application
  try {
    localStorage.setItem(CUSTOM_DATA_DIR_KEY, data.dataDir);
  } catch {}

  const currentSettings = loadAppSettings();
  saveAppSettings({
    ...currentSettings,
    defaultPlace: data.defaultPlace.trim() || "Alger"
  });

  // 2. Enregistrer la première entreprise
  const companyRecord: CompanyRecord = {
    id: `company-${Date.now()}`,
    name: data.company.name.trim(),
    legalForm: data.company.legalForm || "SARL",
    nif: data.company.nif?.trim() || undefined,
    nis: data.company.nis?.trim() || undefined,
    rc: data.company.rc?.trim() || undefined,
    articleImposition: data.company.articleImposition?.trim() || undefined,
    address: data.company.address?.trim() || undefined,
    phone: data.company.phone?.trim() || undefined,
    email: data.company.email?.trim() || undefined,
    isActive: true,
    createdAt: new Date().toISOString()
  };

  await saveCompanyRecord(companyRecord);
  setActiveCompanyId(companyRecord.id);

  // 3. Enregistrer le premier compte bancaire si renseigné
  if (data.company.bank && data.company.bank.accountNumber.trim()) {
    const bankAccount: BankAccountRecord = {
      id: `acc-${Date.now()}`,
      companyId: companyRecord.id,
      bankTemplateId: data.company.bank.templateId || "el-salam",
      label: `${data.company.bank.bankName.trim() || "Banque"} - Compte Principal`,
      ribOrIban: data.company.bank.accountNumber.trim(),
      balance: 0,
      currency: "DZD",
      isDefault: true,
      createdAt: new Date().toISOString()
    };
    await saveBankAccount(bankAccount);
  }

  // 4. Générer le sel et hacher le code PIN de l'Administrateur
  const pinClean = data.admin.pin.trim();
  let pinSalt = undefined;
  let pinHash = undefined;

  if (pinClean) {
    pinSalt = generateSalt();
    pinHash = await hashPin(pinClean, pinSalt);
  }

  const adminUser: UserRecord = {
    id: `user-admin-${Date.now()}`,
    username: data.admin.username.trim().toLowerCase() || "admin",
    displayName: data.admin.displayName.trim() || "Administrateur",
    role: "admin",
    roles: ["admin"],
    pinHash,
    pinSalt,
    isActive: true,
    createdAt: new Date().toISOString()
  };

  // 4.1 Purger le compte fictif par défaut 'user-admin-default' (Direction / Administrateur)
  try {
    const rawUsers = localStorage.getItem("cheque_app_users");
    if (rawUsers) {
      const parsed = JSON.parse(rawUsers);
      const filtered = parsed.filter((u: any) => u.id !== "user-admin-default");
      localStorage.setItem("cheque_app_users", JSON.stringify(filtered));
    }
  } catch {}

  const dbInstance = await getDatabase();
  if (dbInstance) {
    try {
      await dbInstance.execute(`DELETE FROM users WHERE id = 'user-admin-default';`);
    } catch {}
  }

  await saveUser(adminUser);
  setActiveUser(adminUser);

  // 5. Configurer les paramètres de sécurité
  const sec = getSecuritySettings();
  sec.isAuthEnabled = Boolean(data.admin.requirePinOnStartup);
  sec.autoBackupEnabled = Boolean(data.autoBackupEnabled);
  await saveSecuritySettings(sec);

  // 6. Consigner l'événement d'initialisation dans le grand journal d'audit
  await logAuditEvent(
    "system_init",
    "system",
    `Initialisation du système VCheque Studio effectuée pour l'entreprise "${companyRecord.name}" (${companyRecord.legalForm}) par l'administrateur "${adminUser.displayName}"`,
    {
      companyId: companyRecord.id,
      dataDir: data.dataDir,
      defaultPlace: data.defaultPlace
    }
  );

  // 7. Marquer le setup comme terminé
  markSetupCompleted();

  return {
    company: companyRecord,
    admin: adminUser
  };
}
