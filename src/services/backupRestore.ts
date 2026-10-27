import type { BackupArchive } from "../types";
import { computeSha256Checksum, verifyBackupIntegrity } from "./security";
import { saveExportFile } from "./exportReports";
import {
  HISTORIQUE_STORAGE_KEY,
  BENEFICIARIES_STORAGE_KEY,
  COMPANIES_STORAGE_KEY,
  BANK_ACCOUNTS_STORAGE_KEY,
  CHEQUE_BOOKS_STORAGE_KEY,
  ATTACHMENTS_STORAGE_KEY,
  BANK_STATEMENTS_STORAGE_KEY,
  BANK_STATEMENT_LINES_STORAGE_KEY,
  getDatabase,
  getActiveCompanyId,
  logAuditEvent
} from "./db";
import { loadAppSettings, APP_SETTINGS_KEY } from "./appSettings";

export const SECURITY_SETTINGS_KEY = "cheque-studio-security-settings-v1";
export const USERS_STORAGE_KEY = "cheque-studio-users-v1";
export const AUDIT_LOGS_STORAGE_KEY = "cheque-studio-audit-logs-v1";

/**
 * Génère et exporte une archive de sauvegarde complète certifiée avec signature SHA-256
 */
export async function createCertifiedBackup(companyId?: string): Promise<{
  success: boolean;
  filename?: string;
  filePath?: string;
  error?: string;
}> {
  try {
    const compId = companyId || getActiveCompanyId();
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `VCheque_Sauvegarde_Certifiee_${timestamp}.vcbk`;

    // 1. Collecte des données de chaque table (LocalStorage + SQLite)
    const getLocal = (key: string) => {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : [];
      } catch {
        return [];
      }
    };

    const companies = getLocal(COMPANIES_STORAGE_KEY);
    const bankAccounts = getLocal(BANK_ACCOUNTS_STORAGE_KEY);
    const chequeBooks = getLocal(CHEQUE_BOOKS_STORAGE_KEY);
    const cheques = getLocal(HISTORIQUE_STORAGE_KEY);
    const beneficiaries = getLocal(BENEFICIARIES_STORAGE_KEY);
    const attachments = getLocal(ATTACHMENTS_STORAGE_KEY);
    const bankStatements = getLocal(BANK_STATEMENTS_STORAGE_KEY);
    const bankStatementLines = getLocal(BANK_STATEMENT_LINES_STORAGE_KEY);
    const auditLogs = getLocal(AUDIT_LOGS_STORAGE_KEY);
    const users = getLocal(USERS_STORAGE_KEY);

    let securitySettings;
    try {
      const rawSec = localStorage.getItem(SECURITY_SETTINGS_KEY);
      securitySettings = rawSec ? JSON.parse(rawSec) : undefined;
    } catch {}

    const settings = loadAppSettings();

    // 2. Assemblage du payload
    const payload = {
      companies,
      bankAccounts,
      chequeBooks,
      cheques,
      beneficiaries,
      attachments,
      bankStatements,
      bankStatementLines,
      auditLogs,
      settings,
      securitySettings,
      users
    };

    // 3. Calcul de l'empreinte cryptographique SHA-256
    const payloadString = JSON.stringify(payload);
    const checksumSha256 = await computeSha256Checksum(payloadString);

    const archive: BackupArchive = {
      app: "VCheque Studio",
      version: "1.0.0",
      backupDate: new Date().toISOString(),
      companyId: compId,
      checksumSha256,
      payload
    };

    const archiveJson = JSON.stringify(archive, null, 2);
    const encoder = new TextEncoder();
    const bytes = encoder.encode(archiveJson);

    // 4. Enregistrement natif via dialogue de sauvegarde
    const result = await saveExportFile({
      defaultFilename: filename,
      filterName: "Sauvegarde Certifiée VCheque (*.vcbk, *.json)",
      filterExt: "vcbk",
      mimeType: "application/json",
      bytes
    });

    if (result.success) {
      await logAuditEvent(
        "backup_export",
        "backup",
        `Sauvegarde complète certifiée exportée (${filename}) - Checksum: ${checksumSha256.substring(0, 12)}...`
      );
    }

    return result;
  } catch (err: any) {
    console.error("Erreur création sauvegarde certifiée:", err);
    return {
      success: false,
      error: err.message || "Erreur lors de la création du fichier de sauvegarde."
    };
  }
}

/**
 * Analyse un fichier de sauvegarde sélectionné et vérifie son intégrité
 */
export async function inspectBackupFile(file: File): Promise<{
  valid: boolean;
  checksumMatch: boolean;
  archive?: BackupArchive;
  previewCounts?: Record<string, number>;
  error?: string;
}> {
  try {
    const text = await file.text();
    const result = await verifyBackupIntegrity(text);

    if (!result.valid || !result.archive) {
      return {
        valid: false,
        checksumMatch: false,
        error: result.error
      };
    }

    const p = result.archive.payload;
    const previewCounts = {
      cheques: p.cheques?.length || 0,
      bankAccounts: p.bankAccounts?.length || 0,
      chequeBooks: p.chequeBooks?.length || 0,
      beneficiaries: p.beneficiaries?.length || 0,
      attachments: p.attachments?.length || 0,
      bankStatements: p.bankStatements?.length || 0,
      auditLogs: p.auditLogs?.length || 0
    };

    return {
      valid: true,
      checksumMatch: true,
      archive: result.archive,
      previewCounts
    };
  } catch (err: any) {
    return {
      valid: false,
      checksumMatch: false,
      error: `Impossible de lire le fichier : ${err.message}`
    };
  }
}

/**
 * Restaure l'ensemble des données depuis une archive vérifiée
 */
export async function restoreCertifiedBackup(
  archive: BackupArchive,
  mode: "replace" | "merge" = "replace"
): Promise<{ success: boolean; countRestored: number; error?: string }> {
  try {
    const p = archive.payload;
    let countRestored = 0;

    // 1. Restauration des stores LocalStorage
    if (mode === "replace") {
      if (p.companies) localStorage.setItem(COMPANIES_STORAGE_KEY, JSON.stringify(p.companies));
      if (p.bankAccounts) localStorage.setItem(BANK_ACCOUNTS_STORAGE_KEY, JSON.stringify(p.bankAccounts));
      if (p.chequeBooks) localStorage.setItem(CHEQUE_BOOKS_STORAGE_KEY, JSON.stringify(p.chequeBooks));
      if (p.cheques) {
        localStorage.setItem(HISTORIQUE_STORAGE_KEY, JSON.stringify(p.cheques));
        countRestored += p.cheques.length;
      }
      if (p.beneficiaries) localStorage.setItem(BENEFICIARIES_STORAGE_KEY, JSON.stringify(p.beneficiaries));
      if (p.attachments) localStorage.setItem(ATTACHMENTS_STORAGE_KEY, JSON.stringify(p.attachments));
      if (p.bankStatements) localStorage.setItem(BANK_STATEMENTS_STORAGE_KEY, JSON.stringify(p.bankStatements));
      if (p.bankStatementLines) localStorage.setItem(BANK_STATEMENT_LINES_STORAGE_KEY, JSON.stringify(p.bankStatementLines));
      if (p.settings) localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(p.settings));
      if (p.securitySettings) localStorage.setItem(SECURITY_SETTINGS_KEY, JSON.stringify(p.securitySettings));
      if (p.users) localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(p.users));
    } else {
      // Mode Fusion (Merge)
      const mergeTable = (key: string, incomingList: any[] = []) => {
        try {
          const raw = localStorage.getItem(key);
          const current: any[] = raw ? JSON.parse(raw) : [];
          const existingIds = new Set(current.map((item) => item.id));
          for (const item of incomingList) {
            if (!existingIds.has(item.id)) {
              current.push(item);
            }
          }
          localStorage.setItem(key, JSON.stringify(current));
        } catch {}
      };

      mergeTable(COMPANIES_STORAGE_KEY, p.companies);
      mergeTable(BANK_ACCOUNTS_STORAGE_KEY, p.bankAccounts);
      mergeTable(CHEQUE_BOOKS_STORAGE_KEY, p.chequeBooks);
      mergeTable(HISTORIQUE_STORAGE_KEY, p.cheques);
      mergeTable(BENEFICIARIES_STORAGE_KEY, p.beneficiaries);
      mergeTable(ATTACHMENTS_STORAGE_KEY, p.attachments);
      mergeTable(BANK_STATEMENTS_STORAGE_KEY, p.bankStatements);
      mergeTable(BANK_STATEMENT_LINES_STORAGE_KEY, p.bankStatementLines);
      countRestored += p.cheques?.length || 0;
    }

    // 2. Synchronisation SQLite si disponible
    const db = await getDatabase();
    if (db) {
      try {
        if (mode === "replace") {
          await db.execute(`DELETE FROM cheques;`);
          await db.execute(`DELETE FROM bank_accounts;`);
          await db.execute(`DELETE FROM cheque_books;`);
          await db.execute(`DELETE FROM beneficiaries;`);
          await db.execute(`DELETE FROM cheque_attachments;`);
          await db.execute(`DELETE FROM bank_statement_lines;`);
          await db.execute(`DELETE FROM bank_statements;`);
        }

        // Réinjection des chèques
        if (p.cheques && p.cheques.length > 0) {
          for (const c of p.cheques) {
            await db.execute(
              `INSERT OR REPLACE INTO cheques (
                id, company_id, account_id, cheque_book_id, amount, raw_amount, beneficiary,
                place, date, cheque_number, reference, status, created_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13);`,
              [
                c.id,
                c.companyId || "company-default",
                c.accountId || null,
                c.chequeBookId || null,
                c.amount,
                c.amount,
                c.beneficiary,
                c.place,
                c.date,
                c.chequeNumber || null,
                c.reference || null,
                c.status,
                c.createdAt
              ]
            );
          }
        }
      } catch (sqlErr) {
        console.warn("Avertissement synchro SQLite lors de la restauration:", sqlErr);
      }
    }

    // 3. Journalisation de l'événement d'audit
    await logAuditEvent(
      "backup_restore",
      "backup",
      `Restauration complète effectuée (${mode === "replace" ? "Remplacement total" : "Fusion"}) - ${countRestored} chèque(s) rétabli(s).`
    );

    return {
      success: true,
      countRestored
    };
  } catch (err: any) {
    console.error("Erreur restauration sauvegarde:", err);
    return {
      success: false,
      countRestored: 0,
      error: err.message || "Erreur lors de la restauration de la base."
    };
  }
}
