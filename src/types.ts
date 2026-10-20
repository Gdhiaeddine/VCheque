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
  isCrossed: boolean; // Chèque barré
}

export type ChequeStatus = "saved" | "printed";

export interface ChequeRecord {
  id: string;
  amount: string;
  beneficiary: string;
  place: string;
  date: string;
  chequeNumber?: string;
  bankTemplateId: string;
  bankName: string;
  status: ChequeStatus;
  isCrossed?: boolean;
  createdAt: string;
  updatedAt?: string;
  printedAt?: string;
  printSettings?: PrintSettings;
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
  defaultTemplateId?: string;
}
