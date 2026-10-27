import React, { useState, useEffect } from "react";
import {
  Users,
  UserCheck,
  Shield,
  FileCheck2,
  Edit3,
  Eye,
  KeyRound,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  AlertCircle,
  Clock,
  UserPlus
} from "lucide-react";
import type { UserRecord, UserRole } from "../types";
import {
  getUsers,
  saveUser,
  deleteUser,
  getActiveUser,
  setActiveUser,
  logAuditEvent
} from "../services/db";
import { generateSalt, hashPin } from "../services/security";
import { isUserAdmin } from "../services/permissions";

interface UserSessionManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: UserRecord | null;
  onUserChanged?: (user: UserRecord) => void;
}

const ROLE_CONFIG: Record<UserRole, { label: string; desc: string; color: string; icon: React.ReactNode }> = {
  admin: {
    label: "Administrateur",
    desc: "Accès intégral, gestion des comptes et sauvegardes",
    color: "#DC2626",
    icon: <Shield size={14} />
  },
  validator: {
    label: "Signataire / Validateur",
    desc: "Émission, impression, lettrage et annulation de chèques",
    color: "#D97706",
    icon: <FileCheck2 size={14} />
  },
  operator: {
    label: "Opérateur de saisie",
    desc: "Saisie de chèques, modification et import de lots",
    color: "#2563EB",
    icon: <Edit3 size={14} />
  },
  auditor: {
    label: "Auditeur / Comptable",
    desc: "Consultation, grand livre et exports en lecture seule",
    color: "#059669",
    icon: <Eye size={14} />
  }
};

const getInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || "OP";
};

export const UserSessionManagerModal: React.FC<UserSessionManagerModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onUserChanged
}) => {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [activeUser, setActiveUserState] = useState<UserRecord | null>(null);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  // Form states avec support multi-rôles
  const [username, setUsername] = useState<string>("");
  const [displayName, setDisplayName] = useState<string>("");
  const [selectedRoles, setSelectedRoles] = useState<UserRole[]>(["operator"]);
  const [pin, setPin] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const effectiveUser = currentUser || activeUser || getActiveUser();
  const isAdmin = isUserAdmin(effectiveUser);

  const loadUsersList = async () => {
    const list = await getUsers();
    setUsers(list);
    setActiveUserState(getActiveUser());
  };

  useEffect(() => {
    if (isOpen) {
      loadUsersList();
      setIsEditing(false);
      setErrorMsg(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Filtrage strict : l'administrateur voit tous les utilisateurs ; un autre rôle ne voit QUE son propre profil
  const visibleUsers = isAdmin
    ? users
    : users.filter((u) => u.id === effectiveUser?.id);

  const handleStartCreate = () => {
    if (!isAdmin) return;
    setEditingUserId(null);
    setUsername("");
    setDisplayName("");
    setSelectedRoles(["operator"]);
    setPin("");
    setErrorMsg(null);
    setIsEditing(true);
  };

  const handleStartEdit = (user: UserRecord) => {
    // Un utilisateur non-admin ne peut modifier que son propre profil
    if (!isAdmin && user.id !== effectiveUser?.id) return;

    setEditingUserId(user.id);
    setUsername(user.username);
    setDisplayName(user.displayName);
    const userRoles = user.roles && user.roles.length > 0 ? user.roles : [user.role || "operator"];
    setSelectedRoles(userRoles);
    setPin("");
    setErrorMsg(null);
    setIsEditing(true);
  };

  const handleToggleRole = (r: UserRole) => {
    if (!isAdmin) return;
    if (selectedRoles.includes(r)) {
      if (selectedRoles.length === 1) {
        // Au moins un rôle doit être sélectionné
        return;
      }
      setSelectedRoles(selectedRoles.filter((item) => item !== r));
    } else {
      setSelectedRoles([...selectedRoles, r]);
    }
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !displayName.trim()) {
      setErrorMsg("Veuillez renseigner le nom d'utilisateur et le nom affiché.");
      return;
    }

    if (selectedRoles.length === 0) {
      setErrorMsg("Veuillez sélectionner au moins un rôle pour cet opérateur.");
      return;
    }

    try {
      let pinHash = undefined;
      let pinSalt = undefined;

      if (pin.trim()) {
        pinSalt = generateSalt();
        pinHash = await hashPin(pin.trim(), pinSalt);
      } else if (editingUserId) {
        // Conserver l'ancien PIN si non modifié
        const existing = users.find((u) => u.id === editingUserId);
        pinHash = existing?.pinHash;
        pinSalt = existing?.pinSalt;
      }

      // Si l'utilisateur actuel n'est pas admin, il ne peut pas modifier ses propres rôles
      const existingUser = users.find((u) => u.id === editingUserId);
      const finalRoles: UserRole[] = isAdmin
        ? selectedRoles
        : (existingUser?.roles || [existingUser?.role || "operator"]);
      const primaryRole: UserRole = finalRoles[0] || "operator";

      const userRecord: UserRecord = {
        id: editingUserId || `user-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        username: username.trim().toLowerCase(),
        displayName: displayName.trim(),
        role: primaryRole,
        roles: finalRoles,
        pinHash,
        pinSalt,
        isActive: true,
        createdAt: editingUserId
          ? existingUser?.createdAt || new Date().toISOString()
          : new Date().toISOString()
      };

      await saveUser(userRecord);
      await loadUsersList();

      if (editingUserId === effectiveUser?.id) {
        setActiveUser(userRecord);
        onUserChanged?.(userRecord);
      }

      setIsEditing(false);
      setErrorMsg(null);
    } catch (err: any) {
      setErrorMsg(err?.message || "Erreur lors de l'enregistrement du profil utilisateur.");
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!isAdmin) return;
    const target = users.find((u) => u.id === id);
    if (!target) return;

    if (isUserAdmin(target)) {
      alert("Action refusée : Impossible de supprimer un compte possédant le rôle Administrateur.");
      return;
    }

    if (window.confirm(`Confirmez-vous la suppression du compte opérateur "${target.displayName}" ?`)) {
      const ok = await deleteUser(id);
      if (ok) {
        await logAuditEvent("user_delete", "user", `Suppression de l'utilisateur : ${target.displayName}`);
        await loadUsersList();
      } else {
        alert("Impossible de supprimer cet utilisateur.");
      }
    }
  };

  const handleSwitchUser = async (user: UserRecord) => {
    // Seul l'administrateur peut basculer sur un autre compte
    if (!isAdmin) return;

    setActiveUser(user);
    setActiveUserState(user);
    onUserChanged?.(user);
    const roleListStr = (user.roles && user.roles.length > 0) ? user.roles.join(", ") : user.role;
    logAuditEvent("auth_login", "security", `Basculement vers l'utilisateur : ${user.displayName} (${roleListStr})`);
    onClose();
  };

  return (
    <div className="account-modal-overlay" role="dialog" aria-modal="true" style={{ zIndex: 9999 }}>
      <div className="user-manager-card">
        {/* En-tête */}
        <div className="user-manager-header">
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div className="user-manager-icon-badge">
              <Users size={20} />
            </div>
            <div>
              <h2 className="account-modal-title" style={{ margin: 0, fontSize: "15.5px", fontWeight: 700 }}>
                {isAdmin ? "Gestion des Opérateurs & Droits d'Accès" : "Mon Profil Utilisateur"}
              </h2>
              <span className="account-modal-subtitle" style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px", display: "block" }}>
                {isAdmin
                  ? `Connecté en tant que ${effectiveUser?.displayName} (${((effectiveUser?.roles && effectiveUser?.roles.length > 0) ? effectiveUser.roles.map(r => ROLE_CONFIG[r]?.label).join(" · ") : ROLE_CONFIG[effectiveUser?.role || "operator"]?.label)})`
                  : `Connecté en tant que ${effectiveUser?.displayName}`}
              </span>
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Fermer">
            <X size={18} />
          </button>
        </div>

        {/* Corps */}
        <div className="user-manager-body">
          {errorMsg && (
            <div className="app-toast toast-warning" style={{ position: "relative", marginBottom: "16px" }}>
              <AlertCircle size={15} />
              <span>{errorMsg}</span>
            </div>
          )}

          {!isEditing ? (
            <>
              {/* Barre d'outils avec bouton nouvel opérateur harmonisé */}
              <div className="user-manager-toolbar">
                <div className="user-count-badge">
                  <Users size={15} />
                  <span>
                    {isAdmin
                      ? `Comptes opérateurs enregistrés (${users.length})`
                      : "Votre profil opérateur"}
                  </span>
                </div>

                {isAdmin && (
                  <button
                    type="button"
                    className="btn-action-luxury-green btn-print-main"
                    onClick={handleStartCreate}
                    title="Créer un nouveau compte utilisateur ou opérateur"
                  >
                    <UserPlus size={16} />
                    <span>Nouvel opérateur</span>
                  </button>
                )}
              </div>

              {/* Liste des utilisateurs visibles */}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {visibleUsers.map((u) => {
                  const isActive = (effectiveUser?.id === u.id);
                  const userRolesList = (u.roles && u.roles.length > 0) ? u.roles : [u.role || "operator"];

                  return (
                    <div
                      key={u.id}
                      className={`user-list-card ${isActive ? "active-session" : ""}`}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
                        <div className="user-card-avatar-wrapper">
                          <div className="user-card-avatar">
                            {getInitials(u.displayName)}
                          </div>
                          {isActive && <div className="user-card-online-dot" title="Session actuellement active" />}
                        </div>

                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginBottom: "3px" }}>
                            <span className="user-card-name">
                              {u.displayName}
                            </span>
                            {userRolesList.map((r) => {
                              const cfg = ROLE_CONFIG[r] || ROLE_CONFIG.operator;
                              return (
                                <span
                                  key={r}
                                  className={`user-role-badge-pill role-${r}`}
                                  title={cfg.desc}
                                >
                                  {cfg.icon}
                                  <span>{cfg.label}</span>
                                </span>
                              );
                            })}
                            {isActive && (
                              <span className="active-session-pill">
                                <Check size={11} strokeWidth={3} />
                                <span>Session active</span>
                              </span>
                            )}
                          </div>

                          <div style={{ fontSize: "11.5px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "6px" }}>
                            <span>Identifiant :</span>
                            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-secondary)" }}>
                              {u.username}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                        {/* Seul l'admin peut basculer sur un autre compte */}
                        {isAdmin && !isActive && (
                          <button
                            type="button"
                            className="btn-user-activate"
                            onClick={() => handleSwitchUser(u)}
                            title="Basculer vers cet utilisateur pour la session"
                          >
                            <UserCheck size={13} />
                            <span>Activer</span>
                          </button>
                        )}

                        {/* Modification : permis pour l'admin (sur tous) et pour l'utilisateur sur son propre compte */}
                        <button
                          type="button"
                          className="btn-user-icon-action"
                          onClick={() => handleStartEdit(u)}
                          title={isAdmin ? "Modifier les informations et rôles" : "Modifier mes informations ou code"}
                        >
                          <Edit2 size={13} />
                        </button>

                        {/* Suppression : réservé à l'administrateur et strictement interdit pour tout compte administrateur */}
                        {isAdmin && !isUserAdmin(u) && (
                          <button
                            type="button"
                            className="btn-user-icon-action delete-danger"
                            onClick={() => handleDeleteUser(u.id)}
                            title="Supprimer cet opérateur"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            /* Formulaire d'ajout / modification */
            <form onSubmit={handleSaveUser}>
              <div className="user-form-card-title">
                {editingUserId ? "Modifier le compte opérateur" : "Ajouter un nouvel opérateur"}
              </div>
              <div className="user-form-card-desc">
                {editingUserId
                  ? "Mettez à jour les informations, rôles cumulatifs ou le code secret de cet opérateur."
                  : "Renseignez les coordonnées et affectez les rôles d'habilitation pour cet utilisateur."}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "16px" }}>
                <div>
                  <label className="user-form-label">
                    Nom d'affichage (Opérateur) <span style={{ color: "var(--gold-dark)" }}>*</span> :
                  </label>
                  <input
                    type="text"
                    required
                    className="user-form-input"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Ex: Mohamed Benali"
                  />
                </div>

                <div>
                  <label className="user-form-label">
                    Identifiant de connexion <span style={{ color: "var(--gold-dark)" }}>*</span> :
                  </label>
                  <input
                    type="text"
                    required
                    className="user-form-input"
                    value={username}
                    disabled={!isAdmin && !!editingUserId}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Ex: m.benali"
                  />
                </div>
              </div>

              {/* Rôles Multiples : sélectionnable par un Administrateur */}
              <div style={{ marginBottom: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <label className="user-form-label" style={{ marginBottom: 0 }}>
                    Habilitations & Rôles cumulatifs :
                  </label>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    {isAdmin ? "Sélectionnez un ou plusieurs rôles cumulés" : "Attribution gérée par l'administrateur"}
                  </span>
                </div>

                <div className="roles-selector-grid">
                  {(Object.keys(ROLE_CONFIG) as UserRole[]).map((r) => {
                    const cfg = ROLE_CONFIG[r];
                    const isChecked = selectedRoles.includes(r);

                    return (
                      <div
                        key={r}
                        className={`role-select-box ${isChecked ? `selected role-${r}` : ""}`}
                        onClick={() => handleToggleRole(r)}
                        style={{
                          opacity: !isAdmin ? 0.65 : 1,
                          cursor: isAdmin ? "pointer" : "not-allowed"
                        }}
                      >
                        <div
                          className="role-box-icon"
                          style={{
                            background: isChecked ? `${cfg.color}15` : "var(--bg-secondary)",
                            color: isChecked ? cfg.color : "var(--text-muted)"
                          }}
                        >
                          {cfg.icon}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "4px" }}>
                            <span className="role-box-title" style={{ color: isChecked ? cfg.color : "var(--text-primary)" }}>
                              {cfg.label}
                            </span>
                            {isChecked && (
                              <Check size={13} strokeWidth={3} style={{ color: cfg.color, flexShrink: 0 }} />
                            )}
                          </div>
                          <p className="role-box-desc">{cfg.desc}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {!isAdmin && (
                  <small style={{ fontSize: "10.5px", color: "var(--text-muted)", marginTop: "6px", display: "block" }}>
                    Seul un administrateur peut modifier l'attribution des rôles d'accès.
                  </small>
                )}
              </div>

              <div style={{ marginBottom: "20px" }}>
                <label className="user-form-label">
                  Code d'accès / PIN secret :
                </label>
                <input
                  type="password"
                  className="user-form-input"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder={editingUserId ? "Laisser vide pour conserver le code actuel" : "Ex: 4 à 8 chiffres ou mot de passe"}
                />
                <span style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px", display: "block" }}>
                  {editingUserId
                    ? "Laissez vide si vous ne souhaitez pas modifier le code secret existant."
                    : "Code de sécurité requis pour déverrouiller ou confirmer les opérations sensibles."}
                </span>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", paddingTop: "10px", borderTop: "1px solid var(--border-color)" }}>
                <button
                  type="button"
                  className="btn-action-card"
                  onClick={() => setIsEditing(false)}
                  style={{ padding: "8px 16px", fontSize: "12.5px" }}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="btn-action-luxury-green"
                  style={{ padding: "8px 20px", fontSize: "12.5px", minWidth: "120px" }}
                >
                  Enregistrer
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
