import React from "react";
import { Edit3, Save, Printer, PlusCircle, CheckCircle2, Clock, FileDown } from "lucide-react";
import type { ChequeStatus } from "../types";

interface ActionBarProps {
  onEdit: () => void;
  onSave: () => void;
  onPrint: () => void;
  onExportPdf?: () => void;
  onNew?: () => void;
  showNewButton?: boolean;
  activeStatus?: ChequeStatus | null;
  printCount?: number;
}

export const ActionBar: React.FC<ActionBarProps> = ({
  onEdit,
  onSave,
  onPrint,
  onExportPdf,
  onNew,
  showNewButton = true,
  activeStatus,
  printCount = 0
}) => {
  return (
    <div className="app-action-bar">
      <div className="action-bar-left">
        {onNew && showNewButton && (
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
          title={activeStatus ? "Mettre à jour ce chèque dans l'historique" : "Enregistrer dans l'historique"}
        >
          <Save size={16} className="btn-action-icon" />
          <span>{activeStatus ? "Mettre à jour" : "Enregistrer"}</span>
        </button>

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
          className="btn-gold-primary btn-print-main"
          onClick={onPrint}
        >
          <Printer size={18} />
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
