import type { UserRole } from "../types";

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
 * Matrice de contrôle d'accès basée sur les rôles (RBAC)
 */
export function hasPermission(role: UserRole | undefined, action: AppAction): boolean {
  // Par défaut sans authentification ou si admin : tous les droits sont accordés
  if (!role || role === "admin") return true;

  switch (action) {
    case "cheque:create":
    case "cheque:edit":
      // Opérateurs et Signataires peuvent créer et modifier des chèques
      return role === "operator" || role === "validator";

    case "cheque:print":
    case "cheque:cancel":
    case "batch:print":
      // L'émission officielle, l'impression physique et l'annulation sont réservées au Signataire
      return role === "validator";

    case "cheque:delete":
    case "history:clear":
    case "backup:restore":
    case "users:manage":
    case "audit:clear":
      // Ces opérations destructives ou sensibles sont réservées exclusivement à l'Administrateur
      return false;

    case "reconcile:validate":
    case "reconcile:match":
      // La validation bancaire et le lettrage sont réservés au Signataire / Validateur
      return role === "validator";

    case "batch:import":
      // L'import et la préparation de bordereaux sont autorisés aux opérateurs et signataires
      return role === "operator" || role === "validator";

    case "backup:export":
    case "report:export":
      // Tous les rôles peuvent exporter une copie de données pour sauvegarde ou archivage
      return true;

    case "audit:view":
      // Consultation de l'audit autorisée aux Signataires et Auditeurs (ainsi qu'aux Admins)
      return role === "validator" || role === "auditor";

    case "settings:edit":
      // Modification des réglages de configuration : réservée aux Admins et Signataires
      return role === "validator";

    default:
      return false;
  }
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
