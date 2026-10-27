import Database from "@tauri-apps/plugin-sql";
import type {
  ChequeRecord,
  ChequeStatus,
  BeneficiaryRecord,
  PrintAttemptRecord,
  PrintAttemptStatus,
  ChequeAuditEvent,
  ChequeAuditEventType,
  CompanyRecord,
  BankAccountRecord,
  ChequeBookRecord,
  ChequeAttachmentRecord,
  BankStatementRecord,
  BankStatementLineRecord,
  ReconciliationStatus,
  UserRecord,
  UserRole,
  SecuritySettings,
  AuditLogRecord,
  AuditActionType
} from "../types";

export const HISTORIQUE_STORAGE_KEY = "cheque-studio-history-v1";
export const BENEFICIARIES_STORAGE_KEY = "cheque-studio-beneficiaries-v1";
export const PRINT_LOGS_STORAGE_KEY = "cheque-studio-print-logs-v1";
export const EVENTS_STORAGE_KEY = "cheque-studio-cheque-events-v1";
export const COMPANIES_STORAGE_KEY = "cheque-studio-companies-v1";
export const BANK_ACCOUNTS_STORAGE_KEY = "cheque-studio-bank-accounts-v1";
export const CHEQUE_BOOKS_STORAGE_KEY = "cheque-studio-cheque-books-v1";
export const ATTACHMENTS_STORAGE_KEY = "cheque-studio-attachments-v1";
export const BANK_STATEMENTS_STORAGE_KEY = "cheque-studio-bank-statements-v1";
export const BANK_STATEMENT_LINES_STORAGE_KEY = "cheque-studio-bank-statement-lines-v1";
export const SECURITY_SETTINGS_KEY = "cheque-studio-security-settings-v1";
export const USERS_STORAGE_KEY = "cheque-studio-users-v1";
export const AUDIT_LOGS_STORAGE_KEY = "cheque-studio-audit-logs-v1";
export const ACTIVE_USER_KEY = "vcheque_active_user";
export const ACTIVE_COMPANY_KEY = "vcheque_active_company_id";
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
  companyId?: string;
  accountId?: string;
  chequeBookId?: string;
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
  companyId?: string;
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

    // 0. Table des entreprises (Multi-sociétés)
    await dbInstance.execute(`
      CREATE TABLE IF NOT EXISTS companies (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        legal_form TEXT,
        nif TEXT,
        nis TEXT,
        rc TEXT,
        article_imposition TEXT,
        address TEXT,
        phone TEXT,
        email TEXT,
        logo_url TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT
      );
    `);
    await dbInstance.execute(`CREATE INDEX IF NOT EXISTS idx_companies_active ON companies(is_active);`);

    // Insérer l'entreprise par défaut si table vide
    try {
      const existingCompanies = await dbInstance.select<{ count: number }[]>(`SELECT COUNT(*) as count FROM companies;`);
      if (!existingCompanies || existingCompanies[0]?.count === 0) {
        const now = new Date().toISOString();
        await dbInstance.execute(
          `INSERT INTO companies (id, name, legal_form, is_active, created_at, updated_at)
           VALUES ($1, $2, $3, 1, $4, $5);`,
          ["company-default", "Mon Entreprise", "SARL", now, now]
        );
      }
    } catch {}

    // 1. Créer la table des chèques si elle n'existe pas
    await dbInstance.execute(`
      CREATE TABLE IF NOT EXISTS cheques (
        id TEXT PRIMARY KEY,
        company_id TEXT DEFAULT 'company-default',
        account_id TEXT,
        cheque_book_id TEXT,
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
      await dbInstance.execute(`ALTER TABLE cheques ADD COLUMN company_id TEXT DEFAULT 'company-default';`);
    } catch {}
    try {
      await dbInstance.execute(`ALTER TABLE cheques ADD COLUMN account_id TEXT;`);
    } catch {}
    try {
      await dbInstance.execute(`ALTER TABLE cheques ADD COLUMN cheque_book_id TEXT;`);
    } catch {}
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
      await dbInstance.execute(`CREATE INDEX IF NOT EXISTS idx_cheques_company ON cheques(company_id);`);
      await dbInstance.execute(`CREATE INDEX IF NOT EXISTS idx_cheques_bank ON cheques(bank_template_id);`);
      await dbInstance.execute(`CREATE INDEX IF NOT EXISTS idx_cheques_date ON cheques(date);`);
    } catch {}

    // 3. Table des bénéficiaires et index pour saisie semi-automatique rapide
    await dbInstance.execute(`
      CREATE TABLE IF NOT EXISTS beneficiaries (
        id TEXT PRIMARY KEY,
        company_id TEXT DEFAULT 'company-default',
        name TEXT NOT NULL UNIQUE,
        nickname TEXT,
        phone TEXT,
        rib TEXT,
        note TEXT,
        usage_count INTEGER DEFAULT 1,
        last_used_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT
      );
    `);
    try {
      await dbInstance.execute(`ALTER TABLE beneficiaries ADD COLUMN company_id TEXT DEFAULT 'company-default';`);
    } catch {}
    try {
      await dbInstance.execute(`ALTER TABLE beneficiaries ADD COLUMN rib TEXT;`);
    } catch {}
    await dbInstance.execute(`CREATE INDEX IF NOT EXISTS idx_beneficiaries_name ON beneficiaries(name);`);
    await dbInstance.execute(`CREATE INDEX IF NOT EXISTS idx_beneficiaries_usage ON beneficiaries(usage_count DESC, last_used_at DESC);`);
    try {
      await dbInstance.execute(`CREATE INDEX IF NOT EXISTS idx_beneficiaries_company ON beneficiaries(company_id);`);
    } catch {}

    // 4. Table des journaux d'audit d'impression
    await dbInstance.execute(`
      CREATE TABLE IF NOT EXISTS print_logs (
        id TEXT PRIMARY KEY,
        company_id TEXT DEFAULT 'company-default',
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
    try {
      await dbInstance.execute(`ALTER TABLE print_logs ADD COLUMN company_id TEXT DEFAULT 'company-default';`);
    } catch {}
    await dbInstance.execute(`CREATE INDEX IF NOT EXISTS idx_print_logs_cheque ON print_logs(cheque_id);`);
    await dbInstance.execute(`CREATE INDEX IF NOT EXISTS idx_print_logs_date ON print_logs(attempted_at DESC);`);
    try {
      await dbInstance.execute(`CREATE INDEX IF NOT EXISTS idx_print_logs_company ON print_logs(company_id);`);
    } catch {}

    // 5. Table des événements d'audit complets du chèque
    await dbInstance.execute(`
      CREATE TABLE IF NOT EXISTS cheque_events (
        id TEXT PRIMARY KEY,
        company_id TEXT DEFAULT 'company-default',
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
    try {
      await dbInstance.execute(`ALTER TABLE cheque_events ADD COLUMN company_id TEXT DEFAULT 'company-default';`);
    } catch {}
    await dbInstance.execute(`CREATE INDEX IF NOT EXISTS idx_cheque_events_id ON cheque_events(cheque_id);`);
    await dbInstance.execute(`CREATE INDEX IF NOT EXISTS idx_cheque_events_date ON cheque_events(created_at DESC);`);

    // 6. Table des comptes bancaires de l'entreprise
    await dbInstance.execute(`
      CREATE TABLE IF NOT EXISTS bank_accounts (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        bank_template_id TEXT NOT NULL,
        label TEXT NOT NULL,
        rib_or_iban TEXT NOT NULL,
        agency TEXT,
        balance REAL NOT NULL DEFAULT 0.0,
        currency TEXT NOT NULL DEFAULT 'DZD',
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT
      );
    `);
    await dbInstance.execute(`CREATE INDEX IF NOT EXISTS idx_bank_accounts_company ON bank_accounts(company_id);`);

    // 7. Table des chéquiers (souches de chèques)
    await dbInstance.execute(`
      CREATE TABLE IF NOT EXISTS cheque_books (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        series_name TEXT NOT NULL,
        start_number TEXT NOT NULL,
        end_number TEXT NOT NULL,
        current_number TEXT NOT NULL,
        leaves_total INTEGER NOT NULL,
        leaves_used INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );
    `);
    await dbInstance.execute(`CREATE INDEX IF NOT EXISTS idx_cheque_books_account ON cheque_books(account_id);`);

    // 8. Table des pièces jointes (factures / justificatifs)
    await dbInstance.execute(`
      CREATE TABLE IF NOT EXISTS cheque_attachments (
        id TEXT PRIMARY KEY,
        cheque_id TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        mime_type TEXT NOT NULL,
        local_path TEXT,
        data_base64 TEXT,
        doc_type TEXT,
        doc_reference TEXT,
        doc_amount REAL,
        is_proof_of_debit INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      );
    `);
    await dbInstance.execute(`CREATE INDEX IF NOT EXISTS idx_cheque_attachments_cheque ON cheque_attachments(cheque_id);`);

    // 9. Table des relevés bancaires
    await dbInstance.execute(`
      CREATE TABLE IF NOT EXISTS bank_statements (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_format TEXT NOT NULL,
        statement_date TEXT NOT NULL,
        period_start TEXT,
        period_end TEXT,
        starting_balance REAL,
        ending_balance REAL,
        total_debit REAL DEFAULT 0,
        total_credit REAL DEFAULT 0,
        lines_count INTEGER DEFAULT 0,
        reconciled_count INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      );
    `);
    await dbInstance.execute(`CREATE INDEX IF NOT EXISTS idx_bank_statements_acc ON bank_statements(account_id);`);

    // 10. Table des lignes d'opérations bancaires
    await dbInstance.execute(`
      CREATE TABLE IF NOT EXISTS bank_statement_lines (
        id TEXT PRIMARY KEY,
        statement_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        company_id TEXT NOT NULL,
        operation_date TEXT NOT NULL,
        value_date TEXT,
        label TEXT NOT NULL,
        reference TEXT,
        debit REAL,
        credit REAL,
        balance REAL,
        reconciliation_status TEXT DEFAULT 'unmatched',
        matched_cheque_id TEXT,
        reconciled_at TEXT,
        reconciled_by TEXT,
        confidence_score REAL,
        extracted_cheque_number TEXT
      );
    `);
    await dbInstance.execute(`CREATE INDEX IF NOT EXISTS idx_statement_lines_stmt ON bank_statement_lines(statement_id);`);
    await dbInstance.execute(`CREATE INDEX IF NOT EXISTS idx_statement_lines_match ON bank_statement_lines(matched_cheque_id);`);

    // Migrations légères de colonnes pour bases SQLite déjà créées
    try {
      await dbInstance.execute(`ALTER TABLE cheque_attachments ADD COLUMN doc_type TEXT;`);
    } catch { /* Déjà existante */ }
    try {
      await dbInstance.execute(`ALTER TABLE cheque_attachments ADD COLUMN doc_reference TEXT;`);
    } catch { /* Déjà existante */ }
    try {
      await dbInstance.execute(`ALTER TABLE cheque_attachments ADD COLUMN doc_amount REAL;`);
    } catch { /* Déjà existante */ }
    try {
      await dbInstance.execute(`ALTER TABLE cheque_attachments ADD COLUMN is_proof_of_debit INTEGER DEFAULT 0;`);
    } catch { /* Déjà existante */ }
    try {
      await dbInstance.execute(`ALTER TABLE cheques ADD COLUMN reconciled_line_id TEXT;`);
    } catch { /* Déjà existante */ }
    try {
      await dbInstance.execute(`ALTER TABLE cheques ADD COLUMN reconciled_statement_id TEXT;`);
    } catch { /* Déjà existante */ }
    try {
      await dbInstance.execute(`ALTER TABLE cheques ADD COLUMN reconciled_at TEXT;`);
    } catch { /* Déjà existante */ }
    try {
      await dbInstance.execute(`ALTER TABLE cheques ADD COLUMN proof_attachment_id TEXT;`);
    } catch { /* Déjà existante */ }
    try {
      await dbInstance.execute(`ALTER TABLE cheques ADD COLUMN is_cashed_declared_without_proof INTEGER DEFAULT 0;`);
    } catch { /* Déjà existante */ }

    // 11. Table des utilisateurs (RBAC)
    await dbInstance.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        role TEXT NOT NULL,
        pin_hash TEXT,
        pin_salt TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL,
        last_login_at TEXT
      );
    `);

    // 12. Table du grand journal d'audit (Audit Trail)
    await dbInstance.execute(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        company_id TEXT,
        timestamp TEXT NOT NULL,
        user_id TEXT NOT NULL,
        user_name TEXT NOT NULL,
        user_role TEXT NOT NULL,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT,
        description TEXT NOT NULL,
        metadata TEXT
      );
    `);
    await dbInstance.execute(`CREATE INDEX IF NOT EXISTS idx_audit_logs_time ON audit_logs(timestamp);`);
    await dbInstance.execute(`CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);`);

    // 13. Migration transparente depuis localStorage si les tables SQLite sont vides
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

  // Cloisonnement par entreprise
  const targetCompanyId = params.companyId || getActiveCompanyId();
  if (targetCompanyId === "company-default") {
    conditions.push("(company_id = ? OR company_id IS NULL OR company_id = '')");
    queryParams.push(targetCompanyId);
  } else {
    conditions.push("company_id = ?");
    queryParams.push(targetCompanyId);
  }

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
    conditions.push("(bank_template_id = ? OR LOWER(bank_name) = ? OR LOWER(bank_name) LIKE ?)");
    queryParams.push(bankFilter, bankFilter.toLowerCase(), `%${bankFilter.toLowerCase()}%`);
  }

  // Filtre période début / fin
  if (startDate) {
    conditions.push("(date >= ? OR (substr(date, 7, 4) || '-' || substr(date, 4, 2) || '-' || substr(date, 1, 2)) >= ?)");
    queryParams.push(startDate, startDate);
  }
  if (endDate) {
    conditions.push("(date <= ? OR (substr(date, 7, 4) || '-' || substr(date, 4, 2) || '-' || substr(date, 1, 2)) <= ?)");
    queryParams.push(endDate, endDate);
  }

  // Filtres avancés multi-critères
  if (params.accountId && params.accountId !== "all") {
    conditions.push("account_id = ?");
    queryParams.push(params.accountId);
  }
  if (params.chequeBookId && params.chequeBookId !== "all") {
    conditions.push("cheque_book_id = ?");
    queryParams.push(params.chequeBookId);
  }
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

    // 2. Statistiques globales scopées par entreprise
    const targetCompId = params.companyId || getActiveCompanyId();
    const compCondition = targetCompId === "company-default"
      ? "(company_id = ? OR company_id IS NULL OR company_id = '')"
      : "company_id = ?";
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
      FROM cheques
      WHERE ${compCondition};
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
    }[]>(statsSql, [targetCompId]);

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
        id, company_id as companyId, account_id as accountId, cheque_book_id as chequeBookId,
        amount, amount_numeric, beneficiary, place, date, cheque_number as chequeNumber,
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
        id, company_id as companyId, account_id as accountId, cheque_book_id as chequeBookId,
        amount, amount_numeric, beneficiary, place, date, cheque_number as chequeNumber,
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
    const compId = record.companyId || getActiveCompanyId();

    await db.execute(
      `INSERT OR REPLACE INTO cheques (
        id, company_id, account_id, cheque_book_id, amount, amount_numeric, beneficiary, place, date, cheque_number,
        reference, cancellation_reason, cancelled_at, delivered_at, cashed_at,
        bank_template_id, bank_name, status, is_crossed, crossed_with_text,
        show_cheque_number, print_count, created_at, updated_at, printed_at, last_printed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26);`,
      [
        record.id,
        compId,
        record.accountId || null,
        record.chequeBookId || null,
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

    const targetCompanyId = params.companyId || getActiveCompanyId();
    if (targetCompanyId === "company-default") {
      conditions.push("(company_id = ? OR company_id IS NULL OR company_id = '')");
      queryParams.push(targetCompanyId);
    } else {
      conditions.push("company_id = ?");
      queryParams.push(targetCompanyId);
    }

    if (searchQuery.trim()) {
      const term = `%${searchQuery.trim().toLowerCase()}%`;
      conditions.push("(LOWER(name) LIKE ? OR (nickname IS NOT NULL AND LOWER(nickname) LIKE ?) OR (note IS NOT NULL AND LOWER(note) LIKE ?))");
      queryParams.push(term, term, term);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countSql = `SELECT COUNT(*) as count FROM beneficiaries ${whereClause};`;
    const countResult = await db.select<{ count: number }[]>(countSql, queryParams);
    const totalCount = countResult[0]?.count ?? 0;

    let mostUsedName = "—";
    let mostUsedCount = 0;
    try {
      const topSql = `SELECT name, usage_count FROM beneficiaries ${whereClause} ORDER BY usage_count DESC, last_used_at DESC LIMIT 1;`;
      const topResult = await db.select<{ name: string; usage_count: number }[]>(topSql, queryParams);
      if (topResult && topResult[0]) {
        mostUsedName = topResult[0].name || "—";
        mostUsedCount = topResult[0].usage_count || 0;
      }
    } catch {}

    const stats: BeneficiaryStats = {
      totalCount,
      mostUsedName,
      mostUsedCount
    };

    const offset = Math.max(0, (page - 1) * pageSize);
    const selectSql = `
      SELECT 
        id, company_id as companyId, name, nickname, phone, rib, note,
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
export async function searchBeneficiaries(query: string, limit = 8, companyId?: string): Promise<BeneficiaryRecord[]> {
  const db = await getDatabase();
  if (!db) {
    return searchLocalBeneficiaries(query, limit);
  }

  try {
    const compId = companyId || getActiveCompanyId();
    const compCondition = compId === "company-default"
      ? "(company_id = ? OR company_id IS NULL OR company_id = '')"
      : "company_id = ?";

    const q = query.trim().toLowerCase();
    if (q) {
      const term = `%${q}%`;
      return await db.select<BeneficiaryRecord[]>(
        `SELECT 
          id, company_id as companyId, name, nickname, phone, rib, note,
          usage_count as usageCount,
          last_used_at as lastUsedAt,
          created_at as createdAt,
          updated_at as updatedAt
        FROM beneficiaries
        WHERE ${compCondition} AND (LOWER(name) LIKE ? OR (nickname IS NOT NULL AND LOWER(nickname) LIKE ?))
        ORDER BY 
          CASE 
            WHEN LOWER(name) = ? THEN 0
            WHEN LOWER(name) LIKE ? THEN 1
            ELSE 2
          END,
          usage_count DESC,
          last_used_at DESC
        LIMIT ?;`,
        [compId, term, term, q, `${q}%`, limit]
      );
    } else {
      return await db.select<BeneficiaryRecord[]>(
        `SELECT 
          id, company_id as companyId, name, nickname, phone, rib, note,
          usage_count as usageCount,
          last_used_at as lastUsedAt,
          created_at as createdAt,
          updated_at as updatedAt
        FROM beneficiaries
        WHERE ${compCondition}
        ORDER BY usage_count DESC, last_used_at DESC
        LIMIT ?;`,
        [compId, limit]
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
export async function autoRecordBeneficiary(name: string, companyId?: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed || trimmed === "Bénéficiaire non spécifié" || trimmed === "Entreprise Exemple SARL") return;

  const compId = companyId || getActiveCompanyId();
  autoRecordLocalBeneficiary(trimmed, compId);

  const db = await getDatabase();
  if (!db) return;

  try {
    const now = new Date().toISOString();
    const compCondition = compId === "company-default"
      ? "(company_id = ? OR company_id IS NULL OR company_id = '')"
      : "company_id = ?";

    const existing = await db.select<{ id: string; usage_count: number }[]>(
      `SELECT id, usage_count FROM beneficiaries WHERE LOWER(name) = ? AND ${compCondition} LIMIT 1;`,
      [trimmed.toLowerCase(), compId]
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
        "INSERT INTO beneficiaries (id, company_id, name, usage_count, last_used_at, created_at, updated_at) VALUES ($1, $2, $3, 1, $4, $5, $6);",
        [id, compId, trimmed, now, now, now]
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
  const compId = record.companyId || getActiveCompanyId();
  await db.execute(
    `INSERT OR REPLACE INTO beneficiaries (
      id, company_id, name, nickname, phone, rib, note, usage_count, last_used_at, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11);`,
    [
      record.id,
      compId,
      record.name.trim(),
      record.nickname ? record.nickname.trim() : null,
      record.phone ? record.phone.trim() : null,
      record.rib ? record.rib.trim() : null,
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

/**
 * Récupère tous les bénéficiaires de l'entreprise (pour export complet Excel / CSV)
 */
export async function getAllBeneficiaries(companyId?: string): Promise<BeneficiaryRecord[]> {
  const targetCompanyId = companyId || getActiveCompanyId();
  const db = await getDatabase();
  if (!db) {
    const all = getLocalBeneficiaries();
    return all.filter((b) => {
      return targetCompanyId === "company-default"
        ? (!b.companyId || b.companyId === "company-default")
        : b.companyId === targetCompanyId;
    });
  }

  try {
    const companyClause = targetCompanyId === "company-default"
      ? "(company_id = ? OR company_id IS NULL OR company_id = '')"
      : "company_id = ?";
    const rows = await db.select<BeneficiaryRecord[]>(
      `SELECT id, company_id as companyId, name, nickname, phone, rib, note,
              usage_count as usageCount, last_used_at as lastUsedAt, created_at as createdAt, updated_at as updatedAt
       FROM beneficiaries
       WHERE ${companyClause}
       ORDER BY name ASC;`,
      [targetCompanyId]
    );
    return rows || [];
  } catch (err) {
    console.warn("Erreur getAllBeneficiaries SQLite:", err);
    return [];
  }
}

export interface ImportBeneficiariesResult {
  totalRead: number;
  addedCount: number;
  updatedCount: number;
  errorCount: number;
}

/**
 * Importe par lot des bénéficiaires depuis un tableau d'objets (CSV/Excel)
 */
export async function importBeneficiaries(
  records: Array<{ name: string; nickname?: string; phone?: string; rib?: string; note?: string }>,
  mode: "ignore" | "update" = "update",
  companyId?: string
): Promise<ImportBeneficiariesResult> {
  const targetCompanyId = companyId || getActiveCompanyId();
  let addedCount = 0;
  let updatedCount = 0;
  let errorCount = 0;

  for (const item of records) {
    const trimmed = (item.name || "").trim();
    if (!trimmed) {
      errorCount++;
      continue;
    }

    try {
      const existing = (await searchBeneficiaries(trimmed, 1)).find(
        (b) => b.name.toLowerCase() === trimmed.toLowerCase()
      );

      if (existing) {
        if (mode === "update") {
          await saveBeneficiaryRecord({
            ...existing,
            companyId: targetCompanyId,
            nickname: item.nickname?.trim() || existing.nickname,
            phone: item.phone?.trim() || existing.phone,
            rib: item.rib?.trim() || existing.rib,
            note: item.note?.trim() || existing.note,
            updatedAt: new Date().toISOString()
          });
          updatedCount++;
        }
      } else {
        const id = "ben-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7);
        const now = new Date().toISOString();
        await saveBeneficiaryRecord({
          id,
          companyId: targetCompanyId,
          name: trimmed,
          nickname: item.nickname?.trim() || undefined,
          phone: item.phone?.trim() || undefined,
          rib: item.rib?.trim() || undefined,
          note: item.note?.trim() || undefined,
          usageCount: 1,
          createdAt: now,
          updatedAt: now
        });
        addedCount++;
      }
    } catch {
      errorCount++;
    }
  }

  return { totalRead: records.length, addedCount, updatedCount, errorCount };
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
    const compId = record.companyId || getActiveCompanyId();
    const withComp = { ...record, companyId: compId };
    const list = getLocalRecords().filter((r) => r.id !== record.id);
    list.unshift(withComp);
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

  const targetCompanyId = params.companyId || getActiveCompanyId();

  return all.filter((item) => {
    // 0. Cloisonnement par entreprise
    if (targetCompanyId === "company-default") {
      if (item.companyId && item.companyId !== "company-default") return false;
    } else {
      if (item.companyId !== targetCompanyId) return false;
    }

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
      const bf = bankFilter.toLowerCase();
      const matchId = (item.bankTemplateId || "").toLowerCase() === bf;
      const matchName = (item.bankName || "").toLowerCase().includes(bf);
      if (!matchId && !matchName) return false;
    }

    // Période
    const itemDate = item.date && item.date.includes("/") 
      ? item.date.split("/").reverse().join("-") 
      : (item.date ? item.date.split("T")[0] : "");
    if (startDate && itemDate && itemDate < startDate) return false;
    if (endDate && itemDate && itemDate > endDate) return false;

    // Filtres avancés
    if (params.accountId && params.accountId !== "all" && item.accountId !== params.accountId) return false;
    if (params.chequeBookId && params.chequeBookId !== "all" && item.chequeBookId !== params.chequeBookId) return false;
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
  const targetCompanyId = params.companyId || getActiveCompanyId();

  // Filtrer par entreprise active pour isoler les statistiques et les enregistrements
  const companyRecords = all.filter((item) => {
    if (targetCompanyId === "company-default") {
      return !item.companyId || item.companyId === "company-default";
    }
    return item.companyId === targetCompanyId;
  });

  let totalDinar = 0;
  let printedCount = 0;
  let savedCount = 0;
  let readyCount = 0;
  let deliveredCount = 0;
  let cashedCount = 0;
  let cancelledCount = 0;

  for (const item of companyRecords) {
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

  const filtered = filterLocalCheques(companyRecords, params);

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
      totalCount: companyRecords.length,
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
    const compId = record.companyId || getActiveCompanyId();
    const withComp = { ...record, companyId: compId };
    const list = getLocalBeneficiaries().filter((b) => b.id !== record.id);
    list.unshift(withComp);
    localStorage.setItem(BENEFICIARIES_STORAGE_KEY, JSON.stringify(list));
  } catch {}
}

function deleteLocalBeneficiaryMirror(id: string): void {
  try {
    const list = getLocalBeneficiaries().filter((b) => b.id !== id);
    localStorage.setItem(BENEFICIARIES_STORAGE_KEY, JSON.stringify(list));
  } catch {}
}

function autoRecordLocalBeneficiary(name: string, companyId?: string): void {
  try {
    const trimmed = name.trim();
    if (!trimmed || trimmed === "Bénéficiaire non spécifié" || trimmed === "Entreprise Exemple SARL") return;
    const targetCompId = companyId || getActiveCompanyId();
    const list = getLocalBeneficiaries();
    const existingIndex = list.findIndex(
      (b) =>
        b.name.toLowerCase() === trimmed.toLowerCase() &&
        (targetCompId === "company-default"
          ? (!b.companyId || b.companyId === "company-default")
          : b.companyId === targetCompId)
    );
    const now = new Date().toISOString();
    if (existingIndex >= 0) {
      list[existingIndex].usageCount = (list[existingIndex].usageCount || 1) + 1;
      list[existingIndex].lastUsedAt = now;
      list[existingIndex].updatedAt = now;
    } else {
      list.unshift({
        id: "ben-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7),
        companyId: targetCompId,
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

function searchLocalBeneficiaries(query: string, limit = 8, companyId?: string): BeneficiaryRecord[] {
  const all = getLocalBeneficiaries();
  const targetCompanyId = companyId || getActiveCompanyId();
  const companyBeneficiaries = all.filter((b) => {
    if (targetCompanyId === "company-default") {
      return !b.companyId || b.companyId === "company-default";
    }
    return b.companyId === targetCompanyId;
  });

  const q = query.trim().toLowerCase();
  let filtered = companyBeneficiaries;
  if (q) {
    filtered = companyBeneficiaries.filter(
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
  const targetCompanyId = params.companyId || getActiveCompanyId();

  // Filtrer strictement par entreprise active
  const companyBeneficiaries = all.filter((b) => {
    if (targetCompanyId === "company-default") {
      return !b.companyId || b.companyId === "company-default";
    }
    return b.companyId === targetCompanyId;
  });

  const q = searchQuery.trim().toLowerCase();
  const filtered = q
    ? companyBeneficiaries.filter(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          (b.nickname && b.nickname.toLowerCase().includes(q)) ||
          (b.note && b.note.toLowerCase().includes(q))
      )
    : companyBeneficiaries;

  filtered.sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));

  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const validPage = Math.min(Math.max(1, page), totalPages);
  const start = (validPage - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize);

  const mostUsed = companyBeneficiaries.reduce<BeneficiaryRecord | null>((acc, curr) => {
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
      totalCount,
      mostUsedName: mostUsed ? mostUsed.name : "—",
      mostUsedCount: mostUsed ? mostUsed.usageCount || 0 : 0
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

/* ==========================================================================
   MODULE MULTI-SOCIÉTÉS / MULTI-ENTREPRISES
   ========================================================================== */

export function getActiveCompanyId(): string {
  try {
    return localStorage.getItem(ACTIVE_COMPANY_KEY) || "company-default";
  } catch {
    return "company-default";
  }
}

export function setActiveCompanyId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_COMPANY_KEY, id);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("vcheque:company-changed", { detail: { companyId: id } }));
    }
  } catch (err) {
    console.warn("Erreur setActiveCompanyId:", err);
  }
}

function getLocalCompanies(): CompanyRecord[] {
  try {
    const raw = localStorage.getItem(COMPANIES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return [
    {
      id: "company-default",
      name: "Mon Entreprise",
      legalForm: "SARL",
      isActive: true,
      createdAt: new Date().toISOString()
    }
  ];
}

function saveLocalCompany(company: CompanyRecord): void {
  try {
    const list = getLocalCompanies();
    const idx = list.findIndex((c) => c.id === company.id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...company, updatedAt: new Date().toISOString() };
    } else {
      list.push({ ...company, createdAt: company.createdAt || new Date().toISOString() });
    }
    localStorage.setItem(COMPANIES_STORAGE_KEY, JSON.stringify(list));
  } catch {}
}

function deleteLocalCompany(id: string): void {
  try {
    const list = getLocalCompanies().filter((c) => c.id !== id);
    localStorage.setItem(COMPANIES_STORAGE_KEY, JSON.stringify(list));
  } catch {}
}

export async function getCompanies(): Promise<CompanyRecord[]> {
  const db = await getDatabase();
  if (!db) {
    return getLocalCompanies();
  }
  try {
    const rows = await db.select<any[]>(`SELECT * FROM companies ORDER BY name ASC;`);
    if (!rows || rows.length === 0) {
      const def = getLocalCompanies()[0];
      await db.execute(
        `INSERT OR IGNORE INTO companies (id, name, legal_form, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, 1, $4, $5);`,
        [def.id, def.name, def.legalForm || null, def.createdAt, def.createdAt]
      );
      return [def];
    }
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      legalForm: r.legal_form || undefined,
      nif: r.nif || undefined,
      nis: r.nis || undefined,
      rc: r.rc || undefined,
      articleImposition: r.article_imposition || undefined,
      address: r.address || undefined,
      phone: r.phone || undefined,
      email: r.email || undefined,
      logoUrl: r.logo_url || undefined,
      isActive: Boolean(r.is_active),
      createdAt: r.created_at,
      updatedAt: r.updated_at || undefined
    }));
  } catch (err) {
    console.warn("Erreur lecture companies SQLite:", err);
    return getLocalCompanies();
  }
}

export async function getActiveCompany(): Promise<CompanyRecord | null> {
  const activeId = getActiveCompanyId();
  const list = await getCompanies();
  return list.find((c) => c.id === activeId) || list[0] || null;
}

export async function saveCompanyRecord(company: CompanyRecord): Promise<void> {
  saveLocalCompany(company);
  const db = await getDatabase();
  if (db) {
    try {
      const now = new Date().toISOString();
      await db.execute(
        `INSERT OR REPLACE INTO companies (
          id, name, legal_form, nif, nis, rc, article_imposition,
          address, phone, email, logo_url, is_active, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14);`,
        [
          company.id,
          company.name.trim(),
          company.legalForm?.trim() || null,
          company.nif?.trim() || null,
          company.nis?.trim() || null,
          company.rc?.trim() || null,
          company.articleImposition?.trim() || null,
          company.address?.trim() || null,
          company.phone?.trim() || null,
          company.email?.trim() || null,
          company.logoUrl || null,
          company.isActive ? 1 : 0,
          company.createdAt || now,
          now
        ]
      );
    } catch (err) {
      console.warn("Erreur enregistrement company SQLite:", err);
    }
  }
}

export async function deleteCompanyRecord(id: string): Promise<boolean> {
  if (id === "company-default") return false;
  deleteLocalCompany(id);
  const db = await getDatabase();
  if (db) {
    try {
      await db.execute(`DELETE FROM companies WHERE id = $1;`, [id]);
      await db.execute(`DELETE FROM cheques WHERE company_id = $1;`, [id]);
      await db.execute(`DELETE FROM beneficiaries WHERE company_id = $1;`, [id]);
      await db.execute(`DELETE FROM bank_accounts WHERE company_id = $1;`, [id]);
    } catch (err) {
      console.warn("Erreur suppression company SQLite:", err);
    }
  }
  if (getActiveCompanyId() === id) {
    setActiveCompanyId("company-default");
  }
  return true;
}

/* ==========================================================================
   MODULE RELEVÉ DE COMPTE / AUDIT COMPLET PAR BÉNÉFICIAIRE
   ========================================================================== */

export interface BeneficiaryStatementResult {
  beneficiary: BeneficiaryRecord | null;
  totalAmountNumeric: number;
  totalChequesCount: number;
  cashedCount: number;
  printedCount: number;
  cancelledCount: number;
  cheques: ChequeRecord[];
}

export async function getBeneficiaryStatement(beneficiaryName: string, companyId?: string): Promise<BeneficiaryStatementResult> {
  const targetCompanyId = companyId || getActiveCompanyId();
  const db = await getDatabase();
  const trimmed = beneficiaryName.trim();

  if (db) {
    try {
      const companyClause = targetCompanyId === "company-default"
        ? "(company_id = ? OR company_id IS NULL OR company_id = '')"
        : "company_id = ?";

      const benRows = await db.select<any[]>(
        `SELECT id, company_id as companyId, name, nickname, phone, rib, note,
                usage_count as usageCount, last_used_at as lastUsedAt, created_at as createdAt, updated_at as updatedAt
         FROM beneficiaries 
         WHERE LOWER(name) = LOWER(?) AND ${companyClause} 
         LIMIT 1;`,
        [trimmed, targetCompanyId]
      );
      const benRecord: BeneficiaryRecord | null = benRows && benRows[0] ? benRows[0] : null;

      const chequesRows = await db.select<any[]>(
        `SELECT 
          id, company_id as companyId, account_id as accountId, cheque_book_id as chequeBookId,
          amount, amount_numeric, beneficiary, place, date, cheque_number as chequeNumber,
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
        WHERE LOWER(beneficiary) = LOWER(?) AND ${companyClause} 
        ORDER BY created_at DESC;`,
        [trimmed, targetCompanyId]
      );

      const chequesList: ChequeRecord[] = chequesRows || [];

      let totalAmountNumeric = 0;
      let cashedCount = 0;
      let printedCount = 0;
      let cancelledCount = 0;

      for (const ch of chequesList) {
        const val = parseFloat((ch.amount || "0").replace(/\s/g, "").replace(",", ".")) || 0;
        if (ch.status !== "annule") {
          totalAmountNumeric += val;
        }
        if (ch.status === "encaisse") cashedCount++;
        else if (ch.status === "printed" || ch.status === "remis") printedCount++;
        else if (ch.status === "annule") cancelledCount++;
      }

      return {
        beneficiary: benRecord,
        totalAmountNumeric,
        totalChequesCount: chequesList.length,
        cashedCount,
        printedCount,
        cancelledCount,
        cheques: chequesList
      };
    } catch (err) {
      console.warn("Erreur getBeneficiaryStatement SQLite:", err);
    }
  }

  // Fallback LocalStorage
  const allCheques = getLocalRecords().filter((c) => {
    const matchCompany = targetCompanyId === "company-default"
      ? (!c.companyId || c.companyId === "company-default")
      : c.companyId === targetCompanyId;
    return matchCompany && c.beneficiary.trim().toLowerCase() === trimmed.toLowerCase();
  });

  const allBens = getLocalBeneficiaries();
  const benRecord = allBens.find((b) => b.name.trim().toLowerCase() === trimmed.toLowerCase()) || null;

  let totalAmountNumeric = 0;
  let cashedCount = 0;
  let printedCount = 0;
  let cancelledCount = 0;

  for (const ch of allCheques) {
    const val = parseFloat((ch.amount || "0").replace(/\s/g, "").replace(",", ".")) || 0;
    if (ch.status !== "annule") {
      totalAmountNumeric += val;
    }
    if (ch.status === "encaisse") cashedCount++;
    else if (ch.status === "printed" || ch.status === "remis") printedCount++;
    else if (ch.status === "annule") cancelledCount++;
  }

  return {
    beneficiary: benRecord,
    totalAmountNumeric,
    totalChequesCount: allCheques.length,
    cashedCount,
    printedCount,
    cancelledCount,
    cheques: allCheques
  };
}

/* ==========================================================================
   MODULE COMPTES BANCAIRES & CHÉQUIERS
   ========================================================================== */

function getLocalBankAccounts(companyId: string): BankAccountRecord[] {
  try {
    const raw = localStorage.getItem(BANK_ACCOUNTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((a) => a.companyId === companyId);
  } catch {
    return [];
  }
}

function saveLocalBankAccount(account: BankAccountRecord): void {
  try {
    const raw = localStorage.getItem(BANK_ACCOUNTS_STORAGE_KEY);
    const list: BankAccountRecord[] = raw ? JSON.parse(raw) : [];
    if (account.isDefault) {
      list.forEach((a) => {
        if (a.companyId === account.companyId) a.isDefault = false;
      });
    }
    const idx = list.findIndex((a) => a.id === account.id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...account, updatedAt: new Date().toISOString() };
    } else {
      list.push({ ...account, createdAt: account.createdAt || new Date().toISOString() });
    }
    localStorage.setItem(BANK_ACCOUNTS_STORAGE_KEY, JSON.stringify(list));
  } catch {}
}

function deleteLocalBankAccount(id: string): void {
  try {
    const raw = localStorage.getItem(BANK_ACCOUNTS_STORAGE_KEY);
    if (!raw) return;
    const list: BankAccountRecord[] = JSON.parse(raw);
    localStorage.setItem(BANK_ACCOUNTS_STORAGE_KEY, JSON.stringify(list.filter((a) => a.id !== id)));
  } catch {}
}

export async function getBankAccounts(companyId?: string): Promise<BankAccountRecord[]> {
  const targetCompanyId = companyId || getActiveCompanyId();
  const db = await getDatabase();
  if (!db) return getLocalBankAccounts(targetCompanyId);

  try {
    const companyClause = targetCompanyId === "company-default"
      ? "(company_id = ? OR company_id IS NULL OR company_id = '')"
      : "company_id = ?";
    const rows = await db.select<any[]>(
      `SELECT * FROM bank_accounts WHERE ${companyClause} ORDER BY is_default DESC, label ASC;`,
      [targetCompanyId]
    );
    return (rows || []).map((r) => ({
      id: r.id,
      companyId: r.company_id,
      bankTemplateId: r.bank_template_id,
      label: r.label,
      ribOrIban: r.rib_or_iban,
      agency: r.agency || undefined,
      balance: Number(r.balance) || 0,
      currency: r.currency || "DZD",
      isDefault: Boolean(r.is_default),
      createdAt: r.created_at,
      updatedAt: r.updated_at || undefined
    }));
  } catch (err) {
    console.warn("Erreur getBankAccounts SQLite:", err);
    return getLocalBankAccounts(targetCompanyId);
  }
}

export async function saveBankAccount(account: BankAccountRecord): Promise<void> {
  saveLocalBankAccount(account);
  const db = await getDatabase();
  if (db) {
    try {
      const now = new Date().toISOString();
      if (account.isDefault) {
        await db.execute(`UPDATE bank_accounts SET is_default = 0 WHERE company_id = $1;`, [account.companyId]);
      }
      await db.execute(
        `INSERT OR REPLACE INTO bank_accounts (
          id, company_id, bank_template_id, label, rib_or_iban, agency,
          balance, currency, is_default, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11);`,
        [
          account.id,
          account.companyId,
          account.bankTemplateId,
          account.label,
          account.ribOrIban,
          account.agency || null,
          account.balance,
          account.currency || "DZD",
          account.isDefault ? 1 : 0,
          account.createdAt || now,
          now
        ]
      );
    } catch (err) {
      console.warn("Erreur saveBankAccount SQLite:", err);
    }
  }
}

export async function deleteBankAccount(id: string): Promise<void> {
  deleteLocalBankAccount(id);
  const db = await getDatabase();
  if (db) {
    try {
      await db.execute(`DELETE FROM bank_accounts WHERE id = $1;`, [id]);
      await db.execute(`DELETE FROM cheque_books WHERE account_id = $1;`, [id]);
    } catch (err) {
      console.warn("Erreur deleteBankAccount SQLite:", err);
    }
  }
}

// Chéquiers
function getLocalChequeBooks(accountId: string): ChequeBookRecord[] {
  try {
    const raw = localStorage.getItem(CHEQUE_BOOKS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((b) => b.accountId === accountId);
  } catch {
    return [];
  }
}

function saveLocalChequeBook(book: ChequeBookRecord): void {
  try {
    const raw = localStorage.getItem(CHEQUE_BOOKS_STORAGE_KEY);
    const list: ChequeBookRecord[] = raw ? JSON.parse(raw) : [];
    if (book.isActive) {
      list.forEach((b) => {
        if (b.accountId === book.accountId) b.isActive = false;
      });
    }
    const idx = list.findIndex((b) => b.id === book.id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...book };
    } else {
      list.push(book);
    }
    localStorage.setItem(CHEQUE_BOOKS_STORAGE_KEY, JSON.stringify(list));
  } catch {}
}

export async function getChequeBooks(accountId: string): Promise<ChequeBookRecord[]> {
  const db = await getDatabase();
  if (!db) return getLocalChequeBooks(accountId);
  try {
    const rows = await db.select<any[]>(
      `SELECT * FROM cheque_books WHERE account_id = $1 ORDER BY is_active DESC, created_at DESC;`,
      [accountId]
    );
    return (rows || []).map((r) => ({
      id: r.id,
      accountId: r.account_id,
      seriesName: r.series_name,
      startNumber: r.start_number,
      endNumber: r.end_number,
      currentNumber: r.current_number,
      leavesTotal: r.leaves_total,
      leavesUsed: r.leaves_used,
      isActive: Boolean(r.is_active),
      createdAt: r.created_at
    }));
  } catch (err) {
    console.warn("Erreur getChequeBooks SQLite:", err);
    return getLocalChequeBooks(accountId);
  }
}

export async function saveChequeBook(book: ChequeBookRecord): Promise<void> {
  saveLocalChequeBook(book);
  const db = await getDatabase();
  if (db) {
    try {
      if (book.isActive) {
        await db.execute(`UPDATE cheque_books SET is_active = 0 WHERE account_id = $1;`, [book.accountId]);
      }
      await db.execute(
        `INSERT OR REPLACE INTO cheque_books (
          id, account_id, series_name, start_number, end_number,
          current_number, leaves_total, leaves_used, is_active, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);`,
        [
          book.id,
          book.accountId,
          book.seriesName,
          book.startNumber,
          book.endNumber,
          book.currentNumber,
          book.leavesTotal,
          book.leavesUsed,
          book.isActive ? 1 : 0,
          book.createdAt
        ]
      );
    } catch (err) {
      console.warn("Erreur saveChequeBook SQLite:", err);
    }
  }
}

export async function incrementChequeBookNumber(bookId: string): Promise<string | null> {
  const db = await getDatabase();
  if (!db) {
    const raw = localStorage.getItem(CHEQUE_BOOKS_STORAGE_KEY);
    if (!raw) return null;
    const list: ChequeBookRecord[] = JSON.parse(raw);
    const item = list.find((b) => b.id === bookId);
    if (!item) return null;
    const currentNum = parseInt(item.currentNumber, 10);
    const endNum = parseInt(item.endNumber, 10);
    if (!isNaN(currentNum) && currentNum < endNum) {
      const nextNum = String(currentNum + 1).padStart(item.currentNumber.length, "0");
      item.currentNumber = nextNum;
      item.leavesUsed += 1;
      localStorage.setItem(CHEQUE_BOOKS_STORAGE_KEY, JSON.stringify(list));
      return nextNum;
    }
    return null;
  }

  try {
    const rows = await db.select<any[]>(`SELECT * FROM cheque_books WHERE id = $1 LIMIT 1;`, [bookId]);
    if (!rows || rows.length === 0) return null;
    const item = rows[0];
    const currentNum = parseInt(item.current_number, 10);
    const endNum = parseInt(item.end_number, 10);
    if (!isNaN(currentNum) && currentNum < endNum) {
      const nextNum = String(currentNum + 1).padStart(item.current_number.length, "0");
      await db.execute(
        `UPDATE cheque_books SET current_number = $1, leaves_used = leaves_used + 1 WHERE id = $2;`,
        [nextNum, bookId]
      );
      return nextNum;
    }
    return null;
  } catch (err) {
    console.warn("Erreur incrementChequeBookNumber SQLite:", err);
    return null;
  }
}

export interface AccountChequesSummary {
  chequesCount: number;
  totalAmount: number;
}

/**
 * Calcule le nombre et le montant total des chèques émis depuis un compte bancaire donné
 */
export async function getAccountChequesSummary(accountId: string): Promise<AccountChequesSummary> {
  const db = await getDatabase();
  if (!db) {
    const list = getLocalRecords().filter((c) => c.accountId === accountId && c.status !== "annule");
    const totalAmount = list.reduce(
      (sum, c) => sum + (parseFloat((c.amount || "0").replace(/\s/g, "").replace(",", ".")) || 0),
      0
    );
    return { chequesCount: list.length, totalAmount };
  }

  try {
    const rows = await db.select<{ count: number; total: number }[]>(
      `SELECT COUNT(*) as count, COALESCE(SUM(amount_numeric), 0) as total FROM cheques WHERE account_id = ? AND status != 'annule';`,
      [accountId]
    );
    return {
      chequesCount: rows[0]?.count || 0,
      totalAmount: rows[0]?.total || 0
    };
  } catch (err) {
    console.warn("Erreur getAccountChequesSummary SQLite:", err);
    return { chequesCount: 0, totalAmount: 0 };
  }
}

/**
 * Met à jour le solde d'un compte bancaire
 */
export async function updateAccountBalance(accountId: string, amountChange: number): Promise<void> {
  const db = await getDatabase();
  if (db) {
    await db.execute(
      `UPDATE bank_accounts SET balance = balance + ?, updated_at = ? WHERE id = ?;`,
      [amountChange, new Date().toISOString(), accountId]
    );
  }
}

/**
 * Récupère le carnet de chèques actif associé à un compte bancaire
 */
export async function getActiveChequeBookForAccount(accountId: string): Promise<ChequeBookRecord | null> {
  const books = await getChequeBooks(accountId);
  const active = books.find((b) => b.isActive && b.leavesUsed < b.leavesTotal);
  return active || books[0] || null;
}

/* ==========================================================================
   MODULE PIÈCES JOINTES (FACTURES & JUSTIFICATIFS NUMÉRIQUES)
   ========================================================================== */

function getLocalChequeAttachments(chequeId: string): ChequeAttachmentRecord[] {
  try {
    const raw = localStorage.getItem(ATTACHMENTS_STORAGE_KEY);
    if (!raw) return [];
    const list: ChequeAttachmentRecord[] = JSON.parse(raw);
    return list.filter((a) => a.chequeId === chequeId);
  } catch {
    return [];
  }
}

function saveLocalChequeAttachment(att: ChequeAttachmentRecord): void {
  try {
    const raw = localStorage.getItem(ATTACHMENTS_STORAGE_KEY);
    const list: ChequeAttachmentRecord[] = raw ? JSON.parse(raw) : [];
    const idx = list.findIndex((a) => a.id === att.id);
    if (idx >= 0) {
      list[idx] = att;
    } else {
      list.push(att);
    }
    localStorage.setItem(ATTACHMENTS_STORAGE_KEY, JSON.stringify(list));
  } catch {}
}

function deleteLocalChequeAttachment(id: string): void {
  try {
    const raw = localStorage.getItem(ATTACHMENTS_STORAGE_KEY);
    if (!raw) return;
    const list: ChequeAttachmentRecord[] = JSON.parse(raw);
    localStorage.setItem(ATTACHMENTS_STORAGE_KEY, JSON.stringify(list.filter((a) => a.id !== id)));
  } catch {}
}

export async function getChequeAttachments(chequeId: string): Promise<ChequeAttachmentRecord[]> {
  const db = await getDatabase();
  if (!db) return getLocalChequeAttachments(chequeId);
  try {
    const rows = await db.select<any[]>(
      `SELECT id, cheque_id as chequeId, file_name as fileName, file_size as fileSize,
              mime_type as mimeType, local_path as localPath, data_base64 as dataBase64,
              doc_type as docType, doc_reference as docReference, doc_amount as docAmount,
              is_proof_of_debit as isProofOfDebit, created_at as createdAt
       FROM cheque_attachments 
       WHERE cheque_id = $1 
       ORDER BY created_at DESC;`,
      [chequeId]
    );
    return (rows || []).map((r) => ({
      ...r,
      isProofOfDebit: Boolean(r.isProofOfDebit)
    }));
  } catch (err) {
    console.warn("Erreur getChequeAttachments SQLite:", err);
    return getLocalChequeAttachments(chequeId);
  }
}

export async function saveChequeAttachment(att: ChequeAttachmentRecord): Promise<void> {
  saveLocalChequeAttachment(att);
  const db = await getDatabase();
  if (db) {
    try {
      await db.execute(
        `INSERT OR REPLACE INTO cheque_attachments (
          id, cheque_id, file_name, file_size, mime_type, local_path, data_base64,
          doc_type, doc_reference, doc_amount, is_proof_of_debit, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12);`,
        [
          att.id,
          att.chequeId,
          att.fileName,
          att.fileSize,
          att.mimeType,
          att.localPath || null,
          att.dataBase64 || null,
          att.docType || "other",
          att.docReference || null,
          att.docAmount || null,
          att.isProofOfDebit ? 1 : 0,
          att.createdAt
        ]
      );
    } catch (err) {
      console.warn("Erreur saveChequeAttachment SQLite:", err);
    }
  }
}

export async function deleteChequeAttachment(id: string): Promise<void> {
  deleteLocalChequeAttachment(id);
  const db = await getDatabase();
  if (db) {
    try {
      await db.execute(`DELETE FROM cheque_attachments WHERE id = $1;`, [id]);
    } catch (err) {
      console.warn("Erreur deleteChequeAttachment SQLite:", err);
    }
  }
}

/* ==========================================================================
   MODULE TRAITEMENT EN LOT : ENREGISTREMENT DE PLUSIEURS CHÈQUES
   ========================================================================== */

export async function saveBatchCheques(
  records: ChequeRecord[],
  autoRecordBen = true
): Promise<{ success: boolean; count: number }> {
  if (records.length === 0) return { success: true, count: 0 };

  const db = await getDatabase();
  const compId = getActiveCompanyId();

  // 1. Mise à jour miroir LocalStorage
  try {
    const existing = getLocalRecords();
    const map = new Map<string, ChequeRecord>(existing.map((c) => [c.id, c]));
    for (const r of records) {
      const recWithComp = { ...r, companyId: r.companyId || compId };
      map.set(r.id, recWithComp);
      if (autoRecordBen && r.beneficiary && r.beneficiary !== "Bénéficiaire non spécifié") {
        autoRecordLocalBeneficiary(r.beneficiary, r.companyId || compId);
      }
    }
    localStorage.setItem(HISTORIQUE_STORAGE_KEY, JSON.stringify(Array.from(map.values())));
  } catch (err) {
    console.warn("Erreur mise à jour locale batch cheques:", err);
  }

  // 2. Base SQLite si disponible
  if (db) {
    try {
      for (const record of records) {
        const rawVal = parseFloat((record.amount || "0").replace(/\s/g, "").replace(",", ".")) || 0;
        const count = typeof record.printCount === "number" ? record.printCount : (record.status === "printed" ? 1 : 0);
        const recordCompId = record.companyId || compId;

        await db.execute(
          `INSERT OR REPLACE INTO cheques (
            id, company_id, account_id, cheque_book_id, amount, amount_numeric, beneficiary, place, date, cheque_number,
            reference, cancellation_reason, cancelled_at, delivered_at, cashed_at,
            bank_template_id, bank_name, status, is_crossed, crossed_with_text,
            show_cheque_number, print_count, created_at, updated_at, printed_at, last_printed_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26);`,
          [
            record.id,
            recordCompId,
            record.accountId || null,
            record.chequeBookId || null,
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
            record.lastPrintedAt || null
          ]
        );

        if (autoRecordBen && record.beneficiary && record.beneficiary !== "Bénéficiaire non spécifié") {
          await autoRecordBeneficiary(record.beneficiary, recordCompId);
        }
      }
    } catch (err) {
      console.error("Erreur insertion SQLite batch cheques:", err);
    }
  }

  return { success: true, count: records.length };
}

/* ==========================================================================
   MODULE RAPPROCHEMENT BANCAIRE : RELEVÉS & LIGNES D'OPÉRATIONS
   ========================================================================== */

function getLocalBankStatements(companyId: string, accountId?: string): BankStatementRecord[] {
  try {
    const raw = localStorage.getItem(BANK_STATEMENTS_STORAGE_KEY);
    if (!raw) return [];
    const list: BankStatementRecord[] = JSON.parse(raw);
    return list.filter((s) => s.companyId === companyId && (!accountId || s.accountId === accountId));
  } catch {
    return [];
  }
}

function saveLocalBankStatement(statement: BankStatementRecord, lines: BankStatementLineRecord[]): void {
  try {
    // 1. Sauvegarder l'en-tête du relevé
    const rawStmts = localStorage.getItem(BANK_STATEMENTS_STORAGE_KEY);
    const stmts: BankStatementRecord[] = rawStmts ? JSON.parse(rawStmts) : [];
    const sIdx = stmts.findIndex((s) => s.id === statement.id);
    if (sIdx >= 0) {
      stmts[sIdx] = statement;
    } else {
      stmts.unshift(statement);
    }
    localStorage.setItem(BANK_STATEMENTS_STORAGE_KEY, JSON.stringify(stmts));

    // 2. Sauvegarder les lignes
    const rawLines = localStorage.getItem(BANK_STATEMENT_LINES_STORAGE_KEY);
    let allLines: BankStatementLineRecord[] = rawLines ? JSON.parse(rawLines) : [];
    // Remplacer les anciennes lignes de ce relevé si présentes
    allLines = allLines.filter((l) => l.statementId !== statement.id);
    allLines.push(...lines);
    localStorage.setItem(BANK_STATEMENT_LINES_STORAGE_KEY, JSON.stringify(allLines));
  } catch (err) {
    console.error("Erreur sauvegarde locale relevé:", err);
  }
}

export async function getBankStatements(companyId: string, accountId?: string): Promise<BankStatementRecord[]> {
  const db = await getDatabase();
  if (!db) return getLocalBankStatements(companyId, accountId);

  try {
    let query = `
      SELECT id, company_id as companyId, account_id as accountId, file_name as fileName,
             file_format as fileFormat, statement_date as statementDate, period_start as periodStart,
             period_end as periodEnd, starting_balance as startingBalance, ending_balance as endingBalance,
             total_debit as totalDebit, total_credit as totalCredit, lines_count as linesCount,
             reconciled_count as reconciledCount, created_at as createdAt
      FROM bank_statements
      WHERE company_id = $1
    `;
    const params: any[] = [companyId];

    if (accountId) {
      query += ` AND account_id = $2`;
      params.push(accountId);
    }

    query += ` ORDER BY statement_date DESC, created_at DESC;`;

    const rows = await db.select<BankStatementRecord[]>(query, params);
    return rows || [];
  } catch (err) {
    console.warn("Erreur getBankStatements SQLite:", err);
    return getLocalBankStatements(companyId, accountId);
  }
}

export async function saveBankStatement(
  statement: BankStatementRecord,
  lines: BankStatementLineRecord[]
): Promise<void> {
  saveLocalBankStatement(statement, lines);
  const db = await getDatabase();
  if (db) {
    try {
      // 1. En-tête
      await db.execute(
        `INSERT OR REPLACE INTO bank_statements (
          id, company_id, account_id, file_name, file_format, statement_date,
          period_start, period_end, starting_balance, ending_balance,
          total_debit, total_credit, lines_count, reconciled_count, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15);`,
        [
          statement.id,
          statement.companyId,
          statement.accountId,
          statement.fileName,
          statement.fileFormat,
          statement.statementDate,
          statement.periodStart || null,
          statement.periodEnd || null,
          statement.startingBalance ?? null,
          statement.endingBalance ?? null,
          statement.totalDebit,
          statement.totalCredit,
          statement.linesCount,
          statement.reconciledCount,
          statement.createdAt
        ]
      );

      // 2. Lignes
      await db.execute(`DELETE FROM bank_statement_lines WHERE statement_id = $1;`, [statement.id]);
      for (const l of lines) {
        await db.execute(
          `INSERT INTO bank_statement_lines (
            id, statement_id, account_id, company_id, operation_date, value_date,
            label, reference, debit, credit, balance, reconciliation_status,
            matched_cheque_id, reconciled_at, reconciled_by, confidence_score, extracted_cheque_number
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17);`,
          [
            l.id,
            l.statementId,
            l.accountId,
            l.companyId,
            l.operationDate,
            l.valueDate || null,
            l.label,
            l.reference || null,
            l.debit ?? null,
            l.credit ?? null,
            l.balance ?? null,
            l.reconciliationStatus,
            l.matchedChequeId || null,
            l.reconciledAt || null,
            l.reconciledBy || null,
            l.confidenceScore ?? null,
            l.extractedChequeNumber || null
          ]
        );
      }
    } catch (err) {
      console.warn("Erreur saveBankStatement SQLite:", err);
    }
  }
}

export async function deleteBankStatement(statementId: string): Promise<void> {
  // 1. LocalStorage
  try {
    const rawStmts = localStorage.getItem(BANK_STATEMENTS_STORAGE_KEY);
    if (rawStmts) {
      const stmts: BankStatementRecord[] = JSON.parse(rawStmts);
      localStorage.setItem(BANK_STATEMENTS_STORAGE_KEY, JSON.stringify(stmts.filter((s) => s.id !== statementId)));
    }
    const rawLines = localStorage.getItem(BANK_STATEMENT_LINES_STORAGE_KEY);
    if (rawLines) {
      const lines: BankStatementLineRecord[] = JSON.parse(rawLines);
      localStorage.setItem(BANK_STATEMENT_LINES_STORAGE_KEY, JSON.stringify(lines.filter((l) => l.statementId !== statementId)));
    }
  } catch {}

  // 2. SQLite
  const db = await getDatabase();
  if (db) {
    try {
      await db.execute(`DELETE FROM bank_statement_lines WHERE statement_id = $1;`, [statementId]);
      await db.execute(`DELETE FROM bank_statements WHERE id = $1;`, [statementId]);
    } catch (err) {
      console.warn("Erreur deleteBankStatement SQLite:", err);
    }
  }
}

export async function getBankStatementLines(
  statementId?: string,
  accountId?: string,
  companyId?: string
): Promise<BankStatementLineRecord[]> {
  const compId = companyId || getActiveCompanyId();
  const db = await getDatabase();

  if (!db) {
    try {
      const raw = localStorage.getItem(BANK_STATEMENT_LINES_STORAGE_KEY);
      if (!raw) return [];
      const list: BankStatementLineRecord[] = JSON.parse(raw);
      return list.filter((l) => {
        if (statementId && l.statementId !== statementId) return false;
        if (accountId && l.accountId !== accountId) return false;
        if (compId && l.companyId !== compId) return false;
        return true;
      });
    } catch {
      return [];
    }
  }

  try {
    let query = `
      SELECT id, statement_id as statementId, account_id as accountId, company_id as companyId,
             operation_date as operationDate, value_date as valueDate, label, reference,
             debit, credit, balance, reconciliation_status as reconciliationStatus,
             matched_cheque_id as matchedChequeId, reconciled_at as reconciledAt,
             reconciled_by as reconciledBy, confidence_score as confidenceScore,
             extracted_cheque_number as extractedChequeNumber
      FROM bank_statement_lines
      WHERE company_id = $1
    `;
    const params: any[] = [compId];

    if (statementId) {
      params.push(statementId);
      query += ` AND statement_id = $${params.length}`;
    }
    if (accountId) {
      params.push(accountId);
      query += ` AND account_id = $${params.length}`;
    }

    query += ` ORDER BY operation_date DESC;`;

    const rows = await db.select<BankStatementLineRecord[]>(query, params);
    return rows || [];
  } catch (err) {
    console.warn("Erreur getBankStatementLines SQLite:", err);
    return [];
  }
}

/**
 * Rapproche un chèque et une ligne de relevé bancaire (lettrage réciproque)
 */
export async function reconcileChequeWithStatementLine(
  chequeId: string,
  statementLineId: string
): Promise<void> {
  const now = new Date().toISOString();

  // 1. Mise à jour LocalStorage
  try {
    // Chèque
    const rawCheques = localStorage.getItem(HISTORIQUE_STORAGE_KEY);
    if (rawCheques) {
      const cheques: ChequeRecord[] = JSON.parse(rawCheques);
      const idx = cheques.findIndex((c) => c.id === chequeId);
      if (idx >= 0) {
        cheques[idx] = {
          ...cheques[idx],
          status: "encaisse",
          cashedAt: now,
          reconciledLineId: statementLineId,
          reconciledAt: now,
          isCashedDeclaredWithoutProof: false
        };
        localStorage.setItem(HISTORIQUE_STORAGE_KEY, JSON.stringify(cheques));
      }
    }

    // Ligne relevé
    const rawLines = localStorage.getItem(BANK_STATEMENT_LINES_STORAGE_KEY);
    if (rawLines) {
      const lines: BankStatementLineRecord[] = JSON.parse(rawLines);
      const lIdx = lines.findIndex((l) => l.id === statementLineId);
      if (lIdx >= 0) {
        lines[lIdx] = {
          ...lines[lIdx],
          reconciliationStatus: "matched_exact",
          matchedChequeId: chequeId,
          reconciledAt: now
        };
        localStorage.setItem(BANK_STATEMENT_LINES_STORAGE_KEY, JSON.stringify(lines));
      }
    }
  } catch (err) {
    console.warn("Erreur rapprochement LocalStorage:", err);
  }

  // 2. Mise à jour SQLite
  const db = await getDatabase();
  if (db) {
    try {
      await db.execute(
        `UPDATE cheques 
         SET status = 'encaisse', cashed_at = $1, reconciled_line_id = $2, reconciled_at = $3, is_cashed_declared_without_proof = 0
         WHERE id = $4;`,
        [now, statementLineId, now, chequeId]
      );

      await db.execute(
        `UPDATE bank_statement_lines 
         SET reconciliation_status = 'matched_exact', matched_cheque_id = $1, reconciled_at = $2
         WHERE id = $3;`,
        [chequeId, now, statementLineId]
      );
    } catch (err) {
      console.warn("Erreur rapprochement SQLite:", err);
    }
  }
}

/**
 * Annule le rapprochement d'un chèque (délitrage)
 */
export async function unreconcileCheque(chequeId: string): Promise<void> {
  // 1. LocalStorage
  try {
    let lineIdToReset: string | undefined;

    const rawCheques = localStorage.getItem(HISTORIQUE_STORAGE_KEY);
    if (rawCheques) {
      const cheques: ChequeRecord[] = JSON.parse(rawCheques);
      const idx = cheques.findIndex((c) => c.id === chequeId);
      if (idx >= 0) {
        lineIdToReset = cheques[idx].reconciledLineId;
        cheques[idx] = {
          ...cheques[idx],
          reconciledLineId: undefined,
          reconciledStatementId: undefined,
          reconciledAt: undefined,
          status: cheques[idx].printedAt ? "printed" : "pret"
        };
        localStorage.setItem(HISTORIQUE_STORAGE_KEY, JSON.stringify(cheques));
      }
    }

    if (lineIdToReset) {
      const rawLines = localStorage.getItem(BANK_STATEMENT_LINES_STORAGE_KEY);
      if (rawLines) {
        const lines: BankStatementLineRecord[] = JSON.parse(rawLines);
        const lIdx = lines.findIndex((l) => l.id === lineIdToReset);
        if (lIdx >= 0) {
          lines[lIdx] = {
            ...lines[lIdx],
            reconciliationStatus: "unmatched",
            matchedChequeId: undefined,
            reconciledAt: undefined
          };
          localStorage.setItem(BANK_STATEMENT_LINES_STORAGE_KEY, JSON.stringify(lines));
        }
      }
    }
  } catch (err) {
    console.warn("Erreur dé-rapprochement LocalStorage:", err);
  }

  // 2. SQLite
  const db = await getDatabase();
  if (db) {
    try {
      await db.execute(
        `UPDATE bank_statement_lines 
         SET reconciliation_status = 'unmatched', matched_cheque_id = NULL, reconciled_at = NULL 
         WHERE matched_cheque_id = $1;`,
        [chequeId]
      );

      await db.execute(
        `UPDATE cheques 
         SET reconciled_line_id = NULL, reconciled_statement_id = NULL, reconciled_at = NULL,
             status = CASE WHEN printed_at IS NOT NULL THEN 'printed' ELSE 'pret' END
         WHERE id = $1;`,
        [chequeId]
      );
    } catch (err) {
      console.warn("Erreur dé-rapprochement SQLite:", err);
    }
  }
}

/**
 * Marque un chèque comme encaissé en mode déclaratif (sans preuve obligatoire)
 */
export async function markChequeAsCashedDeclared(chequeId: string): Promise<void> {
  const now = new Date().toISOString();

  try {
    const rawCheques = localStorage.getItem(HISTORIQUE_STORAGE_KEY);
    if (rawCheques) {
      const cheques: ChequeRecord[] = JSON.parse(rawCheques);
      const idx = cheques.findIndex((c) => c.id === chequeId);
      if (idx >= 0) {
        cheques[idx] = {
          ...cheques[idx],
          status: "encaisse",
          cashedAt: now,
          isCashedDeclaredWithoutProof: true
        };
        localStorage.setItem(HISTORIQUE_STORAGE_KEY, JSON.stringify(cheques));
      }
    }
  } catch {}

  const db = await getDatabase();
  if (db) {
    try {
      await db.execute(
        `UPDATE cheques 
         SET status = 'encaisse', cashed_at = $1, is_cashed_declared_without_proof = 1 
         WHERE id = $2;`,
        [now, chequeId]
      );
    } catch (err) {
      console.warn("Erreur markChequeAsCashedDeclared SQLite:", err);
    }
  }
}

/* ==========================================================================
   MODULE 1.8 : SÉCURITÉ, UTILISATEURS (RBAC) & GRAND JOURNAL D'AUDIT
   ========================================================================== */

export const DEFAULT_SECURITY_SETTINGS: SecuritySettings = {
  isAuthEnabled: false, // Désactivé par défaut pour permettre le mode libre
  autoLockTimeoutMinutes: 5, // Verrouillage après 5 minutes d'inactivité
  requirePinOnDestructiveActions: true,
  autoBackupEnabled: false,
  autoBackupFrequency: "weekly",
  autoBackupRetentionCount: 10
};

export const DEFAULT_ADMIN_USER: UserRecord = {
  id: "user-admin-default",
  username: "admin",
  displayName: "Direction / Administrateur",
  role: "admin",
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z"
};

/**
 * Récupère les paramètres de sécurité
 */
export function getSecuritySettings(): SecuritySettings {
  try {
    const raw = localStorage.getItem(SECURITY_SETTINGS_KEY);
    if (raw) {
      return { ...DEFAULT_SECURITY_SETTINGS, ...JSON.parse(raw) };
    }
  } catch {}
  return DEFAULT_SECURITY_SETTINGS;
}

/**
 * Sauvegarde les paramètres de sécurité
 */
export async function saveSecuritySettings(settings: SecuritySettings): Promise<void> {
  localStorage.setItem(SECURITY_SETTINGS_KEY, JSON.stringify(settings));
}

/**
 * Récupère l'utilisateur actuellement actif dans la session
 */
export function getActiveUser(): UserRecord {
  try {
    const raw = localStorage.getItem(ACTIVE_USER_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return DEFAULT_ADMIN_USER;
}

/**
 * Définit l'utilisateur actif
 */
export function setActiveUser(user: UserRecord): void {
  localStorage.setItem(ACTIVE_USER_KEY, JSON.stringify(user));
}

/**
 * Récupère la liste des utilisateurs autorisés
 */
export async function getUsers(): Promise<UserRecord[]> {
  const db = await getDatabase();
  let list: UserRecord[] = [];

  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    list = raw ? JSON.parse(raw) : [DEFAULT_ADMIN_USER];
  } catch {
    list = [DEFAULT_ADMIN_USER];
  }

  if (db) {
    try {
      const rows = await db.select<any[]>(
        `SELECT id, username, display_name as displayName, role, pin_hash as pinHash,
                pin_salt as pinSalt, is_active as isActive, created_at as createdAt,
                last_login_at as lastLoginAt
         FROM users ORDER BY created_at ASC;`
      );
      if (rows && rows.length > 0) {
        list = rows.map((r) => ({ ...r, isActive: Boolean(r.isActive) }));
      }
    } catch (err) {
      console.warn("Erreur lecture users SQLite:", err);
    }
  }

  if (list.length === 0) {
    list = [DEFAULT_ADMIN_USER];
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(list));
  }

  return list;
}

/**
 * Enregistre ou met à jour un utilisateur
 */
export async function saveUser(user: UserRecord): Promise<void> {
  // 1. LocalStorage
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    const list: UserRecord[] = raw ? JSON.parse(raw) : [DEFAULT_ADMIN_USER];
    if (!list.some((u) => u.role === "admin")) {
      list.unshift(DEFAULT_ADMIN_USER);
    }
    const idx = list.findIndex((u) => u.id === user.id);
    if (idx >= 0) {
      list[idx] = user;
    } else {
      list.push(user);
    }
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(list));
  } catch {}

  // 2. SQLite
  const db = await getDatabase();
  if (db) {
    try {
      await db.execute(
        `INSERT OR REPLACE INTO users (
          id, username, display_name, role, pin_hash, pin_salt, is_active, created_at, last_login_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);`,
        [
          user.id,
          user.username,
          user.displayName,
          user.role,
          user.pinHash || null,
          user.pinSalt || null,
          user.isActive ? 1 : 0,
          user.createdAt,
          user.lastLoginAt || null
        ]
      );
    } catch (err) {
      console.warn("Erreur saveUser SQLite:", err);
    }
  }

  await logAuditEvent("user_update", "user", `Mise à jour du profil utilisateur : ${user.displayName} (${user.role})`);
}

/**
 * Supprime un utilisateur (interdit de supprimer le dernier admin)
 */
export async function deleteUser(id: string): Promise<boolean> {
  const users = await getUsers();
  const target = users.find((u) => u.id === id);
  if (!target || target.role === "admin" || users.length <= 1) return false;

  // LocalStorage
  try {
    const filtered = users.filter((u) => u.id !== id);
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(filtered));
  } catch {}

  // SQLite
  const db = await getDatabase();
  if (db) {
    try {
      await db.execute(`DELETE FROM users WHERE id = $1;`, [id]);
    } catch {}
  }

  await logAuditEvent("user_delete", "user", `Suppression de l'utilisateur : ${target.displayName} (${target.username})`);
  return true;
}

/**
 * Journalise une opération sensible dans l'Audit Trail
 */
export async function logAuditEvent(
  action: AuditActionType,
  entityType: "cheque" | "bank_account" | "bank_statement" | "beneficiary" | "backup" | "user" | "security",
  description: string,
  metadata?: Record<string, any>
): Promise<void> {
  const activeUser = getActiveUser();
  const companyId = getActiveCompanyId();
  const now = new Date().toISOString();

  const auditEntry: AuditLogRecord = {
    id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    companyId,
    timestamp: now,
    userId: activeUser.id,
    userName: activeUser.displayName,
    userRole: activeUser.role,
    action,
    entityType,
    description,
    metadata
  };

  // 1. LocalStorage
  try {
    const raw = localStorage.getItem(AUDIT_LOGS_STORAGE_KEY);
    const logs: AuditLogRecord[] = raw ? JSON.parse(raw) : [];
    logs.unshift(auditEntry);
    // Rétention des 1000 derniers événements en local
    if (logs.length > 1000) logs.length = 1000;
    localStorage.setItem(AUDIT_LOGS_STORAGE_KEY, JSON.stringify(logs));
  } catch {}

  // 2. SQLite
  const db = await getDatabase();
  if (db) {
    try {
      await db.execute(
        `INSERT INTO audit_logs (
          id, company_id, timestamp, user_id, user_name, user_role, action, entity_type, entity_id, description, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11);`,
        [
          auditEntry.id,
          auditEntry.companyId || null,
          auditEntry.timestamp,
          auditEntry.userId,
          auditEntry.userName,
          auditEntry.userRole,
          auditEntry.action,
          auditEntry.entityType,
          auditEntry.entityId || null,
          auditEntry.description,
          metadata ? JSON.stringify(metadata) : null
        ]
      );
    } catch (err) {
      console.warn("Erreur insertion audit_logs SQLite:", err);
    }
  }
}

/**
 * Récupère les entrées du journal d'audit filtrées
 */
export async function getAuditLogs(params?: {
  startDate?: string;
  endDate?: string;
  action?: string;
  searchQuery?: string;
  limit?: number;
}): Promise<AuditLogRecord[]> {
  const limit = params?.limit || 500;
  const db = await getDatabase();

  if (!db) {
    try {
      const raw = localStorage.getItem(AUDIT_LOGS_STORAGE_KEY);
      let list: AuditLogRecord[] = raw ? JSON.parse(raw) : [];

      if (params?.action && params.action !== "all") {
        list = list.filter((l) => l.action === params.action);
      }
      if (params?.startDate) {
        list = list.filter((l) => l.timestamp.slice(0, 10) >= params.startDate!);
      }
      if (params?.endDate) {
        list = list.filter((l) => l.timestamp.slice(0, 10) <= params.endDate!);
      }
      if (params?.searchQuery) {
        const q = params.searchQuery.toLowerCase();
        list = list.filter(
          (l) =>
            l.description.toLowerCase().includes(q) ||
            l.userName.toLowerCase().includes(q) ||
            l.action.toLowerCase().includes(q)
        );
      }
      return list.slice(0, limit);
    } catch {
      return [];
    }
  }

  try {
    let query = `
      SELECT id, company_id as companyId, timestamp, user_id as userId,
             user_name as userName, user_role as userRole, action,
             entity_type as entityType, entity_id as entityId, description, metadata
      FROM audit_logs
      WHERE 1=1
    `;
    const sqlParams: any[] = [];

    if (params?.action && params.action !== "all") {
      sqlParams.push(params.action);
      query += ` AND action = $${sqlParams.length}`;
    }
    if (params?.startDate) {
      sqlParams.push(params.startDate);
      query += ` AND substring(timestamp, 1, 10) >= $${sqlParams.length}`;
    }
    if (params?.endDate) {
      sqlParams.push(params.endDate);
      query += ` AND substring(timestamp, 1, 10) <= $${sqlParams.length}`;
    }
    if (params?.searchQuery) {
      sqlParams.push(`%${params.searchQuery}%`);
      query += ` AND (description LIKE $${sqlParams.length} OR user_name LIKE $${sqlParams.length})`;
    }

    query += ` ORDER BY timestamp DESC LIMIT ${limit};`;

    const rows = await db.select<any[]>(query, sqlParams);
    return (rows || []).map((r) => ({
      ...r,
      metadata: r.metadata ? JSON.parse(r.metadata) : undefined
    }));
  } catch (err) {
    console.warn("Erreur getAuditLogs SQLite:", err);
    return [];
  }
}

/**
 * Vide le journal d'audit
 */
export async function clearAuditLogs(): Promise<void> {
  localStorage.removeItem(AUDIT_LOGS_STORAGE_KEY);
  const db = await getDatabase();
  if (db) {
    try {
      await db.execute(`DELETE FROM audit_logs;`);
    } catch {}
  }
}


