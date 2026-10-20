import Database from "@tauri-apps/plugin-sql";
import type { ChequeRecord, ChequeStatus } from "../types";

export const HISTORIQUE_STORAGE_KEY = "cheque-studio-history-v1";
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
        created_at TEXT NOT NULL,
        updated_at TEXT,
        printed_at TEXT
      );
    `);

    try {
      await dbInstance.execute(`ALTER TABLE cheques ADD COLUMN is_crossed INTEGER DEFAULT 1;`);
    } catch {}

    // 2. Index pour accélérer le tri et la pagination
    await dbInstance.execute(`CREATE INDEX IF NOT EXISTS idx_cheques_created_at ON cheques(created_at DESC);`);
    await dbInstance.execute(`CREATE INDEX IF NOT EXISTS idx_cheques_status ON cheques(status);`);
    await dbInstance.execute(`CREATE INDEX IF NOT EXISTS idx_cheques_beneficiary ON cheques(beneficiary);`);

    // 3. Migration transparente depuis localStorage si la table SQLite est vide
    await migrateFromLocalStorageIfEmpty(dbInstance);

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
        created_at as createdAt, updated_at as updatedAt, printed_at as printedAt
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
  await db.execute(
    `INSERT OR REPLACE INTO cheques (
      id, amount, amount_numeric, beneficiary, place, date, cheque_number,
      bank_template_id, bank_name, status, is_crossed, created_at, updated_at, printed_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14);`,
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
      record.createdAt,
      record.updatedAt || null,
      record.printedAt || null
    ]
  );
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
