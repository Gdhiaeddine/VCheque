import React from "react";
import { ShieldAlert, ShieldCheck, Paperclip, CheckCircle2, X, AlertCircle, ArrowRight } from "lucide-react";
import type { ChequeRecord } from "../types";

interface CashedProofValidationModalProps {
  isOpen: boolean;
  cheque: ChequeRecord | null;
  onClose: () => void;
  onConfirmWithoutProof: () => void;
  onOpenAttachments: () => void;
  onOpenReconciliation?: () => void;
}

export const CashedProofValidationModal: React.FC<CashedProofValidationModalProps> = ({
  isOpen,
  cheque,
  onClose,
  onConfirmWithoutProof,
  onOpenAttachments,
  onOpenReconciliation
}) => {
  if (!isOpen || !cheque) return null;

  return (
    <div className="account-modal-overlay" role="dialog" aria-modal="true">
      <div className="account-modal-content" style={{ maxWidth: "540px" }}>
        {/* Header */}
        <div className="account-modal-header" style={{ borderBottom: "1px solid var(--border-color)", padding: "16px 20px" }}>
          <div className="account-modal-title-row">
            <div className="account-modal-icon-badge" style={{ background: "rgba(217, 119, 6, 0.12)", color: "#D97706" }}>
              <ShieldAlert size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                Attestation d'encaissement bancaire
              </h2>
              <p style={{ fontSize: "12px", color: "var(--text-secondary)", margin: "2px 0 0 0" }}>
                Chèque N° <strong>{cheque.chequeNumber || "Non spécifié"}</strong> · {cheque.beneficiary} ({cheque.amount} DA)
              </p>
            </div>
          </div>
          <button
            type="button"
            className="account-modal-close"
            onClick={onClose}
            title="Fermer"
            style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-muted)" }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Corps */}
        <div style={{ padding: "20px" }}>
          <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: "8px", padding: "12px 14px", display: "flex", gap: "10px", marginBottom: "16px" }}>
            <AlertCircle size={18} style={{ color: "#D97706", flexShrink: 0, marginTop: "2px" }} />
            <div style={{ fontSize: "12.5px", color: "#92400E", lineHeight: "1.45" }}>
              <strong>Aucun justificatif bancaire vérifié n'est associé à ce chèque.</strong>
              <div style={{ marginTop: "4px" }}>
                Pour garantir une traçabilité comptable certifiée, vous pouvez joindre un avis d'opéré bancaire ou lettrer le chèque avec un relevé de compte.
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {/* Action 1 : Joindre une preuve */}
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenAttachments();
              }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 14px",
                borderRadius: "8px",
                border: "1px solid var(--border-color)",
                background: "#FFF",
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.15s ease"
              }}
              className="cashed-choice-card"
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ width: "32px", height: "32px", borderRadius: "6px", background: "rgba(172, 137, 70, 0.12)", color: "var(--gold-dark)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Paperclip size={16} />
                </div>
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>
                    Joindre un avis d'opéré bancaire ou un scan
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                    Archiver la preuve formelle (PDF, scan de ticket de guichet ou capture)
                  </div>
                </div>
              </div>
              <ArrowRight size={15} style={{ color: "var(--text-muted)" }} />
            </button>

            {/* Action 2 : Rapprocher avec un relevé */}
            {onOpenReconciliation && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenReconciliation();
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 14px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color)",
                  background: "#FFF",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.15s ease"
                }}
                className="cashed-choice-card"
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{ width: "32px", height: "32px", borderRadius: "6px", background: "rgba(16, 185, 129, 0.12)", color: "var(--emerald-dark)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <ShieldCheck size={16} />
                  </div>
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>
                      Rapprocher avec un relevé bancaire
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                      Faire correspondre ce chèque avec une ligne d'opération de compte
                    </div>
                  </div>
                </div>
                <ArrowRight size={15} style={{ color: "var(--text-muted)" }} />
              </button>
            )}

            {/* Action 3 : Validation directe en mode déclaratif (NON OBLIGATOIRE / NON BLOQUANT) */}
            <button
              type="button"
              onClick={() => {
                onConfirmWithoutProof();
                onClose();
              }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 14px",
                borderRadius: "8px",
                border: "1px dashed #CBD5E1",
                background: "#F8FAFC",
                cursor: "pointer",
                textAlign: "left",
                marginTop: "4px"
              }}
              className="cashed-choice-card"
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ width: "32px", height: "32px", borderRadius: "6px", background: "#E2E8F0", color: "#475569", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <CheckCircle2 size={16} />
                </div>
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>
                    Confirmer sans justificatif (Mode déclaratif)
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    Passer au statut Encaissé sans preuve requise (signalé comme déclaratif)
                  </div>
                </div>
              </div>
              <span style={{ fontSize: "11px", background: "#E2E8F0", color: "#475569", padding: "2px 8px", borderRadius: "99px", fontWeight: 600 }}>
                Continuer
              </span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border-color)", display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            className="btn-modal-cancel"
            onClick={onClose}
            style={{ padding: "7px 16px", fontSize: "12.5px" }}
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
};
