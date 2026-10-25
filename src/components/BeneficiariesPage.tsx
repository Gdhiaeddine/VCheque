import React, { useState, useEffect, useCallback } from "react";
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
  Check
} from "lucide-react";
import type { BeneficiaryRecord } from "../types";
import {
  getPaginatedBeneficiaries,
  saveBeneficiaryRecord,
  deleteBeneficiaryRecord,
  clearAllBeneficiaryRecords,
  type BeneficiaryStats
} from "../services/db";

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
  const [formNote, setFormNote] = useState<string>("");
  const [formError, setFormError] = useState<string>("");

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

    const now = new Date().toISOString();
    const record: BeneficiaryRecord = {
      id: editingRecord ? editingRecord.id : "ben-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7),
      name: trimmedName,
      nickname: formNickname.trim() || undefined,
      phone: formPhone.trim() || undefined,
      note: formNote.trim() || undefined,
      usageCount: editingRecord ? editingRecord.usageCount : 1,
      lastUsedAt: editingRecord?.lastUsedAt || now,
      createdAt: editingRecord?.createdAt || now,
      updatedAt: now
    };

    await saveBeneficiaryRecord(record);
    setIsModalOpen(false);
    await fetchRecords();
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
    if (window.confirm("Êtes-vous sûr de vouloir vider l'ensemble du répertoire des bénéficiaires ?")) {
      await clearAllBeneficiaryRecords();
      setCurrentPage(1);
      await fetchRecords();
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

  // Calculate pagination range
  const startItemIndex = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItemIndex = Math.min(currentPage * pageSize, totalCount);

  const pageNumbers: number[] = [];
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
              <h1 className="history-main-title">Répertoire des bénéficiaires</h1>
              <span className="count-pill">{stats.totalCount}</span>
              <span className="db-badge" title="Stockage local SQLite">
                SQLite
              </span>
            </div>
            <p className="history-main-subtitle">
              Répertoire centralisé des bénéficiaires — ajout automatique à la saisie et autocomplétion.
            </p>
          </div>

          <div className="header-actions-group">
            <button
              type="button"
              className="btn-primary-action"
              onClick={handleOpenNewModal}
            >
              <Plus size={16} />
              <span>Nouveau bénéficiaire</span>
            </button>

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
                title="Vider le répertoire"
              >
                <Trash2 size={15} />
                <span>Vider la liste</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. Cartes statistiques */}
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

      {/* 3. Barre de recherche */}
      <div className="history-toolbar-card">
        <div className="history-search-box">
          <Search size={16} className="history-search-icon" />
          <input
            type="text"
            className="history-search-input"
            placeholder="Rechercher instantanément par nom, raison sociale, alias, téléphone ou note..."
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
          <div className="history-table-card beneficiaries-table-card">
            <table className="history-table">
              <thead>
                <tr>
                  <th>Bénéficiaire</th>
                  <th>Téléphone</th>
                  <th>Notes</th>
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
                    <div className="ht-benef-cell">
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
                    <span className="ht-usage-pill">
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
                      <button
                        type="button"
                        className="ht-act create"
                        onClick={() => onCreateChequeForBeneficiary(item.name)}
                        title={`Créer un chèque pour ${item.name}`}
                      >
                        <FileText size={14} />
                      </button>

                      <button
                        type="button"
                        className="ht-act"
                        onClick={() => handleOpenEditModal(item)}
                        title="Modifier les coordonnées"
                      >
                        <Edit2 size={14} />
                      </button>

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

          {/* 5. Pagination */}
          <div className="history-pagination-bar">
            <div className="pagination-info">
              <span>
                Affichage de <strong>{startItemIndex}</strong> à <strong>{endItemIndex}</strong> sur{" "}
                <strong>{totalCount}</strong> bénéficiaire{totalCount > 1 ? "s" : ""}
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

      {/* Modal Ajout / Modification Bénéficiaire */}
      {isModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content modal-beneficiary-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-group">
                <Users size={18} className="modal-title-icon" />
                <h3 className="modal-title">
                  {editingRecord ? "Modifier le bénéficiaire" : "Nouveau bénéficiaire"}
                </h3>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveModal} className="modal-form-body">
              {formError && (
                <div className="modal-form-alert error">
                  {formError}
                </div>
              )}

              <div className="form-group">
                <label className="form-label">
                  Nom ou Raison Sociale <span className="required-star">*</span>
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
                <label className="form-label">Nom commercial ou Alias (Optionnel)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ex: Fournisseur Papier"
                  value={formNickname}
                  onChange={(e) => setFormNickname(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Numéro de téléphone (Optionnel)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ex: 0550 12 34 56"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Notes ou coordonnées bancaires (Optionnel)</label>
                <textarea
                  className="form-input form-textarea"
                  rows={2}
                  placeholder="Ex: Compte BNA Alger Centre"
                  value={formNote}
                  onChange={(e) => setFormNote(e.target.value)}
                />
              </div>

              <div className="modal-actions-footer">
                <button
                  type="button"
                  className="btn-modal-secondary"
                  onClick={() => setIsModalOpen(false)}
                >
                  Annuler
                </button>
                <button type="submit" className="btn-modal-primary">
                  <Check size={16} />
                  <span>{editingRecord ? "Mettre à jour" : "Enregistrer"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
