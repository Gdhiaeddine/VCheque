import React from "react";
import {
  FileText,
  Building2,
  History,
  Settings
} from "lucide-react";

export type NavTab = "home" | "templates" | "history" | "settings";

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onSelectTab }) => {
  const navItems = [
    { id: "home" as NavTab, label: "Accueil", icon: FileText },
    { id: "templates" as NavTab, label: "Modèles bancaires", icon: Building2 },
    { id: "history" as NavTab, label: "Historique", icon: History },
    { id: "settings" as NavTab, label: "Paramètres", icon: Settings }
  ];

  return (
    <aside className="app-sidebar">
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
            >
              <Icon size={18} className="nav-icon" />
              <span className="nav-label">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        {/* Discreet Algerian architectural motif */}
        <div className="algeria-emblem" aria-hidden="true">
          <svg viewBox="0 0 60 20" width="48" height="16" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.45">
            <path d="M5 18 L15 6 L25 18 Z" />
            <path d="M22 18 L30 3 L38 18 Z" />
            <path d="M35 18 L45 6 L55 18 Z" />
            <circle cx="30" cy="8" r="1.5" />
          </svg>
        </div>
        <div className="footer-country">Algérie</div>
        <div className="footer-version">v0.1.0 · Desktop Edition</div>
      </div>
    </aside>
  );
};
