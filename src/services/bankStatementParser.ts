import * as XLSX from "xlsx";
import type { BankStatementFormat, BankStatementLineRecord } from "../types";

export interface ParsedStatementResult {
  fileName: string;
  fileFormat: BankStatementFormat;
  periodStart?: string;
  periodEnd?: string;
  totalDebit: number;
  totalCredit: number;
  lines: Omit<BankStatementLineRecord, "id" | "statementId" | "accountId" | "companyId">[];
  detectedColumns?: {
    dateCol?: string;
    labelCol?: string;
    debitCol?: string;
    creditCol?: string;
    refCol?: string;
  };
}

export interface StatementColumnMapping {
  dateColIndex: number;
  valueDateColIndex?: number;
  labelColIndex: number;
  debitColIndex?: number;
  creditColIndex?: number;
  amountColIndex?: number; // Colonne unique avec montants négatifs/positifs
  refColIndex?: number;
  hasHeaderRow: boolean;
  dateFormat?: string; // "DD/MM/YYYY" | "YYYY-MM-DD"
}

/**
 * Regex pour extraire le numéro de chèque depuis un libellé bancaire
 * Exemples : "CHQ 0048201", "CHEQUE N° 48205", "CHQ: 98124", "PAIEMENT CHQ 00123"
 */
export function extractChequeNumberFromLabel(label: string, explicitRef?: string): string | undefined {
  if (explicitRef && /^[0-9]{4,10}$/.test(explicitRef.trim())) {
    return explicitRef.trim();
  }

  const regexes = [
    /(?:CHQ|CHEQUE|CHÈQUE)\s*(?:N[°ºO]?|NUM[EÉ]RO)?[:\s\.\-]*([0-9]{4,10})/i,
    /(?:EMISSION|PAIEMENT|RETRAIT|DEBIT)\s*(?:CHQ|CHEQUE)[:\s\.\-]*([0-9]{4,10})/i,
    /\bCHQ-([0-9]{4,10})\b/i,
    /\b([0-9]{6,8})\b/ // Série de 6 à 8 chiffres isolée
  ];

  for (const re of regexes) {
    const match = label.match(re);
    if (match && match[1]) {
      return match[1];
    }
  }

  return undefined;
}

/**
 * Parse un montant au format français / algérien
 * "125 000,50" -> 125000.5
 * "125.000,50" -> 125000.5
 * "(500.00)" -> -500
 */
export function parseFinancialAmount(val: any): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === "number") return isNaN(val) ? 0 : val;

  let str = String(val).trim();
  if (!str) return 0;

  // Détection des parenthèses comptables (1 500,00) = négatif
  let isNegative = false;
  if (str.startsWith("(") && str.endsWith(")")) {
    isNegative = true;
    str = str.slice(1, -1).trim();
  } else if (str.startsWith("-")) {
    isNegative = true;
    str = str.substring(1).trim();
  }

  // Enlever symboles monétaires et espaces insécables
  str = str.replace(/[DZdDA€$]+/gi, "").replace(/[\s\u00A0\u202F]/g, "");

  // Si on a format européen 1.250,50 -> virer les points de milliers, remplacer virgule par point
  if (str.includes(",") && str.includes(".")) {
    if (str.lastIndexOf(",") > str.lastIndexOf(".")) {
      // 1.250,50 -> 1250.50
      str = str.replace(/\./g, "").replace(",", ".");
    } else {
      // 1,250.50 -> 1250.50
      str = str.replace(/,/g, "");
    }
  } else if (str.includes(",")) {
    // 1250,50 -> 1250.50
    str = str.replace(",", ".");
  }

  const num = parseFloat(str);
  if (isNaN(num)) return 0;
  return isNegative ? -Math.abs(num) : num;
}

/**
 * Normalise une date sous le format ISO YYYY-MM-DD
 */
export function parseStatementDate(val: any): string {
  if (!val) return new Date().toISOString().slice(0, 10);

  if (val instanceof Date) {
    if (isNaN(val.getTime())) return new Date().toISOString().slice(0, 10);
    return val.toISOString().slice(0, 10);
  }

  // Nombre de jours Excel (serial date)
  if (typeof val === "number" && val > 20000 && val < 60000) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const jsDate = new Date(excelEpoch.getTime() + val * 86400000);
    return jsDate.toISOString().slice(0, 10);
  }

  const str = String(val).trim();

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.substring(0, 10);
  }

  // DD/MM/YYYY ou DD-MM-YYYY
  const dmyMatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if (dmyMatch) {
    let day = dmyMatch[1].padStart(2, "0");
    let month = dmyMatch[2].padStart(2, "0");
    let year = dmyMatch[3];
    if (year.length === 2) {
      year = "20" + year;
    }
    return `${year}-${month}-${day}`;
  }

  // Format compact YYYYMMDD (OFX)
  const compactMatch = str.match(/^(\d{4})(\d{2})(\d{2})/);
  if (compactMatch) {
    return `${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}`;
  }

  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }

  return new Date().toISOString().slice(0, 10);
}

/**
 * Parseur de relevé bancaire au format OFX (Open Financial Exchange)
 */
export function parseOfxStatement(text: string, fileName: string): ParsedStatementResult {
  const lines: Omit<BankStatementLineRecord, "id" | "statementId" | "accountId" | "companyId">[] = [];
  let totalDebit = 0;
  let totalCredit = 0;
  let minDate = "";
  let maxDate = "";

  // Découpage des transactions <STMTTRN>...</STMTTRN>
  const txnRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let match: RegExpExecArray | null;

  const extractTag = (xml: string, tag: string): string => {
    const re = new RegExp(`<${tag}>([^<\\r\\n]+)`, "i");
    const m = xml.match(re);
    return m ? m[1].trim() : "";
  };

  while ((match = txnRegex.exec(text)) !== null) {
    const txnBlock = match[1];
    const trnType = extractTag(txnBlock, "TRNTYPE");
    const dtPosted = extractTag(txnBlock, "DTPOSTED");
    const trnAmtStr = extractTag(txnBlock, "TRNAMT");
    const checkNum = extractTag(txnBlock, "CHECKNUM");
    const refNum = extractTag(txnBlock, "REFNUM");
    const name = extractTag(txnBlock, "NAME");
    const memo = extractTag(txnBlock, "MEMO");

    const opDate = parseStatementDate(dtPosted);
    const amount = parseFinancialAmount(trnAmtStr);
    const label = [name, memo].filter(Boolean).join(" - ") || "Opération bancaire";
    const ref = checkNum || refNum || undefined;
    const extractedCheque = extractChequeNumberFromLabel(label, ref);

    let debit: number | undefined;
    let credit: number | undefined;

    if (amount < 0) {
      debit = Math.abs(amount);
      totalDebit += debit;
    } else if (amount > 0) {
      credit = amount;
      totalCredit += credit;
    } else if (trnType.toUpperCase() === "DEBIT" || trnType.toUpperCase() === "CHECK") {
      debit = Math.abs(amount);
      totalDebit += debit;
    }

    if (!minDate || opDate < minDate) minDate = opDate;
    if (!maxDate || opDate > maxDate) maxDate = opDate;

    lines.push({
      operationDate: opDate,
      valueDate: opDate,
      label,
      reference: ref,
      debit,
      credit,
      reconciliationStatus: "unmatched",
      extractedChequeNumber: extractedCheque
    });
  }

  return {
    fileName,
    fileFormat: "ofx",
    periodStart: minDate || undefined,
    periodEnd: maxDate || undefined,
    totalDebit,
    totalCredit,
    lines
  };
}

/**
 * Parseur universel de relevé Excel ou CSV
 */
export async function parseExcelOrCsvStatement(
  file: File,
  customMapping?: StatementColumnMapping
): Promise<ParsedStatementResult> {
  const fileName = file.name;
  const isCsv = fileName.toLowerCase().endsWith(".csv") || fileName.toLowerCase().endsWith(".txt");
  const isOfx = fileName.toLowerCase().endsWith(".ofx") || fileName.toLowerCase().endsWith(".qif");

  if (isOfx) {
    const text = await file.text();
    return parseOfxStatement(text, fileName);
  }

  const buffer = await file.arrayBuffer();
  let rawRows: any[][] = [];

  if (isCsv) {
    // Décodage CSV avec détection automatique du séparateur (; , \t)
    let text = "";
    try {
      const decoder = new TextDecoder("utf-8", { fatal: true });
      text = decoder.decode(buffer);
    } catch {
      const decoder = new TextDecoder("windows-1252");
      text = decoder.decode(buffer);
    }

    if (text.charCodeAt(0) === 0xfeff) {
      text = text.slice(1);
    }

    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) {
      throw new Error("Le fichier CSV est vide.");
    }

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

    rawRows = lines.map(parseRow);
  } else {
    // Excel standard
    const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
  }

  if (rawRows.length === 0) {
    throw new Error("Le fichier importé est vide.");
  }

  // 1. Détection automatique des colonnes si aucun mapping fourni
  let headerRowIndex = 0;
  let dateColIdx = -1;
  let valueDateColIdx = -1;
  let labelColIdx = -1;
  let debitColIdx = -1;
  let creditColIdx = -1;
  let amountColIdx = -1;
  let refColIdx = -1;

  if (customMapping) {
    dateColIdx = customMapping.dateColIndex;
    valueDateColIdx = customMapping.valueDateColIndex ?? -1;
    labelColIdx = customMapping.labelColIndex;
    debitColIdx = customMapping.debitColIndex ?? -1;
    creditColIdx = customMapping.creditColIndex ?? -1;
    amountColIdx = customMapping.amountColIndex ?? -1;
    refColIdx = customMapping.refColIndex ?? -1;
    headerRowIndex = customMapping.hasHeaderRow ? 1 : 0;
  } else {
    // Scan des 10 premières lignes pour trouver la ligne d'en-tête la plus probable
    for (let r = 0; r < Math.min(10, rawRows.length); r++) {
      const row = rawRows[r].map((cell) => String(cell).toLowerCase().trim());
      for (let c = 0; c < row.length; c++) {
        const text = row[c];
        if (dateColIdx === -1 && /^(date|date\s*op[eé]ration|dt_op|op_date)/i.test(text)) dateColIdx = c;
        if (valueDateColIdx === -1 && /^(valeur|date\s*valeur|dt_val)/i.test(text)) valueDateColIdx = c;
        if (labelColIdx === -1 && /^(libell[eé]|d[eé]signation|op[eé]ration|motif|description)/i.test(text)) labelColIdx = c;
        if (debitColIdx === -1 && /^(d[eé]bit|retrait|d[eé]pense|d[eé]bit\s*\(da\))/i.test(text)) debitColIdx = c;
        if (creditColIdx === -1 && /^(cr[eé]dit|versement|recette|cr[eé]dit\s*\(da\))/i.test(text)) creditColIdx = c;
        if (amountColIdx === -1 && /^(montant|montant\s*\(da\)|solde|solde_op)/i.test(text)) amountColIdx = c;
        if (refColIdx === -1 && /^(r[eé]f|r[eé]f[eé]rence|n[°ºo]?\s*pi[eè]ce|ch[eè]que|n[°ºo]?\s*chq)/i.test(text)) refColIdx = c;
      }
      if (dateColIdx !== -1 && (labelColIdx !== -1 || debitColIdx !== -1 || amountColIdx !== -1)) {
        headerRowIndex = r + 1;
        break;
      }
    }

    // Valeurs par défaut si non trouvées
    if (dateColIdx === -1) dateColIdx = 0;
    if (labelColIdx === -1) labelColIdx = 1;
    if (debitColIdx === -1 && amountColIdx === -1) {
      if (rawRows[0].length >= 3) debitColIdx = 2;
    }
  }

  const lines: Omit<BankStatementLineRecord, "id" | "statementId" | "accountId" | "companyId">[] = [];
  let totalDebit = 0;
  let totalCredit = 0;
  let minDate = "";
  let maxDate = "";

  for (let r = headerRowIndex; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.length === 0) continue;

    const rawDate = row[dateColIdx];
    const rawLabel = labelColIdx !== -1 ? String(row[labelColIdx] || "").trim() : "";
    if (!rawDate && !rawLabel) continue;

    const opDate = parseStatementDate(rawDate);
    const valueDate = valueDateColIdx !== -1 ? parseStatementDate(row[valueDateColIdx]) : opDate;
    const explicitRef = refColIdx !== -1 ? String(row[refColIdx] || "").trim() : undefined;

    let debit: number | undefined;
    let credit: number | undefined;

    if (debitColIdx !== -1 && row[debitColIdx] !== undefined && row[debitColIdx] !== "") {
      const dVal = Math.abs(parseFinancialAmount(row[debitColIdx]));
      if (dVal > 0) debit = dVal;
    }
    if (creditColIdx !== -1 && row[creditColIdx] !== undefined && row[creditColIdx] !== "") {
      const cVal = Math.abs(parseFinancialAmount(row[creditColIdx]));
      if (cVal > 0) credit = cVal;
    }

    // Si on a une seule colonne montant avec signe +/-
    if (amountColIdx !== -1 && debit === undefined && credit === undefined) {
      const rawAmt = parseFinancialAmount(row[amountColIdx]);
      if (rawAmt < 0) {
        debit = Math.abs(rawAmt);
      } else if (rawAmt > 0) {
        credit = rawAmt;
      }
    }

    if (!debit && !credit) continue; // Ligne sans mouvement financier

    if (debit) totalDebit += debit;
    if (credit) totalCredit += credit;

    if (!minDate || opDate < minDate) minDate = opDate;
    if (!maxDate || opDate > maxDate) maxDate = opDate;

    const extractedCheque = extractChequeNumberFromLabel(rawLabel, explicitRef);

    lines.push({
      operationDate: opDate,
      valueDate,
      label: rawLabel || "Opération bancaire",
      reference: explicitRef,
      debit,
      credit,
      reconciliationStatus: "unmatched",
      extractedChequeNumber: extractedCheque
    });
  }

  return {
    fileName,
    fileFormat: isCsv ? "csv" : "excel",
    periodStart: minDate || undefined,
    periodEnd: maxDate || undefined,
    totalDebit,
    totalCredit,
    lines,
    detectedColumns: {
      dateCol: `Col ${dateColIdx + 1}`,
      labelCol: `Col ${labelColIdx + 1}`,
      debitCol: debitColIdx !== -1 ? `Col ${debitColIdx + 1}` : undefined,
      creditCol: creditColIdx !== -1 ? `Col ${creditColIdx + 1}` : undefined
    }
  };
}
