import React from "react";
import {
  Edit3,
  Save,
  Printer,
  PlusCircle,
  CheckCircle2,
  Clock,
  FileDown,
  CreditCard,
  FileSpreadsheet,
  Lock
} from "lucide-react";
import type { ChequeStatus, UserRecord } from "../types";
import { hasPermission } from "../services/permissions";

interface ActionBarProps {
  onEdit: () => void;
  onSave: () => void;
  onPrint: () => void;
  onExportPdf?: () => void;
  onNew?: () => void;
  onOpenBankAccounts?: () => void;
  onOpenBatchImport?: () => void;
  showNewButton?: boolean;
  activeStatus?: ChequeStatus | null;
  printCount?: number;
  currentUser?: UserRecord | null;
}

export const ActionBar: React.FC<ActionBarProps> = ({
  onEdit,
  onSave,
  onPrint,
  onExportPdf,
  onNew,
  onOpenBankAccounts,
  onOpenBatchImport,
  showNewButton = true,
  activeStatus,
  printCount = 0,
  currentUser
}) => {
  const canCreate = hasPermission(currentUser?.role, "cheque:create");
  const canPrint = hasPermission(currentUser?.role, "cheque:print");
  const canImportBatch = hasPermission(currentUser?.role, "batch:import");

  return (
    <div className="app-action-bar">
      <div className="action-bar-left">
        {onNew && showNewButton && canCreate && (
          <button
            type="button"
            className="btn-action-card btn-new-cheque"
            onClick={onNew}
            title="Créer un nouveau chèque vierge"
          >
            <PlusCircle size={16} className="btn-action-icon" />
            <span>Nouveau chèque</span>
          </button>
        )}

        <button
          type="button"
          className="btn-action-card"
          onClick={onEdit}
        >
          <Edit3 size={16} className="btn-action-icon" />
          <span>Modifier le chèque</span>
        </button>

        <button
          type="button"
          className="btn-action-card"
          onClick={onSave}
          disabled={!canCreate}
          title={
            !canCreate
              ? "Profil Auditeur : Consultation seule (Saisie réservée aux opérateurs et signataires)"
              : activeStatus
              ? "Mettre à jour ce chèque dans l'historique"
              : "Enregistrer dans l'historique"
          }
          style={{ opacity: !canCreate ? 0.6 : 1 }}
        >
          <Save size={16} className="btn-action-icon" />
          <span>{activeStatus ? "Mettre à jour" : "Enregistrer"}</span>
        </button>

        {onOpenBankAccounts && (
          <button
            type="button"
            className="btn-action-card"
            onClick={onOpenBankAccounts}
            title="Gérer les comptes bancaires émetteurs et les chéquiers"
          >
            <CreditCard size={16} className="btn-action-icon" />
            <span>Comptes & Chéquiers</span>
          </button>
        )}

        {onOpenBatchImport && canImportBatch && (
          <button
            type="button"
            className="btn-action-card btn-batch-import"
            onClick={onOpenBatchImport}
            title="Importer des paiements depuis Excel/CSV et traiter des chèques en lot"
          >
            <FileSpreadsheet size={16} className="btn-action-icon text-emerald" />
            <span>Traitement en lot</span>
          </button>
        )}

        {activeStatus && (
          <div className="active-cheque-badge-wrapper" title="Statut du chèque en cours d'édition">
            {activeStatus === "printed" ? (
              <span className="active-status-indicator printed">
                <CheckCircle2 size={13} />
                <span>Déjà imprimé {printCount > 1 ? `(x${printCount})` : ""}</span>
              </span>
            ) : (
              <span className="active-status-indicator saved">
                <Clock size={13} />
                <span>Brouillon enregistré</span>
              </span>
            )}
          </div>
        )}
      </div>

      <div className="action-bar-right">
        {onExportPdf && (
          <button
            type="button"
            className="btn-action-card btn-pdf-export"
            onClick={onExportPdf}
            title="Exporter ce chèque directement en fichier PDF vectoriel"
          >
            <FileDown size={17} className="btn-action-icon text-gold" />
            <span>Exporter en PDF</span>
          </button>
        )}

        <button
          type="button"
          className={`btn-gold-primary btn-print-main ${!canPrint ? "btn-disabled-role" : ""}`}
          onClick={onPrint}
          title={
            !canPrint
              ? "L'impression physique et signature de chèques sont réservées aux profils Signataire et Administrateur"
              : undefined
          }
        >
          {!canPrint ? <Lock size={16} /> : <Printer size={18} />}
          <span>
            {activeStatus === "printed"
              ? `Réimprimer (Copie N°${(printCount || 1) + 1})`
              : "Imprimer le chèque"}
          </span>
        </button>
      </div>
    </div>
  );
};
