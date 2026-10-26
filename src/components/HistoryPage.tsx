import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  History,
  Search,
  Printer,
  Edit3,
  Trash2,
  CheckCircle2,
  FileText,
  Clock,
  ArrowLeft,
  ArrowRight,
  Building2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  RotateCcw,
  FileDown,
  AlertTriangle,
  XCircle,
  ShieldCheck,
  X,
  FileSpreadsheet,
  Ban,
  SlidersHorizontal,
  Calendar,
  Send,
  CheckSquare,
  ChevronDown,
  Filter,
  PlusCircle,
  Save,
  Paperclip
} from "lucide-react";
import type { ChequeRecord, ChequeStatus, BankTemplate, PrintAttemptRecord, PrintAttemptStatus, ChequeAuditEvent, ChequeAuditEventType } from "../types";
import { amountInFrenchWords, formatNumericAmount } from "../moneyToWords";
import { exportChequeToPdf } from "../services/pdfExport";
import { defaultBankTemplates } from "../banksData";
import { ChequeAttachmentModal } from "./ChequeAttachmentModal";
import {
  getPaginatedCheques,
  getAllFilteredCheques,
  cancelChequeRecord,
  updateChequeStatus,
  deleteChequeRecord,
  clearAllChequeRecords,
  getPrintAttempts,
  deletePrintAttempt,
  clearPrintLogs,
  getChequeFullAuditTimeline,
  type HistoryStats
} from "../services/db";
import { exportChequesToCsv, exportChequesToExcel, exportChequesToPdf as exportFilteredChequesToPdf, STATUS_LABELS } from "../services/exportReports";

interface HistoryPageProps {
  history?: ChequeRecord[];
  templates?: BankTemplate[];
  onCloneToHome: (record: ChequeRecord) => void;
  onReprintCheque: (record: ChequeRecord) => void;
  onDeleteRecord?: (id: string) => void;
  onClearHistory?: () => void;
  onBackToHome: () => void;
  refreshTrigger?: number;
}

export const HistoryPage: React.FC<HistoryPageProps> = ({
  templates = defaultBankTemplates,
  onCloneToHome,
  onReprintCheque,
  onDeleteRecord,
  onClearHistory,
  onBackToHome,
  refreshTrigger = 0
}) => {
  // Query & Filters state
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"all" | ChequeStatus>("all");
  const [bankFilter, setBankFilter] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  // Advanced multi-criteria search state
  const [showAdvancedFilters, setShowAdvancedFilters] = useState<boolean>(false);
  const [advChequeNumber, setAdvChequeNumber] = useState<string>("");
  const [advReference, setAdvReference] = useState<string>("");
  const [advBeneficiary, setAdvBeneficiary] = useState<string>("");
  const [advMinAmount, setAdvMinAmount] = useState<string>("");
  const [advMaxAmount, setAdvMaxAmount] = useState<string>("");

  // Export state
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [selectedExportFormat, setSelectedExportFormat] = useState<"excel" | "pdf" | "csv">("excel");
  const [customExportFilename, setCustomExportFilename] = useState<string>("");
  const [exportToast, setExportToast] = useState<{
    show: boolean;
    filePath?: string;
    filename?: string;
    format?: string;
  } | null>(null);

  // Modal d'annulation de chèque
  const [chequeToCancel, setChequeToCancel] = useState<ChequeRecord | null>(null);
  const [cancelReasonPreset, setCancelReasonPreset] = useState<string>("Erreur sur le montant");
  const [cancelCustomReason, setCancelCustomReason] = useState<string>("");

  // Modal des pièces jointes (factures / justificatifs)
  const [attachmentCheque, setAttachmentCheque] = useState<ChequeRecord | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [records, setRecords] = useState<ChequeRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Stats state
  const [stats, setStats] = useState<HistoryStats>({
    totalCount: 0,
    totalAmountFormatted: "0,00",
    printedCount: 0,
    savedCount: 0,
    readyCount: 0,
    deliveredCount: 0,
    cashedCount: 0,
    cancelledCount: 0
  });

  // Mode de vue : Chèques émis vs Journal d'audit des impressions
  const [activeView, setActiveView] = useState<"cheques" | "audit">("cheques");
  const [printLogs, setPrintLogs] = useState<PrintAttemptRecord[]>([]);
  const [selectedChequeForAudit, setSelectedChequeForAudit] = useState<ChequeRecord | null>(null);
  const [chequeSpecificLogs, setChequeSpecificLogs] = useState<ChequeAuditEvent[]>([]);
  const [auditStatusFilter, setAuditStatusFilter] = useState<"all" | PrintAttemptStatus>("all");
  const [auditSearchQuery, setAuditSearchQuery] = useState<string>("");

  // Debounce search input (180ms pour éviter de spammer la base de données)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1); // Reset to first page on search
    }, 180);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Reset page when status filter changes
  const handleStatusFilterChange = (filter: "all" | ChequeStatus) => {
    setStatusFilter(filter);
    setCurrentPage(1);
  };

  const handleResetAllFilters = () => {
    setSearchQuery("");
    setDebouncedSearch("");
    setStatusFilter("all");
    setBankFilter("all");
    setStartDate("");
    setEndDate("");
    setAdvChequeNumber("");
    setAdvReference("");
    setAdvBeneficiary("");
    setAdvMinAmount("");
    setAdvMaxAmount("");
    setCurrentPage(1);
  };

  // Charger les données paginées depuis SQLite / service db
  const fetchRecords = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await getPaginatedCheques({
        page: currentPage,
        pageSize,
        searchQuery: debouncedSearch,
        statusFilter,
        bankFilter,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        chequeNumber: advChequeNumber || undefined,
        reference: advReference || undefined,
        beneficiaryQuery: advBeneficiary || undefined,
        minAmount: advMinAmount ? parseFloat(advMinAmount) : undefined,
        maxAmount: advMaxAmount ? parseFloat(advMaxAmount) : undefined
      });

      setRecords(res.items);
      setTotalPages(res.totalPages);
      setTotalCount(res.totalCount);
      setStats(res.stats);
    } catch (err) {
      console.error("Erreur de chargement paginé des chèques:", err);
    } finally {
      setIsLoading(false);
    }
  }, [
    currentPage,
    pageSize,
    debouncedSearch,
    statusFilter,
    bankFilter,
    startDate,
    endDate,
    advChequeNumber,
    advReference,
    advBeneficiary,
    advMinAmount,
    advMaxAmount
  ]);

  const fetchPrintLogs = useCallback(async () => {
    try {
      const logs = await getPrintAttempts();
      setPrintLogs(logs);
    } catch (err) {
      console.warn("Erreur chargement logs audit:", err);
    }
  }, []);

  // Déclencher le chargement
  useEffect(() => {
    fetchRecords();
    fetchPrintLogs();
  }, [fetchRecords, fetchPrintLogs, refreshTrigger]);

  const handleCancelChequeConfirm = async () => {
    if (!chequeToCancel) return;
    const finalReason =
      cancelReasonPreset === "Autre"
        ? cancelCustomReason.trim() || "Autre motif non spécifié"
        : cancelCustomReason.trim()
        ? `${cancelReasonPreset} (${cancelCustomReason.trim()})`
        : cancelReasonPreset;

    await cancelChequeRecord(chequeToCancel.id, finalReason);
    setChequeToCancel(null);
    setCancelReasonPreset("Erreur sur le montant");
    setCancelCustomReason("");
    await fetchRecords();
    await fetchPrintLogs();
  };

  const handleUpdateStatus = async (id: string, newStatus: ChequeStatus) => {
    if (newStatus === "annule") {
      const target = records.find((r) => r.id === id);
      if (target) setChequeToCancel(target);
      return;
    }
    await updateChequeStatus(id, newStatus);
    await fetchRecords();
  };

  const getActiveFilterParams = () => {
    return {
      searchQuery: searchQuery.trim() || debouncedSearch.trim() || undefined,
      statusFilter,
      bankFilter,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      chequeNumber: advChequeNumber.trim() || undefined,
      reference: advReference.trim() || undefined,
      beneficiaryQuery: advBeneficiary.trim() || undefined,
      minAmount: advMinAmount ? parseFloat(advMinAmount) : undefined,
      maxAmount: advMaxAmount ? parseFloat(advMaxAmount) : undefined
    };
  };

  const getActiveFilterSummary = () => {
    const parts: string[] = [];
    if (statusFilter && statusFilter !== "all") {
      parts.push(`Statut : ${STATUS_LABELS[statusFilter] || statusFilter}`);
    }
    if (bankFilter && bankFilter !== "all") {
      const tpl = templates.find((t) => t.id === bankFilter);
      parts.push(`Banque : ${tpl ? tpl.shortName || tpl.name : bankFilter}`);
    }
    if (startDate && endDate) {
      parts.push(`Période : du ${formatDate(startDate)} au ${formatDate(endDate)}`);
    } else if (startDate) {
      parts.push(`Depuis le : ${formatDate(startDate)}`);
    } else if (endDate) {
      parts.push(`Jusqu'au : ${formatDate(endDate)}`);
    }
    if (searchQuery.trim()) {
      parts.push(`Recherche : "${searchQuery.trim()}"`);
    }
    if (advChequeNumber.trim()) {
      parts.push(`N° Chèque : ${advChequeNumber.trim()}`);
    }
    if (advReference.trim()) {
      parts.push(`Réf : ${advReference.trim()}`);
    }
    if (advBeneficiary.trim()) {
      parts.push(`Bénéficiaire : ${advBeneficiary.trim()}`);
    }
    if (advMinAmount && advMaxAmount) {
      parts.push(`Montant : ${advMinAmount} à ${advMaxAmount} DA`);
    } else if (advMinAmount) {
      parts.push(`Montant min : ${advMinAmount} DA`);
    } else if (advMaxAmount) {
      parts.push(`Montant max : ${advMaxAmount} DA`);
    }

    return parts.length > 0 ? parts.join(" | ") : "Tous les chèques (aucun filtre spécifique)";
  };

  const getExportFilename = (format: "excel" | "pdf" | "csv" | "xls") => {
    const dateTag = new Date().toISOString().split("T")[0];
    const chunks: string[] = ["cheques"];
    if (bankFilter && bankFilter !== "all") {
      chunks.push(bankFilter.toLowerCase().replace(/[^a-z0-9]/g, "-"));
    }
    if (statusFilter && statusFilter !== "all") {
      chunks.push(statusFilter);
    }
    chunks.push(dateTag);
    const ext = format === "excel" ? "xls" : format;
    return `${chunks.join("-")}.${ext}`;
  };

  const handleExecuteExport = async () => {
    try {
      setIsExporting(true);
      const all = await getAllFilteredCheques(getActiveFilterParams());
      const filterSummary = getActiveFilterSummary();
      const baseName = customExportFilename.trim() || getExportFilename(selectedExportFormat);

      let result;
      if (selectedExportFormat === "excel") {
        const fn = baseName.toLowerCase().endsWith(".xls") ? baseName : `${baseName.replace(/\.[a-z0-9]+$/i, "")}.xls`;
        result = await exportChequesToExcel(all, {
          filterSummary,
          customFilename: fn
        });
      } else if (selectedExportFormat === "pdf") {
        const fn = baseName.toLowerCase().endsWith(".pdf") ? baseName : `${baseName.replace(/\.[a-z0-9]+$/i, "")}.pdf`;
        result = await exportFilteredChequesToPdf(all, {
          filterSummary,
          customFilename: fn
        });
      } else {
        const fn = baseName.toLowerCase().endsWith(".csv") ? baseName : `${baseName.replace(/\.[a-z0-9]+$/i, "")}.csv`;
        result = await exportChequesToCsv(all, {
          filterSummary,
          customFilename: fn
        });
      }

      if (result && !result.canceled) {
        setShowExportModal(false);
        setCustomExportFilename("");
        setExportToast({
          show: true,
          filePath: result.filePath,
          filename: result.filename || baseName,
          format: selectedExportFormat.toUpperCase()
        });
        setTimeout(() => {
          setExportToast(null);
        }, 6000);
      }
    } catch (err) {
      console.error("Erreur exportation:", err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleOpenChequeAudit = async (cheque: ChequeRecord) => {
    setSelectedChequeForAudit(cheque);
    try {
      const logs = await getChequeFullAuditTimeline(cheque);
      setChequeSpecificLogs(logs);
    } catch {
      setChequeSpecificLogs([]);
    }
  };

  const handleDeleteAuditLog = async (id: string) => {
    if (window.confirm("Supprimer définitivement cette trace du journal d'audit ?")) {
      await deletePrintAttempt(id);
      await fetchPrintLogs();
      if (selectedChequeForAudit) {
        const logs = await getChequeFullAuditTimeline(selectedChequeForAudit);
        setChequeSpecificLogs(logs);
      }
    }
  };

  const handleClearAuditLogs = async () => {
    if (window.confirm("Supprimer l'ensemble du journal d'audit des tentatives d'impression ?")) {
      await clearPrintLogs();
      await fetchPrintLogs();
      if (selectedChequeForAudit) {
        const logs = await getChequeFullAuditTimeline(selectedChequeForAudit);
        setChequeSpecificLogs(logs);
      } else {
        setChequeSpecificLogs([]);
      }
    }
  };

  const renderAuditEventIcon = (type: ChequeAuditEventType) => {
    switch (type) {
      case "created":
        return <PlusCircle size={15} className="timeline-ev-icon created" />;
      case "updated":
        return <Save size={15} className="timeline-ev-icon updated" />;
      case "status_changed":
        return <Clock size={15} className="timeline-ev-icon status_changed" />;
      case "printed":
        return <Printer size={15} className="timeline-ev-icon printed" />;
      case "print_failed":
        return <AlertTriangle size={15} className="timeline-ev-icon print_failed" />;
      case "cancelled":
        return <Ban size={15} className="timeline-ev-icon cancelled" />;
      default:
        return <FileText size={15} className="timeline-ev-icon default" />;
    }
  };

  const getAuditEventBadge = (event: ChequeAuditEvent) => {
    switch (event.eventType) {
      case "created":
        return <span className="audit-badge created">Création initiale</span>;
      case "updated":
        return <span className="audit-badge updated">Modification</span>;
      case "status_changed":
        return (
          <span className="audit-badge status_changed" style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
            {event.fromStatus && (
              <>
                <span>{STATUS_LABELS[event.fromStatus] || event.fromStatus}</span>
                <ArrowRight size={11} />
              </>
            )}
            <span>{STATUS_LABELS[event.toStatus || "saved"] || event.toStatus}</span>
          </span>
        );
      case "printed":
        return <span className="audit-badge confirmed">Sortie physique confirmée</span>;
      case "print_failed":
        return <span className="audit-badge failed">Incident / Échec d'impression</span>;
      case "cancelled":
        return <span className="audit-badge cancelled">Chèque annulé</span>;
      default:
        return <span className="audit-badge info">Événement</span>;
    }
  };

  const auditStats = useMemo(() => {
    const total = printLogs.length;
    const confirmed = printLogs.filter((l) => l.status === "confirmed").length;
    const failed = printLogs.filter((l) => l.status === "failed" || l.status === "cancelled").length;
    const requested = printLogs.filter((l) => l.status === "requested").length;
    return { total, confirmed, failed, requested };
  }, [printLogs]);

  const filteredAuditLogs = useMemo(() => {
    return printLogs.filter((log) => {
      const matchesStatus = auditStatusFilter === "all" || log.status === auditStatusFilter;
      const q = auditSearchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        log.beneficiary.toLowerCase().includes(q) ||
        log.amount.includes(q) ||
        log.bankName.toLowerCase().includes(q) ||
        (log.failureReason && log.failureReason.toLowerCase().includes(q));
      return matchesStatus && matchesSearch;
    });
  }, [printLogs, auditStatusFilter, auditSearchQuery]);

  // Suppression d'un chèque
  const handleDelete = async (id: string, beneficiary: string) => {
    if (window.confirm(`Supprimer ce chèque pour "${beneficiary}" de l'historique ?`)) {
      await deleteChequeRecord(id);
      onDeleteRecord?.(id);
      await fetchRecords();
    }
  };

  // Vider tout l'historique
  const handleClearAll = async () => {
    if (
      window.confirm(
        "Êtes-vous sûr de vouloir vider l'ensemble de l'historique des chèques ? Cette action est irréversible."
      )
    ) {
      await clearAllChequeRecords();
      onClearHistory?.();
      setCurrentPage(1);
      await fetchRecords();
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "—";
    try {
      const parts = dateStr.split("-");
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString("fr-FR");
    } catch {
      return dateStr;
    }
  };

  const formatTimestamp = (isoStr?: string) => {
    if (!isoStr) return "";
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return "";
      return d.toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch {
      return "";
    }
  };

  // Pagination navigation helpers
  const startItemIndex = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItemIndex = Math.min(currentPage * pageSize, totalCount);

  // Generate page numbers
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
    <div className="history-page">
      {/* 1. Header de la page */}
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
              <h1 className="history-main-title">
                {activeView === "cheques" ? "Historique des chèques" : "Journal d'audit des impressions"}
              </h1>
              <span className="count-pill">
                {activeView === "cheques" ? stats.totalCount : printLogs.length}
              </span>
            </div>
            <p className="history-main-subtitle">
              {activeView === "cheques"
                ? "Chèques émis et enregistrés — réimpression, export PDF et modification via clonage."
                : "Journal horodaté des impressions : lancements, confirmations et incidents."}
            </p>
          </div>

          <div className="header-actions-group">
            {activeView === "cheques" && (
              <button
                type="button"
                className="btn-action-luxury-green"
                onClick={() => setShowExportModal(true)}
                disabled={isExporting || totalCount === 0}
                title={
                  totalCount === 0
                    ? "Aucun chèque correspondant aux filtres actifs à exporter"
                    : "Exporter l'historique des chèques (Excel, PDF, CSV)"
                }
              >
                <FileDown size={17} />
                <span>Exporter</span>
              </button>
            )}

            <button
              type="button"
              className="btn-action-card"
              onClick={() => {
                fetchRecords();
                fetchPrintLogs();
              }}
              title="Actualiser la liste"
            >
              <RotateCcw size={16} className="btn-action-icon" />
              <span>Actualiser</span>
            </button>

            {activeView === "cheques" && stats.totalCount > 0 && (
              <button
                type="button"
                className="btn-action-card btn-clear-danger"
                onClick={handleClearAll}
                title="Vider l'historique des chèques"
              >
                <Trash2 size={16} className="btn-action-icon text-red" />
                <span>Vider l'historique</span>
              </button>
            )}

            {activeView === "audit" && printLogs.length > 0 && (
              <button
                type="button"
                className="btn-action-card btn-clear-danger"
                onClick={handleClearAuditLogs}
                title="Vider le journal d'audit"
              >
                <Trash2 size={16} className="btn-action-icon text-red" />
                <span>Vider l'audit</span>
              </button>
            )}
          </div>
        </div>

        {/* Sélecteur de vue : Chèques vs Journal d'audit */}
        <div className="history-view-tabs-container">
          <button
            type="button"
            className={`view-tab-btn ${activeView === "cheques" ? "active" : ""}`}
            onClick={() => setActiveView("cheques")}
          >
            <FileText size={15} />
            <span>Chèques ({stats.totalCount})</span>
          </button>
          <button
            type="button"
            className={`view-tab-btn ${activeView === "audit" ? "active" : ""}`}
            onClick={() => setActiveView("audit")}
          >
            <Printer size={15} />
            <span>Journal d'impression ({printLogs.length})</span>
          </button>
        </div>
      </div>

      {activeView === "cheques" ? (
        <>
          {/* 2. Cartes statistiques du cycle de vie */}
          <div className="history-stats-grid">
            <div className="history-stat-card">
              <div className="stat-icon-wrapper gold">
                <FileText size={18} />
              </div>
              <div className="stat-content">
                <span className="stat-label">Total des chèques</span>
                <strong className="stat-value">{stats.totalCount}</strong>
              </div>
            </div>

            <div className="history-stat-card">
              <div className="stat-icon-wrapper green">
                <CheckCircle2 size={18} />
              </div>
              <div className="stat-content">
                <span className="stat-label">Imprimés</span>
                <strong className="stat-value">{stats.printedCount}</strong>
              </div>
            </div>

            <div className="history-stat-card">
              <div className="stat-icon-wrapper blue">
                <Clock size={18} />
              </div>
              <div className="stat-content">
                <span className="stat-label">Brouillons & Prêts</span>
                <strong className="stat-value">{(stats.readyCount || 0) + stats.savedCount}</strong>
              </div>
            </div>

            <div className="history-stat-card">
              <div className="stat-icon-wrapper amber">
                <Send size={18} />
              </div>
              <div className="stat-content">
                <span className="stat-label">Remis & Encaissés</span>
                <strong className="stat-value">{(stats.deliveredCount || 0) + (stats.cashedCount || 0)}</strong>
              </div>
            </div>

            <div className="history-stat-card cancelled-stat">
              <div className="stat-icon-wrapper red">
                <Ban size={18} />
              </div>
              <div className="stat-content">
                <span className="stat-label">Annulés</span>
                <strong className="stat-value">{stats.cancelledCount || 0}</strong>
              </div>
            </div>

            <div className="history-stat-card total-amount-card">
              <div className="stat-icon-wrapper gold">
                <Building2 size={18} />
              </div>
              <div className="stat-content">
                <span className="stat-label">Montant actif cumulé</span>
                <strong className="stat-value">{stats.totalAmountFormatted} DA</strong>
              </div>
            </div>
          </div>

          {/* 3. Barre de recherche et filtres unifiés sur la même ligne */}
          <div className="history-toolbar-card">
            <div className="history-toolbar-unified-row">
              {/* Recherche globale */}
              <div className="history-search-box">
                <Search size={15} className="history-search-icon" />
                <input
                  type="text"
                  className="history-search-input"
                  placeholder="Recherche générale : bénéficiaire, montant, banque, date, n° chèque..."
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

              {/* Filtre de Statut (dropdown menu avec même style) */}
              <div className="filter-group-dropdown">
                <Filter size={14} className="filter-field-icon" />
                <select
                  value={statusFilter}
                  onChange={(e) => handleStatusFilterChange(e.target.value as any)}
                  className="history-select-dropdown"
                  title="Filtrer par statut du cycle de vie"
                >
                  <option value="all">Tous les statuts ({stats.totalCount})</option>
                  <option value="saved">Brouillons ({stats.savedCount})</option>
                  <option value="pret">Prêts ({stats.readyCount || 0})</option>
                  <option value="printed">Imprimés ({stats.printedCount})</option>
                  <option value="remis">Remis ({stats.deliveredCount || 0})</option>
                  <option value="encaisse">Encaissés ({stats.cashedCount || 0})</option>
                  <option value="annule">Annulés ({stats.cancelledCount || 0})</option>
                </select>
              </div>

              {/* Filtre de Banque (même style) */}
              <div className="filter-group-dropdown">
                <Building2 size={14} className="filter-field-icon" />
                <select
                  value={bankFilter}
                  onChange={(e) => {
                    setBankFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="history-select-dropdown"
                  title="Filtrer par banque"
                >
                  <option value="all">Toutes les banques</option>
                  {templates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.shortName || tpl.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filtre de Période (même style) */}
              <div className="filter-group-dropdown date-group">
                <Calendar size={14} className="filter-field-icon" />
                <div className="date-inputs-wrapper">
                  <input
                    type="date"
                    className="history-date-input"
                    title="Date d'émission de début"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      setCurrentPage(1);
                    }}
                  />
                  <span className="date-separator">au</span>
                  <input
                    type="date"
                    className="history-date-input"
                    title="Date d'émission de fin"
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      setCurrentPage(1);
                    }}
                  />
                  {(startDate || endDate) && (
                    <button
                      type="button"
                      className="btn-clear-dates"
                      onClick={() => {
                        setStartDate("");
                        setEndDate("");
                        setCurrentPage(1);
                      }}
                      title="Effacer les dates"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>

              {/* Bouton Filtres avancés */}
              <button
                type="button"
                className={`btn-toggle-advanced ${showAdvancedFilters ? "active" : ""}`}
                onClick={() => setShowAdvancedFilters((v) => !v)}
                title="Afficher/masquer les filtres fins (référence, montant min/max, n° chèque)"
              >
                <SlidersHorizontal size={14} />
                <span>Avancé</span>
                {Boolean(advChequeNumber || advReference || advBeneficiary || advMinAmount || advMaxAmount) && (
                  <span className="active-adv-dot" />
                )}
              </button>

              {/* Réinitialiser filtres */}
              {(statusFilter !== "all" ||
                bankFilter !== "all" ||
                startDate ||
                endDate ||
                advChequeNumber ||
                advReference ||
                advBeneficiary ||
                advMinAmount ||
                advMaxAmount ||
                searchQuery) && (
                <button
                  type="button"
                  className="btn-reset-filters"
                  onClick={handleResetAllFilters}
                  title="Réinitialiser tous les critères de recherche"
                >
                  <X size={13} />
                  <span>Réinitialiser</span>
                </button>
              )}
            </div>

            {/* Volet repliable : Recherche avancée multi-critères sur une seule ligne */}
            {showAdvancedFilters && (
              <div className="history-advanced-drawer">
                <div className="adv-filter-field">
                  <label>N° Chèque :</label>
                  <input
                    type="text"
                    placeholder="Ex: 0048291"
                    value={advChequeNumber}
                    onChange={(e) => {
                      setAdvChequeNumber(e.target.value);
                      setCurrentPage(1);
                    }}
                  />
                </div>

                <div className="adv-filter-field">
                  <label>Réf / Facture :</label>
                  <input
                    type="text"
                    placeholder="Ex: FAC-2026-042"
                    value={advReference}
                    onChange={(e) => {
                      setAdvReference(e.target.value);
                      setCurrentPage(1);
                    }}
                  />
                </div>

                <div className="adv-filter-field">
                  <label>Bénéficiaire :</label>
                  <input
                    type="text"
                    placeholder="Ex: SONELGAZ"
                    value={advBeneficiary}
                    onChange={(e) => {
                      setAdvBeneficiary(e.target.value);
                      setCurrentPage(1);
                    }}
                  />
                </div>

                <div className="adv-filter-field">
                  <label>Min :</label>
                  <input
                    type="number"
                    placeholder="0 DA"
                    value={advMinAmount}
                    onChange={(e) => {
                      setAdvMinAmount(e.target.value);
                      setCurrentPage(1);
                    }}
                  />
                </div>

                <div className="adv-filter-field">
                  <label>Max :</label>
                  <input
                    type="number"
                    placeholder="Montant max"
                    value={advMaxAmount}
                    onChange={(e) => {
                      setAdvMaxAmount(e.target.value);
                      setCurrentPage(1);
                    }}
                  />
                </div>
              </div>
            )}
          </div>

      {/* 4. Liste des chèques */}
      {records.length === 0 ? (
        <div className="history-empty-state">
          <div className="empty-icon-circle">
            <History size={32} />
          </div>
          <h3 className="empty-title">
            {stats.totalCount === 0
              ? "Aucun chèque dans l'historique"
              : "Aucun chèque ne correspond à votre recherche"}
          </h3>
          <p className="empty-description">
            {stats.totalCount === 0
              ? "Vos chèques imprimés et enregistrés apparaîtront ici automatiquement."
              : "Essayez de modifier votre mot-clé de recherche ou de réinitialiser les filtres."}
          </p>
          {stats.totalCount === 0 ? (
            <button type="button" className="btn-empty-action" onClick={onBackToHome}>
              <Edit3 size={15} />
              <span>Créer un premier chèque</span>
            </button>
          ) : (
            <button
              type="button"
              className="btn-empty-action"
              onClick={() => {
                setSearchQuery("");
                setStatusFilter("all");
              }}
            >
              Réinitialiser les filtres
            </button>
          )}
        </div>
      ) : (
        <div className="history-content-with-pagination">
          <div className="history-table-card">
            <table className="history-table">
              <thead>
                <tr>
                  <th className="ht-col-status">Statut</th>
                  <th>Bénéficiaire</th>
                  <th className="ht-col-amount">Montant</th>
                  <th className="ht-col-number">N° chèque</th>
                  <th>Date</th>
                  <th>Banque</th>
                  <th className="ht-col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
            {records.map((item) => {
              const numAmount = Number((item.amount || "0").replace(/\s/g, "").replace(",", ".")) || 0;
              const formattedNum = numAmount.toLocaleString("fr-FR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              });
              const wordsPreview = amountInFrenchWords(item.amount);
              const timestampLabel =
                item.status === "printed" && item.printedAt
                  ? `Imprimé le ${formatTimestamp(item.printedAt)}`
                  : `Enregistré le ${formatTimestamp(item.createdAt)}`;
              const barcodeToken = item.crossedWithText !== false ? "// Barré" : "// Barré simple";

              return (
                <tr key={item.id} className={item.status === "annule" ? "cheque-row-cancelled" : ""}>
                  <td className="ht-col-status">
                    <span className={`cheque-status-tag ${item.status}`} title={item.status === "annule" ? `Motif : ${item.cancellationReason || "Non précisé"}` : undefined}>
                      {item.status === "printed" ? (
                        <>
                          <CheckCircle2 size={13} />
                          <span>Imprimé{item.printCount && item.printCount > 1 ? ` (x${item.printCount})` : ""}</span>
                        </>
                      ) : item.status === "pret" ? (
                        <>
                          <CheckSquare size={13} />
                          <span>Prêt</span>
                        </>
                      ) : item.status === "remis" ? (
                        <>
                          <Send size={13} />
                          <span>Remis</span>
                        </>
                      ) : item.status === "encaisse" ? (
                        <>
                          <ShieldCheck size={13} />
                          <span>Encaissé</span>
                        </>
                      ) : item.status === "annule" ? (
                        <>
                          <Ban size={13} />
                          <span>Annulé</span>
                        </>
                      ) : (
                        <>
                          <Clock size={13} />
                          <span>Brouillon</span>
                        </>
                      )}
                    </span>
                    {item.status === "annule" && item.cancellationReason && (
                      <span className="cancellation-reason-sub" title={item.cancellationReason}>
                        {item.cancellationReason}
                      </span>
                    )}
                  </td>

                  <td className="ht-col-beneficiary">
                    <span
                      className="ht-beneficiary"
                      title={`À l'ordre de : ${item.beneficiary || "Bénéficiaire non renseigné"}\nMontant en lettres : ${wordsPreview}`}
                    >
                      {item.beneficiary || "Bénéficiaire non renseigné"}
                    </span>
                    {item.reference && (
                      <span className="ht-reference-badge" title="Référence interne">
                        Réf: {item.reference}
                      </span>
                    )}
                  </td>

                  <td className="ht-col-amount">
                    <span className="ht-amount" title={`Montant en lettres : ${wordsPreview}`}>
                      {formattedNum} DA
                    </span>
                  </td>

                  <td className="ht-col-number">
                    <span className="ht-number">{item.chequeNumber || "—"}</span>
                    {item.isCrossed !== false && (
                      <span
                        className="ht-crossed"
                        title={item.crossedWithText !== false ? "Chèque barré — Non endossable" : "Chèque barré simple (sans mention)"}
                      >
                        {barcodeToken}
                      </span>
                    )}
                  </td>

                  <td className="ht-col-date" title={timestampLabel}>
                    <span className="ht-date-main">{formatDate(item.date)}</span>
                    {item.place && <span className="ht-date-sub">Fait à {item.place}</span>}
                  </td>

                  <td className="ht-col-bank">
                    <span className="ht-bank" title={item.bankName}>
                      <Building2 size={13} />
                      <span>{item.bankName}</span>
                    </span>
                  </td>

                  <td className="ht-col-actions">
                    <div className="ht-actions">
                      {/* Sélecteur de statut rapide */}
                      <select
                        className="ht-status-select"
                        value={item.status === "brouillon" ? "saved" : item.status}
                        onChange={(e) => handleUpdateStatus(item.id, e.target.value as ChequeStatus)}
                        title="Changer rapidement le statut du chèque"
                      >
                        <option value="saved">Brouillon</option>
                        <option value="pret">Prêt</option>
                        <option value="printed">Imprimé</option>
                        <option value="remis">Remis</option>
                        <option value="encaisse">Encaissé</option>
                        {item.status === "annule" && <option value="annule">Annulé</option>}
                      </select>

                      <button
                        type="button"
                        className="ht-act audit"
                        onClick={() => handleOpenChequeAudit(item)}
                        title="Consulter les tentatives et traces d'impression de ce chèque"
                      >
                        <ShieldCheck size={14} />
                      </button>

                      <button
                        type="button"
                        className="ht-act attachment"
                        onClick={() => setAttachmentCheque(item)}
                        title="Gérer les factures et pièces justificatives associées"
                      >
                        <Paperclip size={14} />
                      </button>

                      <button
                        type="button"
                        className="ht-act"
                        onClick={() => onCloneToHome(item)}
                        title="Charger les données de ce chèque dans l'accueil pour le modifier"
                      >
                        <Edit3 size={14} />
                      </button>

                      <button
                        type="button"
                        className="ht-act reprint"
                        onClick={() => onReprintCheque(item)}
                        title="Ouvrir la disposition et imprimer ce chèque"
                      >
                        <Printer size={14} />
                      </button>

                      <button
                        type="button"
                        className="ht-act pdf"
                        onClick={() => {
                          const tpl = templates?.find((t) => t.id === item.bankTemplateId) || defaultBankTemplates[0];
                          const words = amountInFrenchWords(item.amount);
                          const formattedNumeric = formatNumericAmount(item.amount);
                          exportChequeToPdf({
                            mode: "exact-cheque",
                            template: tpl,
                            amount: item.amount,
                            formattedNumeric,
                            words,
                            beneficiary: item.beneficiary,
                            place: item.place,
                            date: item.date,
                            isCrossed: item.isCrossed !== false,
                            crossedWithText: item.crossedWithText !== false
                          });
                        }}
                        title="Exporter directement ce chèque en PDF vectoriel"
                      >
                        <FileDown size={14} />
                      </button>

                      {/* Bouton Annuler avec motif */}
                      {item.status !== "annule" ? (
                        <button
                          type="button"
                          className="ht-act cancel-btn"
                          onClick={() => setChequeToCancel(item)}
                          title="Annuler ce chèque (conserve l'historique avec le motif)"
                        >
                          <Ban size={14} />
                        </button>
                      ) : (
                        <span className="ht-act cancelled-badge" title={`Annulé : ${item.cancellationReason || "Motif non précisé"}`}>
                          <Ban size={14} />
                        </span>
                      )}

                      <button
                        type="button"
                        className="ht-act delete"
                        onClick={() => handleDelete(item.id, item.beneficiary)}
                        title="Supprimer définitivement de la base"
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

          {/* 5. Barre de pagination SQLite */}
          <div className="history-pagination-bar">
            <div className="pagination-info">
              <span>
                Affichage de <strong>{startItemIndex}</strong> à <strong>{endItemIndex}</strong> sur{" "}
                <strong>{totalCount}</strong> chèque{totalCount > 1 ? "s" : ""}
              </span>

              <div className="page-size-selector">
                <span className="selector-label">Lignes par page :</span>
                <select
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
                  disabled={currentPage <= 1}
                  title="Première page"
                >
                  <ChevronsLeft size={16} />
                </button>

                <button
                  type="button"
                  className="btn-page-nav"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
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
                  disabled={currentPage >= totalPages}
                  title="Page suivante"
                >
                  <ChevronRight size={16} />
                </button>

                <button
                  type="button"
                  className="btn-page-nav"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage >= totalPages}
                  title="Dernière page"
                >
                  <ChevronsRight size={16} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
        </>
      ) : (
        /* ==========================================================================
           VUE 2 : JOURNAL D'AUDIT COMPLET DES TENTATIVES D'IMPRESSION
           ========================================================================== */
        <div className="audit-view-container">
          {/* Cartes statistiques audit */}
          <div className="history-stats-grid">
            <div className="history-stat-card">
              <div className="stat-icon-wrapper gold">
                <Printer size={18} />
              </div>
              <div className="stat-content">
                <span className="stat-label">Total des tentatives</span>
                <strong className="stat-value">{auditStats.total}</strong>
              </div>
            </div>

            <div className="history-stat-card">
              <div className="stat-icon-wrapper green">
                <CheckCircle2 size={18} />
              </div>
              <div className="stat-content">
                <span className="stat-label">Sorties physiques confirmées</span>
                <strong className="stat-value">{auditStats.confirmed}</strong>
              </div>
            </div>

            <div className="history-stat-card">
              <div className="stat-icon-wrapper red">
                <AlertTriangle size={18} />
              </div>
              <div className="stat-content">
                <span className="stat-label">Incidents & Annulations</span>
                <strong className="stat-value">{auditStats.failed}</strong>
              </div>
            </div>

            <div className="history-stat-card">
              <div className="stat-icon-wrapper blue">
                <Clock size={18} />
              </div>
              <div className="stat-content">
                <span className="stat-label">En attente de validation</span>
                <strong className="stat-value">{auditStats.requested}</strong>
              </div>
            </div>
          </div>

          {/* Barre de recherche et filtres de statut audit */}
          <div className="history-toolbar-card">
            <div className="history-search-box">
              <Search size={16} className="history-search-icon" />
              <input
                type="text"
                className="history-search-input"
                placeholder="Rechercher par bénéficiaire, banque, montant ou motif d'incident..."
                value={auditSearchQuery}
                onChange={(e) => setAuditSearchQuery(e.target.value)}
              />
              {auditSearchQuery && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => setAuditSearchQuery("")}
                >
                  Effacer
                </button>
              )}
            </div>

            <div className="history-filter-pills">
              <button
                type="button"
                className={`filter-pill ${auditStatusFilter === "all" ? "active" : ""}`}
                onClick={() => setAuditStatusFilter("all")}
              >
                Tous ({auditStats.total})
              </button>
              <button
                type="button"
                className={`filter-pill ${auditStatusFilter === "confirmed" ? "active" : ""}`}
                onClick={() => setAuditStatusFilter("confirmed")}
              >
                Confirmés ({auditStats.confirmed})
              </button>
              <button
                type="button"
                className={`filter-pill ${auditStatusFilter === "failed" ? "active" : ""}`}
                onClick={() => setAuditStatusFilter("failed")}
              >
                Incidents ({auditStats.failed})
              </button>
              <button
                type="button"
                className={`filter-pill ${auditStatusFilter === "requested" ? "active" : ""}`}
                onClick={() => setAuditStatusFilter("requested")}
              >
                En attente ({auditStats.requested})
              </button>
            </div>
          </div>

          {/* Liste des journaux d'audit */}
          {filteredAuditLogs.length === 0 ? (
            <div className="history-empty-state">
              <div className="empty-icon-circle">
                <Printer size={32} />
              </div>
              <h3 className="empty-title">Aucune trace d'impression</h3>
              <p className="empty-description">
                Toutes les tentatives d'impression et réimpressions seront automatiquement tracées ici avec leur résultat physique et motif d'incident le cas échéant.
              </p>
            </div>
          ) : (
            <div className="audit-logs-table-card">
              <table className="audit-table">
                <thead>
                  <tr>
                    <th>Date & Heure</th>
                    <th>Bénéficiaire</th>
                    <th>Montant</th>
                    <th>Banque</th>
                    <th>Tirage</th>
                    <th>Format / Emplacement</th>
                    <th>Résultat physique</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAuditLogs.map((log) => (
                    <tr key={log.id} className={`audit-row ${log.status}`}>
                      <td className="audit-col-date">
                        <span className="audit-date-txt">{formatTimestamp(log.attemptedAt)}</span>
                      </td>
                      <td className="audit-col-beneficiary">
                        <strong>{log.beneficiary}</strong>
                      </td>
                      <td className="audit-col-amount">
                        <span className="audit-amount-pill">{log.amount} DZD</span>
                      </td>
                      <td className="audit-col-bank">{log.bankName}</td>
                      <td className="audit-col-copy">
                        <span className="copy-pill">
                          {log.copyNumber > 1 ? `Copie N°${log.copyNumber}` : "1er tirage"}
                        </span>
                      </td>
                      <td className="audit-col-format">
                        <span className="format-txt">{log.paperFormat || "A4"} ({log.placement || "Centre"})</span>
                      </td>
                      <td className="audit-col-status">
                        {log.status === "confirmed" ? (
                          <span className="audit-badge confirmed">
                            <CheckCircle2 size={13} />
                            <span>Confirmé</span>
                          </span>
                        ) : log.status === "failed" ? (
                          <div className="audit-incident-block">
                            <span className="audit-badge failed">
                              <AlertTriangle size={13} />
                              <span>Incident</span>
                            </span>
                            {log.failureReason && (
                              <span className="incident-reason-tag" title={log.failureReason}>
                                {log.failureReason}
                              </span>
                            )}
                          </div>
                        ) : log.status === "cancelled" ? (
                          <span className="audit-badge cancelled">
                            <XCircle size={13} />
                            <span>Annulé</span>
                          </span>
                        ) : (
                          <span className="audit-badge requested">
                            <Clock size={13} />
                            <span>Demandé</span>
                          </span>
                        )}
                      </td>
                      <td className="audit-col-actions">
                        <button
                          type="button"
                          className="btn-audit-row-delete"
                          onClick={() => handleDeleteAuditLog(log.id)}
                          title="Supprimer cette ligne du journal"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal d'audit spécifique pour un chèque donné (Historique complet du cycle de vie) */}
      {selectedChequeForAudit && (
        <div className="print-confirm-overlay" role="dialog" aria-modal="true" onClick={() => setSelectedChequeForAudit(null)}>
          <div className="print-confirm-modal audit-timeline-modal" onClick={(e) => e.stopPropagation()}>
            <div className="print-confirm-header">
              <div className="print-confirm-icon-box">
                <ShieldCheck size={22} className="confirm-icon text-gold" />
              </div>
              <div style={{ flex: 1 }}>
                <h3 className="confirm-title">Journal d'audit du chèque</h3>
                <p className="confirm-subtitle">
                  {selectedChequeForAudit.beneficiary} — {formatNumericAmount(selectedChequeForAudit.amount)} DZD ({selectedChequeForAudit.bankName})
                </p>
                <div className="audit-header-metadata">
                  <span className={`status-badge ${selectedChequeForAudit.status || "saved"}`}>
                    {STATUS_LABELS[selectedChequeForAudit.status || "saved"] || selectedChequeForAudit.status}
                  </span>
                  {selectedChequeForAudit.chequeNumber && (
                    <span className="audit-meta-pill">N° {selectedChequeForAudit.chequeNumber}</span>
                  )}
                  {selectedChequeForAudit.reference && (
                    <span className="audit-meta-pill">Réf: {selectedChequeForAudit.reference}</span>
                  )}
                  <span className="audit-meta-pill count">{chequeSpecificLogs.length} trace(s) d'audit</span>
                </div>
              </div>
              <button
                type="button"
                className="btn-modal-close"
                onClick={() => setSelectedChequeForAudit(null)}
                title="Fermer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="cheque-audit-modal-body">
              {chequeSpecificLogs.length === 0 ? (
                <p className="audit-empty-modal-text">
                  Aucun événement consigné dans le journal d'audit pour ce chèque.
                </p>
              ) : (
                <div className="cheque-audit-timeline">
                  {chequeSpecificLogs.map((log) => (
                    <div key={log.id} className={`audit-timeline-item ${log.eventType}`}>
                      <div className={`timeline-marker ${log.eventType}`}>
                        {renderAuditEventIcon(log.eventType)}
                      </div>
                      <div className="timeline-content">
                        <div className="timeline-header">
                          <strong className="timeline-title">{log.title}</strong>
                          <span className="timeline-time">{formatTimestamp(log.timestamp)}</span>
                        </div>

                        <div className="timeline-badge-row">
                          {getAuditEventBadge(log)}
                          {log.metadata?.paperFormat && (
                            <span className="timeline-format">
                              {log.metadata.paperFormat} · {log.metadata.placement || "Centre"}
                            </span>
                          )}
                          {log.metadata?.place && (
                            <span className="timeline-format">Lieu : {log.metadata.place}</span>
                          )}
                        </div>

                        {log.description && (
                          <p className="timeline-description-text">{log.description}</p>
                        )}

                        {/* Motif exact en cas d'incident d'impression ou d'annulation formelle */}
                        {log.reason && (
                          <div className={`audit-reason-alert-box ${log.eventType === "cancelled" ? "danger" : "warning"}`}>
                            <div className="audit-reason-header">
                              {log.eventType === "cancelled" ? <Ban size={15} /> : <AlertTriangle size={15} />}
                              <strong>
                                {log.eventType === "cancelled"
                                  ? "Motif exact de l'annulation :"
                                  : "Motif exact du rejet / de l'échec :"}
                              </strong>
                            </div>
                            <p className="audit-reason-text">{log.reason}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="print-confirm-actions" style={{ justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn-modal-secondary"
                onClick={() => setSelectedChequeForAudit(null)}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}


      {/* 8. Modal de sélection du format d'exportation (Excel, PDF, CSV) */}
      {showExportModal && (
        <div
          className="print-confirm-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => !isExporting && setShowExportModal(false)}
        >
          <div
            className="print-confirm-modal export-selection-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="print-confirm-header">
              <div className="print-confirm-icon-box">
                <FileDown size={22} className="confirm-icon text-gold" />
              </div>
              <div style={{ flex: 1 }}>
                <h3 className="confirm-title">Exporter l'historique des chèques</h3>
                <p className="confirm-subtitle">
                  {totalCount} chèque{totalCount > 1 ? "s" : ""} sélectionné{totalCount > 1 ? "s" : ""} selon les filtres actifs
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
              {/* Rappel des filtres actifs appliqués */}
              <div className="export-filters-summary-card">
                <div className="summary-card-header">
                  <span className="summary-card-tag">Filtres actifs appliqués</span>
                  <span className="summary-card-stats">
                    {totalCount} chèque{totalCount > 1 ? "s" : ""} · {stats.totalAmountFormatted} DA
                  </span>
                </div>
                <p className="summary-card-text">{getActiveFilterSummary()}</p>
              </div>

              {/* Sélection du format */}
              <div className="export-format-selector-section">
                <label className="export-section-label">Choisissez le format d'exportation :</label>

                <div className="export-formats-grid">
                  {/* 1. Format Excel */}
                  <div
                    className={`export-format-card excel ${selectedExportFormat === "excel" ? "active" : ""}`}
                    onClick={() => setSelectedExportFormat("excel")}
                  >
                    <div className="format-card-radio">
                      <input
                        type="radio"
                        name="exportFormat"
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
                        Tableau formaté avec en-têtes officiels, mise en valeur des chèques annulés et totalisation automatique. Idéal pour la comptabilité et l'analyse.
                      </p>
                    </div>
                  </div>

                  {/* 2. Format PDF */}
                  <div
                    className={`export-format-card pdf ${selectedExportFormat === "pdf" ? "active" : ""}`}
                    onClick={() => setSelectedExportFormat("pdf")}
                  >
                    <div className="format-card-radio">
                      <input
                        type="radio"
                        name="exportFormat"
                        value="pdf"
                        checked={selectedExportFormat === "pdf"}
                        onChange={() => setSelectedExportFormat("pdf")}
                      />
                    </div>
                    <div className="format-card-icon pdf">
                      <FileText size={22} />
                    </div>
                    <div className="format-card-info">
                      <div className="format-card-title-row">
                        <strong className="format-title">Rapport PDF (A4 Paysage)</strong>
                        <span className="format-badge pdf">Prêt à imprimer</span>
                      </div>
                      <p className="format-desc">
                        Document officiel vectoriel prêt à être imprimé ou archivé avec rappel des filtres, indicateurs KPI et pagination soignée.
                      </p>
                    </div>
                  </div>

                  {/* 3. Format CSV */}
                  <div
                    className={`export-format-card csv ${selectedExportFormat === "csv" ? "active" : ""}`}
                    onClick={() => setSelectedExportFormat("csv")}
                  >
                    <div className="format-card-radio">
                      <input
                        type="radio"
                        name="exportFormat"
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
                        Format brut standard compatible avec tous logiciels financiers, ERP et versions régionales de Microsoft Excel (accents & caractères arabes préservés).
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Option de nom de fichier personnalisé */}
              <div className="export-filename-section">
                <label className="export-section-label" htmlFor="export-filename-input">
                  Nom du fichier de sortie (optionnel) :
                </label>
                <div className="export-filename-input-wrapper">
                  <input
                    id="export-filename-input"
                    type="text"
                    className="export-filename-input"
                    value={customExportFilename}
                    onChange={(e) => setCustomExportFilename(e.target.value)}
                    placeholder={getExportFilename(selectedExportFormat)}
                  />
                </div>
                <span className="export-filename-hint">
                  Laissez vide pour utiliser le nom généré automatiquement avec la date et les filtres.
                </span>
              </div>
            </div>

            <div className="print-confirm-actions">
              <button
                type="button"
                className="btn-modal-secondary"
                onClick={() => setShowExportModal(false)}
                disabled={isExporting}
              >
                Annuler
              </button>

              <button
                type="button"
                className="btn-modal-primary"
                onClick={handleExecuteExport}
                disabled={isExporting || totalCount === 0}
              >
                <FileDown size={16} />
                <span>
                  {isExporting
                    ? "Génération de l'export..."
                    : `Télécharger l'export (${selectedExportFormat.toUpperCase()})`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 7. Modal d'annulation de chèque avec motif obligatoire */}
      {chequeToCancel && (
        <div className="cancel-cheque-modal-overlay">
          <div className="cancel-cheque-modal-dialog">
            <div className="modal-header-danger">
              <div className="danger-icon-circle">
                <Ban size={22} />
              </div>
              <div className="danger-header-info">
                <h3>Annuler le chèque</h3>
                <p>Le chèque restera archivé avec son motif et sera automatiquement exclu des totaux financiers.</p>
              </div>
              <button
                type="button"
                className="btn-modal-close"
                onClick={() => setChequeToCancel(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-cheque-summary-box">
              <div className="summary-item">
                <span className="lbl">Bénéficiaire :</span>
                <strong>{chequeToCancel.beneficiary}</strong>
              </div>
              <div className="summary-item">
                <span className="lbl">Montant :</span>
                <strong>{chequeToCancel.amount} DA</strong>
              </div>
              <div className="summary-item">
                <span className="lbl">N° Chèque :</span>
                <strong>{chequeToCancel.chequeNumber || "Non spécifié"}</strong>
              </div>
              <div className="summary-item">
                <span className="lbl">Banque :</span>
                <strong>{chequeToCancel.bankName}</strong>
              </div>
            </div>

            <div className="cancel-reason-selection">
              <label className="reason-label">Sélectionnez le motif d'annulation :</label>
              <div className="reason-chips-grid">
                {[
                  "Erreur sur le montant",
                  "Bourrage / Défaut d'impression",
                  "Détérioration physique",
                  "Changement de bénéficiaire",
                  "Chèque perdu ou égaré",
                  "Annulation de commande",
                  "Autre"
                ].map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    className={`reason-chip ${cancelReasonPreset === reason ? "selected" : ""}`}
                    onClick={() => setCancelReasonPreset(reason)}
                  >
                    {reason}
                  </button>
                ))}
              </div>

              <div className="custom-reason-input-group">
                <label className="reason-label">Précisions ou motif complémentaire (optionnel) :</label>
                <textarea
                  className="cancel-textarea"
                  rows={2}
                  placeholder="Ex: Remplacé par le chèque N°0048292 suite à erreur de centimes..."
                  value={cancelCustomReason}
                  onChange={(e) => setCancelCustomReason(e.target.value)}
                />
              </div>
            </div>

            <div className="modal-actions-footer">
              <button
                type="button"
                className="btn-cancel-abort"
                onClick={() => setChequeToCancel(null)}
              >
                Conserver le chèque (Retour)
              </button>

              <button
                type="button"
                className="btn-confirm-cancel-cheque"
                onClick={handleCancelChequeConfirm}
              >
                <Ban size={15} />
                <span>Confirmer l'annulation</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Toast de confirmation de l'exportation dans le même style que le toast de nouveau chèque */}
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
      {/* Modal des pièces jointes & factures */}
      {attachmentCheque && (
        <ChequeAttachmentModal
          cheque={attachmentCheque}
          isOpen={Boolean(attachmentCheque)}
          onClose={() => setAttachmentCheque(null)}
        />
      )}
    </div>
  );
};
