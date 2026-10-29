import React from "react";
import {
  Award,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  HardDrive,
  Building2,
  Lock,
  Calendar,
  Check
} from "lucide-react";
import type { LicenseCheckResult } from "../services/licensing";

interface WelcomeModalProps {
  isOpen: boolean;
  licenseStatus: LicenseCheckResult | null;
  onProceed: () => void;
  isAlreadyConfigured?: boolean;
}

export const WelcomeModal: React.FC<WelcomeModalProps> = ({
  isOpen,
  licenseStatus,
  onProceed,
  isAlreadyConfigured = false
}) => {
  if (!isOpen) return null;

  const payload = licenseStatus?.payload;
  const licenseeName = payload?.licensee_name || "Licence Commerciale Permanente";
  const companyName = payload?.company || "Virtanis Entreprise";
  const rawKey = payload?.license_key || "";
  const maskedKey = rawKey.length > 12 ? `${rawKey.slice(0, 9)}••••-••••-••••` : rawKey;

  const issuedDate = React.useMemo(() => {
    const ts = payload?.issued_at;
    if (!ts) return null;
    try {
      const d = new Date(ts > 1e11 ? ts : ts * 1000);
      return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
    } catch {
      return null;
    }
  }, [payload?.issued_at]);

  return (
    <div className="activation-modal-overlay" role="dialog" aria-modal="true">
      <div className="activation-modal-card" style={{ width: "660px" }}>
        {/* En-tête officiel dans le même style que les autres modals */}
        <div className="activation-modal-header">
          <div className="activation-modal-title-row">
            <div className="setup-header-icon-box">
              <Award size={20} />
            </div>
            <div>
              <h2 className="activation-modal-title">
                <span>Bienvenue dans VCheque Studio</span>
                <span
                  className="active-session-pill"
                  style={{ fontSize: "11px", padding: "2px 8px" }}
                >
                  <Check size={11} /> Licence Active
                </span>
              </h2>
              <p className="activation-modal-subtitle">
                Édition Commerciale Permanente Algérie &bull; Authentification certifiée Ed25519
              </p>
            </div>
          </div>
        </div>

        {/* Corps principal harmonisé */}
        <div className="activation-modal-body">
          {/* Bannière de certificat officiel identique au composant de licence */}
          <div className="license-hero-banner is-valid">
            <div className="license-hero-identity">
              <div className="license-hero-icon-box valid">
                <ShieldCheck size={22} />
              </div>
              <div className="license-hero-meta">
                <div className="license-hero-title-row">
                  <span className="license-hero-name">{licenseeName}</span>
                  {companyName && (
                    <span className="license-hero-company">— {companyName}</span>
                  )}
                </div>
                <div className="license-hero-tags">
                  <span className="license-pill-tag">
                    <Award size={11} /> Édition Commerciale Mono-poste
                  </span>
                  <span className="license-pill-tag">
                    <Lock size={11} /> Signature Ed25519
                  </span>
                  {issuedDate && (
                    <span className="license-pill-tag">
                      <Calendar size={11} /> Délivrée le {issuedDate}
                    </span>
                  )}
                  <span className="license-pill-tag">
                    <Check size={11} /> Hors-ligne permanent
                  </span>
                </div>
              </div>
            </div>

            <div className="license-hero-status-side">
              <span className="license-status-badge valid">
                <CheckCircle2 size={14} />
                <span>Licence Active & Certifiée</span>
              </span>
            </div>
          </div>

          {/* Si clé présente : Ligne de clé dans le style storage-info-row */}
          {rawKey && (
            <div className="storage-info-row">
              <div className="storage-info-item">
                <strong className="storage-title">Clé de Licence Activée :</strong>
                <span className="storage-path">
                  <code className="license-code-chip">{maskedKey}</code>
                </span>
              </div>
              <span
                className="active-session-pill"
                style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", padding: "3px 8px" }}
              >
                <ShieldCheck size={12} />
                <span>Validée localement</span>
              </span>
            </div>
          )}

          {/* Feuille de route en 3 étapes guidées avec le style setup-option-box */}
          {!isAlreadyConfigured ? (
            <div className="setting-row">
              <label className="setting-label">
                Préparez votre espace de travail en 3 étapes guidées :
              </label>

              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "4px" }}>
                {/* Étape 1 */}
                <div className="setup-option-box selected" style={{ margin: 0, cursor: "default" }}>
                  <div className="setup-option-icon">
                    <HardDrive size={16} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div className="setup-option-title">1. Emplacement des Données & Sauvegardes</div>
                      <span className="setup-version-pill" style={{ fontSize: "10px", padding: "1px 6px" }}>Étape 1</span>
                    </div>
                    <div className="setup-option-desc">
                      Sélection du répertoire local pour la base SQLite et planification des sauvegardes automatiques scellées (.vcbk).
                    </div>
                  </div>
                </div>

                {/* Étape 2 */}
                <div className="setup-option-box selected" style={{ margin: 0, cursor: "default" }}>
                  <div className="setup-option-icon">
                    <Building2 size={16} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div className="setup-option-title">2. Première Entreprise & Chéquier Bancaire</div>
                      <span className="setup-version-pill" style={{ fontSize: "10px", padding: "1px 6px" }}>Étape 2</span>
                    </div>
                    <div className="setup-option-desc">
                      Renseignement de la raison sociale, identifiants légaux algériens (NIF, NIS, RC) et premier compte bancaire.
                    </div>
                  </div>
                </div>

                {/* Étape 3 */}
                <div className="setup-option-box selected" style={{ margin: 0, cursor: "default" }}>
                  <div className="setup-option-icon">
                    <ShieldCheck size={16} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div className="setup-option-title">3. Sécurité Superviseur & Code PIN</div>
                      <span className="setup-version-pill" style={{ fontSize: "10px", padding: "1px 6px" }}>Étape 3</span>
                    </div>
                    <div className="setup-option-desc">
                      Création du profil Administrateur avec code PIN de verrouillage et activation du grand journal d'audit.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="storage-info-row">
              <div className="storage-info-item">
                <strong className="storage-title">Système déjà configuré :</strong>
                <span className="storage-path">
                  Vos modèles de banques, dossiers d'entreprises et comptes sont opérationnels.
                </span>
              </div>
              <span
                className="active-session-pill"
                style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", padding: "3px 8px" }}
              >
                <Check size={12} />
                <span>Prêt à l'emploi</span>
              </span>
            </div>
          )}
        </div>

        {/* Pied de page standard harmonisé */}
        <div className="activation-modal-footer">
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Lock size={13} className="section-icon" />
            <span>Cryptographie Ed25519 &bull; Utilisation 100% autonome hors-ligne</span>
          </div>

          <button
            type="button"
            className="btn-action-luxury-green"
            onClick={onProceed}
            style={{ padding: "10px 22px", fontSize: "13px" }}
          >
            <Sparkles size={15} />
            <span>{!isAlreadyConfigured ? "Démarrer la Configuration Assistée" : "Accéder à l'Espace de Travail"}</span>
            <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
};
