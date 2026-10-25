import React from "react";
import {
  FileText,
  Building2,
  History,
  Settings,
  PanelLeftClose,
  PanelLeftOpen
} from "lucide-react";

export type NavTab = "home" | "templates" | "history" | "settings";

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
    { id: "home" as NavTab, label: "Accueil", icon: FileText },
    { id: "templates" as NavTab, label: "Modèles bancaires", icon: Building2 },
    { id: "history" as NavTab, label: "Historique", icon: History },
    { id: "settings" as NavTab, label: "Paramètres", icon: Settings }
  ];

  return (
    <aside className={`app-sidebar ${isCollapsed ? "collapsed" : ""}`}>
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
            {isCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
        </div>
      )}

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
              <Icon size={18} className="nav-icon" />
              {!isCollapsed && <span className="nav-label">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        {/* Motif discret */}
        <div className="algeria-emblem" aria-hidden="true">
          <svg
            viewBox="0 0 60 20"
            width={isCollapsed ? "34" : "48"}
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinecap="round"
            opacity="0.45"
          >
            <path d="M5 18 L15 6 L25 18 Z" />
            <path d="M22 18 L30 3 L38 18 Z" />
            <path d="M35 18 L45 6 L55 18 Z" />
            <circle cx="30" cy="8" r="1.5" />
          </svg>
        </div>
        {!isCollapsed && (
          <>
            <div className="footer-country">Algérie</div>
            <div className="footer-version">v0.1.0 · Desktop Edition</div>
          </>
        )}
      </div>
    </aside>
  );
};
