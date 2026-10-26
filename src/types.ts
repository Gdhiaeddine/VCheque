export type FieldKey = "beneficiary" | "words" | "wordsSecondLine" | "numeric" | "place" | "date" | "chequeNumber";

export interface FieldPosition {
  x: number; // in mm from top-left
  y: number; // in mm from top-left
  size: number; // font size in mm
  align?: "left" | "right" | "center";
  maxWidth?: number; // max width in mm
}

export type Positions = Record<FieldKey, FieldPosition>;

export interface BankTemplate {
  id: string;
  name: string;
  shortName: string;
  bankCode: string;
  themeColor: string;
  width: number; // in mm (standard 175 - 180)
  height: number; // in mm (standard 80 - 85)
  positions: Positions;
  logoUrl?: string; // Logo ou icône de la banque
  backgroundImage?: string;
  notes?: string;
  isCustom?: boolean;
  wordsMaxLineLength?: number; // max chars before wrap to line 2 (e.g. 55)
  wordsLine1MaxWidth?: number; // max width in mm for line 1
  wordsLine2MaxWidth?: number; // max width in mm for line 2
}

export interface ChequeData {
  amount: string;
  beneficiary: string;
  place: string;
  date: string;
  chequeNumber?: string;
  showChequeNumber?: boolean;
  reference?: string; // Référence interne (N° facture, bon de commande, note)
  isCrossed: boolean; // Chèque barré
  crossedWithText?: boolean; // Mention "Non endossable" entre les barres
}

export type ChequeStatus =
  | "saved"      // Alias historique (Brouillon)
  | "brouillon"  // En cours de rédaction
  | "pret"       // Validé, prêt pour impression
  | "printed"    // Imprimé
  | "remis"      // Remis en main propre ou envoyé au bénéficiaire
  | "encaisse"   // Débité / encaissé sur le compte
  | "annule";    // Annulé avec motif conservé dans l'historique

export type PrintAttemptStatus = "requested" | "confirmed" | "failed" | "cancelled";

export type ChequeAuditEventType =
  | "created"         // Création initiale
  | "updated"         // Modification des données
  | "status_changed"  // Évolution du statut (ex: prêt -> remis)
  | "print_requested" // Lancement d'une impression
  | "printed"         // Confirmation d'impression physique
  | "print_failed"    // Échec ou incident d'impression
  | "cancelled";      // Annulation formelle avec motif

export interface ChequeAuditEvent {
  id: string;
  chequeId: string;
  companyId?: string;
  eventType: ChequeAuditEventType;
  title: string;              // Ex: "Création du chèque", "Tirage d'impression N°2", "Changement de statut"
  description?: string;        // Détails lisibles
  reason?: string;             // Motif exact (annulation ou échec d'impression)
  fromStatus?: ChequeStatus;
  toStatus?: ChequeStatus;
  metadata?: {
    amount?: string;
    beneficiary?: string;
    bankName?: string;
    copyNumber?: number;
    paperFormat?: string;
    placement?: string;
    place?: string;
  };
  timestamp: string;           // ISO 8601
}

export interface PrintAttemptRecord {
  id: string;
  chequeId: string;
  companyId?: string;
  beneficiary: string;
  amount: string;
  bankName: string;
  bankTemplateId: string;
  paperFormat: string;
  placement: string;
  status: PrintAttemptStatus;
  attemptedAt: string;
  confirmedAt?: string;
  failureReason?: string;
  copyNumber: number; // 1 = 1er tirage, 2+ = réimpression
}

export interface ChequeRecord {
  id: string;
  companyId?: string;
  accountId?: string;
  chequeBookId?: string;
  amount: string;
  beneficiary: string;
  place: string;
  date: string;
  chequeNumber?: string;
  showChequeNumber?: boolean;
  reference?: string; // Référence interne
  bankTemplateId: string;
  bankName: string;
  status: ChequeStatus;
  cancellationReason?: string; // Motif d'annulation
  cancelledAt?: string; // Horodatage annulation
  deliveredAt?: string; // Horodatage remise
  cashedAt?: string; // Horodatage encaissement
  isCrossed?: boolean;
  crossedWithText?: boolean;
  printCount?: number; // 0 = sauvegardé, 1 = imprimé, 2+ = réimprimé
  createdAt: string;
  updatedAt?: string;
  printedAt?: string;
  lastPrintedAt?: string;
  printSettings?: PrintSettings;
}

export interface BeneficiaryRecord {
  id: string;
  companyId?: string;
  name: string;
  nickname?: string;
  phone?: string;
  rib?: string;
  note?: string;
  usageCount: number;
  lastUsedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CompanyRecord {
  id: string;
  name: string;
  legalForm?: string; // SARL, EURL, SPA, SNC, etc.
  nif?: string;
  nis?: string;
  rc?: string;
  articleImposition?: string;
  address?: string;
  phone?: string;
  email?: string;
  logoUrl?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface BankAccountRecord {
  id: string;
  companyId: string;
  bankTemplateId: string;
  label: string; // Ex: "Compte Courant Principal BNA"
  ribOrIban: string; // Ex: 20 chiffres
  agency?: string; // Ex: "Agence Didouche Mourad (0012)"
  balance: number; // Solde actuel
  currency: string; // "DZD"
  isDefault: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface ChequeBookRecord {
  id: string;
  accountId: string;
  seriesName: string; // Ex: "Chéquier 2026-A"
  startNumber: string; // Ex: "0048201"
  endNumber: string; // Ex: "0048250"
  currentNumber: string; // Prochain chèque disponible
  leavesTotal: number;
  leavesUsed: number;
  isActive: boolean;
  createdAt: string;
}

export interface ChequeAttachmentRecord {
  id: string;
  chequeId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  localPath?: string;
  dataBase64?: string;
  createdAt: string;
}

export type PrintPlacement =
  | "top-left"
  | "top-center"
  | "top-right"
  | "center-left"
  | "center"
  | "center-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export type PrintPaperFormat = "a4-portrait" | "a4-landscape" | "exact-cheque";

export interface PrintSettings {
  paperFormat: PrintPaperFormat;
  placement: PrintPlacement;
  offsetX: number; // in mm
  offsetY: number; // in mm
  rotation: 0 | 90 | 180 | 270;
  showBorderGuide: boolean;
}

export type LetterCase = "sentence" | "lower" | "upper";
export type CurrencyTextVariant = "dinars-algeriens" | "dinars" | "dzd";
export type TextSurroundSymbol = "none" | "stars" | "hashes";
export type ZeroCentsMention = "none" | "exacts" | "zero-cents";

export type NumericSecuritySymbol = "hash" | "star" | "dash" | "none";
export type NumericCurrencySuffix = "none" | "da" | "dzd";
export type DecimalSeparator = "comma" | "dot";

export interface AppSettings {
  // Montant en lettres
  letterCase: LetterCase;
  currencyTextVariant: CurrencyTextVariant;
  textSurroundSymbol: TextSurroundSymbol;
  zeroCentsMention: ZeroCentsMention;

  // Montant en chiffres
  numericSecuritySymbol: NumericSecuritySymbol;
  numericCurrencySuffix: NumericCurrencySuffix;
  decimalSeparator: DecimalSeparator;

  // Préférences par défaut
  defaultPlace: string;
  defaultIsCrossed: boolean;
  defaultCrossedWithText?: boolean;
  defaultShowChequeNumber: boolean;
  defaultTemplateId?: string;
}
