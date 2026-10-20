import type { BankTemplate, Positions } from "./types";
import elSalamChequeImg from "./assets/el-salam.jpg";

export const elSalamPositions: Positions = {
  // Sur le chèque officiel Banque Al Salam :
  // 1. "DA :" en haut à droite
  numeric: { x: 138, y: 8.0, size: 3.8, align: "left" },
  // 2. "Payez contre ce chèque :" (montant en lettres)
  words: { x: 37, y: 27.5, size: 3.2, align: "left" },
  wordsSecondLine: { x: 18, y: 32.5, size: 3.2, align: "left" },
  // 3. "A l'ordre de :" (bénéficiaire)
  beneficiary: { x: 24, y: 38.2, size: 3.6, align: "left" },
  // 4. Lieu ("في ...") et Date ("Le ...") séparés
  place: { x: 105, y: 45.6, size: 3.3, align: "left" },
  date: { x: 138, y: 45.6, size: 3.3, align: "left" },
  // 5. "Chèque N° :" (en haut à gauche)
  chequeNumber: { x: 25, y: 9.8, size: 3.0, align: "left" }
};

export const standardPositions: Positions = {
  beneficiary: { x: 22, y: 24, size: 3.6, align: "left" },
  words: { x: 22, y: 38, size: 3.2, align: "left" },
  wordsSecondLine: { x: 22, y: 45, size: 3.2, align: "left" },
  numeric: { x: 150, y: 38, size: 3.8, align: "right" },
  place: { x: 108, y: 57, size: 3.3, align: "left" },
  date: { x: 142, y: 57, size: 3.3, align: "left" },
  chequeNumber: { x: 135, y: 12, size: 3.0, align: "left" }
};

export const defaultPositions: Positions = elSalamPositions;

export const defaultBankTemplates: BankTemplate[] = [
  {
    id: "el-salam",
    name: "Banque Al Salam Algérie",
    shortName: "Al Salam",
    bankCode: "029",
    themeColor: "#89672F",
    width: 175,
    height: 80,
    backgroundImage: "/assets/el-salam.jpg",
    positions: elSalamPositions,
    notes: "Chéquier officiel Banque Al Salam (175 × 80 mm)."
  },
  {
    id: "bna",
    name: "Banque Nationale d'Algérie (BNA)",
    shortName: "BNA",
    bankCode: "001",
    themeColor: "#047857",
    width: 175,
    height: 80,
    backgroundImage: "/assets/bna.jpg",
    positions: {
      numeric: { x: 138, y: 9.0, size: 3.8, align: "left" },
      words: { x: 38, y: 28.0, size: 3.2, align: "left" },
      wordsSecondLine: { x: 20, y: 34.0, size: 3.2, align: "left" },
      beneficiary: { x: 26, y: 40.0, size: 3.6, align: "left" },
      place: { x: 106, y: 48.0, size: 3.3, align: "left" },
      date: { x: 138, y: 48.0, size: 3.3, align: "left" },
      chequeNumber: { x: 25, y: 10.0, size: 3.0, align: "left" }
    },
    notes: "Chéquier officiel BNA (175 × 80 mm)."
  },
  {
    id: "bea",
    name: "Banque Extérieure d'Algérie (BEA)",
    shortName: "BEA",
    bankCode: "002",
    themeColor: "#0284C7",
    width: 175,
    height: 80,
    backgroundImage: "/assets/bea.jpg",
    positions: {
      numeric: { x: 137, y: 9.0, size: 3.8, align: "left" },
      words: { x: 37, y: 27.5, size: 3.2, align: "left" },
      wordsSecondLine: { x: 20, y: 33.5, size: 3.2, align: "left" },
      beneficiary: { x: 25, y: 39.5, size: 3.6, align: "left" },
      place: { x: 106, y: 47.5, size: 3.3, align: "left" },
      date: { x: 138, y: 47.5, size: 3.3, align: "left" },
      chequeNumber: { x: 25, y: 10.0, size: 3.0, align: "left" }
    },
    notes: "Chéquier officiel BEA (175 × 80 mm)."
  },
  {
    id: "badr",
    name: "Banque de l'Agriculture et du Développement Rural (BADR)",
    shortName: "BADR",
    bankCode: "003",
    themeColor: "#15803D",
    width: 175,
    height: 80,
    backgroundImage: "/assets/badr.jpg",
    positions: {
      numeric: { x: 138, y: 9.5, size: 3.8, align: "left" },
      words: { x: 38, y: 28.5, size: 3.2, align: "left" },
      wordsSecondLine: { x: 20, y: 34.5, size: 3.2, align: "left" },
      beneficiary: { x: 26, y: 40.5, size: 3.6, align: "left" },
      place: { x: 106, y: 48.5, size: 3.3, align: "left" },
      date: { x: 138, y: 48.5, size: 3.3, align: "left" },
      chequeNumber: { x: 25, y: 10.0, size: 3.0, align: "left" }
    },
    notes: "Chéquier officiel BADR (175 × 80 mm)."
  },
  {
    id: "cpa",
    name: "Crédit Populaire d'Algérie (CPA)",
    shortName: "CPA",
    bankCode: "004",
    themeColor: "#1E40AF",
    width: 175,
    height: 80,
    backgroundImage: "/assets/cpa.jpg",
    positions: {
      numeric: { x: 138, y: 9.0, size: 3.8, align: "left" },
      words: { x: 38, y: 28.0, size: 3.2, align: "left" },
      wordsSecondLine: { x: 20, y: 34.0, size: 3.2, align: "left" },
      beneficiary: { x: 26, y: 40.0, size: 3.6, align: "left" },
      place: { x: 106, y: 48.0, size: 3.3, align: "left" },
      date: { x: 138, y: 48.0, size: 3.3, align: "left" },
      chequeNumber: { x: 25, y: 10.0, size: 3.0, align: "left" }
    },
    notes: "Chéquier officiel CPA (175 × 80 mm)."
  },
  {
    id: "bdl",
    name: "Banque de Développement Local (BDL)",
    shortName: "BDL",
    bankCode: "005",
    themeColor: "#1D4ED8",
    width: 175,
    height: 80,
    backgroundImage: "/assets/bdl.jpg",
    positions: {
      numeric: { x: 138, y: 9.0, size: 3.8, align: "left" },
      words: { x: 38, y: 28.0, size: 3.2, align: "left" },
      wordsSecondLine: { x: 20, y: 34.0, size: 3.2, align: "left" },
      beneficiary: { x: 26, y: 40.0, size: 3.6, align: "left" },
      place: { x: 106, y: 48.0, size: 3.3, align: "left" },
      date: { x: 138, y: 48.0, size: 3.3, align: "left" },
      chequeNumber: { x: 25, y: 10.0, size: 3.0, align: "left" }
    },
    notes: "Chéquier officiel BDL (175 × 80 mm)."
  },
  {
    id: "albaraka",
    name: "Banque Al Baraka d'Algérie",
    shortName: "Al Baraka",
    bankCode: "006",
    themeColor: "#006838",
    width: 175,
    height: 80,
    backgroundImage: "/assets/albaraka.jpg",
    positions: {
      numeric: { x: 138, y: 9.0, size: 3.8, align: "left" },
      words: { x: 38, y: 28.0, size: 3.2, align: "left" },
      wordsSecondLine: { x: 20, y: 34.0, size: 3.2, align: "left" },
      beneficiary: { x: 26, y: 40.0, size: 3.6, align: "left" },
      place: { x: 106, y: 48.0, size: 3.3, align: "left" },
      date: { x: 138, y: 48.0, size: 3.3, align: "left" },
      chequeNumber: { x: 25, y: 10.0, size: 3.0, align: "left" }
    },
    notes: "Chéquier officiel Banque Al Baraka (175 × 80 mm)."
  },
  {
    id: "algerie-poste",
    name: "Algérie Poste (Chèque Postal CCP)",
    shortName: "Algérie Poste",
    bankCode: "007",
    themeColor: "#EAB308",
    width: 175,
    height: 80,
    backgroundImage: "/assets/algerie-poste.jpg",
    positions: {
      numeric: { x: 138, y: 9.0, size: 3.8, align: "left" },
      words: { x: 38, y: 27.5, size: 3.2, align: "left" },
      wordsSecondLine: { x: 20, y: 33.5, size: 3.2, align: "left" },
      beneficiary: { x: 26, y: 39.5, size: 3.6, align: "left" },
      place: { x: 105, y: 47.5, size: 3.3, align: "left" },
      date: { x: 138, y: 47.5, size: 3.3, align: "left" },
      chequeNumber: { x: 25, y: 10.0, size: 3.0, align: "left" }
    },
    notes: "Chèque postal officiel CCP Algérie Poste (175 × 80 mm)."
  },
  {
    id: "cnep",
    name: "CNEP Banque (Caisse Nationale d'Épargne et de Prévoyance)",
    shortName: "CNEP Banque",
    bankCode: "008",
    themeColor: "#2563EB",
    width: 175,
    height: 80,
    backgroundImage: "/assets/cnep.jpg",
    positions: {
      numeric: { x: 138, y: 9.0, size: 3.8, align: "left" },
      words: { x: 38, y: 28.0, size: 3.2, align: "left" },
      wordsSecondLine: { x: 20, y: 34.0, size: 3.2, align: "left" },
      beneficiary: { x: 26, y: 40.0, size: 3.6, align: "left" },
      place: { x: 106, y: 48.0, size: 3.3, align: "left" },
      date: { x: 138, y: 48.0, size: 3.3, align: "left" },
      chequeNumber: { x: 25, y: 10.0, size: 3.0, align: "left" }
    },
    notes: "Chéquier officiel CNEP Banque (175 × 80 mm)."
  },
  {
    id: "abc-bank",
    name: "Bank ABC Algérie (Arab Banking Corporation)",
    shortName: "Bank ABC",
    bankCode: "020",
    themeColor: "#C41230",
    width: 175,
    height: 80,
    backgroundImage: "/assets/abc-bank.jpg",
    positions: {
      numeric: { x: 138, y: 9.0, size: 3.8, align: "left" },
      words: { x: 38, y: 28.0, size: 3.2, align: "left" },
      wordsSecondLine: { x: 20, y: 34.0, size: 3.2, align: "left" },
      beneficiary: { x: 26, y: 40.0, size: 3.6, align: "left" },
      place: { x: 106, y: 48.0, size: 3.3, align: "left" },
      date: { x: 138, y: 48.0, size: 3.3, align: "left" },
      chequeNumber: { x: 25, y: 10.0, size: 3.0, align: "left" }
    },
    notes: "Chéquier officiel Bank ABC Algérie (175 × 80 mm)."
  },
  {
    id: "bnp",
    name: "BNP Paribas El Djazaïr",
    shortName: "BNP Paribas",
    bankCode: "021",
    themeColor: "#059669",
    width: 175,
    height: 80,
    backgroundImage: "/assets/bnp.jpg",
    positions: {
      numeric: { x: 138, y: 9.0, size: 3.8, align: "left" },
      words: { x: 38, y: 28.0, size: 3.2, align: "left" },
      wordsSecondLine: { x: 20, y: 34.0, size: 3.2, align: "left" },
      beneficiary: { x: 26, y: 40.0, size: 3.6, align: "left" },
      place: { x: 106, y: 48.0, size: 3.3, align: "left" },
      date: { x: 138, y: 48.0, size: 3.3, align: "left" },
      chequeNumber: { x: 25, y: 10.0, size: 3.0, align: "left" }
    },
    notes: "Chéquier officiel BNP Paribas El Djazaïr (175 × 80 mm)."
  },
  {
    id: "natixis",
    name: "Natixis Algérie",
    shortName: "Natixis",
    bankCode: "022",
    themeColor: "#6366F1",
    width: 175,
    height: 80,
    backgroundImage: "/assets/natixis.jpg",
    positions: {
      numeric: { x: 138, y: 9.0, size: 3.8, align: "left" },
      words: { x: 38, y: 28.0, size: 3.2, align: "left" },
      wordsSecondLine: { x: 20, y: 34.0, size: 3.2, align: "left" },
      beneficiary: { x: 26, y: 40.0, size: 3.6, align: "left" },
      place: { x: 106, y: 48.0, size: 3.3, align: "left" },
      date: { x: 138, y: 48.0, size: 3.3, align: "left" },
      chequeNumber: { x: 25, y: 10.0, size: 3.0, align: "left" }
    },
    notes: "Chéquier officiel Natixis Algérie (175 × 80 mm)."
  },
  {
    id: "societe-generale",
    name: "Société Générale Algérie (SGA)",
    shortName: "Société Générale",
    bankCode: "023",
    themeColor: "#E11D48",
    width: 175,
    height: 80,
    backgroundImage: "/assets/societe-generale.jpg",
    positions: {
      numeric: { x: 138, y: 9.0, size: 3.8, align: "left" },
      words: { x: 38, y: 28.0, size: 3.2, align: "left" },
      wordsSecondLine: { x: 20, y: 34.0, size: 3.2, align: "left" },
      beneficiary: { x: 26, y: 40.0, size: 3.6, align: "left" },
      place: { x: 106, y: 48.0, size: 3.3, align: "left" },
      date: { x: 138, y: 48.0, size: 3.3, align: "left" },
      chequeNumber: { x: 25, y: 10.0, size: 3.0, align: "left" }
    },
    notes: "Chéquier officiel Société Générale Algérie (175 × 80 mm)."
  },
  {
    id: "gulf-bank",
    name: "AGB (Gulf Bank Algérie)",
    shortName: "Gulf Bank AGB",
    bankCode: "024",
    themeColor: "#0F766E",
    width: 175,
    height: 80,
    backgroundImage: "/assets/gulf-bank.jpg",
    positions: {
      numeric: { x: 138, y: 9.0, size: 3.8, align: "left" },
      words: { x: 38, y: 28.0, size: 3.2, align: "left" },
      wordsSecondLine: { x: 20, y: 34.0, size: 3.2, align: "left" },
      beneficiary: { x: 26, y: 40.0, size: 3.6, align: "left" },
      place: { x: 106, y: 48.0, size: 3.3, align: "left" },
      date: { x: 138, y: 48.0, size: 3.3, align: "left" },
      chequeNumber: { x: 25, y: 10.0, size: 3.0, align: "left" }
    },
    notes: "Chéquier officiel AGB Gulf Bank Algérie (175 × 80 mm)."
  },
  {
    id: "housing-bank",
    name: "Housing Bank Algérie (Banque de l'Habitat)",
    shortName: "Housing Bank",
    bankCode: "025",
    themeColor: "#B91C1C",
    width: 175,
    height: 80,
    backgroundImage: "/assets/housing-bank.jpg",
    positions: {
      numeric: { x: 138, y: 9.0, size: 3.8, align: "left" },
      words: { x: 38, y: 28.0, size: 3.2, align: "left" },
      wordsSecondLine: { x: 20, y: 34.0, size: 3.2, align: "left" },
      beneficiary: { x: 26, y: 40.0, size: 3.6, align: "left" },
      place: { x: 106, y: 48.0, size: 3.3, align: "left" },
      date: { x: 138, y: 48.0, size: 3.3, align: "left" },
      chequeNumber: { x: 25, y: 10.0, size: 3.0, align: "left" }
    },
    notes: "Chéquier officiel Housing Bank Algérie (175 × 80 mm)."
  },
  {
    id: "trust",
    name: "Trust Bank Algeria",
    shortName: "Trust Bank",
    bankCode: "026",
    themeColor: "#0284C7",
    width: 175,
    height: 80,
    backgroundImage: "/assets/trust.jpg",
    positions: {
      numeric: { x: 138, y: 9.0, size: 3.8, align: "left" },
      words: { x: 38, y: 28.0, size: 3.2, align: "left" },
      wordsSecondLine: { x: 20, y: 34.0, size: 3.2, align: "left" },
      beneficiary: { x: 26, y: 40.0, size: 3.6, align: "left" },
      place: { x: 106, y: 48.0, size: 3.3, align: "left" },
      date: { x: 138, y: 48.0, size: 3.3, align: "left" },
      chequeNumber: { x: 25, y: 10.0, size: 3.0, align: "left" }
    },
    notes: "Chéquier officiel Trust Bank Algeria (175 × 80 mm)."
  },
  {
    id: "fransa-bank",
    name: "Fransabank El Djazaïr",
    shortName: "Fransabank",
    bankCode: "027",
    themeColor: "#DC2626",
    width: 175,
    height: 80,
    backgroundImage: "/assets/fransa-bank.jpg",
    positions: {
      numeric: { x: 138, y: 9.0, size: 3.8, align: "left" },
      words: { x: 38, y: 28.0, size: 3.2, align: "left" },
      wordsSecondLine: { x: 20, y: 34.0, size: 3.2, align: "left" },
      beneficiary: { x: 26, y: 40.0, size: 3.6, align: "left" },
      place: { x: 106, y: 48.0, size: 3.3, align: "left" },
      date: { x: 138, y: 48.0, size: 3.3, align: "left" },
      chequeNumber: { x: 25, y: 10.0, size: 3.0, align: "left" }
    },
    notes: "Chéquier officiel Fransabank El Djazaïr (175 × 80 mm)."
  },
  {
    id: "tresor-public",
    name: "Trésor Public Algérien",
    shortName: "Trésor Public",
    bankCode: "000",
    themeColor: "#475569",
    width: 175,
    height: 80,
    backgroundImage: "/assets/tresor-public.jpg",
    positions: {
      numeric: { x: 138, y: 9.0, size: 3.8, align: "left" },
      words: { x: 38, y: 28.0, size: 3.2, align: "left" },
      wordsSecondLine: { x: 20, y: 34.0, size: 3.2, align: "left" },
      beneficiary: { x: 26, y: 40.0, size: 3.6, align: "left" },
      place: { x: 106, y: 48.0, size: 3.3, align: "left" },
      date: { x: 138, y: 48.0, size: 3.3, align: "left" },
      chequeNumber: { x: 25, y: 10.0, size: 3.0, align: "left" }
    },
    notes: "Chéquier officiel Trésor Public Algérien (175 × 80 mm)."
  }
];

export const initialBeneficiaries: string[] = [
  "Entreprise Exemple SARL",
  "SONELGAZ (Direction de Distribution)",
  "SEAAL (Eaux d'Alger)",
  "Algérie Télécom",
  "CNAS",
  "Direction Générale des Impôts"
];
