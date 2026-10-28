import React, { useState, useEffect } from "react";
import {
  getHardwareId,
  activateLicenseOnline,
  importOfflineLicense,
  type LicenseCheckResult,
} from "../services/licensing";

interface ActivationModalProps {
  isOpen: boolean;
  onClose?: () => void;
  onActivated: (result: LicenseCheckResult) => void;
  currentStatus?: LicenseCheckResult | null;
  allowClose?: boolean;
}

export const ActivationModal: React.FC<ActivationModalProps> = ({
  isOpen,
  onClose,
  onActivated,
  currentStatus,
  allowClose = false,
}) => {
  const [hardwareId, setHardwareId] = useState<string>("");
  const [licenseKey, setLicenseKey] = useState<string>("");
  const [copied, setCopied] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [offlineMode, setOfflineMode] = useState<boolean>(false);
  const [offlineFileContent, setOfflineFileContent] = useState<string>("");

  useEffect(() => {
    if (isOpen) {
      getHardwareId().then((id) => setHardwareId(id));
      if (currentStatus && !currentStatus.is_valid && currentStatus.status !== "NOT_ACTIVATED") {
        setErrorMsg(currentStatus.message);
      } else {
        setErrorMsg(null);
      }
    }
  }, [isOpen, currentStatus]);

  if (!isOpen) return null;

  const handleCopyHardwareId = () => {
    if (hardwareId) {
      navigator.clipboard.writeText(hardwareId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "");
    // Insertion automatique des tirets si utilisateur saisit en continu
    const raw = val.replace(/-/g, "");
    if (raw.startsWith("VCHQ")) {
      const rest = raw.slice(4);
      const chunks = rest.match(/.{1,4}/g) || [];
      val = ["VCHQ", ...chunks].join("-");
    }
    setLicenseKey(val);
    setErrorMsg(null);
  };

  const handleOnlineActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!licenseKey.trim()) {
      setErrorMsg("Veuillez saisir votre clé de licence commerciale.");
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const result = await activateLicenseOnline(licenseKey.trim());
      if (result.is_valid) {
        onActivated(result);
        if (onClose) onClose();
      } else {
        setErrorMsg(result.message || "Échec de l'activation.");
      }
    } catch (err: any) {
      setErrorMsg(err?.message || String(err) || "Impossible d'effectuer l'activation en ligne.");
    } finally {
      setLoading(false);
    }
  };

  const handleOfflineFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setOfflineFileContent(content);
    };
    reader.readAsText(file);
  };

  const handleOfflineActivate = async () => {
    if (!offlineFileContent.trim()) {
      setErrorMsg("Veuillez sélectionner ou coller le contenu du fichier .lic signé.");
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const result = await importOfflineLicense(offlineFileContent.trim());
      if (result.is_valid) {
        onActivated(result);
        if (onClose) onClose();
      } else {
        setErrorMsg(result.message || "Fichier de licence invalide.");
      }
    } catch (err: any) {
      setErrorMsg(err?.message || String(err) || "Échec de l'importation de la licence hors-ligne.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(15, 23, 42, 0.85)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 99999,
        padding: "1.5rem",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: "16px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
          width: "100%",
          maxWidth: "580px",
          padding: "2rem",
          color: "#1e293b",
          border: "1px solid #e2e8f0",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "12px",
                backgroundColor: "#0284c7",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#ffffff",
                fontSize: "24px",
                boxShadow: "0 4px 6px -1px rgba(2, 132, 199, 0.3)",
              }}
            >
              🔒
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.35rem", fontWeight: 700, color: "#0f172a" }}>
                Activation VCheque
              </h2>
              <p style={{ margin: "4px 0 0", fontSize: "0.875rem", color: "#64748b" }}>
                Édition Commerciale Permanente &bull; Licence 1 PC
              </p>
            </div>
          </div>
          {allowClose && onClose && (
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                fontSize: "1.25rem",
                cursor: "pointer",
                color: "#94a3b8",
                padding: "4px 8px",
              }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Alerte Erreur */}
        {errorMsg && (
          <div
            style={{
              padding: "0.85rem 1rem",
              borderRadius: "10px",
              backgroundColor: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#991b1b",
              fontSize: "0.875rem",
              marginBottom: "1.25rem",
              lineHeight: 1.4,
              display: "flex",
              alignItems: "flex-start",
              gap: "8px",
            }}
          >
            <span style={{ fontSize: "1.1rem" }}>⚠️</span>
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Empreinte Machine ID */}
        <div
          style={{
            backgroundColor: "#f8fafc",
            borderRadius: "10px",
            padding: "0.85rem 1rem",
            marginBottom: "1.25rem",
            border: "1px solid #e2e8f0",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase" }}>
              Identifiant Matériel de ce PC (Machine ID)
            </span>
            <button
              type="button"
              onClick={handleCopyHardwareId}
              style={{
                background: "none",
                border: "1px solid #cbd5e1",
                borderRadius: "6px",
                padding: "2px 8px",
                fontSize: "0.75rem",
                color: copied ? "#16a34a" : "#0284c7",
                cursor: "pointer",
                fontWeight: 600,
                backgroundColor: "#ffffff",
              }}
            >
              {copied ? "✓ Copié !" : "📋 Copier"}
            </button>
          </div>
          <code
            style={{
              display: "block",
              fontSize: "0.75rem",
              color: "#334155",
              wordBreak: "break-all",
              backgroundColor: "#f1f5f9",
              padding: "6px 8px",
              borderRadius: "6px",
            }}
          >
            {hardwareId || "Calcul en cours..."}
          </code>
        </div>

        {/* Formulaire Activation En Ligne */}
        {!offlineMode ? (
          <form onSubmit={handleOnlineActivate}>
            <div style={{ marginBottom: "1.25rem" }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
                Clé de licence commerciale
              </label>
              <input
                type="text"
                placeholder="VCHQ-XXXX-XXXX-XXXX-XXXX"
                value={licenseKey}
                onChange={handleKeyChange}
                maxLength={24}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "0.75rem 1rem",
                  fontSize: "1.05rem",
                  fontFamily: "monospace",
                  fontWeight: 600,
                  letterSpacing: "1px",
                  borderRadius: "10px",
                  border: "2px solid #cbd5e1",
                  outline: "none",
                  textAlign: "center",
                  textTransform: "uppercase",
                }}
                disabled={loading}
              />
              <span style={{ display: "block", fontSize: "0.75rem", color: "#64748b", marginTop: "4px" }}>
                Une connexion Internet est requise uniquement lors de cette première activation.
              </span>
            </div>

            <button
              type="submit"
              disabled={loading || !licenseKey.trim()}
              style={{
                width: "100%",
                padding: "0.85rem",
                borderRadius: "10px",
                border: "none",
                backgroundColor: loading ? "#94a3b8" : "#0284c7",
                color: "#ffffff",
                fontWeight: 700,
                fontSize: "0.95rem",
                cursor: loading ? "not-allowed" : "pointer",
                boxShadow: "0 4px 6px -1px rgba(2, 132, 199, 0.3)",
                transition: "background-color 0.15s ease",
              }}
            >
              {loading ? "Activation en cours..." : "Activer la licence par Internet"}
            </button>

            <div style={{ textAlign: "center", marginTop: "1rem" }}>
              <button
                type="button"
                onClick={() => setOfflineMode(true)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#64748b",
                  fontSize: "0.8rem",
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                PC sans connexion Internet ? Activer hors-ligne via fichier .lic
              </button>
            </div>
          </form>
        ) : (
          /* Mode Hors-Ligne (Importation de fichier signé) */
          <div>
            <div style={{ marginBottom: "1.25rem" }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
                Importer le fichier de licence signé (.lic)
              </label>
              <input
                type="file"
                accept=".lic,.json"
                onChange={handleOfflineFileSelect}
                style={{ display: "block", width: "100%", fontSize: "0.85rem", marginBottom: "8px" }}
              />
              <textarea
                rows={4}
                placeholder="Ou collez ici le contenu du fichier de licence reçu de l'administrateur..."
                value={offlineFileContent}
                onChange={(e) => setOfflineFileContent(e.target.value)}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  fontFamily: "monospace",
                  fontSize: "0.75rem",
                  padding: "8px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: "10px" }}>
              <button
                type="button"
                onClick={() => setOfflineMode(false)}
                style={{
                  flex: 1,
                  padding: "0.75rem",
                  borderRadius: "10px",
                  border: "1px solid #cbd5e1",
                  backgroundColor: "#ffffff",
                  color: "#475569",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                ← Retour au mode Internet
              </button>
              <button
                type="button"
                onClick={handleOfflineActivate}
                disabled={loading || !offlineFileContent.trim()}
                style={{
                  flex: 1,
                  padding: "0.75rem",
                  borderRadius: "10px",
                  border: "none",
                  backgroundColor: loading ? "#94a3b8" : "#16a34a",
                  color: "#ffffff",
                  fontWeight: 700,
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                {loading ? "Vérification..." : "Valider la licence hors-ligne"}
              </button>
            </div>
          </div>
        )}

        {/* Footer info */}
        <div style={{ marginTop: "1.5rem", borderTop: "1px solid #f1f5f9", paddingTop: "0.85rem", textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: "0.75rem", color: "#94a3b8" }}>
            Protection cryptographique Ed25519 &bull; Fonctionnement hors-ligne permanent après activation.
          </p>
        </div>
      </div>
    </div>
  );
};
