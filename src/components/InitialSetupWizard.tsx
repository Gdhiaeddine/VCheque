import React, { useState, useEffect } from "react";
import {
  FolderOpen,
  Building2,
  Shield,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  Sparkles,
  CreditCard,
  MapPin,
  Clock,
  HardDrive,
  Check,
  X
} from "lucide-react";
import type { CompanyRecord, UserRecord } from "../types";
import { defaultBankTemplates } from "../banksData";
import {
  getDataStoragePath,
  pickFolderDialog,
  applyInitialSetup,
  type InitialSetupData
} from "../services/setupConfig";

interface InitialSetupWizardProps {
  onComplete: (result: { company: CompanyRecord; admin: UserRecord }) => void;
  onCancel?: () => void;
}

const STEPS = [
  { id: 1, label: "Emplacement", icon: HardDrive },
  { id: 2, label: "Entreprise", icon: Building2 },
  { id: 3, label: "Administrateur", icon: Shield },
  { id: 4, label: "Finalisation", icon: Sparkles }
];

export const InitialSetupWizard: React.FC<InitialSetupWizardProps> = ({
  onComplete,
  onCancel
}) => {
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Étape 1 : Emplacement & Dossiers
  const [dataDir, setDataDir] = useState<string>("");
  const [defaultPlace, setDefaultPlace] = useState<string>("Alger");
  const [autoBackupEnabled, setAutoBackupEnabled] = useState<boolean>(true);

  // Étape 2 : Première Entreprise
  const [companyName, setCompanyName] = useState<string>("");
  const [legalForm, setLegalForm] = useState<string>("SARL");
  const [nif, setNif] = useState<string>("");
  const [nis, setNis] = useState<string>("");
  const [rc, setRc] = useState<string>("");
  const [articleImposition, setArticleImposition] = useState<string>("");
  const [address, setAddress] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [bankName, setBankName] = useState<string>("Banque Al Salam");
  const [accountNumber, setAccountNumber] = useState<string>("");
  const [templateId, setTemplateId] = useState<string>("el-salam");

  // Étape 3 : Administrateur & Code PIN
  const [adminDisplayName, setAdminDisplayName] = useState<string>("Direction Générale");
  const [adminUsername, setAdminUsername] = useState<string>("admin");
  const [adminPin, setAdminPin] = useState<string>("");
  const [confirmPin, setConfirmPin] = useState<string>("");
  const [showPin, setShowPin] = useState<boolean>(false);
  const [requirePinOnStartup, setRequirePinOnStartup] = useState<boolean>(true);

  // Initialisation du chemin de données par défaut
  useEffect(() => {
    getDataStoragePath().then((path) => {
      setDataDir(path);
    });
  }, []);

  const handleBrowseFolder = async () => {
    const chosen = await pickFolderDialog(dataDir);
    if (chosen) {
      setDataDir(chosen);
    }
  };

  const validateStep = (step: number): boolean => {
    setErrorMsg(null);
    if (step === 1) {
      if (!dataDir.trim()) {
        setErrorMsg("Veuillez spécifier le dossier d'emplacement des données et configurations.");
        return false;
      }
      return true;
    }

    if (step === 2) {
      if (!companyName.trim()) {
        setErrorMsg("Veuillez renseigner la raison sociale de votre entreprise.");
        return false;
      }
      return true;
    }

    if (step === 3) {
      if (!adminDisplayName.trim()) {
        setErrorMsg("Veuillez spécifier le nom d'affichage de l'Administrateur.");
        return false;
      }
      if (!adminUsername.trim()) {
        setErrorMsg("Veuillez spécifier un identifiant de connexion pour l'Administrateur.");
        return false;
      }
      if (!adminPin.trim()) {
        setErrorMsg("Veuillez définir un code PIN ou mot de passe de sécurité pour l'Administrateur.");
        return false;
      }
      if (adminPin.trim().length < 4) {
        setErrorMsg("Le code PIN doit comporter au moins 4 caractères ou chiffres.");
        return false;
      }
      if (adminPin !== confirmPin) {
        setErrorMsg("La confirmation du code PIN ne correspond pas au code saisi.");
        return false;
      }
      return true;
    }

    return true;
  };

  const handleNextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep((prev) => Math.min(4, prev + 1));
    }
  };

  const handlePrevStep = () => {
    setErrorMsg(null);
    setCurrentStep((prev) => Math.max(1, prev - 1));
  };

  const handleFinishSetup = async () => {
    if (!validateStep(1) || !validateStep(2) || !validateStep(3)) {
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const payload: InitialSetupData = {
        dataDir: dataDir.trim(),
        defaultPlace: defaultPlace.trim() || "Alger",
        autoBackupEnabled,
        company: {
          name: companyName.trim(),
          legalForm,
          nif: nif.trim() || undefined,
          nis: nis.trim() || undefined,
          rc: rc.trim() || undefined,
          articleImposition: articleImposition.trim() || undefined,
          address: address.trim() || undefined,
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          bank: accountNumber.trim()
            ? {
                bankName: bankName.trim(),
                accountNumber: accountNumber.trim(),
                templateId
              }
            : undefined
        },
        admin: {
          displayName: adminDisplayName.trim(),
          username: adminUsername.trim().toLowerCase(),
          pin: adminPin.trim(),
          requirePinOnStartup
        }
      };

      const result = await applyInitialSetup(payload);
      onComplete(result);
    } catch (err: any) {
      setErrorMsg(err?.message || "Erreur lors de l'application de la configuration initiale.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="setup-wizard-backdrop" role="dialog" aria-modal="true">
      <div className="setup-wizard-container">
        <div className="setup-wizard-card">
          {/* En-tête harmonisé avec la charte du logiciel */}
          <div className="setup-wizard-header">
            <div className="setup-header-brand">
              <div className="setup-header-icon-box">
                <Sparkles size={20} />
              </div>
              <div>
                <h1 className="setup-header-title">Assistant d'Initialisation & Configuration Initiale</h1>
                <span className="setup-header-subtitle">
                  Paramétrage du dossier de données, du profil entreprise et de l'administrateur
                </span>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div className="setup-version-pill">
                Étape {currentStep} / 4
              </div>
              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="modal-close-btn"
                  title="Fermer l'assistant"
                  aria-label="Fermer"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>

          {/* Stepper moderne en segmented control harmonisé */}
          <div className="setup-stepper">
            {STEPS.map((s) => {
              const isCurrent = currentStep === s.id;
              const isDone = currentStep > s.id;

              return (
                <div
                  key={s.id}
                  className={`setup-step-item ${isCurrent ? "active" : isDone ? "completed" : "inactive"}`}
                >
                  <div className={`setup-step-circle ${isCurrent ? "active" : isDone ? "completed" : "inactive"}`}>
                    {isDone ? <Check size={12} strokeWidth={3} /> : s.id}
                  </div>
                  <span className="setup-step-label">{s.label}</span>
                </div>
              );
            })}
          </div>

          {/* Corps de l'étape */}
          <div className="setup-step-body">
            {/* Toast d'alerte centré au milieu */}
            {errorMsg && (
              <div className="setup-toast-wrapper">
                <div className="app-toast toast-warning setup-toast-centered">
                  <AlertCircle size={16} style={{ flexShrink: 0 }} />
                  <span>{errorMsg}</span>
                </div>
              </div>
            )}

            {/* ÉTAPE 1 : Emplacement & Dossiers */}
            {currentStep === 1 && (
              <div>
                <div className="setup-section-title">
                  Emplacement des Données & Paramètres Locaux
                </div>
                <div className="setup-section-desc">
                  Indiquez le répertoire où seront stockées la base SQLite, les configurations des modèles et les sauvegardes certifiées.
                </div>

                <div className="setup-field-group">
                  <label className="user-form-label">
                    Dossier de stockage local des données <span style={{ color: "var(--gold-dark)" }}>*</span> :
                  </label>
                  <div className="setup-path-box">
                    <input
                      type="text"
                      className="user-form-input setup-path-input"
                      value={dataDir}
                      onChange={(e) => setDataDir(e.target.value)}
                      placeholder="C:\Users\...\AppData\Roaming\com.chequestudio.algerie"
                    />
                    <button
                      type="button"
                      className="setup-btn-browse"
                      onClick={handleBrowseFolder}
                      title="Parcourir l'ordinateur pour choisir un dossier"
                    >
                      <FolderOpen size={14} />
                      <span>Parcourir...</span>
                    </button>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginTop: "14px" }}>
                  <div>
                    <label className="user-form-label">
                      Ville d'émission par défaut des chèques :
                    </label>
                    <input
                      type="text"
                      className="user-form-input"
                      value={defaultPlace}
                      onChange={(e) => setDefaultPlace(e.target.value)}
                      placeholder="Ex: Alger, Oran, Constantine, etc."
                    />
                  </div>

                  <div>
                    <label className="user-form-label">
                      Devise monétaire officielle :
                    </label>
                    <input
                      type="text"
                      disabled
                      value="Dinar Algérien (DZD / د.ج)"
                      className="user-form-input"
                      style={{ background: "var(--bg-secondary)", cursor: "not-allowed" }}
                    />
                  </div>
                </div>

                {/* Option box harmonisée avec Checkbox visible */}
                <label
                  className={`setup-option-box ${autoBackupEnabled ? "selected" : ""}`}
                  style={{ cursor: "pointer", display: "flex", alignItems: "flex-start", gap: "12px" }}
                >
                  <div className="setup-checkbox-wrapper">
                    <input
                      type="checkbox"
                      className="setup-checkbox-input"
                      checked={autoBackupEnabled}
                      onChange={(e) => setAutoBackupEnabled(e.target.checked)}
                      aria-label="Activer les sauvegardes automatiques certifiées"
                    />
                    <div className={`setup-custom-checkbox ${autoBackupEnabled ? "checked" : ""}`}>
                      {autoBackupEnabled && <Check size={13} strokeWidth={3} className="setup-check-icon" />}
                    </div>
                  </div>

                  <div className="setup-option-icon">
                    <Clock size={16} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="setup-option-title">
                      Activer les sauvegardes automatiques certifiées (Recommandé)
                    </div>
                    <div className="setup-option-desc">
                      Génère périodiquement des archives scellées avec empreinte SHA-256 pour sécuriser l'historique de vos chèques et modèles.
                    </div>
                  </div>
                  {autoBackupEnabled ? (
                    <span className="active-session-pill" style={{ marginLeft: "8px" }}>
                      <Check size={11} strokeWidth={3} /> Activé
                    </span>
                  ) : (
                    <span style={{ fontSize: "11px", color: "var(--text-muted)", marginLeft: "8px", fontWeight: 600 }}>
                      Désactivé
                    </span>
                  )}
                </label>
              </div>
            )}

            {/* ÉTAPE 2 : Première Entreprise */}
            {currentStep === 2 && (
              <div>
                <div className="setup-section-title">
                  Création de la Première Entreprise Émettrice
                </div>
                <div className="setup-section-desc">
                  Renseignez les coordonnées et les identifiants fiscaux algériens de la société émettrice de vos chèques.
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "12px", marginBottom: "12px" }}>
                  <div>
                    <label className="user-form-label">
                      Raison Sociale de l'Entreprise <span style={{ color: "var(--gold-dark)" }}>*</span> :
                    </label>
                    <input
                      type="text"
                      required
                      className="user-form-input"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="Ex: SARL Al-Djazair Commercial"
                    />
                  </div>

                  <div>
                    <label className="user-form-label">
                      Forme Juridique :
                    </label>
                    <select
                      className="user-form-input"
                      value={legalForm}
                      onChange={(e) => setLegalForm(e.target.value)}
                    >
                      <option value="SARL">SARL</option>
                      <option value="EURL">EURL</option>
                      <option value="SPA">SPA</option>
                      <option value="SNC">SNC</option>
                      <option value="Personne Physique">Personne Physique</option>
                      <option value="Autre">Autre</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                  <div>
                    <label className="user-form-label">NIF (Identifiant Fiscal) :</label>
                    <input
                      type="text"
                      className="user-form-input"
                      value={nif}
                      onChange={(e) => setNif(e.target.value)}
                      placeholder="Ex: 000116001234567"
                    />
                  </div>
                  <div>
                    <label className="user-form-label">RC (Registre du Commerce) :</label>
                    <input
                      type="text"
                      className="user-form-input"
                      value={rc}
                      onChange={(e) => setRc(e.target.value)}
                      placeholder="Ex: 16/00-0123456B16"
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                  <div>
                    <label className="user-form-label">NIS (Statistique) :</label>
                    <input
                      type="text"
                      className="user-form-input"
                      value={nis}
                      onChange={(e) => setNis(e.target.value)}
                      placeholder="Ex: 12345678901234"
                    />
                  </div>
                  <div>
                    <label className="user-form-label">Article d'Imposition :</label>
                    <input
                      type="text"
                      className="user-form-input"
                      value={articleImposition}
                      onChange={(e) => setArticleImposition(e.target.value)}
                      placeholder="Ex: 16012345678"
                    />
                  </div>
                </div>

                <div style={{ marginBottom: "14px" }}>
                  <label className="user-form-label">Adresse du Siège Social :</label>
                  <input
                    type="text"
                    className="user-form-input"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Ex: 12 Rue Didouche Mourad, Alger"
                  />
                </div>

                {/* Premier compte bancaire optionnel harmonisé */}
                <div style={{ padding: "14px 16px", background: "#FAF8F5", borderRadius: "10px", border: "1px solid var(--border-color)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                    <CreditCard size={15} style={{ color: "var(--gold-dark)" }} />
                    <strong style={{ fontSize: "12.5px", color: "var(--text-primary)" }}>
                      Premier Compte Bancaire Émetteur (Facultatif)
                    </strong>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div>
                      <label className="user-form-label">Banque :</label>
                      <select
                        className="user-form-input"
                        value={templateId}
                        onChange={(e) => {
                          setTemplateId(e.target.value);
                          const tpl = defaultBankTemplates.find((t) => t.id === e.target.value);
                          if (tpl) setBankName(tpl.name);
                        }}
                      >
                        {defaultBankTemplates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="user-form-label">Numéro de Compte / RIB (20 chiffres) :</label>
                      <input
                        type="text"
                        className="user-form-input"
                        value={accountNumber}
                        onChange={(e) => setAccountNumber(e.target.value)}
                        placeholder="Ex: 001 00123 1234567890 12"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ÉTAPE 3 : Administrateur & Sécurité */}
            {currentStep === 3 && (
              <div>
                <div className="setup-section-title">
                  Compte Administrateur & Code PIN de Sécurité
                </div>
                <div className="setup-section-desc">
                  Définissez le profil du responsable principal et configurez son code PIN pour sécuriser l'accès au logiciel.
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
                  <div>
                    <label className="user-form-label">
                      Nom complet de l'Administrateur <span style={{ color: "var(--gold-dark)" }}>*</span> :
                    </label>
                    <input
                      type="text"
                      required
                      className="user-form-input"
                      value={adminDisplayName}
                      onChange={(e) => setAdminDisplayName(e.target.value)}
                      placeholder="Ex: Mohamed Benali"
                    />
                  </div>

                  <div>
                    <label className="user-form-label">
                      Identifiant de connexion <span style={{ color: "var(--gold-dark)" }}>*</span> :
                    </label>
                    <input
                      type="text"
                      required
                      className="user-form-input"
                      value={adminUsername}
                      onChange={(e) => setAdminUsername(e.target.value)}
                      placeholder="Ex: admin"
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <label className="user-form-label">
                        Code PIN d'Accès <span style={{ color: "var(--gold-dark)" }}>*</span> :
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowPin((p) => !p)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", marginBottom: "5px" }}
                      >
                        {showPin ? <EyeOff size={13} /> : <Eye size={13} />}
                        <span>{showPin ? "Masquer" : "Afficher"}</span>
                      </button>
                    </div>
                    <input
                      type={showPin ? "text" : "password"}
                      required
                      className="user-form-input"
                      value={adminPin}
                      onChange={(e) => setAdminPin(e.target.value)}
                      placeholder="4 à 8 chiffres ou mot de passe"
                    />
                  </div>

                  <div>
                    <label className="user-form-label">
                      Confirmer le Code PIN <span style={{ color: "var(--gold-dark)" }}>*</span> :
                    </label>
                    <input
                      type={showPin ? "text" : "password"}
                      required
                      className="user-form-input"
                      value={confirmPin}
                      onChange={(e) => setConfirmPin(e.target.value)}
                      placeholder="Retapez le même code PIN"
                    />
                  </div>
                </div>

                {/* Option box PIN au démarrage avec Checkbox visible */}
                <label
                  className={`setup-option-box ${requirePinOnStartup ? "selected" : ""}`}
                  style={{ cursor: "pointer", display: "flex", alignItems: "flex-start", gap: "12px" }}
                >
                  <div className="setup-checkbox-wrapper">
                    <input
                      type="checkbox"
                      className="setup-checkbox-input"
                      checked={requirePinOnStartup}
                      onChange={(e) => setRequirePinOnStartup(e.target.checked)}
                      aria-label="Exiger l'authentification par code PIN au lancement"
                    />
                    <div className={`setup-custom-checkbox ${requirePinOnStartup ? "checked" : ""}`}>
                      {requirePinOnStartup && <Check size={13} strokeWidth={3} className="setup-check-icon" />}
                    </div>
                  </div>

                  <div className="setup-option-icon">
                    <Lock size={16} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="setup-option-title">
                      Exiger l'authentification par code PIN au lancement (Recommandé)
                    </div>
                    <div className="setup-option-desc">
                      Verrouille immédiatement l'accès au logiciel pour protéger vos formules de chèques et comptes bancaires contre toute utilisation non autorisée.
                    </div>
                  </div>
                  {requirePinOnStartup ? (
                    <span className="active-session-pill" style={{ marginLeft: "8px" }}>
                      <Check size={11} strokeWidth={3} /> Protégé
                    </span>
                  ) : (
                    <span style={{ fontSize: "11px", color: "var(--text-muted)", marginLeft: "8px", fontWeight: 600 }}>
                      Accès direct
                    </span>
                  )}
                </label>
              </div>
            )}

            {/* ÉTAPE 4 : Récapitulatif & Lancement */}
            {currentStep === 4 && (
              <div>
                <div className="setup-section-title">
                  Récapitulatif de la Configuration
                </div>
                <div className="setup-section-desc">
                  Vérifiez vos paramètres avant de sceller l'initialisation et d'accéder à VCheque Studio.
                </div>

                <div className="setup-summary-card">
                  <div className="setup-summary-header">
                    <Building2 size={15} />
                    <span>Dossier Entreprise Émettrice</span>
                  </div>
                  <div className="setup-summary-grid">
                    <div className="setup-summary-item">
                      <span className="setup-summary-label">Raison Sociale :</span>
                      <span className="setup-summary-val">{companyName} ({legalForm})</span>
                    </div>
                    <div className="setup-summary-item">
                      <span className="setup-summary-label">NIF / RC :</span>
                      <span className="setup-summary-val">{nif || rc ? `${nif || "—"} / ${rc || "—"}` : "Non spécifiés"}</span>
                    </div>
                    <div className="setup-summary-item">
                      <span className="setup-summary-label">Ville d'Émission :</span>
                      <span className="setup-summary-val">{defaultPlace || "Alger"}</span>
                    </div>
                    <div className="setup-summary-item">
                      <span className="setup-summary-label">Compte Bancaire :</span>
                      <span className="setup-summary-val">{accountNumber ? `${bankName} (${accountNumber})` : "À configurer ultérieurement"}</span>
                    </div>
                  </div>
                </div>

                <div className="setup-summary-card">
                  <div className="setup-summary-header">
                    <Shield size={15} />
                    <span>Profil Administrateur & Sécurité</span>
                  </div>
                  <div className="setup-summary-grid">
                    <div className="setup-summary-item">
                      <span className="setup-summary-label">Nom d'Affichage :</span>
                      <span className="setup-summary-val">{adminDisplayName}</span>
                    </div>
                    <div className="setup-summary-item">
                      <span className="setup-summary-label">Identifiant :</span>
                      <span className="setup-summary-val" style={{ fontFamily: "var(--font-mono)" }}>{adminUsername}</span>
                    </div>
                    <div className="setup-summary-item">
                      <span className="setup-summary-label">Protection par PIN :</span>
                      <span className="setup-summary-val">{requirePinOnStartup ? "Activée au démarrage" : "Désactivée (Accès direct)"}</span>
                    </div>
                    <div className="setup-summary-item">
                      <span className="setup-summary-label">Sauvegardes Automatiques :</span>
                      <span className="setup-summary-val">{autoBackupEnabled ? "Activées" : "Désactivées"}</span>
                    </div>
                  </div>
                </div>

                <div className="setup-summary-card" style={{ marginBottom: "12px" }}>
                  <div className="setup-summary-header">
                    <HardDrive size={15} />
                    <span>Emplacement de Stockage Local</span>
                  </div>
                  <div style={{ fontSize: "11.5px", fontFamily: "var(--font-mono)", color: "var(--text-secondary)", wordBreak: "break-all" }}>
                    {dataDir}
                  </div>
                </div>

                {/* Banner étape suivante : Calibrage d'impression */}
                <div style={{ padding: "12px 14px", background: "rgba(212, 175, 55, 0.08)", border: "1px solid rgba(212, 175, 55, 0.3)", borderRadius: "10px", display: "flex", alignItems: "center", gap: "12px" }}>
                  <Sparkles size={18} style={{ color: "var(--gold-dark)", flexShrink: 0 }} />
                  <div style={{ fontSize: "12px", color: "var(--text-primary)", lineHeight: "1.4" }}>
                    <strong>Étape suivante recommandée :</strong> L'assistant de calibrage imprimante s'ouvrira pour vous proposer d'imprimer une feuille de test A4 avec <strong>3 chèques exemplaires réels à découper ✂️</strong> afin d'ajuster l'alignement sans gaspiller de vrais chéquiers.
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Pied de page des actions harmonisé */}
          <div className="setup-actions-footer">
            <div>
              {currentStep > 1 && (
                <button
                  type="button"
                  className="btn-action-card"
                  onClick={handlePrevStep}
                  disabled={isSubmitting}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "7px 14px", fontSize: "12px" }}
                >
                  <ArrowLeft size={13} />
                  <span>Précédent</span>
                </button>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {currentStep < 4 ? (
                <button
                  type="button"
                  className="btn-action-luxury-green"
                  onClick={handleNextStep}
                  style={{ display: "inline-flex", alignItems: "center", gap: "7px", padding: "8px 20px", fontSize: "12.5px" }}
                >
                  <span>Continuer</span>
                  <ArrowRight size={14} />
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-action-luxury-green btn-print-main"
                  onClick={handleFinishSetup}
                  disabled={isSubmitting}
                  style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "9px 24px", fontSize: "13px" }}
                >
                  <Sparkles size={16} />
                  <span>{isSubmitting ? "Initialisation..." : "Initialiser et Commencer"}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
