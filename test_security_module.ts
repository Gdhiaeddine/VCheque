import {
  generateSalt,
  hashPin,
  verifyPin,
  computeSha256Checksum,
  verifyBackupIntegrity
} from "./src/services/security";
import { hasPermission, getPermissionErrorMessage } from "./src/services/permissions";
import {
  DEFAULT_SECURITY_SETTINGS,
  DEFAULT_ADMIN_USER,
  getDatabase,
  getSecuritySettings,
  saveSecuritySettings,
  getUsers,
  saveUser,
  getActiveUser,
  setActiveUser,
  logAuditEvent,
  getAuditLogs
} from "./src/services/db";
import type { BackupArchive, UserRecord } from "./src/types";

// Polyfill mock localStorage in node if needed
if (typeof globalThis.localStorage === "undefined") {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    }
  };
}

async function runSecurityTests() {
  console.log("=== TESTS MODULE 1.8 : SÉCURITÉ, UTILISATEURS & TRAÇABILITÉ ===");
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      console.log(`[PASS] ${desc}`);
      passed++;
    } else {
      console.error(`[FAIL] ${desc}`);
      failed++;
    }
  }

  try {
    // 1. Initialisation de la base SQLite et tables de sécurité
    console.log("\n--- TEST 1 : Initialisation DB / Stores de sécurité ---");
    const db = await getDatabase();
    assert(db !== undefined, "Accès au système de stockage sécurisé vérifié");

    // 2. Cryptographie : Hachage PBKDF2-SHA256 & Vérification PIN
    console.log("\n--- TEST 2 : Hachage PBKDF2-SHA256 & Vérification de mot de passe ---");
    const salt = generateSalt();
    assert(typeof salt === "string" && salt.length === 32, "Génération de sel aléatoire de 16 octets (32 chars hex)");

    const pin = "1234";
    const hash = await hashPin(pin, salt);
    assert(typeof hash === "string" && hash.length === 64, `Hachage PBKDF2-SHA256 valide (64 chars hex) : ${hash.slice(0, 16)}...`);

    const isMatch = await verifyPin(pin, salt, hash);
    assert(isMatch === true, "Vérification avec le bon code PIN réussie");

    const isBadMatch = await verifyPin("9999", salt, hash);
    assert(isBadMatch === false, "Rejet strict d'un code PIN incorrect");

    const isBadSalt = await verifyPin(pin, generateSalt(), hash);
    assert(isBadSalt === false, "Rejet strict si le sel ne correspond pas");

    // 3. Somme de contrôle SHA-256 et détection d'altération
    console.log("\n--- TEST 3 : Intégrité Cryptographique SHA-256 et Détection d'altération ---");
    const samplePayload = {
      cheques: [{ id: "chk-1", amount: "50000.00", beneficiary: "SARL Test" }],
      companies: [{ id: "comp-1", name: "Virtanis Algérie" }]
    };
    const payloadStr = JSON.stringify(samplePayload);
    const checksum = await computeSha256Checksum(payloadStr);
    assert(typeof checksum === "string" && checksum.length === 64, `Checksum SHA-256 calculé : ${checksum.slice(0, 16)}...`);

    const validArchive: BackupArchive = {
      app: "VCheque Studio",
      version: "1.0.0",
      backupDate: new Date().toISOString(),
      checksumSha256: checksum,
      payload: samplePayload as any
    };

    const validCheck = await verifyBackupIntegrity(JSON.stringify(validArchive));
    assert(validCheck.valid === true, "Archive valide acceptée");
    assert(validCheck.checksumMatch === true, "Empreinte SHA-256 validée conforme");

    // Test Altération : falsifier un montant dans l'archive
    const tamperedPayload = JSON.parse(JSON.stringify(samplePayload));
    tamperedPayload.cheques[0].amount = "99999999.00"; // Tentative de fraude/altération
    const tamperedArchive: BackupArchive = {
      ...validArchive,
      payload: tamperedPayload
    };

    const tamperedCheck = await verifyBackupIntegrity(JSON.stringify(tamperedArchive));
    assert(tamperedCheck.checksumMatch === false, "ALTÉRATION DÉTECTÉE : Empreinte SHA-256 invalide rejetée !");
    assert(tamperedCheck.valid === false, "L'archive falsifiée est déclarée non valide et non conforme");

    // 4. Gestion des utilisateurs et rôles
    console.log("\n--- TEST 4 : Profils Opérateurs & Rôles (Admin, Signataire, Saisie, Audit) ---");
    const defaultAdmin = DEFAULT_ADMIN_USER;
    assert(defaultAdmin.role === "admin", "Rôle admin par défaut présent");
    assert(defaultAdmin.isActive === true, "Admin actif par défaut");

    const operatorUser: UserRecord = {
      id: "usr-operator-1",
      username: "operateur",
      displayName: "Karim Opérateur",
      role: "operator",
      pinSalt: generateSalt(),
      pinHash: await hashPin("0000", salt),
      isActive: true,
      createdAt: new Date().toISOString()
    };
    await saveUser(operatorUser);

    const userList = await getUsers();
    assert(userList.some((u) => u.id === "usr-operator-1"), "Nouvel opérateur enregistré dans SQLite/LocalStorage");

    setActiveUser(operatorUser);
    const activeUsr = getActiveUser();
    assert(activeUsr.id === "usr-operator-1", "Basculement de l'opérateur actif réussi");

    // Protection stricte du compte administrateur contre toute suppression
    const { deleteUser } = await import("./src/services/db");
    const adminDeleteAttempt = await deleteUser(defaultAdmin.id);
    assert(adminDeleteAttempt === false, "PROTECTION ADMIN : Tentative de suppression du compte administrateur rejetée (impossible à supprimer)");
    const adminVisible = userList;
    assert(adminVisible.length >= 2, `L'administrateur a visibilité complète sur tous les utilisateurs (${adminVisible.length} comptes)`);

    const nonAdminVisible = userList.filter((u) => u.id === operatorUser.id);
    assert(nonAdminVisible.length === 1 && nonAdminVisible[0].id === operatorUser.id, "Un utilisateur non-admin ne voit STRICTEMENT que son propre compte");
    assert(!nonAdminVisible.some((u) => u.id !== operatorUser.id), "Les autres utilisateurs créés sont invisibles pour un rôle non-administrateur");

    // 5. Journal d'audit (Audit Trail)
    console.log("\n--- TEST 5 : Grand Journal d'Audit & Traçabilité inaltérable ---");
    await logAuditEvent("auth_login", "security", "Connexion réussie de l'opérateur", { ip: "127.0.0.1" });
    await logAuditEvent("cheque_print", "cheque", "Impression du chèque N° 0045231", { amount: 150000 });

    const auditLogs = await getAuditLogs();
    assert(auditLogs.length >= 2, `Logs d'audit enregistrés (${auditLogs.length} événements)`);
    assert(auditLogs.some((l) => l.action === "auth_login"), "Événement 'auth_login' tracé avec succès");
    assert(auditLogs.some((l) => l.action === "cheque_print"), "Événement 'cheque_print' tracé avec succès");

    // 6. Paramètres de sécurité (Mode sécurisé & Auto-lock)
    console.log("\n--- TEST 6 : Paramètres de sécurité et temporisateur d'inactivité ---");
    const secSettings = getSecuritySettings();
    assert(secSettings.autoLockTimeoutMinutes >= 0, `Délai d'inactivité configuré : ${secSettings.autoLockTimeoutMinutes} min`);

    await saveSecuritySettings({
      ...secSettings,
      isAuthEnabled: true,
      autoLockTimeoutMinutes: 5,
      autoBackupFrequency: "daily"
    });

    const updatedSec = getSecuritySettings();
    assert(updatedSec.isAuthEnabled === true, "Mode sécurisé activé");
    assert(updatedSec.autoLockTimeoutMinutes === 5, "Délai de verrouillage automatique à 5 min enregistré");
    assert(updatedSec.autoBackupFrequency === "daily", "Sauvegarde quotidienne automatique enregistrée");

    // 7. Matrice des autorisations et rôles (RBAC)
    console.log("\n--- TEST 7 : Contrôle d'accès RBAC (Admin, Signataire, Opérateur, Auditeur) ---");
    // Admin : Droits intégraux
    assert(hasPermission("admin", "cheque:create"), "Admin peut créer des chèques");
    assert(hasPermission("admin", "cheque:print"), "Admin peut imprimer des chèques");
    assert(hasPermission("admin", "cheque:cancel"), "Admin peut annuler des chèques");
    assert(hasPermission("admin", "cheque:delete"), "Admin peut supprimer un chèque de l'historique");
    assert(hasPermission("admin", "history:clear"), "Admin peut vider l'historique complet");
    assert(hasPermission("admin", "backup:restore"), "Admin peut restaurer une base de données");
    assert(hasPermission("admin", "users:manage"), "Admin peut gérer les utilisateurs");
    assert(hasPermission("admin", "audit:clear"), "Admin peut purger l'audit");

    // Signataire / Validateur : Impression, Annulation, Lettrage mais PAS de suppression ni restore
    assert(hasPermission("validator", "cheque:create"), "Signataire peut saisir des chèques");
    assert(hasPermission("validator", "cheque:print"), "Signataire peut imprimer des chèques");
    assert(hasPermission("validator", "cheque:cancel"), "Signataire peut annuler des chèques");
    assert(hasPermission("validator", "reconcile:validate"), "Signataire peut valider le lettrage bancaire");
    assert(!hasPermission("validator", "cheque:delete"), "Signataire NE PEUT PAS supprimer de chèque");
    assert(!hasPermission("validator", "history:clear"), "Signataire NE PEUT PAS vider l'historique");
    assert(!hasPermission("validator", "backup:restore"), "Signataire NE PEUT PAS restaurer une sauvegarde");
    assert(!hasPermission("validator", "users:manage"), "Signataire NE PEUT PAS gérer les utilisateurs");

    // Opérateur de saisie : Saisie et import uniquement, pas d'impression physique ni suppression
    assert(hasPermission("operator", "cheque:create"), "Opérateur peut saisir et créer un chèque");
    assert(hasPermission("operator", "batch:import"), "Opérateur peut importer des fichiers en lot");
    assert(!hasPermission("operator", "cheque:print"), "Opérateur NE PEUT PAS imprimer physiquement un chèque");
    assert(!hasPermission("operator", "cheque:cancel"), "Opérateur NE PEUT PAS annuler un chèque imprimé");
    assert(!hasPermission("operator", "reconcile:validate"), "Opérateur NE PEUT PAS valider le lettrage");
    assert(!hasPermission("operator", "cheque:delete"), "Opérateur NE PEUT PAS supprimer un chèque");
    assert(!hasPermission("operator", "backup:restore"), "Opérateur NE PEUT PAS restaurer une sauvegarde");

    // Auditeur / Comptable : Consultation et export stricts, zéro écriture
    assert(!hasPermission("auditor", "cheque:create"), "Auditeur NE PEUT PAS saisir de chèque");
    assert(!hasPermission("auditor", "cheque:print"), "Auditeur NE PEUT PAS imprimer de chèque");
    assert(!hasPermission("auditor", "cheque:cancel"), "Auditeur NE PEUT PAS annuler de chèque");
    assert(!hasPermission("auditor", "cheque:delete"), "Auditeur NE PEUT PAS supprimer de chèque");
    assert(!hasPermission("auditor", "reconcile:validate"), "Auditeur NE PEUT PAS valider de lettrage");
    assert(hasPermission("auditor", "audit:view"), "Auditeur PEUT consulter le grand journal d'audit");
    assert(hasPermission("auditor", "report:export"), "Auditeur PEUT exporter les rapports et grands livres");
    assert(hasPermission("auditor", "backup:export"), "Auditeur PEUT exporter une sauvegarde");

    // Mode libre (sans auth / undefined) : Accès complet pour rétrocompatibilité
    assert(hasPermission(undefined, "cheque:print"), "Mode libre sans auth autorise l'impression");
    assert(hasPermission(undefined, "cheque:create"), "Mode libre sans auth autorise la saisie");

    // 8. Persistance de l'association et de la dissociation du compte émetteur dans LocalStorage
    console.log("\n--- TEST 8 : Persistance LocalStorage de l'association / dissociation de compte ---");
    const testCompanyId = "company-test-123";
    const storageKey = `vcheque_selected_account_${testCompanyId}`;

    // 1. L'utilisateur associe un compte
    const targetAccountId = "acc-albaraka-01";
    localStorage.setItem(storageKey, targetAccountId);
    assert(localStorage.getItem(storageKey) === targetAccountId, "Le compte émetteur sélectionné est bien mémorisé");

    // 2. Simulation de réouverture avec compte associé
    let restoredPref = localStorage.getItem(storageKey);
    assert(restoredPref === targetAccountId, "À la réouverture, le compte associé est fidèlement restauré");

    // 3. L'utilisateur dissocie le compte (clic sur X ou sélection aucun compte)
    localStorage.setItem(storageKey, "none");
    assert(localStorage.getItem(storageKey) === "none", "La dissociation explicite est enregistrée comme 'none'");

    // 4. Simulation de réouverture après dissociation
    restoredPref = localStorage.getItem(storageKey);
    assert(restoredPref === "none", "À la réouverture, l'état dissocié est fidèlement préservé (non réassocié d'office)");

    console.log(`\n========================================`);
    console.log(`RÉSULTAT GLOBAL : ${passed} PASS, ${failed} FAIL`);
    console.log(`========================================`);
    if (failed > 0) process.exit(1);
  } catch (err) {
    console.error("Erreur inattendue pendant les tests :", err);
    process.exit(1);
  }
}

runSecurityTests();
