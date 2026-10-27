import React, { useState, useEffect } from "react";
import {
  ShieldAlert,
  Search,
  Calendar,
  Filter,
  X,
  FileDown,
  RotateCcw,
  CheckCircle2,
  Lock,
  Printer,
  FileText,
  User,
  Database,
  Trash2
} from "lucide-react";
import type { AuditLogRecord, AuditActionType } from "../types";
import { getAuditLogs, clearAuditLogs } from "../services/db";
import { saveExportFile } from "../services/exportReports";

interface AuditTrailModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ACTION_COLORS: Record<string, { bg: string; text: string }> = {
  auth_login: { bg: "#EFF6FF", text: "#1D4ED8" },
  auth_lock: { bg: "#FEF3C7", text: "#B45309" },
  cheque_create: { bg: "#ECFDF5", text: "#047857" },
  cheque_print: { bg: "#F0FDF4", text: "#15803D" },
  cheque_cancel: { bg: "#FEF2F2", text: "#B91C1C" },
  reconcile_match: { bg: "#ECFDF5", text: "#065F46" },
  reconcile_unmatch: { bg: "#FFF1F2", text: "#BE123C" },
  backup_export: { bg: "#F5F3FF", text: "#6D28D9" },
  backup_restore: { bg: "#FEFCE8", text: "#A16207" },
  account_create: { bg: "#F0F9FF", text: "#0369A1" },
  account_delete: { bg: "#FEF2F2", text: "#991B1B" }
};

export const AuditTrailModal: React.FC<AuditTrailModalProps> = ({ isOpen, onClose }) => {
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const loadLogs = async () => {
    setLoading(true);
    try {
      const list = await getAuditLogs({
        action: actionFilter,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        searchQuery: searchQuery.trim() || undefined
      });
      setLogs(list);
    } catch (err) {
      console.error("Erreur chargement audit:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadLogs();
    }
  }, [isOpen, actionFilter, startDate, endDate]);

  if (!isOpen) return null;

  const handleExportAuditExcel = async () => {
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `Journal_Audit_Securite_${timestamp}.xls`;

    let html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: Calibri, Arial, sans-serif; }
          table { border-collapse: collapse; width: 100%; }
          th { background-color: #12614A; color: #FFFFFF; font-weight: bold; border: 1px solid #064E3B; padding: 6px 10px; }
          td { border: 1px solid #CBD5E1; padding: 5px 8px; font-size: 11pt; }
        </style>
      </head>
      <body>
        <h2>Journal d'Audit et de Traçabilité des Opérations</h2>
        <p>Généré le ${new Date().toLocaleDateString("fr-FR")} · VCheque Studio Algérie</p>
        <table>
          <tr>
            <th>Horodatage</th>
            <th>Utilisateur</th>
            <th>Rôle</th>
            <th>Action</th>
            <th>Type Entité</th>
            <th>Description de l'opération</th>
          </tr>
    `;

    for (const l of logs) {
      html += `
        <tr>
          <td>${l.timestamp.replace("T", " ").substring(0, 19)}</td>
          <td>${l.userName}</td>
          <td>${l.userRole}</td>
          <td>${l.action}</td>
          <td>${l.entityType}</td>
          <td>${l.description}</td>
        </tr>
      `;
    }

    html += `</table></body></html>`;

    const bytes = new TextEncoder().encode(html);
    await saveExportFile({
      defaultFilename: filename,
      filterName: "Classeur Excel (*.xls)",
      filterExt: "xls",
      mimeType: "application/vnd.ms-excel",
      bytes
    });
  };

  return (
    <div className="account-modal-overlay" role="dialog" aria-modal="true">
      <div className="account-modal-content" style={{ maxWidth: "860px", maxHeight: "88vh", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div className="account-modal-header" style={{ padding: "16px 22px", borderBottom: "1px solid var(--border-color)" }}>
          <div className="account-modal-title-row">
            <div className="account-modal-icon-badge" style={{ background: "rgba(18, 97, 74, 0.12)", color: "#12614A" }}>
              <ShieldAlert size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                Grand Journal d'Audit & Traçabilité des Opérations
              </h2>
              <p style={{ fontSize: "12px", color: "var(--text-secondary)", margin: "2px 0 0 0" }}>
                Registre chronologique infalsifiable des tirages, signatures, lettrages et modifications
              </p>
            </div>
          </div>
          <button
            type="button"
            className="account-modal-close"
            onClick={onClose}
            title="Fermer"
            style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-muted)" }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Toolbar de filtres */}
        <div style={{ padding: "12px 22px", background: "#F8FAFC", borderBottom: "1px solid var(--border-color)", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          {/* Recherche */}
          <div className="history-search-box" style={{ minWidth: "220px", flex: 1 }}>
            <Search size={14} className="history-search-icon" />
            <input
              type="text"
              className="history-search-input"
              placeholder="Rechercher dans l'audit..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadLogs()}
            />
          </div>

          {/* Filtre par Action */}
          <div className="filter-select-wrapper" style={{ width: "170px" }}>
            <select
              className="history-filter-select"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
            >
              <option value="all">Toutes les actions</option>
              <option value="auth_login">Connexions</option>
              <option value="cheque_print">Impressions chèques</option>
              <option value="cheque_cancel">Annulations chèques</option>
              <option value="reconcile_match">Rapprochements bancaires</option>
              <option value="backup_export">Sauvegardes exportées</option>
              <option value="backup_restore">Restaurations</option>
              <option value="account_create">Créations de compte</option>
              <option value="user_update">Gestion utilisateurs</option>
            </select>
          </div>

          {/* Bouton Exporter */}
          <button
            type="button"
            className="btn-action-card"
            onClick={handleExportAuditExcel}
            style={{ padding: "6px 12px", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" }}
            title="Exporter le journal d'audit sous Excel"
          >
            <FileDown size={14} />
            <span>Exporter Excel</span>
          </button>

          {/* Bouton Actualiser */}
          <button
            type="button"
            className="btn-action-card"
            onClick={loadLogs}
            style={{ padding: "6px 10px" }}
            title="Actualiser les entrées"
          >
            <RotateCcw size={14} />
          </button>
        </div>

        {/* Table d'audit */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0" }}>
          <table className="history-table">
            <thead>
              <tr style={{ position: "sticky", top: 0, zIndex: 1 }}>
                <th style={{ width: "135px" }}>Date & Heure</th>
                <th style={{ width: "140px" }}>Opérateur</th>
                <th style={{ width: "130px", textAlign: "center" }}>Action</th>
                <th>Détails de l'opération</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: "center", padding: "30px", color: "var(--text-muted)" }}>
                    Chargement du journal d'audit...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: "center", padding: "30px", color: "var(--text-muted)" }}>
                    Aucun événement d'audit enregistré pour ces filtres.
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const styleConfig = ACTION_COLORS[log.action] || { bg: "#F1F5F9", text: "#475569" };

                  return (
                    <tr key={log.id}>
                      <td>
                        <span className="ht-date-main">
                          {log.timestamp.slice(0, 10)}
                        </span>
                        <span className="ht-date-sub" style={{ fontFamily: "var(--font-mono)" }}>
                          {log.timestamp.slice(11, 19)}
                        </span>
                      </td>
                      <td>
                        <strong style={{ fontSize: "12px", color: "var(--text-primary)" }}>
                          {log.userName}
                        </strong>
                        <span style={{ fontSize: "10px", color: "var(--text-muted)", display: "block", textTransform: "capitalize" }}>
                          {log.userRole}
                        </span>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <span
                          style={{
                            fontSize: "10.5px",
                            fontWeight: 700,
                            padding: "2px 7px",
                            borderRadius: "4px",
                            backgroundColor: styleConfig.bg,
                            color: styleConfig.text,
                            display: "inline-block"
                          }}
                        >
                          {log.action}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontSize: "12px", color: "var(--text-primary)", lineHeight: "1.4" }}>
                          {log.description}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 22px", borderTop: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
            Total : <strong>{logs.length}</strong> événements répertoriés
          </span>
          <button
            type="button"
            className="btn-modal-cancel"
            onClick={onClose}
            style={{ padding: "6px 16px", fontSize: "12px" }}
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
