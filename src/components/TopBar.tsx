import React from "react";
import { Settings, ShieldCheck } from "lucide-react";

interface TopBarProps {
  onOpenSettings: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ onOpenSettings }) => {
  return (
    <header className="app-topbar">
      <div className="topbar-left">
        <div className="topbar-brand">
          <div className="brand-logo-gold" aria-hidden="true">
            <img src="/icon-small.png" alt="Logo Chèque Studio" className="brand-logo-img" />
          </div>
          <div className="brand-titles">
            <h1 className="brand-name">VCheque Studio</h1>
            <span className="brand-sub">Remplissage de chèques algériens</span>
          </div>
        </div>
      </div>

      <div className="topbar-right">
        <div className="topbar-badge">
          <ShieldCheck size={14} className="badge-icon-green" />
          <span>Données 100% locales</span>
        </div>

        <button
          type="button"
          className="topbar-icon-btn"
          onClick={onOpenSettings}
          title="Paramètres de l'application"
          aria-label="Paramètres"
        >
          <Settings size={18} />
        </button>
      </div>
    </header>
  );
};
