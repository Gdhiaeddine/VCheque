import {
  loadPrinterPresets,
  savePrinterPresets,
  getActivePrinterPreset,
  upsertPrinterPreset,
  setDefaultPrinterPreset,
  deletePrinterPreset,
  presetToPrintSettings,
  createPresetFromSettings,
  PRINTER_PRESETS_KEY,
  LEGACY_PRINT_SETTINGS_KEY
} from "./src/services/printerPresets";
import type { PrinterPreset, PrintSettings } from "./src/types";

// Polyfill minimal localStorage pour node/tsx
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
  console.log("=== TESTS MODULE : PROFILS & PRÉRÉGLAGES D'IMPRIMANTE (PRINTER PRESETS) ===\n");

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

  // Nettoyage avant tests
  localStorage.clear();

  // TEST 1 : Chargement par défaut (Usine)
  console.log("--- TEST 1 : Chargement des profils d'usine par défaut ---");
  const initialPresets = loadPrinterPresets();
  assert(initialPresets.length >= 2, "Au moins 2 profils d'usine initialisés");
  assert(initialPresets.some(p => p.isDefault), "Un profil est marqué par défaut (isDefault)");
  const activeDefault = getActivePrinterPreset(initialPresets);
  assert(Boolean(activeDefault && activeDefault.isDefault), "getActivePrinterPreset renvoie le profil par défaut");

  // TEST 2 : Migration transparente depuis les anciens réglages legacy
  console.log("\n--- TEST 2 : Migration transparente depuis les anciens réglages ---");
  localStorage.clear();
  const legacySettings: PrintSettings = {
    paperFormat: "a4-portrait",
    placement: "top-center",
    offsetX: 4.5,
    offsetY: -2.0,
    rotation: 90,
    showBorderGuide: true
  };
  localStorage.setItem(LEGACY_PRINT_SETTINGS_KEY, JSON.stringify(legacySettings));

  const migratedPresets = loadPrinterPresets();
  const migratedDefault = getActivePrinterPreset(migratedPresets);
  assert(migratedDefault.offsetX === 4.5, "Offset X hérité de l'ancien réglage (4.5 mm)");
  assert(migratedDefault.offsetY === -2.0, "Offset Y hérité de l'ancien réglage (-2.0 mm)");
  assert(migratedDefault.placement === "top-center", "Placement hérité de l'ancien réglage (top-center)");
  assert(migratedDefault.rotation === 90, "Rotation héritée de l'ancien réglage (90°)");

  // TEST 3 : Création d'un nouveau profil d'imprimante (ex: HP LaserJet)
  console.log("\n--- TEST 3 : Création d'un nouveau profil d'imprimante ---");
  const hpSettings: PrintSettings = {
    paperFormat: "a4-portrait",
    placement: "top-center",
    offsetX: 6.0,
    offsetY: 1.5,
    rotation: 0,
    showBorderGuide: false
  };

  const { presets: afterHpAdded, savedPreset: hpPreset } = upsertPrinterPreset({
    name: "HP LaserJet Pro P1102 (Bac 1)",
    ...hpSettings,
    isDefault: true,
    notes: "Bac frontal supérieur"
  });

  assert(afterHpAdded.some(p => p.id === hpPreset.id), "Nouveau profil HP LaserJet présent dans la liste");
  assert(hpPreset.offsetX === 6.0 && hpPreset.offsetY === 1.5, "Offsets du profil HP enregistrés correctement");
  assert(hpPreset.isDefault === true, "Le profil HP est devenu le profil par défaut");

  const newActive = getActivePrinterPreset(afterHpAdded);
  assert(newActive.id === hpPreset.id, "getActivePrinterPreset renvoie bien le nouveau profil HP");
  const otherDefaults = afterHpAdded.filter(p => p.id !== hpPreset.id && p.isDefault);
  assert(otherDefaults.length === 0, "Les autres profils ne sont plus marqués par défaut");

  // TEST 4 : Création d'une 2ème imprimante (ex: Epson EcoTank)
  console.log("\n--- TEST 4 : Multi-profils et indépendance des réglages ---");
  const epsonSettings: PrintSettings = {
    paperFormat: "a4-landscape",
    placement: "center",
    offsetX: -3.0,
    offsetY: 0,
    rotation: 180,
    showBorderGuide: true
  };

  const { presets: afterEpsonAdded, savedPreset: epsonPreset } = upsertPrinterPreset({
    name: "Epson EcoTank L3150 (Bac Arrière)",
    ...epsonSettings,
    isDefault: false
  }, afterHpAdded);

  assert(afterEpsonAdded.length === afterHpAdded.length + 1, "Nombre de profils incrémenté (+1)");
  assert(epsonPreset.placement === "center" && epsonPreset.rotation === 180, "Paramètres spécifiques Epson enregistrés");
  assert(epsonPreset.isDefault === false, "Epson créé sans écraser le statut par défaut de HP");

  // Vérifier indépendance : HP a toujours ses offsets et placement
  const hpRetrieved = afterEpsonAdded.find(p => p.id === hpPreset.id)!;
  assert(hpRetrieved.offsetX === 6.0 && hpRetrieved.placement === "top-center", "Les réglages HP restent intacts après ajout d'Epson");

  // TEST 5 : Changement de profil par défaut
  console.log("\n--- TEST 5 : Changement de profil par défaut ---");
  const switchedPresets = setDefaultPrinterPreset(epsonPreset.id, afterEpsonAdded);
  const activeAfterSwitch = getActivePrinterPreset(switchedPresets);
  assert(activeAfterSwitch.id === epsonPreset.id, "Epson est désormais le profil par défaut");
  assert(switchedPresets.find(p => p.id === hpPreset.id)!.isDefault === false, "HP n'est plus par défaut");

  // TEST 6 : Modification d'un profil existant
  console.log("\n--- TEST 6 : Modification d'un profil existant ---");
  const { presets: afterUpdate, savedPreset: hpUpdated } = upsertPrinterPreset({
    id: hpPreset.id,
    name: "HP LaserJet Pro P1102 (Calibré)",
    offsetX: 8.5
  }, switchedPresets);

  assert(hpUpdated.name === "HP LaserJet Pro P1102 (Calibré)", "Nom du profil mis à jour");
  assert(hpUpdated.offsetX === 8.5, "Offset X du profil mis à jour à 8.5 mm");
  assert(hpUpdated.offsetY === 1.5, "Offset Y inchangé conservé (1.5 mm)");

  // TEST 7 : Sécurité de suppression (Suppression normale et protection dernier profil)
  console.log("\n--- TEST 7 : Suppression de profil et protection du dernier restant ---");
  const deleteResult1 = deletePrinterPreset(hpPreset.id, afterUpdate);
  assert(deleteResult1.success === true, "Suppression réussie du profil HP");
  assert(!deleteResult1.presets.some(p => p.id === hpPreset.id), "Le profil HP n'est plus dans la liste");

  // Supprimer jusqu'à ce qu'il n'en reste qu'un
  let currentList = deleteResult1.presets;
  while (currentList.length > 1) {
    const toDel = currentList[currentList.length - 1];
    currentList = deletePrinterPreset(toDel.id, currentList).presets;
  }
  assert(currentList.length === 1, "Il ne reste qu'un seul profil");
  const attemptDelLast = deletePrinterPreset(currentList[0].id, currentList);
  assert(attemptDelLast.success === false, "Impossibilité de supprimer le dernier profil (garde-fou actif)");
  assert(attemptDelLast.presets.length === 1, "Le dernier profil est conservé");

  // TEST 8 : Conversion Preset <-> PrintSettings
  console.log("\n--- TEST 8 : Conversion Preset vers PrintSettings ---");
  const convertedSettings = presetToPrintSettings(epsonPreset);
  assert(convertedSettings.paperFormat === "a4-landscape", "Format papier converti correctement");
  assert(convertedSettings.placement === "center", "Placement converti correctement");
  assert(convertedSettings.rotation === 180, "Rotation convertie correctement");
  assert(convertedSettings.offsetX === -3.0, "Offset X converti correctement");

  console.log(`\n========================================`);
  console.log(`RÉSULTAT FINAL : ${passCount} tests réussis, ${failCount} échecs.`);
  console.log(`========================================\n`);

  if (failCount > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error("Erreur exécution tests:", err);
  process.exit(1);
});
