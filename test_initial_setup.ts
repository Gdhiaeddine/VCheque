import {
  isSetupCompleted,
  markSetupCompleted,
  resetSetupCompleted,
  applyInitialSetup,
  SETUP_COMPLETED_KEY,
  CUSTOM_DATA_DIR_KEY
} from "./src/services/setupConfig";
import {
  getCompanies,
  getActiveCompany,
  getUsers,
  getActiveUser,
  getAuditLogs,
  getSecuritySettings,
  saveCompanyRecord,
  saveUser
} from "./src/services/db";
import { verifyPin } from "./src/services/security";

// Polyfill minimal localStorage & crypto pour environnement node/tsx
if (typeof globalThis.localStorage === "undefined") {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] || null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); }
  };
}

async function runTests() {
  console.log("=== TESTS MODULE : ASSISTANT D'INITIALISATION & PREMIER DÉMARRAGE ===\n");

  let passCount = 0;
  let failCount = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      passCount++;
    } else {
      console.error(`[FAIL] ${message}`);
      failCount++;
    }
  }

  // TEST 1 : Vérification initiale d'état vierge
  console.log("--- TEST 1 : Détection d'état initial vierge ---");
  resetSetupCompleted();
  assert(isSetupCompleted() === false, "L'état initial est bien détecté comme non configuré (!isSetupCompleted)");

  // TEST 2 : Application du flux d'initialisation complet
  console.log("\n--- TEST 2 : Exécution de applyInitialSetup() ---");
  const testPayload = {
    dataDir: "D:\\VChequeData\\Compta",
    defaultPlace: "Oran",
    autoBackupEnabled: true,
    company: {
      name: "SARL Al-Djazair Commerciale",
      legalForm: "SARL",
      nif: "000116001234567",
      rc: "16/00-0123456B16",
      nis: "12345678901234",
      articleImposition: "16012345678",
      address: "15 Boulevard de l'ALN, Oran",
      phone: "041 23 45 67",
      email: "contact@aldjazair.dz",
      bank: {
        bankName: "Banque Al Salam",
        accountNumber: "001 00123 1234567890 12",
        templateId: "el-salam"
      }
    },
    admin: {
      displayName: "Ahmed Benali (Directeur)",
      username: "admin.principal",
      pin: "2026",
      requirePinOnStartup: true
    }
  };

  const setupResult = await applyInitialSetup(testPayload);

  assert(isSetupCompleted() === true, "L'assistant a marqué le setup comme complété");
  assert(setupResult.company.name === "SARL Al-Djazair Commerciale", "La société est correctement créée");
  assert(setupResult.company.legalForm === "SARL", "La forme juridique est conforme");
  assert(setupResult.company.nif === "000116001234567", "Le NIF algérien est enregistré");
  assert(setupResult.admin.displayName === "Ahmed Benali (Directeur)", "Le nom de l'administrateur est enregistré");
  assert(setupResult.admin.username === "admin.principal", "L'identifiant est enregistré en minuscules");
  assert(setupResult.admin.role === "admin", "Le rôle principal est bien 'admin'");
  assert(Boolean(setupResult.admin.roles?.includes("admin")), "Le tableau des rôles contient 'admin'");

  // TEST 3 : Validation du hachage sécurisé du PIN de l'administrateur
  console.log("\n--- TEST 3 : Sécurité Cryptographique du PIN de l'Administrateur ---");
  assert(Boolean(setupResult.admin.pinHash && setupResult.admin.pinHash.length === 64), "Le PIN est haché en PBKDF2-SHA256 (64 caractères)");
  assert(Boolean(setupResult.admin.pinSalt && setupResult.admin.pinSalt.length === 32), "Un sel aléatoire de 16 octets (32 chars) a été généré");

  const isGoodPin = await verifyPin("2026", setupResult.admin.pinSalt!, setupResult.admin.pinHash!);
  assert(isGoodPin === true, "Le code PIN '2026' est validé par verifyPin()");

  const isWrongPin = await verifyPin("0000", setupResult.admin.pinSalt!, setupResult.admin.pinHash!);
  assert(isWrongPin === false, "Un mauvais code PIN '0000' est strictement rejeté");

  // TEST 4 : Activation de l'entreprise et de la session
  console.log("\n--- TEST 4 : Session active et Entreprise active ---");
  const activeCompany = await getActiveCompany();
  assert(activeCompany?.name === "SARL Al-Djazair Commerciale", "L'entreprise active est la nouvelle entreprise créée");

  const activeUser = getActiveUser();
  assert(activeUser.username === "admin.principal", "L'administrateur actif est bien l'admin créé lors du setup");

  const sec = getSecuritySettings();
  assert(sec.isAuthEnabled === true, "L'authentification par code PIN au démarrage est activée");
  assert(sec.autoBackupEnabled === true, "Les sauvegardes automatiques sont activées");

  // TEST 5 : Grand Journal d'Audit inaltérable
  console.log("\n--- TEST 5 : Traçabilité inaltérable de l'initialisation ---");
  const auditLogs = await getAuditLogs();
  const initEvent = auditLogs.find(l => l.action === "system_init");
  assert(Boolean(initEvent), "L'événement 'system_init' a été enregistré dans le journal d'audit");
  assert(Boolean(initEvent?.description.includes("SARL Al-Djazair Commerciale")), "La description de l'audit mentionne l'entreprise créée");

  // RÉSULTAT FINAL
  console.log("\n========================================");
  console.log(`RÉSULTAT GLOBAL : ${passCount} PASS, ${failCount} FAIL`);
  console.log("========================================");

  if (failCount > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error("Erreur d'exécution des tests:", err);
  process.exit(1);
});
