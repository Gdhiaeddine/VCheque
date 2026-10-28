import { jsPDF } from "jspdf";
import { invoke } from "@tauri-apps/api/core";
import type { BankTemplate, PrintSettings } from "../types";
import { splitWordsByLimit } from "../moneyToWords";
import { getPaperDimensions, calculateChequePosition } from "../components/PrintModal";

export interface ExportPdfOptions {
  mode: "exact-cheque" | "sheet"; // Format réel du chèque seul OU positionné sur la feuille (A4, etc.)
  template: BankTemplate;
  amount: string;
  formattedNumeric: string;
  words: string;
  beneficiary: string;
  place: string;
  date: string;
  isCrossed?: boolean;
  crossedWithText?: boolean;
  showChequeNumber?: boolean;
  chequeNumber?: string;
  printSettings?: PrintSettings;
  includeBackground?: boolean;
  filename?: string;
}

export interface ExportPdfResult {
  success: boolean;
  canceled?: boolean;
  filePath?: string;
  error?: string;
}

/**
 * Détecte si l'application s'exécute dans l'environnement desktop Tauri
 */
function isTauriEnvironment(): boolean {
  return typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__);
}

/**
 * Convertit des millimètres en points typographiques (1 mm = 2.83465 pt)
 */
function mmToPt(mm: number): number {
  return mm * 2.83465;
}

/**
 * Charge une URL d'image en DataURL base64 pour jsPDF
 */
async function loadImageDataUrl(src: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/jpeg", 0.95));
      } catch (e) {
        console.warn("Erreur conversion image en DataURL pour PDF:", e);
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * Nettoie une chaîne de caractères pour un nom de fichier système valide
 */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, "_")
    .substring(0, 60);
}

/**
 * Exporte un chèque vectoriel haute fidélité au format PDF
 * Fonctionne de manière transparente sous Tauri (avec boîte de dialogue native Enregistrer sous)
 * et sous navigateur web standard (téléchargement direct).
 */
export async function exportChequeToPdf(options: ExportPdfOptions): Promise<ExportPdfResult> {
  const {
    mode,
    template,
    amount,
    formattedNumeric,
    words,
    beneficiary,
    place,
    date,
    isCrossed = true,
    crossedWithText = true,
    showChequeNumber = false,
    chequeNumber,
    printSettings,
    includeBackground = false,
    filename
  } = options;

  let pageWidth: number;
  let pageHeight: number;
  let originX = 0;
  let originY = 0;
  let showCutGuide = false;

  if (mode === "sheet" && printSettings) {
    const paper = getPaperDimensions(
      printSettings.paperFormat,
      template.width,
      template.height
    );
    pageWidth = paper.width;
    pageHeight = paper.height;

    const pos = calculateChequePosition(
      paper.width,
      paper.height,
      template.width,
      template.height,
      printSettings.placement,
      printSettings.offsetX,
      printSettings.offsetY,
      printSettings.rotation
    );

    originX = pos.left;
    originY = pos.top;
    showCutGuide = printSettings.showBorderGuide;
  } else {
    // Mode exact-cheque (format 1:1 du chèque bancaire)
    pageWidth = template.width;
    pageHeight = template.height;
    originX = 0;
    originY = 0;
  }

  const orientation = pageWidth >= pageHeight ? "landscape" : "portrait";

  const doc = new jsPDF({
    orientation,
    unit: "mm",
    format: [pageWidth, pageHeight]
  });

  // 1. Fond bancaire officiel si demandé (mode spécimen / archivage)
  if (includeBackground && template.backgroundImage) {
    try {
      const bgData = await loadImageDataUrl(template.backgroundImage);
      if (bgData) {
        doc.addImage(bgData, "JPEG", originX, originY, template.width, template.height);
      }
    } catch (bgErr) {
      console.warn("Échec inclusion fond bancaire dans le PDF:", bgErr);
    }
  }

  // 2. Guide de découpe si demandé sur feuille
  if (showCutGuide && mode === "sheet") {
    doc.setDrawColor(140, 140, 140);
    doc.setLineWidth(0.3);
    doc.setLineDashPattern([2, 2], 0);
    doc.rect(originX, originY, template.width, template.height);
    doc.setLineDashPattern([], 0); // reset
  }

  // 3. Barres de chèque barré (//) dans le coin supérieur gauche
  if (isCrossed) {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.7);

    // Barre 1
    doc.line(originX, originY + 13.2, originX + 13.2, originY);
    // Barre 2
    doc.line(originX, originY + 22.2, originX + 22.2, originY);

    if (crossedWithText) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(5.5);
      doc.setTextColor(0, 0, 0);
      doc.text("NON ENDOSSABLE", originX + 8.8, originY + 8.8, {
        align: "center",
        baseline: "middle",
        angle: 45
      });
    }
  }

  // Configuration générale du texte imprimable
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);

  // 4. Bénéficiaire
  if (beneficiary && template.positions.beneficiary) {
    const pos = template.positions.beneficiary;
    doc.setFontSize(mmToPt(pos.size));
    doc.text(beneficiary, originX + pos.x, originY + pos.y, {
      align: pos.align || "left",
      baseline: "middle"
    });
  }

  // 5. Montant en toutes lettres (avec découpage automatique sur 2 lignes si nécessaire)
  const maxLineLen = template.wordsMaxLineLength || 55;
  const [wL1, wL2] = splitWordsByLimit(words, maxLineLen);

  if (wL1 && template.positions.words) {
    const pos = template.positions.words;
    doc.setFontSize(mmToPt(pos.size));
    doc.text(wL1, originX + pos.x, originY + pos.y, {
      align: pos.align || "left",
      baseline: "middle"
    });
  }

  if (wL2 && template.positions.wordsSecondLine) {
    const pos = template.positions.wordsSecondLine;
    doc.setFontSize(mmToPt(pos.size));
    doc.text(wL2, originX + pos.x, originY + pos.y, {
      align: pos.align || "left",
      baseline: "middle"
    });
  }

  // 6. Montant en chiffres (sécurisé avec alignement droite ou gauche)
  if (formattedNumeric && template.positions.numeric) {
    const pos = template.positions.numeric;
    doc.setFontSize(mmToPt(pos.size));
    doc.text(formattedNumeric, originX + pos.x, originY + pos.y, {
      align: pos.align || "right",
      baseline: "middle"
    });
  }

  // 7. Lieu
  if (place && template.positions.place) {
    const pos = template.positions.place;
    doc.setFontSize(mmToPt(pos.size));
    doc.text(place, originX + pos.x, originY + pos.y, {
      align: pos.align || "left",
      baseline: "middle"
    });
  }

  // 8. Date (Format JJ/MM/AAAA)
  if (date && template.positions.date) {
    const pos = template.positions.date;
    const formattedDate = date.includes("-") ? date.split("-").reverse().join("/") : date;
    doc.setFontSize(mmToPt(pos.size));
    doc.text(formattedDate, originX + pos.x, originY + pos.y, {
      align: pos.align || "left",
      baseline: "middle"
    });
  }

  // 8 bis. Numéro de chèque (si activé)
  if (showChequeNumber && chequeNumber && template.positions.chequeNumber) {
    const pos = template.positions.chequeNumber;
    doc.setFontSize(mmToPt(pos.size));
    doc.text(chequeNumber, originX + pos.x, originY + pos.y, {
      align: pos.align || "left",
      baseline: "middle"
    });
  }

  // 9. Construction du nom de fichier propre
  const safeBeneficiary = sanitizeFilename(beneficiary || "cheque");
  const safeAmount = (amount || "0").replace(/[^0-9.]/g, "");
  const defaultFilename = filename || `Cheque_${safeBeneficiary}_${safeAmount}DZD_${date || "export"}.pdf`;

  // 10. Sauvegarde native dans l'environnement Tauri (Windows / Linux / macOS)
  if (isTauriEnvironment()) {
    try {
      const arrayBuffer = doc.output("arraybuffer");
      const bytes = Array.from(new Uint8Array(arrayBuffer));

      const savedPath = await invoke<string | null>("save_pdf_dialog", {
        defaultFilename,
        bytes
      });

      if (savedPath) {
        return { success: true, filePath: savedPath, canceled: false };
      } else {
        // L'utilisateur a cliqué sur "Annuler" dans la boîte de dialogue de sauvegarde
        return { success: false, canceled: true };
      }
    } catch (tauriErr) {
      console.warn("Boîte de dialogue native Tauri échouée, tentative sauvegarde dans Téléchargements:", tauriErr);
      try {
        const arrayBuffer = doc.output("arraybuffer");
        const bytes = Array.from(new Uint8Array(arrayBuffer));
        const fallbackPath = await invoke<string>("save_pdf_to_downloads", {
          filename: defaultFilename,
          bytes
        });
        return { success: true, filePath: fallbackPath, canceled: false };
      } catch (fallbackErr) {
        console.error("Échec sauvegarde directe Tauri:", fallbackErr);
      }
    }
  }

  // 11. Fallback navigateur web standard (Blob + ancre de téléchargement)
  try {
    const blob = doc.output("blob");
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = defaultFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);
    return { success: true, canceled: false };
  } catch (blobErr) {
    console.warn("Téléchargement Blob échoué, tentative directe doc.save():", blobErr);
    doc.save(defaultFilename);
    return { success: true, canceled: false };
  }
}

export interface CalibrationSpecimenLayout {
  specimenIndex: number;
  label: string;
  x: number; // mm
  y: number; // mm
  width: number; // mm
  height: number; // mm
}

export interface CalibrationPageLayout {
  pageWidth: number;
  pageHeight: number;
  headerHeight: number;
  specimens: CalibrationSpecimenLayout[];
}

/**
 * Calcule l'agencement millimétrique exact des 3 spécimens sur une page A4
 */
export function getCalibrationSpecimensLayout(
  chequeWidth: number = 175,
  chequeHeight: number = 80
): CalibrationPageLayout {
  const pageWidth = 210;
  const pageHeight = 297;
  const safeChequeWidth = Math.min(chequeWidth || 175, 195);
  const safeChequeHeight = Math.min(chequeHeight || 80, 88);
  const left = (pageWidth - safeChequeWidth) / 2;

  const totalChequesHeight = 3 * safeChequeHeight;
  const remainingHeight = pageHeight - totalChequesHeight;
  const headerHeight = Math.max(14, Math.min(20, remainingHeight * 0.35));
  const gap = Math.max(4, (remainingHeight - headerHeight - 8) / 2);

  const specimens: CalibrationSpecimenLayout[] = [];
  for (let i = 0; i < 3; i++) {
    const top = headerHeight + i * (safeChequeHeight + gap);
    specimens.push({
      specimenIndex: i + 1,
      label: `Spécimen d'essai N° ${i + 1}`,
      x: Number(left.toFixed(2)),
      y: Number(top.toFixed(2)),
      width: Number(safeChequeWidth.toFixed(2)),
      height: Number(safeChequeHeight.toFixed(2))
    });
  }

  return {
    pageWidth,
    pageHeight,
    headerHeight,
    specimens
  };
}

/**
 * Génère une feuille A4 vectorielle avec 3 spécimens de chèques aux dimensions réelles,
 * avec l'image réelle de chèque choisie, règles millimétriques de haute précision et repères de découpe ✂️.
 */
export async function generateCalibrationSheetPdf(
  template: BankTemplate,
  includeBackground: boolean = true,
  filename?: string
): Promise<ExportPdfResult> {
  const defaultFilename = filename || `Gabarit_Calibrage_3_Cheques_${sanitizeFilename(template.shortName || template.name)}.pdf`;

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4" // 210 x 297 mm
  });

  const layout = getCalibrationSpecimensLayout(template.width, template.height);

  // Pré-chargement de l'image officielle du chèque
  let bgDataUrl: string | null = null;
  if (includeBackground && template.backgroundImage) {
    try {
      bgDataUrl = await loadImageDataUrl(template.backgroundImage);
    } catch (e) {
      console.warn("Erreur chargement image de fond chèque pour gabarit:", e);
    }
  }

  // 1. En-tête de la page A4 avec consignes
  doc.setFillColor(243, 244, 246);
  doc.rect(10, 4, 190, 11, "F");
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.rect(10, 4, 190, 11, "S");

  doc.setTextColor(17, 24, 39);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text(`VCHEQUE STUDIO - GABARIT D'IMPRESSION TEST : 3 SPÉCIMENS ${template.name.toUpperCase()}`, 105, 8, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(75, 85, 99);
  doc.text(
    "IMPORTANT : Imprimez à 100% (Taille réelle). Ne pas ajuster à la page. Découpez les 3 spécimens le long des pointillés ✂ pour vos tests.",
    105,
    12.5,
    { align: "center" }
  );

  // 2. Dessin des 3 spécimens
  layout.specimens.forEach((spec) => {
    const { x, y, width: w, height: h, specimenIndex } = spec;

    // A. Dessiner l'image officielle du chèque si disponible
    if (bgDataUrl) {
      try {
        doc.addImage(bgDataUrl, "JPEG", x, y, w, h);
      } catch {
        doc.setFillColor(252, 252, 253);
        doc.rect(x + 0.3, y + 0.3, w - 0.6, h - 0.6, "F");
      }
    } else {
      doc.setFillColor(252, 252, 253);
      doc.rect(x + 0.3, y + 0.3, w - 0.6, h - 0.6, "F");
    }

    // B. Ligne de découpe en pointillés extérieure
    doc.setDrawColor(120, 120, 120);
    doc.setLineDashPattern([2, 1.5], 0);
    doc.setLineWidth(0.35);
    doc.rect(x, y, w, h);
    doc.setLineDashPattern([], 0); // Réinitialiser le style de trait plein

    // C. Mention ciseaux sur le bord supérieur
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6);
    doc.setTextColor(80, 80, 80);
    doc.text(`[ ✂ Spécimen d'essai N° ${specimenIndex} — Découper le long des pointillés (${w} × ${h} mm) ]`, x + w / 2, y - 1, { align: "center" });

    // D. Règle millimétrique horizontale (bord supérieur : 0 à w mm)
    doc.setDrawColor(120, 120, 120);
    doc.setLineWidth(0.25);
    doc.line(x, y + 4.5, x + w, y + 4.5);

    for (let mm = 0; mm <= Math.floor(w); mm += 1) {
      const posX = x + mm;
      let tickH = 1;
      if (mm % 10 === 0) {
        tickH = 3;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(4.5);
        doc.setTextColor(60, 60, 60);
        if (mm > 0 && mm < Math.floor(w)) {
          doc.text(String(mm), posX, y + 4 - 0.5, { align: "center" });
        }
      } else if (mm % 5 === 0) {
        tickH = 2;
      }
      doc.line(posX, y + 4.5, posX, y + 4.5 - tickH);
    }

    // E. Règle millimétrique verticale (bord gauche : 0 à h mm)
    doc.line(x + 4.5, y, x + 4.5, y + h);
    for (let mm = 0; mm <= Math.floor(h); mm += 1) {
      const posY = y + mm;
      let tickW = 1;
      if (mm % 10 === 0) {
        tickW = 3;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(4.5);
        doc.setTextColor(60, 60, 60);
        if (mm > 0 && mm < Math.floor(h)) {
          doc.text(String(mm), x + 4 - 0.5, posY + 1.2, { align: "right" });
        }
      } else if (mm % 5 === 0) {
        tickW = 2;
      }
      doc.line(x + 4.5, posY, x + 4.5 - tickW, posY);
    }

    // F. Badge du spécimen (en filigrane au centre si fond présent)
    if (!bgDataUrl) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(30, 58, 138); // Bleu Virtanis
      doc.text(
        `SPÉCIMEN D'ESSAI N° ${specimenIndex} — ${template.name.toUpperCase()} (${w} × ${h} mm)`,
        x + 12,
        y + 9
      );

      doc.setFont("helvetica", "normal");
      doc.setFontSize(5.5);
      doc.setTextColor(107, 114, 128);
      doc.text("Gabarit officiel d'alignement pour imprimante - Valeur juridique nulle", x + 12, y + 12.5);

      // Tracé des zones indicatives uniquement si pas d'image de chèque réelle
      const pos = template.positions;
      doc.setDrawColor(210, 215, 225);
      doc.setLineWidth(0.25);
      doc.setFontSize(5);
      doc.setTextColor(140, 145, 155);
      doc.text("Zone Bénéficiaire (À l'ordre de) :", x + pos.beneficiary.x, y + pos.beneficiary.y - 1.5);
      doc.line(x + pos.beneficiary.x, y + pos.beneficiary.y + 0.5, x + Math.min(w - 10, pos.beneficiary.x + 85), y + pos.beneficiary.y + 0.5);

      doc.text("Zone Montant en lettres (L1) :", x + pos.words.x, y + pos.words.y - 1.5);
      doc.line(x + pos.words.x, y + pos.words.y + 0.5, x + Math.min(w - 10, pos.words.x + 95), y + pos.words.y + 0.5);

      doc.text("Zone Montant en lettres (L2) :", x + pos.wordsSecondLine.x, y + pos.wordsSecondLine.y - 1.5);
      doc.line(x + pos.wordsSecondLine.x, y + pos.wordsSecondLine.y + 0.5, x + Math.min(w - 10, pos.wordsSecondLine.x + 95), y + pos.wordsSecondLine.y + 0.5);

      doc.text("Montant chiffré :", x + pos.numeric.x - 22, y + pos.numeric.y - 4);
      doc.rect(x + pos.numeric.x - 24, y + pos.numeric.y - 3, 26, 7);

      doc.text("Fait à :", x + pos.place.x - 6, y + pos.place.y);
      doc.line(x + pos.place.x, y + pos.place.y + 0.5, x + pos.place.x + 30, y + pos.place.y + 0.5);

      doc.text("Le :", x + pos.date.x - 5, y + pos.date.y);
      doc.line(x + pos.date.x, y + pos.date.y + 0.5, x + pos.date.x + 25, y + pos.date.y + 0.5);

      doc.rect(x + w - 42, y + h - 18, 36, 14);
      doc.setFontSize(5);
      doc.text("Cadre Signature", x + w - 24, y + h - 11, { align: "center" });
    }
  });

  // 3. Sauvegarde via Tauri dialog ou fallback navigateur web
  if (isTauriEnvironment()) {
    try {
      const arrayBuffer = doc.output("arraybuffer");
      const bytes = Array.from(new Uint8Array(arrayBuffer));

      const savedPath = await invoke<string | null>("save_pdf_dialog", {
        defaultFilename,
        bytes
      });

      if (savedPath) {
        return { success: true, filePath: savedPath, canceled: false };
      } else {
        return { success: false, canceled: true };
      }
    } catch (tauriErr) {
      console.warn("Erreur sauvegarde gabarit PDF via Tauri:", tauriErr);
    }
  }

  try {
    const blob = doc.output("blob");
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = defaultFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);
    return { success: true, canceled: false };
  } catch (blobErr) {
    doc.save(defaultFilename);
    return { success: true, canceled: false };
  }
}
