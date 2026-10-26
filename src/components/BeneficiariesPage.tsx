import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Users,
  Search,
  Plus,
  Trash2,
  Edit2,
  FileText,
  RotateCcw,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  TrendingUp,
  FileCheck,
  X,
  Check,
  Receipt,
  FileDown,
  Upload,
  FileSpreadsheet,
  CheckCircle2
} from "lucide-react";
import type { BeneficiaryRecord } from "../types";
import {
  getPaginatedBeneficiaries,
  getAllBeneficiaries,
  saveBeneficiaryRecord,
  deleteBeneficiaryRecord,
  clearAllBeneficiaryRecords,
  importBeneficiaries,
  type BeneficiaryStats
} from "../services/db";
import {
  exportBeneficiariesToCsv,
  exportBeneficiariesToExcel
} from "../services/exportReports";
import { BeneficiaryStatementModal } from "./BeneficiaryStatementModal";

interface BeneficiariesPageProps {
  onCreateChequeForBeneficiary: (beneficiaryName: string) => void;
  onBackToHome: () => void;
}

export const BeneficiariesPage: React.FC<BeneficiariesPageProps> = ({
  onCreateChequeForBeneficiary,
  onBackToHome
}) => {
  // Query & filter states
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");

  // Pagination states
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [records, setRecords] = useState<BeneficiaryRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Statistics
  const [stats, setStats] = useState<BeneficiaryStats>({
    totalCount: 0,
    mostUsedName: "—",
    mostUsedCount: 0
  });

  // Modal / Add / Edit state
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingRecord, setEditingRecord] = useState<BeneficiaryRecord | null>(null);
  const [formName, setFormName] = useState<string>("");
  const [formNickname, setFormNickname] = useState<string>("");
  const [formPhone, setFormPhone] = useState<string>("");
  const [formRib, setFormRib] = useState<string>("");
  const [formNote, setFormNote] = useState<string>("");
  const [formError, setFormError] = useState<string>("");

  // Relevé de compte modal
  const [statementBeneficiaryName, setStatementBeneficiaryName] = useState<string | null>(null);

  // Export state
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [selectedExportFormat, setSelectedExportFormat] = useState<"excel" | "csv">("excel");
  const [customExportFilename, setCustomExportFilename] = useState<string>("");
  const [exportToast, setExportToast] = useState<{
    show: boolean;
    filePath?: string;
    filename?: string;
    format?: string;
  } | null>(null);

  // Import state
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [importMode, setImportMode] = useState<"update" | "ignore">("update");
  const [, setImportFileText] = useState<string>("");
  const [importParsedItems, setImportParsedItems] = useState<Array<{ name: string; nickname?: string; phone?: string; rib?: string; note?: string }>>([]);
  const [importReport, setImportReport] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Debounce search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 180);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Load beneficiaries
  const fetchRecords = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await getPaginatedBeneficiaries({
        page: currentPage,
        pageSize,
        searchQuery: debouncedSearch
      });

      setRecords(res.items);
      setTotalPages(res.totalPages);
      setTotalCount(res.totalCount);
      setStats(res.stats);
    } catch (err) {
      console.error("Erreur de chargement des bénéficiaires:", err);
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, pageSize, debouncedSearch]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  // Open modal for new beneficiary
  const handleOpenNewModal = () => {
    setEditingRecord(null);
    setFormName("");
    setFormNickname("");
    setFormPhone("");
    setFormRib("");
    setFormNote("");
    setFormError("");
    setIsModalOpen(true);
  };

  // Open modal for editing
  const handleOpenEditModal = (record: BeneficiaryRecord) => {
    setEditingRecord(record);
    setFormName(record.name);
    setFormNickname(record.nickname || "");
    setFormPhone(record.phone || "");
    setFormRib(record.rib || "");
    setFormNote(record.note || "");
    setFormError("");
    setIsModalOpen(true);
  };

  // Save or update modal
  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = formName.trim();
    if (!trimmedName) {
      setFormError("Veuillez renseigner le nom ou la raison sociale.");
      return;
    }

    try {
      const now = new Date().toISOString();
      const recordToSave: BeneficiaryRecord = {
        id: editingRecord ? editingRecord.id : `benef-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        name: trimmedName,
        nickname: formNickname.trim() || undefined,
        phone: formPhone.trim() || undefined,
        rib: formRib.trim() || undefined,
        note: formNote.trim() || undefined,
        usageCount: editingRecord ? editingRecord.usageCount : 0,
        createdAt: editingRecord ? editingRecord.createdAt : now,
        lastUsedAt: editingRecord ? editingRecord.lastUsedAt : undefined
      };

      await saveBeneficiaryRecord(recordToSave);
      setIsModalOpen(false);
      await fetchRecords();
    } catch (err) {
      console.error("Erreur enregistrement bénéficiaire:", err);
      setFormError("Une erreur est survenue lors de l'enregistrement.");
    }
  };

  // Delete beneficiary
  const handleDelete = async (id: string, name: string) => {
    if (window.confirm(`Supprimer le bénéficiaire "${name}" du répertoire ?\n(Vos anciens chèques déjà émis ne seront pas affectés).`)) {
      await deleteBeneficiaryRecord(id);
      await fetchRecords();
    }
  };

  // Clear all
  const handleClearAll = async () => {
    if (window.confirm("Êtes-vous sûr de vouloir vider l'ensemble du répertoire des bénéficiaires ? Cette action est irréversible.")) {
      await clearAllBeneficiaryRecords();
      setCurrentPage(1);
      await fetchRecords();
    }
  };

  // Export actions
  const handleExecuteExport = async () => {
    try {
      setIsExporting(true);
      const all = await getAllBeneficiaries();
      const dateTag = new Date().toISOString().split("T")[0];
      const defaultFilename = customExportFilename.trim() || `beneficiaires-${dateTag}.${selectedExportFormat === "excel" ? "xls" : "csv"}`;

      let result;
      if (selectedExportFormat === "excel") {
        result = await exportBeneficiariesToExcel(all, defaultFilename);
      } else {
        result = await exportBeneficiariesToCsv(all, defaultFilename);
      }

      if (result && result.success) {
        setShowExportModal(false);
        setCustomExportFilename("");
        setExportToast({
          show: true,
          filePath: result.filePath,
          filename: result.filename || defaultFilename,
          format: selectedExportFormat.toUpperCase()
        });
        setTimeout(() => {
          setExportToast(null);
        }, 6000);
      }
    } catch (err) {
      console.error("Erreur export bénéficiaires:", err);
    } finally {
      setIsExporting(false);
    }
  };

  // Handle CSV Import File
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) return;
      setImportFileText(content);

      // Parser le CSV simple
      const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length <= 1) {
        setImportParsedItems([]);
        return;
      }

      // Détecter délimiteur (, ou ;)
      const firstLine = lines[0];
      const sep = firstLine.includes(";") ? ";" : ",";

      const parsed: Array<{ name: string; nickname?: string; phone?: string; rib?: string; note?: string }> = [];
      // Sauter l'en-tête (ligne 0)
      for (let i = 1; i < lines.length; i++) {
        const row = lines[i].split(sep).map((c) => c.replace(/^["']|["']$/g, "").trim());
        if (row.length > 0 && row[0]) {
          parsed.push({
            name: row[0],
            nickname: row[1] || undefined,
            phone: row[2] || undefined,
            rib: row[3] || undefined,
            note: row[4] || undefined
          });
        }
      }
      setImportParsedItems(parsed);
      setImportReport(null);
    };
    reader.readAsText(file);
  };

  const handleExecuteImport = async () => {
    if (importParsedItems.length === 0) return;
    try {
      const result = await importBeneficiaries(importParsedItems, importMode);
      setImportReport(`Importation réussie : ${result.addedCount} ajoutés, ${result.updatedCount} mis à jour.`);
      await fetchRecords();
      setTimeout(() => {
        setShowImportModal(false);
        setImportParsedItems([]);
        setImportReport(null);
      }, 1500);
    } catch (err) {
      console.error("Erreur import:", err);
      setImportReport("Une erreur est survenue lors de l'importation.");
    }
  };

  const formatDate = (isoStr?: string) => {
    if (!isoStr) return "Jamais";
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return isoStr;
      return d.toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      });
    } catch {
      return isoStr;
    }
  };

  // Pagination navigation helpers (identique à HistoryPage)
  const startItemIndex = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItemIndex = Math.min(currentPage * pageSize, totalCount);

  const pageNumbers = [];
  const maxButtons = 5;
  let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
  let endPage = Math.min(totalPages, startPage + maxButtons - 1);
  if (endPage - startPage + 1 < maxButtons) {
    startPage = Math.max(1, endPage - maxButtons + 1);
  }
  for (let i = startPage; i <= endPage; i++) {
    pageNumbers.push(i);
  }

  return (
    <div className="history-page beneficiaries-page">
      {/* 1. Header de la page harmonisé avec l'Historique */}
      <div className="history-page-header">
        <div className="header-breadcrumbs">
          <button type="button" className="btn-back-crumb" onClick={onBackToHome}>
            <ArrowLeft size={16} />
            <span>Retour à l'accueil (Saisie)</span>
          </button>
        </div>

        <div className="header-main-title-row">
          <div>
            <div className="title-with-badge">
              <h1 className="history-main-title">Répertoire des bénéficiaires</h1>
              <span className="count-pill">{stats.totalCount}</span>
            </div>
            <p className="history-main-subtitle">
              Répertoire centralisé des bénéficiaires et fournisseurs — relevés complets, autocomplétion et coordonnées.
            </p>
          </div>

          <div className="header-actions-group">
            {/* Bouton Nouveau en vert de luxe */}
            <button
              type="button"
              className="btn-action-luxury-green"
              onClick={handleOpenNewModal}
              title="Ajouter un nouveau bénéficiaire ou fournisseur"
            >
              <Plus size={17} />
              <span>Nouveau</span>
            </button>

            {/* Bouton Exporter carte standard avec icône dorée */}
            <button
              type="button"
              className="btn-action-card"
              onClick={() => setShowExportModal(true)}
              disabled={stats.totalCount === 0}
              title="Exporter le carnet d'adresses (Excel, CSV)"
            >
              <FileDown size={16} className="btn-action-icon" />
              <span>Exporter</span>
            </button>

            {/* Bouton Importer carte standard */}
            <button
              type="button"
              className="btn-action-card"
              onClick={() => {
                setShowImportModal(true);
                setImportParsedItems([]);
                setImportReport(null);
              }}
              title="Importer des bénéficiaires depuis un fichier CSV"
            >
              <Upload size={16} className="btn-action-icon" />
              <span>Importer</span>
            </button>

            {/* Bouton Actualiser */}
            <button
              type="button"
              className="btn-action-card"
              onClick={() => fetchRecords()}
              title="Actualiser la liste"
            >
              <RotateCcw size={16} className="btn-action-icon" />
              <span>Actualiser</span>
            </button>

            {/* Bouton Vider */}
            {stats.totalCount > 0 && (
              <button
                type="button"
                className="btn-action-card btn-clear-danger"
                onClick={handleClearAll}
                title="Vider l'ensemble du répertoire des bénéficiaires"
              >
                <Trash2 size={16} className="btn-action-icon text-red" />
                <span>Vider le répertoire</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. Cartes statistiques KPI */}
      <div className="history-stats-grid">
        <div className="history-stat-card">
          <div className="stat-icon-wrapper gold">
            <Users size={18} />
          </div>
          <div className="stat-content">
            <span className="stat-label">Bénéficiaires enregistrés</span>
            <strong className="stat-value">{stats.totalCount}</strong>
          </div>
        </div>

        <div className="history-stat-card">
          <div className="stat-icon-wrapper green">
            <TrendingUp size={18} />
          </div>
          <div className="stat-content">
            <span className="stat-label">Bénéficiaire le plus fréquent</span>
            <strong className="stat-value text-ellipsis" title={stats.mostUsedName}>
              {stats.mostUsedName}
            </strong>
          </div>
        </div>

        <div className="history-stat-card">
          <div className="stat-icon-wrapper blue">
            <FileCheck size={18} />
          </div>
          <div className="stat-content">
            <span className="stat-label">Fréquence maximale</span>
            <strong className="stat-value">
              {stats.mostUsedCount > 0 ? `${stats.mostUsedCount} chèque(s)` : "—"}
            </strong>
          </div>
        </div>
      </div>

      {/* 3. Barre de recherche unifiée (identique à HistoryPage) */}
      <div className="history-toolbar-card">
        <div className="history-toolbar-unified-row">
          <div className="history-search-box">
            <Search size={15} className="history-search-icon" />
            <input
              type="text"
              className="history-search-input"
              placeholder="Recherche générale : nom, raison sociale, alias, téléphone, RIB ou note..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => setSearchQuery("")}
              >
                Effacer
              </button>
            )}
          </div>

          {searchQuery && (
            <button
              type="button"
              className="btn-reset-filters"
              onClick={() => setSearchQuery("")}
              title="Réinitialiser la recherche"
            >
              <X size={13} />
              <span>Réinitialiser</span>
            </button>
          )}
        </div>
      </div>

      {/* 4. Liste des bénéficiaires */}
      {records.length === 0 ? (
        <div className="history-empty-state">
          <div className="empty-icon-circle">
            <Users size={32} />
          </div>
          <h3 className="empty-title">
            {stats.totalCount === 0
              ? "Aucun bénéficiaire enregistré"
              : "Aucun bénéficiaire ne correspond à votre recherche"}
          </h3>
          <p className="empty-description">
            {stats.totalCount === 0
              ? "Lorsque vous saisissez un bénéficiaire sur l'accueil, il s'enregistre automatiquement ici. Vous pouvez également en ajouter manuellement."
              : "Essayez de modifier votre mot-clé de recherche."}
          </p>
          <button
            type="button"
            className="btn-empty-action"
            onClick={stats.totalCount === 0 ? handleOpenNewModal : () => setSearchQuery("")}
          >
            {stats.totalCount === 0 ? <Plus size={15} /> : <RotateCcw size={15} />}
            <span>{stats.totalCount === 0 ? "Ajouter un bénéficiaire" : "Réinitialiser la recherche"}</span>
          </button>
        </div>
      ) : (
        <div className="history-content-with-pagination">
          <div className="history-table-card">
            <table className="history-table">
              <thead>
                <tr>
                  <th>Bénéficiaire</th>
                  <th>Téléphone</th>
                  <th className="ht-col-rib">Compte / RIB</th>
                  <th>Notes & Coordonnées</th>
                  <th className="ht-col-count">Chèques émis</th>
                  <th>Dernier chèque</th>
                  <th className="ht-col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {records.map((item) => {
                  const initial = (item.name || "?").trim().charAt(0).toUpperCase();

                  return (
                    <tr key={item.id}>
                      <td className="ht-col-beneficiary">
                        <div
                          className="ht-benef-cell"
                          style={{ cursor: "pointer" }}
                          onClick={() => setStatementBeneficiaryName(item.name)}
                          title="Cliquer pour voir le relevé complet des paiements"
                        >
                          <div className="ht-avatar" title={item.name}>
                            {initial}
                          </div>
                          <div className="ht-benef-names">
                            <span className="ht-beneficiary" title={item.name}>
                              {item.name || "Bénéficiaire non renseigné"}
                            </span>
                            {item.nickname && (
                              <span className="ht-benef-alias" title={item.nickname}>
                                {item.nickname}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="ht-col-phone">
                        {item.phone ? (
                          <span className="ht-phone" title="Téléphone">
                            {item.phone}
                          </span>
                        ) : (
                          <span className="ht-muted">—</span>
                        )}
                      </td>

                      <td className="ht-col-rib">
                        {item.rib ? (
                          <span className="ht-rib font-mono" title={item.rib}>
                            {item.rib}
                          </span>
                        ) : (
                          <span className="ht-muted">—</span>
                        )}
                      </td>

                      <td className="ht-col-note">
                        {item.note ? (
                          <span className="ht-note" title={item.note}>
                            {item.note}
                          </span>
                        ) : (
                          <span className="ht-muted">—</span>
                        )}
                      </td>

                      <td className="ht-col-count" title="Nombre de chèques émis pour ce bénéficiaire">
                        <span
                          className="ht-usage-pill clickable"
                          onClick={() => setStatementBeneficiaryName(item.name)}
                          title="Voir le détail de ces paiements"
                        >
                          <FileText size={12} />
                          <span>{item.usageCount || 1}</span>
                        </span>
                      </td>

                      <td
                        className="ht-col-date"
                        title={item.lastUsedAt ? `Dernier chèque : ${formatDate(item.lastUsedAt)}` : "Jamais utilisé"}
                      >
                        <span className="ht-date-main">{formatDate(item.lastUsedAt)}</span>
                      </td>

                      <td className="ht-col-actions">
                        <div className="ht-actions">
                          {/* 1. Bouton Relevé de compte complet */}
                          <button
                            type="button"
                            className="ht-act statement"
                            onClick={() => setStatementBeneficiaryName(item.name)}
                            title={`Relevé complet des paiements (${item.name})`}
                          >
                            <Receipt size={14} />
                          </button>

                          {/* 2. Bouton Émettre un chèque */}
                          <button
                            type="button"
                            className="ht-act create"
                            onClick={() => onCreateChequeForBeneficiary(item.name)}
                            title={`Créer un chèque pour ${item.name}`}
                          >
                            <FileText size={14} />
                          </button>

                          {/* 3. Bouton Modifier */}
                          <button
                            type="button"
                            className="ht-act"
                            onClick={() => handleOpenEditModal(item)}
                            title="Modifier les coordonnées"
                          >
                            <Edit2 size={14} />
                          </button>

                          {/* 4. Bouton Supprimer */}
                          <button
                            type="button"
                            className="ht-act delete"
                            onClick={() => handleDelete(item.id, item.name)}
                            title="Supprimer du répertoire"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 5. Barre de pagination SQLite identique à HistoryPage */}
          <div className="history-pagination-bar">
            <div className="pagination-info">
              <span>
                Affichage de <strong>{startItemIndex}</strong> à <strong>{endItemIndex}</strong> sur{" "}
                <strong>{totalCount}</strong> bénéficiaire{totalCount > 1 ? "s" : ""}
              </span>

              <div className="page-size-selector">
                <span className="selector-label">Lignes par page :</span>
                <select
                  id="ben-page-size"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="page-size-select"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </div>
            </div>

            {totalPages > 1 && (
              <div className="pagination-controls">
                <button
                  type="button"
                  className="btn-page-nav"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage <= 1 || isLoading}
                  title="Première page"
                >
                  <ChevronsLeft size={16} />
                </button>

                <button
                  type="button"
                  className="btn-page-nav"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1 || isLoading}
                  title="Page précédente"
                >
                  <ChevronLeft size={16} />
                </button>

                <div className="pagination-number-buttons">
                  {pageNumbers.map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={`btn-page-num ${p === currentPage ? "active" : ""}`}
                      onClick={() => setCurrentPage(p)}
                    >
                      {p}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  className="btn-page-nav"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages || isLoading}
                  title="Page suivante"
                >
                  <ChevronRight size={16} />
                </button>

                <button
                  type="button"
                  className="btn-page-nav"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage >= totalPages || isLoading}
                  title="Dernière page"
                >
                  <ChevronsRight size={16} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Ajout / Modification de Bénéficiaire (Design harmonisé) */}
      {isModalOpen && (
        <div className="print-confirm-overlay" role="dialog" aria-modal="true" onClick={() => setIsModalOpen(false)}>
          <div className="print-confirm-modal" style={{ maxWidth: "520px" }} onClick={(e) => e.stopPropagation()}>
            <div className="print-confirm-header">
              <div className="print-confirm-icon-box gold">
                <Users size={20} className="confirm-icon text-gold" />
              </div>
              <div style={{ flex: 1 }}>
                <h3 className="confirm-title">
                  {editingRecord ? "Modifier le bénéficiaire" : "Nouveau bénéficiaire"}
                </h3>
                <p className="confirm-subtitle">
                  {editingRecord
                    ? `Mise à jour des coordonnées pour ${editingRecord.name}`
                    : "Ajoutez un nouveau contact ou fournisseur à votre carnet"}
                </p>
              </div>
              <button
                type="button"
                className="btn-modal-close"
                onClick={() => setIsModalOpen(false)}
                title="Fermer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveModal}>
              <div className="export-modal-body" style={{ gap: "14px", padding: "18px 24px" }}>
                {formError && (
                  <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#DC2626", padding: "9px 12px", borderRadius: "6px", fontSize: "12.5px" }}>
                    {formError}
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label" style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", display: "block", marginBottom: "4px" }}>
                    Nom ou Raison Sociale <span style={{ color: "#DC2626" }}>*</span>
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Ex: Entreprise Exemple SARL"
                    value={formName}
                    onChange={(e) => {
                      setFormName(e.target.value);
                      setFormError("");
                    }}
                    autoFocus
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", display: "block", marginBottom: "4px" }}>
                    Nom commercial ou Alias (Optionnel)
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Ex: Fournisseur Papier"
                    value={formNickname}
                    onChange={(e) => setFormNickname(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", display: "block", marginBottom: "4px" }}>
                    Numéro de téléphone (Optionnel)
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Ex: 0550 12 34 56"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", display: "block", marginBottom: "4px" }}>
                    Numéro de Compte Bancaire / RIB (Optionnel)
                  </label>
                  <input
                    type="text"
                    className="form-input font-mono"
                    placeholder="Ex: 001 00123 4567890123 45"
                    value={formRib}
                    onChange={(e) => setFormRib(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", display: "block", marginBottom: "4px" }}>
                    Notes & Adresse (Optionnel)
                  </label>
                  <textarea
                    className="form-input form-textarea"
                    rows={2}
                    placeholder="Ex: Agence BNA Alger Centre, Zone Industrielle..."
                    value={formNote}
                    onChange={(e) => setFormNote(e.target.value)}
                  />
                </div>
              </div>

              <div className="print-confirm-actions">
                <button
                  type="button"
                  className="btn-confirm-cancel"
                  onClick={() => setIsModalOpen(false)}
                >
                  Annuler
                </button>
                <button type="submit" className="btn-action-luxury-green">
                  <Check size={16} />
                  <span>{editingRecord ? "Mettre à jour" : "Enregistrer"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Relevé de compte du bénéficiaire */}
      {statementBeneficiaryName && (
        <BeneficiaryStatementModal
          beneficiaryName={statementBeneficiaryName}
          isOpen={Boolean(statementBeneficiaryName)}
          onClose={() => setStatementBeneficiaryName(null)}
          onCreateChequeForBeneficiary={onCreateChequeForBeneficiary}
        />
      )}

      {/* Modal d'Exportation du carnet (Design 100% harmonisé avec l'Historique) */}
      {showExportModal && (
        <div className="print-confirm-overlay" role="dialog" aria-modal="true" onClick={() => !isExporting && setShowExportModal(false)}>
          <div className="print-confirm-modal export-dialog-modal" onClick={(e) => e.stopPropagation()}>
            <div className="print-confirm-header">
              <div className="print-confirm-icon-box gold">
                <FileDown size={22} className="confirm-icon text-gold" />
              </div>
              <div style={{ flex: 1 }}>
                <h3 className="confirm-title">Exporter le carnet des bénéficiaires</h3>
                <p className="confirm-subtitle">
                  {stats.totalCount} bénéficiaire{stats.totalCount > 1 ? "s" : ""} enregistré{stats.totalCount > 1 ? "s" : ""}
                </p>
              </div>
              <button
                type="button"
                className="btn-modal-close"
                onClick={() => !isExporting && setShowExportModal(false)}
                title="Fermer"
                disabled={isExporting}
              >
                <X size={18} />
              </button>
            </div>

            <div className="export-modal-body">
              <div className="export-format-selector-section">
                <label className="export-section-label">Choisissez le format d'exportation :</label>

                <div className="export-formats-grid">
                  {/* Format Excel */}
                  <div
                    className={`export-format-card excel ${selectedExportFormat === "excel" ? "active" : ""}`}
                    onClick={() => setSelectedExportFormat("excel")}
                  >
                    <div className="format-card-radio">
                      <input
                        type="radio"
                        name="benExportFormat"
                        value="excel"
                        checked={selectedExportFormat === "excel"}
                        onChange={() => setSelectedExportFormat("excel")}
                      />
                    </div>
                    <div className="format-card-icon excel">
                      <FileSpreadsheet size={22} />
                    </div>
                    <div className="format-card-info">
                      <div className="format-card-title-row">
                        <strong className="format-title">Classeur Excel (.xls)</strong>
                        <span className="format-badge recommended">Recommandé</span>
                      </div>
                      <p className="format-desc">
                        Tableau officiel avec colonnes formatées (nom, alias, téléphone, RIB, notes) compatible Microsoft Excel et LibreOffice.
                      </p>
                    </div>
                  </div>

                  {/* Format CSV */}
                  <div
                    className={`export-format-card csv ${selectedExportFormat === "csv" ? "active" : ""}`}
                    onClick={() => setSelectedExportFormat("csv")}
                  >
                    <div className="format-card-radio">
                      <input
                        type="radio"
                        name="benExportFormat"
                        value="csv"
                        checked={selectedExportFormat === "csv"}
                        onChange={() => setSelectedExportFormat("csv")}
                      />
                    </div>
                    <div className="format-card-icon csv">
                      <FileSpreadsheet size={22} />
                    </div>
                    <div className="format-card-info">
                      <div className="format-card-title-row">
                        <strong className="format-title">Fichier CSV (UTF-8 avec BOM)</strong>
                        <span className="format-badge csv">Universel</span>
                      </div>
                      <p className="format-desc">
                        Format brut standard avec séparateurs points-virgules, idéal pour l'import dans d'autres progiciels ou logiciels comptables.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Option de nom de fichier personnalisé */}
              <div className="export-filename-section">
                <label className="export-section-label" htmlFor="ben-export-filename">
                  Nom du fichier de sortie (optionnel) :
                </label>
                <div className="export-filename-input-wrapper">
                  <input
                    id="ben-export-filename"
                    type="text"
                    className="export-filename-input"
                    value={customExportFilename}
                    onChange={(e) => setCustomExportFilename(e.target.value)}
                    placeholder={`beneficiaires-${new Date().toISOString().split("T")[0]}.${selectedExportFormat === "excel" ? "xls" : "csv"}`}
                  />
                </div>
                <span className="export-filename-hint">
                  Laissez vide pour utiliser le nom généré automatiquement avec la date du jour.
                </span>
              </div>
            </div>

            <div className="print-confirm-actions">
              <button
                type="button"
                className="btn-confirm-cancel"
                onClick={() => setShowExportModal(false)}
                disabled={isExporting}
              >
                Annuler
              </button>

              <button
                type="button"
                className="btn-action-luxury-green"
                onClick={handleExecuteExport}
                disabled={isExporting || stats.totalCount === 0}
              >
                <FileDown size={16} />
                <span>
                  {isExporting ? "Génération de l'export..." : `Télécharger (${selectedExportFormat.toUpperCase()})`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal d'Importation assistée (Design harmonisé) */}
      {showImportModal && (
        <div className="print-confirm-overlay" role="dialog" aria-modal="true" onClick={() => setShowImportModal(false)}>
          <div className="print-confirm-modal" style={{ maxWidth: "560px" }} onClick={(e) => e.stopPropagation()}>
            <div className="print-confirm-header">
              <div className="print-confirm-icon-box gold">
                <Upload size={20} className="confirm-icon text-gold" />
              </div>
              <div style={{ flex: 1 }}>
                <h3 className="confirm-title">Importer des bénéficiaires</h3>
                <p className="confirm-subtitle">
                  Intégrez vos contacts et fournisseurs à partir d'un fichier CSV
                </p>
              </div>
              <button
                type="button"
                className="btn-modal-close"
                onClick={() => setShowImportModal(false)}
                title="Fermer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="export-modal-body" style={{ gap: "14px", padding: "18px 24px" }}>
              <p style={{ fontSize: "12.5px", color: "var(--text-secondary)", margin: 0, lineHeight: 1.45 }}>
                Sélectionnez un fichier CSV (avec séparateurs virgules ou points-virgules) contenant vos contacts ou partenaires.
              </p>

              <div
                style={{
                  border: "2px dashed var(--border-color)",
                  borderRadius: "8px",
                  padding: "24px 16px",
                  textAlign: "center",
                  background: "var(--bg-secondary)",
                  cursor: "pointer",
                  transition: "border-color 0.15s ease"
                }}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={26} style={{ color: "var(--gold-primary)", marginBottom: "8px" }} />
                <p style={{ margin: 0, fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                  Cliquez pour choisir un fichier CSV
                </p>
                <span style={{ fontSize: "11px", color: "var(--text-secondary)", display: "block", marginTop: "4px" }}>
                  Colonnes attendues : Nom ; Alias ; Téléphone ; RIB ; Notes
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt"
                  style={{ display: "none" }}
                  onChange={handleFileUpload}
                />
              </div>

              {importParsedItems.length > 0 && (
                <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: "6px", padding: "10px 14px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <CheckCircle2 size={16} style={{ color: "#166534", flexShrink: 0 }} />
                  <p style={{ margin: 0, fontSize: "12.5px", color: "#166534", fontWeight: 600 }}>
                    {importParsedItems.length} bénéficiaire(s) détecté(s) prêt(s) à être importé(s)
                  </p>
                </div>
              )}

              {importReport && (
                <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: "6px", padding: "10px 14px" }}>
                  <p style={{ margin: 0, fontSize: "12.5px", color: "#1E40AF" }}>{importReport}</p>
                </div>
              )}

              {importParsedItems.length > 0 && (
                <div className="form-group" style={{ marginTop: "4px" }}>
                  <label className="form-label" style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", display: "block", marginBottom: "4px" }}>
                    Gestion des doublons :
                  </label>
                  <select
                    className="form-input form-select"
                    value={importMode}
                    onChange={(e) => setImportMode(e.target.value as "update" | "ignore")}
                  >
                    <option value="update">Mettre à jour les coordonnées si le nom existe déjà</option>
                    <option value="ignore">Ignorer les bénéficiaires déjà existants</option>
                  </select>
                </div>
              )}
            </div>

            <div className="print-confirm-actions">
              <button
                type="button"
                className="btn-confirm-cancel"
                onClick={() => setShowImportModal(false)}
              >
                Annuler
              </button>
              <button
                type="button"
                className="btn-action-luxury-green"
                onClick={handleExecuteImport}
                disabled={importParsedItems.length === 0}
              >
                <Check size={16} />
                <span>Lancer l'importation ({importParsedItems.length})</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast de confirmation d'exportation identique à HistoryPage */}
      {exportToast && exportToast.show && (
        <div className="app-toast toast-success" role="status">
          <CheckCircle2 size={16} />
          <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
            <span>Export {exportToast.format} réussi !</span>
            {exportToast.filePath && (
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 400,
                  color: "var(--text-secondary)",
                  wordBreak: "break-all"
                }}
                title={exportToast.filePath}
              >
                {exportToast.filePath !== exportToast.filename
                  ? `Emplacement : ${exportToast.filePath}`
                  : exportToast.filename}
              </span>
            )}
          </div>
          <button
            type="button"
            className="toast-dismiss"
            onClick={() => setExportToast(null)}
            title="Fermer"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
};
