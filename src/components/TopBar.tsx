import React from "react";
import { Settings, ShieldCheck, Building2, ChevronDown } from "lucide-react";
import type { CompanyRecord } from "../types";

interface TopBarProps {
  onOpenSettings: () => void;
  activeCompany?: CompanyRecord | null;
  onOpenCompanyManager?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  onOpenSettings,
  activeCompany,
  onOpenCompanyManager
}) => {
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
        {onOpenCompanyManager && (
          <button
            type="button"
            className="topbar-company-btn"
            onClick={onOpenCompanyManager}
            title="Changer d'entreprise / Gérer les dossiers d'entreprises"
          >
            <div className="company-btn-icon-wrapper">
              <Building2 size={14} className="company-btn-icon" />
            </div>
            <div className="company-btn-text">
              <span className="company-btn-label">Entreprise active :</span>
              <span className="company-btn-name">
                {activeCompany?.name || "Mon Entreprise"}
              </span>
            </div>
            <ChevronDown size={14} className="company-btn-chevron" />
          </button>
        )}

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
