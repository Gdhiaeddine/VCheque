import React, { useState, useRef } from "react";
import {
  FileSpreadsheet,
  Upload,
  CreditCard,
  Calendar,
  AlertCircle,
  CheckCircle2,
  X,
  FileText,
  Layers,
  ArrowRight
} from "lucide-react";
import type { BankAccountRecord, BankStatementRecord, BankStatementLineRecord } from "../types";
import { parseExcelOrCsvStatement, type ParsedStatementResult } from "../services/bankStatementParser";
import { saveBankStatement, getActiveCompanyId } from "../services/db";

interface BankStatementImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: BankAccountRecord[];
  activeAccountId?: string | null;
  onImportSuccess?: (statement: BankStatementRecord) => void;
}

export const BankStatementImportModal: React.FC<BankStatementImportModalProps> = ({
  isOpen,
  onClose,
  accounts,
  activeAccountId,
  onImportSuccess
}) => {
  const [selectedAccountId, setSelectedAccountId] = useState<string>(() => {
    return activeAccountId || (accounts.length > 0 ? accounts[0].id : "");
  });

  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState<boolean>(false);
  const [parsedResult, setParsedResult] = useState<ParsedStatementResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileSelected = async (f: File) => {
    setFile(f);
    setParseError(null);
    setParsing(true);
    setParsedResult(null);

    try {
      const res = await parseExcelOrCsvStatement(f);
      if (res.lines.length === 0) {
        setParseError("Aucune ligne de mouvement financier n'a été détectée dans ce fichier.");
      } else {
        setParsedResult(res);
      }
    } catch (err: any) {
      console.error("Erreur parsing relevé:", err);
      setParseError(err.message || "Erreur lors de la lecture du fichier de relevé.");
    } finally {
      setParsing(false);
    }
  };

  const handleSaveImport = async () => {
    if (!parsedResult || !selectedAccountId) return;
    setSaving(true);

    try {
      const compId = getActiveCompanyId();
      const statementId = `stmt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

      const statementRecord: BankStatementRecord = {
        id: statementId,
        companyId: compId,
        accountId: selectedAccountId,
        fileName: parsedResult.fileName,
        fileFormat: parsedResult.fileFormat,
        statementDate: new Date().toISOString(),
        periodStart: parsedResult.periodStart,
        periodEnd: parsedResult.periodEnd,
        totalDebit: parsedResult.totalDebit,
        totalCredit: parsedResult.totalCredit,
        linesCount: parsedResult.lines.length,
        reconciledCount: 0,
        createdAt: new Date().toISOString()
      };

      const statementLines: BankStatementLineRecord[] = parsedResult.lines.map((l, idx) => ({
        ...l,
        id: `line-${statementId}-${idx + 1}`,
        statementId,
        accountId: selectedAccountId,
        companyId: compId
      }));

      await saveBankStatement(statementRecord, statementLines);
      onImportSuccess?.(statementRecord);
      onClose();
    } catch (err: any) {
      console.error("Erreur sauvegarde relevé:", err);
      setParseError("Erreur lors de la sauvegarde du relevé dans la base.");
    } finally {
      setSaving(false);
    }
  };

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);

  return (
    <div className="account-modal-overlay" role="dialog" aria-modal="true">
      <div className="account-modal-content" style={{ maxWidth: "800px", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div className="account-modal-header" style={{ borderBottom: "1px solid var(--border-color)", padding: "16px 22px" }}>
          <div className="account-modal-title-row">
            <div className="account-modal-icon-badge">
              <FileSpreadsheet size={20} className="text-gold" />
            </div>
            <div>
              <h2 style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                Importer un relevé bancaire
              </h2>
              <p style={{ fontSize: "12px", color: "var(--text-secondary)", margin: "2px 0 0 0" }}>
                Importez vos opérations au format CSV, Excel (.xlsx) ou OFX pour le rapprochement
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

        {/* Corps */}
        <div style={{ padding: "20px 22px", overflowY: "auto", flex: 1 }}>
          {/* 1. Sélection du compte bancaire émetteur */}
          <div style={{ marginBottom: "16px" }}>
            <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
              <CreditCard size={14} className="text-gold" />
              <span>Compte bancaire rattaché à ce relevé :</span>
            </label>
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: "8px",
                border: "1px solid var(--border-color)",
                background: "#FFF",
                fontSize: "13px",
                color: "var(--text-primary)"
              }}
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.label} ({acc.ribOrIban ? `RIB ...${acc.ribOrIban.slice(-4)}` : "Sans RIB"}) — Solde {acc.balance.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} DA
                </option>
              ))}
            </select>
          </div>

          {/* 2. Zone de dépôt de fichier */}
          <div
            className={`attachment-dropzone ${isDragging ? "is-dragging" : ""}`}
            style={{ padding: "20px", cursor: "pointer", textAlign: "center", border: "2px dashed var(--border-color)", borderRadius: "10px", background: "var(--bg-secondary)" }}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const files = e.dataTransfer.files;
              if (files && files.length > 0) {
                handleFileSelected(files[0]);
              }
            }}
          >
            <div style={{ width: "42px", height: "42px", borderRadius: "10px", background: "rgba(172, 137, 70, 0.12)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 10px auto" }}>
              <Upload size={22} className="text-gold" />
            </div>
            <strong style={{ fontSize: "14px", display: "block", color: "var(--text-primary)" }}>
              {file ? file.name : "Cliquez ou glissez votre relevé bancaire ici"}
            </strong>
            <span style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px", display: "block" }}>
              Formats pris en charge : <strong>Excel (.xlsx, .xls)</strong>, <strong>CSV (avec séparateur virgule ou point-virgule)</strong>, <strong>OFX bancaire</strong>
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls,.ofx,.qif"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileSelected(f);
              }}
            />
          </div>

          {/* Erreur */}
          {parseError && (
            <div style={{ marginTop: "14px", background: "#FEF2F2", border: "1px solid #FCA5A5", borderRadius: "8px", padding: "10px 14px", display: "flex", alignItems: "center", gap: "10px", color: "#B91C1C", fontSize: "12.5px" }}>
              <AlertCircle size={16} />
              <span>{parseError}</span>
            </div>
          )}

          {/* Indicateur de chargement */}
          {parsing && (
            <div style={{ textAlign: "center", padding: "20px", color: "var(--text-secondary)", fontSize: "13px" }}>
              Analyse et extraction automatique des lignes du relevé...
            </div>
          )}

          {/* 3. Aperçu des données extraites */}
          {parsedResult && !parsing && (
            <div style={{ marginTop: "18px" }}>
              {/* Synthèse du relevé */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px", marginBottom: "14px" }}>
                <div style={{ background: "var(--bg-secondary)", padding: "10px 12px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block" }}>Lignes détectées</span>
                  <strong style={{ fontSize: "15px", color: "var(--text-primary)" }}>{parsedResult.lines.length}</strong>
                </div>
                <div style={{ background: "var(--bg-secondary)", padding: "10px 12px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block" }}>Total Débits (DA)</span>
                  <strong style={{ fontSize: "15px", color: "#DC2626" }}>
                    {parsedResult.totalDebit.toLocaleString("fr-FR", { minimumFractionDigits: 2 })}
                  </strong>
                </div>
                <div style={{ background: "var(--bg-secondary)", padding: "10px 12px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block" }}>Total Crédits (DA)</span>
                  <strong style={{ fontSize: "15px", color: "#16A34A" }}>
                    {parsedResult.totalCredit.toLocaleString("fr-FR", { minimumFractionDigits: 2 })}
                  </strong>
                </div>
                <div style={{ background: "var(--bg-secondary)", padding: "10px 12px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block" }}>Période couverte</span>
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>
                    {parsedResult.periodStart ? `${parsedResult.periodStart} au ${parsedResult.periodEnd}` : "Non spécifiée"}
                  </span>
                </div>
              </div>

              {/* Table d'aperçu des premières lignes */}
              <div style={{ border: "1px solid var(--border-color)", borderRadius: "8px", overflow: "hidden" }}>
                <div style={{ padding: "8px 12px", background: "#F8FAFC", borderBottom: "1px solid var(--border-color)", fontSize: "12px", fontWeight: 700, color: "var(--text-secondary)", display: "flex", justifyContent: "space-between" }}>
                  <span>Aperçu des opérations extraites (10 premières lignes)</span>
                  <span>Format détecté : {parsedResult.fileFormat.toUpperCase()}</span>
                </div>
                <div style={{ maxHeight: "200px", overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11.5px" }}>
                    <thead>
                      <tr style={{ background: "#F1F5F9", textAlign: "left" }}>
                        <th style={{ padding: "6px 10px" }}>Date</th>
                        <th style={{ padding: "6px 10px" }}>Libellé bancaire</th>
                        <th style={{ padding: "6px 10px" }}>N° Chèque détecté</th>
                        <th style={{ padding: "6px 10px", textAlign: "right" }}>Débit (DA)</th>
                        <th style={{ padding: "6px 10px", textAlign: "right" }}>Crédit (DA)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedResult.lines.slice(0, 10).map((l, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid #F1F5F9" }}>
                          <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>{l.operationDate}</td>
                          <td style={{ padding: "6px 10px", maxWidth: "260px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={l.label}>
                            {l.label}
                          </td>
                          <td style={{ padding: "6px 10px" }}>
                            {l.extractedChequeNumber ? (
                              <span style={{ background: "rgba(172, 137, 70, 0.12)", color: "var(--gold-dark)", padding: "1px 6px", borderRadius: "4px", fontWeight: 600 }}>
                                #{l.extractedChequeNumber}
                              </span>
                            ) : (
                              <span style={{ color: "var(--text-muted)" }}>-</span>
                            )}
                          </td>
                          <td style={{ padding: "6px 10px", textAlign: "right", color: l.debit ? "#DC2626" : "var(--text-muted)", fontWeight: l.debit ? 600 : 400 }}>
                            {l.debit ? l.debit.toLocaleString("fr-FR", { minimumFractionDigits: 2 }) : "-"}
                          </td>
                          <td style={{ padding: "6px 10px", textAlign: "right", color: l.credit ? "#16A34A" : "var(--text-muted)", fontWeight: l.credit ? 600 : 400 }}>
                            {l.credit ? l.credit.toLocaleString("fr-FR", { minimumFractionDigits: 2 }) : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 22px", borderTop: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button
            type="button"
            className="btn-modal-cancel"
            onClick={onClose}
            style={{ padding: "8px 16px", fontSize: "12.5px" }}
          >
            Annuler
          </button>

          <button
            type="button"
            className="btn-action-luxury-green"
            disabled={!parsedResult || parsing || saving || !selectedAccountId}
            onClick={handleSaveImport}
            style={{ padding: "8px 18px", fontSize: "12.5px", display: "flex", alignItems: "center", gap: "6px" }}
          >
            <CheckCircle2 size={16} />
            <span>{saving ? "Enregistrement..." : "Valider et importer le relevé"}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
