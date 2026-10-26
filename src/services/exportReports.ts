import { jsPDF } from "jspdf";
import { invoke } from "@tauri-apps/api/core";
import type { ChequeRecord, ChequeStatus, BeneficiaryRecord, BankAccountRecord, BankStatementLineRecord } from "../types";
import { amountInFrenchWords } from "../moneyToWords";

export const STATUS_LABELS: Record<ChequeStatus, string> = {
  saved: "Brouillon",
  brouillon: "Brouillon",
  pret: "Prêt",
  printed: "Imprimé",
  remis: "Remis",
  encaisse: "Encaissé",
  annule: "Annulé"
};

export interface ExportReportOptions {
  customFilename?: string;
  filterSummary?: string;
  activeFilterSummary?: string;
  reportTitle?: string;
  reportSubtitle?: string;
  companyName?: string;
}

export interface ExportResult {
  success: boolean;
  canceled?: boolean;
  filePath?: string;
  filename?: string;
  error?: string;
}

export interface SaveFileOptions {
  defaultFilename: string;
  filterName: string;
  filterExt: string;
  mimeType: string;
  bytes: Uint8Array;
}

/**
 * Boîte de dialogue universelle de choix de l'emplacement et de sauvegarde de fichier.
 * Ouvre la boîte de dialogue native (Tauri / Windows Explorer ou File System Access API du navigateur)
 * pour permettre à l'utilisateur de choisir exactement le dossier et le nom du fichier.
 */
export async function saveExportFile(options: SaveFileOptions): Promise<ExportResult> {
  const { defaultFilename, filterName, filterExt, mimeType, bytes } = options;

  // 1. Environnement Desktop Tauri : boîte de dialogue native OS "Enregistrer sous"
  if (typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__)) {
    try {
      const byteArray = Array.from(bytes);
      const savedPath = await invoke<string | null>("save_file_dialog", {
        defaultFilename,
        filterName,
        filterExt,
        bytes: byteArray
      });

      if (savedPath) {
        return { success: true, filePath: savedPath, filename: defaultFilename, canceled: false };
      } else {
        // L'utilisateur a cliqué sur "Annuler" dans le sélecteur de fichier
        return { success: false, canceled: true };
      }
    } catch (tauriErr) {
      console.warn("Échec save_file_dialog Tauri, tentative via save_pdf_dialog ou fallback:", tauriErr);
      if (filterExt === "pdf") {
        try {
          const savedPath = await invoke<string | null>("save_pdf_dialog", {
            defaultFilename,
            bytes: Array.from(bytes)
          });
          if (savedPath) return { success: true, filePath: savedPath, filename: defaultFilename, canceled: false };
          return { success: false, canceled: true };
        } catch {}
      }
    }
  }

  // 2. File System Access API des navigateurs modernes (permet de choisir l'emplacement de sauvegarde)
  if (typeof window !== "undefined" && "showSaveFilePicker" in window) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: defaultFilename,
        types: [
          {
            description: filterName,
            accept: {
              [mimeType]: [`.${filterExt}`]
            }
          }
        ]
      });

      const writable = await handle.createWritable();
      await writable.write(bytes);
      await writable.close();
      return { success: true, filePath: defaultFilename, filename: defaultFilename, canceled: false };
    } catch (pickerErr: any) {
      if (pickerErr?.name === "AbortError") {
        return { success: false, canceled: true };
      }
      console.warn("showSaveFilePicker échoué, fallback sur ancre HTML5:", pickerErr);
    }
  }

  // 3. Fallback standard navigateur web HTML5 (Blob + téléchargement)
  try {
    const blob = new Blob([bytes], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = defaultFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    return { success: true, filePath: defaultFilename, filename: defaultFilename, canceled: false };
  } catch (err) {
    console.error("Erreur de sauvegarde finale:", err);
    return { success: false, error: String(err) };
  }
}

/**
 * Nettoie une chaîne de caractères pour inclusion dans un champ CSV
 */
function escapeCsv(val: any): string {
  if (val === null || val === undefined) return "";
  const str = String(val).replace(/\r\n/g, " ").replace(/[\r\n]/g, " ");
  if (str.includes(";") || str.includes('"') || str.includes(",")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Formate une date ISO ou YYYY-MM-DD en JJ/MM/AAAA
 */
function formatDateFr(dateStr?: string): string {
  if (!dateStr) return "";
  try {
    const raw = dateStr.includes("T") ? dateStr.split("T")[0] : dateStr;
    const parts = raw.split("-");
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

/**
 * Formate un montant numérique pour l'export PDF avec espaces ASCII standard (0x20)
 * Évite les espaces insécables étroits (U+202F) de toLocaleString("fr-FR") que jsPDF convertit en slashs "/"
 */
function formatPdfAmount(val: number): string {
  if (isNaN(val)) return "0,00";
  const fixed = val.toFixed(2);
  const [intPart, decPart] = fixed.split(".");
  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${formattedInt},${decPart}`;
}

/**
 * Exporte une liste de chèques au format CSV (encodage UTF-8 avec BOM pour ouverture parfaite dans Excel)
 * Ouvre la boîte de dialogue native pour choisir l'emplacement de sauvegarde.
 */
export async function exportChequesToCsv(
  records: ChequeRecord[],
  options?: string | ExportReportOptions
): Promise<ExportResult> {
  const opt: ExportReportOptions = typeof options === "string" ? { customFilename: options } : (options || {});

  const headers = [
    "Date d'émission",
    "Numéro de chèque",
    "Référence interne",
    "Bénéficiaire",
    "Montant (DZD)",
    "Montant en toutes lettres",
    "Banque émettrice",
    "Statut",
    "Motif d'annulation",
    "Date d'annulation",
    "Date de remise",
    "Date d'encaissement",
    "Nombre de tirages",
    "Date d'enregistrement"
  ];

  const rows: string[] = [];

  // En-tête informatif sur les filtres
  if (opt.filterSummary) {
    rows.push([`# FILTRES APPLIQUÉS : ${opt.filterSummary}`].join(";"));
    rows.push([`# DATE D'EXPORT : ${new Date().toLocaleDateString("fr-FR")} ${new Date().toLocaleTimeString("fr-FR")}`].join(";"));
  }

  rows.push(headers.map(escapeCsv).join(";"));

  let totalActive = 0;

  for (const item of records) {
    const rawNum = parseFloat((item.amount || "0").replace(/\s/g, "").replace(",", ".")) || 0;
    if (item.status !== "annule") {
      totalActive += rawNum;
    }
    const formattedNum = rawNum.toFixed(2).replace(".", ",");
    const words = amountInFrenchWords(item.amount);

    const row = [
      formatDateFr(item.date),
      item.chequeNumber || "",
      item.reference || "",
      item.beneficiary || "",
      formattedNum,
      words,
      item.bankName || "",
      STATUS_LABELS[item.status] || item.status,
      item.cancellationReason || "",
      item.cancelledAt ? formatDateFr(item.cancelledAt) : "",
      item.deliveredAt ? formatDateFr(item.deliveredAt) : "",
      item.cashedAt ? formatDateFr(item.cashedAt) : "",
      item.printCount ?? 0,
      formatDateFr(item.createdAt)
    ];

    rows.push(row.map(escapeCsv).join(";"));
  }

  // Ligne de total récapitulative
  rows.push([
    "TOTAL ACTIF (hors chèques annulés)",
    "",
    "",
    `${records.length} chèque(s)`,
    totalActive.toFixed(2).replace(".", ","),
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    ""
  ].map(escapeCsv).join(";"));

  // BOM UTF-8 (\uFEFF) pour garantir que Microsoft Excel détecte immédiatement l'encodage UTF-8 (accents et arabe)
  const csvContent = "\uFEFF" + rows.join("\r\n");
  const bytes = new TextEncoder().encode(csvContent);
  const dateTag = new Date().toISOString().split("T")[0];
  const defaultFilename = opt.customFilename || `cheques-historique-${dateTag}.csv`;

  return await saveExportFile({
    defaultFilename,
    filterName: "Fichier CSV (*.csv)",
    filterExt: "csv",
    mimeType: "text/csv;charset=utf-8;",
    bytes
  });
}

/**
 * Exporte une liste de chèques au format Excel Spreadsheet XML natif (.xls)
 * Ouvre la boîte de dialogue native pour choisir l'emplacement de sauvegarde.
 */
export async function exportChequesToExcel(
  records: ChequeRecord[],
  options?: string | ExportReportOptions
): Promise<ExportResult> {
  const opt: ExportReportOptions = typeof options === "string" ? { customFilename: options } : (options || {});

  const sanitizeXml = (str: any): string => {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  };

  let totalActive = 0;
  for (const item of records) {
    const rawNum = parseFloat((item.amount || "0").replace(/\s/g, "").replace(",", ".")) || 0;
    if (item.status !== "annule") {
      totalActive += rawNum;
    }
  }

  let rowsXml = "";

  // 1. Bloc d'en-tête informatif sur les filtres appliqués
  const excelTitle = opt.reportTitle || "CHÈQUE STUDIO ALGÉRIE — ÉTAT RÉCAPITULATIF DES CHÈQUES";
  const excelSubtitle = opt.reportSubtitle || `Filtres appliqués : ${opt.filterSummary || opt.activeFilterSummary || "Tous les chèques (aucun filtre spécifique)"}`;
  rowsXml += `    <Row ss:Height="24">\n`;
  rowsXml += `      <Cell ss:MergeAcross="10" ss:StyleID="TitleCell"><Data ss:Type="String">${sanitizeXml(excelTitle)}</Data></Cell>\n`;
  rowsXml += `    </Row>\n`;

  rowsXml += `    <Row ss:Height="18">\n`;
  rowsXml += `      <Cell ss:MergeAcross="10" ss:StyleID="SubtitleCell"><Data ss:Type="String">${sanitizeXml(excelSubtitle)}</Data></Cell>\n`;
  rowsXml += `    </Row>\n`;

  rowsXml += `    <Row ss:Height="18">\n`;
  rowsXml += `      <Cell ss:MergeAcross="10" ss:StyleID="InfoCell"><Data ss:Type="String">Date d'exportation : ${new Date().toLocaleDateString("fr-FR")} à ${new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} | Total chèques : ${records.length} | Montant actif total : ${totalActive.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} DA</Data></Cell>\n`;
  rowsXml += `    </Row>\n`;

  rowsXml += `    <Row ss:Height="8"/>\n`; // Ligne vide de séparation

  // 2. En-têtes des colonnes du tableau
  const headers = [
    "Date",
    "N° Chèque",
    "Référence",
    "Bénéficiaire",
    "Montant (DZD)",
    "Montant en toutes lettres",
    "Banque",
    "Statut",
    "Motif d'annulation",
    "Tirages",
    "Enregistré le"
  ];

  rowsXml += `    <Row ss:StyleID="HeaderRow" ss:Height="22">\n`;
  for (const h of headers) {
    rowsXml += `      <Cell><Data ss:Type="String">${sanitizeXml(h)}</Data></Cell>\n`;
  }
  rowsXml += `    </Row>\n`;

  // 3. Lignes de données
  for (const item of records) {
    const rawNum = parseFloat((item.amount || "0").replace(/\s/g, "").replace(",", ".")) || 0;
    const words = amountInFrenchWords(item.amount);
    const styleId = item.status === "annule" ? "CancelledRow" : "DefaultRow";

    rowsXml += `    <Row ss:StyleID="${styleId}">\n`;
    rowsXml += `      <Cell><Data ss:Type="String">${sanitizeXml(formatDateFr(item.date))}</Data></Cell>\n`;
    rowsXml += `      <Cell><Data ss:Type="String">${sanitizeXml(item.chequeNumber || "")}</Data></Cell>\n`;
    rowsXml += `      <Cell><Data ss:Type="String">${sanitizeXml(item.reference || "")}</Data></Cell>\n`;
    rowsXml += `      <Cell><Data ss:Type="String">${sanitizeXml(item.beneficiary || "")}</Data></Cell>\n`;
    rowsXml += `      <Cell ss:StyleID="NumberCell"><Data ss:Type="Number">${rawNum.toFixed(2)}</Data></Cell>\n`;
    rowsXml += `      <Cell><Data ss:Type="String">${sanitizeXml(words)}</Data></Cell>\n`;
    rowsXml += `      <Cell><Data ss:Type="String">${sanitizeXml(item.bankName || "")}</Data></Cell>\n`;
    rowsXml += `      <Cell><Data ss:Type="String">${sanitizeXml(STATUS_LABELS[item.status] || item.status)}</Data></Cell>\n`;
    rowsXml += `      <Cell><Data ss:Type="String">${sanitizeXml(item.cancellationReason || "")}</Data></Cell>\n`;
    rowsXml += `      <Cell><Data ss:Type="Number">${item.printCount ?? 0}</Data></Cell>\n`;
    rowsXml += `      <Cell><Data ss:Type="String">${sanitizeXml(formatDateFr(item.createdAt))}</Data></Cell>\n`;
    rowsXml += `    </Row>\n`;
  }

  // 4. Ligne de totalisation
  rowsXml += `    <Row ss:StyleID="TotalRow" ss:Height="24">\n`;
  rowsXml += `      <Cell><Data ss:Type="String">TOTAL ACTIF</Data></Cell>\n`;
  rowsXml += `      <Cell><Data ss:Type="String"></Data></Cell>\n`;
  rowsXml += `      <Cell><Data ss:Type="String"></Data></Cell>\n`;
  rowsXml += `      <Cell><Data ss:Type="String">${records.length} chèque(s)</Data></Cell>\n`;
  rowsXml += `      <Cell ss:StyleID="NumberTotalCell"><Data ss:Type="Number">${totalActive.toFixed(2)}</Data></Cell>\n`;
  rowsXml += `      <Cell><Data ss:Type="String">(Hors chèques annulés)</Data></Cell>\n`;
  rowsXml += `      <Cell><Data ss:Type="String"></Data></Cell>\n`;
  rowsXml += `      <Cell><Data ss:Type="String"></Data></Cell>\n`;
  rowsXml += `      <Cell><Data ss:Type="String"></Data></Cell>\n`;
  rowsXml += `      <Cell><Data ss:Type="String"></Data></Cell>\n`;
  rowsXml += `      <Cell><Data ss:Type="String"></Data></Cell>\n`;
  rowsXml += `    </Row>\n`;

  const excelTemplate = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#1E293B"/>
  </Style>
  <Style ss:ID="TitleCell">
   <Alignment ss:Vertical="Center" ss:Horizontal="Left"/>
   <Font ss:FontName="Calibri" ss:Size="14" ss:Bold="1" ss:Color="#2A241C"/>
  </Style>
  <Style ss:ID="SubtitleCell">
   <Alignment ss:Vertical="Center" ss:Horizontal="Left"/>
   <Font ss:FontName="Calibri" ss:Size="11" ss:Italic="1" ss:Color="#AC8946"/>
  </Style>
  <Style ss:ID="InfoCell">
   <Alignment ss:Vertical="Center" ss:Horizontal="Left"/>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#64748B"/>
  </Style>
  <Style ss:ID="HeaderRow">
   <Alignment ss:Vertical="Center" ss:Horizontal="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#AC8946"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#2A241C" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="DefaultRow">
   <Alignment ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
  </Style>
  <Style ss:ID="CancelledRow">
   <Alignment ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#94A3B8" ss:StrikeThrough="1"/>
   <Interior ss:Color="#FFF1F2" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FECDD3"/>
   </Borders>
  </Style>
  <Style ss:ID="NumberCell">
   <Alignment ss:Vertical="Center" ss:Horizontal="Right"/>
   <NumberFormat ss:Format="#,##0.00\\ &quot;DA&quot;"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
  </Style>
  <Style ss:ID="TotalRow">
   <Alignment ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#AC8946"/>
   <Interior ss:Color="#FDFBF7" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#AC8946"/>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#AC8946"/>
   </Borders>
  </Style>
  <Style ss:ID="NumberTotalCell">
   <Alignment ss:Vertical="Center" ss:Horizontal="Right"/>
   <Font ss:FontName="Calibri" ss:Size="12" ss:Bold="1" ss:Color="#AC8946"/>
   <NumberFormat ss:Format="#,##0.00\\ &quot;DA&quot;"/>
   <Interior ss:Color="#FDFBF7" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#AC8946"/>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#AC8946"/>
   </Borders>
  </Style>
 </Styles>
 <Worksheet ss:Name="Chèques">
  <Table ss:DefaultRowHeight="22">
   <Column ss:Width="75"/>
   <Column ss:Width="80"/>
   <Column ss:Width="90"/>
   <Column ss:Width="160"/>
   <Column ss:Width="110"/>
   <Column ss:Width="250"/>
   <Column ss:Width="140"/>
   <Column ss:Width="85"/>
   <Column ss:Width="140"/>
   <Column ss:Width="50"/>
   <Column ss:Width="85"/>
${rowsXml}  </Table>
 </Worksheet>
</Workbook>`;

  const bytes = new TextEncoder().encode(excelTemplate);
  const dateTag = new Date().toISOString().split("T")[0];
  const defaultFilename = opt.customFilename || `cheques-historique-${dateTag}.xls`;

  return await saveExportFile({
    defaultFilename,
    filterName: "Classeur Excel (*.xls)",
    filterExt: "xls",
    mimeType: "application/vnd.ms-excel;charset=utf-8;",
    bytes
  });
}

/**
 * Exporte un rapport complet de l'historique filtré au format PDF vectoriel (A4 Paysage)
 * Ouvre la boîte de dialogue native pour choisir l'emplacement de sauvegarde.
 */
export async function exportChequesToPdf(
  records: ChequeRecord[],
  options?: string | ExportReportOptions
): Promise<ExportResult> {
  const opt: ExportReportOptions = typeof options === "string" ? { customFilename: options } : (options || {});

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth(); // 297mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 210mm
  const margin = 14;

  let y = 15;

  // En-tête Titre de l'application
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(42, 36, 28); // Dark gold
  const pdfTitle = opt.reportTitle || "CHÈQUE STUDIO ALGÉRIE — ÉTAT RÉCAPITULATIF DES CHÈQUES";
  doc.text(pdfTitle, margin, y);

  // Date et heure d'édition
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  const nowStr = `${new Date().toLocaleDateString("fr-FR")} à ${new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
  doc.text(`Édité le : ${nowStr}`, pageWidth - margin, y, { align: "right" });

  y += 6;

  // Sous-titre avec rappel explicite des filtres appliqués
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(172, 137, 70); // Accent gold
  const filterSummaryText = opt.reportSubtitle || `Filtres appliqués : ${opt.filterSummary || opt.activeFilterSummary || "Tous les chèques (aucun filtre spécifique)"}`;
  doc.text(filterSummaryText, margin, y);

  y += 5;

  // Bloc résumé KPI
  let totalActive = 0;
  let cancelledCount = 0;
  let printedCount = 0;

  for (const r of records) {
    const rawVal = parseFloat((r.amount || "0").replace(/\s/g, "").replace(",", ".")) || 0;
    if (r.status === "annule") {
      cancelledCount++;
    } else {
      totalActive += rawVal;
    }
    if (r.status === "printed") printedCount++;
  }

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, y, pageWidth - 2 * margin, 11, 2, 2, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);

  doc.text(`Total chèques : ${records.length}`, margin + 5, y + 7.5);
  doc.text(`Imprimés : ${printedCount}`, margin + 50, y + 7.5);
  doc.text(`Annulés : ${cancelledCount}`, margin + 85, y + 7.5);
  doc.text(
    `Montant actif cumulé : ${formatPdfAmount(totalActive)} DA`,
    margin + 120,
    y + 7.5
  );
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("(Chèques annulés exclus du montant)", pageWidth - margin - 5, y + 7.5, { align: "right" });

  y += 15;

  // Définition des colonnes du tableau
  const cols = [
    { title: "Date", width: 22, align: "left" as const },
    { title: "N° Chèque", width: 22, align: "left" as const },
    { title: "Référence", width: 26, align: "left" as const },
    { title: "Bénéficiaire", width: 64, align: "left" as const },
    { title: "Montant (DZD)", width: 34, align: "right" as const },
    { title: "Banque émettrice", width: 44, align: "left" as const },
    { title: "Statut", width: 22, align: "center" as const },
    { title: "Motif / Observation", width: 35, align: "left" as const }
  ];

  const drawTableHeader = (curY: number) => {
    doc.setFillColor(42, 36, 28);
    doc.rect(margin, curY, pageWidth - 2 * margin, 7.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);

    let curX = margin;
    for (const c of cols) {
      const textX =
        c.align === "right" ? curX + c.width - 2 : c.align === "center" ? curX + c.width / 2 : curX + 2;
      doc.text(c.title, textX, curY + 5.2, { align: c.align });
      curX += c.width;
    }
  };

  drawTableHeader(y);
  y += 7.5;

  // Lignes de données
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);

  let rowIndex = 0;
  for (const r of records) {
    // Gestion de la pagination multi-pages
    if (y > pageHeight - 18) {
      doc.addPage();
      y = 15;
      drawTableHeader(y);
      y += 7.5;
    }

    const isCancelled = r.status === "annule";
    const rowHeight = 6.8;

    // Fond alterné ou teinte rouge pour chèque annulé
    if (isCancelled) {
      doc.setFillColor(254, 242, 242);
      doc.rect(margin, y, pageWidth - 2 * margin, rowHeight, "F");
      doc.setTextColor(185, 28, 28);
    } else if (rowIndex % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, pageWidth - 2 * margin, rowHeight, "F");
      doc.setTextColor(30, 41, 59);
    } else {
      doc.setTextColor(30, 41, 59);
    }

    // Bordure inférieure
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y + rowHeight, pageWidth - margin, y + rowHeight);

    let curX = margin;
    const num = parseFloat((r.amount || "0").replace(/\s/g, "").replace(",", ".")) || 0;
    const values = [
      formatDateFr(r.date),
      r.chequeNumber || "-",
      r.reference || "-",
      r.beneficiary || "-",
      formatPdfAmount(num),
      r.bankName || "-",
      STATUS_LABELS[r.status] || r.status,
      r.cancellationReason || "-"
    ];

    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      const val = String(values[i]);
      const textX =
        c.align === "right" ? curX + c.width - 2 : c.align === "center" ? curX + c.width / 2 : curX + 2;

      // Tronquer proprement si le texte dépasse la largeur de la cellule
      const maxW = c.width - 4;
      let textToDraw = val;
      while (doc.getTextWidth(textToDraw) > maxW && textToDraw.length > 4) {
        textToDraw = textToDraw.substring(0, textToDraw.length - 4) + "...";
      }
      doc.text(textToDraw, textX, y + 4.7, { align: c.align });
      curX += c.width;
    }

    y += rowHeight;
    rowIndex++;
  }

  // Pied de page sur l'ensemble des pages générées
  const totalPagesCount = doc.getNumberOfPages();
  for (let i = 1; i <= totalPagesCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(`Chèque Studio Algérie — Document de gestion interne confidentiel`, margin, pageHeight - 6);
    doc.text(`Page ${i} sur ${totalPagesCount}`, pageWidth - margin, pageHeight - 6, { align: "right" });
  }

  const bytes = new Uint8Array(doc.output("arraybuffer"));
  const dateTag = new Date().toISOString().split("T")[0];
  const defaultFilename = opt.customFilename || `rapport-cheques-${dateTag}.pdf`;

  return await saveExportFile({
    defaultFilename,
    filterName: "Document PDF (*.pdf)",
    filterExt: "pdf",
    mimeType: "application/pdf",
    bytes
  });
}

/**
 * Exporte le carnet complet des bénéficiaires au format CSV (UTF-8 avec BOM)
 */
export async function exportBeneficiariesToCsv(
  records: BeneficiaryRecord[],
  customFilename?: string
): Promise<ExportResult> {
  const dateTag = new Date().toISOString().split("T")[0];
  const filename = customFilename || `repertoire-beneficiaires-${dateTag}.csv`;

  const headers = [
    "Nom du bénéficiaire",
    "Alias / Raison sociale",
    "Téléphone",
    "Compte / RIB",
    "Notes",
    "Chèques émis",
    "Dernier chèque",
    "Date d'enregistrement"
  ];

  const rows = records.map((b) => [
    b.name,
    b.nickname || "",
    b.phone || "",
    b.rib || "",
    b.note ? b.note.replace(/\r?\n/g, " ") : "",
    String(b.usageCount || 1),
    b.lastUsedAt || "",
    b.createdAt || ""
  ]);

  const escapeCsv = (val: string) => `"${val.replace(/"/g, '""')}"`;
  const csvContent =
    "\uFEFF" +
    [headers.map(escapeCsv).join(";"), ...rows.map((r) => r.map(escapeCsv).join(";"))].join("\r\n");

  const encoder = new TextEncoder();
  const bytes = encoder.encode(csvContent);

  return await saveExportFile({
    defaultFilename: filename,
    filterName: "Fichier CSV (*.csv)",
    filterExt: "csv",
    mimeType: "text/csv;charset=utf-8",
    bytes
  });
}

/**
 * Exporte le carnet complet des bénéficiaires au format Excel natif (.xls)
 */
export async function exportBeneficiariesToExcel(
  records: BeneficiaryRecord[],
  customFilename?: string
): Promise<ExportResult> {
  const dateTag = new Date().toISOString().split("T")[0];
  const filename = customFilename || `repertoire-beneficiaires-${dateTag}.xls`;

  let html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="utf-8" /></head>
    <body>
      <h2>Répertoire des bénéficiaires et fournisseurs</h2>
      <table border="1" cellpadding="6" cellspacing="0">
        <tr style="background:#2A241C;color:#FFFFFF;font-weight:bold;">
          <th>Nom du bénéficiaire</th>
          <th>Alias / Raison sociale</th>
          <th>Téléphone</th>
          <th>Compte / RIB</th>
          <th>Notes</th>
          <th>Chèques émis</th>
          <th>Dernier chèque</th>
          <th>Date d'ajout</th>
        </tr>
  `;

  for (const b of records) {
    html += `
      <tr>
        <td>${b.name}</td>
        <td>${b.nickname || "—"}</td>
        <td>${b.phone || "—"}</td>
        <td style="mso-number-format:'\\@';">${b.rib || "—"}</td>
        <td>${b.note || "—"}</td>
        <td>${b.usageCount || 1}</td>
        <td>${b.lastUsedAt ? b.lastUsedAt.split("T")[0] : "—"}</td>
        <td>${b.createdAt ? b.createdAt.split("T")[0] : "—"}</td>
      </tr>
    `;
  }

  html += `</table></body></html>`;

  const encoder = new TextEncoder();
  const bytes = encoder.encode(html);

  return await saveExportFile({
    defaultFilename: filename,
    filterName: "Classeur Excel (*.xls)",
    filterExt: "xls",
    mimeType: "application/vnd.ms-excel",
    bytes
  });
}

/**
 * Export de l'état de rapprochement bancaire complet sous format Excel
 */
export async function exportBankReconciliationToExcel(
  cheques: ChequeRecord[],
  statementLines: BankStatementLineRecord[],
  accounts: BankAccountRecord[]
): Promise<ExportResult> {
  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `Etat_Rapprochement_Bancaire_${timestamp}.xls`;

  const accountMap = new Map<string, BankAccountRecord>();
  accounts.forEach((a) => accountMap.set(a.id, a));

  let html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="utf-8" />
      <style>
        body { font-family: Calibri, Arial, sans-serif; }
        table { border-collapse: collapse; width: 100%; margin-bottom: 25px; }
        th { background-color: #10B981; color: #FFFFFF; font-weight: bold; border: 1px solid #059669; padding: 6px 10px; }
        td { border: 1px solid #E2E8F0; padding: 5px 8px; font-size: 11pt; }
        .title { font-size: 16pt; font-weight: bold; color: #065F46; }
        .subtitle { font-size: 11pt; color: #64748B; margin-bottom: 15px; }
        .reconciled { background-color: #ECFDF5; }
        .circulation { background-color: #FFFBEB; }
      </style>
    </head>
    <body>
      <div class="title">État de Rapprochement Bancaire</div>
      <div class="subtitle">Généré le ${new Date().toLocaleDateString("fr-FR")} · VCheque Studio Algérie</div>

      <h3>1. Chèques émis & Statut de rapprochement</h3>
      <table>
        <tr>
          <th>Date émission</th>
          <th>N° Chèque</th>
          <th>Bénéficiaire</th>
          <th>Compte bancaire</th>
          <th>Montant (DA)</th>
          <th>Statut bancaire</th>
          <th>Preuve / Rapprochement</th>
        </tr>
  `;

  for (const c of cheques.filter((item) => item.status !== "annule")) {
    const acc = c.accountId ? accountMap.get(c.accountId) : undefined;
    const isReconciled = Boolean(c.reconciledLineId);
    const isCashed = c.status === "encaisse";

    html += `
      <tr class="${isReconciled ? "reconciled" : "circulation"}">
        <td>${c.date}</td>
        <td style="mso-number-format:'\\@';">${c.chequeNumber || "—"}</td>
        <td>${c.beneficiary}</td>
        <td>${acc ? acc.label : c.bankName}</td>
        <td style="text-align: right; mso-number-format:'#,##0.00';">${c.amount}</td>
        <td>${isReconciled ? "Lettré / Encaissé" : isCashed ? (c.isCashedDeclaredWithoutProof ? "Encaissé (Déclaratif)" : "Encaissé") : "En circulation"}</td>
        <td>${isReconciled ? "Rapproché sur relevé" : c.proofAttachmentId ? "Avis bancaire joint" : "—"}</td>
      </tr>
    `;
  }

  html += `
      </table>

      <h3>2. Débits sur relevés bancaires</h3>
      <table>
        <tr>
          <th>Date opération</th>
          <th>Date valeur</th>
          <th>Libellé banque</th>
          <th>N° Chèque extrait</th>
          <th>Débit (DA)</th>
          <th>Statut lettrage</th>
        </tr>
  `;

  for (const l of statementLines.filter((line) => (line.debit || 0) > 0)) {
    const isMatched = l.reconciliationStatus !== "unmatched";

    html += `
      <tr class="${isMatched ? "reconciled" : ""}">
        <td>${l.operationDate}</td>
        <td>${l.valueDate || l.operationDate}</td>
        <td>${l.label}</td>
        <td style="mso-number-format:'\\@';">${l.extractedChequeNumber || l.reference || "—"}</td>
        <td style="text-align: right; mso-number-format:'#,##0.00';">${l.debit?.toFixed(2) || "0.00"}</td>
        <td>${isMatched ? "Lettré" : "En attente"}</td>
      </tr>
    `;
  }

  html += `</table></body></html>`;

  const encoder = new TextEncoder();
  const bytes = encoder.encode(html);

  return await saveExportFile({
    defaultFilename: filename,
    filterName: "Classeur Excel (*.xls)",
    filterExt: "xls",
    mimeType: "application/vnd.ms-excel",
    bytes
  });
}

/**
 * Export du journal d'écritures comptables de trésorerie (Plan comptable SCF algérien)
 */
export async function exportAccountingJournalToExcel(
  cheques: ChequeRecord[],
  accounts: BankAccountRecord[]
): Promise<ExportResult> {
  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `Journal_Tresorerie_Banque_${timestamp}.xls`;

  const accountMap = new Map<string, BankAccountRecord>();
  accounts.forEach((a) => accountMap.set(a.id, a));

  let html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="utf-8" />
      <style>
        body { font-family: Calibri, Arial, sans-serif; }
        table { border-collapse: collapse; width: 100%; }
        th { background-color: #AC8946; color: #FFFFFF; font-weight: bold; border: 1px solid #8E6F32; padding: 6px 10px; }
        td { border: 1px solid #CBD5E1; padding: 5px 8px; font-size: 11pt; }
        .title { font-size: 16pt; font-weight: bold; color: #785E23; }
      </style>
    </head>
    <body>
      <div class="title">Journal des Décaissements / Trésorerie (Banque)</div>
      <div style="color: #64748B; font-size: 11pt; margin-bottom: 15px;">Écritures comptables générées pour importation ERP / SCF Algérie</div>
      <table>
        <tr>
          <th>Journal</th>
          <th>Date écriture</th>
          <th>N° Pièce / Chèque</th>
          <th>Compte Général</th>
          <th>Compte Tiers</th>
          <th>Libellé écriture</th>
          <th>Débit (DA)</th>
          <th>Crédit (DA)</th>
          <th>État Rapprochement</th>
        </tr>
  `;

  for (const c of cheques.filter((item) => item.status !== "annule")) {
    const acc = c.accountId ? accountMap.get(c.accountId) : undefined;
    const bankCode = acc ? "512000" : "512";
    const supplierCode = "401000";
    const ref = c.chequeNumber ? `CHQ ${c.chequeNumber}` : "CHQ";
    const isReconciled = Boolean(c.reconciledLineId);

    // Ligne Débit Tiers (Fournisseur 401000)
    html += `
      <tr>
        <td>BQ</td>
        <td>${c.date}</td>
        <td style="mso-number-format:'\\@';">${ref}</td>
        <td>${supplierCode}</td>
        <td>${c.beneficiary}</td>
        <td>Règlement chèque - ${c.beneficiary}</td>
        <td style="text-align: right; mso-number-format:'#,##0.00';">${c.amount}</td>
        <td style="text-align: right;">0.00</td>
        <td>${isReconciled ? "Lettré" : "En circulation"}</td>
      </tr>
    `;

    // Ligne Crédit Banque (512xxx)
    html += `
      <tr>
        <td>BQ</td>
        <td>${c.date}</td>
        <td style="mso-number-format:'\\@';">${ref}</td>
        <td>${bankCode}</td>
        <td>${acc ? acc.label : c.bankName}</td>
        <td>Émission chèque - ${c.beneficiary}</td>
        <td style="text-align: right;">0.00</td>
        <td style="text-align: right; mso-number-format:'#,##0.00';">${c.amount}</td>
        <td>${isReconciled ? "Lettré" : "En circulation"}</td>
      </tr>
    `;
  }

  html += `</table></body></html>`;

  const encoder = new TextEncoder();
  const bytes = encoder.encode(html);

  return await saveExportFile({
    defaultFilename: filename,
    filterName: "Classeur Excel (*.xls)",
    filterExt: "xls",
    mimeType: "application/vnd.ms-excel",
    bytes
  });
}

