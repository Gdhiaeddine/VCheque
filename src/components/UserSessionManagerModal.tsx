import React, { useState, useEffect } from "react";
import {
  Users,
  UserPlus,
  Shield,
  KeyRound,
  Trash2,
  CheckCircle2,
  X,
  AlertCircle,
  Edit2,
  Lock,
  ShieldAlert,
  Info
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

interface UserSessionManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: UserRecord | null;
  onUserChanged?: (user: UserRecord) => void;
}

const ROLE_LABELS: Record<UserRole, { label: string; desc: string; color: string }> = {
  admin: { label: "Administrateur", desc: "Accès intégral, gestion des comptes et sauvegardes", color: "#DC2626" },
  validator: { label: "Signataire / Validateur", desc: "Émission, impression, lettrage et annulation de chèques", color: "#D97706" },
  operator: { label: "Opérateur de saisie", desc: "Saisie de chèques et pièces jointes uniquement", color: "#2563EB" },
  auditor: { label: "Auditeur / Comptable", desc: "Consultation, grand livre et exports en lecture seule", color: "#059669" }
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

  // Form states
  const [username, setUsername] = useState<string>("");
  const [displayName, setDisplayName] = useState<string>("");
  const [role, setRole] = useState<UserRole>("operator");
  const [pin, setPin] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const effectiveUser = currentUser || activeUser || getActiveUser();
  const isAdmin = effectiveUser?.role === "admin";

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
    setRole("operator");
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
    setRole(user.role);
    setPin("");
    setErrorMsg(null);
    setIsEditing(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !displayName.trim()) {
      setErrorMsg("Veuillez renseigner le nom d'utilisateur et le nom affiché.");
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

      // Si l'utilisateur actuel n'est pas admin, il ne peut pas modifier son propre rôle
      const finalRole: UserRole = isAdmin
        ? role
        : (users.find((u) => u.id === editingUserId)?.role || effectiveUser?.role || "operator");

      const userRecord: UserRecord = {
        id: editingUserId || `user-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        username: username.trim().toLowerCase(),
        displayName: displayName.trim(),
        role: finalRole,
        pinHash,
        pinSalt,
        isActive: true,
        createdAt: editingUserId
          ? users.find((u) => u.id === editingUserId)?.createdAt || new Date().toISOString()
          : new Date().toISOString()
      };

      await saveUser(userRecord);
      await loadUsersList();

      if (editingUserId === effectiveUser?.id) {
        setActiveUser(userRecord);
        onUserChanged?.(userRecord);
      }

      setIsEditing(false);
    } catch (err: any) {
      setErrorMsg(err.message || "Erreur lors de la sauvegarde de l'utilisateur.");
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!isAdmin) return;
    const target = users.find((u) => u.id === id);
    if (target?.role === "admin") {
      alert("Impossible de supprimer un compte administrateur.");
      return;
    }
    if (window.confirm(`Êtes-vous sûr de vouloir supprimer l'opérateur "${target?.displayName || "cet utilisateur"}" ?`)) {
      const ok = await deleteUser(id);
      if (!ok) {
        alert("Impossible de supprimer cet utilisateur.");
      } else {
        await loadUsersList();
      }
    }
  };

  const handleSwitchUser = (user: UserRecord) => {
    // Seul l'administrateur peut basculer sur un autre utilisateur
    if (!isAdmin && user.id !== effectiveUser?.id) return;

    setActiveUser(user);
    setActiveUserState(user);
    onUserChanged?.(user);
    logAuditEvent("auth_login", "security", `Basculement vers l'utilisateur : ${user.displayName} (${user.role})`);
  };

  return (
    <div className="account-modal-overlay" role="dialog" aria-modal="true">
      <div className="account-modal-content" style={{ maxWidth: "680px" }}>
        {/* Header */}
        <div className="account-modal-header" style={{ padding: "16px 22px", borderBottom: "1px solid var(--border-color)" }}>
          <div className="account-modal-title-row">
            <div className="account-modal-icon-badge">
              <Users size={20} className="text-gold" />
            </div>
            <div>
              <h2 style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                {isAdmin ? "Gestion des Opérateurs & Droits d'Accès" : "Mon Profil Utilisateur"}
              </h2>
              <p style={{ fontSize: "12px", color: "var(--text-secondary)", margin: "2px 0 0 0" }}>
                {isAdmin
                  ? "Gestion des comptes, attribution des 4 rôles et basculement de session"
                  : `Connecté en tant que ${effectiveUser?.displayName} (${effectiveUser?.role})`}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="account-modal-close"
            onClick={onClose}
            title="Fermer"
            style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-muted)" }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Corps */}
        <div style={{ padding: "20px 22px", maxHeight: "70vh", overflowY: "auto" }}>
          {!isEditing ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 600 }}>
                  {isAdmin
                    ? `Comptes opérateurs enregistrés (${users.length})`
                    : "Votre compte actif"}
                </span>

                {isAdmin && (
                  <button
                    type="button"
                    className="btn-action-luxury-green"
                    onClick={handleStartCreate}
                    style={{ padding: "6px 12px", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" }}
                  >
                    <UserPlus size={14} />
                    <span>Nouvel opérateur</span>
                  </button>
                )}
              </div>

              {/* Liste des utilisateurs visibles (tous pour Admin, uniquement soi-même pour les autres) */}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {visibleUsers.map((u) => {
                  const isActive = (effectiveUser?.id === u.id);
                  const roleConfig = ROLE_LABELS[u.role] || ROLE_LABELS.operator;

                  return (
                    <div
                      key={u.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "12px 14px",
                        background: isActive ? "#F0FDF4" : "#FFF",
                        border: isActive ? "1.5px solid #BBF7D0" : "1px solid var(--border-color)",
                        borderRadius: "8px"
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <div
                          style={{
                            width: "36px",
                            height: "36px",
                            borderRadius: "50%",
                            background: "var(--bg-secondary)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: roleConfig.color
                          }}
                        >
                          <Shield size={18} />
                        </div>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <strong style={{ fontSize: "13px", color: "var(--text-primary)" }}>
                              {u.displayName}
                            </strong>
                            <span
                              style={{
                                fontSize: "10.5px",
                                fontWeight: 700,
                                padding: "1px 6px",
                                borderRadius: "4px",
                                background: "var(--bg-secondary)",
                                color: roleConfig.color
                              }}
                            >
                              {roleConfig.label}
                            </span>
                            {isActive && (
                              <span style={{ fontSize: "10.5px", padding: "1px 6px", borderRadius: "99px", background: "#DCFCE7", color: "#166534", fontWeight: 700 }}>
                                Session active
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                            Identifiant : <span style={{ fontFamily: "var(--font-mono)" }}>{u.username}</span> · {roleConfig.desc}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        {/* Seul l'admin peut basculer sur un autre compte */}
                        {isAdmin && !isActive && (
                          <button
                            type="button"
                            className="btn-action-card"
                            onClick={() => handleSwitchUser(u)}
                            style={{ padding: "4px 10px", fontSize: "11.5px" }}
                            title="Basculer vers cet utilisateur pour la session"
                          >
                            Activer
                          </button>
                        )}

                        {/* Modification : permis pour l'admin (sur tous) et pour l'utilisateur sur son propre compte */}
                        <button
                          type="button"
                          className="btn-action-card"
                          onClick={() => handleStartEdit(u)}
                          style={{ padding: "4px 8px" }}
                          title={isAdmin ? "Modifier les informations" : "Modifier mon mot de passe ou nom"}
                        >
                          <Edit2 size={13} />
                        </button>

                        {/* Suppression : réservé à l'administrateur et strictement interdit/masqué pour tout compte administrateur */}
                        {isAdmin && u.role !== "admin" && (
                          <button
                            type="button"
                            className="btn-action-card"
                            onClick={() => handleDeleteUser(u.id)}
                            style={{ padding: "4px 8px", color: "#DC2626" }}
                            title="Supprimer cet utilisateur"
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
              {errorMsg && (
                <div style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", borderRadius: "6px", padding: "8px 12px", marginBottom: "14px", color: "#B91C1C", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
                  <AlertCircle size={15} />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                <div>
                  <label style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                    Nom affiché (ex: Nom & Prénom) :
                  </label>
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Ex: Mohamed Benali"
                    style={{ width: "100%", padding: "7px 10px", borderRadius: "6px", border: "1px solid var(--border-color)", fontSize: "12.5px" }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                    Identifiant de connexion :
                  </label>
                  <input
                    type="text"
                    required
                    value={username}
                    disabled={!isAdmin && !!editingUserId}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Ex: m.benali"
                    style={{
                      width: "100%",
                      padding: "7px 10px",
                      borderRadius: "6px",
                      border: "1px solid var(--border-color)",
                      fontSize: "12.5px",
                      backgroundColor: !isAdmin && !!editingUserId ? "var(--bg-secondary)" : "#FFF",
                      cursor: !isAdmin && !!editingUserId ? "not-allowed" : "text"
                    }}
                  />
                </div>
              </div>

              {/* Rôle : sélectionnable uniquement par un Administrateur */}
              <div style={{ marginBottom: "12px" }}>
                <label style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                  Rôle & Niveau de permissions :
                </label>
                <select
                  value={role}
                  disabled={!isAdmin}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  style={{
                    width: "100%",
                    padding: "7px 10px",
                    borderRadius: "6px",
                    border: "1px solid var(--border-color)",
                    fontSize: "12.5px",
                    background: !isAdmin ? "var(--bg-secondary)" : "#FFF",
                    cursor: !isAdmin ? "not-allowed" : "pointer"
                  }}
                >
                  <option value="admin">Administrateur (Gestion complète, comptes, sauvegardes)</option>
                  <option value="validator">Signataire / Validateur (Émission, impression, lettrage)</option>
                  <option value="operator">Opérateur de saisie (Rédaction et justificatifs seuls)</option>
                  <option value="auditor">Auditeur / Comptable (Grand livre & exports seuls)</option>
                </select>
                {!isAdmin && (
                  <small style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "3px", display: "block" }}>
                    Seul un administrateur peut modifier l'attribution des rôles.
                  </small>
                )}
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                  Code d'accès / PIN :
                </label>
                <input
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder={editingUserId ? "Laisser vide pour conserver le code actuel" : "Ex: 4 à 8 chiffres ou mot de passe"}
                  style={{ width: "100%", padding: "7px 10px", borderRadius: "6px", border: "1px solid var(--border-color)", fontSize: "12.5px" }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                <button
                  type="button"
                  className="btn-action-card"
                  onClick={() => setIsEditing(false)}
                  style={{ padding: "6px 14px", fontSize: "12px" }}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="btn-action-luxury-green"
                  style={{ padding: "6px 16px", fontSize: "12px" }}
                >
                  Enregistrer
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 22px", borderTop: "1px solid var(--border-color)", display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            className="btn-modal-cancel"
            onClick={onClose}
            style={{ padding: "6px 16px", fontSize: "12px" }}
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
