import React, { useState } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Printer,
  XCircle,
  HelpCircle,
  FileQuestion
} from "lucide-react";

export interface PrintConfirmationModalProps {
  isOpen: boolean;
  attemptId: string;
  chequeData: {
    id: string;
    amount: string;
    beneficiary: string;
    bankName: string;
    date: string;
    copyNumber: number;
  };
  onConfirmSuccess: () => void;
  onReportFailure: (reason: string) => void;
  onRetryPrint: () => void;
}

const FAILURE_REASONS = [
  "Bourrage papier / Chèque coincé",
  "Mauvais alignement / Décalage dans le bac",
  "Chèque inséré dans le mauvais sens ou à l'envers",
  "Impression annulée dans le dialogue Windows",
  "Manque d'encre / Texte pâle ou illisible",
  "Autre incident d'impression"
];

export const PrintConfirmationModal: React.FC<PrintConfirmationModalProps> = ({
  isOpen,
  chequeData,
  onConfirmSuccess,
  onReportFailure,
  onRetryPrint
}) => {
  const [isReportingFailure, setIsReportingFailure] = useState<boolean>(false);
  const [selectedReason, setSelectedReason] = useState<string>(FAILURE_REASONS[0]);
  const [customReason, setCustomReason] = useState<string>("");

  if (!isOpen) return null;

  const handleConfirmIncident = () => {
    const finalReason = selectedReason === "Autre incident d'impression" && customReason.trim()
      ? customReason.trim()
      : selectedReason;
    onReportFailure(finalReason);
    setIsReportingFailure(false);
  };

  return (
    <div className="print-confirm-overlay" role="dialog" aria-modal="true">
      <div className="print-confirm-modal">
        {/* En-tête */}
        <div className="print-confirm-header">
          <div className="print-confirm-icon-box">
            <Printer size={22} className="confirm-icon text-gold" />
          </div>
          <div>
            <h3 className="confirm-title">Validation de la sortie papier</h3>
            <p className="confirm-subtitle">
              Distinction entre envoi au pilote d'impression et validation physique effective.
            </p>
          </div>
        </div>

        {/* Détails du chèque imprimé */}
        <div className="print-confirm-details-card">
          <div className="confirm-card-row">
            <span className="confirm-label">Bénéficiaire :</span>
            <strong className="confirm-val">{chequeData.beneficiary || "Non spécifié"}</strong>
          </div>
          <div className="confirm-card-row">
            <span className="confirm-label">Montant :</span>
            <strong className="confirm-val highlight">{chequeData.amount} DZD</strong>
          </div>
          <div className="confirm-card-row">
            <span className="confirm-label">Établissement bancaire :</span>
            <strong className="confirm-val">{chequeData.bankName}</strong>
          </div>
          <div className="confirm-card-row">
            <span className="confirm-label">Tirage :</span>
            <span className="confirm-badge">
              {chequeData.copyNumber > 1 ? `Réimpression (Copie N°${chequeData.copyNumber})` : "Premier tirage"}
            </span>
          </div>
        </div>

        {!isReportingFailure ? (
          <>
            <div className="print-confirm-question-box">
              <HelpCircle size={20} className="question-icon" />
              <span>
                Le chèque a-t-il été <strong>imprimé correctement</strong> sur votre imprimante physique ?
              </span>
            </div>

            <div className="print-confirm-actions">
              <button
                type="button"
                className="btn-confirm-success"
                onClick={onConfirmSuccess}
              >
                <CheckCircle2 size={18} />
                <span>Oui, impression réussie</span>
              </button>

              <button
                type="button"
                className="btn-confirm-danger"
                onClick={() => setIsReportingFailure(true)}
              >
                <AlertTriangle size={18} />
                <span>Non, incident / Annulé</span>
              </button>

              <button
                type="button"
                className="btn-confirm-retry"
                onClick={onRetryPrint}
                title="Relancer le dialogue d'impression sans modifier les compteurs"
              >
                <RotateCcw size={16} />
                <span>Réessayer</span>
              </button>
            </div>
          </>
        ) : (
          <div className="print-failure-reason-block">
            <div className="failure-reason-header">
              <AlertTriangle size={17} className="text-danger" />
              <span>Motif de l'incident (enregistré dans le journal d'audit) :</span>
            </div>

            <div className="failure-reasons-list">
              {FAILURE_REASONS.map((reason) => (
                <label key={reason} className="failure-reason-radio-label">
                  <input
                    type="radio"
                    name="failure-reason"
                    value={reason}
                    checked={selectedReason === reason}
                    onChange={() => setSelectedReason(reason)}
                  />
                  <span>{reason}</span>
                </label>
              ))}
            </div>

            {selectedReason === "Autre incident d'impression" && (
              <input
                type="text"
                className="custom-failure-input"
                placeholder="Précisez la raison..."
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
              />
            )}

            <div className="failure-actions-row">
              <button
                type="button"
                className="btn-modal-secondary"
                onClick={() => setIsReportingFailure(false)}
              >
                Retour
              </button>
              <button
                type="button"
                className="btn-confirm-save-failure"
                onClick={handleConfirmIncident}
              >
                <XCircle size={16} />
                <span>Enregistrer l'incident (Garder en brouillon)</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
