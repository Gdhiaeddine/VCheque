import React from "react";
import { Settings, Building2, ChevronDown, User, Lock } from "lucide-react";
import type { CompanyRecord, UserRecord } from "../types";
import { isUserAdmin } from "../services/permissions";

interface TopBarProps {
  onOpenSettings: () => void;
  activeCompany?: CompanyRecord | null;
  onOpenCompanyManager?: () => void;
  currentUser?: UserRecord | null;
  onOpenUserManager?: () => void;
  onLockSession?: () => void;
  isAuthEnabled?: boolean;
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  validator: "Signataire",
  operator: "Opérateur",
  auditor: "Auditeur"
};

export const TopBar: React.FC<TopBarProps> = ({
  onOpenSettings,
  activeCompany,
  onOpenCompanyManager,
  currentUser,
  onOpenUserManager,
  onLockSession,
  isAuthEnabled
}) => {
  // Initiales de l'opérateur pour l'avatar de prestige
  const userInitials = currentUser?.displayName
    ? currentUser.displayName
        .trim()
        .split(/\s+/)
        .map((n) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : null;

  const isAdmin = isUserAdmin(currentUser);
  const userRolesList = currentUser?.roles && currentUser.roles.length > 0
    ? currentUser.roles
    : [currentUser?.role || "operator"];
  const roleDisplayLabel = userRolesList.map((r) => ROLE_LABELS[r] || r).join(" · ");

  return (
    <header className="app-topbar">
      <div className="topbar-left">
        <div className="topbar-brand">
          <div className="brand-logo-gold" aria-hidden="true">
            <img src="/icon-small.png" alt="Logo VCheque Studio" className="brand-logo-img" />
          </div>
          <div className="brand-titles">
            <h1 className="brand-name">
              VCheque <span className="brand-name-gold">Studio</span>
            </h1>
            <span className="brand-sub">
              <span className="brand-sub-dot" />
              Impression & Traçabilité Bancaire Algérienne
            </span>
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
              <Building2 size={13} className="company-btn-icon" />
            </div>
            <div className="company-btn-text">
              <span className="company-btn-label">Entreprise</span>
              <span className="company-btn-name">
                {activeCompany?.name || "Mon Entreprise"}
              </span>
            </div>
            <ChevronDown size={13} className="company-btn-chevron" />
          </button>
        )}

        {/* User Session Pill */}
        {currentUser && onOpenUserManager && (
          <button
            type="button"
            className="topbar-user-btn"
            onClick={onOpenUserManager}
            title={
              isAdmin
                ? "Gérer les opérateurs ou naviguer entre les comptes (Admin)"
                : `Mon profil utilisateur (${currentUser.displayName})`
            }
          >
            <div className="user-btn-avatar-wrapper">
              <div className="user-btn-avatar">
                {userInitials || <User size={13} />}
              </div>
              <span className="user-btn-pulse-dot" title="Session active" />
            </div>
            <div className="user-btn-details">
              <span className="user-btn-name">{currentUser.displayName}</span>
              <span className={`user-btn-role role-${currentUser.role}`} title={roleDisplayLabel}>
                {roleDisplayLabel}
              </span>
            </div>
          </button>
        )}

        {/* Instant Lock Button (Mode Sécurisé) */}
        {isAuthEnabled && onLockSession && (
          <button
            type="button"
            className="topbar-icon-btn lock-btn"
            onClick={onLockSession}
            title="Verrouiller la session immédiatement"
            aria-label="Verrouiller la session"
          >
            <Lock size={15} />
          </button>
        )}

        {/* Bouton Paramètres */}
        <button
          type="button"
          className="topbar-icon-btn settings-btn"
          onClick={onOpenSettings}
          title="Paramètres de l'application"
          aria-label="Paramètres"
        >
          <Settings size={17} className="settings-icon" />
        </button>
      </div>
    </header>
  );
};
