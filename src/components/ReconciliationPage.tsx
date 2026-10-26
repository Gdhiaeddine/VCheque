import React, { useState, useEffect, useMemo } from "react";
import {
  CheckCheck,
  CreditCard,
  FileSpreadsheet,
  Upload,
  Sparkles,
  Download,
  AlertCircle,
  CheckCircle2,
  Clock,
  ArrowRight,
  Filter,
  RefreshCw,
  Search,
  Layers,
  Link2,
  Unlink,
  ShieldCheck,
  FileText,
  AlertTriangle,
  X
} from "lucide-react";
import type {
  ChequeRecord,
  BankAccountRecord,
  BankStatementRecord,
  BankStatementLineRecord
} from "../types";
import {
  getAllFilteredCheques,
  getBankAccounts,
  getBankStatements,
  getBankStatementLines,
  reconcileChequeWithStatementLine,
  unreconcileCheque,
  deleteBankStatement,
  getActiveCompanyId
} from "../services/db";
import {
  analyzeReconciliation,
  type ReconciliationAnalysisResult,
  type ReconciliationMatch
} from "../services/reconciliationEngine";
import { BankStatementImportModal } from "./BankStatementImportModal";
import { exportBankReconciliationToExcel, exportAccountingJournalToExcel } from "../services/exportReports";

interface ReconciliationPageProps {
  activeCompanyId?: string;
  onBackToHome?: () => void;
  onOpenCheckDetails?: (cheque: ChequeRecord) => void;
}

export const ReconciliationPage: React.FC<ReconciliationPageProps> = ({
  activeCompanyId,
  onBackToHome,
  onOpenCheckDetails
}) => {
  const companyId = activeCompanyId || getActiveCompanyId();

  // Données de base
  const [accounts, setAccounts] = useState<BankAccountRecord[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("all");
  const [cheques, setCheques] = useState<ChequeRecord[]>([]);
  const [statements, setStatements] = useState<BankStatementRecord[]>([]);
  const [statementLines, setStatementLines] = useState<BankStatementLineRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Sélections pour rapprochement manuel par paire
  const [selectedChequeId, setSelectedChequeId] = useState<string | null>(null);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);

  // Filtres
  const [chequeFilter, setChequeFilter] = useState<"all" | "circulation" | "reconciled" | "discrepancy">("all");
  const [lineFilter, setLineFilter] = useState<"all" | "unmatched" | "matched">("all");
  const [searchCheque, setSearchCheque] = useState<string>("");
  const [searchLine, setSearchLine] = useState<string>("");

  // Modales
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Chargement des données
  const loadData = async () => {
    setLoading(true);
    try {
      const [accs, stmts, chqList, lines] = await Promise.all([
        getBankAccounts(companyId),
        getBankStatements(companyId),
        getAllFilteredCheques({ companyId }),
        getBankStatementLines(undefined, undefined, companyId)
      ]);

      setAccounts(accs);
      setStatements(stmts);
      setCheques(chqList);
      setStatementLines(lines);
    } catch (err) {
      console.error("Erreur chargement réconciliation:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [companyId]);

  // Analyse du moteur de rapprochement
  const analysis: ReconciliationAnalysisResult = useMemo(() => {
    const accId = selectedAccountId === "all" ? undefined : selectedAccountId;
    return analyzeReconciliation(cheques, statementLines, accId);
  }, [cheques, statementLines, selectedAccountId]);

  // Lancement du rapprochement automatique (applique les correspondances exactes 100%)
  const handleRunAutoReconcile = async () => {
    if (analysis.exactMatches.length === 0) {
      setToastMessage("Aucune nouvelle correspondance exacte à 100% détectée.");
      setTimeout(() => setToastMessage(null), 3500);
      return;
    }

    let count = 0;
    for (const match of analysis.exactMatches) {
      await reconcileChequeWithStatementLine(match.chequeId, match.statementLineId);
      count++;
    }

    setToastMessage(`Rapprochement automatique réussi : ${count} chèque(s) lettré(s) à 100% avec succès.`);
    setTimeout(() => setToastMessage(null), 4000);
    await loadData();
  };

  // Rapprochement manuel de la paire sélectionnée
  const handleManualReconcilePair = async () => {
    if (!selectedChequeId || !selectedLineId) return;

    await reconcileChequeWithStatementLine(selectedChequeId, selectedLineId);
    setSelectedChequeId(null);
    setSelectedLineId(null);
    setToastMessage("Chèque et opération bancaire lettrés manuellement avec succès.");
    setTimeout(() => setToastMessage(null), 3500);
    await loadData();
  };

  // Annulation du rapprochement
  const handleUnreconcile = async (chequeId: string) => {
    await unreconcileCheque(chequeId);
    setToastMessage("Rapprochement annulé pour ce chèque.");
    setTimeout(() => setToastMessage(null), 3000);
    await loadData();
  };

  // Suppression d'un relevé bancaire
  const handleDeleteStatement = async (statementId: string) => {
    if (window.confirm("Êtes-vous sûr de vouloir supprimer ce relevé bancaire et ses lignes d'opérations associées ?")) {
      await deleteBankStatement(statementId);
      await loadData();
    }
  };

  // Chèques filtrés
  const filteredCheques = useMemo(() => {
    return cheques.filter((c) => {
      if (c.status === "annule") return false;
      if (selectedAccountId !== "all" && c.accountId && c.accountId !== selectedAccountId) return false;

      // Filtre statut
      if (chequeFilter === "circulation" && c.status === "encaisse") return false;
      if (chequeFilter === "reconciled" && !c.reconciledLineId && c.status !== "encaisse") return false;

      // Filtre recherche
      if (searchCheque.trim()) {
        const q = searchCheque.toLowerCase();
        const matchesBen = c.beneficiary?.toLowerCase().includes(q);
        const matchesNum = c.chequeNumber?.toLowerCase().includes(q);
        const matchesAmt = c.amount?.includes(q);
        if (!matchesBen && !matchesNum && !matchesAmt) return false;
      }

      return true;
    });
  }, [cheques, selectedAccountId, chequeFilter, searchCheque]);

  // Lignes de relevé filtrées
  const filteredLines = useMemo(() => {
    return statementLines.filter((l) => {
      if (selectedAccountId !== "all" && l.accountId && l.accountId !== selectedAccountId) return false;
      if (lineFilter === "unmatched" && l.reconciliationStatus !== "unmatched") return false;
      if (lineFilter === "matched" && l.reconciliationStatus === "unmatched") return false;

      if (searchLine.trim()) {
        const q = searchLine.toLowerCase();
        const matchesLabel = l.label?.toLowerCase().includes(q);
        const matchesRef = l.reference?.toLowerCase().includes(q);
        const matchesNum = l.extractedChequeNumber?.toLowerCase().includes(q);
        const matchesDebit = l.debit ? String(l.debit).includes(q) : false;
        if (!matchesLabel && !matchesRef && !matchesNum && !matchesDebit) return false;
      }

      return true;
    });
  }, [statementLines, selectedAccountId, lineFilter, searchLine]);

  return (
    <div className="reconciliation-page-container" style={{ padding: "20px 24px", height: "100%", display: "flex", flexDirection: "column", overflowY: "auto" }}>
      {/* Toast de notification */}
      {toastMessage && (
        <div style={{ position: "fixed", bottom: "24px", right: "24px", background: "#065F46", color: "#FFF", padding: "12px 18px", borderRadius: "8px", boxShadow: "0 10px 25px rgba(0,0,0,0.15)", zIndex: 9999, display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
          <CheckCircle2 size={16} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. En-tête de la page */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "18px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "rgba(172, 137, 70, 0.12)", color: "var(--gold-dark)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <CheckCheck size={20} />
            </div>
            <div>
              <h1 style={{ fontSize: "20px", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                Rapprochement Bancaire & Grand Livre
              </h1>
              <p style={{ fontSize: "12px", color: "var(--text-secondary)", margin: "2px 0 0 0" }}>
                Comparaison assistée entre chèques émis et relevés bancaires · Gestion des écarts et traçabilité
              </p>
            </div>
          </div>
        </div>

        {/* Barre d'actions */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          {/* Sélecteur de compte bancaire */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "#FFF", border: "1px solid var(--border-color)", padding: "4px 10px", borderRadius: "8px" }}>
            <CreditCard size={14} className="text-gold" />
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              style={{ border: "none", background: "transparent", fontSize: "12px", color: "var(--text-primary)", outline: "none", fontWeight: 600 }}
            >
              <option value="all">Tous les comptes bancaires ({accounts.length})</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>

          {/* Bouton Import Relevé */}
          <button
            type="button"
            className="btn-action-luxury-green"
            onClick={() => setIsImportModalOpen(true)}
            style={{ padding: "7px 12px", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" }}
          >
            <Upload size={14} />
            <span>Importer un relevé</span>
          </button>

          {/* Bouton Rapprochement Automatique */}
          <button
            type="button"
            className="btn-action-card"
            onClick={handleRunAutoReconcile}
            style={{ padding: "7px 12px", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" }}
            title="Associer automatiquement les chèques et débits avec N° chèque et montant identiques"
          >
            <Sparkles size={14} className="text-gold" />
            <span>Rapprochement auto ({analysis.exactMatches.length})</span>
          </button>

          {/* Bouton Export Excel */}
          <button
            type="button"
            className="btn-action-card"
            onClick={() => exportBankReconciliationToExcel(cheques, statementLines, accounts)}
            style={{ padding: "7px 12px", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" }}
            title="Exporter l'état de rapprochement complet en Excel"
          >
            <Download size={14} />
            <span>Export Rapprochement</span>
          </button>

          {/* Bouton Journal Comptable */}
          <button
            type="button"
            className="btn-action-card"
            onClick={() => exportAccountingJournalToExcel(cheques, accounts)}
            style={{ padding: "7px 12px", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" }}
            title="Exporter le journal des écritures de trésorerie pour logiciel comptable"
          >
            <FileSpreadsheet size={14} />
            <span>Journal Comptable</span>
          </button>
        </div>
      </div>

      {/* 2. Cartes d'indicateurs financiers (KPIs) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "12px", marginBottom: "18px" }}>
        {/* Total Émis */}
        <div style={{ background: "#FFF", padding: "12px 14px", borderRadius: "10px", border: "1px solid var(--border-color)" }}>
          <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block" }}>Chèques émis</span>
          <strong style={{ fontSize: "16px", color: "var(--text-primary)", display: "block", marginTop: "2px" }}>
            {analysis.summary.totalEmittedCount}
          </strong>
          <span style={{ fontSize: "11px", color: "var(--text-secondary)", fontWeight: 600 }}>
            {analysis.summary.totalEmittedAmount.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} DA
          </span>
        </div>

        {/* Lettrés / Encaissés */}
        <div style={{ background: "#F0FDF4", padding: "12px 14px", borderRadius: "10px", border: "1px solid #BBF7D0" }}>
          <span style={{ fontSize: "11px", color: "#166534", display: "block" }}>Lettrés / Encaissés</span>
          <strong style={{ fontSize: "16px", color: "#15803D", display: "block", marginTop: "2px" }}>
            {analysis.summary.reconciledCount}
          </strong>
          <span style={{ fontSize: "11px", color: "#166534", fontWeight: 600 }}>
            {analysis.summary.reconciledAmount.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} DA
          </span>
        </div>

        {/* Chèques en circulation (non débités) */}
        <div style={{ background: "#FFFBEB", padding: "12px 14px", borderRadius: "10px", border: "1px solid #FDE68A" }}>
          <span style={{ fontSize: "11px", color: "#92400E", display: "block" }}>En circulation (non débités)</span>
          <strong style={{ fontSize: "16px", color: "#B45309", display: "block", marginTop: "2px" }}>
            {analysis.summary.inCirculationCount}
          </strong>
          <span style={{ fontSize: "11px", color: "#92400E", fontWeight: 600 }}>
            {analysis.summary.inCirculationAmount.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} DA
          </span>
        </div>

        {/* Débits non lettrés */}
        <div style={{ background: "#FEF2F2", padding: "12px 14px", borderRadius: "10px", border: "1px solid #FECACA" }}>
          <span style={{ fontSize: "11px", color: "#991B1B", display: "block" }}>Débits bancaires non lettrés</span>
          <strong style={{ fontSize: "16px", color: "#DC2626", display: "block", marginTop: "2px" }}>
            {analysis.summary.unmatchedDebitsCount}
          </strong>
          <span style={{ fontSize: "11px", color: "#991B1B", fontWeight: 600 }}>
            {analysis.summary.unmatchedDebitsAmount.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} DA
          </span>
        </div>

        {/* Taux de rapprochement */}
        <div style={{ background: "#F8FAFC", padding: "12px 14px", borderRadius: "10px", border: "1px solid var(--border-color)" }}>
          <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block" }}>Taux de rapprochement</span>
          <strong style={{ fontSize: "16px", color: "var(--gold-dark)", display: "block", marginTop: "2px" }}>
            {analysis.summary.reconciliationRate} %
          </strong>
          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
            {statements.length} relevé(s) chargé(s)
          </span>
        </div>
      </div>

      {/* Barre d'action de lettrage manuel rapide si deux éléments sont sélectionnés */}
      {selectedChequeId && selectedLineId && (
        <div style={{ background: "rgba(172, 137, 70, 0.12)", border: "1px solid var(--gold-primary)", borderRadius: "8px", padding: "10px 16px", marginBottom: "14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Link2 size={16} className="text-gold" />
            <span style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--text-primary)" }}>
              1 chèque sélectionné et 1 opération bancaire sélectionnée
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              type="button"
              className="btn-modal-cancel"
              onClick={() => {
                setSelectedChequeId(null);
                setSelectedLineId(null);
              }}
              style={{ padding: "5px 12px", fontSize: "12px" }}
            >
              Désélectionner
            </button>
            <button
              type="button"
              className="btn-action-luxury-green"
              onClick={handleManualReconcilePair}
              style={{ padding: "6px 14px", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" }}
            >
              <CheckCircle2 size={14} />
              <span>Lettrer cette paire</span>
            </button>
          </div>
        </div>
      )}

      {/* 3. Double volet : Grand livre des chèques vs Relevé bancaire */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", flex: 1, minHeight: "450px" }}>
        {/* Volet Gauche : Chèques émis */}
        <div style={{ background: "#FFF", borderRadius: "10px", border: "1px solid var(--border-color)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Header Volet Gauche */}
          <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border-color)", background: "#F8FAFC" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <strong style={{ fontSize: "13px", color: "var(--text-primary)" }}>
                Chèques émis ({filteredCheques.length})
              </strong>
              {/* Filtres de statut */}
              <div style={{ display: "flex", gap: "4px" }}>
                <button
                  type="button"
                  className={`btn-filter-pill ${chequeFilter === "all" ? "active" : ""}`}
                  onClick={() => setChequeFilter("all")}
                  style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "99px", border: "1px solid var(--border-color)", background: chequeFilter === "all" ? "var(--bg-secondary)" : "#FFF", cursor: "pointer" }}
                >
                  Tous
                </button>
                <button
                  type="button"
                  className={`btn-filter-pill ${chequeFilter === "circulation" ? "active" : ""}`}
                  onClick={() => setChequeFilter("circulation")}
                  style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "99px", border: "1px solid #FDE68A", background: chequeFilter === "circulation" ? "#FEF3C7" : "#FFF", color: "#92400E", cursor: "pointer" }}
                >
                  En circulation
                </button>
                <button
                  type="button"
                  className={`btn-filter-pill ${chequeFilter === "reconciled" ? "active" : ""}`}
                  onClick={() => setChequeFilter("reconciled")}
                  style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "99px", border: "1px solid #BBF7D0", background: chequeFilter === "reconciled" ? "#DCFCE7" : "#FFF", color: "#166534", cursor: "pointer" }}
                >
                  Lettrés
                </button>
              </div>
            </div>

            {/* Barre de recherche chèques */}
            <div style={{ position: "relative" }}>
              <Search size={14} style={{ position: "absolute", left: "10px", top: "8px", color: "var(--text-muted)" }} />
              <input
                type="text"
                placeholder="Rechercher par N° chèque, bénéficiaire ou montant..."
                value={searchCheque}
                onChange={(e) => setSearchCheque(e.target.value)}
                style={{ width: "100%", padding: "6px 10px 6px 30px", borderRadius: "6px", border: "1px solid var(--border-color)", fontSize: "12px" }}
              />
            </div>
          </div>

          {/* Table Chèques */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11.5px" }}>
              <thead>
                <tr style={{ background: "#F1F5F9", textAlign: "left", position: "sticky", top: 0, zIndex: 1 }}>
                  <th style={{ padding: "6px 10px" }}>Date</th>
                  <th style={{ padding: "6px 10px" }}>N° Chèque</th>
                  <th style={{ padding: "6px 10px" }}>Bénéficiaire</th>
                  <th style={{ padding: "6px 10px", textAlign: "right" }}>Montant (DA)</th>
                  <th style={{ padding: "6px 10px", textAlign: "center" }}>Statut</th>
                  <th style={{ padding: "6px 10px", textAlign: "center" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredCheques.map((c) => {
                  const isSelected = selectedChequeId === c.id;
                  const isReconciled = Boolean(c.reconciledLineId);
                  const isCashed = c.status === "encaisse";

                  return (
                    <tr
                      key={c.id}
                      style={{
                        borderBottom: "1px solid #F1F5F9",
                        background: isSelected ? "rgba(172, 137, 70, 0.12)" : isReconciled ? "#F0FDF4" : "#FFF",
                        cursor: "pointer"
                      }}
                      onClick={() => setSelectedChequeId(isSelected ? null : c.id)}
                    >
                      <td style={{ padding: "7px 10px", whiteSpace: "nowrap" }}>{c.date}</td>
                      <td style={{ padding: "7px 10px", fontWeight: 700, fontFamily: "var(--font-mono)" }}>
                        {c.chequeNumber ? `#${c.chequeNumber}` : "-"}
                      </td>
                      <td style={{ padding: "7px 10px", maxWidth: "140px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.beneficiary}>
                        {c.beneficiary}
                      </td>
                      <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 700 }}>
                        {c.amount}
                      </td>
                      <td style={{ padding: "7px 10px", textAlign: "center" }}>
                        {isReconciled ? (
                          <span style={{ fontSize: "10px", padding: "1px 6px", borderRadius: "99px", background: "#DCFCE7", color: "#166534", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "3px" }}>
                            <CheckCircle2 size={10} /> Lettré
                          </span>
                        ) : isCashed ? (
                          c.isCashedDeclaredWithoutProof ? (
                            <span style={{ fontSize: "10px", padding: "1px 6px", borderRadius: "99px", background: "#FEF3C7", color: "#92400E", fontWeight: 600 }}>
                              Déclaratif
                            </span>
                          ) : (
                            <span style={{ fontSize: "10px", padding: "1px 6px", borderRadius: "99px", background: "#DCFCE7", color: "#166534", fontWeight: 700 }}>
                              Encaissé
                            </span>
                          )
                        ) : (
                          <span style={{ fontSize: "10px", padding: "1px 6px", borderRadius: "99px", background: "#FEF3C7", color: "#B45309", fontWeight: 600 }}>
                            En circulation
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "7px 10px", textAlign: "center" }}>
                        {isReconciled ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUnreconcile(c.id);
                            }}
                            title="Annuler le rapprochement pour ce chèque"
                            style={{ background: "transparent", border: "none", cursor: "pointer", color: "#DC2626" }}
                          >
                            <Unlink size={13} />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedChequeId(c.id);
                            }}
                            title="Sélectionner pour lettrage"
                            style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--gold-dark)" }}
                          >
                            <Link2 size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Volet Droit : Opérations du relevé bancaire */}
        <div style={{ background: "#FFF", borderRadius: "10px", border: "1px solid var(--border-color)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Header Volet Droit */}
          <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border-color)", background: "#F8FAFC" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <strong style={{ fontSize: "13px", color: "var(--text-primary)" }}>
                Lignes d'opérations bancaires ({filteredLines.length})
              </strong>
              {/* Filtres de statut */}
              <div style={{ display: "flex", gap: "4px" }}>
                <button
                  type="button"
                  className={`btn-filter-pill ${lineFilter === "all" ? "active" : ""}`}
                  onClick={() => setLineFilter("all")}
                  style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "99px", border: "1px solid var(--border-color)", background: lineFilter === "all" ? "var(--bg-secondary)" : "#FFF", cursor: "pointer" }}
                >
                  Toutes
                </button>
                <button
                  type="button"
                  className={`btn-filter-pill ${lineFilter === "unmatched" ? "active" : ""}`}
                  onClick={() => setLineFilter("unmatched")}
                  style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "99px", border: "1px solid #FECACA", background: lineFilter === "unmatched" ? "#FEE2E2" : "#FFF", color: "#991B1B", cursor: "pointer" }}
                >
                  Non lettrées
                </button>
                <button
                  type="button"
                  className={`btn-filter-pill ${lineFilter === "matched" ? "active" : ""}`}
                  onClick={() => setLineFilter("matched")}
                  style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "99px", border: "1px solid #BBF7D0", background: lineFilter === "matched" ? "#DCFCE7" : "#FFF", color: "#166534", cursor: "pointer" }}
                >
                  Lettrées
                </button>
              </div>
            </div>

            {/* Barre de recherche opérations */}
            <div style={{ position: "relative" }}>
              <Search size={14} style={{ position: "absolute", left: "10px", top: "8px", color: "var(--text-muted)" }} />
              <input
                type="text"
                placeholder="Rechercher par libellé bancaire, réf ou débit..."
                value={searchLine}
                onChange={(e) => setSearchLine(e.target.value)}
                style={{ width: "100%", padding: "6px 10px 6px 30px", borderRadius: "6px", border: "1px solid var(--border-color)", fontSize: "12px" }}
              />
            </div>
          </div>

          {/* Table Opérations bancaires */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11.5px" }}>
              <thead>
                <tr style={{ background: "#F1F5F9", textAlign: "left", position: "sticky", top: 0, zIndex: 1 }}>
                  <th style={{ padding: "6px 10px" }}>Date</th>
                  <th style={{ padding: "6px 10px" }}>Libellé bancaire</th>
                  <th style={{ padding: "6px 10px" }}>Chq extrait</th>
                  <th style={{ padding: "6px 10px", textAlign: "right" }}>Débit (DA)</th>
                  <th style={{ padding: "6px 10px", textAlign: "center" }}>Statut</th>
                  <th style={{ padding: "6px 10px", textAlign: "center" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredLines.map((l) => {
                  const isSelected = selectedLineId === l.id;
                  const isMatched = l.reconciliationStatus !== "unmatched";

                  return (
                    <tr
                      key={l.id}
                      style={{
                        borderBottom: "1px solid #F1F5F9",
                        background: isSelected ? "rgba(172, 137, 70, 0.12)" : isMatched ? "#F0FDF4" : "#FFF",
                        cursor: "pointer"
                      }}
                      onClick={() => setSelectedLineId(isSelected ? null : l.id)}
                    >
                      <td style={{ padding: "7px 10px", whiteSpace: "nowrap" }}>{l.operationDate}</td>
                      <td style={{ padding: "7px 10px", maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={l.label}>
                        {l.label}
                      </td>
                      <td style={{ padding: "7px 10px" }}>
                        {l.extractedChequeNumber ? (
                          <span style={{ background: "rgba(172, 137, 70, 0.12)", color: "var(--gold-dark)", padding: "1px 6px", borderRadius: "4px", fontWeight: 600 }}>
                            #{l.extractedChequeNumber}
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>-</span>
                        )}
                      </td>
                      <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 700, color: l.debit ? "#DC2626" : "var(--text-muted)" }}>
                        {l.debit ? l.debit.toLocaleString("fr-FR", { minimumFractionDigits: 2 }) : "-"}
                      </td>
                      <td style={{ padding: "7px 10px", textAlign: "center" }}>
                        {isMatched ? (
                          <span style={{ fontSize: "10px", padding: "1px 6px", borderRadius: "99px", background: "#DCFCE7", color: "#166534", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "3px" }}>
                            <CheckCircle2 size={10} /> Lettré
                          </span>
                        ) : (
                          <span style={{ fontSize: "10px", padding: "1px 6px", borderRadius: "99px", background: "#F1F5F9", color: "#64748B", fontWeight: 600 }}>
                            En attente
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "7px 10px", textAlign: "center" }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLineId(l.id);
                          }}
                          title="Sélectionner pour lettrage"
                          style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--gold-dark)" }}
                        >
                          <Link2 size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modale d'import de relevé */}
      <BankStatementImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        accounts={accounts}
        activeAccountId={selectedAccountId === "all" ? undefined : selectedAccountId}
        onImportSuccess={() => {
          setToastMessage("Relevé bancaire importé avec succès.");
          setTimeout(() => setToastMessage(null), 3500);
          loadData();
        }}
      />
    </div>
  );
};
