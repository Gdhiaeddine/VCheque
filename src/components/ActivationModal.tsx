import React, { useState, useEffect } from "react";
import {
  ShieldCheck,
  KeyRound,
  Sparkles,
  Copy,
  Check,
  X,
  Globe,
  FileCheck2,
  UploadCloud,
  Laptop,
  AlertTriangle,
  Lock,
  RefreshCw,
  Award,
  CheckCircle2,
  FileText
} from "lucide-react";
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
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);

  const isValid = Boolean(currentStatus?.is_valid);

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
    // Insertion automatique des tirets si l'utilisateur saisit en continu
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

    setSelectedFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setOfflineFileContent(content);
    };
    reader.readAsText(file);
  };

  const handleOfflineActivate = async () => {
    if (!offlineFileContent.trim()) {
      setErrorMsg("Veuillez sélectionner un fichier .lic ou coller son contenu scellé.");
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
        setErrorMsg(result.message || "Fichier de licence invalide ou non certifié.");
      }
    } catch (err: any) {
      setErrorMsg(err?.message || String(err) || "Échec de l'importation de la licence hors-ligne.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="activation-modal-overlay" role="dialog" aria-modal="true">
      <div className="activation-modal-card">
        {/* En-tête prestige du modal */}
        <div className="activation-modal-header">
          <div className="activation-modal-title-row">
            <div className={`activation-modal-icon-badge ${isValid ? "" : "pending"}`}>
              {isValid ? <ShieldCheck size={22} /> : <KeyRound size={22} />}
            </div>
            <div>
              <h2 className="activation-modal-title">
                <span>Activation Commerciale VCheque</span>
                {isValid && (
                  <span
                    className="active-session-pill"
                    style={{ fontSize: "11px", padding: "2px 8px" }}
                  >
                    <Check size={11} /> Actif
                  </span>
                )}
              </h2>
              <p className="activation-modal-subtitle">
                Édition Commerciale Permanente &bull; Licence Monoposte Certifiée Ed25519
              </p>
            </div>
          </div>

          {allowClose && onClose && (
            <button
              type="button"
              className="company-modal-close"
              onClick={onClose}
              title="Fermer cette fenêtre"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Corps du modal */}
        <div className="activation-modal-body">
          {/* Bannière d'état si déjà activé */}
          {isValid && currentStatus?.payload && (
            <div className="activation-status-banner">
              <div className="activation-status-meta">
                <span className="activation-status-title">
                  Poste déjà activé : {currentStatus.payload.licensee_name || "Licence Professionnelle"}
                  {currentStatus.payload.company ? ` (${currentStatus.payload.company})` : ""}
                </span>
                <span className="activation-status-desc">
                  Clé active : <code className="license-code-chip">{currentStatus.payload.license_key}</code>
                </span>
              </div>
              <span className="license-status-badge valid">
                <CheckCircle2 size={13} />
                <span>Certifiée</span>
              </span>
            </div>
          )}

          {/* Alerte Erreur avec design du système */}
          {errorMsg && (
            <div className="activation-error-alert">
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: "1px" }} />
              <div>
                <strong>Erreur d'activation :</strong>
                <div style={{ marginTop: "2px" }}>{errorMsg}</div>
              </div>
            </div>
          )}

          {/* Empreinte Matérielle (Hardware ID) */}
          <div className="activation-hwid-box">
            <div className="activation-hwid-header">
              <span className="activation-hwid-label">
                <Laptop size={14} className="section-icon" />
                <span>Identifiant Matériel Unique (Machine ID)</span>
              </span>
              <button
                type="button"
                className="btn-storage-action"
                onClick={handleCopyHardwareId}
                title="Copier l'identifiant pour transmission hors-ligne"
                style={{ padding: "3px 8px", fontSize: "11px" }}
              >
                {copied ? <Check size={12} style={{ color: "var(--green-positive)" }} /> : <Copy size={12} />}
                <span>{copied ? "Copié !" : "Copier"}</span>
              </button>
            </div>

            <div className="activation-hwid-code-row">
              <code className="activation-hwid-code">
                {hardwareId || "Calcul de l'empreinte physique..."}
              </code>
            </div>

            <span className="setting-hint" style={{ fontSize: "10.5px" }}>
              Cette empreinte physique est scellée à votre matériel lors de la signature cryptographique.
            </span>
          </div>

          {/* Sélecteur de mode (Segmented Control standard) */}
          <div className="setting-row">
            <div className="segmented-control">
              <button
                type="button"
                className={`segment-btn ${!offlineMode ? "active" : ""}`}
                onClick={() => {
                  setOfflineMode(false);
                  setErrorMsg(null);
                }}
              >
                <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  <Globe size={13} />
                  <span>Activation en Ligne (Recommandé)</span>
                </div>
              </button>
              <button
                type="button"
                className={`segment-btn ${offlineMode ? "active" : ""}`}
                onClick={() => {
                  setOfflineMode(true);
                  setErrorMsg(null);
                }}
              >
                <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  <FileCheck2 size={13} />
                  <span>Activation Hors-Ligne (.lic)</span>
                </div>
              </button>
            </div>
          </div>

          {/* Mode 1 : Activation en ligne */}
          {!offlineMode ? (
            <form onSubmit={handleOnlineActivate} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div className="setting-row">
                <label className="setting-label">
                  Saisissez votre clé de licence commerciale :
                </label>
                <input
                  type="text"
                  className="activation-key-input"
                  placeholder="VCHQ-XXXX-XXXX-XXXX-XXXX"
                  value={licenseKey}
                  onChange={handleKeyChange}
                  maxLength={24}
                  disabled={loading}
                  autoFocus
                />
                <small className="setting-hint">
                  Format standard : <code>VCHQ-XXXX-XXXX-XXXX-XXXX</code>. Une connexion Internet n'est requise que pour cette validation unique.
                </small>
              </div>

              <button
                type="submit"
                className="btn-action-luxury-green"
                disabled={loading || !licenseKey.trim()}
                style={{ width: "100%", padding: "11px", fontSize: "13px" }}
              >
                {loading ? (
                  <>
                    <RefreshCw size={15} className="spin" />
                    <span>Vérification & activation auprès du serveur...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={15} />
                    <span>Valider & Activer la licence par Internet</span>
                  </>
                )}
              </button>
            </form>
          ) : (
            /* Mode 2 : Activation hors ligne */
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div className="setting-row">
                <label className="setting-label">
                  Fichier de certificat de licence (.lic signé) :
                </label>

                <label className="activation-offline-dropzone">
                  <input
                    type="file"
                    accept=".lic,.json"
                    onChange={handleOfflineFileSelect}
                    style={{ display: "none" }}
                    disabled={loading}
                  />
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
                    <UploadCloud size={24} className="section-icon" />
                    <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)" }}>
                      {selectedFileName ? selectedFileName : "Cliquez pour importer votre fichier de licence (.lic)"}
                    </span>
                    <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                      {selectedFileName ? "Fichier prêt à être validé" : "Fourni par votre administrateur ou revendeur agréé"}
                    </span>
                  </div>
                </label>
              </div>

              <div className="setting-row">
                <label className="setting-label">
                  Ou collez directement le contenu du certificat :
                </label>
                <textarea
                  className="activation-textarea"
                  rows={3}
                  placeholder="Collez ici le contenu cryptographique scellé du fichier .lic..."
                  value={offlineFileContent}
                  onChange={(e) => setOfflineFileContent(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  type="button"
                  className="btn-action-card"
                  onClick={() => {
                    setOfflineMode(false);
                    setErrorMsg(null);
                  }}
                  disabled={loading}
                  style={{ flex: 1 }}
                >
                  <Globe size={13} />
                  <span>Mode Internet</span>
                </button>

                <button
                  type="button"
                  className="btn-action-luxury-green"
                  onClick={handleOfflineActivate}
                  disabled={loading || !offlineFileContent.trim()}
                  style={{ flex: 2 }}
                >
                  {loading ? (
                    <>
                      <RefreshCw size={14} className="spin" />
                      <span>Vérification Ed25519...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck size={14} />
                      <span>Valider la licence hors-ligne</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Pied de page du modal */}
        <div className="activation-modal-footer">
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Lock size={13} className="section-icon" />
            <span>Signature cryptographique Ed25519 (256 bits)</span>
          </div>
          <span style={{ fontWeight: 600 }}>
            Utilisation 100% autonome hors-ligne
          </span>
        </div>
      </div>
    </div>
  );
};
