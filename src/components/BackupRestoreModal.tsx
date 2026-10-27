import React, { useState, useRef, useEffect } from "react";
import {
  X,
  ShieldCheck,
  ShieldAlert,
  Database,
  Download,
  UploadCloud,
  FileCheck2,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  HardDrive,
  Clock,
  Layers,
  FileText,
  ChevronRight,
  Save,
  Check,
  Lock
} from "lucide-react";
import type { BackupArchive, SecuritySettings, UserRecord } from "../types";
import {
  createCertifiedBackup,
  inspectBackupFile,
  restoreCertifiedBackup
} from "../services/backupRestore";
import { getSecuritySettings, saveSecuritySettings } from "../services/db";
import { hasPermission, getPermissionErrorMessage } from "../services/permissions";

interface BackupRestoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: UserRecord | null;
  onRestoreSuccess?: () => void;
  initialTab?: "export" | "restore" | "auto";
}

export const BackupRestoreModal: React.FC<BackupRestoreModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onRestoreSuccess,
  initialTab = "export"
}) => {
  const [activeTab, setActiveTab] = useState<"export" | "restore" | "auto">(initialTab);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [lastExportStatus, setLastExportStatus] = useState<{
    filename?: string;
    filePath?: string;
  } | null>(null);

  // Restore state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isInspecting, setIsInspecting] = useState<boolean>(false);
  const [inspectionResult, setInspectionResult] = useState<{
    valid: boolean;
    checksumMatch: boolean;
    archive?: BackupArchive;
    previewCounts?: Record<string, number>;
    error?: string;
  } | null>(null);
  const [restoreMode, setRestoreMode] = useState<"replace" | "merge">("replace");
  const [isRestoring, setIsRestoring] = useState<boolean>(false);
  const [restoreSuccessMsg, setRestoreSuccessMsg] = useState<string | null>(null);

  // Auto-backup settings
  const [securitySettings, setSecuritySettings] = useState<SecuritySettings>(() => getSecuritySettings());
  const [autoFrequency, setAutoFrequency] = useState<"disabled" | "on_close" | "daily" | "weekly">(
    !securitySettings.autoBackupEnabled ? "disabled" : securitySettings.autoBackupFrequency
  );
  const [retentionCount, setRetentionCount] = useState<number>(securitySettings.autoBackupRetentionCount);
  const [isSettingsSaved, setIsSettingsSaved] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Contrôle d'accès RBAC
  const canRestore = hasPermission(currentUser?.role, "backup:restore");

  useEffect(() => {
    if (isOpen) {
      if (initialTab) {
        setActiveTab(initialTab);
      }
      const s = getSecuritySettings();
      setSecuritySettings(s);
      setAutoFrequency(!s.autoBackupEnabled ? "disabled" : s.autoBackupFrequency);
      setRetentionCount(s.autoBackupRetentionCount);
      setRestoreSuccessMsg(null);
      setInspectionResult(null);
      setSelectedFile(null);
      setLastExportStatus(null);
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  const handleCreateBackup = async () => {
    setIsExporting(true);
    setLastExportStatus(null);
    try {
      const res = await createCertifiedBackup();
      if (res.success) {
        setLastExportStatus({
          filename: res.filename,
          filePath: res.filePath
        });
      } else if (res.error && res.error !== "Sauvegarde annulée.") {
        alert(`Erreur lors de la sauvegarde : ${res.error}`);
      }
    } catch (err: any) {
      console.error("Backup creation failed:", err);
      alert(`Erreur lors de la création de la sauvegarde : ${err?.message || err}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setIsInspecting(true);
    setInspectionResult(null);
    setRestoreSuccessMsg(null);

    try {
      const inspected = await inspectBackupFile(file);
      setInspectionResult(inspected);
    } catch (err: any) {
      setInspectionResult({
        valid: false,
        checksumMatch: false,
        error: `Fichier illisible : ${err?.message || err}`
      });
    } finally {
      setIsInspecting(false);
    }
  };

  const handleExecuteRestore = async () => {
    if (!canRestore) {
      alert("Privilège Administrateur requis : La restauration de la base de données est réservée exclusivement à l'Administrateur.");
      return;
    }

    if (!inspectionResult?.archive) return;

    const confirmMsg =
      restoreMode === "replace"
        ? "Attention : le mode 'Remplacer' écrasera vos chèques et modèles actuels par ceux de la sauvegarde certifiée. Continuer ?"
        : "Le mode 'Fusionner' ajoutera les enregistrements manquants sans écraser les données identiques. Continuer ?";

    if (!window.confirm(confirmMsg)) return;

    setIsRestoring(true);
    try {
      const res = await restoreCertifiedBackup(inspectionResult.archive, restoreMode);
      if (res.success) {
        setRestoreSuccessMsg(
          `Restauration effectuée avec succès (${res.countRestored} chèques restaurés) !`
        );
        if (onRestoreSuccess) {
          onRestoreSuccess();
        }
      } else {
        alert(`Erreur de restauration : ${res.error}`);
      }
    } catch (err: any) {
      console.error("Restore failed:", err);
      alert(`Erreur lors de la restauration : ${err?.message || err}`);
    } finally {
      setIsRestoring(false);
    }
  };

  const handleSaveAutoSettings = async () => {
    if (!canRestore) {
      alert("Privilège Administrateur requis : La configuration des sauvegardes automatiques est réservée à l'Administrateur.");
      return;
    }

    const updated: SecuritySettings = {
      ...securitySettings,
      autoBackupEnabled: autoFrequency !== "disabled",
      autoBackupFrequency: autoFrequency === "disabled" ? "on_close" : autoFrequency,
      autoBackupRetentionCount: retentionCount
    };
    await saveSecuritySettings(updated);
    setSecuritySettings(updated);
    setIsSettingsSaved(true);
    setTimeout(() => setIsSettingsSaved(false), 2500);
  };

  return (
    <div className="statement-modal-overlay animate-fade-in" role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className="statement-modal-content batch-modal-window animate-scale-up"
        style={{ maxWidth: "780px", maxHeight: "88vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête standard conforme aux autres fenêtres modales */}
        <div className="statement-modal-header">
          <div className="statement-header-left">
            <div className="statement-icon-badge">
              <Database size={20} className="text-gold" />
            </div>
            <div>
              <div className="statement-title-row">
                <h2 className="statement-title">Sauvegardes & Restauration Certifiée</h2>
              </div>
              <p className="statement-subtitle">
                Sauvegardes intègres scellées SHA-256 et contrôle anti-altération
              </p>
            </div>
          </div>
          <button
            type="button"
            className="statement-close-btn"
            onClick={onClose}
            title="Fermer"
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Barre d'onglets de navigation (conforme au stepper des autres fenêtres) */}
        <div className="batch-stepper-bar">
          <div
            className={`batch-step-tab ${activeTab === "export" ? "active" : ""}`}
            onClick={() => setActiveTab("export")}
          >
            <span className="step-circle">
              <Download size={12} />
            </span>
            <span className="step-name">1. Créer une Sauvegarde (.vcbk)</span>
          </div>

          <ChevronRight size={14} className="step-chevron" />

          <div
            className={`batch-step-tab ${activeTab === "restore" ? "active" : ""}`}
            onClick={() => setActiveTab("restore")}
          >
            <span className="step-circle">
              <UploadCloud size={12} />
            </span>
            <span className="step-name">2. Restaurer & Vérifier l'Intégrité</span>
          </div>

          <ChevronRight size={14} className="step-chevron" />

          <div
            className={`batch-step-tab ${activeTab === "auto" ? "active" : ""}`}
            onClick={() => setActiveTab("auto")}
          >
            <span className="step-circle">
              <Clock size={12} />
            </span>
            <span className="step-name">3. Sauvegardes Automatiques</span>
          </div>
        </div>

        {/* Corps du modal standard */}
        <div className="statement-modal-body batch-modal-body">
          {/* =========================================================================
              ONGLET 1 : EXPORTATION DE SAUVEGARDE CERTIFIÉE
              ========================================================================= */}
          {activeTab === "export" && (
            <div className="batch-step-pane">
              <div className="batch-sample-box mb-3">
                <div className="sample-box-left">
                  <div className="sample-icon-badge">
                    <ShieldCheck size={20} className="text-emerald" />
                  </div>
                  <div>
                    <h4 style={{ margin: "0 0 3px", fontSize: "13.5px", fontWeight: 700, color: "var(--text-primary)" }}>
                      Exportation Scellée VCheque (.vcbk)
                    </h4>
                    <p style={{ margin: 0, fontSize: "11.5px", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                      Génère une archive consolidée de l'ensemble de votre base de données locale.
                      Chaque archive est scellée par une empreinte cryptographique SHA-256 garantissant
                      qu'aucune information n'est altérée.
                    </p>
                  </div>
                </div>
              </div>

              <div className="storage-info-row mb-3" style={{ background: "#ffffff" }}>
                <div className="storage-info-item">
                  <strong className="storage-title">Éléments inclus dans l'archive cryptographique :</strong>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
                    <span className="city-pill selected" style={{ fontSize: "11px", cursor: "default" }}>
                      Tous les chèques & statuts
                    </span>
                    <span className="city-pill selected" style={{ fontSize: "11px", cursor: "default" }}>
                      Dossiers d'entreprises & RIB
                    </span>
                    <span className="city-pill selected" style={{ fontSize: "11px", cursor: "default" }}>
                      Chéquiers & carnets
                    </span>
                    <span className="city-pill selected" style={{ fontSize: "11px", cursor: "default" }}>
                      Modèles & calibrages
                    </span>
                    <span className="city-pill selected" style={{ fontSize: "11px", cursor: "default" }}>
                      Opérateurs & rôles
                    </span>
                    <span className="city-pill selected" style={{ fontSize: "11px", cursor: "default" }}>
                      Journal d'audit de traçabilité
                    </span>
                  </div>
                </div>
              </div>

              {lastExportStatus && (
                <div
                  className="storage-info-row mb-3"
                  style={{ background: "#ecfdf5", borderColor: "#a7f3d0" }}
                >
                  <div className="storage-info-item">
                    <strong className="storage-title text-emerald" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <CheckCircle2 size={16} /> Sauvegarde certifiée enregistrée avec succès !
                    </strong>
                    <span className="storage-path" style={{ color: "#065f46" }}>
                      Fichier : {lastExportStatus.filename}
                    </span>
                  </div>
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "12px" }}>
                <button
                  type="button"
                  className="btn-action-luxury-green"
                  onClick={handleCreateBackup}
                  disabled={isExporting}
                >
                  {isExporting ? (
                    <>
                      <RefreshCw size={15} className="animate-spin" />
                      <span>Calcul de l'empreinte & Enregistrement...</span>
                    </>
                  ) : (
                    <>
                      <Download size={15} />
                      <span>Enregistrer la Sauvegarde Certifiée (.vcbk)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* =========================================================================
              ONGLET 2 : RESTAURATION AVEC CONTRÔLE D'INTÉGRITÉ
              ========================================================================= */}
          {activeTab === "restore" && (
            <div className="batch-step-pane">
              {!canRestore && (
                <div className="storage-info-row mb-3" style={{ background: "#fef2f2", borderColor: "#fecaca" }}>
                  <div className="storage-info-item">
                    <strong className="storage-title" style={{ color: "#dc2626", display: "flex", alignItems: "center", gap: "6px" }}>
                      <Lock size={15} /> Accès Restreint : Rôle Administrateur Requis
                    </strong>
                    <span className="storage-path" style={{ color: "#991b1b" }}>
                      La restauration de base de données modifie l'intégrité globale du système. Seul un utilisateur disposant du rôle Administrateur peut injecter une archive.
                    </span>
                  </div>
                </div>
              )}

              {/* Zone de glisser-déposer standardisée */}
              <div
                className="batch-dropzone-box"
                style={!canRestore ? { opacity: 0.5, pointerEvents: "none" } : undefined}
                onClick={() => canRestore && fileInputRef.current?.click()}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: "none" }}
                  accept=".vcbk,.json"
                  onChange={handleFileSelect}
                />
                <div className="dropzone-icon-circle">
                  <UploadCloud size={32} />
                </div>
                <h3 className="dropzone-heading">
                  {selectedFile ? selectedFile.name : "Glissez-déposez votre sauvegarde (.vcbk ou .json) ici"}
                </h3>
                <p className="dropzone-sub">
                  Le système effectue un recalcul immédiat de l'empreinte SHA-256 pour vérifier qu'aucune
                  altération n'a eu lieu.
                </p>
                <button type="button" className="btn-gold-primary" tabIndex={-1}>
                  <HardDrive size={14} />
                  <span>{selectedFile ? "Changer de fichier" : "Parcourir vos fichiers"}</span>
                </button>
              </div>

              {isInspecting && (
                <div style={{ textAlign: "center", padding: "16px", color: "var(--gold-dark)", fontSize: "12.5px" }}>
                  <RefreshCw size={18} className="animate-spin" style={{ display: "inline-block", marginRight: "8px", verticalAlign: "middle" }} />
                  Vérification de l'empreinte cryptographique SHA-256...
                </div>
              )}

              {/* Résultat d'inspection */}
              {inspectionResult && (
                <div
                  className="storage-info-row mb-3"
                  style={{
                    background: !inspectionResult.valid ? "#fef2f2" : inspectionResult.checksumMatch ? "#f0fdf4" : "#fefce8",
                    borderColor: !inspectionResult.valid ? "#fecaca" : inspectionResult.checksumMatch ? "#a7f3d0" : "#fef08a"
                  }}
                >
                  <div className="storage-info-item">
                    {inspectionResult.checksumMatch ? (
                      <>
                        <strong className="storage-title text-emerald" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <ShieldCheck size={18} /> Intégrité Certifiée — Fichier Conforme
                        </strong>
                        <span className="storage-path" style={{ color: "#065f46" }}>
                          L'empreinte SHA-256 correspond exactement aux données scellées.
                        </span>
                      </>
                    ) : inspectionResult.valid && !inspectionResult.checksumMatch ? (
                      <>
                        <strong className="storage-title" style={{ color: "#dc2626", display: "flex", alignItems: "center", gap: "6px" }}>
                          <ShieldAlert size={18} /> Alerte : Altération ou corruption détectée !
                        </strong>
                        <span className="storage-path" style={{ color: "#991b1b" }}>
                          L'empreinte SHA-256 ne correspond pas au sceau d'origine. Fichier rejeté.
                        </span>
                      </>
                    ) : (
                      <>
                        <strong className="storage-title" style={{ color: "#b45309", display: "flex", alignItems: "center", gap: "6px" }}>
                          <AlertTriangle size={18} /> Fichier Invalide
                        </strong>
                        <span className="storage-path" style={{ color: "#92400e" }}>
                          {inspectionResult.error || "Format de fichier non reconnu."}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Détails et options de restauration */}
              {inspectionResult && inspectionResult.valid && inspectionResult.archive && (
                <div style={{ background: "#ffffff", border: "1px solid var(--border-color)", borderRadius: "var(--radius-sm)", padding: "14px", marginBottom: "16px" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", fontSize: "11.5px", marginBottom: "12px" }}>
                    <div>
                      <span style={{ color: "var(--text-secondary)" }}>Date : </span>
                      <strong>{new Date(inspectionResult.archive.backupDate).toLocaleString("fr-FR")}</strong>
                    </div>
                    <div>
                      <span style={{ color: "var(--text-secondary)" }}>Version : </span>
                      <strong>{inspectionResult.archive.version || "1.0.0"}</strong>
                    </div>
                    <div>
                      <span style={{ color: "var(--text-secondary)" }}>SHA-256 : </span>
                      <code style={{ background: "var(--bg-secondary)", padding: "2px 4px", borderRadius: "4px" }}>
                        {inspectionResult.archive.checksumSha256.slice(0, 20)}...
                      </code>
                    </div>
                  </div>

                  {inspectionResult.previewCounts && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "14px" }}>
                      <span className="city-pill selected" style={{ fontSize: "11px", cursor: "default" }}>
                        {inspectionResult.previewCounts.cheques || 0} chèques
                      </span>
                      <span className="city-pill selected" style={{ fontSize: "11px", cursor: "default" }}>
                        {inspectionResult.previewCounts.bankAccounts || 0} comptes
                      </span>
                      <span className="city-pill selected" style={{ fontSize: "11px", cursor: "default" }}>
                        {inspectionResult.previewCounts.chequeBooks || 0} chéquiers
                      </span>
                      <span className="city-pill selected" style={{ fontSize: "11px", cursor: "default" }}>
                        {inspectionResult.previewCounts.beneficiaries || 0} bénéficiaires
                      </span>
                      <span className="city-pill selected" style={{ fontSize: "11px", cursor: "default" }}>
                        {inspectionResult.previewCounts.auditLogs || 0} événements d'audit
                      </span>
                    </div>
                  )}

                  {/* Mode de restauration */}
                  <div className="setting-row" style={{ padding: "10px 0 0", borderTop: "1px solid var(--border-color)" }}>
                    <label className="setting-label">Mode d'application :</label>
                    <div className="segmented-control">
                      <button
                        type="button"
                        className={`segment-btn ${restoreMode === "replace" ? "active" : ""}`}
                        onClick={() => setRestoreMode("replace")}
                      >
                        Remplacer toutes les données (Recommandé)
                      </button>
                      <button
                        type="button"
                        className={`segment-btn ${restoreMode === "merge" ? "active" : ""}`}
                        onClick={() => setRestoreMode("merge")}
                      >
                        Fusionner sans écraser
                      </button>
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "14px" }}>
                    <button
                      type="button"
                      className="btn-action-luxury-green"
                      onClick={handleExecuteRestore}
                      disabled={isRestoring || !canRestore}
                      style={!canRestore ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
                    >
                      {isRestoring ? (
                        <>
                          <RefreshCw size={15} className="animate-spin" />
                          <span>Restauration en cours...</span>
                        </>
                      ) : (
                        <>
                          <UploadCloud size={15} />
                          <span>Exécuter la Restauration</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {restoreSuccessMsg && (
                <div className="storage-info-row" style={{ background: "#ecfdf5", borderColor: "#a7f3d0" }}>
                  <div className="storage-info-item">
                    <strong className="storage-title text-emerald" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <CheckCircle2 size={16} /> {restoreSuccessMsg}
                    </strong>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* =========================================================================
              ONGLET 3 : SAUVEGARDES AUTOMATIQUES
              ========================================================================= */}
          {activeTab === "auto" && (
            <div className="batch-step-pane">
              {!canRestore && (
                <div className="storage-info-row mb-3" style={{ background: "#fef2f2", borderColor: "#fecaca" }}>
                  <div className="storage-info-item">
                    <strong className="storage-title" style={{ color: "#dc2626", display: "flex", alignItems: "center", gap: "6px" }}>
                      <Lock size={15} /> Accès Restreint : Rôle Administrateur Requis
                    </strong>
                    <span className="storage-path" style={{ color: "#991b1b" }}>
                      La planification des sauvegardes automatiques est une politique système gérée exclusivement par le profil Administrateur.
                    </span>
                  </div>
                </div>
              )}

              <div className="batch-sample-box mb-3">
                <div className="sample-box-left">
                  <div className="sample-icon-badge">
                    <Clock size={20} className="text-gold" />
                  </div>
                  <div>
                    <h4 style={{ margin: "0 0 3px", fontSize: "13.5px", fontWeight: 700, color: "var(--text-primary)" }}>
                      Planification des Sauvegardes Automatiques
                    </h4>
                    <p style={{ margin: 0, fontSize: "11.5px", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                      Configurez la fréquence des copies de sécurité générées automatiquement en tâche
                      de fond pour vous prémunir contre toute défaillance matérielle.
                    </p>
                  </div>
                </div>
              </div>

              {/* Fréquence de sauvegarde en segmented-control standardisé */}
              <div className="setting-row mb-4">
                <label className="setting-label">Fréquence des sauvegardes :</label>
                <div className="segmented-control">
                  {[
                    { value: "disabled", label: "Désactivée" },
                    { value: "on_close", label: "À la fermeture" },
                    { value: "daily", label: "Quotidienne" },
                    { value: "weekly", label: "Hebdomadaire" }
                  ].map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      className={`segment-btn ${autoFrequency === item.value ? "active" : ""}`}
                      onClick={() => setAutoFrequency(item.value as any)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <small className="setting-hint">
                  {autoFrequency === "disabled" && "Sauvegardes manuelles uniquement."}
                  {autoFrequency === "on_close" && "Génère une archive automatique avant la fermeture de l'application."}
                  {autoFrequency === "daily" && "Génère 1 copie certifiée par jour dès la première ouverture."}
                  {autoFrequency === "weekly" && "Génère 1 copie certifiée par semaine le lundi matin."}
                </small>
              </div>

              {/* Rétention des archives */}
              <div className="setting-row mb-4">
                <div className="form-label-row">
                  <label className="setting-label">Rétention des archives (Nombre max conservé) :</label>
                  <span className="city-pill selected" style={{ fontSize: "11.5px", cursor: "default" }}>
                    {retentionCount} archives
                  </span>
                </div>
                <input
                  type="range"
                  min={3}
                  max={30}
                  step={1}
                  value={retentionCount}
                  onChange={(e) => setRetentionCount(Number(e.target.value))}
                  style={{ width: "100%", accentColor: "var(--gold-primary)", cursor: "pointer" }}
                />
                <small className="setting-hint">
                  Les sauvegardes plus anciennes que ce seuil sont automatiquement purgées pour préserver l'espace disque.
                </small>
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "10px", marginTop: "14px" }}>
                {isSettingsSaved && (
                  <span style={{ fontSize: "12px", color: "var(--emerald-primary)", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>
                    <Check size={14} /> Planification enregistrée !
                  </span>
                )}
                <button
                  type="button"
                  className="btn-action-luxury-green"
                  onClick={handleSaveAutoSettings}
                  disabled={!canRestore}
                  style={!canRestore ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
                >
                  <Save size={15} />
                  <span>Enregistrer la planification</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Pied de page standardisé conforme aux autres fenêtres modales */}
        <div className="statement-toolbar-row batch-modal-footer">
          <div className="footer-left">
            <span className="field-hint">
              Vos données sont certifiées et conservées localement sur ce poste de travail.
            </span>
          </div>
          <div className="footer-right">
            <button type="button" className="btn-acc-cancel" onClick={onClose}>
              Fermer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
