import React from "react";
import {
  House,
  Landmark,
  History,
  Users,
  Settings,
  CheckCheck,
  PanelLeftClose,
  PanelLeftOpen
} from "lucide-react";
import maqamEchahidSvg from "../assets/maqam-echahid.svg";
import sidebarOrnamentsSvg from "../assets/sidebar-ornaments.svg";

export type NavTab = "home" | "templates" | "history" | "beneficiaries" | "reconciliation" | "settings";

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  isCollapsed = false,
  onToggleCollapse
}) => {
  const navItems = [
    { id: "home" as NavTab, label: "Accueil", icon: House },
    { id: "templates" as NavTab, label: "Modèles bancaires", icon: Landmark },
    { id: "history" as NavTab, label: "Historique", icon: History },
    { id: "beneficiaries" as NavTab, label: "Bénéficiaires", icon: Users },
    { id: "reconciliation" as NavTab, label: "Rapprochement", icon: CheckCheck },
    { id: "settings" as NavTab, label: "Paramètres", icon: Settings }
  ];

  return (
    <aside
      className={`app-sidebar ${isCollapsed ? "collapsed" : ""}`}
      aria-label="Navigation latérale"
    >
      {/* =========================================================================
          COUCHES D'ARRIÈRE-PLAN DÉCORATIVES (Atmosphère algérienne prestigieuse)
          ========================================================================= */}
      <div className="sidebar-bg-layers" aria-hidden="true">
        {/* Lueur émeraude subtile */}
        <div className="sidebar-emerald-glow" />

        {/* Ornements géométriques or */}
        <img
          src={sidebarOrnamentsSvg}
          alt=""
          className="sidebar-ornaments-img"
        />

        {/* Illustration architecturale Maqam Echahid */}
        <img
          src={maqamEchahidSvg}
          alt=""
          className="sidebar-monument-img"
        />

        {/* Signature élégante Algérie (visible en mode étendu) */}
        {!isCollapsed && (
          <div className="sidebar-signature">
            <span>Algérie</span>
          </div>
        )}
      </div>

      {/* =========================================================================
          CONTENU INTERACTIF AU PREMIER PLAN
          ========================================================================= */}
      {/* 1. Ligne de contrôle de navigation (en haut) */}
      {onToggleCollapse && (
        <div className="sidebar-collapse-row">
          {!isCollapsed && <span className="sidebar-section-title">Navigation</span>}
          <button
            type="button"
            className="sidebar-toggle-btn"
            onClick={onToggleCollapse}
            title={isCollapsed ? "Développer le menu (icônes + texte)" : "Réduire le menu (icônes seules)"}
            aria-label={isCollapsed ? "Développer le menu" : "Réduire le menu"}
          >
            {isCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>
      )}

      {/* 2. Liste de navigation */}
      <nav className="sidebar-nav" aria-label="Navigation principale">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`sidebar-nav-btn ${isActive ? "active" : ""}`}
              onClick={() => onSelectTab(item.id)}
              title={isCollapsed ? item.label : undefined}
              aria-label={item.label}
            >
              <Icon size={19} className="nav-icon" />
              {!isCollapsed && <span className="nav-label">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* 3. Pied de page discret */}
      <div className="sidebar-footer">
        <div className="sidebar-footer-gold-line" />
        {!isCollapsed ? (
          <div className="sidebar-footer-content">
            <div className="sidebar-footer-version">v0.1.0 · Desktop Edition</div>
          </div>
        ) : (
          <div className="sidebar-footer-collapsed-dot" title="v0.1.0" />
        )}
      </div>
    </aside>
  );
};
