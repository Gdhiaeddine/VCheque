import type { ChequeRecord, ChequeStatus } from "../types";
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
    const parts = dateStr.split("T")[0].split("-");
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

/**
 * Exporte une liste de chèques au format CSV (encodage UTF-8 avec BOM pour ouverture parfaite dans Excel)
 */
export function exportChequesToCsv(records: ChequeRecord[], customFilename?: string): void {
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

  const rows: string[] = [headers.map(escapeCsv).join(";")];

  for (const item of records) {
    const rawNum = parseFloat((item.amount || "0").replace(/\s/g, "").replace(",", ".")) || 0;
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

  // BOM UTF-8 (\uFEFF) pour garantir que Microsoft Excel détecte immédiatement l'encodage UTF-8 (accents et arabe)
  const csvContent = "\uFEFF" + rows.join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const dateTag = new Date().toISOString().split("T")[0];
  a.download = customFilename || `cheques-historique-${dateTag}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Exporte une liste de chèques au format Excel Spreadsheet XML natif (.xls)
 * Compatible avec toutes les versions d'Excel, LibreOffice Calc et Google Sheets avec styles et totaux.
 */
export function exportChequesToExcel(records: ChequeRecord[], customFilename?: string): void {
  const sanitizeXml = (str: any): string => {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  };

  let rowsXml = "";

  // En-têtes
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

  rowsXml += `    <Row ss:StyleID="HeaderRow">\n`;
  for (const h of headers) {
    rowsXml += `      <Cell><Data ss:Type="String">${sanitizeXml(h)}</Data></Cell>\n`;
  }
  rowsXml += `    </Row>\n`;

  let totalActive = 0;

  // Lignes de données
  for (const item of records) {
    const rawNum = parseFloat((item.amount || "0").replace(/\s/g, "").replace(",", ".")) || 0;
    if (item.status !== "annule") {
      totalActive += rawNum;
    }
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

  // Ligne de total
  rowsXml += `    <Row ss:StyleID="TotalRow">\n`;
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

  const blob = new Blob([excelTemplate], { type: "application/vnd.ms-excel;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const dateTag = new Date().toISOString().split("T")[0];
  a.download = customFilename || `cheques-historique-${dateTag}.xls`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
