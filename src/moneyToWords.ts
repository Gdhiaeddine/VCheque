const units = [
  "zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf",
  "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf"
];

function below100(n: number): string {
  if (n < 20) return units[n];
  if (n < 70) {
    const t = Math.floor(n / 10);
    const r = n % 10;
    const names = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante"];
    if (!r) return names[t];
    if (r === 1) return `${names[t]} et un`;
    return `${names[t]}-${units[r]}`;
  }
  if (n < 80) return n === 71 ? "soixante et onze" : `soixante-${below100(n - 60)}`;
  return n === 80 ? "quatre-vingts" : `quatre-vingt-${below100(n - 80)}`;
}

function below1000(n: number): string {
  if (n < 100) return below100(n);
  const h = Math.floor(n / 100);
  const r = n % 100;
  const head = h === 1 ? "cent" : `${units[h]} cent`;
  return `${head}${r === 0 && h > 1 ? "s" : ""}${r ? ` ${below100(r)}` : ""}`;
}

function integerFrench(n: number): string {
  if (n === 0) return "zéro";
  if (n < 1000) return below1000(n);
  if (n < 1_000_000) {
    const t = Math.floor(n / 1000);
    const r = n % 1000;
    return `${t === 1 ? "mille" : `${below1000(t)} mille`}${r ? ` ${below1000(r)}` : ""}`;
  }
  if (n < 1_000_000_000) {
    const m = Math.floor(n / 1_000_000);
    const r = n % 1_000_000;
    return `${integerFrench(m)} million${m > 1 ? "s" : ""}${r ? ` ${integerFrench(r)}` : ""}`;
  }
  return String(n);
}

export interface AmountInWordsOptions {
  letterCase?: "sentence" | "lower" | "upper";
  currencyTextVariant?: "dinars-algeriens" | "dinars" | "dzd";
  surroundSymbol?: "none" | "stars" | "hashes";
  zeroCentsMention?: "none" | "exacts" | "zero-cents";
  includeHash?: boolean;
  capitalize?: boolean;
}

export function amountInFrenchWords(raw: string, options: AmountInWordsOptions = {}): string {
  const cleaned = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (!cleaned) return "—";
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0 || value > 999_999_999.99) {
    return "Montant invalide";
  }

  const centsTotal = Math.round(value * 100);
  const dinars = Math.floor(centsTotal / 100);
  const cents = centsTotal % 100;

  // 1. Détermination de la mention de devise
  const variant = options.currencyTextVariant || "dinars-algeriens";
  let currencySuffix = "dinars algériens";
  if (variant === "dinars") {
    currencySuffix = dinars > 1 ? "dinars" : "dinar";
  } else if (variant === "dzd") {
    currencySuffix = "DZD";
  } else {
    currencySuffix = dinars > 1 ? "dinars algériens" : "dinar algérien";
  }

  let textDinars = "";
  if (dinars === 0) {
    textDinars = variant === "dzd" ? "zéro DZD" : (variant === "dinars" ? "zéro dinar" : "zéro dinar algérien");
  } else {
    const intWords = integerFrench(dinars);
    const needsDe = dinars >= 1_000_000 && dinars % 1_000_000 === 0 && variant !== "dzd";
    const linking = needsDe ? "de " : "";
    textDinars = `${intWords} ${linking}${currencySuffix}`;
  }

  // 2. Gestion des centimes
  let full = textDinars;
  if (cents > 0) {
    full += ` et ${integerFrench(cents)} centime${cents > 1 ? "s" : ""}`;
  } else {
    const zeroMention = options.zeroCentsMention || "none";
    if (zeroMention === "exacts") {
      full += " exacts";
    } else if (zeroMention === "zero-cents") {
      full += " et zéro centime";
    }
  }

  // 3. Casse du texte (Majuscule, minuscules, ou TOUT EN MAJUSCULES)
  const letterCase = options.letterCase || (options.capitalize ? "sentence" : "lower");
  if (letterCase === "upper") {
    full = full.toUpperCase();
  } else if (letterCase === "sentence") {
    full = full.charAt(0).toUpperCase() + full.slice(1);
  } else if (letterCase === "lower") {
    full = full.toLowerCase();
  }

  // 4. Encadrement de sécurité (Étoiles, croisillons ou hash legacy)
  const surround = options.surroundSymbol || (options.includeHash ? "hashes" : "none");
  if (surround === "stars") {
    full = `*** ${full} ***`;
  } else if (surround === "hashes") {
    full = `# ${full} #`;
  }

  return full;
}

export interface FormatNumericOptions {
  securitySymbol?: "hash" | "star" | "dash" | "none";
  currencySuffix?: "none" | "da" | "dzd";
  decimalSeparator?: "comma" | "dot";
}

export function formatNumericAmount(raw: string, options: FormatNumericOptions = {}): string {
  const cleaned = (raw || "").trim().replace(/\s/g, "").replace(",", ".");
  const num = Number(cleaned);
  if (!cleaned || !Number.isFinite(num) || num < 0) return "—";

  const decSep = options.decimalSeparator === "dot" ? "." : ",";
  const fixed = num.toFixed(2);
  const [intPart, decPart] = fixed.split(".");

  // Formater les milliers avec espace insécable
  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const numberStr = `${formattedInt}${decSep}${decPart}`;

  // Suffixe monétaire
  let currencyTag = "";
  if (options.currencySuffix === "da") currencyTag = " DA";
  else if (options.currencySuffix === "dzd") currencyTag = " DZD";

  // Symbole de protection
  const sec = options.securitySymbol ?? "hash";
  if (sec === "hash") {
    return `# ${numberStr}${currencyTag} #`;
  } else if (sec === "star") {
    return `* ${numberStr}${currencyTag} *`;
  } else if (sec === "dash") {
    return `-- ${numberStr}${currencyTag} --`;
  }

  return `${numberStr}${currencyTag}`;
}

export function splitWordsByLimit(words: string, maxLineLength: number = 55): [string, string] {
  if (!words || words.length <= maxLineLength) return [words, ""];
  const arr = words.split(" ");
  let l1 = "";
  let l2 = "";
  for (const w of arr) {
    if ((l1 ? `${l1} ${w}` : w).length <= maxLineLength && !l2) {
      l1 = l1 ? `${l1} ${w}` : w;
    } else {
      l2 = l2 ? `${l2} ${w}` : w;
    }
  }
  return [l1, l2];
}