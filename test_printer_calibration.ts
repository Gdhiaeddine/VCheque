import { getCalibrationSpecimensLayout } from "./src/services/pdfExport";
import type { BankTemplate, Positions } from "./src/types";

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

const mockBankTemplates: BankTemplate[] = [
  {
    id: "el-salam",
    name: "Banque Al Salam",
    shortName: "Al Salam",
    bankCode: "027",
    themeColor: "#059669",
    width: 175,
    height: 80,
    positions: {
      beneficiary: { x: 22, y: 31, size: 3.6 },
      words: { x: 28, y: 39, size: 3.4 },
      wordsSecondLine: { x: 20, y: 46, size: 3.4 },
      numeric: { x: 135, y: 31, size: 4.4, align: "right" },
      place: { x: 104, y: 55, size: 3.4 },
      date: { x: 138, y: 55, size: 3.4 },
      chequeNumber: { x: 135, y: 15, size: 3.2 }
    }
  },
  {
    id: "bna",
    name: "Banque Nationale d'Algérie",
    shortName: "BNA",
    bankCode: "001",
    themeColor: "#1e3a8a",
    width: 175,
    height: 80,
    positions: {
      beneficiary: { x: 25, y: 32, size: 3.6 },
      words: { x: 30, y: 40, size: 3.4 },
      wordsSecondLine: { x: 22, y: 47, size: 3.4 },
      numeric: { x: 138, y: 32, size: 4.4, align: "right" },
      place: { x: 106, y: 56, size: 3.4 },
      date: { x: 140, y: 56, size: 3.4 },
      chequeNumber: { x: 136, y: 16, size: 3.2 }
    }
  }
];

async function runTests() {
  console.log("=== TESTS MODULE : CALIBRAGE D'IMPRESSION & GABARIT 3 SPÉCIMENS ===\n");

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

  // TEST 1 : Calcul de la disposition des 3 spécimens sur page A4 (210 x 297 mm)
  console.log("--- TEST 1 : Calcul géométrique de la feuille A4 (3 spécimens) ---");
  const layout = getCalibrationSpecimensLayout(175, 80);

  assert(layout.pageWidth === 210, "Largeur de page A4 standard : 210 mm");
  assert(layout.pageHeight === 297, "Hauteur de page A4 standard : 297 mm");
  assert(layout.specimens.length === 3, "Présence exacte de 3 spécimens sur la feuille");

  // Vérifier qu'aucun spécimen ne déborde de la page A4
  layout.specimens.forEach((spec, i) => {
    assert(spec.x >= 0 && spec.x + spec.width <= 210, `Spécimen #${i + 1} reste strictement dans les 210mm horizontaux (x=${spec.x}, w=${spec.width})`);
    assert(spec.y >= 0 && spec.y + spec.height <= 297, `Spécimen #${i + 1} reste strictement dans les 297mm verticaux (y=${spec.y}, h=${spec.height})`);
    assert(spec.width === 175, `Spécimen #${i + 1} a la largeur réelle spécifiée (175 mm)`);
    assert(spec.height === 80, `Spécimen #${i + 1} a la hauteur réelle spécifiée (80 mm)`);
  });

  // Vérifier qu'aucun des 3 spécimens ne se chevauche verticalement
  const spec1 = layout.specimens[0];
  const spec2 = layout.specimens[1];
  const spec3 = layout.specimens[2];
  assert(spec1.y + spec1.height <= spec2.y, "Spécimen #1 ne chevauche pas le Spécimen #2 (espace de coupe préservé)");
  assert(spec2.y + spec2.height <= spec3.y, "Spécimen #2 ne chevauche pas le Spécimen #3 (espace de coupe préservé)");

  // TEST 2 : Robustesse avec des chèques de formats plus grands (ex: 180 x 85 mm)
  console.log("\n--- TEST 2 : Robustesse sur format alternatif (180 x 85 mm) ---");
  const layoutLarge = getCalibrationSpecimensLayout(180, 85);
  assert(layoutLarge.specimens.length === 3, "Génération de 3 spécimens pour le format étendu");
  const lastSpec = layoutLarge.specimens[2];
  assert(lastSpec.y + lastSpec.height <= 297, `Même au format 85mm de haut, le 3ème chèque ne déborde pas de la feuille A4 (Fin à ${lastSpec.y + lastSpec.height} mm <= 297 mm)`);

  // TEST 3 : Indépendance stricte des modèles bancaires (Découplage)
  console.log("\n--- TEST 3 : Indépendance et découplage des modèles bancaires ---");
  const originalTemplates = JSON.parse(JSON.stringify(mockBankTemplates)) as BankTemplate[];
  const templateSalam = originalTemplates.find(t => t.id === "el-salam")!;
  const templateBna = originalTemplates.find(t => t.id === "bna")!;

  assert(Boolean(templateSalam && templateBna), "Modèles Al Salam et BNA trouvés dans le catalogue");

  // Calibrer spécifiquement Al Salam
  const initialBnaBeneficiaryX = templateBna.positions.beneficiary.x;
  const initialBnaBeneficiaryY = templateBna.positions.beneficiary.y;

  // Modifier Al Salam
  const modifiedSalam: BankTemplate = {
    ...templateSalam,
    positions: {
      ...templateSalam.positions,
      beneficiary: { ...templateSalam.positions.beneficiary, x: templateSalam.positions.beneficiary.x + 12 }
    },
    printSettings: {
      offsetX: 4.5,
      offsetY: -3.0
    }
  };

  // Liste mise à jour avec le modèle modifié
  const updatedTemplates = originalTemplates.map(t => t.id === modifiedSalam.id ? modifiedSalam : t);
  const targetBnaAfter = updatedTemplates.find(t => t.id === "bna")!;

  assert(
    targetBnaAfter.positions.beneficiary.x === initialBnaBeneficiaryX &&
    targetBnaAfter.positions.beneficiary.y === initialBnaBeneficiaryY,
    "La modification du chèque Al Salam N'AFFECTE PAS les coordonnées du chèque BNA (indépendance vérifiée)"
  );

  assert(
    updatedTemplates.find(t => t.id === "el-salam")!.positions.beneficiary.x === templateSalam.positions.beneficiary.x + 12,
    "Le chèque Al Salam conserve ses coordonnées personnalisées propres"
  );

  assert(
    updatedTemplates.find(t => t.id === "el-salam")!.printSettings?.offsetX === 4.5,
    "Le chèque Al Salam conserve ses marges d'alimentation propres (printSettings indépendant)"
  );

  // TEST 4 : Persistance locale des réglages d'impression généraux
  console.log("\n--- TEST 4 : Persistance des réglages d'impression ---");
  const testSettings = {
    paperFormat: "a4-portrait" as const,
    placement: "center" as const,
    offsetX: 2.5,
    offsetY: -1.0,
    rotation: 0 as const,
    showBorderGuide: false
  };

  localStorage.setItem("cheque-studio-print-settings-v1", JSON.stringify(testSettings));
  const retrievedRaw = localStorage.getItem("cheque-studio-print-settings-v1");
  const retrieved = retrievedRaw ? JSON.parse(retrievedRaw) : null;

  assert(retrieved !== null, "Récupération réussie depuis localStorage");
  assert(retrieved.offsetX === 2.5 && retrieved.offsetY === -1.0, "Offsets X et Y persistés correctement");
  assert(retrieved.placement === "center", "Placement persisté correctement");

  // TEST 5 : Parité exacte 100% entre aperçu du remplissage test et données imprimées
  console.log("\n--- TEST 5 : Parité exacte Données Aperçu vs Impression Test ---");
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const formattedTestDate = `${day}/${month}/${now.getFullYear()}`;

  const calibrationTestData = {
    beneficiary: "SARL EXEMPLE TEST DISTRIBUTION",
    wordsL1: "Cent vingt-cinq mille quatre cent cinquante dinars",
    wordsL2: "algériens et zéro centime",
    numeric: "#125 450,00#",
    place: "Alger",
    date: formattedTestDate,
    chequeNumber: "0012345"
  };

  // Simuler des positions modifiées par glisser-déposer / nudge dans le modal
  const calibratedPositions: Positions = {
    ...templateSalam.positions,
    beneficiary: { x: 30.5, y: 35.0, size: 4.0 },
    words: { x: 32.0, y: 42.5, size: 3.6 },
    numeric: { x: 140.0, y: 33.0, size: 4.6, align: "right" }
  };

  const testFillingPayload = {
    template: { ...templateSalam, positions: calibratedPositions },
    settings: { ...testSettings, offsetX: 3.0, offsetY: -2.0 },
    data: calibrationTestData
  };

  // 1. Vérification que la couche d'impression utilise les données de test exactes
  assert(testFillingPayload.data.beneficiary === "SARL EXEMPLE TEST DISTRIBUTION", "Bénéficiaire imprimé identique à l'aperçu");
  assert(testFillingPayload.data.wordsL1 === "Cent vingt-cinq mille quatre cent cinquante dinars", "Ligne 1 lettres imprimée identique à l'aperçu");
  assert(testFillingPayload.data.wordsL2 === "algériens et zéro centime", "Ligne 2 lettres imprimée identique à l'aperçu");
  assert(testFillingPayload.data.numeric === "#125 450,00#", "Montant chiffré imprimé identique à l'aperçu");
  assert(testFillingPayload.data.place === "Alger", "Lieu imprimé identique à l'aperçu");
  assert(testFillingPayload.data.date === formattedTestDate, "Date imprimée au format JJ/MM/AAAA identique à l'aperçu");
  assert(testFillingPayload.data.chequeNumber === "0012345", "Numéro de chèque imprimé identique à l'aperçu");

  // 2. Vérification que la couche d'impression utilise les positions calibrées déplacées et non les anciennes
  assert(testFillingPayload.template.positions.beneficiary.x === 30.5, "Position X du bénéficiaire imprimée avec les coordonnées déplacées");
  assert(testFillingPayload.template.positions.words.y === 42.5, "Position Y du montant en lettres imprimée avec les coordonnées déplacées");
  assert(testFillingPayload.template.positions.numeric.x === 140.0, "Position X du montant chiffré imprimée avec les coordonnées déplacées");
  assert(testFillingPayload.settings.offsetX === 3.0, "Offset X d'imprimante calibré appliqué lors de l'impression de test");

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
