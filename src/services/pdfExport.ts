import { jsPDF } from "jspdf";
import type { BankTemplate, PrintSettings } from "../types";
import { splitWordsByLimit } from "../moneyToWords";
import { getPaperDimensions, calculateChequePosition } from "../components/PrintModal";

export interface ExportPdfOptions {
  mode: "exact-cheque" | "sheet"; // format réel du chèque seul OU positionné sur la feuille (A4, etc.)
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
  filename?: string;
}

/**
 * Convertit des millimètres en points typographiques (1 mm = 2.83465 pt)
 */
function mmToPt(mm: number): number {
  return mm * 2.83465;
}

/**
 * Exporte un chèque vectoriel haute fidélité au format PDF
 */
export function exportChequeToPdf(options: ExportPdfOptions): void {
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
    // Mode exact-cheque
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

  // 1. Guide de découpe si demandé sur feuille
  if (showCutGuide && mode === "sheet") {
    doc.setDrawColor(140, 140, 140);
    doc.setLineWidth(0.3);
    doc.setLineDashPattern([2, 2], 0);
    doc.rect(originX, originY, template.width, template.height);
    doc.setLineDashPattern([], 0); // reset
  }

  // 2. Barres de chèque barré (//) dans le coin supérieur gauche
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

  // 3. Bénéficiaire
  if (beneficiary && template.positions.beneficiary) {
    const pos = template.positions.beneficiary;
    doc.setFontSize(mmToPt(pos.size));
    doc.text(beneficiary, originX + pos.x, originY + pos.y, {
      align: pos.align || "left",
      baseline: "middle"
    });
  }

  // 4. Montant en toutes lettres (avec découpage automatique sur 2 lignes si nécessaire)
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

  // 5. Montant en chiffres (sécurisé avec alignement droite ou gauche)
  if (formattedNumeric && template.positions.numeric) {
    const pos = template.positions.numeric;
    doc.setFontSize(mmToPt(pos.size));
    doc.text(formattedNumeric, originX + pos.x, originY + pos.y, {
      align: pos.align || "right",
      baseline: "middle"
    });
  }

  // 6. Lieu
  if (place && template.positions.place) {
    const pos = template.positions.place;
    doc.setFontSize(mmToPt(pos.size));
    doc.text(place, originX + pos.x, originY + pos.y, {
      align: pos.align || "left",
      baseline: "middle"
    });
  }

  // 7. Date (Format JJ/MM/AAAA)
  if (date && template.positions.date) {
    const pos = template.positions.date;
    const formattedDate = date.includes("-") ? date.split("-").reverse().join("/") : date;
    doc.setFontSize(mmToPt(pos.size));
    doc.text(formattedDate, originX + pos.x, originY + pos.y, {
      align: pos.align || "left",
      baseline: "middle"
    });
  }

  // 8. Génération du nom de fichier propre
  const safeBeneficiary = (beneficiary || "cheque")
    .replace(/[^a-zA-Z0-9_\u0600-\u06FF]/g, "_")
    .substring(0, 25);
  const safeAmount = (amount || "0").replace(/[^0-9.]/g, "");
  const defaultFilename = `Cheque_${safeBeneficiary}_${safeAmount}DZD_${date || "export"}.pdf`;

  doc.save(filename || defaultFilename);
}
