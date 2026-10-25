import React from "react";
import { Settings, ShieldCheck, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from "lucide-react";

interface TopBarProps {
  onOpenSettings: () => void;
  isLeftCollapsed?: boolean;
  onToggleLeft?: () => void;
  isRightCollapsed?: boolean;
  onToggleRight?: () => void;
  showRightToggle?: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({
  onOpenSettings,
  isLeftCollapsed = false,
  onToggleLeft,
  isRightCollapsed = false,
  onToggleRight,
  showRightToggle = false
}) => {
  return (
    <header className="app-topbar">
      <div className="topbar-left">
        {onToggleLeft && (
          <button
            type="button"
            className="topbar-layout-btn"
            onClick={onToggleLeft}
            title={isLeftCollapsed ? "Développer le menu latéral (Ctrl+B)" : "Réduire le menu latéral (Ctrl+B)"}
            aria-label="Basculer le menu latéral"
          >
            {isLeftCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        )}

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

        {showRightToggle && onToggleRight && (
          <button
            type="button"
            className="topbar-layout-btn"
            onClick={onToggleRight}
            title={isRightCollapsed ? "Développer le volet d'outils" : "Réduire le volet d'outils"}
            aria-label="Basculer le volet d'outils"
          >
            {isRightCollapsed ? <PanelRightOpen size={18} /> : <PanelRightClose size={18} />}
          </button>
        )}

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
