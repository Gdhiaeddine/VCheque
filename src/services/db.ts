import Database from "@tauri-apps/plugin-sql";
import type { ChequeRecord, ChequeStatus, BeneficiaryRecord, PrintAttemptRecord, PrintAttemptStatus } from "../types";

export const HISTORIQUE_STORAGE_KEY = "cheque-studio-history-v1";
export const BENEFICIARIES_STORAGE_KEY = "cheque-studio-beneficiaries-v1";
export const PRINT_LOGS_STORAGE_KEY = "cheque-studio-print-logs-v1";
const DB_PATH = "sqlite:cheques.db";

let dbInstance: Database | null = null;
let isDbInitialized = false;

// Vérifier si nous tournons dans un environnement Tauri actif
function isTauriEnvironment(): boolean {
  return typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__);
}

export interface GetChequesParams {
  page: number; // 1-indexé
  pageSize: number;
  searchQuery?: string;
  statusFilter?: "all" | ChequeStatus;
}

export interface HistoryStats {
  totalCount: number;
  totalAmountFormatted: string;
  printedCount: number;
  savedCount: number;
}

export interface GetBeneficiariesParams {
  page: number; // 1-indexé
  pageSize: number;
  searchQuery?: string;
}

export interface BeneficiaryStats {
  totalCount: number;
  mostUsedName: string;
  mostUsedCount: number;
}

export interface BeneficiaryPaginatedResult {
  items: BeneficiaryRecord[];
  totalCount: number;
  totalPages: number;
  currentPage: number;
  pageSize: number;
  stats: BeneficiaryStats;
}

export interface PaginatedResult<T> {
  items: T[];
  totalCount: number;
  totalPages: number;
  currentPage: number;
  pageSize: number;
  stats: HistoryStats;
}

/**
 * Initialise la connexion SQLite et crée les tables et index
 */
export async function getDatabase(): Promise<Database | null> {
  if (!isTauriEnvironment()) {
    return null; // Fallback mode navigateur
  }

  if (dbInstance && isDbInitialized) {
    return dbInstance;
  }

  try {
    dbInstance = await Database.load(DB_PATH);

    // 1. Créer la table si elle n'existe pas
    await dbInstance.execute(`
      CREATE TABLE IF NOT EXISTS cheques (
        id TEXT PRIMARY KEY,
        amount TEXT NOT NULL,
        amount_numeric REAL NOT NULL,
        beneficiary TEXT NOT NULL,
        place TEXT NOT NULL,
        date TEXT NOT NULL,
        cheque_number TEXT,
        bank_template_id TEXT NOT NULL,
        bank_name TEXT NOT NULL,
        status TEXT NOT NULL,
        is_crossed INTEGER DEFAULT 1,
        crossed_with_text INTEGER DEFAULT 1,
        print_count INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT,
        printed_at TEXT,
        last_printed_at TEXT
      );
    `);

    try {
      await dbInstance.execute(`ALTER TABLE cheques ADD COLUMN is_crossed INTEGER DEFAULT 1;`);
    } catch {}
    try {
      await dbInstance.execute(`ALTER TABLE cheques ADD COLUMN crossed_with_text INTEGER DEFAULT 1;`);
    } catch {}
    try {
      await dbInstance.execute(`ALTER TABLE cheques ADD COLUMN print_count INTEGER DEFAULT 0;`);
    } catch {}
    try {
      await dbInstance.execute(`ALTER TABLE cheques ADD COLUMN last_printed_at TEXT;`);
    } catch {}
    try {
      await dbInstance.execute(`ALTER TABLE cheques ADD COLUMN show_cheque_number INTEGER DEFAULT 0;`);
    } catch {}

    // 2. Index pour accélérer le tri et la pagination
    await dbInstance.execute(`CREATE INDEX IF NOT EXISTS idx_cheques_created_at ON cheques(created_at DESC);`);
    await dbInstance.execute(`CREATE INDEX IF NOT EXISTS idx_cheques_status ON cheques(status);`);
    await dbInstance.execute(`CREATE INDEX IF NOT EXISTS idx_cheques_beneficiary ON cheques(beneficiary);`);

    // 3. Table des bénéficiaires et index pour saisie semi-automatique rapide
    await dbInstance.execute(`
      CREATE TABLE IF NOT EXISTS beneficiaries (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        nickname TEXT,
        phone TEXT,
        note TEXT,
        usage_count INTEGER DEFAULT 1,
        last_used_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT
      );
    `);
    await dbInstance.execute(`CREATE INDEX IF NOT EXISTS idx_beneficiaries_name ON beneficiaries(name);`);
    await dbInstance.execute(`CREATE INDEX IF NOT EXISTS idx_beneficiaries_usage ON beneficiaries(usage_count DESC, last_used_at DESC);`);

    // 4. Table des journaux d'audit d'impression
    await dbInstance.execute(`
      CREATE TABLE IF NOT EXISTS print_logs (
        id TEXT PRIMARY KEY,
        cheque_id TEXT NOT NULL,
        beneficiary TEXT NOT NULL,
        amount TEXT NOT NULL,
        bank_name TEXT NOT NULL,
        bank_template_id TEXT NOT NULL,
        paper_format TEXT,
        placement TEXT,
        status TEXT NOT NULL,
        attempted_at TEXT NOT NULL,
        confirmed_at TEXT,
        failure_reason TEXT,
        copy_number INTEGER DEFAULT 1
      );
    `);
    await dbInstance.execute(`CREATE INDEX IF NOT EXISTS idx_print_logs_cheque ON print_logs(cheque_id);`);
    await dbInstance.execute(`CREATE INDEX IF NOT EXISTS idx_print_logs_date ON print_logs(attempted_at DESC);`);

    // 5. Migration transparente depuis localStorage si les tables SQLite sont vides
    await migrateFromLocalStorageIfEmpty(dbInstance);
    await migrateBeneficiariesIfEmpty(dbInstance);

    isDbInitialized = true;
    return dbInstance;
  } catch (error) {
    console.warn("Impossible d'initialiser SQLite (fallback localStorage):", error);
    dbInstance = null;
    return null;
  }
}

/**
 * Migration automatique depuis localStorage vers SQLite
 */
async function migrateFromLocalStorageIfEmpty(db: Database): Promise<void> {
  try {
    const existingCountResult = await db.select<{ count: number }[]>("SELECT COUNT(*) as count FROM cheques;");
    const count = existingCountResult[0]?.count ?? 0;

    if (count === 0) {
      const rawLocal = localStorage.getItem(HISTORIQUE_STORAGE_KEY);
      if (rawLocal) {
        const parsed: ChequeRecord[] = JSON.parse(rawLocal);
        if (Array.isArray(parsed) && parsed.length > 0) {
          for (const item of parsed) {
            const rawVal = parseFloat((item.amount || "0").replace(/\s/g, "").replace(",", ".")) || 0;
            await db.execute(
              `INSERT OR REPLACE INTO cheques (
                id, amount, amount_numeric, beneficiary, place, date, cheque_number,
                bank_template_id, bank_name, status, is_crossed, created_at, updated_at, printed_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14);`,
              [
                item.id,
                item.amount,
                rawVal,
                item.beneficiary,
                item.place,
                item.date,
                item.chequeNumber || null,
                item.bankTemplateId,
                item.bankName,
                item.status,
                item.isCrossed !== false ? 1 : 0,
                item.createdAt,
                item.updatedAt || null,
                item.printedAt || null
              ]
            );
          }
          console.info(`[Chèque Studio] Migration réussie : ${parsed.length} chèques importés dans SQLite.`);
        }
      }
    }
  } catch (err) {
    console.error("Erreur lors de la migration automatique vers SQLite:", err);
  }
}

/**
 * Migration / Initialisation automatique des bénéficiaires depuis l'historique des chèques
 */
async function migrateBeneficiariesIfEmpty(db: Database): Promise<void> {
  try {
    const existingCountResult = await db.select<{ count: number }[]>("SELECT COUNT(*) as count FROM beneficiaries;");
    const count = existingCountResult[0]?.count ?? 0;

    if (count === 0) {
      // 1. Chercher dans les chèques SQLite
      const chequeRows = await db.select<{ beneficiary: string; usage_count: number; max_date: string; min_date: string }[]>(`
        SELECT 
          TRIM(beneficiary) as beneficiary,
          COUNT(*) as usage_count,
          MAX(created_at) as max_date,
          MIN(created_at) as min_date
        FROM cheques
        WHERE TRIM(beneficiary) != '' AND beneficiary != 'Bénéficiaire non spécifié'
        GROUP BY LOWER(TRIM(beneficiary));
      `);

      const now = new Date().toISOString();
      const map = new Map<string, { name: string; count: number; lastUsed: string; created: string }>();

      for (const row of chequeRows) {
        const key = row.beneficiary.toLowerCase();
        map.set(key, {
          name: row.beneficiary,
          count: row.usage_count,
          lastUsed: row.max_date || now,
          created: row.min_date || now
        });
      }

      // 2. Vérifier aussi les chèques du localStorage pour synchroniser
      const rawLocal = localStorage.getItem(HISTORIQUE_STORAGE_KEY);
      if (rawLocal) {
        try {
          const parsed: ChequeRecord[] = JSON.parse(rawLocal);
          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              const name = (item.beneficiary || "").trim();
              if (!name || name === "Bénéficiaire non spécifié") continue;
              const key = name.toLowerCase();
              if (map.has(key)) {
                const existing = map.get(key)!;
                if (item.createdAt && item.createdAt > existing.lastUsed) {
                  existing.lastUsed = item.createdAt;
                }
              } else {
                map.set(key, {
                  name,
                  count: 1,
                  lastUsed: item.createdAt || now,
                  created: item.createdAt || now
                });
              }
            }
          }
        } catch {}
      }

      for (const entry of map.values()) {
        const id = "ben-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7);
        await db.execute(
          `INSERT OR IGNORE INTO beneficiaries (
            id, name, usage_count, last_used_at, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6);`,
          [id, entry.name, entry.count, entry.lastUsed, entry.created, now]
        );
      }

      if (map.size > 0) {
        console.info(`[Chèque Studio] ${map.size} bénéficiaires auto-importés avec succès dans SQLite.`);
      }
    }
  } catch (err) {
    console.warn("Erreur auto-migration beneficiaries SQLite:", err);
  }
}

/**
 * Récupère les chèques avec pagination, filtres et recherche instantanée
 */
export async function getPaginatedCheques(params: GetChequesParams): Promise<PaginatedResult<ChequeRecord>> {
  const { page, pageSize, searchQuery = "", statusFilter = "all" } = params;
  const db = await getDatabase();

  if (!db) {
    // Mode fallback synchrone LocalStorage
    return getLocalPaginatedCheques(params);
  }

  try {
    const conditions: string[] = [];
    const queryParams: any[] = [];

    // Filtre de statut
    if (statusFilter !== "all") {
      conditions.push("status = ?");
      queryParams.push(statusFilter);
    }

    // Filtre de recherche
    if (searchQuery.trim()) {
      const term = `%${searchQuery.trim().toLowerCase()}%`;
      conditions.push("(LOWER(beneficiary) LIKE ? OR LOWER(bank_name) LIKE ? OR LOWER(place) LIKE ? OR LOWER(amount) LIKE ? OR date LIKE ?)");
      queryParams.push(term, term, term, term, term);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // 1. Calcul du total d'éléments correspondant aux filtres
    const countSql = `SELECT COUNT(*) as count FROM cheques ${whereClause};`;
    const countResult = await db.select<{ count: number }[]>(countSql, queryParams);
    const totalCount = countResult[0]?.count ?? 0;

    // 2. Statistiques globales (pour l'ensemble des chèques)
    const statsSql = `
      SELECT 
        COUNT(*) as total_count,
        COALESCE(SUM(amount_numeric), 0) as total_amount,
        COALESCE(SUM(CASE WHEN status = 'printed' THEN 1 ELSE 0 END), 0) as printed_count,
        COALESCE(SUM(CASE WHEN status = 'saved' THEN 1 ELSE 0 END), 0) as saved_count
      FROM cheques;
    `;
    const statsResult = await db.select<{
      total_count: number;
      total_amount: number;
      printed_count: number;
      saved_count: number;
    }[]>(statsSql);

    const rawStats = statsResult[0] || { total_count: 0, total_amount: 0, printed_count: 0, saved_count: 0 };
    const stats: HistoryStats = {
      totalCount: rawStats.total_count,
      totalAmountFormatted: Number(rawStats.total_amount).toLocaleString("fr-FR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }),
      printedCount: rawStats.printed_count,
      savedCount: rawStats.saved_count
    };

    // 3. Récupération de la page demandée via LIMIT et OFFSET
    const offset = Math.max(0, (page - 1) * pageSize);
    const selectSql = `
      SELECT 
        id, amount, amount_numeric, beneficiary, place, date, cheque_number as chequeNumber,
        bank_template_id as bankTemplateId, bank_name as bankName, status,
        COALESCE(is_crossed, 1) = 1 as isCrossed,
        COALESCE(crossed_with_text, 1) = 1 as crossedWithText,
        COALESCE(show_cheque_number, 0) = 1 as showChequeNumber,
        COALESCE(print_count, CASE WHEN status = 'printed' THEN 1 ELSE 0 END) as printCount,
        created_at as createdAt, updated_at as updatedAt, printed_at as printedAt,
        last_printed_at as lastPrintedAt
      FROM cheques 
      ${whereClause}
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?;
    `;
    const items = await db.select<ChequeRecord[]>(selectSql, [...queryParams, pageSize, offset]);

    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

    return {
      items,
      totalCount,
      totalPages,
      currentPage: Math.min(page, totalPages),
      pageSize,
      stats
    };
  } catch (err) {
    console.error("Erreur requête SQLite, fallback localStorage:", err);
    return getLocalPaginatedCheques(params);
  }
}

/**
 * Enregistre ou met à jour un chèque dans SQLite et met à jour le miroir localStorage
 */
export async function saveChequeRecord(record: ChequeRecord): Promise<void> {
  // Toujours maintenir une copie de secours dans localStorage
  updateLocalMirror(record);

  const db = await getDatabase();
  if (!db) return;

  const rawVal = parseFloat((record.amount || "0").replace(/\s/g, "").replace(",", ".")) || 0;
  const count = typeof record.printCount === "number" ? record.printCount : (record.status === "printed" ? 1 : 0);

  await db.execute(
    `INSERT OR REPLACE INTO cheques (
      id, amount, amount_numeric, beneficiary, place, date, cheque_number,
      bank_template_id, bank_name, status, is_crossed, crossed_with_text,
      show_cheque_number, print_count, created_at, updated_at, printed_at, last_printed_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18);`,
    [
      record.id,
      record.amount,
      rawVal,
      record.beneficiary,
      record.place,
      record.date,
      record.chequeNumber || null,
      record.bankTemplateId,
      record.bankName,
      record.status,
      record.isCrossed !== false ? 1 : 0,
      record.crossedWithText !== false ? 1 : 0,
      record.showChequeNumber ? 1 : 0,
      count,
      record.createdAt,
      record.updatedAt || null,
      record.printedAt || null,
      record.lastPrintedAt || record.printedAt || null
    ]
  );
}

/**
 * Recherche si un chèque identique existe déjà (même bénéficiaire, montant, banque et date)
 */
export async function findDuplicateCheque(params: {
  amount: string;
  beneficiary: string;
  date: string;
  bankTemplateId: string;
  excludeId?: string | null;
}): Promise<ChequeRecord | null> {
  const normBeneficiary = params.beneficiary.trim().toLowerCase();
  const normAmount = params.amount.replace(/\s/g, "").replace(",", ".");
  const numericAmount = parseFloat(normAmount) || 0;

  if (!normBeneficiary || numericAmount <= 0) {
    return null;
  }

  const db = await getDatabase();
  if (db) {
    try {
      const sql = `
        SELECT 
          id, amount, amount_numeric, beneficiary, place, date, cheque_number as chequeNumber,
          bank_template_id as bankTemplateId, bank_name as bankName, status,
          COALESCE(is_crossed, 1) = 1 as isCrossed,
          COALESCE(show_cheque_number, 0) = 1 as showChequeNumber,
          COALESCE(print_count, CASE WHEN status = 'printed' THEN 1 ELSE 0 END) as printCount,
          created_at as createdAt, updated_at as updatedAt, printed_at as printedAt,
          last_printed_at as lastPrintedAt
        FROM cheques
        WHERE LOWER(TRIM(beneficiary)) = ?
          AND bank_template_id = ?
          AND date = ?
          AND ABS(amount_numeric - ?) < 0.001
          ${params.excludeId ? "AND id != ?" : ""}
        ORDER BY created_at DESC
        LIMIT 1;
      `;
      const queryParams = params.excludeId 
        ? [normBeneficiary, params.bankTemplateId, params.date, numericAmount, params.excludeId]
        : [normBeneficiary, params.bankTemplateId, params.date, numericAmount];

      const res = await db.select<ChequeRecord[]>(sql, queryParams);
      if (res && res.length > 0) return res[0];
    } catch (e) {
      console.warn("Erreur recherche doublon SQLite:", e);
    }
  }

  // Fallback localStorage
  const list = getLocalRecords();
  const found = list.find((item) => {
    if (params.excludeId && item.id === params.excludeId) return false;
    const sameBeneficiary = (item.beneficiary || "").trim().toLowerCase() === normBeneficiary;
    const sameBank = item.bankTemplateId === params.bankTemplateId;
    const sameDate = item.date === params.date;
    const itemNum = parseFloat((item.amount || "0").replace(/\s/g, "").replace(",", ".")) || 0;
    const sameAmount = Math.abs(itemNum - numericAmount) < 0.001;
    return sameBeneficiary && sameBank && sameDate && sameAmount;
  });

  return found || null;
}

/**
 * Supprime un chèque par son identifiant
 */
export async function deleteChequeRecord(id: string): Promise<void> {
  deleteFromLocalMirror(id);

  const db = await getDatabase();
  if (!db) return;

  await db.execute("DELETE FROM cheques WHERE id = $1;", [id]);
}

/**
 * Supprime tous les chèques de l'historique
 */
export async function clearAllChequeRecords(): Promise<void> {
  localStorage.removeItem(HISTORIQUE_STORAGE_KEY);

  const db = await getDatabase();
  if (!db) return;

  await db.execute("DELETE FROM cheques;");
}

/* ==========================================================================
   BÉNÉFICIAIRES (CRUD, Recherche Autocomplete, Enregistrement automatique)
   ========================================================================== */

/**
 * Récupère les bénéficiaires avec pagination et recherche
 */
export async function getPaginatedBeneficiaries(params: GetBeneficiariesParams): Promise<BeneficiaryPaginatedResult> {
  const { page, pageSize, searchQuery = "" } = params;
  const db = await getDatabase();

  if (!db) {
    return getLocalPaginatedBeneficiaries(params);
  }

  try {
    const conditions: string[] = [];
    const queryParams: any[] = [];

    if (searchQuery.trim()) {
      const term = `%${searchQuery.trim().toLowerCase()}%`;
      conditions.push("(LOWER(name) LIKE ? OR (nickname IS NOT NULL AND LOWER(nickname) LIKE ?) OR (note IS NOT NULL AND LOWER(note) LIKE ?))");
      queryParams.push(term, term, term);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countSql = `SELECT COUNT(*) as count FROM beneficiaries ${whereClause};`;
    const countResult = await db.select<{ count: number }[]>(countSql, queryParams);
    const totalCount = countResult[0]?.count ?? 0;

    const statsSql = `
      SELECT 
        COUNT(*) as total_count,
        COALESCE((SELECT name FROM beneficiaries ORDER BY usage_count DESC LIMIT 1), '—') as most_used_name,
        COALESCE((SELECT usage_count FROM beneficiaries ORDER BY usage_count DESC LIMIT 1), 0) as most_used_count
      FROM beneficiaries;
    `;
    const statsResult = await db.select<{
      total_count: number;
      most_used_name: string;
      most_used_count: number;
    }[]>(statsSql);

    const rawStats = statsResult[0] || { total_count: 0, most_used_name: "—", most_used_count: 0 };
    const stats: BeneficiaryStats = {
      totalCount: rawStats.total_count,
      mostUsedName: rawStats.most_used_name || "—",
      mostUsedCount: rawStats.most_used_count || 0
    };

    const offset = Math.max(0, (page - 1) * pageSize);
    const selectSql = `
      SELECT 
        id, name, nickname, phone, note,
        usage_count as usageCount,
        last_used_at as lastUsedAt,
        created_at as createdAt,
        updated_at as updatedAt
      FROM beneficiaries
      ${whereClause}
      ORDER BY usage_count DESC, last_used_at DESC
      LIMIT ? OFFSET ?;
    `;
    const items = await db.select<BeneficiaryRecord[]>(selectSql, [...queryParams, pageSize, offset]);
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

    return {
      items,
      totalCount,
      totalPages,
      currentPage: Math.min(page, totalPages),
      pageSize,
      stats
    };
  } catch (err) {
    console.error("Erreur getPaginatedBeneficiaries SQLite, fallback localStorage:", err);
    return getLocalPaginatedBeneficiaries(params);
  }
}

/**
 * Recherche rapide des suggestions de bénéficiaires pour l'autocomplétion
 */
export async function searchBeneficiaries(query: string, limit = 8): Promise<BeneficiaryRecord[]> {
  const db = await getDatabase();
  if (!db) {
    return searchLocalBeneficiaries(query, limit);
  }

  try {
    const q = query.trim().toLowerCase();
    if (q) {
      const term = `%${q}%`;
      return await db.select<BeneficiaryRecord[]>(
        `SELECT 
          id, name, nickname, phone, note,
          usage_count as usageCount,
          last_used_at as lastUsedAt,
          created_at as createdAt,
          updated_at as updatedAt
        FROM beneficiaries
        WHERE LOWER(name) LIKE ? OR (nickname IS NOT NULL AND LOWER(nickname) LIKE ?)
        ORDER BY 
          CASE 
            WHEN LOWER(name) = ? THEN 0
            WHEN LOWER(name) LIKE ? THEN 1
            ELSE 2
          END,
          usage_count DESC,
          last_used_at DESC
        LIMIT ?;`,
        [term, term, q, `${q}%`, limit]
      );
    } else {
      return await db.select<BeneficiaryRecord[]>(
        `SELECT 
          id, name, nickname, phone, note,
          usage_count as usageCount,
          last_used_at as lastUsedAt,
          created_at as createdAt,
          updated_at as updatedAt
        FROM beneficiaries
        ORDER BY usage_count DESC, last_used_at DESC
        LIMIT ?;`,
        [limit]
      );
    }
  } catch (err) {
    console.warn("Erreur searchBeneficiaries SQLite, fallback localStorage:", err);
    return searchLocalBeneficiaries(query, limit);
  }
}

/**
 * Enregistrement automatique ou mise à jour de la fréquence d'utilisation d'un bénéficiaire
 */
export async function autoRecordBeneficiary(name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed || trimmed === "Bénéficiaire non spécifié" || trimmed === "Entreprise Exemple SARL") return;

  autoRecordLocalBeneficiary(trimmed);

  const db = await getDatabase();
  if (!db) return;

  try {
    const now = new Date().toISOString();
    const existing = await db.select<{ id: string; usage_count: number }[]>(
      "SELECT id, usage_count FROM beneficiaries WHERE LOWER(name) = ? LIMIT 1;",
      [trimmed.toLowerCase()]
    );

    if (existing && existing.length > 0) {
      const current = existing[0];
      await db.execute(
        "UPDATE beneficiaries SET usage_count = ?, last_used_at = ?, updated_at = ? WHERE id = ?;",
        [current.usage_count + 1, now, now, current.id]
      );
    } else {
      const id = "ben-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7);
      await db.execute(
        "INSERT INTO beneficiaries (id, name, usage_count, last_used_at, created_at, updated_at) VALUES ($1, $2, 1, $3, $4, $5);",
        [id, trimmed, now, now, now]
      );
    }
  } catch (err) {
    console.warn("Erreur autoRecordBeneficiary SQLite:", err);
  }
}

/**
 * Enregistre ou modifie une fiche bénéficiaire
 */
export async function saveBeneficiaryRecord(record: BeneficiaryRecord): Promise<void> {
  updateLocalBeneficiaryMirror(record);

  const db = await getDatabase();
  if (!db) return;

  const now = new Date().toISOString();
  await db.execute(
    `INSERT OR REPLACE INTO beneficiaries (
      id, name, nickname, phone, note, usage_count, last_used_at, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);`,
    [
      record.id,
      record.name.trim(),
      record.nickname ? record.nickname.trim() : null,
      record.phone ? record.phone.trim() : null,
      record.note ? record.note.trim() : null,
      record.usageCount || 1,
      record.lastUsedAt || now,
      record.createdAt || now,
      record.updatedAt || now
    ]
  );
}

/**
 * Supprime un bénéficiaire
 */
export async function deleteBeneficiaryRecord(id: string): Promise<void> {
  deleteLocalBeneficiaryMirror(id);

  const db = await getDatabase();
  if (!db) return;

  await db.execute("DELETE FROM beneficiaries WHERE id = $1;", [id]);
}

/**
 * Supprime tous les bénéficiaires
 */
export async function clearAllBeneficiaryRecords(): Promise<void> {
  localStorage.removeItem(BENEFICIARIES_STORAGE_KEY);

  const db = await getDatabase();
  if (!db) return;

  await db.execute("DELETE FROM beneficiaries;");
}

/* ==========================================================================
   HELPERS & FALLBACK LOCALSTORAGE (Pour environnement web/développement)
   ========================================================================== */

function getLocalRecords(): ChequeRecord[] {
  try {
    const raw = localStorage.getItem(HISTORIQUE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function updateLocalMirror(record: ChequeRecord): void {
  try {
    const list = getLocalRecords().filter((r) => r.id !== record.id);
    list.unshift(record);
    localStorage.setItem(HISTORIQUE_STORAGE_KEY, JSON.stringify(list));
  } catch {}
}

function deleteFromLocalMirror(id: string): void {
  try {
    const list = getLocalRecords().filter((r) => r.id !== id);
    localStorage.setItem(HISTORIQUE_STORAGE_KEY, JSON.stringify(list));
  } catch {}
}

function getLocalPaginatedCheques(params: GetChequesParams): PaginatedResult<ChequeRecord> {
  const { page, pageSize, searchQuery = "", statusFilter = "all" } = params;
  const all = getLocalRecords();

  let totalDinar = 0;
  let printedCount = 0;
  let savedCount = 0;

  for (const item of all) {
    const num = Number((item.amount || "0").replace(/\s/g, "").replace(",", ".")) || 0;
    totalDinar += num;
    if (item.status === "printed") printedCount++;
    if (item.status === "saved") savedCount++;
  }

  const filtered = all.filter((item) => {
    if (statusFilter !== "all" && item.status !== statusFilter) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      item.beneficiary.toLowerCase().includes(q) ||
      item.bankName.toLowerCase().includes(q) ||
      item.place.toLowerCase().includes(q) ||
      item.amount.toLowerCase().includes(q) ||
      item.date.includes(q)
    );
  });

  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const validPage = Math.min(Math.max(1, page), totalPages);
  const start = (validPage - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize);

  return {
    items,
    totalCount,
    totalPages,
    currentPage: validPage,
    pageSize,
    stats: {
      totalCount: all.length,
      totalAmountFormatted: totalDinar.toLocaleString("fr-FR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }),
      printedCount,
      savedCount
    }
  };
}

/* --- LocalStorage Helpers pour Bénéficiaires --- */

function getLocalBeneficiaries(): BeneficiaryRecord[] {
  try {
    migrateLocalBeneficiariesIfEmpty();
    const raw = localStorage.getItem(BENEFICIARIES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function migrateLocalBeneficiariesIfEmpty(): void {
  try {
    const raw = localStorage.getItem(BENEFICIARIES_STORAGE_KEY);
    if (!raw || JSON.parse(raw).length === 0) {
      const chequeRaw = localStorage.getItem(HISTORIQUE_STORAGE_KEY);
      if (chequeRaw) {
        const cheques: ChequeRecord[] = JSON.parse(chequeRaw);
        if (Array.isArray(cheques) && cheques.length > 0) {
          const map = new Map<string, BeneficiaryRecord>();
          const now = new Date().toISOString();
          for (const ch of cheques) {
            const name = (ch.beneficiary || "").trim();
            if (!name || name === "Bénéficiaire non spécifié" || name === "Entreprise Exemple SARL") continue;
            const key = name.toLowerCase();
            if (map.has(key)) {
              const item = map.get(key)!;
              item.usageCount = (item.usageCount || 1) + 1;
              if (ch.createdAt && ch.createdAt > (item.lastUsedAt || "")) {
                item.lastUsedAt = ch.createdAt;
              }
            } else {
              map.set(key, {
                id: "ben-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7),
                name,
                usageCount: 1,
                lastUsedAt: ch.createdAt || now,
                createdAt: ch.createdAt || now,
                updatedAt: now
              });
            }
          }
          const list = Array.from(map.values());
          if (list.length > 0) {
            localStorage.setItem(BENEFICIARIES_STORAGE_KEY, JSON.stringify(list));
          }
        }
      }
    }
  } catch {}
}

function updateLocalBeneficiaryMirror(record: BeneficiaryRecord): void {
  try {
    const list = getLocalBeneficiaries().filter((b) => b.id !== record.id);
    list.unshift(record);
    localStorage.setItem(BENEFICIARIES_STORAGE_KEY, JSON.stringify(list));
  } catch {}
}

function deleteLocalBeneficiaryMirror(id: string): void {
  try {
    const list = getLocalBeneficiaries().filter((b) => b.id !== id);
    localStorage.setItem(BENEFICIARIES_STORAGE_KEY, JSON.stringify(list));
  } catch {}
}

function autoRecordLocalBeneficiary(name: string): void {
  try {
    const trimmed = name.trim();
    if (!trimmed || trimmed === "Bénéficiaire non spécifié" || trimmed === "Entreprise Exemple SARL") return;
    const list = getLocalBeneficiaries();
    const existingIndex = list.findIndex((b) => b.name.toLowerCase() === trimmed.toLowerCase());
    const now = new Date().toISOString();
    if (existingIndex >= 0) {
      list[existingIndex].usageCount = (list[existingIndex].usageCount || 1) + 1;
      list[existingIndex].lastUsedAt = now;
      list[existingIndex].updatedAt = now;
    } else {
      list.unshift({
        id: "ben-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7),
        name: trimmed,
        usageCount: 1,
        lastUsedAt: now,
        createdAt: now,
        updatedAt: now
      });
    }
    localStorage.setItem(BENEFICIARIES_STORAGE_KEY, JSON.stringify(list));
  } catch {}
}

function searchLocalBeneficiaries(query: string, limit = 8): BeneficiaryRecord[] {
  const all = getLocalBeneficiaries();
  const q = query.trim().toLowerCase();
  let filtered = all;
  if (q) {
    filtered = all.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        (b.nickname && b.nickname.toLowerCase().includes(q))
    );
  }
  filtered.sort((a, b) => {
    if (q) {
      const aExact = a.name.toLowerCase() === q;
      const bExact = b.name.toLowerCase() === q;
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      const aStarts = a.name.toLowerCase().startsWith(q);
      const bStarts = b.name.toLowerCase().startsWith(q);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
    }
    return (b.usageCount || 0) - (a.usageCount || 0);
  });
  return filtered.slice(0, limit);
}

function getLocalPaginatedBeneficiaries(params: GetBeneficiariesParams): BeneficiaryPaginatedResult {
  const { page, pageSize, searchQuery = "" } = params;
  const all = getLocalBeneficiaries();

  const q = searchQuery.trim().toLowerCase();
  const filtered = q
    ? all.filter(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          (b.nickname && b.nickname.toLowerCase().includes(q)) ||
          (b.note && b.note.toLowerCase().includes(q))
      )
    : all;

  filtered.sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));

  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const validPage = Math.min(Math.max(1, page), totalPages);
  const start = (validPage - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize);

  const mostUsed = all.reduce<BeneficiaryRecord | null>((acc, curr) => {
    if (!acc || (curr.usageCount || 0) > (acc.usageCount || 0)) return curr;
    return acc;
  }, null);

  return {
    items,
    totalCount,
    totalPages,
    currentPage: validPage,
    pageSize,
    stats: {
      totalCount: all.length,
      mostUsedName: mostUsed ? mostUsed.name : "—",
      mostUsedCount: mostUsed ? mostUsed.usageCount : 0
    }
  };
}

/* ==========================================================================
   JOURNAL D'AUDIT DES TENTATIVES D'IMPRESSION (PRINT LOGS)
   ========================================================================== */

function getLocalPrintLogs(): PrintAttemptRecord[] {
  try {
    const raw = localStorage.getItem(PRINT_LOGS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalPrintLogs(logs: PrintAttemptRecord[]): void {
  try {
    localStorage.setItem(PRINT_LOGS_STORAGE_KEY, JSON.stringify(logs));
  } catch (e) {
    console.warn("Erreur sauvegarde locale logs impression:", e);
  }
}

/**
 * Enregistre une nouvelle tentative d'impression
 */
export async function logPrintAttempt(record: PrintAttemptRecord): Promise<void> {
  // Toujours maintenir le fallback localStorage
  const localLogs = getLocalPrintLogs().filter((l) => l.id !== record.id);
  localLogs.unshift(record);
  saveLocalPrintLogs(localLogs);

  const db = await getDatabase();
  if (db) {
    try {
      await db.execute(
        `INSERT OR REPLACE INTO print_logs (
          id, cheque_id, beneficiary, amount, bank_name, bank_template_id,
          paper_format, placement, status, attempted_at, confirmed_at, failure_reason, copy_number
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13);`,
        [
          record.id,
          record.chequeId,
          record.beneficiary,
          record.amount,
          record.bankName,
          record.bankTemplateId,
          record.paperFormat,
          record.placement,
          record.status,
          record.attemptedAt,
          record.confirmedAt || null,
          record.failureReason || null,
          record.copyNumber || 1
        ]
      );
    } catch (e) {
      console.warn("Erreur insertion SQLite print_logs:", e);
    }
  }
}

/**
 * Met à jour le statut d'une tentative (ex: confirmed, failed, cancelled)
 */
export async function updatePrintAttemptStatus(
  id: string,
  status: PrintAttemptStatus,
  update?: { confirmedAt?: string; failureReason?: string }
): Promise<void> {
  const localLogs = getLocalPrintLogs();
  const idx = localLogs.findIndex((l) => l.id === id);
  if (idx !== -1) {
    localLogs[idx] = {
      ...localLogs[idx],
      status,
      confirmedAt: update?.confirmedAt ?? localLogs[idx].confirmedAt,
      failureReason: update?.failureReason ?? localLogs[idx].failureReason
    };
    saveLocalPrintLogs(localLogs);
  }

  const db = await getDatabase();
  if (db) {
    try {
      await db.execute(
        `UPDATE print_logs 
         SET status = $1, confirmed_at = COALESCE($2, confirmed_at), failure_reason = COALESCE($3, failure_reason)
         WHERE id = $4;`,
        [status, update?.confirmedAt || null, update?.failureReason || null, id]
      );
    } catch (e) {
      console.warn("Erreur update SQLite print_logs:", e);
    }
  }
}

/**
 * Récupère les tentatives d'impression (toutes ou filtrées par chèque)
 */
export async function getPrintAttempts(chequeId?: string): Promise<PrintAttemptRecord[]> {
  const db = await getDatabase();
  if (db) {
    try {
      const sql = chequeId
        ? `SELECT id, cheque_id as chequeId, beneficiary, amount, bank_name as bankName,
                  bank_template_id as bankTemplateId, paper_format as paperFormat, placement,
                  status, attempted_at as attemptedAt, confirmed_at as confirmedAt,
                  failure_reason as failureReason, copy_number as copyNumber
           FROM print_logs
           WHERE cheque_id = $1
           ORDER BY attempted_at DESC;`
        : `SELECT id, cheque_id as chequeId, beneficiary, amount, bank_name as bankName,
                  bank_template_id as bankTemplateId, paper_format as paperFormat, placement,
                  status, attempted_at as attemptedAt, confirmed_at as confirmedAt,
                  failure_reason as failureReason, copy_number as copyNumber
           FROM print_logs
           ORDER BY attempted_at DESC;`;

      const rows = await db.select<PrintAttemptRecord[]>(sql, chequeId ? [chequeId] : []);
      if (Array.isArray(rows) && rows.length > 0) {
        return rows;
      }
    } catch (e) {
      console.warn("Erreur lecture SQLite print_logs:", e);
    }
  }

  // Fallback localStorage
  const all = getLocalPrintLogs();
  if (chequeId) {
    return all.filter((l) => l.chequeId === chequeId);
  }
  return all;
}

/**
 * Supprime une tentative d'impression
 */
export async function deletePrintAttempt(id: string): Promise<void> {
  const localLogs = getLocalPrintLogs().filter((l) => l.id !== id);
  saveLocalPrintLogs(localLogs);

  const db = await getDatabase();
  if (db) {
    try {
      await db.execute(`DELETE FROM print_logs WHERE id = $1;`, [id]);
    } catch (e) {
      console.warn("Erreur delete SQLite print_logs:", e);
    }
  }
}

/**
 * Réinitialise tous les logs d'impression
 */
export async function clearPrintLogs(): Promise<void> {
  saveLocalPrintLogs([]);
  const db = await getDatabase();
  if (db) {
    try {
      await db.execute(`DELETE FROM print_logs;`);
    } catch (e) {
      console.warn("Erreur clear SQLite print_logs:", e);
    }
  }
}
