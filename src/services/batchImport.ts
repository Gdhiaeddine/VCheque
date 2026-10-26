import * as XLSX from "xlsx";
import type { BatchItem, BatchColumnMapping, BatchRowStatus, ChequeRecord } from "../types";
import { amountInFrenchWords, formatNumericAmount } from "../moneyToWords";

export interface ParsedFileResult {
  headers: string[];
  rawRows: Record<string, any>[];
  filename: string;
  rowCount: number;
}

/**
 * Lit un fichier Excel (.xlsx, .xls) ou CSV/TSV et extrait les en-têtes et les lignes brutes.
 */
export async function parseImportFile(file: File): Promise<ParsedFileResult> {
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  const buffer = await file.arrayBuffer();

  if (extension === "csv" || extension === "tsv" || extension === "txt") {
    return parseDelimitedText(buffer, file.name);
  }

  // Lecture Excel via la librairie standard XLSX
  const workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error("Le classeur Excel ne contient aucune feuille de calcul.");
  }

  const worksheet = workbook.Sheets[firstSheetName];
  // Récupérer en JSON avec les valeurs d'en-tête de la première ligne
  const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, {
    defval: "",
    raw: false // formatte les dates et nombres en chaînes lisibles
  });

  if (rawRows.length === 0) {
    throw new Error("Le fichier Excel ne contient aucune ligne de données.");
  }

  // Extraire les en-têtes réels
  const headers = Object.keys(rawRows[0] || {});

  return {
    headers,
    rawRows,
    filename: file.name,
    rowCount: rawRows.length
  };
}

/**
 * Analyseur de fichier CSV/TSV avec détection automatique du séparateur (point-virgule, virgule ou tabulation)
 */
function parseDelimitedText(buffer: ArrayBuffer, filename: string): ParsedFileResult {
  // Tenter le décodage UTF-8 (fallback Windows-1252 si nécessaire)
  let text = "";
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    text = decoder.decode(buffer);
  } catch {
    const decoder = new TextDecoder("windows-1252");
    text = decoder.decode(buffer);
  }

  // Retirer le BOM UTF-8 s'il existe
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    throw new Error("Le fichier CSV est vide.");
  }

  // Détecter le séparateur
  const firstLine = lines[0];
  let sep = ";";
  const semiCount = (firstLine.match(/;/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;

  if (semiCount >= commaCount && semiCount >= tabCount) {
    sep = ";";
  } else if (commaCount > semiCount && commaCount >= tabCount) {
    sep = ",";
  } else if (tabCount > semiCount && tabCount > commaCount) {
    sep = "\t";
  }

  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' || char === "'") {
        inQuotes = !inQuotes;
      } else if (char === sep && !inQuotes) {
        result.push(current.trim().replace(/^["']|["']$/g, ""));
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim().replace(/^["']|["']$/g, ""));
    return result;
  };

  const headers = parseRow(lines[0]);
  const rawRows: Record<string, any>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseRow(lines[i]);
    if (values.length === 0 || (values.length === 1 && !values[0])) continue;
    const rowObj: Record<string, any> = {};
    headers.forEach((h, idx) => {
      rowObj[h] = values[idx] || "";
    });
    rawRows.push(rowObj);
  }

  return {
    headers,
    rawRows,
    filename,
    rowCount: rawRows.length
  };
}

/**
 * Détection heuristique automatique de la correspondance entre colonnes et champs chèque
 */
export function autoDetectColumnMapping(headers: string[]): BatchColumnMapping {
  const mapping: BatchColumnMapping = {
    beneficiary: "",
    amount: ""
  };

  const patterns = {
    beneficiary: /^(b[eé]n[eé]ficiaire|nom|tiers|fournisseur|client|raison\s*sociale|ordre|destinataire|nom\s*b[eé]n[eé]ficiaire)/i,
    amount: /^(montant|somme|valeur|total|net|montant\s*da|montant\s*dzd|prix)/i,
    date: /^(date|date\s*[eé]mission|date\s*paiement|[eé]ch[eé]ance|jour)/i,
    place: /^(lieu|ville|fait\s*[aà]|place)/i,
    chequeNumber: /^(n[°o]?\s*ch[eèé]que|num[eé]ro\s*ch[eèé]que|ch[eèé]que\s*n[°o]?|num[eé]ro|num|num_cheque)/i,
    reference: /^(r[eé]f[eé]rence|r[eé]f|facture|n[°o]?\s*facture|justificatif|bc|bl|bon)/i,
    bankTemplateId: /^(banque|bank|mod[eè]le|template)/i
  };

  for (const h of headers) {
    const clean = h.trim();
    if (!mapping.beneficiary && patterns.beneficiary.test(clean)) {
      mapping.beneficiary = clean;
    } else if (!mapping.amount && patterns.amount.test(clean)) {
      mapping.amount = clean;
    } else if (!mapping.date && patterns.date.test(clean)) {
      mapping.date = clean;
    } else if (!mapping.place && patterns.place.test(clean)) {
      mapping.place = clean;
    } else if (!mapping.chequeNumber && patterns.chequeNumber.test(clean)) {
      mapping.chequeNumber = clean;
    } else if (!mapping.reference && patterns.reference.test(clean)) {
      mapping.reference = clean;
    } else if (!mapping.bankTemplateId && patterns.bankTemplateId.test(clean)) {
      mapping.bankTemplateId = clean;
    }
  }

  // Si pas de correspondance exacte sur Bénéficiaire ou Montant, chercher le terme inclus
  if (!mapping.beneficiary) {
    const found = headers.find((h) => patterns.beneficiary.test(h));
    if (found) mapping.beneficiary = found;
  }
  if (!mapping.amount) {
    const found = headers.find((h) => patterns.amount.test(h));
    if (found) mapping.amount = found;
  }

  return mapping;
}

/**
 * Nettoie et valide un montant algérien sous divers formats
 */
export function sanitizeAmount(val: any): { numeric: number; formatted: string; isValid: boolean } {
  if (val === null || val === undefined || val === "") {
    return { numeric: 0, formatted: "0,00", isValid: false };
  }

  let str = String(val).trim().toUpperCase();
  // Enlever DA, DZD, €, $
  str = str.replace(/DA|DZD|EUR|USD|€|\$/g, "").trim();
  // Remplacer espaces insécables ou normaux
  str = str.replace(/[\s\u00A0\u202F]/g, "");

  // Si contient virgule ET point (ex: "1.250.000,50" ou "1,250,000.50")
  if (str.includes(",") && str.includes(".")) {
    const lastComma = str.lastIndexOf(",");
    const lastDot = str.lastIndexOf(".");
    if (lastComma > lastDot) {
      // Format européen / algérien : "1.250.000,50" -> supprimer les points, virgule devient point
      str = str.replace(/\./g, "").replace(",", ".");
    } else {
      // Format anglo-saxon : "1,250,000.50" -> supprimer les virgules
      str = str.replace(/,/g, "");
    }
  } else if (str.includes(",")) {
    // Virgule unique comme séparateur décimal
    str = str.replace(",", ".");
  }

  const num = parseFloat(str);
  const isValid = !isNaN(num) && isFinite(num) && num > 0;

  return {
    numeric: isValid ? num : 0,
    formatted: isValid
      ? num.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : (str || "0,00"),
    isValid
  };
}

/**
 * Formate et valide une date en format ISO YYYY-MM-DD
 */
export function sanitizeDate(val: any): string {
  const today = new Date().toISOString().split("T")[0];
  if (!val) return today;

  const str = String(val).trim();

  // Format DD/MM/YYYY ou DD-MM-YYYY
  const frMatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (frMatch) {
    const day = frMatch[1].padStart(2, "0");
    const month = frMatch[2].padStart(2, "0");
    const year = frMatch[3];
    return `${year}-${month}-${day}`;
  }

  // Format YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
  if (isoMatch) {
    const year = isoMatch[1];
    const month = isoMatch[2].padStart(2, "0");
    const day = isoMatch[3].padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  // Tenter le constructeur natif
  try {
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split("T")[0];
    }
  } catch {}

  return today;
}

/**
 * Valide l'ensemble des lignes importées selon le mapping, détecte les anomalies et les doublons
 */
export function validateBatchItems(
  rawRows: Record<string, any>[],
  mapping: BatchColumnMapping,
  existingCheques: ChequeRecord[],
  defaultPlace = "Alger"
): BatchItem[] {
  const items: BatchItem[] = [];

  rawRows.forEach((row, index) => {
    const beneficiary = mapping.beneficiary ? String(row[mapping.beneficiary] || "").trim() : "";
    const rawAmountVal = mapping.amount ? row[mapping.amount] : "";
    const rawDateVal = mapping.date ? row[mapping.date] : "";
    const placeVal = mapping.place ? String(row[mapping.place] || "").trim() : "";
    const chequeNumberVal = mapping.chequeNumber ? String(row[mapping.chequeNumber] || "").trim() : undefined;
    const referenceVal = mapping.reference ? String(row[mapping.reference] || "").trim() : undefined;
    const bankTemplateVal = mapping.bankTemplateId ? String(row[mapping.bankTemplateId] || "").trim() : undefined;

    const { numeric, formatted, isValid: isAmountValid } = sanitizeAmount(rawAmountVal);
    const dateVal = sanitizeDate(rawDateVal);
    const place = placeVal || defaultPlace;

    let status: BatchRowStatus = "valid";
    let statusMessage = "Prêt à être traité";

    // 1. Validation syntaxique de base
    if (!beneficiary) {
      status = "error";
      statusMessage = "Bénéficiaire manquant";
    } else if (!isAmountValid) {
      status = "error";
      statusMessage = `Montant invalide (${rawAmountVal || "vide"})`;
    }

    // 2. Détection des doublons avec les chèques existants de l'entreprise
    let isDuplicate = false;
    let duplicateChequeId: string | undefined = undefined;

    if (status === "valid") {
      const benNorm = beneficiary.toLowerCase();
      const dup = existingCheques.find((c) => {
        if (!c.beneficiary || c.status === "annule") return false;
        const cBenNorm = c.beneficiary.toLowerCase();
        const cNum = Number((c.amount || "0").replace(/\s/g, "").replace(",", ".")) || 0;
        const isSameAmount = Math.abs(cNum - numeric) < 0.01;
        const isSameBen = benNorm === cBenNorm || benNorm.includes(cBenNorm) || cBenNorm.includes(benNorm);

        // Si même bénéficiaire et même montant
        if (isSameBen && isSameAmount) {
          // Même date ou date très proche
          if (c.date === dateVal || c.date.includes(dateVal.slice(0, 7))) {
            return true;
          }
        }
        return false;
      });

      if (dup) {
        isDuplicate = true;
        duplicateChequeId = dup.id;
        status = "duplicate";
        statusMessage = `Doublon potentiel avec chèque existant (${dup.chequeNumber || "Sans N°"} du ${dup.date})`;
      }
    }

    // Montant en lettres
    const amountInWords = isAmountValid ? amountInFrenchWords(formatted) : "Montant invalide";

    items.push({
      id: `batch-item-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 6)}`,
      rowIndex: index + 1,
      beneficiary,
      rawAmount: String(rawAmountVal || ""),
      numericAmount: numeric,
      formattedAmount: formatted,
      amountInWords,
      date: dateVal,
      place,
      chequeNumber: chequeNumberVal,
      reference: referenceVal,
      bankTemplateId: bankTemplateVal,
      status,
      statusMessage,
      isDuplicate,
      duplicateChequeId,
      selected: status !== "error" // Les valides et les doublons sont cochés par défaut, les erreurs décochées
    });
  });

  return items;
}

/**
 * Calcule les statistiques d'un lot d'éléments analysés
 */
export function calculateBatchStats(items: BatchItem[]) {
  const totalRows = items.length;
  const validCount = items.filter((i) => i.status === "valid").length;
  const duplicateCount = items.filter((i) => i.status === "duplicate").length;
  const errorCount = items.filter((i) => i.status === "error").length;

  const selectedItems = items.filter((i) => i.selected && i.status !== "error");
  const selectedCount = selectedItems.length;

  const selectedTotalAmount = selectedItems.reduce((acc, curr) => acc + curr.numericAmount, 0);

  return {
    totalRows,
    validCount,
    duplicateCount,
    errorCount,
    selectedCount,
    selectedTotalAmount,
    selectedTotalFormatted: selectedTotalAmount.toLocaleString("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
  };
}
