import React, { useState, useRef } from "react";
import {
  X,
  UploadCloud,
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Printer,
  Save,
  Download,
  Building2,
  BookOpen,
  Check,
  ChevronRight
} from "lucide-react";
import * as XLSX from "xlsx";
import type {
  BatchItem,
  BatchColumnMapping,
  BankAccountRecord,
  ChequeBookRecord,
  ChequeRecord,
  BankTemplate
} from "../types";
import {
  parseImportFile,
  autoDetectColumnMapping,
  validateBatchItems,
  calculateBatchStats,
  type ParsedFileResult
} from "../services/batchImport";

interface BatchImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingCheques: ChequeRecord[];
  companyAccounts: BankAccountRecord[];
  chequeBooks: ChequeBookRecord[];
  activeAccountId?: string;
  activeCompanyId: string;
  templates: BankTemplate[];
  currentTemplate: BankTemplate;
  onSaveBatch: (
    items: BatchItem[],
    targetAccountId?: string,
    targetChequeBookId?: string,
    autoIncrementChequeNumber?: boolean,
    autoRecordBeneficiaries?: boolean
  ) => Promise<void>;
  onStartSequentialPrint: (
    items: BatchItem[],
    targetAccountId?: string,
    targetChequeBookId?: string,
    autoIncrementChequeNumber?: boolean,
    autoRecordBeneficiaries?: boolean
  ) => void;
  onOpenBankAccounts?: () => void;
}

export const BatchImportModal: React.FC<BatchImportModalProps> = ({
  isOpen,
  onClose,
  existingCheques,
  companyAccounts,
  chequeBooks,
  activeAccountId,
  templates,
  currentTemplate,
  onSaveBatch,
  onStartSequentialPrint,
  onOpenBankAccounts
}) => {
  // Navigation entre les étapes (1: Fichier, 2: Mapping, 3: Grille de validation)
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // État du fichier
  const [fileData, setFileData] = useState<ParsedFileResult | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // État du mapping
  const [mapping, setMapping] = useState<BatchColumnMapping>({
    beneficiary: "",
    amount: "",
    date: "",
    place: "",
    chequeNumber: "",
    reference: "",
    bankTemplateId: ""
  });

  // État des lignes validées
  const [items, setItems] = useState<BatchItem[]>([]);
  const [filterStatus, setFilterStatus] = useState<"all" | "valid" | "duplicate" | "error">("all");
  const [isProcessing, setIsProcessing] = useState(false);

  // Configuration bancaire pour le lot
  const [selectedAccountId, setSelectedAccountId] = useState<string>(activeAccountId || companyAccounts[0]?.id || "");
  const [autoIncrementNumber, setAutoIncrementNumber] = useState<boolean>(true);
  const [autoRecordBeneficiaries, setAutoRecordBeneficiaries] = useState<boolean>(true);

  if (!isOpen) return null;

  // Compte bancaire sélectionné & son chéquier actif
  const currentAccount = companyAccounts.find((a) => a.id === selectedAccountId) || companyAccounts[0];
  const activeChequeBook = chequeBooks.find(
    (b) => b.accountId === currentAccount?.id && b.isActive
  );

  const leavesRemaining = activeChequeBook
    ? Math.max(0, activeChequeBook.leavesTotal - activeChequeBook.leavesUsed)
    : 0;

  // Statistiques du lot
  const stats = calculateBatchStats(items);
  const selectedCount = items.filter((i) => i.selected).length;
  const selectedValidCount = items.filter((i) => i.selected && i.status !== "error").length;

  // Gestion du chargement de fichier
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoadingFile(true);
    setFileError(null);

    try {
      const parsed = await parseImportFile(file);
      setFileData(parsed);

      // Détecter automatiquement le mapping
      const detected = autoDetectColumnMapping(parsed.headers);
      setMapping(detected);

      // Passer automatiquement à l'étape 2 (Mapping)
      setCurrentStep(2);
    } catch (err: any) {
      console.error("Erreur lecture fichier:", err);
      setFileError(err?.message || "Impossible de lire le fichier sélectionné.");
    } finally {
      setIsLoadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Télécharger un modèle Excel exemple
  const handleDownloadSampleExcel = () => {
    const sampleRows = [
      {
        "Bénéficiaire": "SARL EL BAHIA TRADING",
        "Montant": "245000.50",
        "Date": new Date().toISOString().split("T")[0],
        "Lieu": "Alger",
        "Numéro Chèque": "0048201",
        "Référence": "FAC-2026-089"
      },
      {
        "Bénéficiaire": "EURL ATLAS EQUIPEMENT",
        "Montant": "1280000.00",
        "Date": new Date().toISOString().split("T")[0],
        "Lieu": "Oran",
        "Numéro Chèque": "0048202",
        "Référence": "BC-7814"
      },
      {
        "Bénéficiaire": "SPA MEDITERRANEE LOGISTIQUE",
        "Montant": "67500.00",
        "Date": new Date().toISOString().split("T")[0],
        "Lieu": "Alger",
        "Numéro Chèque": "0048203",
        "Référence": "REGLEMENT MENSUEL"
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Paiements");
    XLSX.writeFile(workbook, "modele_import_cheques.xlsx");
  };

  // Passer à l'étape 3 (Validation et Grille de contrôle)
  const handleValidateMapping = () => {
    if (!fileData) return;
    if (!mapping.beneficiary || !mapping.amount) {
      alert("Veuillez mapper au minimum les colonnes Bénéficiaire et Montant.");
      return;
    }

    const defaultPlace = currentAccount?.agency || "Alger";
    const validatedItems = validateBatchItems(
      fileData.rawRows,
      mapping,
      existingCheques,
      defaultPlace
    );

    setItems(validatedItems);
    setCurrentStep(3);
  };

  // Gestion des sélections de lignes
  const handleToggleSelectAll = (checked: boolean) => {
    setItems((prev) => prev.map((item) => ({ ...item, selected: checked })));
  };

  const handleSelectOnlyValid = () => {
    setItems((prev) =>
      prev.map((item) => ({
        ...item,
        selected: item.status === "valid"
      }))
    );
  };

  const handleToggleRow = (id: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, selected: !item.selected } : item))
    );
  };

  const handleDeleteRow = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  // Action : Enregistrer en lot
  const handleExecuteSaveBatch = async () => {
    if (selectedValidCount === 0) {
      alert("Aucun chèque valide n'est sélectionné pour l'enregistrement.");
      return;
    }

    setIsProcessing(true);
    try {
      const selectedItems = items.filter((i) => i.selected && i.status !== "error");
      await onSaveBatch(
        selectedItems,
        selectedAccountId,
        activeChequeBook?.id,
        autoIncrementNumber,
        autoRecordBeneficiaries
      );
      onClose();
    } catch (err) {
      console.error("Erreur enregistrement lot:", err);
      alert("Une erreur est survenue lors de l'enregistrement du lot.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Action : Lancer l'impression successive
  const handleExecuteSequentialPrint = () => {
    if (selectedValidCount === 0) {
      alert("Aucun chèque valide n'est sélectionné pour l'impression.");
      return;
    }

    const selectedItems = items.filter((i) => i.selected && i.status !== "error");
    onStartSequentialPrint(
      selectedItems,
      selectedAccountId,
      activeChequeBook?.id,
      autoIncrementNumber,
      autoRecordBeneficiaries
    );
    onClose();
  };

  // Filtrage des lignes pour affichage
  const displayedItems = items.filter((item) => {
    if (filterStatus === "valid") return item.status === "valid";
    if (filterStatus === "duplicate") return item.status === "duplicate";
    if (filterStatus === "error") return item.status === "error";
    return true;
  });

  return (
    <div className="statement-modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className="statement-modal-content batch-modal-window"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "1020px", maxWidth: "96vw", maxHeight: "90vh" }}
      >
        {/* En-tête standard du modal (conforme aux autres composants de l'application) */}
        <div className="statement-modal-header">
          <div className="statement-header-left">
            <div className="statement-icon-badge">
              <FileSpreadsheet size={20} />
            </div>
            <div>
              <div className="statement-title-row">
                <h2 className="statement-title">Importation & Traitement en lot</h2>
              </div>
              <p className="statement-subtitle">
                Importez vos bordereaux Excel ou CSV, contrôlez les doublons et traitez vos chèques en série.
              </p>
            </div>
          </div>

          <button
            type="button"
            className="statement-close-btn"
            onClick={onClose}
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Barre de navigation des étapes (Stepper élégant et sobre) */}
        <div className="batch-stepper-bar">
          <div
            className={`batch-step-tab ${currentStep === 1 ? "active" : currentStep > 1 ? "completed" : ""}`}
            onClick={() => fileData && setCurrentStep(1)}
          >
            <span className="step-circle">{currentStep > 1 ? <Check size={12} /> : "1"}</span>
            <span className="step-name">1. Fichier source</span>
          </div>

          <ChevronRight size={14} className="step-chevron" />

          <div
            className={`batch-step-tab ${currentStep === 2 ? "active" : currentStep > 2 ? "completed" : ""}`}
            onClick={() => fileData && setCurrentStep(2)}
          >
            <span className="step-circle">{currentStep > 2 ? <Check size={12} /> : "2"}</span>
            <span className="step-name">2. Correspondance des colonnes</span>
          </div>

          <ChevronRight size={14} className="step-chevron" />

          <div className={`batch-step-tab ${currentStep === 3 ? "active" : ""}`}>
            <span className="step-circle">3</span>
            <span className="step-name">3. Contrôle & Traitement</span>
          </div>
        </div>

        {/* Corps principal selon l'étape */}
        <div className="statement-modal-body batch-modal-body">
          {/* =========================================================================
              ÉTAPE 1 : SÉLECTION DU FICHIER (Excel / CSV)
              ========================================================================= */}
          {currentStep === 1 && (
            <div className="batch-step-pane">
              <div
                className="batch-dropzone-box"
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".xlsx, .xls, .csv, .tsv, .txt"
                  style={{ display: "none" }}
                  onChange={handleFileChange}
                />
                <div className="dropzone-icon-circle">
                  <UploadCloud size={38} />
                </div>
                <h3 className="dropzone-heading">Glissez-déposez votre fichier de paiements ici</h3>
                <p className="dropzone-sub">
                  Prend en charge les classeurs Excel (<strong>.xlsx</strong>, <strong>.xls</strong>) et fichiers texte délimités (<strong>.csv</strong>, <strong>.tsv</strong>).
                </p>
                <button
                  type="button"
                  className="btn-gold-primary"
                  disabled={isLoadingFile}
                >
                  <FileText size={15} />
                  <span>{isLoadingFile ? "Chargement en cours..." : "Sélectionner un fichier sur votre ordinateur"}</span>
                </button>
              </div>

              {fileError && (
                <div className="account-form-error" style={{ marginTop: 12 }}>
                  <AlertCircle size={16} />
                  <span>{fileError}</span>
                </div>
              )}

              <div className="batch-sample-box">
                <div className="sample-box-left">
                  <FileSpreadsheet size={18} className="field-icon-gold" />
                  <div>
                    <strong style={{ fontSize: 13, color: "var(--text-primary)" }}>Modèle de fichier pré-formaté</strong>
                    <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--text-secondary)" }}>
                      Téléchargez un fichier Excel modèle avec les colonnes standards (Bénéficiaire, Montant, Date, N° Chèque, etc.).
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-acc-cancel"
                  onClick={handleDownloadSampleExcel}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  <Download size={14} />
                  <span>Télécharger le modèle (.xlsx)</span>
                </button>
              </div>
            </div>
          )}

          {/* =========================================================================
              ÉTAPE 2 : CORRESPONDANCE DES COLONNES (MAPPING)
              ========================================================================= */}
          {currentStep === 2 && fileData && (
            <div className="batch-step-pane">
              <div className="batch-file-summary-card">
                <div className="summary-left">
                  <FileSpreadsheet size={18} className="field-icon-gold" />
                  <div>
                    <strong style={{ fontSize: 13, color: "var(--text-primary)" }}>{fileData.filename}</strong>
                    <span style={{ fontSize: 11.5, color: "var(--text-secondary)", marginLeft: 8 }}>
                      ({fileData.rowCount} lignes détectées)
                    </span>
                  </div>
                </div>
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  Associez chaque champ officiel du chèque à la colonne correspondante de votre fichier.
                </span>
              </div>

              <div className="mapping-list-grid">
                <div className="mapping-item-card required">
                  <div className="mapping-item-info">
                    <label className="field-lbl">
                      Bénéficiaire (Ordre) <span className="req">*</span>
                    </label>
                    <span className="field-hint">Nom du destinataire du chèque</span>
                  </div>
                  <div className="mapping-item-control">
                    <select
                      value={mapping.beneficiary}
                      onChange={(e) => setMapping({ ...mapping, beneficiary: e.target.value })}
                      className="field-input field-select"
                    >
                      <option value="">-- Sélectionner la colonne --</option>
                      {fileData.headers.map((h) => (
                        <option key={h} value={h}>
                          {h} (ex: "{fileData.rawRows[0]?.[h] || ""}")
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mapping-item-card required">
                  <div className="mapping-item-info">
                    <label className="field-lbl">
                      Montant en chiffres <span className="req">*</span>
                    </label>
                    <span className="field-hint">Valeur en Dinars Algériens (DZD)</span>
                  </div>
                  <div className="mapping-item-control">
                    <select
                      value={mapping.amount}
                      onChange={(e) => setMapping({ ...mapping, amount: e.target.value })}
                      className="field-input field-select"
                    >
                      <option value="">-- Sélectionner la colonne --</option>
                      {fileData.headers.map((h) => (
                        <option key={h} value={h}>
                          {h} (ex: "{fileData.rawRows[0]?.[h] || ""}")
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mapping-item-card">
                  <div className="mapping-item-info">
                    <label className="field-lbl">
                      Date d'émission <span className="optional">(Optionnel)</span>
                    </label>
                    <span className="field-hint">Par défaut : date du jour</span>
                  </div>
                  <div className="mapping-item-control">
                    <select
                      value={mapping.date || ""}
                      onChange={(e) => setMapping({ ...mapping, date: e.target.value || undefined })}
                      className="field-input field-select"
                    >
                      <option value="">-- Date du jour par défaut --</option>
                      {fileData.headers.map((h) => (
                        <option key={h} value={h}>
                          {h} (ex: "{fileData.rawRows[0]?.[h] || ""}")
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mapping-item-card">
                  <div className="mapping-item-info">
                    <label className="field-lbl">
                      Lieu d'émission (Fait à) <span className="optional">(Optionnel)</span>
                    </label>
                    <span className="field-hint">Par défaut : ville de l'agence bancaire</span>
                  </div>
                  <div className="mapping-item-control">
                    <select
                      value={mapping.place || ""}
                      onChange={(e) => setMapping({ ...mapping, place: e.target.value || undefined })}
                      className="field-input field-select"
                    >
                      <option value="">-- Alger (ou agence du compte) --</option>
                      {fileData.headers.map((h) => (
                        <option key={h} value={h}>
                          {h} (ex: "{fileData.rawRows[0]?.[h] || ""}")
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mapping-item-card">
                  <div className="mapping-item-info">
                    <label className="field-lbl">
                      Numéro de chèque <span className="optional">(Optionnel)</span>
                    </label>
                    <span className="field-hint">Numéro fixe du fichier ou incrément du chéquier actif</span>
                  </div>
                  <div className="mapping-item-control">
                    <select
                      value={mapping.chequeNumber || ""}
                      onChange={(e) => setMapping({ ...mapping, chequeNumber: e.target.value || undefined })}
                      className="field-input field-select"
                    >
                      <option value="">-- Attribué automatiquement par le chéquier --</option>
                      {fileData.headers.map((h) => (
                        <option key={h} value={h}>
                          {h} (ex: "{fileData.rawRows[0]?.[h] || ""}")
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mapping-item-card">
                  <div className="mapping-item-info">
                    <label className="field-lbl">
                      Référence interne / Pièce comptable <span className="optional">(Optionnel)</span>
                    </label>
                    <span className="field-hint">Facture, bon de commande, note interne</span>
                  </div>
                  <div className="mapping-item-control">
                    <select
                      value={mapping.reference || ""}
                      onChange={(e) => setMapping({ ...mapping, reference: e.target.value || undefined })}
                      className="field-input field-select"
                    >
                      <option value="">-- Aucune référence --</option>
                      {fileData.headers.map((h) => (
                        <option key={h} value={h}>
                          {h} (ex: "{fileData.rawRows[0]?.[h] || ""}")
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Aperçu rapide de conversion */}
              <div className="batch-sample-box" style={{ marginTop: 12 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>
                    Aperçu de conversion (1ère ligne du fichier)
                  </span>
                  <div style={{ display: "flex", gap: 24, fontSize: 12 }}>
                    <div>
                      <span style={{ color: "var(--text-secondary)" }}>Bénéficiaire : </span>
                      <strong>{mapping.beneficiary ? fileData.rawRows[0]?.[mapping.beneficiary] || "—" : "Non assigné"}</strong>
                    </div>
                    <div>
                      <span style={{ color: "var(--text-secondary)" }}>Montant : </span>
                      <strong>{mapping.amount ? fileData.rawRows[0]?.[mapping.amount] || "—" : "Non assigné"}</strong>
                    </div>
                    <div>
                      <span style={{ color: "var(--text-secondary)" }}>Date : </span>
                      <strong>{mapping.date ? fileData.rawRows[0]?.[mapping.date] || "Date du jour" : "Date du jour"}</strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* =========================================================================
              ÉTAPE 3 : GRILLE DE CONTRÔLE, PARAMÈTRES BANCAIRES & SÉLECTION
              ========================================================================= */}
          {currentStep === 3 && (
            <div className="batch-step-pane">
              {/* Configuration du compte émetteur */}
              <div className="batch-account-row">
                <div className="account-selector-group">
                  <label className="field-lbl">
                    <Building2 size={15} className="field-icon-gold" />
                    <span>Compte émetteur :</span>
                  </label>
                  <select
                    value={selectedAccountId}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                    className="field-input field-select"
                    style={{ width: 340, padding: "6px 12px", fontSize: 12 }}
                  >
                    {companyAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.label} — {acc.ribOrIban} ({acc.balance.toLocaleString("fr-FR")} DZD)
                      </option>
                    ))}
                  </select>
                  {onOpenBankAccounts && (
                    <button
                      type="button"
                      className="btn-acc-cancel btn-sm"
                      onClick={onOpenBankAccounts}
                    >
                      Gérer
                    </button>
                  )}
                </div>

                <div className="chequebook-status-badge">
                  <BookOpen size={15} style={{ color: "var(--gold-dark)" }} />
                  <span style={{ fontSize: 12 }}>
                    {activeChequeBook ? (
                      <>
                        <strong>{activeChequeBook.seriesName}</strong> · Prochain N° :{" "}
                        <span className="font-mono" style={{ fontWeight: 700 }}>{activeChequeBook.currentNumber}</span> · Feuilles :{" "}
                        <strong className={leavesRemaining < selectedCount ? "text-danger" : "text-emerald"}>
                          {leavesRemaining}
                        </strong>
                      </>
                    ) : (
                      "Aucun chéquier actif"
                    )}
                  </span>
                </div>
              </div>

              {/* Alerte si capacité insuffisante */}
              {activeChequeBook && leavesRemaining < selectedCount && (
                <div className="account-form-error" style={{ marginBottom: 10 }}>
                  <AlertTriangle size={16} />
                  <span>
                    Attention : Vous avez sélectionné <strong>{selectedCount}</strong> chèques alors que votre chéquier actif ne dispose que de <strong>{leavesRemaining}</strong> feuillets.
                  </span>
                </div>
              )}

              {/* 4 Cartes KPIs dans le style exact de BeneficiaryStatementModal */}
              <div className="statement-kpis-grid" style={{ padding: 0, marginBottom: 12, border: "none", background: "transparent" }}>
                <div className="statement-kpi-card highlight-green">
                  <span className="kpi-label">Montant total sélectionné</span>
                  <strong className="kpi-amount">{stats.selectedTotalFormatted} DZD</strong>
                  <span className="kpi-sub">{selectedValidCount} chèque(s) à émettre</span>
                </div>

                <div
                  className={`statement-kpi-card ${filterStatus === "all" ? "active-filter-card" : ""}`}
                  style={{ cursor: "pointer" }}
                  onClick={() => setFilterStatus("all")}
                >
                  <span className="kpi-label">Total lignes détectées</span>
                  <strong className="kpi-val">{stats.totalRows}</strong>
                  <span className="kpi-sub">Lignes importées</span>
                </div>

                <div
                  className={`statement-kpi-card ${filterStatus === "valid" ? "active-filter-card" : ""}`}
                  style={{ cursor: "pointer" }}
                  onClick={() => setFilterStatus("valid")}
                >
                  <span className="kpi-label">Lignes valides</span>
                  <strong className="kpi-val text-green">{stats.validCount}</strong>
                  <span className="kpi-sub">Prêtes à l'émission</span>
                </div>

                <div
                  className={`statement-kpi-card ${filterStatus === "duplicate" ? "active-filter-card" : ""}`}
                  style={{ cursor: "pointer" }}
                  onClick={() => setFilterStatus("duplicate")}
                >
                  <span className="kpi-label">Doublons suspects / Erreurs</span>
                  <strong className="kpi-val" style={{ color: stats.duplicateCount > 0 ? "#b45309" : "var(--text-primary)" }}>
                    {stats.duplicateCount} <span style={{ fontSize: 12, color: "#dc2626" }}>({stats.errorCount} err)</span>
                  </strong>
                  <span className="kpi-sub">À vérifier attentivement</span>
                </div>
              </div>

              {/* Barre d'actions de sélection rapide */}
              <div className="batch-table-toolbar">
                <div className="selection-actions">
                  <button type="button" className="btn-text-sm" onClick={() => handleToggleSelectAll(true)}>
                    Tout cocher
                  </button>
                  <span className="sep">•</span>
                  <button type="button" className="btn-text-sm" onClick={handleSelectOnlyValid}>
                    Cocher valides uniquement
                  </button>
                  <span className="sep">•</span>
                  <button type="button" className="btn-text-sm" onClick={() => handleToggleSelectAll(false)}>
                    Tout décocher
                  </button>
                </div>

                <div className="batch-grid-options">
                  <label className="checkbox-option">
                    <input
                      type="checkbox"
                      checked={autoIncrementNumber}
                      onChange={(e) => setAutoIncrementNumber(e.target.checked)}
                    />
                    <span>Numéroter via le chéquier actif</span>
                  </label>

                  <label className="checkbox-option">
                    <input
                      type="checkbox"
                      checked={autoRecordBeneficiaries}
                      onChange={(e) => setAutoRecordBeneficiaries(e.target.checked)}
                    />
                    <span>Enregistrer les nouveaux bénéficiaires</span>
                  </label>
                </div>
              </div>

              {/* Tableau de contrôle */}
              <div className="batch-table-wrap">
                <table className="batch-table">
                  <thead>
                    <tr>
                      <th style={{ width: 36, textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={items.length > 0 && items.every((i) => i.selected)}
                          onChange={(e) => handleToggleSelectAll(e.target.checked)}
                        />
                      </th>
                      <th style={{ width: 44, textAlign: "center" }}>N°</th>
                      <th style={{ width: 130 }}>Statut</th>
                      <th>Bénéficiaire</th>
                      <th style={{ width: 140, textAlign: "right" }}>Montant (DZD)</th>
                      <th style={{ width: 95 }}>Date</th>
                      <th style={{ width: 95 }}>Lieu</th>
                      <th style={{ width: 100 }}>N° Chèque</th>
                      <th style={{ width: 100 }}>Réf.</th>
                      <th style={{ width: 40, textAlign: "center" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedItems.length === 0 ? (
                      <tr>
                        <td colSpan={10} style={{ textAlign: "center", padding: "30px 10px", color: "var(--text-secondary)" }}>
                          Aucun chèque ne correspond au filtre actif.
                        </td>
                      </tr>
                    ) : (
                      displayedItems.map((item) => (
                        <tr
                          key={item.id}
                          className={`batch-row ${item.selected ? "row-selected" : ""}`}
                          onClick={() => handleToggleRow(item.id)}
                        >
                          <td style={{ textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={item.selected}
                              onChange={() => handleToggleRow(item.id)}
                            />
                          </td>
                          <td style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: 11 }}>
                            {item.rowIndex}
                          </td>
                          <td>
                            {item.status === "valid" && (
                              <span className="statement-status-tag printed">
                                <CheckCircle2 size={11} /> Valide
                              </span>
                            )}
                            {item.status === "duplicate" && (
                              <span
                                className="statement-status-tag"
                                style={{ background: "#fffbeb", color: "#b45309", border: "1px solid #fde68a" }}
                                title={item.statusMessage || "Doublon potentiel"}
                              >
                                <AlertTriangle size={11} /> Doublon
                              </span>
                            )}
                            {item.status === "error" && (
                              <span className="statement-status-tag annule" title={item.statusMessage || "Invalide"}>
                                <AlertCircle size={11} /> Invalide
                              </span>
                            )}
                          </td>
                          <td>
                            <strong style={{ color: "var(--text-primary)" }}>{item.beneficiary || "—"}</strong>
                            {item.statusMessage && item.status !== "valid" && (
                              <div style={{ fontSize: 11, color: item.status === "duplicate" ? "#b45309" : "#b91c1c", marginTop: 2 }}>
                                {item.statusMessage}
                              </div>
                            )}
                          </td>
                          <td style={{ textAlign: "right", fontWeight: 700, color: "var(--text-primary)" }}>
                            {item.formattedAmount}
                          </td>
                          <td style={{ color: "var(--text-secondary)" }}>{item.date}</td>
                          <td style={{ color: "var(--text-secondary)" }}>{item.place}</td>
                          <td className="font-mono" style={{ color: item.chequeNumber ? "var(--text-primary)" : "var(--text-secondary)" }}>
                            {item.chequeNumber || "Auto"}
                          </td>
                          <td style={{ color: "var(--text-secondary)", fontSize: 11.5 }}>
                            {item.reference || "—"}
                          </td>
                          <td style={{ textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              className="btn-close-mini"
                              onClick={() => handleDeleteRow(item.id)}
                              title="Retirer cette ligne du lot"
                            >
                              <X size={13} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Pied de page modal standard */}
        <div className="statement-toolbar-row batch-modal-footer">
          <div className="footer-left">
            {currentStep === 2 && (
              <button
                type="button"
                className="btn-acc-cancel"
                onClick={() => setCurrentStep(1)}
              >
                <ArrowLeft size={15} />
                <span>Changer de fichier</span>
              </button>
            )}
            {currentStep === 3 && (
              <button
                type="button"
                className="btn-acc-cancel"
                onClick={() => setCurrentStep(2)}
              >
                <ArrowLeft size={15} />
                <span>Modifier le mapping</span>
              </button>
            )}
          </div>

          <div className="footer-right" style={{ display: "flex", gap: 10 }}>
            <button type="button" className="btn-acc-cancel" onClick={onClose}>
              Annuler
            </button>

            {currentStep === 2 && (
              <button
                type="button"
                className="btn-gold-primary"
                onClick={handleValidateMapping}
                disabled={!mapping.beneficiary || !mapping.amount}
              >
                <span>Vérifier et analyser les lignes</span>
                <ArrowRight size={15} />
              </button>
            )}

            {currentStep === 3 && (
              <>
                <button
                  type="button"
                  className="btn-action-card"
                  onClick={handleExecuteSaveBatch}
                  disabled={selectedValidCount === 0 || isProcessing}
                  title="Enregistrer les chèques sélectionnés dans l'historique sans impression"
                >
                  <Save size={15} className="btn-action-icon" />
                  <span>Enregistrer en lot ({selectedValidCount})</span>
                </button>

                <button
                  type="button"
                  className="btn-action-luxury-green"
                  onClick={handleExecuteSequentialPrint}
                  disabled={selectedValidCount === 0 || isProcessing}
                  title="Démarrer l'impression guidée successive des chèques"
                >
                  <Printer size={16} />
                  <span>Imprimer en série ({selectedValidCount})</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
