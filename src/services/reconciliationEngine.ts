import type { ChequeRecord, BankStatementLineRecord, ReconciliationStatus } from "../types";

export interface ReconciliationMatch {
  chequeId: string;
  cheque: ChequeRecord;
  statementLineId: string;
  statementLine: BankStatementLineRecord;
  confidenceScore: number; // 100 = Match parfait (N° chèque + montant), 80 = Suggestion (Montant + Date), 50 = Écart montant
  matchType: "exact" | "suggested" | "discrepancy";
  differenceAmount?: number;
  reason: string;
}

export interface ReconciliationAnalysisResult {
  exactMatches: ReconciliationMatch[];
  suggestedMatches: ReconciliationMatch[];
  discrepancies: ReconciliationMatch[];
  unmatchedChequesInCirculation: ChequeRecord[];
  unmatchedStatementDebits: BankStatementLineRecord[];
  summary: {
    totalEmittedCount: number;
    totalEmittedAmount: number;
    reconciledCount: number;
    reconciledAmount: number;
    inCirculationCount: number;
    inCirculationAmount: number;
    unmatchedDebitsCount: number;
    unmatchedDebitsAmount: number;
    reconciliationRate: number; // En %
  };
}

/**
 * Normalise un numéro de chèque pour comparaison (supprime les zéros initiaux)
 * "0048201" -> "48201"
 */
function normalizeChequeNum(num?: string): string {
  if (!num) return "";
  const cleaned = num.replace(/\D/g, "").replace(/^0+/, "");
  return cleaned;
}

/**
 * Extrait le montant numérique d'un chèque
 */
function getChequeNumericAmount(cheque: ChequeRecord): number {
  if (!cheque.amount) return 0;
  // Nettoyer séparateurs de milliers et virgule décimale
  const cleaned = String(cheque.amount)
    .replace(/[^\d.,]/g, "")
    .replace(/\s+/g, "")
    .replace(",", ".");
  const val = parseFloat(cleaned);
  return isNaN(val) ? 0 : val;
}

/**
 * Analyse et rapproche les chèques enregistrés avec les lignes d'opérations bancaires
 */
export function analyzeReconciliation(
  cheques: ChequeRecord[],
  statementLines: BankStatementLineRecord[],
  targetAccountId?: string
): ReconciliationAnalysisResult {
  // Filtrer par compte bancaire si spécifié
  const relevantCheques = targetAccountId
    ? cheques.filter((c) => !c.accountId || c.accountId === targetAccountId)
    : cheques;

  const relevantLines = targetAccountId
    ? statementLines.filter((l) => !l.accountId || l.accountId === targetAccountId)
    : statementLines;

  // Filtrer uniquement les chèques émis pertinents (non annulés)
  const activeCheques = relevantCheques.filter((c) => c.status !== "annule");

  // Débits bancaires uniquement
  const debitLines = relevantLines.filter((l) => (l.debit || 0) > 0);

  const exactMatches: ReconciliationMatch[] = [];
  const suggestedMatches: ReconciliationMatch[] = [];
  const discrepancies: ReconciliationMatch[] = [];

  const matchedChequeIds = new Set<string>();
  const matchedLineIds = new Set<string>();

  // 1. Première passe : Recherche des correspondances EXACTES (N° chèque + Montant)
  for (const line of debitLines) {
    const lineChequeNum = normalizeChequeNum(line.extractedChequeNumber || line.reference);
    const lineDebit = line.debit || 0;

    if (!lineChequeNum) continue;

    for (const chq of activeCheques) {
      if (matchedChequeIds.has(chq.id)) continue;

      const chqNum = normalizeChequeNum(chq.chequeNumber);
      if (!chqNum) continue;

      if (chqNum === lineChequeNum) {
        const chqAmount = getChequeNumericAmount(chq);
        const diff = Math.abs(chqAmount - lineDebit);

        if (diff < 0.01) {
          // Score 100% : Même numéro et même montant
          exactMatches.push({
            chequeId: chq.id,
            cheque: chq,
            statementLineId: line.id,
            statementLine: line,
            confidenceScore: 100,
            matchType: "exact",
            reason: `Concordance parfaite : N° chèque ${chq.chequeNumber} et montant ${chqAmount.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} DA identiques.`
          });
          matchedChequeIds.add(chq.id);
          matchedLineIds.add(line.id);
          break;
        } else {
          // Écart de montant avec le même numéro de chèque
          discrepancies.push({
            chequeId: chq.id,
            cheque: chq,
            statementLineId: line.id,
            statementLine: line,
            confidenceScore: 50,
            matchType: "discrepancy",
            differenceAmount: chqAmount - lineDebit,
            reason: `Même numéro de chèque (${chq.chequeNumber}) mais écart de ${Math.abs(chqAmount - lineDebit).toLocaleString("fr-FR", { minimumFractionDigits: 2 })} DA (Chèque: ${chqAmount} DA vs Relevé: ${lineDebit} DA).`
          });
          matchedChequeIds.add(chq.id);
          matchedLineIds.add(line.id);
          break;
        }
      }
    }
  }

  // 2. Deuxième passe : Suggestions pour les lignes restantes (Montant identique + Date cohérente)
  for (const line of debitLines) {
    if (matchedLineIds.has(line.id)) continue;
    const lineDebit = line.debit || 0;

    for (const chq of activeCheques) {
      if (matchedChequeIds.has(chq.id)) continue;

      const chqAmount = getChequeNumericAmount(chq);
      const diff = Math.abs(chqAmount - lineDebit);

      if (diff < 0.01) {
        // Vérifier si la date bancaire est proche de la date d'émission (date op >= date chèque)
        const chqDate = new Date(chq.date).getTime();
        const lineDate = new Date(line.operationDate).getTime();
        const daysDiff = (lineDate - chqDate) / (1000 * 3600 * 24);

        // Date bancaire entre -5 jours et +120 jours
        if (daysDiff >= -5 && daysDiff <= 120) {
          suggestedMatches.push({
            chequeId: chq.id,
            cheque: chq,
            statementLineId: line.id,
            statementLine: line,
            confidenceScore: 80,
            matchType: "suggested",
            reason: `Montant identique (${chqAmount.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} DA) et débité ${Math.round(daysDiff)} jours après l'émission (${chq.beneficiary}).`
          });
          matchedChequeIds.add(chq.id);
          matchedLineIds.add(line.id);
          break;
        }
      }
    }
  }

  // 3. Chèques en circulation (non débités sur les relevés)
  const unmatchedChequesInCirculation = activeCheques.filter(
    (c) => !matchedChequeIds.has(c.id) && c.status !== "encaisse"
  );

  // 4. Débits bancaires non lettrés
  const unmatchedStatementDebits = debitLines.filter(
    (l) => !matchedLineIds.has(l.id) && l.reconciliationStatus === "unmatched"
  );

  // 5. Calculs des totaux et synthèse financière
  const totalEmittedCount = activeCheques.length;
  const totalEmittedAmount = activeCheques.reduce((acc, c) => acc + getChequeNumericAmount(c), 0);

  const reconciledCount = exactMatches.length + (targetAccountId ? activeCheques.filter(c => c.status === "encaisse" && matchedChequeIds.has(c.id)).length : 0);
  const reconciledAmount = exactMatches.reduce((acc, m) => acc + getChequeNumericAmount(m.cheque), 0);

  const inCirculationCount = unmatchedChequesInCirculation.length;
  const inCirculationAmount = unmatchedChequesInCirculation.reduce((acc, c) => acc + getChequeNumericAmount(c), 0);

  const unmatchedDebitsCount = unmatchedStatementDebits.length;
  const unmatchedDebitsAmount = unmatchedStatementDebits.reduce((acc, l) => acc + (l.debit || 0), 0);

  const reconciliationRate = totalEmittedCount > 0 ? Math.round((exactMatches.length / totalEmittedCount) * 100) : 0;

  return {
    exactMatches,
    suggestedMatches,
    discrepancies,
    unmatchedChequesInCirculation,
    unmatchedStatementDebits,
    summary: {
      totalEmittedCount,
      totalEmittedAmount,
      reconciledCount,
      reconciledAmount,
      inCirculationCount,
      inCirculationAmount,
      unmatchedDebitsCount,
      unmatchedDebitsAmount,
      reconciliationRate
    }
  };
}
