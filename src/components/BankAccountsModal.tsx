import React, { useState, useEffect } from "react";
import {
  CreditCard,
  Building,
  Building2,
  Plus,
  Check,
  CheckCircle2,
  Edit2,
  Trash2,
  X,
  BookOpen,
  Hash,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  MapPin,
  Coins
} from "lucide-react";
import type { BankAccountRecord, ChequeBookRecord, BankTemplate } from "../types";
import {
  getBankAccounts,
  saveBankAccount,
  deleteBankAccount,
  getChequeBooks,
  saveChequeBook,
  getActiveCompanyId,
  getAccountChequesSummary,
  type AccountChequesSummary
} from "../services/db";

interface BankAccountsModalProps {
  isOpen: boolean;
  onClose: () => void;
  templates: BankTemplate[];
  currentAccountId?: string | null;
  currentChequeBookId?: string | null;
  onAccountSelected?: (account: BankAccountRecord, nextChequeNum?: string, selectedBook?: ChequeBookRecord) => void;
}

export const BankAccountsModal: React.FC<BankAccountsModalProps> = ({
  isOpen,
  onClose,
  templates,
  currentAccountId,
  currentChequeBookId,
  onAccountSelected
}) => {
  const [accounts, setAccounts] = useState<BankAccountRecord[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [chequeBooks, setChequeBooks] = useState<ChequeBookRecord[]>([]);
  const [accountSummary, setAccountSummary] = useState<AccountChequesSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Edit / Add account state
  const [isEditingAccount, setIsEditingAccount] = useState<boolean>(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [formBankTemplateId, setFormBankTemplateId] = useState<string>(templates[0]?.id || "el-salam");
  const [formLabel, setFormLabel] = useState<string>("");
  const [formRib, setFormRib] = useState<string>("");
  const [formAgency, setFormAgency] = useState<string>("");
  const [formBalance, setFormBalance] = useState<string>("0");
  const [formIsDefault, setFormIsDefault] = useState<boolean>(false);
  const [formAccountError, setFormAccountError] = useState<string>("");

  // Edit / Add chequebook state
  const [isAddingBook, setIsAddingBook] = useState<boolean>(false);
  const [bookSeriesName, setBookSeriesName] = useState<string>("");
  const [bookStartNumber, setBookStartNumber] = useState<string>("");
  const [bookEndNumber, setBookEndNumber] = useState<string>("");
  const [bookError, setBookError] = useState<string>("");

  const activeCompanyId = getActiveCompanyId();

  const loadAccounts = async () => {
    setLoading(true);
    try {
      const list = await getBankAccounts(activeCompanyId);
      setAccounts(list);
      if (list.length > 0) {
        if (currentAccountId && list.some((a) => a.id === currentAccountId)) {
          setSelectedAccountId(currentAccountId);
        } else if (!selectedAccountId || !list.some((a) => a.id === selectedAccountId)) {
          setSelectedAccountId(list[0].id);
        }
      }
    } catch (err) {
      console.error("Erreur chargement comptes bancaires:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadChequeBooksForAccount = async (accId: string) => {
    try {
      const books = await getChequeBooks(accId);
      setChequeBooks(books);
    } catch (err) {
      console.error("Erreur chargement chéquiers:", err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadAccounts();
      if (currentAccountId) {
        setSelectedAccountId(currentAccountId);
      }
      setIsEditingAccount(false);
      setIsAddingBook(false);
    }
  }, [isOpen, activeCompanyId, currentAccountId]);

  useEffect(() => {
    if (selectedAccountId) {
      loadChequeBooksForAccount(selectedAccountId);
      getAccountChequesSummary(selectedAccountId)
        .then(setAccountSummary)
        .catch(() => setAccountSummary(null));
    } else {
      setChequeBooks([]);
      setAccountSummary(null);
    }
  }, [selectedAccountId]);

  if (!isOpen) return null;

  const handleStartCreateAccount = () => {
    setEditingAccountId(null);
    setFormBankTemplateId(templates[0]?.id || "el-salam");
    setFormLabel("");
    setFormRib("");
    setFormAgency("");
    setFormBalance("0");
    setFormIsDefault(accounts.length === 0);
    setFormAccountError("");
    setIsEditingAccount(true);
  };

  const handleStartEditAccount = (acc: BankAccountRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingAccountId(acc.id);
    setFormBankTemplateId(acc.bankTemplateId);
    setFormLabel(acc.label);
    setFormRib(acc.ribOrIban);
    setFormAgency(acc.agency || "");
    setFormBalance(String(acc.balance || 0));
    setFormIsDefault(acc.isDefault);
    setFormAccountError("");
    setIsEditingAccount(true);
  };

  const handleDeleteAccount = async (id: string, label: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Supprimer le compte bancaire "${label}" ?`)) {
      await deleteBankAccount(id);
      if (selectedAccountId === id) setSelectedAccountId(null);
      await loadAccounts();
    }
  };

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formLabel.trim()) {
      setFormAccountError("Veuillez saisir un libellé de compte.");
      return;
    }
    if (!formRib.trim()) {
      setFormAccountError("Veuillez renseigner le RIB ou numéro de compte.");
      return;
    }

    const id = editingAccountId || `acc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    const balanceNum = parseFloat(formBalance.replace(/\s/g, "").replace(",", ".")) || 0;

    const accRecord: BankAccountRecord = {
      id,
      companyId: activeCompanyId,
      bankTemplateId: formBankTemplateId,
      label: formLabel.trim(),
      ribOrIban: formRib.trim(),
      agency: formAgency.trim() || undefined,
      balance: balanceNum,
      currency: "DZD",
      isDefault: formIsDefault,
      createdAt: now,
      updatedAt: now
    };

    await saveBankAccount(accRecord);
    setIsEditingAccount(false);
    await loadAccounts();
    setSelectedAccountId(id);
  };

  // Gestion des chéquiers
  const handleStartCreateBook = () => {
    setBookSeriesName(`Chéquier ${new Date().getFullYear()}`);
    setBookStartNumber("0048201");
    setBookEndNumber("0048250");
    setBookError("");
    setIsAddingBook(true);
  };

  const handleSaveBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccountId) return;
    const startNum = parseInt(bookStartNumber, 10);
    const endNum = parseInt(bookEndNumber, 10);

    if (isNaN(startNum) || isNaN(endNum) || endNum <= startNum) {
      setBookError("Le numéro de fin doit être supérieur au numéro de début.");
      return;
    }

    const totalLeaves = endNum - startNum + 1;
    const bookRecord: ChequeBookRecord = {
      id: `book-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      accountId: selectedAccountId,
      seriesName: bookSeriesName.trim() || `Chéquier ${bookStartNumber}`,
      startNumber: bookStartNumber.trim(),
      endNumber: bookEndNumber.trim(),
      currentNumber: bookStartNumber.trim(),
      leavesTotal: totalLeaves,
      leavesUsed: 0,
      isActive: true,
      createdAt: new Date().toISOString()
    };

    await saveChequeBook(bookRecord);
    setIsAddingBook(false);
    await loadChequeBooksForAccount(selectedAccountId);
  };

  const handleSelectAccountForCheque = (acc: BankAccountRecord, targetBook?: ChequeBookRecord) => {
    if (onAccountSelected) {
      const activeBook = targetBook || chequeBooks.find((b) => b.isActive && b.accountId === acc.id);
      onAccountSelected(acc, activeBook?.currentNumber, activeBook);
    }
    onClose();
  };

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);

  return (
    <div className="account-modal-overlay" role="dialog" aria-modal="true">
      <div className="account-modal-content">
        <div className="account-modal-header">
          <div className="account-modal-title-row">
            <div className="account-modal-icon-badge">
              <CreditCard size={20} />
            </div>
            <div>
              <h2 className="account-modal-title">Comptes bancaires & Chéquiers</h2>
              <p className="account-modal-subtitle">
                Configurez vos RIB émetteurs, agences et carnets de chèques avec numérotation automatique.
              </p>
            </div>
          </div>
          <button type="button" className="account-modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="account-modal-layout">
          {/* Colonne gauche : Liste des comptes bancaires */}
          <div className="account-left-column">
            <div className="account-column-header">
              <span className="account-column-title">Comptes ({accounts.length})</span>
              <button
                type="button"
                className="btn-add-account-mini"
                onClick={handleStartCreateAccount}
                title="Ajouter un compte bancaire"
              >
                <Plus size={14} />
                <span>Nouveau compte</span>
              </button>
            </div>

            <div className="account-list-scroll">
              {accounts.length === 0 ? (
                <div className="account-empty-box">
                  <p>Aucun compte bancaire enregistré pour cette entreprise.</p>
                  <button
                    type="button"
                    className="btn-modal-primary"
                    onClick={handleStartCreateAccount}
                  >
                    <Plus size={14} />
                    <span>Créer le premier compte</span>
                  </button>
                </div>
              ) : (
                accounts.map((acc) => {
                  const isSelected = acc.id === selectedAccountId;
                  const tpl = templates.find((t) => t.id === acc.bankTemplateId);
                  return (
                    <div
                      key={acc.id}
                      className={`account-card-item ${isSelected ? "selected" : ""}`}
                      onClick={() => {
                        setSelectedAccountId(acc.id);
                        setIsEditingAccount(false);
                      }}
                    >
                      <div className="account-card-top-row">
                        <strong className="account-label">{acc.label}</strong>
                        <div className="account-tags-wrap">
                          {acc.id === currentAccountId && (
                            <span className="account-current-cheque-pill" title="Compte actuellement utilisé pour le chèque en cours">
                              Actif sur chèque
                            </span>
                          )}
                          {acc.isDefault && <span className="account-default-tag">Par défaut</span>}
                        </div>
                      </div>

                      <div className="account-card-bank-info">
                        <span className="account-bank-name">{tpl ? tpl.name : acc.bankTemplateId}</span>
                        {acc.agency && <span className="account-agency">({acc.agency})</span>}
                      </div>

                      <div className="account-card-rib-font">{acc.ribOrIban}</div>

                      <div className="account-card-bottom-row">
                        <span className="account-balance-label">
                          Solde :{" "}
                          <strong>
                            {acc.balance.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} DA
                          </strong>
                        </span>

                        <div className="account-actions-mini">
                          <button
                            type="button"
                            className="btn-acc-mini edit"
                            onClick={(e) => handleStartEditAccount(acc, e)}
                            title="Modifier"
                          >
                            <Edit2 size={12} />
                          </button>
                          <button
                            type="button"
                            className="btn-acc-mini delete"
                            onClick={(e) => handleDeleteAccount(acc.id, acc.label, e)}
                            title="Supprimer"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Colonne droite : Formulaire ou Détails & Chéquiers */}
          <div className="account-right-column">
            {isEditingAccount ? (
              <form onSubmit={handleSaveAccount} className="account-edit-form">
                <div className="account-form-header">
                  <div className="account-form-icon-circle">
                    <CreditCard size={20} />
                  </div>
                  <div>
                    <h3 className="right-panel-heading">
                      {editingAccountId ? "Modifier le compte bancaire" : "Nouveau compte bancaire"}
                    </h3>
                    <p className="right-panel-subheading">
                      Renseignez les coordonnées bancaires et le gabarit de chèque associé
                    </p>
                  </div>
                </div>

                {formAccountError && (
                  <div className="account-form-error">
                    <AlertTriangle size={15} />
                    <span>{formAccountError}</span>
                  </div>
                )}

                <div className="form-group-box">
                  <label className="field-lbl">
                    <Building2 size={14} className="field-icon-gold" />
                    <span>Banque / Modèle de chèque</span>
                    <span className="req">*</span>
                  </label>
                  <div className="input-with-icon-wrap">
                    <select
                      className="field-input field-select"
                      value={formBankTemplateId}
                      onChange={(e) => setFormBankTemplateId(e.target.value)}
                    >
                      {templates.map((tpl) => (
                        <option key={tpl.id} value={tpl.id}>
                          {tpl.name} ({tpl.shortName || tpl.id.toUpperCase()})
                        </option>
                      ))}
                    </select>
                  </div>
                  <span className="field-hint">Le gabarit d'impression sera synchronisé lors de l'émission de chèques</span>
                </div>

                <div className="form-group-box">
                  <label className="field-lbl">
                    <CreditCard size={14} className="field-icon-gold" />
                    <span>Libellé du compte</span>
                    <span className="req">*</span>
                  </label>
                  <input
                    type="text"
                    className="field-input"
                    value={formLabel}
                    onChange={(e) => setFormLabel(e.target.value)}
                    placeholder="Ex: Compte Courant BNA 001 (Exploitation)"
                    required
                  />
                  <span className="field-hint">Nom distinctif pour identifier rapidement ce compte dans l'application</span>
                </div>

                <div className="form-group-box">
                  <label className="field-lbl">
                    <Hash size={14} className="field-icon-gold" />
                    <span>Numéro de Compte / RIB (20 chiffres)</span>
                    <span className="req">*</span>
                  </label>
                  <div className="rib-input-wrapper">
                    <input
                      type="text"
                      className="field-input font-mono rib-input"
                      value={formRib}
                      onChange={(e) => setFormRib(e.target.value)}
                      placeholder="001 00123 4567890123 45"
                      required
                      maxLength={30}
                    />
                    <span className="rib-digit-badge">{formRib.replace(/\s/g, "").length}/20</span>
                  </div>
                  <span className="field-hint">Format bancaire algérien standard (Code Banque + Code Agence + N° Compte + Clé)</span>
                </div>

                <div className="form-row-2">
                  <div className="form-group-box flex-1">
                    <label className="field-lbl">
                      <MapPin size={14} className="field-icon-gold" />
                      <span>Agence bancaire</span>
                      <span className="optional">(Optionnel)</span>
                    </label>
                    <input
                      type="text"
                      className="field-input"
                      value={formAgency}
                      onChange={(e) => setFormAgency(e.target.value)}
                      placeholder="Ex: Didouche Mourad (123)"
                    />
                  </div>

                  <div className="form-group-box flex-1">
                    <label className="field-lbl">
                      <Coins size={14} className="field-icon-gold" />
                      <span>Solde comptable</span>
                    </label>
                    <div className="amount-input-wrap">
                      <input
                        type="text"
                        className="field-input font-mono amount-input"
                        value={formBalance}
                        onChange={(e) => setFormBalance(e.target.value)}
                        placeholder="0.00"
                      />
                      <span className="currency-suffix">DA</span>
                    </div>
                  </div>
                </div>

                <div className="form-checkbox-card">
                  <label className="custom-checkbox-container">
                    <input
                      type="checkbox"
                      checked={formIsDefault}
                      onChange={(e) => setFormIsDefault(e.target.checked)}
                    />
                    <div className="checkbox-text-block">
                      <span className="checkbox-title">Définir comme compte principal par défaut</span>
                      <span className="checkbox-desc">Ce compte sera sélectionné automatiquement à chaque nouvelle saisie de chèque</span>
                    </div>
                  </label>
                </div>

                <div className="account-form-btns">
                  <button
                    type="button"
                    className="btn-acc-cancel"
                    onClick={() => setIsEditingAccount(false)}
                  >
                    Annuler
                  </button>
                  <button type="submit" className="btn-acc-submit">
                    <Check size={16} />
                    <span>{editingAccountId ? "Mettre à jour le compte" : "Créer le compte bancaire"}</span>
                  </button>
                </div>
              </form>
            ) : selectedAccount ? (
              <div className="account-details-view">
                <div className="account-details-header">
                  <div>
                    <h3 className="account-big-title">{selectedAccount.label}</h3>
                    <p className="account-meta-line">
                      RIB: <strong>{selectedAccount.ribOrIban}</strong>
                      {selectedAccount.agency && ` · Agence ${selectedAccount.agency}`}
                    </p>
                  </div>
                  {onAccountSelected && (
                    <button
                      type="button"
                      className={`btn-select-account-main ${selectedAccount.id === currentAccountId ? "active" : ""}`}
                      onClick={() => handleSelectAccountForCheque(selectedAccount)}
                      title={
                        selectedAccount.id === currentAccountId
                          ? "Ce compte est actuellement sélectionné pour le chèque en cours"
                          : "Utiliser ce compte bancaire pour le chèque en cours"
                      }
                    >
                      {selectedAccount.id === currentAccountId ? (
                        <>
                          <CheckCircle2 size={15} />
                          <span>Compte sélectionné pour ce chèque</span>
                        </>
                      ) : (
                        <>
                          <Sparkles size={14} />
                          <span>Utiliser pour ce chèque</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* Cartes de synthèse du compte */}
                <div className="account-summary-cards">
                  <div className="acc-stat-box">
                    <span className="acc-stat-label">Solde comptable</span>
                    <strong className="acc-stat-value gold">
                      {selectedAccount.balance.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} DA
                    </strong>
                  </div>
                  <div className="acc-stat-box">
                    <span className="acc-stat-label">Chèques émis</span>
                    <strong className="acc-stat-value">
                      {accountSummary ? accountSummary.chequesCount : 0}
                    </strong>
                  </div>
                  <div className="acc-stat-box">
                    <span className="acc-stat-label">Total décaissé</span>
                    <strong className="acc-stat-value">
                      {accountSummary
                        ? accountSummary.totalAmount.toLocaleString("fr-FR", { minimumFractionDigits: 2 })
                        : "0,00"}{" "}
                      DA
                    </strong>
                  </div>
                </div>

                {/* Section Chéquiers rattachés */}
                <div className="chequebooks-section">
                  <div className="chequebooks-header-row">
                    <div className="chequebooks-title-group">
                      <BookOpen size={16} className="text-gold" />
                      <h4 className="chequebooks-heading">Chéquiers (Souches)</h4>
                    </div>

                    {!isAddingBook && (
                      <button
                        type="button"
                        className="btn-add-book"
                        onClick={handleStartCreateBook}
                      >
                        <Plus size={13} />
                        <span>Nouveau chéquier</span>
                      </button>
                    )}
                  </div>

                  {isAddingBook ? (
                    <form onSubmit={handleSaveBook} className="add-book-form">
                      <div className="add-book-title-row">
                        <div className="add-book-title-left">
                          <BookOpen size={16} className="field-icon-gold" />
                          <strong className="add-book-title-text">Enregistrer un nouveau chéquier</strong>
                        </div>
                        <button
                          type="button"
                          className="btn-close-mini"
                          onClick={() => setIsAddingBook(false)}
                          title="Fermer"
                        >
                          <X size={15} />
                        </button>
                      </div>

                      {bookError && (
                        <div className="book-error">
                          <AlertTriangle size={14} />
                          <span>{bookError}</span>
                        </div>
                      )}

                      <div className="book-inputs-grid">
                        <div className="form-group-box">
                          <label className="field-lbl">
                            <span>Série / Libellé</span>
                            <span className="req">*</span>
                          </label>
                          <input
                            type="text"
                            className="field-input"
                            value={bookSeriesName}
                            onChange={(e) => setBookSeriesName(e.target.value)}
                            placeholder="Ex: Série 2026-A"
                            required
                          />
                        </div>

                        <div className="form-group-box">
                          <label className="field-lbl">
                            <span>Premier N°</span>
                            <span className="req">*</span>
                          </label>
                          <input
                            type="text"
                            className="field-input font-mono"
                            value={bookStartNumber}
                            onChange={(e) => setBookStartNumber(e.target.value)}
                            placeholder="Ex: 0048201"
                            required
                          />
                        </div>

                        <div className="form-group-box">
                          <label className="field-lbl">
                            <span>Dernier N°</span>
                            <span className="req">*</span>
                          </label>
                          <input
                            type="text"
                            className="field-input font-mono"
                            value={bookEndNumber}
                            onChange={(e) => setBookEndNumber(e.target.value)}
                            placeholder="Ex: 0048250"
                            required
                          />
                        </div>
                      </div>

                      <div className="book-form-actions">
                        <button
                          type="button"
                          className="btn-acc-cancel btn-sm"
                          onClick={() => setIsAddingBook(false)}
                        >
                          Annuler
                        </button>
                        <button type="submit" className="btn-acc-submit btn-sm">
                          <Check size={14} />
                          <span>Activer ce chéquier</span>
                        </button>
                      </div>
                    </form>
                  ) : chequeBooks.length === 0 ? (
                    <div className="no-books-box">
                      <p>Aucun chéquier enregistré pour ce compte.</p>
                      <button
                        type="button"
                        className="btn-modal-secondary btn-sm"
                        onClick={handleStartCreateBook}
                      >
                        <Plus size={13} />
                        <span>Ajouter un carnet de chèques</span>
                      </button>
                    </div>
                  ) : (
                    <div className="books-list-grid">
                      {chequeBooks.map((book) => {
                        const remaining = book.leavesTotal - book.leavesUsed;
                        const isLow = remaining <= 5;
                        return (
                          <div
                            key={book.id}
                            className={`book-card ${book.isActive ? "active-book" : ""}`}
                          >
                            <div className="book-top-row">
                              <strong className="book-name">{book.seriesName}</strong>
                              {book.isActive ? (
                                <span className="book-active-tag">En service</span>
                              ) : (
                                <span className="book-inactive-tag">Terminé</span>
                              )}
                            </div>

                            <div className="book-numbers-line font-mono">
                              N° {book.startNumber} → N° {book.endNumber}
                            </div>

                            <div className="book-progress-wrapper">
                              <div className="book-progress-bar">
                                <div
                                  className={`progress-fill ${isLow ? "low" : ""}`}
                                  style={{
                                    width: `${Math.min(100, (book.leavesUsed / book.leavesTotal) * 100)}%`
                                  }}
                                />
                              </div>
                              <div className="book-remaining-info">
                                <span>
                                  Prochain chèque : <strong>{book.currentNumber}</strong>
                                </span>
                                <span className={isLow ? "text-warning" : ""}>
                                  {remaining} restant{remaining > 1 ? "s" : ""}
                                </span>
                              </div>
                            </div>

                            <div className="book-action-row">
                              {currentChequeBookId === book.id && selectedAccount.id === currentAccountId ? (
                                <span className="book-selected-badge" title="Ce chéquier est actuellement utilisé pour le chèque en cours">
                                  <CheckCircle2 size={12} />
                                  <span>Chéquier actif sur ce chèque</span>
                                </span>
                              ) : book.isActive ? (
                                <button
                                  type="button"
                                  className="btn-use-book"
                                  onClick={() => handleSelectAccountForCheque(selectedAccount, book)}
                                  title={`Utiliser ce chéquier pour le chèque (Prochain N° : ${book.currentNumber})`}
                                >
                                  <Sparkles size={12} />
                                  <span>Utiliser ce chéquier (N° {book.currentNumber})</span>
                                </button>
                              ) : (
                                <span className="book-exhausted-badge">Carnet épuisé</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="no-account-selected">
                <p>Sélectionnez un compte bancaire dans la colonne de gauche ou créez-en un nouveau.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
