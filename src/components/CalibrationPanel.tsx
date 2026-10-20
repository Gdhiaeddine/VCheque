import React, { useState } from "react";
import { SlidersHorizontal, Crosshair, Printer, RotateCcw } from "lucide-react";
import type { BankTemplate, FieldKey } from "../types";

interface CalibrationPanelProps {
  currentTemplate: BankTemplate;
  activeField: FieldKey;
  onSelectField: (key: FieldKey) => void;
  onUpdatePosition: (key: FieldKey, patch: { x?: number; y?: number; size?: number }) => void;
  onResetPositions: () => void;
  showGuides: boolean;
  onToggleGuides: () => void;
  scale: number;
  onChangeScale: (s: number) => void;
  onPrintTestPage: () => void;
}

const fieldNamesMap: Record<FieldKey, string> = {
  beneficiary: "Bénéficiaire",
  words: "Montant en lettres",
  wordsSecondLine: "Montant lettres (L2)",
  numeric: "Montant chiffré",
  place: "Lieu (Fait à)",
  date: "Date (Le)",
  chequeNumber: "N° de chèque"
};

export const CalibrationPanel: React.FC<CalibrationPanelProps> = ({
  currentTemplate,
  activeField,
  onSelectField,
  onUpdatePosition,
  onResetPositions,
  showGuides,
  onToggleGuides,
  scale,
  onChangeScale,
  onPrintTestPage
}) => {
  const [unit, setUnit] = useState<"mm" | "px">("mm");

  const currentPos = currentTemplate.positions[activeField];
  const factor = unit === "px" ? 3.78 : 1; // 1mm ~= 3.78px at 96 DPI

  const xVal = Number((currentPos.x * factor).toFixed(1));
  const yVal = Number((currentPos.y * factor).toFixed(1));

  const handleStep = (axis: "x" | "y", delta: number) => {
    const deltaMm = unit === "px" ? delta / 3.78 : delta;
    if (axis === "x") {
      const nextX = Math.max(0, Math.min(currentTemplate.width, Number((currentPos.x + deltaMm).toFixed(1))));
      onUpdatePosition(activeField, { x: nextX });
    } else {
      const nextY = Math.max(0, Math.min(currentTemplate.height, Number((currentPos.y + deltaMm).toFixed(1))));
      onUpdatePosition(activeField, { y: nextY });
    }
  };

  return (
    <div className="card right-panel-card calibration-card">
      <div className="card-header">
        <div className="header-title-group">
          <SlidersHorizontal size={16} className="gold-icon" />
          <h2 className="card-title">Calibrage d'impression</h2>
        </div>
        {/* Unité de mesure mm / px */}
        <div className="unit-toggle">
          <button
            type="button"
            className={`unit-btn ${unit === "mm" ? "active" : ""}`}
            onClick={() => setUnit("mm")}
          >
            mm
          </button>
          <button
            type="button"
            className={`unit-btn ${unit === "px" ? "active" : ""}`}
            onClick={() => setUnit("px")}
          >
            px
          </button>
        </div>
      </div>

      <div className="calibration-body">
        {/* Champ à régler */}
        <div className="form-group">
          <label className="form-label">Champ sélectionné</label>
          <select
            className="form-select"
            value={activeField}
            onChange={(e) => onSelectField(e.target.value as FieldKey)}
          >
            {(Object.keys(fieldNamesMap) as FieldKey[]).map((key) => (
              <option key={key} value={key}>
                {fieldNamesMap[key]}
              </option>
            ))}
          </select>
        </div>

        {/* Coordonnées : Position Y au-dessus de Position X */}
        <div className="coords-stacked">
          <div className="coord-group">
            <span className="coord-label">Position Y ({unit})</span>
            <div className="stepper-box">
              <button type="button" className="stepper-btn" onClick={() => handleStep("y", -0.5)}>-</button>
              <input
                type="number"
                step="0.5"
                className="coord-input"
                value={yVal}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  const inMm = unit === "px" ? val / 3.78 : val;
                  onUpdatePosition(activeField, { y: inMm });
                }}
              />
              <button type="button" className="stepper-btn" onClick={() => handleStep("y", 0.5)}>+</button>
            </div>
          </div>

          <div className="coord-group">
            <span className="coord-label">Position X ({unit})</span>
            <div className="stepper-box">
              <button type="button" className="stepper-btn" onClick={() => handleStep("x", -0.5)}>-</button>
              <input
                type="number"
                step="0.5"
                className="coord-input"
                value={xVal}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  const inMm = unit === "px" ? val / 3.78 : val;
                  onUpdatePosition(activeField, { x: inMm });
                }}
              />
              <button type="button" className="stepper-btn" onClick={() => handleStep("x", 0.5)}>+</button>
            </div>
          </div>
        </div>

        {/* Taille du texte */}
        <div className="form-group">
          <div className="label-with-value">
            <span className="form-label">Taille du texte</span>
            <span className="param-value">{currentPos.size.toFixed(1)} mm</span>
          </div>
          <input
            type="range"
            min="2.2"
            max="6.0"
            step="0.1"
            className="gold-range-slider"
            value={currentPos.size}
            onChange={(e) => onUpdatePosition(activeField, { size: Number(e.target.value) })}
          />
        </div>

        {/* Échelle de l'aperçu */}
        <div className="form-group">
          <div className="label-with-value">
            <span className="form-label">Échelle de l'aperçu</span>
            <span className="param-value">{scale}%</span>
          </div>
          <input
            type="range"
            min="70"
            max="130"
            step="5"
            className="gold-range-slider"
            value={scale}
            onChange={(e) => onChangeScale(Number(e.target.value))}
          />
        </div>

        {/* Boutons d'action de calibrage */}
        <div className="calib-buttons-stack">
          <button
            type="button"
            className={`btn-secondary-outline full-width ${showGuides ? "active-guide" : ""}`}
            onClick={onToggleGuides}
          >
            <Crosshair size={15} />
            <span>{showGuides ? "Masquer les repères" : "Aperçu de la position"}</span>
          </button>

          <button
            type="button"
            className="btn-secondary-outline full-width"
            onClick={onPrintTestPage}
            title="Imprimer une page de test de calibrage"
          >
            <Printer size={15} />
            <span>Imprimer une page de test</span>
          </button>

          <button
            type="button"
            className="btn-ghost-sm"
            onClick={onResetPositions}
          >
            <RotateCcw size={13} />
            <span>Réinitialiser les coordonnées</span>
          </button>
        </div>
      </div>
    </div>
  );
};
