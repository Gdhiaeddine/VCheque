import React from "react";
import { Edit3, Save, Printer } from "lucide-react";

interface ActionBarProps {
  onEdit: () => void;
  onSave: () => void;
  onPrint: () => void;
}

export const ActionBar: React.FC<ActionBarProps> = ({
  onEdit,
  onSave,
  onPrint
}) => {
  return (
    <div className="app-action-bar">
      <div className="action-bar-left">
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
        >
          <Save size={16} className="btn-action-icon" />
          <span>Enregistrer</span>
        </button>
      </div>

      <div className="action-bar-right">
        <button
          type="button"
          className="btn-gold-primary btn-print-main"
          onClick={onPrint}
        >
          <Printer size={18} />
          <span>Imprimer le chèque</span>
        </button>
      </div>
    </div>
  );
};
