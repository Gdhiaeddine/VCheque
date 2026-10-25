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
