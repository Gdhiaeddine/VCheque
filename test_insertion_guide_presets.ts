import {
  RECOMMENDED_INSERTION_PRESETS,
  guidePresetToPrintSettings,
  upsertPrinterPreset,
  loadPrinterPresets,
  type InsertionGuidePreset
} from "./src/services/printerPresets";
import { calculateChequePosition } from "./src/components/PrintModal";
import type { PrintSettings } from "./src/types";

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
  console.log("=== TESTS MODULE : GUIDE D'INSERTION & 4 PRESETS RECOMMANDÉS ===\n");

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

  // TEST 1 : Vérification des 4 Presets Recommandés Spécifiés par l'Utilisateur
  console.log("--- TEST 1 : Intégrité des 4 Préréglages Recommandés ---");
  assert(RECOMMENDED_INSERTION_PRESETS.length === 4, "Exactement 4 préréglages recommandés définis");

  const p1 = RECOMMENDED_INSERTION_PRESETS.find(p => p.shortName.includes("Haut Centre 90°"));
  assert(Boolean(p1), "Présence du preset 'Haut Centre 90°'");
  assert(p1?.placement === "top-center" && p1?.rotation === 90, "Haut Centre 90° : placement=top-center, rotation=90°");
  assert(p1?.paperFormat === "a4-portrait", "Haut Centre 90° : format papier=a4-portrait");

  const p2 = RECOMMENDED_INSERTION_PRESETS.find(p => p.shortName.includes("Haut Centre 270°"));
  assert(Boolean(p2), "Présence du preset 'Haut Centre 270°'");
  assert(p2?.placement === "top-center" && p2?.rotation === 270, "Haut Centre 270° : placement=top-center, rotation=270°");

  const p3 = RECOMMENDED_INSERTION_PRESETS.find(p => p.shortName.includes("Bas Centre 270°"));
  assert(Boolean(p3), "Présence du preset 'Bas Centre 270°'");
  assert(p3?.placement === "bottom-center" && p3?.rotation === 270, "Bas Centre 270° : placement=bottom-center, rotation=270°");

  const p4 = RECOMMENDED_INSERTION_PRESETS.find(p => p.shortName.includes("Haut Gauche 270°"));
  assert(Boolean(p4), "Présence du preset 'Haut Gauche 270°'");
  assert(p4?.placement === "top-left" && p4?.rotation === 270, "Haut Gauche 270° : placement=top-left, rotation=270°");

  // TEST 2 : Conversion Guide Preset vers PrintSettings
  console.log("\n--- TEST 2 : Conversion GuidePreset -> PrintSettings ---");
  for (const preset of RECOMMENDED_INSERTION_PRESETS) {
    const settings = guidePresetToPrintSettings(preset);
    assert(settings.paperFormat === preset.paperFormat, `${preset.name} : paperFormat converti`);
    assert(settings.placement === preset.placement, `${preset.name} : placement converti`);
    assert(settings.rotation === preset.rotation, `${preset.name} : rotation ${preset.rotation}° convertie`);
    assert(settings.offsetX === 0 && settings.offsetY === 0, `${preset.name} : offsets initiaux à 0mm`);
  }

  // TEST 3 : Calcul Géométrique de Positionnement A4 (Feuille 210 x 297, Chèque 175 x 80)
  console.log("\n--- TEST 3 : Calcul Géométrique des Emplacements Physiques ---");
  const a4W = 210;
  const a4H = 297;
  const chkW = 175;
  const chkH = 80;

  // Preset 1 : Haut Centre 90°
  const pos1 = calculateChequePosition(a4W, a4H, chkW, chkH, "top-center", 0, 0, 90);
  assert(pos1.left === 65, "Haut Centre 90° : centré horizontalement à left=65mm ((210-80)/2)");
  assert(pos1.top === 0, "Haut Centre 90° : calé en haut à top=0mm");
  assert(pos1.effW === 80 && pos1.effH === 175, "Haut Centre 90° : dimensions effectives 80 × 175 mm");
  assert(pos1.left + pos1.effW <= a4W, "Haut Centre 90° : ne dépasse pas de la feuille horizontalement");
  assert(pos1.top + pos1.effH <= a4H, "Haut Centre 90° : ne dépasse pas de la feuille verticalement");

  // Preset 2 : Haut Centre 270°
  const pos2 = calculateChequePosition(a4W, a4H, chkW, chkH, "top-center", 0, 0, 270);
  assert(pos2.left === 65, "Haut Centre 270° : centré horizontalement à left=65mm");
  assert(pos2.top === 0, "Haut Centre 270° : calé en haut à top=0mm");
  assert(pos2.effW === 80 && pos2.effH === 175, "Haut Centre 270° : dimensions effectives 80 × 175 mm");

  // Preset 3 : Bas Centre 270°
  const pos3 = calculateChequePosition(a4W, a4H, chkW, chkH, "bottom-center", 0, 0, 270);
  assert(pos3.left === 65, "Bas Centre 270° : centré horizontalement à left=65mm");
  assert(pos3.top === 122, "Bas Centre 270° : calé en bas à top=122mm (297-175)");
  assert(pos3.top + pos3.effH === a4H, "Bas Centre 270° : aligné exactement contre le bord inférieur");

  // Preset 4 : Haut Gauche 270°
  const pos4 = calculateChequePosition(a4W, a4H, chkW, chkH, "top-left", 0, 0, 270);
  assert(pos4.left === 0, "Haut Gauche 270° : plaqué contre le bord gauche à left=0mm");
  assert(pos4.top === 0, "Haut Gauche 270° : calé en haut à top=0mm");

  // TEST 4 : Persistance et Création d'un Profil Utilisateur à partir d'un Preset du Guide
  console.log("\n--- TEST 4 : Sauvegarde d'un Preset du Guide dans les Profils ---");
  localStorage.clear();
  const settingsP1 = guidePresetToPrintSettings(p1!);
  const { presets: updatedList, savedPreset } = upsertPrinterPreset({
    name: "Mon HP LaserJet (Haut Centre 90°)",
    ...settingsP1,
    isDefault: true,
    notes: "Créé depuis le guide d'insertion"
  });

  assert(updatedList.some(p => p.id === savedPreset.id), "Preset du guide enregistré avec succès dans les profils utilisateur");
  assert(savedPreset.placement === "top-center", "Placement persisté dans le profil");
  assert(savedPreset.rotation === 90, "Rotation 90° persistée dans le profil");
  assert(savedPreset.isDefault === true, "Défini comme profil par défaut");

  console.log(`\n========================================`);
  console.log(`RÉSULTAT FINAL : ${passCount} tests réussis, ${failCount} échecs.`);
  console.log(`========================================`);

  if (failCount > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error("Erreur fatale:", err);
  process.exit(1);
});
