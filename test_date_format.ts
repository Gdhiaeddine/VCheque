import { formatChequeDate, DATE_FORMAT_OPTIONS } from "./src/services/dateFormat";
import { DEFAULT_APP_SETTINGS, loadAppSettings, saveAppSettings, resetAppSettings } from "./src/services/appSettings";
import type { DateFormat } from "./src/types";

// Polyfill minimal localStorage pour environnement Node
if (typeof globalThis.localStorage === "undefined") {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] || null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); }
  };
}

function runTests() {
  console.log("=== TESTS MODULE : FORMATS DE DATE RÉGIONAUX & PARAMÈTRES ===\n");
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

  const testIsoDate = "2026-11-08";

  // TEST 1: Formats standards depuis ISO
  console.log("--- TEST 1 : Formatage depuis chaîne ISO (2026-11-08) ---");
  assert(formatChequeDate(testIsoDate, "DD/MM/YYYY") === "08/11/2026", "Format DD/MM/YYYY produit 08/11/2026");
  assert(formatChequeDate(testIsoDate, "DD.MM.YYYY") === "08.11.2026", "Format DD.MM.YYYY produit 08.11.2026");
  assert(formatChequeDate(testIsoDate, "DD-MM-YYYY") === "08-11-2026", "Format DD-MM-YYYY produit 08-11-2026");
  assert(formatChequeDate(testIsoDate, "DD_MONTH_YYYY") === "08 novembre 2026", "Format DD_MONTH_YYYY produit '08 novembre 2026'");
  assert(formatChequeDate(testIsoDate, "YYYY-MM-DD") === "2026-11-08", "Format YYYY-MM-DD produit 2026-11-08");

  // TEST 2: Format par défaut
  console.log("\n--- TEST 2 : Format par défaut en l'absence d'argument ---");
  assert(formatChequeDate(testIsoDate) === "08/11/2026", "Le format par défaut est DD/MM/YYYY");

  // TEST 3: Depuis un objet Date natif
  console.log("\n--- TEST 3 : Formatage depuis objet Date natif ---");
  const nativeDate = new Date(2026, 10, 8); // Mois 10 = novembre en JS (0-indexé)
  assert(formatChequeDate(nativeDate, "DD/MM/YYYY") === "08/11/2026", "Date native vers DD/MM/YYYY");
  assert(formatChequeDate(nativeDate, "DD_MONTH_YYYY") === "08 novembre 2026", "Date native vers DD_MONTH_YYYY");

  // TEST 4: Cas limites et entrées vides
  console.log("\n--- TEST 4 : Gestion des cas limites et valeurs vides ---");
  assert(formatChequeDate("") === "", "Chaîne vide renvoie chaîne vide");
  assert(formatChequeDate(undefined) === "", "Undefined renvoie chaîne vide");
  assert(formatChequeDate(null) === "", "Null renvoie chaîne vide");

  // TEST 5: Intégration AppSettings
  console.log("\n--- TEST 5 : Intégration AppSettings & Persistance ---");
  assert(DEFAULT_APP_SETTINGS.dateFormat === "DD/MM/YYYY", "DEFAULT_APP_SETTINGS a dateFormat='DD/MM/YYYY'");

  saveAppSettings({ ...DEFAULT_APP_SETTINGS, dateFormat: "DD_MONTH_YYYY" });
  const loaded = loadAppSettings();
  assert(loaded.dateFormat === "DD_MONTH_YYYY", "Sauvegarde et rechargement de dateFormat fonctionne");

  resetAppSettings();
  const resetLoaded = loadAppSettings();
  assert(resetLoaded.dateFormat === "DD/MM/YYYY", "Réinitialisation restaure le format par défaut");

  // TEST 6: Vérification du catalogue d'options
  console.log("\n--- TEST 6 : Options de l'interface ---");
  assert(DATE_FORMAT_OPTIONS.length === 5, "Exactement 5 options de date disponibles");
  assert(DATE_FORMAT_OPTIONS.some(o => o.id === "DD/MM/YYYY" && o.isRecommended), "DD/MM/YYYY est marqué comme recommandé");

  console.log(`\n========================================`);
  console.log(`RÉSULTAT FINAL : ${passCount} passés, ${failCount} échoués`);
  console.log(`========================================`);

  if (failCount > 0) process.exit(1);
}

runTests();
