import React, { useState, useEffect } from "react";
import {
  FileText,
  User,
  Phone,
  Hash,
  Calendar,
  CheckCircle2,
  Clock,
  XCircle,
  FileDown,
  FileSpreadsheet,
  RotateCcw,
  X,
  CreditCard,
  Building,
  ArrowRight
} from "lucide-react";
import type { BeneficiaryRecord, ChequeRecord } from "../types";
import {
  getBeneficiaryStatement,
  type BeneficiaryStatementResult,
  getActiveCompany
} from "../services/db";
import {
  exportChequesToPdf,
  exportChequesToExcel,
  exportChequesToCsv,
  STATUS_LABELS
} from "../services/exportReports";

interface BeneficiaryStatementModalProps {
  beneficiaryName: string | null;
  isOpen: boolean;
  onClose: () => void;
  onCreateChequeForBeneficiary?: (name: string) => void;
}

export const BeneficiaryStatementModal: React.FC<BeneficiaryStatementModalProps> = ({
  beneficiaryName,
  isOpen,
  onClose,
  onCreateChequeForBeneficiary
}) => {
  const [statement, setStatement] = useState<BeneficiaryStatementResult | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [companyName, setCompanyName] = useState<string>("Mon Entreprise");

  const loadData = async () => {
    if (!beneficiaryName) return;
    setLoading(true);
    try {
      const comp = await getActiveCompany();
      if (comp) setCompanyName(comp.name);
      const res = await getBeneficiaryStatement(beneficiaryName);
      setStatement(res);
    } catch (err) {
      console.error("Erreur chargement relevé bénéficiaire:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && beneficiaryName) {
      loadData();
    }
  }, [isOpen, beneficiaryName]);

  if (!isOpen || !beneficiaryName) return null;

  const ben = statement?.beneficiary;

  // Formatage des montants
  const formatAmount = (val: number) => {
    return val.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " DA";
  };

  const handleExportPdf = async () => {
    if (!statement || statement.cheques.length === 0) return;
    try {
      setIsExporting(true);
      const dateTag = new Date().toISOString().split("T")[0];
      const safeName = beneficiaryName.toLowerCase().replace(/[^a-z0-9]/g, "-");
      await exportChequesToPdf(statement.cheques, {
        customFilename: `releve-paiements-${safeName}-${dateTag}.pdf`,
        reportTitle: `RELEVÉ DES PAIEMENTS : ${beneficiaryName.toUpperCase()}`,
        reportSubtitle: `Historique officiel des règlements par chèque bancaire émis par ${companyName}`,
        activeFilterSummary: `Bénéficiaire : ${beneficiaryName} | Total cumulé : ${formatAmount(statement.totalAmountNumeric)} | Chèques émis : ${statement.totalChequesCount}`,
        companyName
      });
    } catch (err) {
      console.error("Erreur export PDF relevé:", err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportExcel = async () => {
    if (!statement || statement.cheques.length === 0) return;
    try {
      setIsExporting(true);
      const dateTag = new Date().toISOString().split("T")[0];
      const safeName = beneficiaryName.toLowerCase().replace(/[^a-z0-9]/g, "-");
      await exportChequesToExcel(statement.cheques, {
        customFilename: `releve-paiements-${safeName}-${dateTag}.xls`,
        reportTitle: `RELEVÉ DE COMPTE BÉNÉFICIAIRE : ${beneficiaryName}`,
        reportSubtitle: `Émis par : ${companyName}`,
        activeFilterSummary: `Bénéficiaire : ${beneficiaryName} | Montant cumulé : ${formatAmount(statement.totalAmountNumeric)}`
      });
    } catch (err) {
      console.error("Erreur export Excel relevé:", err);
    } finally {
      setIsExporting(false);
    }
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case "encaisse":
        return (
          <span className="statement-status-tag encaisse">
            <CheckCircle2 size={11} /> Encaissé
          </span>
        );
      case "printed":
      case "remis":
        return (
          <span className="statement-status-tag printed">
            <CheckCircle2 size={11} /> {status === "remis" ? "Remis" : "Imprimé"}
          </span>
        );
      case "annule":
        return (
          <span className="statement-status-tag annule">
            <XCircle size={11} /> Annulé
          </span>
        );
      default:
        return (
          <span className="statement-status-tag brouillon">
            <Clock size={11} /> Brouillon
          </span>
        );
    }
  };

  return (
    <div className="statement-modal-overlay" role="dialog" aria-modal="true">
      <div className="statement-modal-content">
        {/* Header du modal */}
        <div className="statement-modal-header">
          <div className="statement-header-left">
            <div className="statement-icon-badge">
              <FileText size={20} />
            </div>
            <div>
              <div className="statement-title-row">
                <h2 className="statement-title">Relevé de compte du bénéficiaire</h2>
                {ben?.nickname && <span className="statement-nickname-tag">{ben.nickname}</span>}
              </div>
              <p className="statement-subtitle">
                Historique chronologique et financier de tous les règlements par chèque émis au profit de{" "}
                <strong style={{ color: "var(--text-primary)" }}>{beneficiaryName}</strong>.
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

        {/* Fiche coordonnées du bénéficiaire */}
        <div className="statement-beneficiary-card">
          <div className="beneficiary-meta-item">
            <span className="meta-label">Bénéficiaire :</span>
            <strong className="meta-val">{beneficiaryName}</strong>
          </div>
          {ben?.phone && (
            <div className="beneficiary-meta-item">
              <Phone size={13} className="meta-icon" />
              <span className="meta-label">Téléphone :</span>
              <strong className="meta-val">{ben.phone}</strong>
            </div>
          )}
          {ben?.rib && (
            <div className="beneficiary-meta-item">
              <CreditCard size={13} className="meta-icon" />
              <span className="meta-label">Compte / RIB :</span>
              <strong className="meta-val rib-font">{ben.rib}</strong>
            </div>
          )}
          {ben?.note && (
            <div className="beneficiary-meta-item full-width">
              <span className="meta-label">Notes :</span>
              <span className="meta-val italic">{ben.note}</span>
            </div>
          )}
        </div>

        {/* KPI synthétiques */}
        {statement && (
          <div className="statement-kpis-grid">
            <div className="statement-kpi-card highlight-green">
              <span className="kpi-label">Montant total cumulé réglé</span>
              <strong className="kpi-amount">{formatAmount(statement.totalAmountNumeric)}</strong>
              <span className="kpi-sub">Total des chèques valides</span>
            </div>

            <div className="statement-kpi-card">
              <span className="kpi-label">Volume total de chèques</span>
              <strong className="kpi-val">{statement.totalChequesCount}</strong>
              <span className="kpi-sub">Émis dans l'historique</span>
            </div>

            <div className="statement-kpi-card">
              <span className="kpi-label">Chèques encaissés / remis</span>
              <strong className="kpi-val text-green">
                {statement.cashedCount + statement.printedCount}
              </strong>
              <span className="kpi-sub">
                {statement.cashedCount} encaissés · {statement.printedCount} imprimés
              </span>
            </div>

            <div className="statement-kpi-card">
              <span className="kpi-label">Chèques annulés / rejetés</span>
              <strong className="kpi-val text-red">{statement.cancelledCount}</strong>
              <span className="kpi-sub">Exclus du cumul payé</span>
            </div>
          </div>
        )}

        {/* Barre d'actions du relevé */}
        <div className="statement-toolbar-row">
          <div className="toolbar-left-info">
            <span className="statement-table-title">Détail des règlements par chèque</span>
            <span className="statement-table-count">
              ({statement?.cheques.length || 0} écriture{statement && statement.cheques.length > 1 ? "s" : ""})
            </span>
          </div>

          <div className="toolbar-actions-group">
            <button
              type="button"
              className="btn-statement-export pdf"
              onClick={handleExportPdf}
              disabled={isExporting || !statement || statement.cheques.length === 0}
              title="Exporter le relevé officiel en PDF"
            >
              <FileDown size={15} />
              <span>Exporter en PDF</span>
            </button>

            <button
              type="button"
              className="btn-statement-export excel"
              onClick={handleExportExcel}
              disabled={isExporting || !statement || statement.cheques.length === 0}
              title="Exporter le relevé au format Excel"
            >
              <FileSpreadsheet size={15} />
              <span>Exporter en Excel</span>
            </button>

            {onCreateChequeForBeneficiary && (
              <button
                type="button"
                className="btn-statement-create-cheque"
                onClick={() => {
                  onClose();
                  onCreateChequeForBeneficiary(beneficiaryName);
                }}
                title="Pré-remplir un nouveau chèque pour ce bénéficiaire"
              >
                <span>Émettre un chèque</span>
                <ArrowRight size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Tableau chronologique des chèques */}
        <div className="statement-table-wrapper">
          {loading ? (
            <div className="statement-loading">
              <RotateCcw className="spinner-icon" size={20} />
              <span>Chargement du relevé des paiements...</span>
            </div>
          ) : !statement || statement.cheques.length === 0 ? (
            <div className="statement-empty">
              <p>Aucun chèque n'a encore été émis au profit de ce bénéficiaire dans ce dossier d'entreprise.</p>
            </div>
          ) : (
            <table className="statement-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>N° Chèque</th>
                  <th>Banque</th>
                  <th>Réf / Facture</th>
                  <th className="text-right">Montant (DZD)</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {statement.cheques.map((ch) => {
                  const val = parseFloat((ch.amount || "0").replace(/\s/g, "").replace(",", ".")) || 0;
                  const isCancelled = ch.status === "annule";
                  return (
                    <tr key={ch.id} className={isCancelled ? "row-cancelled" : ""}>
                      <td className="col-date">
                        <span className="date-badge">
                          <Calendar size={11} />
                          {ch.date}
                        </span>
                      </td>
                      <td className="col-num">
                        {ch.chequeNumber ? (
                          <span className="cheque-num-badge">N° {ch.chequeNumber}</span>
                        ) : (
                          <span className="cheque-num-none">—</span>
                        )}
                      </td>
                      <td className="col-bank">
                        <span className="bank-name-label">{ch.bankName}</span>
                      </td>
                      <td className="col-ref">
                        {ch.reference ? (
                          <span className="ref-badge" title={ch.reference}>
                            {ch.reference}
                          </span>
                        ) : (
                          <span className="ref-none">—</span>
                        )}
                      </td>
                      <td className={`col-amount text-right ${isCancelled ? "amount-cancelled" : ""}`}>
                        {formatAmount(val)}
                      </td>
                      <td className="col-status">
                        {renderStatusBadge(ch.status)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
