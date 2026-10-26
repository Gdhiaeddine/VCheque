import React, { useState } from "react";
import {
  Printer,
  X,
  SkipForward,
  Building2,
  FileText,
  StopCircle,
  ChevronRight
} from "lucide-react";
import type {
  BatchItem,
  BankAccountRecord,
  ChequeBookRecord,
  BankTemplate,
  BatchExecutionReport,
  PrintSettings
} from "../types";

export interface BatchRunnerResultItem {
  beneficiary: string;
  amount: string;
  chequeNumber?: string;
  status: "saved" | "printed" | "skipped";
  reason?: string;
  numericAmount: number;
}

interface BatchPrintRunnerModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: BatchItem[];
  targetAccount?: BankAccountRecord;
  targetChequeBook?: ChequeBookRecord;
  templates: BankTemplate[];
  printSettings: PrintSettings;
  companyId: string;
  companyName: string;
  onPrintCurrentItem: (
    item: BatchItem,
    assignedChequeNumber: string
  ) => Promise<{ success: boolean; error?: string; chequeId: string }>;
  onFinishRunner: (report: BatchExecutionReport) => void;
}

export const BatchPrintRunnerModal: React.FC<BatchPrintRunnerModalProps> = ({
  isOpen,
  onClose,
  items,
  targetAccount,
  targetChequeBook,
  templates,
  printSettings,
  companyId,
  companyName,
  onPrintCurrentItem,
  onFinishRunner
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPrintingCurrent, setIsPrintingCurrent] = useState(false);

  // Résultats cumulés d'exécution
  const [results, setResults] = useState<BatchRunnerResultItem[]>([]);

  // Numérotation courante
  const initialNum = targetChequeBook
    ? targetChequeBook.currentNumber
    : "0000001";
  const [nextChequeNum, setNextChequeNum] = useState<string>(initialNum);

  if (!isOpen || items.length === 0) return null;

  const currentItem = items[currentIndex];
  const totalItems = items.length;
  const progressPercent = Math.round((currentIndex / totalItems) * 100);

  // Trouver le modèle bancaire associé
  const currentBankTemplate =
    templates.find((t) => t.id === targetAccount?.bankTemplateId) ||
    templates[0];

  // Calcul du prochain numéro de chèque
  const calculateNextNumber = (current: string): string => {
    const parsed = parseInt(current, 10);
    if (isNaN(parsed)) return current;
    return String(parsed + 1).padStart(current.length, "0");
  };

  // Terminer le processus et générer le rapport
  const completeRunner = (finalResults: BatchRunnerResultItem[]) => {
    const printedCount = finalResults.filter((r) => r.status === "printed").length;
    const skippedCount = finalResults.filter((r) => r.status === "skipped").length;
    const totalAmount = finalResults
      .filter((r) => r.status === "printed")
      .reduce((sum, r) => sum + r.numericAmount, 0);

    const report: BatchExecutionReport = {
      batchId: "batch-runner-" + Date.now(),
      companyId: companyId || "company-default",
      companyName: companyName || "Virtanis",
      accountId: targetAccount?.id,
      accountLabel: targetAccount ? `${targetAccount.label} (${targetAccount.ribOrIban})` : undefined,
      totalRowsRead: totalItems,
      totalImported: finalResults.length,
      totalPrinted: printedCount,
      totalErrors: skippedCount,
      totalDuplicatesDetected: 0,
      totalAmountNumeric: totalAmount,
      totalAmountFormatted: totalAmount.toLocaleString("fr-FR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }),
      executedAt: new Date().toISOString(),
      items: finalResults.map((r) => ({
        beneficiary: r.beneficiary,
        amount: r.amount,
        chequeNumber: r.chequeNumber,
        status: r.status,
        reason: r.reason
      }))
    };

    onFinishRunner(report);
  };

  // Action : Imprimer le chèque courant
  const handlePrintCurrent = async () => {
    if (!currentItem || isPrintingCurrent) return;

    setIsPrintingCurrent(true);

    const assignedNumber = currentItem.chequeNumber || nextChequeNum;

    try {
      const res = await onPrintCurrentItem(currentItem, assignedNumber);

      const itemResult: BatchRunnerResultItem = {
        beneficiary: currentItem.beneficiary,
        amount: currentItem.formattedAmount,
        chequeNumber: assignedNumber,
        status: res.success ? "printed" : "skipped",
        reason: res.error,
        numericAmount: currentItem.numericAmount
      };

      const newResults = [...results, itemResult];
      setResults(newResults);

      // Calculer le prochain numéro
      const nextNum = calculateNextNumber(assignedNumber);
      setNextChequeNum(nextNum);

      // Passer au chèque suivant ou terminer
      if (currentIndex + 1 < totalItems) {
        setCurrentIndex(currentIndex + 1);
      } else {
        completeRunner(newResults);
      }
    } catch (err: any) {
      console.error("Erreur lors de l'impression du chèque:", err);
      const itemResult: BatchRunnerResultItem = {
        beneficiary: currentItem.beneficiary,
        amount: currentItem.formattedAmount,
        chequeNumber: assignedNumber,
        status: "skipped",
        reason: err?.message || "Erreur d'impression inconnue",
        numericAmount: 0
      };

      const newResults = [...results, itemResult];
      setResults(newResults);

      if (currentIndex + 1 < totalItems) {
        setCurrentIndex(currentIndex + 1);
      } else {
        completeRunner(newResults);
      }
    } finally {
      setIsPrintingCurrent(false);
    }
  };

  // Action : Passer ce chèque sans imprimer
  const handleSkipCurrent = () => {
    if (!currentItem) return;

    const itemResult: BatchRunnerResultItem = {
      beneficiary: currentItem.beneficiary,
      amount: currentItem.formattedAmount,
      chequeNumber: currentItem.chequeNumber,
      status: "skipped",
      reason: "Ignoré par l'utilisateur",
      numericAmount: 0
    };

    const newResults = [...results, itemResult];
    setResults(newResults);

    if (currentIndex + 1 < totalItems) {
      setCurrentIndex(currentIndex + 1);
    } else {
      completeRunner(newResults);
    }
  };

  // Action : Arrêter prématurément le runner
  const handleStopRunner = () => {
    if (confirm("Voulez-vous vraiment interrompre l'impression en série ? Le rapport prendra en compte les chèques déjà imprimés.")) {
      completeRunner(results);
    }
  };

  return (
    <div className="statement-modal-overlay" role="dialog" aria-modal="true">
      <div
        className="statement-modal-content batch-modal-window"
        style={{ width: "840px", maxWidth: "95vw" }}
      >
        {/* En-tête standard du modal */}
        <div className="statement-modal-header">
          <div className="statement-header-left">
            <div className="statement-icon-badge">
              <Printer size={20} />
            </div>
            <div>
              <div className="statement-title-row">
                <h2 className="statement-title">Impression successive des chèques</h2>
              </div>
              <p className="statement-subtitle">
                Traitement interactif feuille par feuille avec numérotation séquentielle sécurisée.
              </p>
            </div>
          </div>

          <button
            type="button"
            className="statement-close-btn"
            onClick={handleStopRunner}
            aria-label="Arrêter le traitement"
          >
            <X size={18} />
          </button>
        </div>

        {/* Barre de progression épurée */}
        <div className="runner-progress-row">
          <div className="runner-progress-labels">
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              Chèque <strong style={{ color: "var(--text-primary)" }}>{currentIndex + 1}</strong> sur <strong style={{ color: "var(--text-primary)" }}>{totalItems}</strong>
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--gold-dark)" }}>
              {progressPercent}% terminé
            </span>
          </div>
          <div className="runner-progress-track">
            <div className="runner-progress-bar" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>

        {/* Corps principal : Carte de prévisualisation du chèque actif */}
        <div className="statement-modal-body" style={{ padding: "18px 24px" }}>
          {currentItem && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Carte Chèque Réaliste & Épurée */}
              <div className="runner-cheque-preview-card">
                <div className="cheque-card-top">
                  <div className="card-bank-info">
                    <Building2 size={16} className="field-icon-gold" />
                    <strong style={{ fontSize: 13, color: "var(--text-primary)" }}>
                      {targetAccount ? targetAccount.label : currentBankTemplate.name}
                    </strong>
                    {targetAccount && <span className="card-rib font-mono">RIB: {targetAccount.ribOrIban}</span>}
                  </div>
                  <div className="card-cheque-number-box">
                    <span className="num-label">N° CHÈQUE :</span>
                    <input
                      type="text"
                      value={currentItem.chequeNumber || nextChequeNum}
                      onChange={(e) => setNextChequeNum(e.target.value)}
                      className="field-input font-mono cheque-number-field"
                      title="Modifier manuellement le numéro de chèque si nécessaire"
                    />
                  </div>
                </div>

                <div className="cheque-card-middle">
                  <div className="card-field-group">
                    <span className="card-field-label">PAYEZ CONTRE CE CHÈQUE :</span>
                    <span className="card-field-words">{currentItem.amountInWords}</span>
                  </div>

                  <div className="card-field-group">
                    <span className="card-field-label">À L'ORDRE DE :</span>
                    <span className="card-field-beneficiary">{currentItem.beneficiary}</span>
                  </div>
                </div>

                <div className="cheque-card-bottom">
                  <div className="card-bottom-left">
                    <span className="card-field-label">FAIT À :</span>
                    <span className="card-val">{currentItem.place}</span>
                    <span className="card-field-label" style={{ marginLeft: 16 }}>LE :</span>
                    <span className="card-val">{currentItem.date}</span>
                    {currentItem.reference && (
                      <span className="card-ref-badge">Réf: {currentItem.reference}</span>
                    )}
                  </div>

                  <div className="card-bottom-right">
                    <div className="card-amount-box">
                      <span className="amount-currency"># DZD #</span>
                      <span className="amount-number">{currentItem.formattedAmount}</span>
                      <span className="amount-currency">#</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Rappel d'insertion papier dans l'imprimante */}
              <div className="printer-instruction-banner">
                <FileText size={16} className="field-icon-gold" />
                <span>
                  Insérez le chèque papier <strong>N° {currentItem.chequeNumber || nextChequeNum}</strong> dans le bac de votre imprimante selon le gabarit (<strong>{printSettings.paperFormat}</strong>).
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Pied de page du runner */}
        <div className="statement-toolbar-row batch-modal-footer">
          <div className="footer-left">
            <button
              type="button"
              className="btn-acc-cancel"
              onClick={handleStopRunner}
              title="Arrêter le traitement et afficher le rapport intermédiaire"
              style={{ color: "#b91c1c" }}
            >
              <StopCircle size={15} />
              <span>Interrompre le lot</span>
            </button>
          </div>

          <div className="footer-right" style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              className="btn-acc-cancel"
              onClick={handleSkipCurrent}
              disabled={isPrintingCurrent}
              title="Ne pas imprimer ce chèque et passer au suivant"
            >
              <SkipForward size={15} />
              <span>Sauter ce chèque</span>
            </button>

            <button
              type="button"
              className="btn-action-luxury-green"
              onClick={handlePrintCurrent}
              disabled={isPrintingCurrent}
            >
              <Printer size={16} />
              <span>
                {isPrintingCurrent
                  ? "Impression en cours..."
                  : `Imprimer le chèque ${currentIndex + 1}/${totalItems}`}
              </span>
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
