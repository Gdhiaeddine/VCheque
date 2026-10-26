import React from "react";
import {
  FileText,
  CheckCircle2,
  Printer,
  X,
  FileSpreadsheet,
  Ban
} from "lucide-react";
import { jsPDF } from "jspdf";
import type { BatchExecutionReport } from "../types";

interface BatchReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: BatchExecutionReport | null;
  onGoToHistory?: () => void;
}

export const BatchReportModal: React.FC<BatchReportModalProps> = ({
  isOpen,
  onClose,
  report,
  onGoToHistory
}) => {
  if (!isOpen || !report) return null;

  const handleExportPdf = () => {
    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 15;
      let y = 18;

      // Titre & En-tête
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(18, 97, 74); // Luxury Green
      doc.text("RAPPORT D'EXÉCUTION — TRAITEMENT EN LOT", margin, y);
      y += 6;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(100, 116, 139);
      doc.text(`Édité le ${new Date().toLocaleDateString("fr-FR")} à ${new Date().toLocaleTimeString("fr-FR")} · Dossier : ${report.companyName}`, margin, y);
      y += 10;

      // Cadre des statistiques
      doc.setDrawColor(226, 232, 240);
      doc.setFillColor(250, 248, 245);
      doc.roundedRect(margin, y, pageWidth - margin * 2, 24, 2, 2, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);

      const colW = (pageWidth - margin * 2) / 4;
      doc.text("Total Lignes :", margin + 6, y + 8);
      doc.text("Chèques Enregistrés :", margin + colW + 6, y + 8);
      doc.text("Chèques Imprimés :", margin + colW * 2 + 6, y + 8);
      doc.text("Total Décaissé :", margin + colW * 3 + 6, y + 8);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(18, 97, 74);
      doc.text(String(report.totalRowsRead), margin + 6, y + 18);
      doc.text(String(report.totalImported), margin + colW + 6, y + 18);
      doc.text(String(report.totalPrinted), margin + colW * 2 + 6, y + 18);
      doc.text(`${report.totalAmountFormatted} DA`, margin + colW * 3 + 6, y + 18);

      y += 32;

      // En-tête du tableau des chèques
      doc.setFillColor(18, 97, 74);
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(9);
      doc.rect(margin, y, pageWidth - margin * 2, 8, "F");

      doc.text("Bénéficiaire", margin + 4, y + 5.5);
      doc.text("N° Chèque", margin + 85, y + 5.5);
      doc.text("Montant (DA)", margin + 120, y + 5.5);
      doc.text("Statut", margin + 155, y + 5.5);
      y += 8;

      // Lignes
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(30, 41, 59);

      for (let i = 0; i < report.items.length; i++) {
        const it = report.items[i];
        if (y > 275) {
          doc.addPage();
          y = 18;
        }

        const isOdd = i % 2 === 1;
        if (isOdd) {
          doc.setFillColor(248, 250, 252);
          doc.rect(margin, y, pageWidth - margin * 2, 7, "F");
        }

        doc.text((it.beneficiary || "—").slice(0, 40), margin + 4, y + 5);
        doc.text(it.chequeNumber || "—", margin + 85, y + 5);
        doc.text(it.amount, margin + 120, y + 5);

        const statusLabel = it.status === "printed" ? "Imprimé" : it.status === "saved" ? "Enregistré" : "Ignoré";
        doc.text(statusLabel, margin + 155, y + 5);

        y += 7;
      }

      const dateStr = new Date().toISOString().split("T")[0];
      doc.save(`rapport-lot-${dateStr}.pdf`);
    } catch (err) {
      console.error("Erreur génération PDF rapport:", err);
    }
  };

  const handleExportExcel = () => {
    try {
      const rowsXml = report.items
        .map(
          (it, idx) => `
        <Row>
          <Cell><Data ss:Type="Number">${idx + 1}</Data></Cell>
          <Cell><Data ss:Type="String">${escapeXml(it.beneficiary)}</Data></Cell>
          <Cell><Data ss:Type="String">${escapeXml(it.chequeNumber || "")}</Data></Cell>
          <Cell><Data ss:Type="String">${escapeXml(it.amount)}</Data></Cell>
          <Cell><Data ss:Type="String">${escapeXml(it.status === "printed" ? "Imprimé" : it.status === "saved" ? "Enregistré" : "Ignoré")}</Data></Cell>
          <Cell><Data ss:Type="String">${escapeXml(it.reason || "")}</Data></Cell>
        </Row>`
        )
        .join("");

      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Rapport Traitement">
  <Table>
   <Column ss:Width="40"/>
   <Column ss:Width="200"/>
   <Column ss:Width="100"/>
   <Column ss:Width="120"/>
   <Column ss:Width="100"/>
   <Column ss:Width="200"/>
   <Row>
    <Cell><Data ss:Type="String">N°</Data></Cell>
    <Cell><Data ss:Type="String">Bénéficiaire</Data></Cell>
    <Cell><Data ss:Type="String">N° Chèque</Data></Cell>
    <Cell><Data ss:Type="String">Montant (DA)</Data></Cell>
    <Cell><Data ss:Type="String">Statut</Data></Cell>
    <Cell><Data ss:Type="String">Détails</Data></Cell>
   </Row>
   ${rowsXml}
  </Table>
 </Worksheet>
</Workbook>`;

      const blob = new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rapport-traitement-lot-${new Date().toISOString().split("T")[0]}.xls`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Erreur export Excel rapport:", err);
    }
  };

  const escapeXml = (str: string) => {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  };

  return (
    <div className="statement-modal-overlay" role="dialog" aria-modal="true">
      <div
        className="statement-modal-content batch-modal-window"
        style={{ width: "920px", maxWidth: "95vw" }}
      >
        {/* En-tête standard du modal */}
        <div className="statement-modal-header">
          <div className="statement-header-left">
            <div className="statement-icon-badge">
              <CheckCircle2 size={20} />
            </div>
            <div>
              <div className="statement-title-row">
                <h2 className="statement-title">Compte-rendu du traitement en lot</h2>
              </div>
              <p className="statement-subtitle">
                Opération effectuée pour l'entreprise <strong>{report.companyName}</strong>
                {report.accountLabel && ` · Compte : ${report.accountLabel}`}
              </p>
            </div>
          </div>

          <button
            type="button"
            className="statement-close-btn"
            onClick={onClose}
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        </div>

        {/* 4 Cartes KPIs dans le style exact de BeneficiaryStatementModal */}
        <div className="statement-kpis-grid" style={{ padding: "16px 24px" }}>
          <div className="statement-kpi-card highlight-green">
            <span className="kpi-label">Montant global décaissé</span>
            <strong className="kpi-amount">{report.totalAmountFormatted} DZD</strong>
            <span className="kpi-sub">Total cumulé des chèques émis</span>
          </div>

          <div className="statement-kpi-card">
            <span className="kpi-label">Lignes analysées</span>
            <strong className="kpi-val">{report.totalRowsRead}</strong>
            <span className="kpi-sub">Total du fichier</span>
          </div>

          <div className="statement-kpi-card">
            <span className="kpi-label">Chèques enregistrés</span>
            <strong className="kpi-val text-green">{report.totalImported}</strong>
            <span className="kpi-sub">Ajoutés à l'historique</span>
          </div>

          <div className="statement-kpi-card">
            <span className="kpi-label">Chèques imprimés</span>
            <strong className="kpi-val" style={{ color: "var(--gold-dark)" }}>
              {report.totalPrinted}
            </strong>
            <span className="kpi-sub">Passés en machine</span>
          </div>
        </div>

        {/* Corps : Tableau détaillé */}
        <div className="statement-modal-body" style={{ padding: "0 24px 18px" }}>
          <div className="statement-toolbar-row" style={{ padding: "10px 0", borderBottom: "1px solid var(--border-color)" }}>
            <span className="statement-table-title">Détail des chèques traités</span>
            <span className="statement-table-count">({report.items.length} opérations)</span>
          </div>

          <div className="batch-table-wrap" style={{ maxHeight: "320px", marginTop: 8 }}>
            <table className="batch-table">
              <thead>
                <tr>
                  <th style={{ width: 44, textAlign: "center" }}>N°</th>
                  <th>Bénéficiaire</th>
                  <th style={{ width: 110 }}>N° Chèque</th>
                  <th style={{ width: 140, textAlign: "right" }}>Montant (DZD)</th>
                  <th style={{ width: 120 }}>Statut</th>
                  <th>Détails</th>
                </tr>
              </thead>
              <tbody>
                {report.items.map((item, idx) => (
                  <tr key={idx}>
                    <td style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: 11 }}>
                      {idx + 1}
                    </td>
                    <td>
                      <strong style={{ color: "var(--text-primary)" }}>{item.beneficiary}</strong>
                    </td>
                    <td className="font-mono">{item.chequeNumber || "—"}</td>
                    <td style={{ textAlign: "right", fontWeight: 700, color: "var(--text-primary)" }}>
                      {item.amount}
                    </td>
                    <td>
                      <span
                        className="statement-status-tag"
                        style={{
                          background: item.status === "printed" ? "#ecfdf5" : item.status === "saved" ? "#eff6ff" : "#fef2f2",
                          color: item.status === "printed" ? "#047857" : item.status === "saved" ? "#1d4ed8" : "#b91c1c",
                          border: `1px solid ${item.status === "printed" ? "#a7f3d0" : item.status === "saved" ? "#bfdbfe" : "#fecaca"}`
                        }}
                      >
                        {item.status === "printed" ? (
                          <>
                            <Printer size={11} /> Imprimé
                          </>
                        ) : item.status === "saved" ? (
                          <>
                            <CheckCircle2 size={11} /> Prêt
                          </>
                        ) : (
                          <>
                            <Ban size={11} /> Ignoré
                          </>
                        )}
                      </span>
                    </td>
                    <td style={{ color: "var(--text-secondary)", fontSize: 11.5 }}>
                      {item.reason || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pied de page modal standard */}
        <div className="statement-toolbar-row batch-modal-footer">
          <div className="footer-left" style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="btn-acc-cancel"
              onClick={handleExportPdf}
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <FileText size={14} className="field-icon-gold" />
              <span>Télécharger le Rapport PDF</span>
            </button>
            <button
              type="button"
              className="btn-acc-cancel"
              onClick={handleExportExcel}
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <FileSpreadsheet size={14} className="text-emerald" />
              <span>Exporter en Excel (.xls)</span>
            </button>
          </div>

          <div className="footer-right" style={{ display: "flex", gap: 10 }}>
            {onGoToHistory && (
              <button
                type="button"
                className="btn-acc-cancel"
                onClick={() => {
                  onClose();
                  onGoToHistory();
                }}
              >
                <span>Voir dans l'Historique</span>
              </button>
            )}
            <button
              type="button"
              className="btn-action-luxury-green"
              onClick={onClose}
            >
              <span>Terminer</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
