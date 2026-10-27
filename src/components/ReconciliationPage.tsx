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
  ArrowLeft,
  RotateCcw,
  Search,
  Link2,
  Unlink,
  ShieldCheck,
  FileText,
  FileDown,
  Building2,
  Layers,
  X
} from "lucide-react";
import type {
  ChequeRecord,
  BankAccountRecord,
  BankStatementRecord,
  BankStatementLineRecord,
  UserRecord
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
import { hasPermission, getPermissionErrorMessage } from "../services/permissions";

interface ReconciliationPageProps {
  activeCompanyId?: string;
  onBackToHome?: () => void;
  onOpenCheckDetails?: (cheque: ChequeRecord) => void;
  currentUser?: UserRecord | null;
}

export const ReconciliationPage: React.FC<ReconciliationPageProps> = ({
  activeCompanyId,
  onBackToHome,
  onOpenCheckDetails,
  currentUser
}) => {
  const companyId = activeCompanyId || getActiveCompanyId();

  // Contrôle d'accès RBAC
  const canValidate = hasPermission(currentUser?.role, "reconcile:validate");
  const canDelete = hasPermission(currentUser?.role, "cheque:delete");

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
  const [chequeFilter, setChequeFilter] = useState<"all" | "circulation" | "reconciled">("all");
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
    if (!canValidate) {
      setToastMessage("Autorisation requise : Le lettrage et la validation sont réservés aux signataires et administrateurs.");
      setTimeout(() => setToastMessage(null), 3500);
      return;
    }

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
    if (!canValidate) {
      setToastMessage("Autorisation requise : Le lettrage manuel est réservé aux signataires et administrateurs.");
      setTimeout(() => setToastMessage(null), 3500);
      return;
    }

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
    if (!canValidate) {
      setToastMessage("Autorisation requise : L'annulation du lettrage est réservée aux signataires et administrateurs.");
      setTimeout(() => setToastMessage(null), 3500);
      return;
    }

    await unreconcileCheque(chequeId);
    setToastMessage("Rapprochement annulé pour ce chèque.");
    setTimeout(() => setToastMessage(null), 3000);
    await loadData();
  };

  // Suppression d'un relevé bancaire
  const handleDeleteStatement = async (statementId: string) => {
    if (!canDelete) {
      setToastMessage("Action non autorisée : La suppression d'un relevé bancaire est réservée à l'administrateur.");
      setTimeout(() => setToastMessage(null), 3500);
      return;
    }

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
      if (chequeFilter === "circulation" && (c.reconciledLineId || c.status === "encaisse")) return false;
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

  const activeAccount = accounts.find((a) => a.id === selectedAccountId);
  const selectedChequeObj = cheques.find((c) => c.id === selectedChequeId);
  const selectedLineObj = statementLines.find((l) => l.id === selectedLineId);

  return (
    <div className="history-page reconciliation-page">
      {/* Toast de notification harmonisé */}
      {toastMessage && (
        <div className="app-toast toast-success" role="status" style={{ zIndex: 9999 }}>
          <CheckCircle2 size={16} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. En-tête de la page harmonisé avec l'Historique et les Bénéficiaires */}
      <div className="history-page-header">
        {onBackToHome && (
          <div className="header-breadcrumbs">
            <button type="button" className="btn-back-crumb" onClick={onBackToHome}>
              <ArrowLeft size={16} />
              <span>Retour à l'accueil (Saisie)</span>
            </button>
          </div>
        )}

        <div className="header-main-title-row">
          <div>
            <div className="title-with-badge">
              <h1 className="history-main-title">Rapprochement & Grand Livre Bancaire</h1>
              <span className="count-pill">{analysis.summary.totalEmittedCount} chèques</span>
              {currentUser && !canValidate && (
                <span
                  style={{
                    fontSize: "11px",
                    padding: "2px 8px",
                    borderRadius: "12px",
                    fontWeight: 600,
                    background: "rgba(217, 119, 6, 0.12)",
                    color: "#D97706",
                    border: "1px solid rgba(217, 119, 6, 0.25)"
                  }}
                  title="Ce profil est en mode consultation pour les validations bancaires"
                >
                  Mode Consultation Seule
                </span>
              )}
            </div>
            <p className="history-main-subtitle">
              Comparaison assistée entre chèques émis et relevés bancaires · Gestion des écarts, lettrage et exports comptables.
            </p>
          </div>

          <div className="header-actions-group">
            {/* Bouton Import Relevé en vert de luxe */}
            <button
              type="button"
              className="btn-action-luxury-green"
              onClick={() => setIsImportModalOpen(true)}
              title="Importer un relevé bancaire (Excel, CSV, OFX)"
            >
              <Upload size={16} />
              <span>Importer un relevé</span>
            </button>

            {/* Bouton Rapprochement Automatique */}
            <button
              type="button"
              className="btn-action-card"
              onClick={handleRunAutoReconcile}
              disabled={!canValidate}
              style={!canValidate ? { opacity: 0.55, cursor: "not-allowed" } : undefined}
              title={
                !canValidate
                  ? "Lettrage et validation réservés aux profils Signataire et Administrateur"
                  : "Associer automatiquement les chèques et débits avec N° chèque et montant identiques"
              }
            >
              <Sparkles size={16} className="btn-action-icon text-gold" />
              <span>Rapprochement auto ({analysis.exactMatches.length})</span>
            </button>

            {/* Bouton Export Rapprochement */}
            <button
              type="button"
              className="btn-action-card"
              onClick={() => exportBankReconciliationToExcel(cheques, statementLines, accounts)}
              title="Exporter l'état de rapprochement complet en Excel"
            >
              <FileDown size={16} className="btn-action-icon" />
              <span>Export Rapprochement</span>
            </button>

            {/* Bouton Journal Comptable */}
            <button
              type="button"
              className="btn-action-card"
              onClick={() => exportAccountingJournalToExcel(cheques, accounts)}
              title="Exporter le journal des écritures de trésorerie pour logiciel comptable (SCF)"
            >
              <FileSpreadsheet size={16} className="btn-action-icon text-emerald" />
              <span>Journal comptable</span>
            </button>

            {/* Bouton Actualiser */}
            <button
              type="button"
              className="btn-action-card"
              onClick={loadData}
              title="Actualiser les données"
            >
              <RotateCcw size={16} className="btn-action-icon" />
              <span>Actualiser</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Cartes d'indicateurs financiers (KPIs) dans la grille standard */}
      <div className="history-stats-grid reconciliation-stats-grid">
        {/* Total Émis */}
        <div className="history-stat-card">
          <div className="stat-icon-wrapper gold">
            <FileText size={18} />
          </div>
          <div className="stat-content">
            <span className="stat-label">Chèques émis</span>
            <strong className="stat-value">{analysis.summary.totalEmittedCount}</strong>
            <span style={{ fontSize: "11px", color: "var(--text-secondary)", fontWeight: 600 }}>
              {analysis.summary.totalEmittedAmount.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} DA
            </span>
          </div>
        </div>

        {/* Lettrés / Encaissés */}
        <div className="history-stat-card">
          <div className="stat-icon-wrapper green">
            <CheckCircle2 size={18} />
          </div>
          <div className="stat-content">
            <span className="stat-label">Lettrés / Encaissés</span>
            <strong className="stat-value">{analysis.summary.reconciledCount}</strong>
            <span style={{ fontSize: "11px", color: "#166534", fontWeight: 600 }}>
              {analysis.summary.reconciledAmount.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} DA
            </span>
          </div>
        </div>

        {/* Chèques en circulation (non débités) */}
        <div className="history-stat-card">
          <div className="stat-icon-wrapper amber">
            <Clock size={18} />
          </div>
          <div className="stat-content">
            <span className="stat-label">En circulation</span>
            <strong className="stat-value">{analysis.summary.inCirculationCount}</strong>
            <span style={{ fontSize: "11px", color: "#92400E", fontWeight: 600 }}>
              {analysis.summary.inCirculationAmount.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} DA
            </span>
          </div>
        </div>

        {/* Débits non lettrés */}
        <div className="history-stat-card cancelled-stat">
          <div className="stat-icon-wrapper red">
            <AlertCircle size={18} />
          </div>
          <div className="stat-content">
            <span className="stat-label">Débits non lettrés</span>
            <strong className="stat-value">{analysis.summary.unmatchedDebitsCount}</strong>
            <span style={{ fontSize: "11px", color: "#991B1B", fontWeight: 600 }}>
              {analysis.summary.unmatchedDebitsAmount.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} DA
            </span>
          </div>
        </div>

        {/* Taux de rapprochement */}
        <div className="history-stat-card total-amount-card">
          <div className="stat-icon-wrapper gold">
            <ShieldCheck size={18} />
          </div>
          <div className="stat-content">
            <span className="stat-label">Taux de lettrage</span>
            <strong className="stat-value">{analysis.summary.reconciliationRate} %</strong>
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
              {statements.length} relevé(s) chargé(s)
            </span>
          </div>
        </div>
      </div>

      {/* 3. Barre d'outils et de filtrage par compte émetteur */}
      <div className="history-toolbar-card">
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <CreditCard size={15} className="text-gold" />
            <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)" }}>
              Compte bancaire :
            </span>
          </div>

          <div className="filter-select-wrapper" style={{ minWidth: "260px" }}>
            <select
              className="history-filter-select"
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              title="Filtrer les chèques et relevés par compte bancaire"
            >
              <option value="all">Tous les comptes bancaires ({accounts.length})</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label} ({a.ribOrIban ? `...${a.ribOrIban.slice(-4)}` : "Sans RIB"})
                </option>
              ))}
            </select>
          </div>

          {activeAccount && (
            <span className="count-pill" style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
              <span>Solde :</span>
              <strong style={{ color: "var(--gold-dark)" }}>
                {activeAccount.balance.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} DA
              </strong>
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
            Cliquez sur un chèque et une opération bancaire pour les lettrer manuellement
          </span>
        </div>
      </div>

      {/* 4. Bandeau de lettrage manuel lorsqu'une paire est sélectionnée */}
      {selectedChequeId && selectedLineId && selectedChequeObj && selectedLineObj && (
        <div className="reconciliation-pair-banner">
          <div className="reconciliation-pair-info">
            <div className="pair-badge-group">
              <span style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--text-secondary)" }}>
                Chèque sélectionné :
              </span>
              <div className="pair-badge-item">
                <FileText size={13} style={{ color: "var(--gold-dark)" }} />
                <span>N° {selectedChequeObj.chequeNumber || "—"}</span>
                <span>·</span>
                <strong>{selectedChequeObj.amount} DA</strong>
                <span>({selectedChequeObj.beneficiary})</span>
              </div>
            </div>

            <Link2 size={16} className="text-gold" />

            <div className="pair-badge-group">
              <span style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--text-secondary)" }}>
                Débit relevé :
              </span>
              <div className="pair-badge-item">
                <CreditCard size={13} style={{ color: "#DC2626" }} />
                <span>{selectedLineObj.operationDate}</span>
                <span>·</span>
                <strong style={{ color: "#DC2626" }}>
                  {selectedLineObj.debit?.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} DA
                </strong>
                <span>({selectedLineObj.label.slice(0, 30)})</span>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              type="button"
              className="btn-action-card"
              onClick={() => {
                setSelectedChequeId(null);
                setSelectedLineId(null);
              }}
              style={{ padding: "6px 12px", fontSize: "12px" }}
            >
              Annuler
            </button>

            <button
              type="button"
              className="btn-action-luxury-green"
              onClick={handleManualReconcilePair}
              disabled={!canValidate}
              style={{
                padding: "6px 16px",
                fontSize: "12px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                opacity: !canValidate ? 0.55 : 1,
                cursor: !canValidate ? "not-allowed" : "pointer"
              }}
              title={
                !canValidate
                  ? "Lettrage manuel réservé aux profils Signataire et Administrateur"
                  : undefined
              }
            >
              <CheckCircle2 size={15} />
              <span>Lettrer cette paire</span>
            </button>
          </div>
        </div>
      )}

      {/* 5. Double volet harmonisé : Grand livre des chèques vs Relevé bancaire */}
      <div className="reconciliation-dual-pane">
        {/* Volet Gauche : Chèques émis */}
        <div className="reconciliation-pane-card">
          <div className="reconciliation-pane-header">
            <div className="reconciliation-pane-title-row">
              <div className="reconciliation-pane-title">
                <FileText size={15} style={{ color: "var(--gold-dark)" }} />
                <span>Chèques émis de l'entreprise</span>
                <span className="count-pill">{filteredCheques.length}</span>
              </div>

              {/* Filtres de statut standard */}
              <div className="history-filter-pills">
                <button
                  type="button"
                  className={`filter-pill ${chequeFilter === "all" ? "active" : ""}`}
                  onClick={() => setChequeFilter("all")}
                >
                  Tous ({cheques.length})
                </button>
                <button
                  type="button"
                  className={`filter-pill ${chequeFilter === "circulation" ? "active" : ""}`}
                  onClick={() => setChequeFilter("circulation")}
                >
                  En circulation
                </button>
                <button
                  type="button"
                  className={`filter-pill ${chequeFilter === "reconciled" ? "active" : ""}`}
                  onClick={() => setChequeFilter("reconciled")}
                >
                  Lettrés
                </button>
              </div>
            </div>

            {/* Barre de recherche chèques */}
            <div className="history-search-box">
              <Search size={14} className="history-search-icon" />
              <input
                type="text"
                className="history-search-input"
                placeholder="Rechercher par N° chèque, bénéficiaire ou montant..."
                value={searchCheque}
                onChange={(e) => setSearchCheque(e.target.value)}
              />
              {searchCheque && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => setSearchCheque("")}
                  title="Effacer la recherche"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Table Chèques */}
          <div className="reconciliation-table-scroll">
            <table className="history-table">
              <thead>
                <tr>
                  <th style={{ width: "90px" }}>Date</th>
                  <th style={{ width: "95px" }}>N° Chèque</th>
                  <th>Bénéficiaire</th>
                  <th style={{ textAlign: "right", width: "120px" }}>Montant (DA)</th>
                  <th style={{ textAlign: "center", width: "115px" }}>Statut</th>
                  <th style={{ textAlign: "center", width: "50px" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredCheques.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: "30px 15px", color: "var(--text-muted)" }}>
                      Aucun chèque ne correspond aux filtres actuels.
                    </td>
                  </tr>
                ) : (
                  filteredCheques.map((c) => {
                    const isSelected = selectedChequeId === c.id;
                    const isReconciled = Boolean(c.reconciledLineId);
                    const isCashed = c.status === "encaisse";

                    return (
                      <tr
                        key={c.id}
                        className={`${isSelected ? "is-selected" : ""} ${isReconciled ? "is-matched" : ""}`}
                        style={{ cursor: "pointer" }}
                        onClick={() => setSelectedChequeId(isSelected ? null : c.id)}
                      >
                        <td>
                          <span className="ht-date-main">{c.date}</span>
                        </td>
                        <td>
                          <span className="ht-number" style={{ fontWeight: 700 }}>
                            {c.chequeNumber ? `#${c.chequeNumber}` : "—"}
                          </span>
                        </td>
                        <td>
                          <strong className="ht-beneficiary" title={c.beneficiary}>
                            {c.beneficiary}
                          </strong>
                          {c.bankName && (
                            <span className="ht-bank" style={{ display: "block", marginTop: "1px" }}>
                              {c.bankName}
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <span className="ht-amount">{c.amount}</span>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          {isReconciled ? (
                            <span className="cheque-status-tag matched" title="Rapproché avec une ligne de relevé bancaire">
                              <CheckCircle2 size={11} />
                              <span>Lettré</span>
                            </span>
                          ) : isCashed ? (
                            c.isCashedDeclaredWithoutProof ? (
                              <span className="cheque-status-tag encaisse declarative" title="Encaissé en mode déclaratif sans justificatif officiel">
                                <Clock size={11} />
                                <span>Déclaratif</span>
                              </span>
                            ) : (
                              <span className="cheque-status-tag encaisse" title="Encaissé avec justificatif certifié">
                                <ShieldCheck size={11} />
                                <span>Encaissé</span>
                              </span>
                            )
                          ) : (
                            <span className="cheque-status-tag circulation" title="Émis mais pas encore débité sur le compte bancaire">
                              <Clock size={11} />
                              <span>Circulation</span>
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          {isReconciled ? (
                            <button
                              type="button"
                              className="btn-table-action-icon unlink-action"
                              disabled={!canValidate}
                              style={!canValidate ? { opacity: 0.35, cursor: "not-allowed" } : undefined}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUnreconcile(c.id);
                              }}
                              title={
                                !canValidate
                                  ? "Annulation du lettrage réservée aux profils Signataire et Administrateur"
                                  : "Annuler le lettrage de ce chèque"
                              }
                            >
                              <Unlink size={14} />
                            </button>
                          ) : (
                            <button
                              type="button"
                              className={`btn-table-action-icon link-action ${isSelected ? "active" : ""}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedChequeId(isSelected ? null : c.id);
                              }}
                              title="Sélectionner pour lettrage manuel"
                            >
                              <Link2 size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Volet Droit : Opérations du relevé bancaire */}
        <div className="reconciliation-pane-card">
          <div className="reconciliation-pane-header">
            <div className="reconciliation-pane-title-row">
              <div className="reconciliation-pane-title">
                <CreditCard size={15} style={{ color: "var(--gold-dark)" }} />
                <span>Opérations du relevé bancaire</span>
                <span className="count-pill">{filteredLines.length}</span>
              </div>

              {/* Filtres de statut standard */}
              <div className="history-filter-pills">
                <button
                  type="button"
                  className={`filter-pill ${lineFilter === "all" ? "active" : ""}`}
                  onClick={() => setLineFilter("all")}
                >
                  Toutes ({statementLines.length})
                </button>
                <button
                  type="button"
                  className={`filter-pill ${lineFilter === "unmatched" ? "active" : ""}`}
                  onClick={() => setLineFilter("unmatched")}
                >
                  Non lettrées
                </button>
                <button
                  type="button"
                  className={`filter-pill ${lineFilter === "matched" ? "active" : ""}`}
                  onClick={() => setLineFilter("matched")}
                >
                  Lettrées
                </button>
              </div>
            </div>

            {/* Barre de recherche opérations */}
            <div className="history-search-box">
              <Search size={14} className="history-search-icon" />
              <input
                type="text"
                className="history-search-input"
                placeholder="Rechercher par libellé bancaire, référence ou débit..."
                value={searchLine}
                onChange={(e) => setSearchLine(e.target.value)}
              />
              {searchLine && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => setSearchLine("")}
                  title="Effacer la recherche"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Table Opérations bancaires */}
          <div className="reconciliation-table-scroll">
            <table className="history-table">
              <thead>
                <tr>
                  <th style={{ width: "90px" }}>Date</th>
                  <th>Libellé bancaire</th>
                  <th style={{ width: "95px" }}>Chq extrait</th>
                  <th style={{ textAlign: "right", width: "120px" }}>Débit (DA)</th>
                  <th style={{ textAlign: "center", width: "115px" }}>Statut</th>
                  <th style={{ textAlign: "center", width: "50px" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredLines.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: "30px 15px", color: "var(--text-muted)" }}>
                      Aucune opération bancaire chargée ou correspondant aux filtres.
                    </td>
                  </tr>
                ) : (
                  filteredLines.map((l) => {
                    const isSelected = selectedLineId === l.id;
                    const isMatched = l.reconciliationStatus !== "unmatched";

                    return (
                      <tr
                        key={l.id}
                        className={`${isSelected ? "is-selected" : ""} ${isMatched ? "is-matched" : ""}`}
                        style={{ cursor: "pointer" }}
                        onClick={() => setSelectedLineId(isSelected ? null : l.id)}
                      >
                        <td>
                          <span className="ht-date-main">{l.operationDate}</span>
                          {l.valueDate && l.valueDate !== l.operationDate && (
                            <span className="ht-date-sub">Val: {l.valueDate}</span>
                          )}
                        </td>
                        <td>
                          <strong className="ht-beneficiary" title={l.label}>
                            {l.label}
                          </strong>
                          {l.reference && (
                            <span className="ht-bank" style={{ display: "block", marginTop: "1px" }}>
                              Réf: {l.reference}
                            </span>
                          )}
                        </td>
                        <td>
                          {l.extractedChequeNumber ? (
                            <span className="count-pill" style={{ fontFamily: "var(--font-mono)", color: "var(--gold-dark)", borderColor: "var(--gold-border)" }}>
                              #{l.extractedChequeNumber}
                            </span>
                          ) : (
                            <span style={{ color: "var(--text-muted)" }}>—</span>
                          )}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <span className="ht-amount" style={{ color: l.debit ? "#DC2626" : "var(--text-muted)" }}>
                            {l.debit ? l.debit.toLocaleString("fr-FR", { minimumFractionDigits: 2 }) : "—"}
                          </span>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          {isMatched ? (
                            <span className="cheque-status-tag matched" title="Lettré avec un chèque émis">
                              <CheckCircle2 size={11} />
                              <span>Lettré</span>
                            </span>
                          ) : (
                            <span className="cheque-status-tag unmatched" title="En attente de lettrage avec un chèque émis">
                              <Clock size={11} />
                              <span>En attente</span>
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <button
                            type="button"
                            className={`btn-table-action-icon link-action ${isSelected ? "active" : ""}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedLineId(isSelected ? null : l.id);
                            }}
                            title="Sélectionner pour lettrage manuel"
                          >
                            <Link2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
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
