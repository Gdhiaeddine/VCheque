import type { DateFormat } from "../types";

export interface DateFormatOption {
  id: DateFormat;
  label: string;
  description: string;
  example: string;
  isRecommended?: boolean;
}

const FRENCH_MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre"
];

export const DATE_FORMAT_OPTIONS: DateFormatOption[] = [
  {
    id: "DD/MM/YYYY",
    label: "Standard avec barres (JJ/MM/AAAA)",
    description: "Format officiel recommandé par les banques algériennes (BNA, BEA, CPA, etc.)",
    example: "08/11/2026",
    isRecommended: true
  },
  {
    id: "DD.MM.YYYY",
    label: "Avec points (JJ.MM.AAAA)",
    description: "Format typographique européen et helvétique soigné",
    example: "08.11.2026"
  },
  {
    id: "DD-MM-YYYY",
    label: "Avec tirets (JJ-MM-AAAA)",
    description: "Format administratif et comptable standard",
    example: "08-11-2026"
  },
  {
    id: "DD_MONTH_YYYY",
    label: "En toutes lettres (JJ Mois AAAA)",
    description: "Anti-falsification renforcée pour chèques d'entreprises",
    example: "08 novembre 2026"
  },
  {
    id: "YYYY-MM-DD",
    label: "Norme ISO internationale (AAAA-MM-JJ)",
    description: "Compatible avec ERP, imports bancaires et logiciels comptables",
    example: "2026-11-08"
  }
];

/**
 * Formate une date (string ISO "YYYY-MM-DD" ou Date) selon le format régional sélectionné
 */
export function formatChequeDate(
  dateInput?: string | Date | null,
  format: DateFormat = "DD/MM/YYYY"
): string {
  if (!dateInput) return "";

  let year: number;
  let month: number; // 1-12
  let day: number;

  if (typeof dateInput === "string") {
    const trimmed = dateInput.trim();
    if (!trimmed) return "";

    // Gère le format ISO "YYYY-MM-DD"
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      const parts = trimmed.split("T")[0].split("-");
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10);
      day = parseInt(parts[2], 10);
    }
    // Gère le format déjà au format "DD/MM/YYYY"
    else if (/^\d{2}\/\d{2}\/\d{4}/.test(trimmed)) {
      const parts = trimmed.split("/");
      day = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10);
      year = parseInt(parts[2], 10);
    }
    // Gère le format "DD-MM-YYYY"
    else if (/^\d{2}-\d{2}-\d{4}/.test(trimmed)) {
      const parts = trimmed.split("-");
      day = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10);
      year = parseInt(parts[2], 10);
    }
    // Fallback Date constructor
    else {
      const parsedDate = new Date(trimmed);
      if (isNaN(parsedDate.getTime())) return trimmed;
      year = parsedDate.getFullYear();
      month = parsedDate.getMonth() + 1;
      day = parsedDate.getDate();
    }
  } else if (dateInput instanceof Date) {
    if (isNaN(dateInput.getTime())) return "";
    year = dateInput.getFullYear();
    month = dateInput.getMonth() + 1;
    day = dateInput.getDate();
  } else {
    return "";
  }

  const dd = String(day).padStart(2, "0");
  const mm = String(month).padStart(2, "0");
  const yyyy = String(year);
  const monthName = FRENCH_MONTHS[month - 1] || mm;

  switch (format) {
    case "DD.MM.YYYY":
      return `${dd}.${mm}.${yyyy}`;
    case "DD-MM-YYYY":
      return `${dd}-${mm}-${yyyy}`;
    case "DD_MONTH_YYYY":
      return `${dd} ${monthName} ${yyyy}`;
    case "YYYY-MM-DD":
      return `${yyyy}-${mm}-${dd}`;
    case "DD/MM/YYYY":
    default:
      return `${dd}/${mm}/${yyyy}`;
  }
}
