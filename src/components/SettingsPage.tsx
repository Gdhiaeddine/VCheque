import React, { useState, useEffect } from "react";
import {
  Settings,
  ArrowLeft,
  RotateCcw,
  Sparkles,
  Shield,
  FileText,
  Building2,
  Database,
  FolderOpen,
  Download,
  UploadCloud,
  FileDown,
  ShieldAlert,
  CheckCircle2,
  Sliders,
  Type,
  Hash,
  MapPin,
  Check,
  Lock,
  Users,
  History,
  FileCheck2,
  ShieldCheck,
  Clock,
  KeyRound
} from "lucide-react";
import type {
  AppSettings,
  LetterCase,
  CurrencyTextVariant,
  TextSurroundSymbol,
  ZeroCentsMention,
  NumericSecuritySymbol,
  NumericCurrencySuffix,
  DecimalSeparator,
  SecuritySettings,
  UserRecord
} from "../types";
import { amountInFrenchWords, formatNumericAmount } from "../moneyToWords";
import { exportFullBackup } from "../services/appSettings";
import { getConfigFilePath, openConfigFileFolder } from "../services/templatesConfig";
import { getSecuritySettings, saveSecuritySettings, logAuditEvent } from "../services/db";
import { hasPermission, isUserAdmin } from "../services/permissions";

interface SettingsPageProps {
  settings: AppSettings;
  onUpdateSettings: (newSettings: AppSettings) => void;
  onResetSettings: () => void;
  onBackToHome: () => void;
  onOpenUserManager?: () => void;
  onOpenAuditTrail?: () => void;
  onOpenBackupRestore?: (initialTab?: "export" | "restore" | "auto") => void;
  onOpenBackup?: () => void;
  onOpenRestore?: () => void;
  onOpenAutoBackup?: () => void;
  currentUser?: UserRecord | null;
}

const COMMON_CITIES = ["Alger", "Oran", "Constantine", "Sétif", "Annaba", "Blida", "Batna", "Tlemcen"];

export const SettingsPage: React.FC<SettingsPageProps> = ({
  settings,
  onUpdateSettings,
  onResetSettings,
  onBackToHome,
  onOpenUserManager,
  onOpenAuditTrail,
  onOpenBackupRestore,
  onOpenBackup,
  onOpenRestore,
  onOpenAutoBackup,
  currentUser
}) => {
  const [configPath, setConfigPath] = useState<string>("");
  const [saveToast, setSaveToast] = useState<boolean>(false);
  const [securitySettings, setSecuritySettings] = useState<SecuritySettings>(() => getSecuritySettings());

  const isAdmin = isUserAdmin(currentUser);
  const canViewAudit = hasPermission(currentUser, "audit:view");
  const canRestore = hasPermission(currentUser, "backup:restore");

  const handleOpenBackup = () => {
    if (onOpenBackup) onOpenBackup();
    else onOpenBackupRestore?.("export");
  };

  const handleOpenRestore = () => {
    if (onOpenRestore) onOpenRestore();
    else onOpenBackupRestore?.("restore");
  };

  const handleOpenAutoBackup = () => {
    if (onOpenAutoBackup) onOpenAutoBackup();
    else onOpenBackupRestore?.("auto");
  };

  useEffect(() => {
    getConfigFilePath().then(setConfigPath).catch(console.error);
  }, []);

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const updated = { ...settings, [key]: value };
    onUpdateSettings(updated);
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 2000);
  };

  const updateSecuritySetting = async <K extends keyof SecuritySettings>(
    key: K,
    value: SecuritySettings[K]
  ) => {
    if (!isAdmin) {
      alert("Modification réservée au profil Administrateur.");
      return;
    }
    const updated = { ...securitySettings, [key]: value };
    await saveSecuritySettings(updated);
    setSecuritySettings(updated);
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 2000);
    logAuditEvent(
      "settings_update",
      "security",
      `Mise à jour du réglage de sécurité : ${String(key)} = ${String(value)}`,
      { key, value }
    ).catch(console.warn);
  };

  // Demo amount for live preview
  const demoRaw = "125450.75";
  const previewNumeric = formatNumericAmount(demoRaw, {
    securitySymbol: settings.numericSecuritySymbol,
    currencySuffix: settings.numericCurrencySuffix,
    decimalSeparator: settings.decimalSeparator
  });

  const previewWords = amountInFrenchWords(demoRaw, {
    letterCase: settings.letterCase,
    currencyTextVariant: settings.currencyTextVariant,
    surroundSymbol: settings.textSurroundSymbol,
    zeroCentsMention: settings.zeroCentsMention
  });

  return (
    <div className="settings-page">
      {/* 1. En-tête de la page */}
      <div className="settings-page-header">
        <div className="header-breadcrumbs">
          <button type="button" className="btn-back-crumb" onClick={onBackToHome}>
            <ArrowLeft size={16} />
            <span>Retour à l'accueil (Saisie)</span>
          </button>
        </div>

        <div className="header-main-title-row">
          <div>
            <div className="title-with-badge">
              <h1 className="history-main-title">Paramètres & Préférences</h1>
              <span className="db-badge" title="Vos modifications sont enregistrées instantanément">
                Enregistrement instantané
              </span>
            </div>
            <p className="history-main-subtitle">
              Personnalisez le formatage des montants, la casse des lettres, les symboles de sécurité et vos valeurs par défaut.
            </p>
          </div>

          <div className="header-actions-group">
            <button
              type="button"
              className="btn-reset-settings"
              onClick={() => {
                if (window.confirm("Rétablir tous les paramètres par défaut ?")) {
                  onResetSettings();
                }
              }}
              title="Rétablir les réglages initiaux"
            >
              <RotateCcw size={15} />
              <span>Rétablir par défaut</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Carte de prévisualisation en direct (Live Preview) */}
      <div className="settings-preview-banner">
        <div className="preview-banner-header">
          <div className="banner-title-group">
            <Sparkles size={16} className="gold-sparkle" />
            <span className="banner-title">Aperçu en direct de vos réglages</span>
          </div>
          <span className="preview-indicator-badge">Exemple : 125 450,75 DA</span>
        </div>

        <div className="preview-cheque-mock">
          <div className="mock-cheque-top">
            <div className="mock-barre-badge">
              {settings.defaultIsCrossed ? "// CHÈQUE BARRÉ ACTIF" : "NON BARRÉ"}
            </div>
            <div className="mock-numeric-box">{previewNumeric}</div>
          </div>

          <div className="mock-cheque-middle">
            <span className="mock-label">Montant en toutes lettres :</span>
            <div className="mock-words-box">{previewWords}</div>
          </div>

          <div className="mock-cheque-bottom">
            <span>Fait à : <strong>{settings.defaultPlace || "Alger"}</strong></span>
            <span>Date : <strong>19/10/2026</strong></span>
          </div>
        </div>
      </div>

      {/* 3. Grille des sections de réglages */}
      <div className="settings-sections-grid">
        {/* Section A : Montant en lettres */}
        <div className="settings-card">
          <div className="settings-card-header">
            <div className="section-title-group">
              <Type size={18} className="section-icon" />
              <div>
                <h2 className="section-title">Montant en toutes lettres</h2>
                <span className="section-desc">Conversion et typographie du texte</span>
              </div>
            </div>
          </div>

          <div className="settings-card-body">
            {/* Casse du texte */}
            <div className="setting-row">
              <label className="setting-label">Casse des lettres :</label>
              <div className="segmented-control">
                <button
                  type="button"
                  className={`segment-btn ${settings.letterCase === "sentence" ? "active" : ""}`}
                  onClick={() => updateSetting("letterCase", "sentence")}
                >
                  Majuscule au début
                </button>
                <button
                  type="button"
                  className={`segment-btn ${settings.letterCase === "lower" ? "active" : ""}`}
                  onClick={() => updateSetting("letterCase", "lower")}
                >
                  minuscules
                </button>
                <button
                  type="button"
                  className={`segment-btn ${settings.letterCase === "upper" ? "active" : ""}`}
                  onClick={() => updateSetting("letterCase", "upper")}
                >
                  MAJUSCULES
                </button>
              </div>
              <small className="setting-hint">
                Conseil bancaire : Les MAJUSCULES empêchent les rajouts manuscrits frauduleux.
              </small>
            </div>

            {/* Mention de devise */}
            <div className="setting-row">
              <label className="setting-label">Formulation de la devise :</label>
              <div className="segmented-control">
                <button
                  type="button"
                  className={`segment-btn ${settings.currencyTextVariant === "dinars-algeriens" ? "active" : ""}`}
                  onClick={() => updateSetting("currencyTextVariant", "dinars-algeriens")}
                >
                  dinars algériens
                </button>
                <button
                  type="button"
                  className={`segment-btn ${settings.currencyTextVariant === "dinars" ? "active" : ""}`}
                  onClick={() => updateSetting("currencyTextVariant", "dinars")}
                >
                  dinars
                </button>
                <button
                  type="button"
                  className={`segment-btn ${settings.currencyTextVariant === "dzd" ? "active" : ""}`}
                  onClick={() => updateSetting("currencyTextVariant", "dzd")}
                >
                  DZD
                </button>
              </div>
            </div>

            {/* Encadrement anti-fraude */}
            <div className="setting-row">
              <label className="setting-label">Encadrement du texte :</label>
              <div className="segmented-control">
                <button
                  type="button"
                  className={`segment-btn ${settings.textSurroundSymbol === "none" ? "active" : ""}`}
                  onClick={() => updateSetting("textSurroundSymbol", "none")}
                >
                  Aucun
                </button>
                <button
                  type="button"
                  className={`segment-btn ${settings.textSurroundSymbol === "stars" ? "active" : ""}`}
                  onClick={() => updateSetting("textSurroundSymbol", "stars")}
                >
                  *** Étoiles ***
                </button>
                <button
                  type="button"
                  className={`segment-btn ${settings.textSurroundSymbol === "hashes" ? "active" : ""}`}
                  onClick={() => updateSetting("textSurroundSymbol", "hashes")}
                >
                  ### Croisillons ###
                </button>
              </div>
            </div>

            {/* Si zéro centimes */}
            <div className="setting-row">
              <label className="setting-label">Lorsque les centimes sont nuls :</label>
              <div className="segmented-control">
                <button
                  type="button"
                  className={`segment-btn ${settings.zeroCentsMention === "none" ? "active" : ""}`}
                  onClick={() => updateSetting("zeroCentsMention", "none")}
                >
                  Sans mention
                </button>
                <button
                  type="button"
                  className={`segment-btn ${settings.zeroCentsMention === "exacts" ? "active" : ""}`}
                  onClick={() => updateSetting("zeroCentsMention", "exacts")}
                >
                  « exacts »
                </button>
                <button
                  type="button"
                  className={`segment-btn ${settings.zeroCentsMention === "zero-cents" ? "active" : ""}`}
                  onClick={() => updateSetting("zeroCentsMention", "zero-cents")}
                >
                  « et zéro centime »
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Section B : Montant chiffré */}
        <div className="settings-card">
          <div className="settings-card-header">
            <div className="section-title-group">
              <Hash size={18} className="section-icon" />
              <div>
                <h2 className="section-title">Montant chiffré (Zone numérique)</h2>
                <span className="section-desc">Protection et présentation du chiffre</span>
              </div>
            </div>
          </div>

          <div className="settings-card-body">
            {/* Symbole de sécurité (Hash) */}
            <div className="setting-row">
              <label className="setting-label">Symbole de verrouillage anti-fraude :</label>
              <div className="segmented-control">
                <button
                  type="button"
                  className={`segment-btn ${settings.numericSecuritySymbol === "hash" ? "active" : ""}`}
                  onClick={() => updateSetting("numericSecuritySymbol", "hash")}
                >
                  # Croisillon #
                </button>
                <button
                  type="button"
                  className={`segment-btn ${settings.numericSecuritySymbol === "star" ? "active" : ""}`}
                  onClick={() => updateSetting("numericSecuritySymbol", "star")}
                >
                  * Étoile *
                </button>
                <button
                  type="button"
                  className={`segment-btn ${settings.numericSecuritySymbol === "dash" ? "active" : ""}`}
                  onClick={() => updateSetting("numericSecuritySymbol", "dash")}
                >
                  -- Tirets --
                </button>
                <button
                  type="button"
                  className={`segment-btn ${settings.numericSecuritySymbol === "none" ? "active" : ""}`}
                  onClick={() => updateSetting("numericSecuritySymbol", "none")}
                >
                  Aucun
                </button>
              </div>
              <small className="setting-hint">
                Emprisonne les chiffres pour empêcher l'ajout de chiffres supplémentaires avant ou après.
              </small>
            </div>

            {/* Suffixe monétaire */}
            <div className="setting-row">
              <label className="setting-label">Mention de devise chiffrée :</label>
              <div className="segmented-control">
                <button
                  type="button"
                  className={`segment-btn ${settings.numericCurrencySuffix === "none" ? "active" : ""}`}
                  onClick={() => updateSetting("numericCurrencySuffix", "none")}
                >
                  Aucune (Standard)
                </button>
                <button
                  type="button"
                  className={`segment-btn ${settings.numericCurrencySuffix === "da" ? "active" : ""}`}
                  onClick={() => updateSetting("numericCurrencySuffix", "da")}
                >
                  Suffixe DA
                </button>
                <button
                  type="button"
                  className={`segment-btn ${settings.numericCurrencySuffix === "dzd" ? "active" : ""}`}
                  onClick={() => updateSetting("numericCurrencySuffix", "dzd")}
                >
                  Suffixe DZD
                </button>
              </div>
            </div>

            {/* Séparateur décimal */}
            <div className="setting-row">
              <label className="setting-label">Séparateur décimal :</label>
              <div className="segmented-control">
                <button
                  type="button"
                  className={`segment-btn ${settings.decimalSeparator === "comma" ? "active" : ""}`}
                  onClick={() => updateSetting("decimalSeparator", "comma")}
                >
                  Virgule (125 450,75)
                </button>
                <button
                  type="button"
                  className={`segment-btn ${settings.decimalSeparator === "dot" ? "active" : ""}`}
                  onClick={() => updateSetting("decimalSeparator", "dot")}
                >
                  Point (125 450.75)
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Section C : Préférences par défaut du formulaire */}
        <div className="settings-card">
          <div className="settings-card-header">
            <div className="section-title-group">
              <MapPin size={18} className="section-icon" />
              <div>
                <h2 className="section-title">Valeurs par défaut du formulaire</h2>
                <span className="section-desc">Gagnez du temps lors de chaque saisie</span>
              </div>
            </div>
          </div>

          <div className="settings-card-body">
            {/* Lieu par défaut */}
            <div className="setting-row">
              <label className="setting-label">Lieu d'émission par défaut (Fait à) :</label>
              <input
                type="text"
                className="settings-text-input"
                value={settings.defaultPlace}
                onChange={(e) => updateSetting("defaultPlace", e.target.value)}
                placeholder="Ex: Alger, Oran, Constantine..."
              />
              <div className="quick-city-tags">
                <span className="tags-label">Suggestions :</span>
                {COMMON_CITIES.map((city) => (
                  <button
                    key={city}
                    type="button"
                    className={`city-pill ${settings.defaultPlace === city ? "selected" : ""}`}
                    onClick={() => updateSetting("defaultPlace", city)}
                  >
                    {city}
                  </button>
                ))}
              </div>
            </div>

            {/* Chèque barré par défaut */}
            <div className="setting-row">
              <label className="settings-switch-label">
                <input
                  type="checkbox"
                  className="settings-switch-input"
                  checked={settings.defaultIsCrossed}
                  onChange={(e) => updateSetting("defaultIsCrossed", e.target.checked)}
                />
                <div className="switch-text-content">
                  <strong className="switch-title">Activer systématiquement le chèque barré</strong>
                  <span className="switch-desc">
                    Ajoute automatiquement les deux barres obliques de non-endossement sur chaque nouveau chèque.
                  </span>
                </div>
              </label>
            </div>

            {/* Numéro de chèque par défaut */}
            <div className="setting-row">
              <label className="settings-switch-label">
                <input
                  type="checkbox"
                  className="settings-switch-input"
                  checked={settings.defaultShowChequeNumber ?? false}
                  onChange={(e) => updateSetting("defaultShowChequeNumber", e.target.checked)}
                />
                <div className="switch-text-content">
                  <strong className="switch-title">Activer le numéro de chèque par défaut</strong>
                  <span className="switch-desc">
                    Désactivé (masqué) par défaut recommandé : les formules de chèques sont déjà pré-imprimées par la banque avec leur numéro de série officiel.
                  </span>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Section D : Sauvegarde des Données (Exportation) */}
        <div className="settings-card">
          <div className="settings-card-header">
            <div className="section-title-group">
              <Download size={18} className="section-icon text-gold" />
              <div>
                <h2 className="section-title">Sauvegarde des Données (Exportation)</h2>
                <span className="section-desc">
                  Création de copies de sécurité certifiées, archivage scellé et planification
                </span>
              </div>
            </div>
          </div>

          <div className="settings-card-body">
            {/* 1. Archive certifiée VCheque */}
            <div className="storage-info-row">
              <div className="storage-info-item">
                <strong className="storage-title">Sauvegarde Complète Certifiée (.vcbk) :</strong>
                <span className="storage-path">
                  Archive scellée SHA-256 (chèques, comptes, chéquiers, bénéficiaires, modèles et grand journal d'audit)
                </span>
              </div>

              {(onOpenBackup || onOpenBackupRestore) && (
                <button
                  type="button"
                  className="btn-storage-action"
                  onClick={handleOpenBackup}
                  title="Créer une sauvegarde certifiée scellée"
                >
                  <Download size={14} />
                  <span>Créer une sauvegarde</span>
                </button>
              )}
            </div>

            {/* 2. Sauvegardes automatiques */}
            <div className="storage-info-row">
              <div className="storage-info-item">
                <strong className="storage-title">Sauvegardes Automatiques Programmées :</strong>
                <span className="storage-path">
                  Génération en tâche de fond (à la fermeture, quotidienne ou hebdomadaire) avec purge des anciennes copies
                </span>
              </div>

              {(onOpenAutoBackup || onOpenBackupRestore) && (
                <button
                  type="button"
                  className="btn-storage-action"
                  onClick={handleOpenAutoBackup}
                  title="Configurer la fréquence et la rétention des sauvegardes automatiques"
                >
                  <Clock size={14} />
                  <span>Planification auto</span>
                </button>
              )}
            </div>

            {/* 3. Export JSON simple */}
            <div className="storage-info-row">
              <div className="storage-info-item">
                <strong className="storage-title">Sauvegarde JSON simple (Héritée) :</strong>
                <span className="storage-path">
                  Télécharge un export JSON combinant vos réglages et modèles uniquement
                </span>
              </div>

              <button
                type="button"
                className="btn-storage-action"
                onClick={() => exportFullBackup()}
                title="Exporter une sauvegarde simple au format JSON"
              >
                <FileDown size={14} />
                <span>Export simple (.json)</span>
              </button>
            </div>
          </div>
        </div>

        {/* Section E : Restauration des Données (Importation) */}
        <div className="settings-card">
          <div className="settings-card-header">
            <div className="section-title-group">
              <UploadCloud size={18} className="section-icon text-gold" />
              <div>
                <h2 className="section-title">Restauration des Données (Importation)</h2>
                <span className="section-desc">
                  Contrôle anti-altération SHA-256 et réinjection sécurisée de données
                </span>
              </div>
            </div>
          </div>

          <div className="settings-card-body">
            <div className="storage-info-row">
              <div className="storage-info-item">
                <strong className="storage-title">
                  {canRestore ? "Restauration depuis Archive (.vcbk ou .json) :" : "Restauration (Accès Administrateur) :"}
                </strong>
                <span className="storage-path">
                  {canRestore
                    ? "Vérification d'intégrité SHA-256 en direct, mode remplacement total ou fusion sans écrasement"
                    : "Action réservée : la réinjection de base de données requiert les prérogatives du rôle Administrateur"}
                </span>
              </div>

              {(onOpenRestore || onOpenBackupRestore) && (
                <button
                  type="button"
                  className="btn-storage-action"
                  onClick={handleOpenRestore}
                  disabled={!canRestore}
                  style={!canRestore ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
                  title={
                    !canRestore
                      ? "La restauration de base de données est réservée au profil Administrateur"
                      : "Restaurer vos données depuis une archive certifiée"
                  }
                >
                  {!canRestore ? <Lock size={14} /> : <UploadCloud size={14} />}
                  <span>Restaurer une sauvegarde</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Section F : Emplacement des Fichiers & Stockage Local */}
        <div className="settings-card">
          <div className="settings-card-header">
            <div className="section-title-group">
              <Database size={18} className="section-icon" />
              <div>
                <h2 className="section-title">Stockage & Fichiers Locaux</h2>
                <span className="section-desc">Emplacements physiques des bases de données et fichiers de modèles</span>
              </div>
            </div>
          </div>

          <div className="settings-card-body">
            <div className="storage-info-row">
              <div className="storage-info-item">
                <strong className="storage-title">Fichier des modèles (JSON copiable) :</strong>
                <span className="storage-path" title={configPath}>
                  {configPath || "cheque-templates.json"}
                </span>
              </div>

              <button
                type="button"
                className="btn-storage-action"
                onClick={() => openConfigFileFolder()}
                title="Ouvrir le dossier dans l'Explorateur Windows"
              >
                <FolderOpen size={15} />
                <span>Ouvrir l'emplacement</span>
              </button>
            </div>

            <div className="storage-info-row">
              <div className="storage-info-item">
                <strong className="storage-title">Base SQLite de l'historique :</strong>
                <span className="storage-path">cheques.db (Indexation B-Tree 60 FPS)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Section E : Sécurité, Opérateurs & Traçabilité */}
        <div className="settings-card">
          <div className="settings-card-header">
            <div className="section-title-group">
              <ShieldCheck size={18} className="section-icon" />
              <div>
                <h2 className="section-title">Sécurité, Opérateurs & Traçabilité</h2>
                <span className="section-desc">
                  Accès protégé par code PIN, profils multi-opérateurs et journal d'audit
                </span>
              </div>
            </div>
          </div>

          <div className="settings-card-body">
            {/* 1. Mode sécurisé Switch */}
            <div className="setting-row">
              <label className="settings-switch-label" style={!isAdmin ? { opacity: 0.7, cursor: "not-allowed" } : undefined}>
                <input
                  type="checkbox"
                  className="settings-switch-input"
                  checked={securitySettings.isAuthEnabled}
                  disabled={!isAdmin}
                  onChange={(e) => updateSecuritySetting("isAuthEnabled", e.target.checked)}
                />
                <div className="switch-text-content">
                  <strong className="switch-title">Activer le Mode Sécurisé (PIN / Mot de passe)</strong>
                  <span className="switch-desc">
                    Exige l'authentification par code PIN ou mot de passe à l'ouverture de l'application et au verrouillage.
                    {!isAdmin && " (Modification réservée au profil Administrateur)"}
                  </span>
                </div>
              </label>
            </div>

            {/* 2. Délai de verrouillage automatique */}
            <div className="setting-row">
              <label className="setting-label">Verrouillage automatique après inactivité :</label>
              <div className="segmented-control">
                {[
                  { value: 0, label: "Jamais" },
                  { value: 2, label: "2 min" },
                  { value: 5, label: "5 min" },
                  { value: 10, label: "10 min" },
                  { value: 15, label: "15 min" },
                  { value: 30, label: "30 min" }
                ].map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className={`segment-btn ${securitySettings.autoLockTimeoutMinutes === item.value ? "active" : ""}`}
                    onClick={() => updateSecuritySetting("autoLockTimeoutMinutes", item.value)}
                    disabled={!securitySettings.isAuthEnabled || !isAdmin}
                    title={!isAdmin ? "Modification réservée au profil Administrateur" : undefined}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <small className="setting-hint">
                Verrouille automatiquement l'accès si aucune activité n'est détectée pendant la durée choisie.
              </small>
            </div>

            {/* 3. Opérateurs & Permissions */}
            <div className="storage-info-row">
              <div className="storage-info-item">
                <strong className="storage-title">
                  {isAdmin
                    ? "Gestion des Opérateurs & Droits (Admin) :"
                    : "Mon Profil Opérateur :"}
                </strong>
                <span className="storage-path">
                  {isAdmin
                    ? "Gestion complète, création d'opérateurs et attribution des rôles multiples"
                    : `Connecté en tant que ${currentUser?.displayName} (${((currentUser?.roles && currentUser?.roles.length > 0) ? currentUser.roles.join(", ") : currentUser?.role)})`}
                </span>
              </div>

              {onOpenUserManager && (
                <button
                  type="button"
                  className="btn-storage-action"
                  onClick={onOpenUserManager}
                  title={
                    isAdmin
                      ? "Gérer les opérateurs et les autorisations"
                      : "Consulter ou modifier mon profil"
                  }
                >
                  <Users size={14} />
                  <span>
                    {isAdmin ? "Gérer les opérateurs" : "Mon profil"}
                  </span>
                </button>
              )}
            </div>

            {/* 4. Grand Journal d'Audit */}
            <div className="storage-info-row">
              <div className="storage-info-item">
                <strong className="storage-title">Grand Journal d'Audit & Traçabilité :</strong>
                <span className="storage-path">
                  Historique inaltérable des impressions, annulations et modifications
                </span>
              </div>

              {onOpenAuditTrail && (
                <button
                  type="button"
                  className="btn-storage-action"
                  onClick={onOpenAuditTrail}
                  disabled={!canViewAudit}
                  style={!canViewAudit ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
                  title={
                    !canViewAudit
                      ? "La consultation du journal d'audit est réservée aux auditeurs, signataires et administrateurs"
                      : "Consulter le journal des opérations sensibles"
                  }
                >
                  <History size={14} />
                  <span>Consulter le journal</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Toast discret de confirmation d'enregistrement */}
      {saveToast && (
        <div className="settings-save-toast">
          <Check size={14} />
          <span>Préférences enregistrées</span>
        </div>
      )}
    </div>
  );
};
