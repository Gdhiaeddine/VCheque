import type { BackupArchive } from "../types";

/**
 * Génère un sel cryptographique aléatoire de 16 octets (hexadécimal)
 */
export function generateSalt(): string {
  const bytes = new Uint8Array(16);
  const cryptoObj = typeof window !== "undefined" && window.crypto ? window.crypto : (globalThis as any).crypto;
  if (cryptoObj && cryptoObj.getRandomValues) {
    cryptoObj.getRandomValues(bytes);
  } else {
    // Fallback
    try {
      const nodeCrypto = (globalThis as any).require?.("crypto");
      if (nodeCrypto?.randomFillSync) {
        nodeCrypto.randomFillSync(bytes);
      } else {
        throw new Error("No randomFillSync");
      }
    } catch {
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Hache un code PIN ou mot de passe avec PBKDF2-SHA256 (100 000 itérations)
 */
export async function hashPin(pin: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const pinBuffer = enc.encode(pin.trim());
  const saltBuffer = enc.encode(salt);

  const cryptoObj = typeof window !== "undefined" && window.crypto ? window.crypto : (globalThis as any).crypto;

  if (cryptoObj && cryptoObj.subtle) {
    const key = await cryptoObj.subtle.importKey("raw", pinBuffer, { name: "PBKDF2" }, false, ["deriveBits"]);
    const derivedBits = await cryptoObj.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: saltBuffer,
        iterations: 100000,
        hash: "SHA-256"
      },
      key,
      256
    );

    const hashArray = Array.from(new Uint8Array(derivedBits));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  // Fallback Node.js si subtle n'est pas actif
  try {
    const nodeCrypto = (globalThis as any).require?.("crypto");
    if (nodeCrypto?.pbkdf2Sync) {
      return nodeCrypto.pbkdf2Sync(pin.trim(), salt, 100000, 32, "sha256").toString("hex");
    }
    throw new Error("pbkdf2Sync unavailable");
  } catch (err) {
    console.error("Erreur de dérivation cryptographique:", err);
    throw new Error("Moteur cryptographique non disponible.");
  }
}

/**
 * Vérifie si un PIN saisi correspond au hash stocké (en temps constant)
 */
export async function verifyPin(pin: string, salt: string, expectedHash: string): Promise<boolean> {
  if (!pin || !salt || !expectedHash) return false;
  try {
    const computed = await hashPin(pin, salt);
    // Comparaison constante pour éviter les attaques temporelles
    if (computed.length !== expectedHash.length) return false;
    let match = 0;
    for (let i = 0; i < computed.length; i++) {
      match |= computed.charCodeAt(i) ^ expectedHash.charCodeAt(i);
    }
    return match === 0;
  } catch {
    return false;
  }
}

/**
 * Calcule la somme de contrôle SHA-256 d'un texte ou d'un objet
 */
export async function computeSha256Checksum(content: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(content);

  const cryptoObj = typeof window !== "undefined" && window.crypto ? window.crypto : (globalThis as any).crypto;

  if (cryptoObj && cryptoObj.subtle) {
    const hashBuffer = await cryptoObj.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  try {
    const nodeCrypto = (globalThis as any).require?.("crypto");
    if (nodeCrypto?.createHash) {
      return nodeCrypto.createHash("sha256").update(content).digest("hex");
    }
    throw new Error("createHash unavailable");
  } catch {
    throw new Error("Moteur de hachage SHA-256 non disponible.");
  }
}

/**
 * Vérifie l'intégrité cryptographique d'une archive de sauvegarde VCheque
 */
export async function verifyBackupIntegrity(rawJson: string): Promise<{
  valid: boolean;
  checksumMatch: boolean;
  archive?: BackupArchive;
  error?: string;
}> {
  try {
    const parsed: BackupArchive = JSON.parse(rawJson);

    if (!parsed || parsed.app !== "VCheque Studio" || !parsed.checksumSha256 || !parsed.payload) {
      return {
        valid: false,
        checksumMatch: false,
        error: "Le format du fichier de sauvegarde n'est pas reconnu ou est incomplet."
      };
    }

    // Sérialisation déterministe du payload pour vérifier le hash
    const payloadStr = JSON.stringify(parsed.payload);
    const calculatedChecksum = await computeSha256Checksum(payloadStr);

    if (calculatedChecksum.toLowerCase() !== parsed.checksumSha256.toLowerCase()) {
      return {
        valid: false,
        checksumMatch: false,
        archive: parsed,
        error: "ÉCHEC D'INTÉGRITÉ : La somme de contrôle SHA-256 ne correspond pas. Ce fichier a été modifié ou corrompu hors de l'application."
      };
    }

    return {
      valid: true,
      checksumMatch: true,
      archive: parsed
    };
  } catch (err: any) {
    return {
      valid: false,
      checksumMatch: false,
      error: `Erreur de lecture JSON : ${err.message || "Fichier invalide."}`
    };
  }
}
