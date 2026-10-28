import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  Printer,
  FileDown,
  Scissors,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  X,
  Sliders,
  Sparkles,
  Move,
  Info,
  Check,
  Building2,
  Layers,
  ChevronRight,
  RotateCw,
  MousePointer
} from "lucide-react";
import type { BankTemplate, FieldKey, Positions, PrintSettings, CalibrationTestFillingData, PrinterPreset } from "../types";
import { generateCalibrationSheetPdf, getCalibrationSpecimensLayout } from "../services/pdfExport";
import { loadPrinterPresets, upsertPrinterPreset } from "../services/printerPresets";
import { PrintModal } from "./PrintModal";

export interface PrinterCalibrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  templates: BankTemplate[];
  selectedTemplateId: string;
  onSelectTemplate: (id: string) => void;
  onSaveTemplate: (template: BankTemplate) => void;
  globalPrintSettings: PrintSettings;
  onChangeGlobalPrintSettings: (settings: PrintSettings) => void;
  onApplyPositionsToAll?: (positions: Positions) => void;
  onPrintCalibrationSheet: (includeImage?: boolean) => void;
  onPrintTestFilling: (
    template: BankTemplate,
    settings: PrintSettings,
    testData: CalibrationTestFillingData
  ) => void;
  presets?: PrinterPreset[];
  activePresetId?: string;
  onSavePreset?: (preset: Partial<PrinterPreset> & { name: string }) => void;
  onSelectPreset?: (id: string) => void;
}

const STEPS = [
  { id: 1, label: "Gabarit 3 Chèques & Découpe" },
  { id: 2, label: "Remplissage Test & Alignement" },
  { id: 3, label: "Application & Enregistrement" }
];

const FIELD_LABELS: Record<FieldKey, string> = {
  beneficiary: "Bénéficiaire (À l'ordre de)",
  words: "Montant lettres (Ligne 1)",
  wordsSecondLine: "Montant lettres (Ligne 2)",
  numeric: "Montant chiffré (# ... #)",
  place: "Lieu (Fait à)",
  date: "Date (Le)",
  chequeNumber: "Numéro de chèque"
};

export const PrinterCalibrationWizardModal: React.FC<PrinterCalibrationModalProps> = ({
  isOpen,
  onClose,
  templates,
  selectedTemplateId,
  onSelectTemplate,
  onSaveTemplate,
  globalPrintSettings,
  onChangeGlobalPrintSettings,
  onApplyPositionsToAll,
  onPrintCalibrationSheet,
  onPrintTestFilling,
  presets: initialPresets,
  activePresetId: initialActivePresetId,
  onSavePreset,
  onSelectPreset
}) => {
  if (!isOpen) return null;

  const activeTemplate = useMemo(() => {
    return templates.find((t) => t.id === selectedTemplateId) || templates[0] || null;
  }, [templates, selectedTemplateId]);

  const [currentStep, setCurrentStep] = useState<number>(1);
  const [trialCount, setTrialCount] = useState<number>(1);
  const [activeField, setActiveField] = useState<FieldKey>("beneficiary");
  const [isDownloadingPdf, setIsDownloadingPdf] = useState<boolean>(false);
  const [includeChequeImage, setIncludeChequeImage] = useState<boolean>(true);
  const [isPrintConfigModalOpen, setIsPrintConfigModalOpen] = useState<boolean>(false);

  // État des Profils d'imprimante (Presets)
  const [presetsList, setPresetsList] = useState<PrinterPreset[]>(() => {
    return initialPresets && initialPresets.length > 0 ? initialPresets : loadPrinterPresets();
  });
  const [selectedPresetId, setSelectedPresetId] = useState<string>(() => {
    return (
      initialActivePresetId ||
      presetsList.find((p) => p.isDefault)?.id ||
      presetsList[0]?.id ||
      "preset-standard-center"
    );
  });
  const [presetSaveAction, setPresetSaveAction] = useState<"update-selected" | "create-new">("update-selected");
  const [newPresetName, setNewPresetName] = useState<string>("");
  const [makeDefault, setMakeDefault] = useState<boolean>(true);

  // Drag and drop states & refs
  const [draggingField, setDraggingField] = useState<FieldKey | null>(null);
  const dragStartRef = useRef<{ clientX: number; clientY: number; origX: number; origY: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Copie de travail des réglages d'impression
  const [workingSettings, setWorkingSettings] = useState<PrintSettings>(() => {
    const matchedPreset = presetsList.find((p) => p.id === selectedPresetId);
    if (matchedPreset) {
      return {
        paperFormat: matchedPreset.paperFormat,
        placement: matchedPreset.placement,
        offsetX: matchedPreset.offsetX,
        offsetY: matchedPreset.offsetY,
        rotation: matchedPreset.rotation,
        showBorderGuide: matchedPreset.showBorderGuide
      };
    }
    return {
      ...globalPrintSettings,
      ...(activeTemplate?.printSettings || {})
    };
  });

  const handleSelectPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    if (onSelectPreset) onSelectPreset(presetId);
    const p = presetsList.find((item) => item.id === presetId);
    if (p) {
      setWorkingSettings({
        paperFormat: p.paperFormat,
        placement: p.placement,
        offsetX: p.offsetX,
        offsetY: p.offsetY,
        rotation: p.rotation,
        showBorderGuide: p.showBorderGuide
      });
    }
  };

  // Copie de travail des positions du modèle actif
  const [workingPositions, setWorkingPositions] = useState<Positions>(() => {
    if (!activeTemplate) {
      return {
        beneficiary: { x: 22, y: 31, size: 3.6 },
        words: { x: 28, y: 39, size: 3.4 },
        wordsSecondLine: { x: 20, y: 46, size: 3.4 },
        numeric: { x: 135, y: 31, size: 4.4, align: "right" },
        place: { x: 104, y: 55, size: 3.4 },
        date: { x: 138, y: 55, size: 3.4 },
        chequeNumber: { x: 135, y: 15, size: 3.2 }
      };
    }
    return JSON.parse(JSON.stringify(activeTemplate.positions));
  });

  const [saveMode, setSaveMode] = useState<"global" | "template-only" | "all-templates">("global");

  // Synchronise lorsque l'utilisateur change de banque
  useEffect(() => {
    if (activeTemplate) {
      setWorkingPositions(JSON.parse(JSON.stringify(activeTemplate.positions)));
      setWorkingSettings((prev) => ({
        ...prev,
        ...(activeTemplate.printSettings || {})
      }));
    }
  }, [activeTemplate?.id]);

  const testData: CalibrationTestFillingData = useMemo(() => {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, "0");
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const year = today.getFullYear();
    return {
      beneficiary: "SARL EXEMPLE TEST DISTRIBUTION",
      wordsL1: "Cent vingt-cinq mille quatre cent cinquante dinars",
      wordsL2: "algériens et zéro centime",
      numeric: "#125 450,00#",
      place: "Alger",
      date: `${day}/${month}/${year}`,
      chequeNumber: "0012345"
    };
  }, []);

  // Déplacement / Nudge de la marge globale de l'imprimante
  const handleNudgeOffset = (axis: "x" | "y", delta: number) => {
    setWorkingSettings((prev) => ({
      ...prev,
      offsetX: axis === "x" ? Number((prev.offsetX + delta).toFixed(1)) : prev.offsetX,
      offsetY: axis === "y" ? Number((prev.offsetY + delta).toFixed(1)) : prev.offsetY
    }));
  };

  // Déplacement / Nudge d'un champ spécifique du chèque
  const handleNudgeField = (key: FieldKey, axis: "x" | "y" | "size", delta: number) => {
    setWorkingPositions((prev) => {
      const field = prev[key];
      if (!field) return prev;
      return {
        ...prev,
        [key]: {
          ...field,
          [axis]: Number((field[axis] + delta).toFixed(1))
        }
      };
    });
  };

  // Drag and drop interactif direct sur le canevas du chèque
  const handlePointerDown = (key: FieldKey, e: React.PointerEvent) => {
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    setActiveField(key);
    setDraggingField(key);
    if (!workingPositions[key]) return;
    dragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      origX: workingPositions[key].x,
      origY: workingPositions[key].y
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingField || !dragStartRef.current || !canvasRef.current || !activeTemplate) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mmPerPixelX = activeTemplate.width / rect.width;
    const mmPerPixelY = activeTemplate.height / rect.height;

    const deltaX = (e.clientX - dragStartRef.current.clientX) * mmPerPixelX;
    const deltaY = (e.clientY - dragStartRef.current.clientY) * mmPerPixelY;

    const nextX = Math.max(0, Math.min(activeTemplate.width, dragStartRef.current.origX + deltaX));
    const nextY = Math.max(0, Math.min(activeTemplate.height, dragStartRef.current.origY + deltaY));

    setWorkingPositions((prev) => ({
      ...prev,
      [draggingField]: {
        ...prev[draggingField],
        x: Number(nextX.toFixed(1)),
        y: Number(nextY.toFixed(1))
      }
    }));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (draggingField) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
      setDraggingField(null);
      dragStartRef.current = null;
    }
  };

  const handleDownloadPdf = async () => {
    if (!activeTemplate) return;
    setIsDownloadingPdf(true);
    try {
      await generateCalibrationSheetPdf(activeTemplate, includeChequeImage);
    } catch (err) {
      console.error("Erreur téléchargement gabarit PDF:", err);
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleTriggerTestFilling = () => {
    if (!activeTemplate) return;
    const testTemplate: BankTemplate = {
      ...activeTemplate,
      positions: workingPositions
    };
    onPrintTestFilling(testTemplate, workingSettings, testData);
    setTrialCount((prev) => prev + 1);
  };

  const handleSaveAndFinish = () => {
    if (!activeTemplate) return;

    // 1. Sauvegarde dans le Profil d'imprimante (Preset)
    if (presetSaveAction === "create-new") {
      const nameToUse = newPresetName.trim() || `Profil Imprimante ${new Date().toLocaleDateString("fr-FR")}`;
      const { presets: updatedList, savedPreset } = upsertPrinterPreset(
        {
          name: nameToUse,
          paperFormat: workingSettings.paperFormat,
          placement: workingSettings.placement,
          offsetX: workingSettings.offsetX,
          offsetY: workingSettings.offsetY,
          rotation: workingSettings.rotation,
          showBorderGuide: workingSettings.showBorderGuide,
          isDefault: makeDefault
        },
        presetsList
      );
      setPresetsList(updatedList);
      if (onSavePreset) onSavePreset(savedPreset);
    } else {
      const existing = presetsList.find((p) => p.id === selectedPresetId) || presetsList[0];
      if (existing) {
        const { presets: updatedList, savedPreset } = upsertPrinterPreset(
          {
            id: existing.id,
            name: existing.name,
            paperFormat: workingSettings.paperFormat,
            placement: workingSettings.placement,
            offsetX: workingSettings.offsetX,
            offsetY: workingSettings.offsetY,
            rotation: workingSettings.rotation,
            showBorderGuide: workingSettings.showBorderGuide,
            isDefault: makeDefault || existing.isDefault
          },
          presetsList
        );
        setPresetsList(updatedList);
        if (onSavePreset) onSavePreset(savedPreset);
      }
    }

    if (makeDefault) {
      onChangeGlobalPrintSettings(workingSettings);
    }

    // 2. Sauvegarde des coordonnées géométriques du chèque
    if (saveMode === "global") {
      const updatedTemplate: BankTemplate = {
        ...activeTemplate,
        positions: workingPositions,
        printSettings: undefined
      };
      onSaveTemplate(updatedTemplate);
    } else if (saveMode === "template-only") {
      const updatedTemplate: BankTemplate = {
        ...activeTemplate,
        positions: workingPositions,
        printSettings: {
          offsetX: workingSettings.offsetX,
          offsetY: workingSettings.offsetY,
          placement: workingSettings.placement,
          rotation: workingSettings.rotation,
          paperFormat: workingSettings.paperFormat
        }
      };
      onSaveTemplate(updatedTemplate);
    } else if (saveMode === "all-templates") {
      if (onApplyPositionsToAll) {
        onApplyPositionsToAll(workingPositions);
      } else {
        templates.forEach((t) => {
          onSaveTemplate({
            ...t,
            positions: workingPositions
          });
        });
      }
    }

    onClose();
  };

  return (
    <div className="setup-wizard-backdrop" role="dialog" aria-modal="true">
      <div className="setup-wizard-container" style={{ maxWidth: "1140px", width: "96vw" }}>
        <div className="setup-wizard-card">
          {/* Header harmonisé */}
          <div className="setup-wizard-header">
            <div className="setup-header-brand">
              <div className="setup-header-icon-box">
                <Sliders size={20} />
              </div>
              <div>
                <h1 className="setup-header-title">Assistant de Calibrage Imprimante & Gabarit 3 Spécimens</h1>
                <span className="setup-header-subtitle">
                  Réglez l'alignement millimétrique de vos chèques sans gaspiller de vrais chéquiers
                </span>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div className="setup-version-pill">
                Étape {currentStep} / 3
              </div>
              <button
                type="button"
                onClick={onClose}
                className="modal-close-btn"
                title="Fermer l'assistant"
                aria-label="Fermer"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Stepper moderne */}
          <div className="setup-stepper" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
            {STEPS.map((s) => {
              const isCurrent = currentStep === s.id;
              const isDone = currentStep > s.id;

              return (
                <div
                  key={s.id}
                  className={`setup-step-item ${isCurrent ? "active" : isDone ? "completed" : "inactive"}`}
                  onClick={() => setCurrentStep(s.id)}
                  style={{ cursor: "pointer" }}
                >
                  <div className={`setup-step-circle ${isCurrent ? "active" : isDone ? "completed" : "inactive"}`}>
                    {isDone ? <Check size={12} strokeWidth={3} /> : s.id}
                  </div>
                  <span className="setup-step-label">{s.label}</span>
                </div>
              );
            })}
          </div>

          {/* Corps de l'étape active */}
          <div className="setup-step-body" style={{ minHeight: "480px", padding: "22px 28px", overflowX: "hidden" }}>
            {/* ========================================================
                ÉTAPE 1 : GABARIT A4 & DÉCOUPE (3 SPÉCIMENS RÉELS)
               ======================================================== */}
            {currentStep === 1 && (
              <div>
                <div className="setup-section-title">
                  Feuille de Test & Gabarit 3 Chèques (Dimensions Réelles)
                </div>
                <div className="setup-section-desc">
                  Choisissez un modèle exemplaire parmi vos chéquiers pour reproduire son image réelle sur la feuille A4. Découpez les 3 spécimens le long des pointillés ✂️ pour obtenir des chèques d'essai conformes à la réalité.
                </div>

                {/* Sélecteur de modèle bancaire / exemplaire de chèque */}
                <div style={{ marginBottom: "16px", padding: "12px 18px", background: "#FAF8F5", borderRadius: "10px", border: "1px solid var(--border-color)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div className="setup-header-icon-box" style={{ width: "34px", height: "34px", borderRadius: "8px" }}>
                      <Building2 size={16} />
                    </div>
                    <div>
                      <strong style={{ fontSize: "12.5px", color: "var(--text-primary)", display: "block" }}>
                        Chèque bancaire exemplaire à reproduire :
                      </strong>
                      <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                        Sélectionnez la banque dont vous souhaitez tester et imprimer les spécimens réels
                      </span>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <select
                      className="user-form-input"
                      style={{ padding: "6px 12px", fontSize: "12.5px", minWidth: "260px" }}
                      value={selectedTemplateId}
                      onChange={(e) => onSelectTemplate(e.target.value)}
                    >
                      {templates.map((tpl) => (
                        <option key={tpl.id} value={tpl.id}>
                          {tpl.name} ({tpl.width} × {tpl.height} mm)
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "310px 1fr", gap: "24px", alignItems: "start" }}>
                  {/* Miniature A4 chaleureuse avec l'image réelle du chèque */}
                  <div className="setup-summary-card" style={{ padding: "16px", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", margin: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", fontWeight: 700, color: "var(--gold-dark)" }}>
                      <Layers size={14} />
                      <span>3 Exemplaires : {activeTemplate?.shortName || activeTemplate?.name}</span>
                    </div>

                    <div
                      style={{
                        width: "210px",
                        height: "297px",
                        background: "#FFFFFF",
                        border: "1px solid var(--border-color)",
                        borderRadius: "4px",
                        boxShadow: "0 6px 16px rgba(0,0,0,0.06)",
                        padding: "10px",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        boxSizing: "border-box"
                      }}
                    >
                      <div style={{ borderBottom: "1px solid #E2E8F0", paddingBottom: "4px", textAlign: "center" }}>
                        <div style={{ fontSize: "7.5px", fontWeight: 800, color: "var(--text-primary)" }}>
                          VCHEQUE STUDIO — GABARIT PHYSIQUE
                        </div>
                        <div style={{ fontSize: "6px", color: "var(--text-muted)" }}>
                          Échelle 100% réelle ({activeTemplate?.width || 175} × {activeTemplate?.height || 80} mm)
                        </div>
                      </div>

                      {[1, 2, 3].map((num) => (
                        <div
                          key={num}
                          style={{
                            border: "1.5px dashed var(--gold-primary)",
                            borderRadius: "3px",
                            height: "72px",
                            padding: "4px 6px",
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "space-between",
                            backgroundColor: "#FAF8F5",
                            backgroundImage: (includeChequeImage && activeTemplate?.backgroundImage)
                              ? `url(${activeTemplate.backgroundImage})`
                              : undefined,
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                            backgroundRepeat: "no-repeat",
                            position: "relative",
                            overflow: "hidden"
                          }}
                        >
                          <div style={{ fontSize: "7px", color: "#111", background: "rgba(255,255,255,0.85)", padding: "1px 4px", borderRadius: "2px", display: "inline-flex", alignItems: "center", gap: "3px", fontWeight: 700, width: "fit-content" }}>
                            <Scissors size={8} />
                            <span>Spécimen #{num} — {activeTemplate?.shortName || activeTemplate?.name}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                            <div style={{ height: "3px", width: "40px", background: "rgba(0,0,0,0.2)", borderRadius: "1px" }} />
                            <div style={{ height: "10px", width: "24px", border: "1px solid rgba(0,0,0,0.3)", borderRadius: "1px" }} />
                          </div>
                        </div>
                      ))}
                    </div>

                    <span style={{ fontSize: "11px", color: "var(--text-muted)", textAlign: "center" }}>
                      Dimensions réelles : {activeTemplate?.width || 175} × {activeTemplate?.height || 80} mm
                    </span>
                  </div>

                  {/* Consignes & Actions */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div className="setup-option-box selected" style={{ cursor: "default" }}>
                      <div className="setup-option-icon">
                        <Info size={16} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div className="setup-option-title">
                          Pourquoi utiliser cette feuille de test ?
                        </div>
                        <div className="setup-option-desc">
                          Elle imprime 3 répliques conformes du chèque <strong>{activeTemplate?.name}</strong> avec l'image officielle et les repères de coupe pour tester votre imprimante sans gaspiller de vrais chèques bancaires.
                        </div>
                      </div>
                    </div>

                    <div className="setup-summary-card" style={{ margin: 0, padding: "14px 16px" }}>
                      <div className="setup-summary-header" style={{ marginBottom: "8px" }}>
                        <Sparkles size={14} />
                        <span>Instructions pas-à-pas</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "12px", color: "var(--text-secondary)", lineHeight: "1.45" }}>
                        <div><strong>1. Imprimez la feuille A4 :</strong> Laissez l'échelle à 100% ("Taille réelle") sans cocher "Ajuster à la page".</div>
                        <div><strong>2. Découpez les 3 chèques :</strong> Utilisez une paire de ciseaux ✂️ en suivant les pointillés extérieurs.</div>
                        <div><strong>3. Chargez 1 spécimen :</strong> Placez-le dans le bac de votre imprimante comme un vrai chèque.</div>
                      </div>
                    </div>

                    {/* Option image officielle chèque */}
                    <div style={{ padding: "8px 12px", background: "#FAF8F5", border: "1px solid var(--border-color)", borderRadius: "8px" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "var(--text-primary)", cursor: "pointer", userSelect: "none" }}>
                        <input
                          type="checkbox"
                          checked={includeChequeImage}
                          onChange={(e) => setIncludeChequeImage(e.target.checked)}
                          style={{ accentColor: "var(--gold-dark)", width: "16px", height: "16px" }}
                        />
                        <span>Imprimer avec l'image réelle du chèque ({activeTemplate?.shortName || activeTemplate?.name})</span>
                      </label>
                    </div>

                    <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
                      <button
                        type="button"
                        className="btn-action-luxury-green btn-print-main"
                        onClick={() => onPrintCalibrationSheet(includeChequeImage)}
                        style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "10px 20px", fontSize: "12.5px" }}
                      >
                        <Printer size={16} />
                        <span>Imprimer le Gabarit A4 (3 exemplaires)</span>
                      </button>

                      <button
                        type="button"
                        className="btn-storage-action"
                        onClick={handleDownloadPdf}
                        disabled={isDownloadingPdf}
                        style={{ padding: "10px 16px", fontSize: "12.5px" }}
                      >
                        <FileDown size={15} />
                        <span>{isDownloadingPdf ? "Génération..." : "Télécharger Gabarit PDF (100%)"}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ========================================================
                ÉTAPE 2 : REMPLISSAGE TEST & ALIGNEMENT INTERACTIF
               ======================================================== */}
            {currentStep === 2 && activeTemplate && (
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
                  <div className="setup-section-title" style={{ margin: 0 }}>
                    Remplissage d'Essai & Boucle d'Alignement
                  </div>
                  <span className="active-session-pill">
                    Essai #{trialCount} / 3
                  </span>
                </div>
                <div className="setup-section-desc">
                  Sélectionnez votre banque pour afficher son chèque réel en fond. Déplacez les textes directement par <strong>glisser-déposer (Drag & Drop)</strong> sur le chèque ou ajustez via le panneau de droite.
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "minmax(520px, 1fr) 350px", gap: "24px", alignItems: "start" }}>
                  {/* Zone Gauche : Sélecteur de Banque & Aperçu du chèque draggable */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {/* Sélecteur de banque étalon & Profil d'imprimante */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#FAF8F5", padding: "10px 16px", borderRadius: "8px", border: "1px solid var(--border-color)", flexWrap: "wrap", gap: "10px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <Building2 size={15} style={{ color: "var(--gold-dark)" }} />
                          <span style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--text-primary)" }}>
                            Banque :
                          </span>
                          <select
                            className="user-form-input"
                            style={{ width: "auto", minWidth: "160px", padding: "4px 8px", fontSize: "12px" }}
                            value={selectedTemplateId}
                            onChange={(e) => onSelectTemplate(e.target.value)}
                          >
                            {templates.map((tpl) => (
                              <option key={tpl.id} value={tpl.id}>
                                {tpl.name} ({tpl.width} × {tpl.height} mm)
                              </option>
                            ))}
                          </select>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <Printer size={15} style={{ color: "var(--gold-dark)" }} />
                          <span style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--text-primary)" }}>
                            Profil Imprimante :
                          </span>
                          <select
                            className="user-form-input"
                            style={{ width: "auto", minWidth: "170px", padding: "4px 8px", fontSize: "12px", fontWeight: 600 }}
                            value={selectedPresetId}
                            onChange={(e) => handleSelectPreset(e.target.value)}
                          >
                            {presetsList.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} {p.isDefault ? "★ (Défaut)" : ""}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                        Marge : <strong>X:{workingSettings.offsetX > 0 ? `+${workingSettings.offsetX}` : workingSettings.offsetX} Y:{workingSettings.offsetY > 0 ? `+${workingSettings.offsetY}` : workingSettings.offsetY} mm</strong> | Rot : <strong>{workingSettings.rotation}°</strong>
                      </div>
                    </div>

                    {/* Cadre de visualisation du chèque avec fond réel et Drag & Drop */}
                    <div
                      style={{
                        background: "#FAF8F5",
                        border: "1px solid rgba(216, 198, 165, 0.7)",
                        borderRadius: "12px",
                        padding: "20px 24px",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.03)"
                      }}
                    >
                      <div
                        ref={canvasRef}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        style={{
                          width: "100%",
                          maxWidth: "600px",
                          aspectRatio: `${activeTemplate.width} / ${activeTemplate.height}`,
                          backgroundColor: "#FFFFFF",
                          backgroundImage: activeTemplate.backgroundImage ? `url(${activeTemplate.backgroundImage})` : undefined,
                          backgroundSize: "100% 100%",
                          backgroundPosition: "center",
                          backgroundRepeat: "no-repeat",
                          border: "1.5px solid #CBD5E1",
                          borderRadius: "6px",
                          boxShadow: "0 8px 24px rgba(0,0,0,0.1)",
                          position: "relative",
                          overflow: "hidden",
                          userSelect: "none"
                        }}
                      >
                        {/* Bénéficiaire */}
                        <div
                          onPointerDown={(e) => handlePointerDown("beneficiary", e)}
                          style={{
                            position: "absolute",
                            left: `${(workingPositions.beneficiary.x / activeTemplate.width) * 100}%`,
                            top: `${(workingPositions.beneficiary.y / activeTemplate.height) * 100}%`,
                            fontSize: `${workingPositions.beneficiary.size * 3.2}px`,
                            transform: "translateY(-50%)",
                            padding: "2px 6px",
                            border: activeField === "beneficiary" ? "2px solid var(--gold-dark)" : "1px dashed rgba(0,0,0,0.25)",
                            background: activeField === "beneficiary" ? "rgba(255, 255, 255, 0.9)" : "rgba(255, 255, 255, 0.65)",
                            borderRadius: "4px",
                            cursor: draggingField === "beneficiary" ? "grabbing" : "grab",
                            whiteSpace: "nowrap",
                            fontWeight: 700,
                            fontFamily: "Arial, Helvetica, sans-serif",
                            color: "#000000",
                            boxShadow: activeField === "beneficiary" ? "0 2px 8px rgba(172, 137, 70, 0.4)" : "none",
                            touchAction: "none"
                          }}
                        >
                          {testData.beneficiary}
                        </div>

                        {/* Montant lettres L1 */}
                        <div
                          onPointerDown={(e) => handlePointerDown("words", e)}
                          style={{
                            position: "absolute",
                            left: `${(workingPositions.words.x / activeTemplate.width) * 100}%`,
                            top: `${(workingPositions.words.y / activeTemplate.height) * 100}%`,
                            fontSize: `${workingPositions.words.size * 3.2}px`,
                            transform: "translateY(-50%)",
                            padding: "2px 6px",
                            border: activeField === "words" ? "2px solid var(--gold-dark)" : "1px dashed rgba(0,0,0,0.25)",
                            background: activeField === "words" ? "rgba(255, 255, 255, 0.9)" : "rgba(255, 255, 255, 0.65)",
                            borderRadius: "4px",
                            cursor: draggingField === "words" ? "grabbing" : "grab",
                            whiteSpace: "nowrap",
                            fontWeight: 700,
                            fontFamily: "Arial, Helvetica, sans-serif",
                            color: "#000000",
                            boxShadow: activeField === "words" ? "0 2px 8px rgba(172, 137, 70, 0.4)" : "none",
                            touchAction: "none"
                          }}
                        >
                          {testData.wordsL1}
                        </div>

                        {/* Montant lettres L2 */}
                        <div
                          onPointerDown={(e) => handlePointerDown("wordsSecondLine", e)}
                          style={{
                            position: "absolute",
                            left: `${(workingPositions.wordsSecondLine.x / activeTemplate.width) * 100}%`,
                            top: `${(workingPositions.wordsSecondLine.y / activeTemplate.height) * 100}%`,
                            fontSize: `${workingPositions.wordsSecondLine.size * 3.2}px`,
                            transform: "translateY(-50%)",
                            padding: "2px 6px",
                            border: activeField === "wordsSecondLine" ? "2px solid var(--gold-dark)" : "1px dashed rgba(0,0,0,0.25)",
                            background: activeField === "wordsSecondLine" ? "rgba(255, 255, 255, 0.9)" : "rgba(255, 255, 255, 0.65)",
                            borderRadius: "4px",
                            cursor: draggingField === "wordsSecondLine" ? "grabbing" : "grab",
                            whiteSpace: "nowrap",
                            fontWeight: 700,
                            fontFamily: "Arial, Helvetica, sans-serif",
                            color: "#000000",
                            boxShadow: activeField === "wordsSecondLine" ? "0 2px 8px rgba(172, 137, 70, 0.4)" : "none",
                            touchAction: "none"
                          }}
                        >
                          {testData.wordsL2}
                        </div>

                        {/* Montant Chiffré */}
                        <div
                          onPointerDown={(e) => handlePointerDown("numeric", e)}
                          style={{
                            position: "absolute",
                            left: `${(workingPositions.numeric.x / activeTemplate.width) * 100}%`,
                            top: `${(workingPositions.numeric.y / activeTemplate.height) * 100}%`,
                            fontSize: `${workingPositions.numeric.size * 3.2}px`,
                            transform: workingPositions.numeric.align === "right" ? "translate(-100%, -50%)" : "translateY(-50%)",
                            padding: "2px 6px",
                            border: activeField === "numeric" ? "2px solid var(--gold-dark)" : "1px dashed rgba(0,0,0,0.25)",
                            background: activeField === "numeric" ? "rgba(255, 255, 255, 0.9)" : "rgba(255, 255, 255, 0.65)",
                            borderRadius: "4px",
                            cursor: draggingField === "numeric" ? "grabbing" : "grab",
                            whiteSpace: "nowrap",
                            fontWeight: 700,
                            fontFamily: "Arial, Helvetica, sans-serif",
                            color: "#000000",
                            boxShadow: activeField === "numeric" ? "0 2px 8px rgba(172, 137, 70, 0.4)" : "none",
                            touchAction: "none"
                          }}
                        >
                          {testData.numeric}
                        </div>

                        {/* Lieu */}
                        <div
                          onPointerDown={(e) => handlePointerDown("place", e)}
                          style={{
                            position: "absolute",
                            left: `${(workingPositions.place.x / activeTemplate.width) * 100}%`,
                            top: `${(workingPositions.place.y / activeTemplate.height) * 100}%`,
                            fontSize: `${workingPositions.place.size * 3.2}px`,
                            transform: "translateY(-50%)",
                            padding: "2px 6px",
                            border: activeField === "place" ? "2px solid var(--gold-dark)" : "1px dashed rgba(0,0,0,0.25)",
                            background: activeField === "place" ? "rgba(255, 255, 255, 0.9)" : "rgba(255, 255, 255, 0.65)",
                            borderRadius: "4px",
                            cursor: draggingField === "place" ? "grabbing" : "grab",
                            whiteSpace: "nowrap",
                            fontWeight: 700,
                            fontFamily: "Arial, Helvetica, sans-serif",
                            color: "#000000",
                            boxShadow: activeField === "place" ? "0 2px 8px rgba(172, 137, 70, 0.4)" : "none",
                            touchAction: "none"
                          }}
                        >
                          {testData.place}
                        </div>

                        {/* Date */}
                        <div
                          onPointerDown={(e) => handlePointerDown("date", e)}
                          style={{
                            position: "absolute",
                            left: `${(workingPositions.date.x / activeTemplate.width) * 100}%`,
                            top: `${(workingPositions.date.y / activeTemplate.height) * 100}%`,
                            fontSize: `${workingPositions.date.size * 3.2}px`,
                            transform: "translateY(-50%)",
                            padding: "2px 6px",
                            border: activeField === "date" ? "2px solid var(--gold-dark)" : "1px dashed rgba(0,0,0,0.25)",
                            background: activeField === "date" ? "rgba(255, 255, 255, 0.9)" : "rgba(255, 255, 255, 0.65)",
                            borderRadius: "4px",
                            cursor: draggingField === "date" ? "grabbing" : "grab",
                            whiteSpace: "nowrap",
                            fontWeight: 700,
                            fontFamily: "Arial, Helvetica, sans-serif",
                            color: "#000000",
                            boxShadow: activeField === "date" ? "0 2px 8px rgba(172, 137, 70, 0.4)" : "none",
                            touchAction: "none"
                          }}
                        >
                          {testData.date}
                        </div>

                        {/* Numéro de chèque */}
                        {workingPositions.chequeNumber && (
                          <div
                            onPointerDown={(e) => handlePointerDown("chequeNumber", e)}
                            style={{
                              position: "absolute",
                              left: `${(workingPositions.chequeNumber.x / activeTemplate.width) * 100}%`,
                              top: `${(workingPositions.chequeNumber.y / activeTemplate.height) * 100}%`,
                              fontSize: `${workingPositions.chequeNumber.size * 3.2}px`,
                              transform: "translateY(-50%)",
                              padding: "2px 6px",
                              border: activeField === "chequeNumber" ? "2px solid var(--gold-dark)" : "1px dashed rgba(0,0,0,0.25)",
                              background: activeField === "chequeNumber" ? "rgba(255, 255, 255, 0.9)" : "rgba(255, 255, 255, 0.65)",
                              borderRadius: "4px",
                              cursor: draggingField === "chequeNumber" ? "grabbing" : "grab",
                              whiteSpace: "nowrap",
                              fontWeight: 700,
                              fontFamily: "Arial, Helvetica, sans-serif",
                              color: "#000000",
                              boxShadow: activeField === "chequeNumber" ? "0 2px 8px rgba(172, 137, 70, 0.4)" : "none",
                              touchAction: "none"
                            }}
                          >
                            {testData.chequeNumber}
                          </div>
                        )}
                      </div>

                      {/* Indicateur d'aide Drag & Drop */}
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11.5px", color: "var(--gold-dark)", background: "rgba(172, 137, 70, 0.08)", padding: "6px 14px", borderRadius: "6px", width: "100%", justifyContent: "center", marginTop: "12px", fontWeight: 600 }}>
                        <MousePointer size={13} />
                        <span>Vous pouvez glisser-déposer (drag & drop) n'importe quel texte directement sur le chèque pour l'aligner</span>
                      </div>
                    </div>

                    {/* Boutons de correction rapide */}
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", padding: "0 4px" }}>
                      <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)" }}>
                        Ajustements rapides :
                      </span>
                      <button type="button" className="btn-action-card" style={{ padding: "4px 8px", fontSize: "11px" }} onClick={() => handleNudgeOffset("y", -1)}>
                        ▲ Trop bas (-1mm Y)
                      </button>
                      <button type="button" className="btn-action-card" style={{ padding: "4px 8px", fontSize: "11px" }} onClick={() => handleNudgeOffset("y", 1)}>
                        ▼ Trop haut (+1mm Y)
                      </button>
                      <button type="button" className="btn-action-card" style={{ padding: "4px 8px", fontSize: "11px" }} onClick={() => handleNudgeOffset("x", 1)}>
                        ▶ Trop à gauche (+1mm X)
                      </button>
                      <button type="button" className="btn-action-card" style={{ padding: "4px 8px", fontSize: "11px" }} onClick={() => handleNudgeOffset("x", -1)}>
                        ◀ Trop à droite (-1mm X)
                      </button>
                    </div>
                  </div>

                  {/* Panneau de réglage droit */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                    {/* Carte Décalage Imprimante */}
                    <div className="setup-summary-card" style={{ margin: 0, padding: "16px" }}>
                      <div className="setup-summary-header" style={{ marginBottom: "12px" }}>
                        <Move size={14} />
                        <span>Marge d'alimentation globale</span>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
                        <button type="button" className="btn-action-card" style={{ padding: "4px 14px", fontSize: "11.5px" }} onClick={() => handleNudgeOffset("y", -0.5)}>
                          ▲ +0.5 mm Haut
                        </button>

                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <button type="button" className="btn-action-card" style={{ padding: "4px 10px", fontSize: "11.5px" }} onClick={() => handleNudgeOffset("x", -0.5)}>
                            ◀ -0.5
                          </button>
                          <div style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--text-primary)", background: "#FAF8F5", padding: "4px 10px", borderRadius: "6px", border: "1px solid var(--border-color)" }}>
                            X: {workingSettings.offsetX > 0 ? `+${workingSettings.offsetX}` : workingSettings.offsetX} | Y: {workingSettings.offsetY > 0 ? `+${workingSettings.offsetY}` : workingSettings.offsetY} mm
                          </div>
                          <button type="button" className="btn-action-card" style={{ padding: "4px 10px", fontSize: "11.5px" }} onClick={() => handleNudgeOffset("x", 0.5)}>
                            +0.5 ▶
                          </button>
                        </div>

                        <button type="button" className="btn-action-card" style={{ padding: "4px 14px", fontSize: "11.5px" }} onClick={() => handleNudgeOffset("y", 0.5)}>
                          ▼ +0.5 mm Bas
                        </button>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "12px", paddingTop: "10px", borderTop: "1px solid var(--border-color)" }}>
                        <span style={{ fontSize: "11.5px", color: "var(--text-secondary)", fontWeight: 600 }}>Rotation :</span>
                        <div style={{ display: "flex", gap: "4px" }}>
                          {([0, 90, 180, 270] as const).map((deg) => (
                            <button
                              key={deg}
                              type="button"
                              className={`unit-btn ${workingSettings.rotation === deg ? "active" : ""}`}
                              style={{ padding: "3px 8px", fontSize: "11px" }}
                              onClick={() => setWorkingSettings((prev) => ({ ...prev, rotation: deg }))}
                            >
                              {deg}°
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Carte Champ actif */}
                    <div className="setup-summary-card" style={{ margin: 0, padding: "16px" }}>
                      <div className="setup-summary-header" style={{ marginBottom: "10px" }}>
                        <Sliders size={14} />
                        <span>Position du champ actif</span>
                      </div>

                      <select
                        className="user-form-input"
                        style={{ fontSize: "12px", padding: "5px 8px", marginBottom: "10px" }}
                        value={activeField}
                        onChange={(e) => setActiveField(e.target.value as FieldKey)}
                      >
                        {Object.entries(FIELD_LABELS).map(([k, label]) => (
                          <option key={k} value={k}>
                            {label}
                          </option>
                        ))}
                      </select>

                      {workingPositions[activeField] && (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                          <div>
                            <span style={{ fontSize: "10.5px", color: "var(--text-muted)", fontWeight: 700 }}>X (mm) :</span>
                            <div style={{ display: "flex", gap: "4px", marginTop: "2px" }}>
                              <button type="button" className="btn-action-card" style={{ padding: "3px 8px" }} onClick={() => handleNudgeField(activeField, "x", -0.5)}>-</button>
                              <input
                                type="number"
                                className="user-form-input"
                                style={{ textAlign: "center", padding: "3px", fontSize: "12px" }}
                                value={workingPositions[activeField].x}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setWorkingPositions((prev) => ({ ...prev, [activeField]: { ...prev[activeField], x: val } }));
                                }}
                                step="0.5"
                              />
                              <button type="button" className="btn-action-card" style={{ padding: "3px 8px" }} onClick={() => handleNudgeField(activeField, "x", 0.5)}>+</button>
                            </div>
                          </div>

                          <div>
                            <span style={{ fontSize: "10.5px", color: "var(--text-muted)", fontWeight: 700 }}>Y (mm) :</span>
                            <div style={{ display: "flex", gap: "4px", marginTop: "2px" }}>
                              <button type="button" className="btn-action-card" style={{ padding: "3px 8px" }} onClick={() => handleNudgeField(activeField, "y", -0.5)}>-</button>
                              <input
                                type="number"
                                className="user-form-input"
                                style={{ textAlign: "center", padding: "3px", fontSize: "12px" }}
                                value={workingPositions[activeField].y}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setWorkingPositions((prev) => ({ ...prev, [activeField]: { ...prev[activeField], y: val } }));
                                }}
                                step="0.5"
                              />
                              <button type="button" className="btn-action-card" style={{ padding: "3px 8px" }} onClick={() => handleNudgeField(activeField, "y", 0.5)}>+</button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Actionneurs Test d'Impression & Assistant de Configuration */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "4px" }}>
                      <button
                        type="button"
                        className="btn-action-luxury-green btn-print-main"
                        onClick={() => setIsPrintConfigModalOpen(true)}
                        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", padding: "12px", fontSize: "13px" }}
                        title="Ouvrir l'assistant de configuration d'impression pour régler le bac, l'emplacement et lancer l'essai"
                      >
                        <Printer size={16} />
                        <span>Imprimer Remplissage d'Essai (Test #{trialCount})</span>
                      </button>

                      <button
                        type="button"
                        className="btn-action-card"
                        onClick={() => setIsPrintConfigModalOpen(true)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "6px",
                          padding: "8px 12px",
                          fontSize: "11.5px",
                          color: "var(--gold-dark)",
                          backgroundColor: "rgba(172, 137, 70, 0.08)",
                          border: "1px solid rgba(172, 137, 70, 0.25)",
                          borderRadius: "6px",
                          cursor: "pointer"
                        }}
                        title="Configurer le format papier, la disposition sur la feuille et les marges d'alimentation"
                      >
                        <Sliders size={13} />
                        <span>Assistant de configuration d'impression</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ========================================================
                ÉTAPE 3 : APPLICATION & ENREGISTREMENT
               ======================================================== */}
            {currentStep === 3 && activeTemplate && (
              <div>
                <div className="setup-section-title">
                  Validation & Application de la Configuration
                </div>
                <div className="setup-section-desc">
                  Enregistrez ces réglages de marge dans un <strong>profil d'imprimante (Preset)</strong> réutilisable et appliquez l'alignement géométrique à vos formules de chèques.
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "16px", maxWidth: "780px", margin: "14px auto 0 auto" }}>
                  {/* BLOC 1 : PROFIL D'IMPRIMANTE (PRESET MATÉRIEL) */}
                  <div style={{ background: "#FAF8F5", border: "1.5px solid var(--border-color)", borderRadius: "10px", padding: "16px 20px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", borderBottom: "1px solid var(--border-color)", paddingBottom: "8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <Printer size={18} style={{ color: "var(--gold-dark)" }} />
                        <span style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--text-primary)" }}>
                          1. Enregistrement dans un Profil d'Imprimante (Preset)
                        </span>
                      </div>
                      <span className="unit-badge" style={{ fontSize: "11px" }}>
                        X: {workingSettings.offsetX > 0 ? `+${workingSettings.offsetX}` : workingSettings.offsetX} mm | Y: {workingSettings.offsetY > 0 ? `+${workingSettings.offsetY}` : workingSettings.offsetY} mm | {workingSettings.rotation}°
                      </span>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                      {/* Choix A : Mettre à jour profil existant */}
                      <div
                        className={`setup-option-box ${presetSaveAction === "update-selected" ? "selected" : ""}`}
                        style={{ margin: 0, padding: "12px 14px", cursor: "pointer" }}
                        onClick={() => setPresetSaveAction("update-selected")}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                            <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)" }}>
                              Mettre à jour un profil existant :
                            </span>
                            {presetSaveAction === "update-selected" && (
                              <Check size={13} strokeWidth={3} style={{ color: "var(--gold-dark)" }} />
                            )}
                          </div>
                          <select
                            className="user-form-input"
                            style={{ width: "100%", padding: "5px 8px", fontSize: "12px" }}
                            value={selectedPresetId}
                            onChange={(e) => handleSelectPreset(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {presetsList.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} {p.isDefault ? "★ (Défaut)" : ""}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Choix B : Créer un nouveau profil */}
                      <div
                        className={`setup-option-box ${presetSaveAction === "create-new" ? "selected" : ""}`}
                        style={{ margin: 0, padding: "12px 14px", cursor: "pointer" }}
                        onClick={() => setPresetSaveAction("create-new")}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                            <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)" }}>
                              Créer un NOUVEAU profil :
                            </span>
                            {presetSaveAction === "create-new" && (
                              <Check size={13} strokeWidth={3} style={{ color: "var(--gold-dark)" }} />
                            )}
                          </div>
                          <input
                            type="text"
                            className="user-form-input"
                            placeholder="ex: HP LaserJet Bac 1, Epson Bureau..."
                            style={{ width: "100%", padding: "5px 8px", fontSize: "12px" }}
                            value={newPresetName}
                            onChange={(e) => setNewPresetName(e.target.value)}
                            onClick={(e) => {
                              e.stopPropagation();
                              setPresetSaveAction("create-new");
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    <label style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "12px", cursor: "pointer", fontSize: "12px", color: "var(--text-primary)" }}>
                      <input
                        type="checkbox"
                        checked={makeDefault}
                        onChange={(e) => setMakeDefault(e.target.checked)}
                        style={{ accentColor: "var(--gold-dark)", width: "15px", height: "15px" }}
                      />
                      <span style={{ fontWeight: 600 }}>Définir ce profil d'imprimante comme profil par défaut du logiciel</span>
                    </label>
                  </div>

                  {/* BLOC 2 : COORDONNÉES DES TEXTES DU CHÈQUE */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "2px" }}>
                      <Sliders size={16} style={{ color: "var(--gold-dark)" }} />
                      <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>
                        2. Application des Coordonnées Géométriques des Chèques
                      </span>
                    </div>

                    {/* Option A : Standard Général */}
                    <div
                      className={`setup-option-box ${saveMode === "global" ? "selected" : ""}`}
                      onClick={() => setSaveMode("global")}
                    >
                      <div className="setup-option-icon">
                        <Sparkles size={16} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div className="setup-option-title">
                          Appliquer au modèle actif "{activeTemplate.name}" avec marges globales
                        </div>
                        <div className="setup-option-desc">
                          Enregistre l'alignement sur ce chéquier et met à jour les marges standards du bac.
                        </div>
                      </div>
                      {saveMode === "global" && (
                        <span className="active-session-pill" style={{ marginLeft: "8px" }}>
                          <Check size={11} strokeWidth={3} /> Sélectionné
                        </span>
                      )}
                    </div>

                    {/* Option B : Indépendant par chéquier */}
                    <div
                      className={`setup-option-box ${saveMode === "template-only" ? "selected" : ""}`}
                      onClick={() => setSaveMode("template-only")}
                    >
                      <div className="setup-option-icon">
                        <Building2 size={16} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div className="setup-option-title">
                          Appliquer exclusivement au modèle "{activeTemplate.name}" (Indépendant)
                        </div>
                        <div className="setup-option-desc">
                          Enregistre ces coordonnées exclusivement sur ce modèle bancaire. Vos autres chéquiers restent strictement indépendants les uns des autres.
                        </div>
                      </div>
                      {saveMode === "template-only" && (
                        <span className="active-session-pill" style={{ marginLeft: "8px" }}>
                          <Check size={11} strokeWidth={3} /> Sélectionné
                        </span>
                      )}
                    </div>

                    {/* Option C : Propager les champs */}
                    <div
                      className={`setup-option-box ${saveMode === "all-templates" ? "selected" : ""}`}
                      onClick={() => setSaveMode("all-templates")}
                    >
                      <div className="setup-option-icon">
                        <Layers size={16} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div className="setup-option-title">
                          Harmoniser la position des champs sur TOUS les modèles bancaires installés ({templates.length})
                        </div>
                        <div className="setup-option-desc">
                          Met à jour les coordonnées relatives de texte (bénéficiaire, montants, lieu, date) sur l'ensemble de vos formules bancaires.
                        </div>
                      </div>
                      {saveMode === "all-templates" && (
                        <span className="active-session-pill" style={{ marginLeft: "8px" }}>
                          <Check size={11} strokeWidth={3} /> Sélectionné
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer harmonisé */}
          <div className="setup-actions-footer">
            <div>
              {currentStep > 1 && (
                <button
                  type="button"
                  className="btn-action-card"
                  onClick={() => setCurrentStep((prev) => Math.max(1, prev - 1))}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "7px 14px", fontSize: "12px" }}
                >
                  <ArrowLeft size={13} />
                  <span>Précédent</span>
                </button>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {currentStep < 3 ? (
                <button
                  type="button"
                  className="btn-action-luxury-green"
                  onClick={() => setCurrentStep((prev) => Math.min(3, prev + 1))}
                  style={{ display: "inline-flex", alignItems: "center", gap: "7px", padding: "8px 20px", fontSize: "12.5px" }}
                >
                  <span>Continuer</span>
                  <ArrowRight size={14} />
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-action-luxury-green btn-print-main"
                  onClick={handleSaveAndFinish}
                  style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "9px 24px", fontSize: "13px" }}
                >
                  <Check size={16} strokeWidth={3} />
                  <span>Valider et Enregistrer</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Assistant de configuration d'impression (PrintModal) pour le test de remplissage */}
      {isPrintConfigModalOpen && activeTemplate && (
        <PrintModal
          isOpen={isPrintConfigModalOpen}
          onClose={() => setIsPrintConfigModalOpen(false)}
          settings={workingSettings}
          onChangeSettings={(updated) => setWorkingSettings(updated)}
          currentTemplate={{
            ...activeTemplate,
            positions: workingPositions
          }}
          amount={"125 450,00"}
          beneficiary={testData.beneficiary}
          date={testData.date}
          isCrossed={false}
          showChequeNumber={Boolean(workingPositions.chequeNumber)}
          chequeNumber={testData.chequeNumber}
          formattedNumeric={testData.numeric}
          presets={presetsList}
          activePresetId={selectedPresetId}
          onSelectPreset={(p) => {
            setSelectedPresetId(p.id);
            setWorkingSettings({
              paperFormat: p.paperFormat,
              placement: p.placement,
              offsetX: p.offsetX,
              offsetY: p.offsetY,
              rotation: p.rotation,
              showBorderGuide: p.showBorderGuide
            });
          }}
          onConfirmPrint={() => {
            setIsPrintConfigModalOpen(false);
            handleTriggerTestFilling();
          }}
        />
      )}
    </div>
  );
};
