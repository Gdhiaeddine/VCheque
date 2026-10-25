import React, { useState, useEffect, useCallback, useRef } from "react";
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
  Building2,
  Calendar,
  MapPin,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  RotateCcw
} from "lucide-react";
import type { ChequeRecord, ChequeStatus } from "../types";
import { amountInFrenchWords } from "../moneyToWords";
import {
  getPaginatedCheques,
  deleteChequeRecord,
  clearAllChequeRecords,
  type HistoryStats
} from "../services/db";

interface HistoryPageProps {
  history?: ChequeRecord[];
  onCloneToHome: (record: ChequeRecord) => void;
  onReprintCheque: (record: ChequeRecord) => void;
  onDeleteRecord?: (id: string) => void;
  onClearHistory?: () => void;
  onBackToHome: () => void;
  refreshTrigger?: number;
}

export const HistoryPage: React.FC<HistoryPageProps> = ({
  onCloneToHome,
  onReprintCheque,
  onDeleteRecord,
  onClearHistory,
  onBackToHome,
  refreshTrigger = 0
}) => {
  // Query state
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"all" | ChequeStatus>("all");

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
    savedCount: 0
  });

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

  // Charger les données paginées depuis SQLite / service db
  const fetchRecords = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await getPaginatedCheques({
        page: currentPage,
        pageSize,
        searchQuery: debouncedSearch,
        statusFilter
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
  }, [currentPage, pageSize, debouncedSearch, statusFilter]);

  // Déclencher le chargement
  useEffect(() => {
    fetchRecords();
  }, [fetchRecords, refreshTrigger]);

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
              <h1 className="history-main-title">Historique des chèques</h1>
              <span className="count-pill">{stats.totalCount}</span>
              <span className="db-badge" title="Stockage optimisé SQLite / Indexé B-Tree">
                SQLite 60 FPS
              </span>
            </div>
            <p className="history-main-subtitle">
              Base de données haute performance avec pagination native. Vous pouvez réimprimer vos chèques ou les cloner pour modification vers l'accueil.
            </p>
          </div>

          <div className="header-actions-group">
            <button
              type="button"
              className="btn-refresh-history"
              onClick={() => fetchRecords()}
              title="Actualiser la liste"
            >
              <RotateCcw size={15} />
              <span>Actualiser</span>
            </button>

            {stats.totalCount > 0 && (
              <button
                type="button"
                className="btn-clear-history"
                onClick={handleClearAll}
                title="Vider l'historique"
              >
                <Trash2 size={15} />
                <span>Vider l'historique</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. Cartes statistiques */}
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
            <span className="stat-label">Chèques imprimés</span>
            <strong className="stat-value">{stats.printedCount}</strong>
          </div>
        </div>

        <div className="history-stat-card">
          <div className="stat-icon-wrapper blue">
            <Clock size={18} />
          </div>
          <div className="stat-content">
            <span className="stat-label">Enregistrés (Brouillons)</span>
            <strong className="stat-value">{stats.savedCount}</strong>
          </div>
        </div>

        <div className="history-stat-card">
          <div className="stat-icon-wrapper amber">
            <Building2 size={18} />
          </div>
          <div className="stat-content">
            <span className="stat-label">Montant cumulé</span>
            <strong className="stat-value">{stats.totalAmountFormatted} DA</strong>
          </div>
        </div>
      </div>

      {/* 3. Barre de recherche et filtres de statut */}
      <div className="history-toolbar-card">
        <div className="history-search-box">
          <Search size={16} className="history-search-icon" />
          <input
            type="text"
            className="history-search-input"
            placeholder="Rechercher instantanément par bénéficiaire, banque, montant, date ou lieu..."
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

        <div className="history-filter-pills">
          <button
            type="button"
            className={`filter-pill ${statusFilter === "all" ? "active" : ""}`}
            onClick={() => handleStatusFilterChange("all")}
          >
            Tous ({stats.totalCount})
          </button>
          <button
            type="button"
            className={`filter-pill ${statusFilter === "printed" ? "active" : ""}`}
            onClick={() => handleStatusFilterChange("printed")}
          >
            Imprimés ({stats.printedCount})
          </button>
          <button
            type="button"
            className={`filter-pill ${statusFilter === "saved" ? "active" : ""}`}
            onClick={() => handleStatusFilterChange("saved")}
          >
            Enregistrés ({stats.savedCount})
          </button>
        </div>
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
              ? "Vos chèques imprimés et enregistrés depuis l'accueil apparaîtront ici automatiquement avec persistance SQLite."
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
          <div className="history-list-grid">
            {records.map((item) => {
              const numAmount = Number((item.amount || "0").replace(/\s/g, "").replace(",", ".")) || 0;
              const formattedNum = numAmount.toLocaleString("fr-FR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              });
              const wordsPreview = amountInFrenchWords(item.amount);

              return (
                <div key={item.id} className="history-cheque-card">
                  {/* Ligne haute : Statut, Banque et Horodatage */}
                  <div className="cheque-card-top">
                    <div className="cheque-meta-left">
                      <span className={`cheque-status-tag ${item.status}`}>
                        {item.status === "printed" ? (
                          <>
                            <CheckCircle2 size={13} />
                            <span>Imprimé {item.printCount && item.printCount > 1 ? `(x${item.printCount})` : ""}</span>
                          </>
                        ) : (
                          <>
                            <Clock size={13} />
                            <span>Enregistré</span>
                          </>
                        )}
                      </span>

                      <span className="cheque-bank-badge">
                        <Building2 size={13} />
                        <span>{item.bankName}</span>
                      </span>

                      {item.isCrossed !== false && (
                        <span
                          className="cheque-barre-badge"
                          title={item.crossedWithText !== false ? "Chèque barré — Non endossable" : "Chèque barré simple (sans mention)"}
                        >
                          {item.crossedWithText !== false ? "// Barré (Non endossable)" : "// Barré simple"}
                        </span>
                      )}
                    </div>

                    <span className="cheque-timestamp" title="Horodatage">
                      {item.status === "printed" && item.printedAt
                        ? `Imprimé le ${formatTimestamp(item.printedAt)}`
                        : `Enregistré le ${formatTimestamp(item.createdAt)}`}
                    </span>
                  </div>

                  {/* Corps de la carte : Bénéficiaire et Montant */}
                  <div className="cheque-card-body">
                    <div className="cheque-main-info">
                      <div className="cheque-beneficiary-group">
                        <span className="info-label">À l'ordre de :</span>
                        <strong className="info-beneficiary">
                          {item.beneficiary || "Bénéficiaire non renseigné"}
                        </strong>
                      </div>

                      <div className="cheque-amount-group">
                        <span className="info-label">Montant en chiffres :</span>
                        <strong className="info-amount-numeric"># {formattedNum} DA #</strong>
                      </div>
                    </div>

                    {/* Montant en lettres */}
                    <div className="cheque-words-preview">
                      <span className="info-label">Montant en lettres :</span>
                      <p className="words-text">{wordsPreview}</p>
                    </div>

                    {/* Lieu et Date */}
                    <div className="cheque-location-row">
                      <div className="loc-item">
                        <MapPin size={13} className="loc-icon" />
                        <span>
                          Fait à : <strong>{item.place || "—"}</strong>
                        </span>
                      </div>

                      <div className="loc-item">
                        <Calendar size={13} className="loc-icon" />
                        <span>
                          Le : <strong>{formatDate(item.date)}</strong>
                        </span>
                      </div>

                      {item.chequeNumber && (
                        <div className="loc-item">
                          <FileText size={13} className="loc-icon" />
                          <span>
                            N° : <strong>{item.chequeNumber}</strong>
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Barre d'actions */}
                  <div className="cheque-card-footer">
                    <div className="footer-actions-left">
                      <button
                        type="button"
                        className="btn-history-action clone"
                        onClick={() => onCloneToHome(item)}
                        title="Charger les données de ce chèque dans l'accueil pour le modifier"
                      >
                        <Edit3 size={14} />
                        <span>Modifier (Cloner vers l'accueil)</span>
                      </button>

                      <button
                        type="button"
                        className="btn-history-action reprint"
                        onClick={() => onReprintCheque(item)}
                        title="Ouvrir la disposition et imprimer ce chèque"
                      >
                        <Printer size={14} />
                        <span>Réimprimer</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      className="btn-history-delete"
                      onClick={() => handleDelete(item.id, item.beneficiary)}
                      title="Supprimer de l'historique"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
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
    </div>
  );
};
