import type { UserRole, UserRecord } from "../types";

export type AppAction =
  | "cheque:create"        // Saisir / Enregistrer un chèque brouillon
  | "cheque:edit"          // Modifier un chèque
  | "cheque:print"         // Lancer l'impression physique officielle d'un chèque
  | "cheque:cancel"        // Annuler un chèque déjà imprimé
  | "cheque:delete"        // Supprimer définitivement un chèque de l'historique
  | "history:clear"        // Vider l'historique complet
  | "reconcile:validate"   // Valider un lettrage / rapprochement ou marquer encaissé
  | "reconcile:match"      // Lier manuellement des écritures
  | "batch:import"         // Importer des bordereaux Excel/CSV
  | "batch:print"          // Lancer l'impression en lot
  | "backup:export"        // Exporter une archive certifiée (.vcbk)
  | "backup:restore"       // Restaurer une sauvegarde (écraser/fusionner)
  | "users:manage"         // Gérer les comptes utilisateurs et rôles
  | "audit:view"           // Consulter le journal d'audit
  | "audit:clear"          // Purger le journal d'audit
  | "settings:edit"        // Modifier les préférences système
  | "report:export";       // Exporter les états comptables (Excel, PDF, CSV)

/**
 * Extrait la liste des rôles normalisés à partir d'un utilisateur, d'un rôle unique ou d'un tableau de rôles
 */
export function getUserRoles(target?: UserRecord | UserRole | UserRole[] | null): UserRole[] {
  if (!target) return [];
  if (typeof target === "string") return [target];
  if (Array.isArray(target)) return target;
  if (target.roles && target.roles.length > 0) return target.roles;
  if (target.role) return [target.role];
  return [];
}

/**
 * Vérifie si un utilisateur ou une liste de rôles détient les privilèges Administrateur
 */
export function isUserAdmin(target?: UserRecord | UserRole | UserRole[] | null): boolean {
  if (!target) return true; // Sans authentification = mode libre administrateur
  return getUserRoles(target).includes("admin");
}

/**
 * Évalue une permission pour un rôle individuel donné
 */
function checkSingleRolePermission(role: UserRole, action: AppAction): boolean {
  if (role === "admin") return true;

  switch (action) {
    case "cheque:create":
    case "cheque:edit":
      return role === "operator" || role === "validator";

    case "cheque:print":
    case "cheque:cancel":
    case "batch:print":
      return role === "validator";

    case "cheque:delete":
    case "history:clear":
    case "backup:restore":
    case "users:manage":
    case "audit:clear":
      return false; // Réservé strictement à l'Administrateur

    case "reconcile:validate":
    case "reconcile:match":
      return role === "validator";

    case "batch:import":
      return role === "operator" || role === "validator";

    case "backup:export":
    case "report:export":
      return true;

    case "audit:view":
      return role === "validator" || role === "auditor";

    case "settings:edit":
      return role === "validator";

    default:
      return false;
  }
}

/**
 * Matrice de contrôle d'accès basée sur les rôles (RBAC) avec support multi-rôles cumulatifs.
 * Si l'utilisateur possède plusieurs rôles, ses permissions correspondent à l'union de tous ses rôles.
 */
export function hasPermission(
  target: UserRecord | UserRole | UserRole[] | undefined | null,
  action: AppAction
): boolean {
  // Par défaut sans authentification : tous les droits sont accordés
  if (!target) return true;

  const roles = getUserRoles(target);
  // Si non défini ou admin présent parmi les rôles : tous les droits accordés
  if (roles.length === 0 || roles.includes("admin")) return true;

  // L'action est autorisée si AU MOINS UN des rôles assignés l'autorise (Union)
  return roles.some((r) => checkSingleRolePermission(r, action));
}

/**
 * Retourne le message d'erreur standardisé en cas de refus d'autorisation
 */
export function getPermissionErrorMessage(action: AppAction): string {
  switch (action) {
    case "cheque:create":
    case "cheque:edit":
      return "Accès restreint : Votre profil (Auditeur) dispose d'un accès en lecture seule. La saisie de chèques est réservée aux opérateurs et signataires.";

    case "cheque:print":
    case "batch:print":
      return "Autorisation requise : L'impression physique définitive et la signature de chèques sont réservées aux profils Signataire / Validateur et Administrateur.";

    case "cheque:cancel":
      return "Autorisation requise : L'annulation officielle d'un chèque est réservée aux profils Signataire / Validateur et Administrateur.";

    case "cheque:delete":
    case "history:clear":
      return "Action non autorisée : La suppression définitive de chèques de l'historique est strictement réservée au profil Administrateur.";

    case "reconcile:validate":
    case "reconcile:match":
      return "Autorisation requise : La validation des rapprochements et le passage au statut Encaissé sont réservés aux profils Signataire / Validateur et Administrateur.";

    case "batch:import":
      return "Accès restreint : L'importation de bordereaux en lot est réservée aux opérateurs et validateurs.";

    case "backup:restore":
      return "Privilège administrateur requis : La restauration de la base de données est réservée exclusivement au profil Administrateur.";

    case "users:manage":
      return "Privilège administrateur requis : La gestion des comptes utilisateurs et l'attribution des rôles sont réservées à l'Administrateur.";

    case "audit:view":
      return "Accès restreint : La consultation du grand journal d'audit est réservée aux auditeurs, signataires et administrateurs.";

    case "settings:edit":
      return "Accès restreint : La modification des paramètres généraux est réservée aux administrateurs et signataires.";

    default:
      return "Action non autorisée pour votre profil utilisateur.";
  }
}
