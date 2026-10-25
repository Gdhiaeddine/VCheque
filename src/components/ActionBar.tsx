import React from "react";
import { Edit3, Save, Printer, PlusCircle, CheckCircle2, Clock } from "lucide-react";
import type { ChequeStatus } from "../types";

interface ActionBarProps {
  onEdit: () => void;
  onSave: () => void;
  onPrint: () => void;
  onNew?: () => void;
  activeStatus?: ChequeStatus | null;
  printCount?: number;
}

export const ActionBar: React.FC<ActionBarProps> = ({
  onEdit,
  onSave,
  onPrint,
  onNew,
  activeStatus,
  printCount = 0
}) => {
  return (
    <div className="app-action-bar">
      <div className="action-bar-left">
        {onNew && (
          <button
            type="button"
            className="btn-action-card btn-new-cheque"
            onClick={onNew}
            title="Réinitialiser pour créer un nouveau chèque"
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
