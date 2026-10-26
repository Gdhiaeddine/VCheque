import Database from "@tauri-apps/plugin-sql";
import type { ChequeRecord, ChequeStatus, BeneficiaryRecord, PrintAttemptRecord, PrintAttemptStatus, ChequeAuditEvent, ChequeAuditEventType } from "../types";

export const HISTORIQUE_STORAGE_KEY = "cheque-studio-history-v1";
export const BENEFICIARIES_STORAGE_KEY = "cheque-studio-beneficiaries-v1";
export const PRINT_LOGS_STORAGE_KEY = "cheque-studio-print-logs-v1";
export const EVENTS_STORAGE_KEY = "cheque-studio-cheque-events-v1";
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
  bankFilter?: string; // "all" ou id spécifique ("el-salam", "bna", etc.)
  startDate?: string; // "YYYY-MM-DD"
  endDate?: string; // "YYYY-MM-DD"
  chequeNumber?: string;
  reference?: string;
  beneficiaryQuery?: string;
  minAmount?: number;
  maxAmount?: number;
}

export interface HistoryStats {
  totalCount: number;
  totalAmountFormatted: string;
  printedCount: number;
  savedCount: number;
  readyCount?: number;
  deliveredCount?: number;
  cashedCount?: number;
  cancelledCount?: number;
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
    try {
      await dbInstance.execute(`ALTER TABLE cheques ADD COLUMN reference TEXT;`);
    } catch {}
    try {
      await dbInstance.execute(`ALTER TABLE cheques ADD COLUMN cancellation_reason TEXT;`);
    } catch {}
    try {
      await dbInstance.execute(`ALTER TABLE cheques ADD COLUMN cancelled_at TEXT;`);
    } catch {}
    try {
      await dbInstance.execute(`ALTER TABLE cheques ADD COLUMN delivered_at TEXT;`);
    } catch {}
    try {
      await dbInstance.execute(`ALTER TABLE cheques ADD COLUMN cashed_at TEXT;`);
    } catch {}

    // 2. Index pour accélérer le tri et la pagination
    await dbInstance.execute(`CREATE INDEX IF NOT EXISTS idx_cheques_created_at ON cheques(created_at DESC);`);
    await dbInstance.execute(`CREATE INDEX IF NOT EXISTS idx_cheques_status ON cheques(status);`);
    await dbInstance.execute(`CREATE INDEX IF NOT EXISTS idx_cheques_beneficiary ON cheques(beneficiary);`);
    try {
      await dbInstance.execute(`CREATE INDEX IF NOT EXISTS idx_cheques_bank ON cheques(bank_template_id);`);
      await dbInstance.execute(`CREATE INDEX IF NOT EXISTS idx_cheques_date ON cheques(date);`);
    } catch {}

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

    // 5. Table des événements d'audit complets du chèque
    await dbInstance.execute(`
      CREATE TABLE IF NOT EXISTS cheque_events (
        id TEXT PRIMARY KEY,
        cheque_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        reason TEXT,
        from_status TEXT,
        to_status TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL
      );
    `);
    await dbInstance.execute(`CREATE INDEX IF NOT EXISTS idx_cheque_events_id ON cheque_events(cheque_id);`);
    await dbInstance.execute(`CREATE INDEX IF NOT EXISTS idx_cheque_events_date ON cheque_events(created_at DESC);`);

    // 6. Migration transparente depuis localStorage si les tables SQLite sont vides
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
 * Construit la clause WHERE et les paramètres pour les requêtes sur les chèques
 */
function buildChequesWhereClause(params: GetChequesParams): { whereClause: string; queryParams: any[] } {
  const { searchQuery = "", statusFilter = "all", bankFilter, startDate, endDate, chequeNumber, reference, beneficiaryQuery, minAmount, maxAmount } = params;
  const conditions: string[] = [];
  const queryParams: any[] = [];

  // Filtre de statut
  if (statusFilter && statusFilter !== "all") {
    if (statusFilter === "saved") {
      conditions.push("(status = 'saved' OR status = 'brouillon')");
    } else {
      conditions.push("status = ?");
      queryParams.push(statusFilter);
    }
  }

  // Filtre de banque
  if (bankFilter && bankFilter !== "all") {
    conditions.push("(bank_template_id = ? OR bank_name = ?)");
    queryParams.push(bankFilter, bankFilter);
  }

  // Filtre période début / fin
  if (startDate) {
    conditions.push("date >= ?");
    queryParams.push(startDate);
  }
  if (endDate) {
    conditions.push("date <= ?");
    queryParams.push(endDate);
  }

  // Filtres avancés multi-critères
  if (chequeNumber?.trim()) {
    conditions.push("cheque_number LIKE ?");
    queryParams.push(`%${chequeNumber.trim()}%`);
  }
  if (reference?.trim()) {
    conditions.push("reference LIKE ?");
    queryParams.push(`%${reference.trim()}%`);
  }
  if (beneficiaryQuery?.trim()) {
    conditions.push("LOWER(beneficiary) LIKE ?");
    queryParams.push(`%${beneficiaryQuery.trim().toLowerCase()}%`);
  }
  if (typeof minAmount === "number" && !isNaN(minAmount)) {
    conditions.push("amount_numeric >= ?");
    queryParams.push(minAmount);
  }
  if (typeof maxAmount === "number" && !isNaN(maxAmount)) {
    conditions.push("amount_numeric <= ?");
    queryParams.push(maxAmount);
  }

  // Filtre de recherche globale
  if (searchQuery.trim()) {
    const term = `%${searchQuery.trim().toLowerCase()}%`;
    conditions.push("(LOWER(beneficiary) LIKE ? OR LOWER(bank_name) LIKE ? OR LOWER(place) LIKE ? OR LOWER(amount) LIKE ? OR date LIKE ? OR cheque_number LIKE ? OR reference LIKE ?)");
    queryParams.push(term, term, term, term, term, term, term);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return { whereClause, queryParams };
}

/**
 * Récupère les chèques avec pagination, filtres et recherche instantanée
 */
export async function getPaginatedCheques(params: GetChequesParams): Promise<PaginatedResult<ChequeRecord>> {
  const { page, pageSize } = params;
  const db = await getDatabase();

  if (!db) {
    // Mode fallback synchrone LocalStorage
    return getLocalPaginatedCheques(params);
  }

  try {
    const { whereClause, queryParams } = buildChequesWhereClause(params);

    // 1. Calcul du total d'éléments correspondant aux filtres
    const countSql = `SELECT COUNT(*) as count FROM cheques ${whereClause};`;
    const countResult = await db.select<{ count: number }[]>(countSql, queryParams);
    const totalCount = countResult[0]?.count ?? 0;

    // 2. Statistiques globales
    const statsSql = `
      SELECT 
        COUNT(*) as total_count,
        COALESCE(SUM(CASE WHEN status != 'annule' THEN amount_numeric ELSE 0 END), 0) as total_amount,
        COALESCE(SUM(CASE WHEN status = 'printed' THEN 1 ELSE 0 END), 0) as printed_count,
        COALESCE(SUM(CASE WHEN status IN ('saved', 'brouillon') THEN 1 ELSE 0 END), 0) as saved_count,
        COALESCE(SUM(CASE WHEN status = 'pret' THEN 1 ELSE 0 END), 0) as ready_count,
        COALESCE(SUM(CASE WHEN status = 'remis' THEN 1 ELSE 0 END), 0) as delivered_count,
        COALESCE(SUM(CASE WHEN status = 'encaisse' THEN 1 ELSE 0 END), 0) as cashed_count,
        COALESCE(SUM(CASE WHEN status = 'annule' THEN 1 ELSE 0 END), 0) as cancelled_count
      FROM cheques;
    `;
    const statsResult = await db.select<{
      total_count: number;
      total_amount: number;
      printed_count: number;
      saved_count: number;
      ready_count: number;
      delivered_count: number;
      cashed_count: number;
      cancelled_count: number;
    }[]>(statsSql);

    const rawStats = statsResult[0] || {
      total_count: 0,
      total_amount: 0,
      printed_count: 0,
      saved_count: 0,
      ready_count: 0,
      delivered_count: 0,
      cashed_count: 0,
      cancelled_count: 0
    };

    const stats: HistoryStats = {
      totalCount: rawStats.total_count,
      totalAmountFormatted: Number(rawStats.total_amount).toLocaleString("fr-FR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }),
      printedCount: rawStats.printed_count,
      savedCount: rawStats.saved_count,
      readyCount: rawStats.ready_count,
      deliveredCount: rawStats.delivered_count,
      cashedCount: rawStats.cashed_count,
      cancelledCount: rawStats.cancelled_count
    };

    // 3. Récupération de la page demandée via LIMIT et OFFSET
    const offset = Math.max(0, (page - 1) * pageSize);
    const selectSql = `
      SELECT 
        id, amount, amount_numeric, beneficiary, place, date, cheque_number as chequeNumber,
        reference, cancellation_reason as cancellationReason, cancelled_at as cancelledAt,
        delivered_at as deliveredAt, cashed_at as cashedAt,
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
 * Récupère l'ensemble des chèques correspondant aux filtres actifs (pour exports complets CSV / Excel)
 */
export async function getAllFilteredCheques(params: Omit<GetChequesParams, "page" | "pageSize">): Promise<ChequeRecord[]> {
  const db = await getDatabase();
  if (!db) {
    return getLocalFilteredCheques(params);
  }

  try {
    const { whereClause, queryParams } = buildChequesWhereClause({ ...params, page: 1, pageSize: 999999 });
    const selectSql = `
      SELECT 
        id, amount, amount_numeric, beneficiary, place, date, cheque_number as chequeNumber,
        reference, cancellation_reason as cancellationReason, cancelled_at as cancelledAt,
        delivered_at as deliveredAt, cashed_at as cashedAt,
        bank_template_id as bankTemplateId, bank_name as bankName, status,
        COALESCE(is_crossed, 1) = 1 as isCrossed,
        COALESCE(crossed_with_text, 1) = 1 as crossedWithText,
        COALESCE(show_cheque_number, 0) = 1 as showChequeNumber,
        COALESCE(print_count, CASE WHEN status = 'printed' THEN 1 ELSE 0 END) as printCount,
        created_at as createdAt, updated_at as updatedAt, printed_at as printedAt,
        last_printed_at as lastPrintedAt
      FROM cheques 
      ${whereClause}
      ORDER BY created_at DESC;
    `;
    return await db.select<ChequeRecord[]>(selectSql, queryParams);
  } catch (err) {
    console.error("Erreur récupération chèques pour export:", err);
    return getLocalFilteredCheques(params);
  }
}

/**
 * Enregistre ou met à jour un chèque dans SQLite et met à jour le miroir localStorage
 */
export async function saveChequeRecord(record: ChequeRecord): Promise<void> {
  const isNew = !getLocalRecords().some((r) => r.id === record.id);

  // Toujours maintenir une copie de secours dans localStorage
  updateLocalMirror(record);

  const db = await getDatabase();
  if (db) {
    const rawVal = parseFloat((record.amount || "0").replace(/\s/g, "").replace(",", ".")) || 0;
    const count = typeof record.printCount === "number" ? record.printCount : (record.status === "printed" ? 1 : 0);

    await db.execute(
      `INSERT OR REPLACE INTO cheques (
        id, amount, amount_numeric, beneficiary, place, date, cheque_number,
        reference, cancellation_reason, cancelled_at, delivered_at, cashed_at,
        bank_template_id, bank_name, status, is_crossed, crossed_with_text,
        show_cheque_number, print_count, created_at, updated_at, printed_at, last_printed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23);`,
      [
        record.id,
        record.amount,
        rawVal,
        record.beneficiary,
        record.place,
        record.date,
        record.chequeNumber || null,
        record.reference || null,
        record.cancellationReason || null,
        record.cancelledAt || null,
        record.deliveredAt || null,
        record.cashedAt || null,
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

  // Journalisation d'audit
  try {
    if (isNew) {
      await logChequeEvent({
        chequeId: record.id,
        eventType: "created",
        title: "Création initiale du chèque",
        description: `Chèque créé au profit de "${record.beneficiary || "Bénéficiaire non spécifié"}" pour un montant de ${record.amount} DA (${record.bankName}).`,
        toStatus: record.status,
        metadata: {
          amount: record.amount,
          beneficiary: record.beneficiary,
          bankName: record.bankName,
          place: record.place
        },
        timestamp: record.createdAt || new Date().toISOString()
      });
    } else {
      await logChequeEvent({
        chequeId: record.id,
        eventType: "updated",
        title: "Modification des données du chèque",
        description: `Montant : ${record.amount} DA · Fait à ${record.place || "—"} le ${record.date}.`,
        toStatus: record.status,
        metadata: {
          amount: record.amount,
          beneficiary: record.beneficiary,
          bankName: record.bankName,
          place: record.place
        },
        timestamp: record.updatedAt || new Date().toISOString()
      });
    }
  } catch {}
}

/**
 * Annule un chèque en conservant son historique et en enregistrant le motif obligatoire
 */
export async function cancelChequeRecord(id: string, reason: string): Promise<void> {
  const now = new Date().toISOString();

  // 1. Miroir localStorage
  const list = getLocalRecords();
  const target = list.find((c) => c.id === id);
  const prevStatus = target ? target.status : undefined;
  if (target) {
    target.status = "annule";
    target.cancellationReason = reason;
    target.cancelledAt = now;
    target.updatedAt = now;
    localStorage.setItem(HISTORIQUE_STORAGE_KEY, JSON.stringify(list));
  }

  // 2. Base SQLite
  const db = await getDatabase();
  if (db) {
    await db.execute(
      `UPDATE cheques 
       SET status = 'annule', cancellation_reason = $1, cancelled_at = $2, updated_at = $3 
       WHERE id = $4;`,
      [reason, now, now, id]
    );
  }

  // 3. Logger dans les logs d'audit et la chronologie complète
  try {
    if (target) {
      await logPrintAttempt({
        id: "log-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
        chequeId: target.id,
        beneficiary: target.beneficiary,
        amount: target.amount,
        bankName: target.bankName,
        bankTemplateId: target.bankTemplateId,
        paperFormat: target.printSettings?.paperFormat || "a4-portrait",
        placement: target.printSettings?.placement || "center",
        status: "cancelled",
        attemptedAt: now,
        failureReason: `Chèque annulé : ${reason}`,
        copyNumber: target.printCount || 1
      });

      await logChequeEvent({
        chequeId: id,
        eventType: "cancelled",
        title: "Annulation officielle du chèque",
        description: "Le chèque a été marqué comme annulé et exclu des totaux financiers actifs.",
        reason: reason,
        fromStatus: prevStatus,
        toStatus: "annule",
        metadata: {
          amount: target.amount,
          beneficiary: target.beneficiary,
          bankName: target.bankName
        },
        timestamp: now
      });
    }
  } catch {}
}

/**
 * Met à jour le statut du cycle de vie d'un chèque (ex: 'remis', 'encaisse', 'pret', etc.)
 */
export async function updateChequeStatus(id: string, status: ChequeStatus): Promise<void> {
  const now = new Date().toISOString();
  const list = getLocalRecords();
  const target = list.find((c) => c.id === id);
  const oldStatus = target ? target.status : undefined;

  if (target) {
    target.status = status;
    target.updatedAt = now;
    if (status === "remis") target.deliveredAt = now;
    if (status === "encaisse") target.cashedAt = now;
    localStorage.setItem(HISTORIQUE_STORAGE_KEY, JSON.stringify(list));
  }

  const db = await getDatabase();
  if (db) {
    if (status === "remis") {
      await db.execute(`UPDATE cheques SET status = $1, delivered_at = $2, updated_at = $3 WHERE id = $4;`, [status, now, now, id]);
    } else if (status === "encaisse") {
      await db.execute(`UPDATE cheques SET status = $1, cashed_at = $2, updated_at = $3 WHERE id = $4;`, [status, now, now, id]);
    } else {
      await db.execute(`UPDATE cheques SET status = $1, updated_at = $2 WHERE id = $3;`, [status, now, id]);
    }
  }

  // Journaliser le changement de statut dans la chronologie
  try {
    if (target) {
      await logChequeEvent({
        chequeId: id,
        eventType: "status_changed",
        title: `Statut modifié : ${oldStatus || "—"} ➔ ${status}`,
        description: `Le statut a été mis à jour vers '${status}'.`,
        fromStatus: oldStatus,
        toStatus: status,
        metadata: {
          amount: target.amount,
          beneficiary: target.beneficiary,
          bankName: target.bankName
        },
        timestamp: now
      });
    }
  } catch {}
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

function filterLocalCheques(all: ChequeRecord[], params: Omit<GetChequesParams, "page" | "pageSize">): ChequeRecord[] {
  const { searchQuery = "", statusFilter = "all", bankFilter, startDate, endDate, chequeNumber, reference, beneficiaryQuery, minAmount, maxAmount } = params;

  return all.filter((item) => {
    // Statut
    if (statusFilter && statusFilter !== "all") {
      if (statusFilter === "saved") {
        if (item.status !== "saved" && item.status !== "brouillon") return false;
      } else if (item.status !== statusFilter) {
        return false;
      }
    }

    // Banque
    if (bankFilter && bankFilter !== "all") {
      if (item.bankTemplateId !== bankFilter && item.bankName !== bankFilter) return false;
    }

    // Période
    if (startDate && item.date < startDate) return false;
    if (endDate && item.date > endDate) return false;

    // Filtres avancés
    if (chequeNumber?.trim() && !(item.chequeNumber || "").includes(chequeNumber.trim())) return false;
    if (reference?.trim() && !(item.reference || "").toLowerCase().includes(reference.trim().toLowerCase())) return false;
    if (beneficiaryQuery?.trim() && !item.beneficiary.toLowerCase().includes(beneficiaryQuery.trim().toLowerCase())) return false;

    const num = Number((item.amount || "0").replace(/\s/g, "").replace(",", ".")) || 0;
    if (typeof minAmount === "number" && !isNaN(minAmount) && num < minAmount) return false;
    if (typeof maxAmount === "number" && !isNaN(maxAmount) && num > maxAmount) return false;

    // Recherche globale
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      return (
        item.beneficiary.toLowerCase().includes(q) ||
        item.bankName.toLowerCase().includes(q) ||
        item.place.toLowerCase().includes(q) ||
        item.amount.toLowerCase().includes(q) ||
        item.date.includes(q) ||
        (item.chequeNumber && item.chequeNumber.includes(q)) ||
        (item.reference && item.reference.toLowerCase().includes(q))
      );
    }

    return true;
  });
}

function getLocalFilteredCheques(params: Omit<GetChequesParams, "page" | "pageSize">): ChequeRecord[] {
  const all = getLocalRecords();
  return filterLocalCheques(all, params);
}

function getLocalPaginatedCheques(params: GetChequesParams): PaginatedResult<ChequeRecord> {
  const { page, pageSize } = params;
  const all = getLocalRecords();

  let totalDinar = 0;
  let printedCount = 0;
  let savedCount = 0;
  let readyCount = 0;
  let deliveredCount = 0;
  let cashedCount = 0;
  let cancelledCount = 0;

  for (const item of all) {
    const num = Number((item.amount || "0").replace(/\s/g, "").replace(",", ".")) || 0;
    if (item.status !== "annule") {
      totalDinar += num;
    }
    if (item.status === "printed") printedCount++;
    else if (item.status === "saved" || item.status === "brouillon") savedCount++;
    else if (item.status === "pret") readyCount++;
    else if (item.status === "remis") deliveredCount++;
    else if (item.status === "encaisse") cashedCount++;
    else if (item.status === "annule") cancelledCount++;
  }

  const filtered = filterLocalCheques(all, params);

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
      savedCount,
      readyCount,
      deliveredCount,
      cashedCount,
      cancelledCount
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

/* ==========================================================================
   ÉVÉNEMENTS D'AUDIT COMPLETS DU CYCLE DE VIE DU CHÈQUE
   ========================================================================== */

function getLocalEvents(): ChequeAuditEvent[] {
  try {
    const raw = localStorage.getItem(EVENTS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalEvents(events: ChequeAuditEvent[]): void {
  try {
    localStorage.setItem(EVENTS_STORAGE_KEY, JSON.stringify(events));
  } catch {}
}

/**
 * Enregistre un événement dans la chronologie d'audit du chèque
 */
export async function logChequeEvent(event: Omit<ChequeAuditEvent, "id">): Promise<void> {
  const id = "ev-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7);
  const fullEvent: ChequeAuditEvent = { ...event, id };

  // 1. Sauvegarde dans localStorage
  const localList = getLocalEvents();
  localList.unshift(fullEvent);
  saveLocalEvents(localList);

  // 2. Sauvegarde dans SQLite
  const db = await getDatabase();
  if (db) {
    try {
      await db.execute(
        `INSERT OR REPLACE INTO cheque_events (
          id, cheque_id, event_type, title, description, reason, from_status, to_status, metadata_json, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);`,
        [
          fullEvent.id,
          fullEvent.chequeId,
          fullEvent.eventType,
          fullEvent.title,
          fullEvent.description || null,
          fullEvent.reason || null,
          fullEvent.fromStatus || null,
          fullEvent.toStatus || null,
          fullEvent.metadata ? JSON.stringify(fullEvent.metadata) : null,
          fullEvent.timestamp
        ]
      );
    } catch (err) {
      console.warn("Erreur insertion cheque_events SQLite:", err);
    }
  }
}

/**
 * Reconstitue la chronologie d'audit complète d'un chèque depuis sa création
 */
export async function getChequeFullAuditTimeline(cheque: ChequeRecord): Promise<ChequeAuditEvent[]> {
  const events: ChequeAuditEvent[] = [];
  const db = await getDatabase();

  if (db) {
    try {
      const rows = await db.select<{
        id: string;
        cheque_id: string;
        event_type: ChequeAuditEventType;
        title: string;
        description: string | null;
        reason: string | null;
        from_status: ChequeStatus | null;
        to_status: ChequeStatus | null;
        metadata_json: string | null;
        created_at: string;
      }[]>(
        "SELECT * FROM cheque_events WHERE cheque_id = ? ORDER BY created_at ASC;",
        [cheque.id]
      );

      for (const r of rows) {
        events.push({
          id: r.id,
          chequeId: r.cheque_id,
          eventType: r.event_type,
          title: r.title,
          description: r.description || undefined,
          reason: r.reason || undefined,
          fromStatus: r.from_status || undefined,
          toStatus: r.to_status || undefined,
          metadata: r.metadata_json ? JSON.parse(r.metadata_json) : undefined,
          timestamp: r.created_at
        });
      }
    } catch (e) {
      console.warn("Erreur lecture cheque_events SQLite:", e);
    }
  }

  // Fallback si SQLite vide ou mode web
  if (events.length === 0) {
    const local = getLocalEvents().filter((e) => e.chequeId === cheque.id);
    if (local.length > 0) {
      events.push(...local);
    }
  }

  // Rétrocompatibilité : si aucun événement n'a été enregistré pour ce chèque (ex: chèque créé antérieurement),
  // reconstituer intelligemment la timeline à partir des données historiques existantes
  if (events.length === 0) {
    // 1. Événement Création
    events.push({
      id: `synth-create-${cheque.id}`,
      chequeId: cheque.id,
      eventType: "created",
      title: "Création initiale du chèque",
      description: `Chèque émis au profit de "${cheque.beneficiary}" pour un montant de ${cheque.amount} DA sur ${cheque.bankName}.`,
      toStatus: "saved",
      metadata: {
        amount: cheque.amount,
        beneficiary: cheque.beneficiary,
        bankName: cheque.bankName,
        place: cheque.place
      },
      timestamp: cheque.createdAt
    });

    // 2. Événement Modification si updatedAt > createdAt
    if (cheque.updatedAt && cheque.updatedAt !== cheque.createdAt) {
      events.push({
        id: `synth-update-${cheque.id}`,
        chequeId: cheque.id,
        eventType: "updated",
        title: "Dernière modification enregistrée",
        description: `Coordonnées ou données mises à jour le ${new Date(cheque.updatedAt).toLocaleDateString("fr-FR")}.`,
        timestamp: cheque.updatedAt
      });
    }

    // 3. Événement Remis
    if (cheque.deliveredAt) {
      events.push({
        id: `synth-delivered-${cheque.id}`,
        chequeId: cheque.id,
        eventType: "status_changed",
        title: "Chèque remis au bénéficiaire",
        description: "Le chèque a été marqué comme remis / transmis.",
        toStatus: "remis",
        timestamp: cheque.deliveredAt
      });
    }

    // 4. Événement Encaissé
    if (cheque.cashedAt) {
      events.push({
        id: `synth-cashed-${cheque.id}`,
        chequeId: cheque.id,
        eventType: "status_changed",
        title: "Chèque encaissé / débité",
        description: "Débit confirmé sur le compte bancaire.",
        toStatus: "encaisse",
        timestamp: cheque.cashedAt
      });
    }

    // 5. Événement Annulation
    if (cheque.status === "annule" || cheque.cancelledAt) {
      events.push({
        id: `synth-cancelled-${cheque.id}`,
        chequeId: cheque.id,
        eventType: "cancelled",
        title: "Annulation du chèque",
        description: "Chèque formellement annulé dans l'historique.",
        reason: cheque.cancellationReason || "Motif d'annulation non précisé",
        toStatus: "annule",
        timestamp: cheque.cancelledAt || cheque.updatedAt || cheque.createdAt
      });
    }
  }

  // Toujours fusionner avec les tentatives d'impression physiques issues de print_logs (pour avoir les rejets, échecs et copies)
  try {
    const printLogs = await getPrintAttempts(cheque.id);
    for (const pl of printLogs) {
      const alreadyHasIt = events.some((ev) => ev.id === pl.id || (ev.timestamp === pl.attemptedAt && ev.eventType.includes("print")));
      if (!alreadyHasIt) {
        if (pl.status === "confirmed") {
          events.push({
            id: pl.id,
            chequeId: cheque.id,
            eventType: "printed",
            title: pl.copyNumber > 1 ? `Réimpression (Tirage N°${pl.copyNumber})` : "Premier tirage imprimé",
            description: `Impression papier confirmée sur ${pl.bankName} (${pl.paperFormat || "A4"} · ${pl.placement || "Centre"}).`,
            metadata: {
              copyNumber: pl.copyNumber,
              paperFormat: pl.paperFormat,
              placement: pl.placement,
              bankName: pl.bankName
            },
            timestamp: pl.confirmedAt || pl.attemptedAt
          });
        } else if (pl.status === "failed") {
          events.push({
            id: pl.id,
            chequeId: cheque.id,
            eventType: "print_failed",
            title: `Échec / Rejet d'impression (Tirage N°${pl.copyNumber})`,
            description: "Une anomalie matérielle ou un rejet a été signalé.",
            reason: pl.failureReason || "Incident d'impression non spécifié",
            metadata: {
              copyNumber: pl.copyNumber,
              paperFormat: pl.paperFormat,
              placement: pl.placement
            },
            timestamp: pl.attemptedAt
          });
        }
      }
    }
  } catch {}

  // Trier par ordre chronologique (du plus ancien au plus récent)
  return events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}
