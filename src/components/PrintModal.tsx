import React, { useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Printer,
  X,
  FileText,
  RotateCw,
  Sliders,
  Info,
  ArrowUpLeft,
  ArrowUp,
  ArrowUpRight,
  ArrowLeft,
  Circle,
  ArrowRight,
  ArrowDownLeft,
  ArrowDown,
  ArrowDownRight,
  Plus,
  Minus,
  Eye,
  Maximize2,
  FileDown,
  Sparkles,
  Save,
  Check,
  Compass
} from "lucide-react";
import type { BankTemplate, PrintSettings, PrintPlacement, PrintPaperFormat, PrinterPreset } from "../types";
import { loadPrinterPresets, upsertPrinterPreset, presetToPrintSettings } from "../services/printerPresets";
import { PrinterInsertionGuideModal } from "./PrinterInsertionGuideModal";

export interface PrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmPrint: () => void;
  onExportPdf?: () => void;
  settings: PrintSettings;
  onChangeSettings: (settings: PrintSettings) => void;
  currentTemplate: BankTemplate;
  amount: string;
  beneficiary: string;
  date: string;
  isCrossed?: boolean;
  crossedWithText?: boolean;
  showChequeNumber?: boolean;
  chequeNumber?: string;
  formattedNumeric?: string;
  isReprint?: boolean;
  printCount?: number;
  onOpenCalibrationWizard?: () => void;
  presets?: PrinterPreset[];
  activePresetId?: string;
  onSelectPreset?: (preset: PrinterPreset) => void;
  onSavePreset?: (preset: Partial<PrinterPreset> & { name: string }) => void;
}

export function getPaperDimensions(
  format: PrintPaperFormat,
  templateWidth: number,
  templateHeight: number
): { width: number; height: number; name: string } {
  switch (format) {
    case "a4-portrait":
      return { width: 210, height: 297, name: "A4 Portrait (210 × 297 mm)" };
    case "a4-landscape":
      return { width: 297, height: 210, name: "A4 Paysage (297 × 210 mm)" };
    case "exact-cheque":
      return {
        width: templateWidth,
        height: templateHeight,
        name: `Taille réelle chèque (${templateWidth} × ${templateHeight} mm)`
      };
  }
}

export function calculateChequePosition(
  paperWidth: number,
  paperHeight: number,
  chequeWidth: number,
  chequeHeight: number,
  placement: PrintPlacement,
  offsetX: number,
  offsetY: number,
  rotation: 0 | 90 | 180 | 270 = 0
) {
  const isRotated90 = rotation === 90 || rotation === 270;
  const effW = isRotated90 ? chequeHeight : chequeWidth;
  const effH = isRotated90 ? chequeWidth : chequeHeight;

  let left = 0;
  let top = 0;

  switch (placement) {
    case "top-left":
      left = 0;
      top = 0;
      break;
    case "top-center":
      left = (paperWidth - effW) / 2;
      top = 0;
      break;
    case "top-right":
      left = paperWidth - effW;
      top = 0;
      break;
    case "center-left":
      left = 0;
      top = (paperHeight - effH) / 2;
      break;
    case "center":
      left = (paperWidth - effW) / 2;
      top = (paperHeight - effH) / 2;
      break;
    case "center-right":
      left = paperWidth - effW;
      top = (paperHeight - effH) / 2;
      break;
    case "bottom-left":
      left = 0;
      top = paperHeight - effH;
      break;
    case "bottom-center":
      left = (paperWidth - effW) / 2;
      top = paperHeight - effH;
      break;
    case "bottom-right":
      left = paperWidth - effW;
      top = paperHeight - effH;
      break;
  }

  return {
    left: Number((left + offsetX).toFixed(1)),
    top: Number((top + offsetY).toFixed(1)),
    effW,
    effH
  };
}

const PLACEMENTS_GRID: {
  id: PrintPlacement;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
}[] = [
  { id: "top-left", label: "Coin Haut-Gauche", shortLabel: "Haut Gauche", icon: ArrowUpLeft },
  { id: "top-center", label: "Haut (Début) - Centre", shortLabel: "Haut Centre", icon: ArrowUp },
  { id: "top-right", label: "Coin Haut-Droite", shortLabel: "Haut Droite", icon: ArrowUpRight },
  { id: "center-left", label: "Milieu Gauche", shortLabel: "Centre Gauche", icon: ArrowLeft },
  { id: "center", label: "Plein Centre (Horizontal & Vertical)", shortLabel: "Plein Centre", icon: Circle },
  { id: "center-right", label: "Milieu Droite", shortLabel: "Centre Droite", icon: ArrowRight },
  { id: "bottom-left", label: "Coin Bas-Gauche", shortLabel: "Bas Gauche", icon: ArrowDownLeft },
  { id: "bottom-center", label: "Bas (Fin) - Centre", shortLabel: "Bas Centre", icon: ArrowDown },
  { id: "bottom-right", label: "Coin Bas-Droite", shortLabel: "Bas Droite", icon: ArrowDownRight }
];

export const PrintModal: React.FC<PrintModalProps> = ({
  isOpen,
  onClose,
  onConfirmPrint,
  onExportPdf,
  settings,
  onChangeSettings,
  currentTemplate,
  amount,
  beneficiary,
  date,
  isCrossed = true,
  crossedWithText = true,
  showChequeNumber = false,
  chequeNumber,
  formattedNumeric,
  isReprint = false,
  printCount = 0,
  onOpenCalibrationWizard,
  presets,
  activePresetId,
  onSelectPreset,
  onSavePreset
}) => {
  const [previewTab, setPreviewTab] = useState<"sheet" | "cheque">("sheet");

  // Profils d'imprimante (Presets)
  const [localPresets, setLocalPresets] = useState<PrinterPreset[]>(() => {
    return presets && presets.length > 0 ? presets : loadPrinterPresets();
  });
  const [currentPresetId, setCurrentPresetId] = useState<string>(() => {
    return (
      activePresetId ||
      localPresets.find((p) => p.isDefault)?.id ||
      localPresets[0]?.id ||
      "preset-standard-center"
    );
  });
  const [showNewPresetModal, setShowNewPresetModal] = useState<boolean>(false);
  const [newPresetNameInput, setNewPresetNameInput] = useState<string>("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showInsertionGuide, setShowInsertionGuide] = useState<boolean>(false);

  const handleSelectPreset = (id: string) => {
    setCurrentPresetId(id);
    const p = localPresets.find((item) => item.id === id);
    if (p) {
      if (onSelectPreset) onSelectPreset(p);
      onChangeSettings(presetToPrintSettings(p));
    }
  };

  const handleSaveToActivePreset = () => {
    const existing = localPresets.find((p) => p.id === currentPresetId);
    if (!existing) return;
    const { presets: updated, savedPreset } = upsertPrinterPreset(
      {
        id: existing.id,
        name: existing.name,
        paperFormat: settings.paperFormat,
        placement: settings.placement,
        offsetX: settings.offsetX,
        offsetY: settings.offsetY,
        rotation: settings.rotation,
        showBorderGuide: settings.showBorderGuide,
        isDefault: existing.isDefault
      },
      localPresets
    );
    setLocalPresets(updated);
    if (onSavePreset) onSavePreset(savedPreset);
    setToastMessage(`Profil "${savedPreset.name}" mis à jour !`);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleCreateNewPresetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPresetNameInput.trim()) return;
    const { presets: updated, savedPreset } = upsertPrinterPreset(
      {
        name: newPresetNameInput.trim(),
        paperFormat: settings.paperFormat,
        placement: settings.placement,
        offsetX: settings.offsetX,
        offsetY: settings.offsetY,
        rotation: settings.rotation,
        showBorderGuide: settings.showBorderGuide,
        isDefault: false
      },
      localPresets
    );
    setLocalPresets(updated);
    setCurrentPresetId(savedPreset.id);
    if (onSavePreset) onSavePreset(savedPreset);
    if (onSelectPreset) onSelectPreset(savedPreset);
    setShowNewPresetModal(false);
    setNewPresetNameInput("");
    setToastMessage(`Profil "${savedPreset.name}" créé avec succès !`);
    setTimeout(() => setToastMessage(null), 2500);
  };

  if (!isOpen) return null;

  const paper = getPaperDimensions(settings.paperFormat, currentTemplate.width, currentTemplate.height);
  const pos = calculateChequePosition(
    paper.width,
    paper.height,
    currentTemplate.width,
    currentTemplate.height,
    settings.placement,
    settings.offsetX,
    settings.offsetY,
    settings.rotation
  );

  const selectedPlacementInfo = PLACEMENTS_GRID.find((p) => p.id === settings.placement);

  // Dimensions calculées en pixels pour la feuille affichée à l'écran
  const maxBoxWidth = 320;
  const maxBoxHeight = 350;
  const scaleRatio = Math.min(maxBoxWidth / paper.width, maxBoxHeight / paper.height);
  const sheetWidthPx = Math.max(140, Math.round(paper.width * scaleRatio));
  const sheetHeightPx = Math.max(100, Math.round(paper.height * scaleRatio));

  // Coordonnées en pixels du chèque dans la feuille
  const chequeLeftPx = Math.round((pos.left / paper.width) * sheetWidthPx);
  const chequeTopPx = Math.round((pos.top / paper.height) * sheetHeightPx);
  const chequeWidthPx = Math.round((pos.effW / paper.width) * sheetWidthPx);
  const chequeHeightPx = Math.round((pos.effH / paper.height) * sheetHeightPx);

  // Sécurité formatage montant
  const numericAmount = Number(amount.replace(/\s/g, "").replace(",", ".")) || 0;
  const formattedAmount = formattedNumeric || numericAmount.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  const handleUpdate = (patch: Partial<PrintSettings>) => {
    onChangeSettings({
      ...settings,
      ...patch
    });
  };

  const handleStepOffset = (axis: "offsetX" | "offsetY", delta: number) => {
    const currentVal = settings[axis];
    const newVal = Number((currentVal + delta).toFixed(1));
    handleUpdate({ [axis]: newVal });
  };

  return (
    <div className="print-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="print-modal-content" onClick={(e) => e.stopPropagation()}>
        {/* En-tête */}
        <div className="print-modal-header">
          <div className="modal-header-left">
            <div className="modal-header-icon-box">
              <Printer size={20} className="modal-header-icon" />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <h2 className="modal-title" style={{ margin: 0 }}>
                  {isReprint ? `Réimpression du Chèque (Copie N°${(printCount || 1) + 1})` : "Disposition & Positionnement d'Impression"}
                </h2>
                <button
                  type="button"
                  className="btn-action-card"
                  onClick={() => setShowInsertionGuide(true)}
                  title="Consulter le guide des 4 bacs d'imprimante recommandés"
                  style={{
                    padding: "3px 9px",
                    fontSize: "11px",
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    background: "var(--gold-light, #FAF6ED)",
                    borderColor: "var(--gold-primary, #AC8946)",
                    color: "var(--gold-dark, #89672F)",
                    borderRadius: "6px",
                    cursor: "pointer"
                  }}
                >
                  <Compass size={13} />
                  <span>Guide ?</span>
                </button>
              </div>
              <p className="modal-subtitle">
                {isReprint
                  ? "Ce chèque a déjà été imprimé. L'impression sera enregistrée comme réimpression sans doublon."
                  : "Choisissez l'emplacement exact du chèque sur la feuille selon votre bac d'imprimante."}
              </p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              type="button"
              className="btn-action-card"
              onClick={() => setShowInsertionGuide(true)}
              title="Consulter le guide visuel des 4 bacs d'imprimante (Guide d'insertion ?)"
              style={{
                padding: "6px 11px",
                fontSize: "12px",
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                background: "rgba(197, 161, 90, 0.15)",
                borderColor: "var(--gold-primary, #AC8946)",
                color: "var(--gold-dark, #89672F)",
                borderRadius: "6px"
              }}
            >
              <Compass size={14} />
              <span>Guide d'insertion (?)</span>
            </button>
            <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Fermer">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Corps : 2 colonnes */}
        <div className="print-modal-body">
          {/* Colonne gauche : Options de positionnement */}
          <div className="print-modal-controls">
            {/* 0. Barre de sélection du Profil d'imprimante */}
            <div
              style={{
                background: "#FAF8F5",
                border: "1px solid var(--border-color)",
                borderRadius: "8px",
                padding: "8px 12px",
                marginBottom: "14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "8px"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1, minWidth: "200px" }}>
                <Printer size={15} style={{ color: "var(--gold-dark)" }} />
                <span style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--text-primary)" }}>
                  Profil :
                </span>
                <select
                  className="user-form-input"
                  style={{ flex: 1, padding: "4px 8px", fontSize: "12px", fontWeight: 600 }}
                  value={currentPresetId}
                  onChange={(e) => handleSelectPreset(e.target.value)}
                >
                  {localPresets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.isDefault ? "★ (Défaut)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <button
                  type="button"
                  className="btn-action-card"
                  style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "4px 8px", fontSize: "11px" }}
                  onClick={handleSaveToActivePreset}
                  title="Enregistrer les réglages actuels sur ce profil"
                >
                  <Save size={12} />
                  <span>Enregistrer</span>
                </button>
                <button
                  type="button"
                  className="btn-action-card"
                  style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "4px 8px", fontSize: "11px" }}
                  onClick={() => setShowNewPresetModal((prev) => !prev)}
                  title="Créer un nouveau profil à partir de ces réglages"
                >
                  <Plus size={12} />
                  <span>Nouveau</span>
                </button>
              </div>
            </div>

            {toastMessage && (
              <div
                style={{
                  fontSize: "11px",
                  color: "#059669",
                  background: "rgba(5, 150, 105, 0.1)",
                  padding: "5px 10px",
                  borderRadius: "5px",
                  marginBottom: "12px",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: "5px"
                }}
              >
                <Check size={13} strokeWidth={3} />
                <span>{toastMessage}</span>
              </div>
            )}

            {showNewPresetModal && (
              <div
                style={{
                  background: "#FFFFFF",
                  border: "1.5px solid var(--gold-dark)",
                  borderRadius: "8px",
                  padding: "10px 14px",
                  marginBottom: "14px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.08)"
                }}
              >
                <span style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--text-primary)", display: "block", marginBottom: "6px" }}>
                  Nom du nouveau profil d'imprimante :
                </span>
                <form onSubmit={handleCreateNewPresetSubmit} style={{ display: "flex", gap: "6px" }}>
                  <input
                    type="text"
                    className="user-form-input"
                    placeholder="ex: HP LaserJet Bac 1, Bureau..."
                    style={{ flex: 1, padding: "4px 8px", fontSize: "12px" }}
                    value={newPresetNameInput}
                    onChange={(e) => setNewPresetNameInput(e.target.value)}
                    autoFocus
                  />
                  <button
                    type="submit"
                    className="btn-action-luxury-green"
                    style={{ padding: "4px 12px", fontSize: "11.5px" }}
                  >
                    Créer
                  </button>
                  <button
                    type="button"
                    className="btn-action-card"
                    style={{ padding: "4px 8px", fontSize: "11.5px" }}
                    onClick={() => {
                      setShowNewPresetModal(false);
                      setNewPresetNameInput("");
                    }}
                  >
                    Annuler
                  </button>
                </form>
              </div>
            )}

            {/* 1. Format du papier */}
            <div className="print-section-block">
              <label className="print-section-label">
                <FileText size={15} />
                <span>Format du papier de sortie</span>
              </label>
              <div className="paper-format-pills">
                <button
                  type="button"
                  className={`paper-pill ${settings.paperFormat === "a4-portrait" ? "active" : ""}`}
                  onClick={() => handleUpdate({ paperFormat: "a4-portrait" })}
                >
                  <span className="pill-name">A4 Portrait</span>
                  <span className="pill-desc">210 × 297 mm</span>
                </button>

                <button
                  type="button"
                  className={`paper-pill ${settings.paperFormat === "a4-landscape" ? "active" : ""}`}
                  onClick={() => handleUpdate({ paperFormat: "a4-landscape" })}
                >
                  <span className="pill-name">A4 Paysage</span>
                  <span className="pill-desc">297 × 210 mm</span>
                </button>

                <button
                  type="button"
                  className={`paper-pill ${settings.paperFormat === "exact-cheque" ? "active" : ""}`}
                  onClick={() => handleUpdate({ paperFormat: "exact-cheque" })}
                >
                  <span className="pill-name">Taille Chèque</span>
                  <span className="pill-desc">{currentTemplate.width} × {currentTemplate.height} mm</span>
                </button>
              </div>
            </div>

            {/* 2. Positionnement (9 points d'ancrage : coins, bords, centre) */}
            <div className="print-section-block">
              <div className="placement-header-row">
                <label className="print-section-label">
                  <Sliders size={15} />
                  <span>Emplacement sur la page</span>
                </label>
                <span className="active-placement-tag">
                  {selectedPlacementInfo?.label}
                </span>
              </div>

              {/* Grille 3x3 interactive */}
              <div className="placement-grid-3x3">
                {PLACEMENTS_GRID.map((item) => {
                  const Icon = item.icon;
                  const isSelected = settings.placement === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`grid-anchor-btn ${isSelected ? "selected" : ""}`}
                      onClick={() => handleUpdate({ placement: item.id })}
                      title={item.label}
                    >
                      <Icon size={16} />
                      <span className="anchor-label">{item.shortLabel}</span>
                    </button>
                  );
                })}
              </div>

              {/* Raccourcis rapides textuels */}
              <div className="placement-quick-links">
                <button
                  type="button"
                  className={`quick-link-btn ${settings.placement === "center" ? "active" : ""}`}
                  onClick={() => handleUpdate({ placement: "center" })}
                >
                  Au centre (H + V)
                </button>
                <button
                  type="button"
                  className={`quick-link-btn ${settings.placement === "top-center" ? "active" : ""}`}
                  onClick={() => handleUpdate({ placement: "top-center" })}
                >
                  Au début (Haut)
                </button>
                <button
                  type="button"
                  className={`quick-link-btn ${settings.placement === "bottom-center" ? "active" : ""}`}
                  onClick={() => handleUpdate({ placement: "bottom-center" })}
                >
                  À la fin (Bas)
                </button>
              </div>
            </div>

            {/* 3. Orientation & Rotation du chèque */}
            <div className="print-section-block">
              <label className="print-section-label">
                <RotateCw size={15} />
                <span>Orientation du chèque dans le bac</span>
              </label>
              <div className="rotation-options-row">
                <button
                  type="button"
                  className={`rotation-btn ${settings.rotation === 0 ? "active" : ""}`}
                  onClick={() => handleUpdate({ rotation: 0 })}
                >
                  0° (Standard)
                </button>
                <button
                  type="button"
                  className={`rotation-btn ${settings.rotation === 90 ? "active" : ""}`}
                  onClick={() => handleUpdate({ rotation: 90 })}
                >
                  90° (Vertical)
                </button>
                <button
                  type="button"
                  className={`rotation-btn ${settings.rotation === 180 ? "active" : ""}`}
                  onClick={() => handleUpdate({ rotation: 180 })}
                >
                  180° (Inversé)
                </button>
                <button
                  type="button"
                  className={`rotation-btn ${settings.rotation === 270 ? "active" : ""}`}
                  onClick={() => handleUpdate({ rotation: 270 })}
                >
                  270° (Vertical 2)
                </button>
              </div>
            </div>

            {/* 4. Décalage fin (Calibration millimétrique du bac) */}
            <div className="print-section-block">
              <label className="print-section-label">
                <span>Ajustement fin / Calibrage bac (mm)</span>
              </label>

              <div className="offset-steppers-row">
                <div className="offset-control-group">
                  <span className="offset-axis-label">Décalage X :</span>
                  <div className="stepper-box">
                    <button
                      type="button"
                      className="stepper-btn"
                      onClick={() => handleStepOffset("offsetX", -1)}
                      title="-1 mm"
                    >
                      <Minus size={13} />
                    </button>
                    <input
                      type="number"
                      step="0.5"
                      className="stepper-input"
                      value={settings.offsetX}
                      onChange={(e) => handleUpdate({ offsetX: parseFloat(e.target.value) || 0 })}
                    />
                    <span className="stepper-unit">mm</span>
                    <button
                      type="button"
                      className="stepper-btn"
                      onClick={() => handleStepOffset("offsetX", 1)}
                      title="+1 mm"
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                </div>

                <div className="offset-control-group">
                  <span className="offset-axis-label">Décalage Y :</span>
                  <div className="stepper-box">
                    <button
                      type="button"
                      className="stepper-btn"
                      onClick={() => handleStepOffset("offsetY", -1)}
                      title="-1 mm"
                    >
                      <Minus size={13} />
                    </button>
                    <input
                      type="number"
                      step="0.5"
                      className="stepper-input"
                      value={settings.offsetY}
                      onChange={(e) => handleUpdate({ offsetY: parseFloat(e.target.value) || 0 })}
                    />
                    <span className="stepper-unit">mm</span>
                    <button
                      type="button"
                      className="stepper-btn"
                      onClick={() => handleStepOffset("offsetY", 1)}
                      title="+1 mm"
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Guide de contour test */}
              <label className="checkbox-guide-label">
                <input
                  type="checkbox"
                  checked={settings.showBorderGuide}
                  onChange={(e) => handleUpdate({ showBorderGuide: e.target.checked })}
                />
                <span>Imprimer un cadre repère en pointillés (test sur page blanche)</span>
              </label>

              {/* Accès rapide au guide d'insertion et à l'assistant de calibrage */}
              <div style={{ marginTop: "14px", paddingTop: "12px", borderTop: "1px dashed var(--border-color)", display: "flex", flexDirection: "column", gap: "8px" }}>
                <button
                  type="button"
                  className="btn-action-card"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    width: "100%",
                    padding: "7px 12px",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "var(--sidebar-emerald, #17483A)",
                    backgroundColor: "rgba(23, 72, 58, 0.08)",
                    border: "1px solid rgba(23, 72, 58, 0.25)",
                    borderRadius: "6px",
                    cursor: "pointer"
                  }}
                  onClick={() => setShowInsertionGuide(true)}
                  title="Consulter les 4 configurations d'insertion de chèque (Haut Centre 90°, etc.)"
                >
                  <Compass size={14} />
                  <span>Guide des 4 Bacs d'Impression (?)</span>
                </button>

                {onOpenCalibrationWizard && (
                  <button
                    type="button"
                    className="btn-action-card"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                      width: "100%",
                      padding: "7px 12px",
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "var(--gold-dark)",
                      backgroundColor: "rgba(172, 137, 70, 0.08)",
                      border: "1px solid rgba(172, 137, 70, 0.25)",
                      borderRadius: "6px",
                      cursor: "pointer"
                    }}
                    onClick={onOpenCalibrationWizard}
                    title="Lancer l'assistant de calibrage complet avec 3 spécimens réels A4"
                  >
                    <Sparkles size={14} />
                    <span>Assistant de calibrage (3 spécimens réels)</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Colonne droite : Prévisualisation visuelle de la feuille */}
          <div className="print-modal-preview">
            <div className="preview-header-meta">
              <div className="preview-tab-pills">
                <button
                  type="button"
                  className={`preview-tab-btn ${previewTab === "sheet" ? "active" : ""}`}
                  onClick={() => setPreviewTab("sheet")}
                >
                  <Eye size={13} />
                  <span>Aperçu de la page ({paper.width}×{paper.height})</span>
                </button>
                <button
                  type="button"
                  className={`preview-tab-btn ${previewTab === "cheque" ? "active" : ""}`}
                  onClick={() => setPreviewTab("cheque")}
                >
                  <Maximize2 size={13} />
                  <span>Zoom Chèque</span>
                </button>
              </div>
              <span className="preview-paper-spec">{paper.name}</span>
            </div>

            {/* Cadre de la feuille physique */}
            <div className="paper-viewport-container">
              {previewTab === "sheet" ? (
                <div
                  className={`paper-sheet-visual ${settings.paperFormat}`}
                  style={{
                    width: `${sheetWidthPx}px`,
                    height: `${sheetHeightPx}px`
                  }}
                >
                  {/* Règle repère */}
                  <div className="sheet-dimension-tag top-tag">{paper.width} mm</div>
                  <div className="sheet-dimension-tag left-tag">{paper.height} mm</div>

                  {/* Guides de marge en pointillés avec étiquette millimétrique */}
                  {chequeTopPx > 5 && (
                    <div
                      className="margin-guide-line top"
                      style={{
                        height: `${chequeTopPx}px`,
                        left: `${chequeLeftPx + chequeWidthPx / 2}px`
                      }}
                    >
                      <span className="margin-guide-pill top">{pos.top} mm</span>
                    </div>
                  )}

                  {chequeLeftPx > 5 && (
                    <div
                      className="margin-guide-line left"
                      style={{
                        width: `${chequeLeftPx}px`,
                        top: `${chequeTopPx + chequeHeightPx / 2}px`
                      }}
                    >
                      <span className="margin-guide-pill left">{pos.left} mm</span>
                    </div>
                  )}

                  {/* Miniature du chèque positionné */}
                  <div
                    className="preview-cheque-box"
                    style={{
                      left: `${chequeLeftPx}px`,
                      top: `${chequeTopPx}px`,
                      width: `${chequeWidthPx}px`,
                      height: `${chequeHeightPx}px`,
                      backgroundImage: currentTemplate.backgroundImage
                        ? `url(${currentTemplate.backgroundImage})`
                        : undefined,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                      overflow: "hidden"
                    }}
                  >
                    {isCrossed && (
                      <div
                        style={{
                          position: "absolute",
                          left: 0,
                          top: 0,
                          width: "28px",
                          height: "28px",
                          pointerEvents: "none",
                          zIndex: 3
                        }}
                      >
                        <svg viewBox="0 0 100 100" style={{ width: "100%", height: "100%", display: "block" }}>
                          <line x1="0" y1="44" x2="44" y2="0" stroke="#000000" strokeWidth="5" />
                          <line x1="0" y1="74" x2="74" y2="0" stroke="#000000" strokeWidth="5" />
                        </svg>
                      </div>
                    )}
                    <div
                      className="mini-cheque-inner"
                      style={{
                        transform: settings.rotation ? `rotate(${settings.rotation}deg)` : "none"
                      }}
                    >
                      <div className="mini-bank-header">
                        <span className="mini-bank-tag">{currentTemplate.shortName || "CHÈQUE"}</span>
                        {showChequeNumber && chequeNumber && (
                          <span className="mini-cheque-num-tag">N° {chequeNumber}</span>
                        )}
                        {isCrossed && <span className="mini-crossed-tag">// BARRÉ //</span>}
                        <span className="mini-amount-tag"># {formattedAmount} DA #</span>
                      </div>

                      <div className="mini-lines-stack">
                        <div className="mini-text-line benef">
                          <span className="mini-label">Ordre :</span>
                          <span className="mini-val">{beneficiary || "Bénéficiaire"}</span>
                        </div>
                        <div className="mini-text-line date">
                          <span className="mini-label">Le :</span>
                          <span className="mini-val">{date || "jj/mm/aaaa"}</span>
                        </div>
                      </div>

                      <div className="mini-cheque-footer">
                        <span className="mini-coords-tag">
                          X: {pos.left}mm | Y: {pos.top}mm
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Mode Zoom Chèque */
                <div
                  className="preview-cheque-zoom"
                  style={{
                    backgroundImage: currentTemplate.backgroundImage
                      ? `url(${currentTemplate.backgroundImage})`
                      : undefined,
                    position: "relative",
                    overflow: "hidden"
                  }}
                >
                  {isCrossed && (
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        width: "60px",
                        height: "60px",
                        pointerEvents: "none",
                        zIndex: 4
                      }}
                    >
                      <svg viewBox="0 0 100 100" style={{ width: "100%", height: "100%", display: "block" }}>
                        <line x1="0" y1="44" x2="44" y2="0" stroke="#1e1e18" strokeWidth="3.2" />
                        <line x1="0" y1="74" x2="74" y2="0" stroke="#1e1e18" strokeWidth="3.2" />
                        {crossedWithText && (
                          <text
                            x="29.5"
                            y="29.5"
                            transform="rotate(-45 29.5 29.5)"
                            fontSize="6.5"
                            fontWeight="bold"
                            fill="#1e1e18"
                            textAnchor="middle"
                            dy="-1"
                          >
                            NON ENDOSSABLE
                          </text>
                        )}
                      </svg>
                    </div>
                  )}
                  <div className="zoom-cheque-overlay">
                    <div className="zoom-header">
                      <span className="zoom-bank-title">
                        {currentTemplate.name}
                        {showChequeNumber && chequeNumber && ` · N° ${chequeNumber}`}
                      </span>
                      <span className="zoom-amount"># {formattedAmount} DA #</span>
                    </div>
                    <div className="zoom-beneficiary">
                      <span className="zoom-label">À l'ordre de :</span>
                      <strong>{beneficiary || "Non renseigné"}</strong>
                    </div>
                    <div className="zoom-footer-row">
                      <span>Lieu : <strong>Alger</strong></span>
                      <span>Date : <strong>{date || "Non renseignée"}</strong></span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Résumé des coordonnées physiques calculées */}
            <div className="print-coordinates-summary">
              <div className="coord-chip">
                <span className="chip-label">Départ Horizontal (X) :</span>
                <strong className="chip-value">{pos.left} mm</strong>
              </div>
              <div className="coord-chip">
                <span className="chip-label">Départ Vertical (Y) :</span>
                <strong className="chip-value">{pos.top} mm</strong>
              </div>
              <div className="coord-chip">
                <span className="chip-label">Dimensions chèque :</span>
                <strong className="chip-value">{currentTemplate.width} × {currentTemplate.height} mm</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Pied de page du modal */}
        <div className="print-modal-footer">
          <div className="footer-advice">
            <Info size={15} className="advice-icon" />
            <span>
              Sélectionnez <strong>Plein Centre</strong> ou <strong>Au début (Haut)</strong> selon l'insertion dans votre bac.
            </span>
          </div>

          <div className="footer-actions">
            <button type="button" className="btn-modal-secondary" onClick={onClose}>
              Annuler
            </button>
            {onExportPdf && (
              <button
                type="button"
                className="btn-modal-secondary btn-modal-pdf"
                onClick={onExportPdf}
                title="Générer un fichier PDF haute résolution avec cette mise en page"
              >
                <FileDown size={16} />
                <span>Exporter en PDF</span>
              </button>
            )}
            <button
              type="button"
              className="btn-action-luxury-green"
              onClick={onConfirmPrint}
            >
              <Printer size={16} />
              <span>
                {isReprint ? `Lancer la réimpression (N°${(printCount || 1) + 1})` : "Lancer l'impression"}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Guide visuel des 4 bacs d'insertion */}
      {showInsertionGuide && (
        <PrinterInsertionGuideModal
          isOpen={showInsertionGuide}
          onClose={() => setShowInsertionGuide(false)}
          currentSettings={settings}
          onSelectPreset={(preset) => {
            handleUpdate({
              paperFormat: preset.paperFormat,
              placement: preset.placement,
              rotation: preset.rotation
            });
            setShowInsertionGuide(false);
            setToastMessage(`Position "${preset.name}" appliquée !`);
            setTimeout(() => setToastMessage(null), 2500);
          }}
        />
      )}
    </div>
  );
};
