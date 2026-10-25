import React, { useState } from "react";
import {
  FileDown,
  X,
  FileText,
  Layers,
  CheckCircle2,
  Image as ImageIcon,
  Printer,
  Sparkles
} from "lucide-react";
import type { BankTemplate } from "../types";
import { sanitizeFilename } from "../services/pdfExport";

export interface ExportPdfModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmExport: (options: {
    mode: "exact-cheque" | "sheet";
    includeBackground: boolean;
    filename: string;
  }) => Promise<void>;
  currentTemplate: BankTemplate;
  amount: string;
  beneficiary: string;
  date: string;
}

export const ExportPdfModal: React.FC<ExportPdfModalProps> = ({
  isOpen,
  onClose,
  onConfirmExport,
  currentTemplate,
  amount,
  beneficiary,
  date
}) => {
  const [mode, setMode] = useState<"exact-cheque" | "sheet">("exact-cheque");
  const [includeBackground, setIncludeBackground] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Génération du nom de fichier par défaut
  const safeBeneficiary = sanitizeFilename(beneficiary.trim() || "cheque");
  const safeAmount = (amount || "0").replace(/[^0-9.]/g, "");
  const defaultFilename = `Cheque_${safeBeneficiary}_${safeAmount}DZD_${date || "export"}.pdf`;
  const [customFilename, setCustomFilename] = useState<string>(defaultFilename);

  // Mettre à jour le nom si les props changent
  React.useEffect(() => {
    setCustomFilename(defaultFilename);
  }, [defaultFilename]);

  if (!isOpen) return null;

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const finalName = customFilename.trim().endsWith(".pdf")
        ? customFilename.trim()
        : `${customFilename.trim() || defaultFilename}.pdf`;

      await onConfirmExport({
        mode,
        includeBackground,
        filename: finalName
      });
      onClose();
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="print-confirm-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="print-confirm-modal export-pdf-modal" onClick={(e) => e.stopPropagation()}>
        {/* En-tête */}
        <div className="print-confirm-header">
          <div className="print-confirm-icon-box">
            <FileDown size={22} className="confirm-icon text-gold" />
          </div>
          <div style={{ flex: 1 }}>
            <h3 className="confirm-title">Exporter le chèque en PDF vectoriel</h3>
            <p className="confirm-subtitle">
              Génération haute résolution 100% conforme aux normes bancaires algériennes.
            </p>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Fermer"
            disabled={isExporting}
          >
            <X size={18} />
          </button>
        </div>

        {/* Détails rapides du chèque */}
        <div className="print-confirm-details-card">
          <div className="confirm-card-row">
            <span className="confirm-label">Banque / Modèle :</span>
            <strong className="confirm-val">
              {currentTemplate.name} ({currentTemplate.width} × {currentTemplate.height} mm)
            </strong>
          </div>
          <div className="confirm-card-row">
            <span className="confirm-label">Bénéficiaire :</span>
            <strong className="confirm-val">{beneficiary.trim() || "Non spécifié"}</strong>
          </div>
          <div className="confirm-card-row">
            <span className="confirm-label">Montant :</span>
            <strong className="confirm-val highlight">{amount || "0"} DZD</strong>
          </div>
        </div>

        {/* Options de format de sortie */}
        <div className="export-pdf-section">
          <label className="export-pdf-section-label">
            <Layers size={15} />
            <span>Format et mise en page du document PDF</span>
          </label>
          <div className="export-pdf-options-grid">
            <div
              className={`export-pdf-option-card ${mode === "exact-cheque" ? "selected" : ""}`}
              onClick={() => setMode("exact-cheque")}
            >
              <div className="option-card-header">
                <FileText size={16} className="option-card-icon" />
                <span className="option-card-title">Format chèque réel 1:1</span>
                {mode === "exact-cheque" && <CheckCircle2 size={16} className="option-card-check" />}
              </div>
              <p className="option-card-desc">
                Dimensions exactes du chèque ({currentTemplate.width} × {currentTemplate.height} mm). Idéal pour
                impression directe ou découpe précise.
              </p>
            </div>

            <div
              className={`export-pdf-option-card ${mode === "sheet" ? "selected" : ""}`}
              onClick={() => setMode("sheet")}
            >
              <div className="option-card-header">
                <Layers size={16} className="option-card-icon" />
                <span className="option-card-title">Feuille A4 avec repères</span>
                {mode === "sheet" && <CheckCircle2 size={16} className="option-card-check" />}
              </div>
              <p className="option-card-desc">
                Chèque positionné sur une feuille A4 standard (210 × 297 mm) avec cadre et repères de découpe.
              </p>
            </div>
          </div>
        </div>

        {/* Options de fond et rendu */}
        <div className="export-pdf-section">
          <label className="export-pdf-section-label">
            <ImageIcon size={15} />
            <span>Style de contenu</span>
          </label>
          <div className="export-pdf-options-grid">
            <div
              className={`export-pdf-option-card ${!includeBackground ? "selected" : ""}`}
              onClick={() => setIncludeBackground(false)}
            >
              <div className="option-card-header">
                <Printer size={16} className="option-card-icon" />
                <span className="option-card-title">Texte seul (Pour chèque vierge)</span>
                {!includeBackground && <CheckCircle2 size={16} className="option-card-check" />}
              </div>
              <p className="option-card-desc">
                Imprime uniquement les écritures et mentions de sécurité. Parfait pour insérer un vrai chéquier dans votre imprimante.
              </p>
            </div>

            <div
              className={`export-pdf-option-card ${includeBackground ? "selected" : ""}`}
              onClick={() => setIncludeBackground(true)}
            >
              <div className="option-card-header">
                <Sparkles size={16} className="option-card-icon" />
                <span className="option-card-title">Chèque complet avec fond bancaire</span>
                {includeBackground && <CheckCircle2 size={16} className="option-card-check" />}
              </div>
              <p className="option-card-desc">
                Intègre le visuel officiel de la banque en arrière-plan. Idéal pour copie d'archive, transmission par email ou comptabilité.
              </p>
            </div>
          </div>
        </div>

        {/* Nom du fichier */}
        <div className="export-pdf-section">
          <label className="export-pdf-section-label" htmlFor="pdf-filename-input">
            <FileDown size={15} />
            <span>Nom du fichier de destination</span>
          </label>
          <input
            id="pdf-filename-input"
            type="text"
            className="form-input export-filename-input"
            value={customFilename}
            onChange={(e) => setCustomFilename(e.target.value)}
            placeholder="NomDuFichier.pdf"
            disabled={isExporting}
          />
        </div>

        {/* Actions du pied de page */}
        <div className="export-pdf-modal-footer">
          <button
            type="button"
            className="btn-modal-secondary"
            onClick={onClose}
            disabled={isExporting}
          >
            Annuler
          </button>
          <button
            type="button"
            className="btn-gold-primary"
            onClick={handleExport}
            disabled={isExporting}
          >
            <FileDown size={16} />
            <span>{isExporting ? "Génération en cours..." : "Enregistrer le fichier PDF..."}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
