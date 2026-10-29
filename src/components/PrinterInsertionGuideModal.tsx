import React from "react";
import {
  X,
  Compass,
  Check,
  ChevronRight,
  ArrowDown,
  ArrowUp,
  RotateCw,
  Printer,
  Sparkles,
  Info
} from "lucide-react";
import {
  RECOMMENDED_INSERTION_PRESETS,
  type InsertionGuidePreset
} from "../services/printerPresets";
import type { PrintSettings } from "../types";

export interface PrinterInsertionGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPreset: (preset: InsertionGuidePreset) => void;
  currentSettings?: PrintSettings;
  onSkipToCustom?: () => void;
  isWizardMode?: boolean;
}

/**
 * Schéma vectoriel SVG de l'insertion physique du chèque dans la feuille A4
 */
const InsertionVisualSvg: React.FC<{ preset: InsertionGuidePreset; isSelected?: boolean }> = ({
  preset,
  isSelected
}) => {
  // Proportions d'une feuille A4 (210 x 297 mm) réduites à un cadre 110 x 155 px
  const a4W = 110;
  const a4H = 155;

  // Dimensions réduites du chèque (175 x 80 mm) à l'échelle A4
  // 175mm / 210mm * 110 = ~91.6px
  // 80mm / 297mm * 155 = ~41.7px
  const chkW = 92;
  const chkH = 42;

  // Calcul du rendu selon placement & rotation (90° ou 270°)
  // Si rotation 90° ou 270°, le chèque apparaît vertical dans la feuille :
  // largeur visuelle = chkH (~42px), hauteur visuelle = chkW (~92px)
  let chkLeft = 0;
  let chkTop = 0;
  let isRotated = preset.rotation === 90 || preset.rotation === 270;
  let renderW = isRotated ? chkH : chkW;
  let renderH = isRotated ? chkW : chkH;

  switch (preset.placement) {
    case "top-center":
      chkLeft = (a4W - renderW) / 2;
      chkTop = 6;
      break;
    case "bottom-center":
      chkLeft = (a4W - renderW) / 2;
      chkTop = a4H - renderH - 6;
      break;
    case "top-left":
      chkLeft = 6;
      chkTop = 6;
      break;
    default:
      chkLeft = (a4W - renderW) / 2;
      chkTop = (a4H - renderH) / 2;
  }

  return (
    <svg
      width={a4W}
      height={a4H}
      viewBox={`0 0 ${a4W} ${a4H}`}
      className="insertion-guide-svg"
      style={{
        display: "block",
        margin: "0 auto",
        overflow: "visible",
        filter: isSelected
          ? "drop-shadow(0 4px 12px rgba(172, 137, 70, 0.35))"
          : "drop-shadow(0 2px 6px rgba(0,0,0,0.08))"
      }}
    >
      <defs>
        {/* Dégradé de la feuille A4 */}
        <linearGradient id={`a4-grad-${preset.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#FAF7F0" />
        </linearGradient>

        {/* Dégradé du chèque bancaire algérien */}
        <linearGradient id={`chk-grad-${preset.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#EAF3EE" />
          <stop offset="100%" stopColor="#D9EADF" />
        </linearGradient>

        {/* Motif filigrane guilloche discret */}
        <pattern id={`guilloche-${preset.id}`} width="8" height="8" patternUnits="userSpaceOnUse">
          <path d="M 0 4 Q 4 0 8 4 Q 4 8 0 4" fill="none" stroke="rgba(23, 72, 58, 0.12)" strokeWidth="0.5" />
        </pattern>
      </defs>

      {/* 1. Contour Feuille A4 */}
      <rect
        x="0"
        y="0"
        width={a4W}
        height={a4H}
        rx="4"
        fill={`url(#a4-grad-${preset.id})`}
        stroke={isSelected ? "var(--gold-primary, #AC8946)" : "var(--border-color, #E5DDCE)"}
        strokeWidth={isSelected ? "1.8" : "1.2"}
      />

      {/* Lignes repères de découpe / marges A4 discrètes */}
      <line x1="6" y1="0" x2="6" y2="4" stroke="#D8C6A5" strokeWidth="0.8" />
      <line x1={a4W - 6} y1="0" x2={a4W - 6} y2="4" stroke="#D8C6A5" strokeWidth="0.8" />
      <line x1="6" y1={a4H} x2="6" y2={a4H - 4} stroke="#D8C6A5" strokeWidth="0.8" />
      <line x1={a4W - 6} y1={a4H} x2={a4W - 6} y2={a4H - 4} stroke="#D8C6A5" strokeWidth="0.8" />

      {/* 2. Guides de bac d'imprimante (Guides latéraux bleus/dorés) */}
      {preset.placement === "top-center" && (
        <g opacity="0.85">
          {/* Guides latéraux resserrés */}
          <rect x={chkLeft - 4} y="1" width="3" height="14" rx="1.5" fill="var(--gold-dark, #89672F)" />
          <rect x={chkLeft + renderW + 1} y="1" width="3" height="14" rx="1.5" fill="var(--gold-dark, #89672F)" />
          {/* Flèche d'insertion vers le bas */}
          <path
            d={`M ${a4W / 2} -4 L ${a4W / 2} 4 M ${a4W / 2 - 2.5} 1.5 L ${a4W / 2} 4 L ${a4W / 2 + 2.5} 1.5`}
            fill="none"
            stroke="var(--gold-primary, #AC8946)"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </g>
      )}

      {preset.placement === "bottom-center" && (
        <g opacity="0.85">
          {/* Guides latéraux bas */}
          <rect x={chkLeft - 4} y={a4H - 15} width="3" height="14" rx="1.5" fill="var(--gold-dark, #89672F)" />
          <rect x={chkLeft + renderW + 1} y={a4H - 15} width="3" height="14" rx="1.5" fill="var(--gold-dark, #89672F)" />
          {/* Flèche d'insertion vers le haut */}
          <path
            d={`M ${a4W / 2} ${a4H + 4} L ${a4W / 2} ${a4H - 4} M ${a4W / 2 - 2.5} ${a4H - 1.5} L ${a4W / 2} ${a4H - 4} L ${a4W / 2 + 2.5} ${a4H - 1.5}`}
            fill="none"
            stroke="var(--gold-primary, #AC8946)"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </g>
      )}

      {preset.placement === "top-left" && (
        <g opacity="0.85">
          {/* Guide fixe contre le bord gauche */}
          <rect x="1" y="1" width="4" height="24" rx="1" fill="var(--sidebar-emerald, #17483A)" />
          {/* Flèche d'insertion */}
          <path
            d={`M ${chkLeft + renderW / 2} -4 L ${chkLeft + renderW / 2} 4 M ${chkLeft + renderW / 2 - 2.5} 1.5 L ${chkLeft + renderW / 2} 4 L ${chkLeft + renderW / 2 + 2.5} 1.5`}
            fill="none"
            stroke="var(--gold-primary, #AC8946)"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </g>
      )}

      {/* 3. Chèque miniature représenté dans la feuille */}
      <g transform={`translate(${chkLeft}, ${chkTop})`}>
        {/* Fond du chèque */}
        <rect
          x="0"
          y="0"
          width={renderW}
          height={renderH}
          rx="2.5"
          fill={`url(#chk-grad-${preset.id})`}
          stroke={isSelected ? "#17483A" : "#3E7959"}
          strokeWidth="1"
        />
        {/* Motif décoratif */}
        <rect
          x="1"
          y="1"
          width={renderW - 2}
          height={renderH - 2}
          rx="2"
          fill={`url(#guilloche-${preset.id})`}
        />

        {/* Entête vert VCheque & lignes simulées */}
        {preset.rotation === 90 ? (
          <g>
            {/* Rotation 90° : tête vers la droite */}
            <rect x="2" y="2" width="5" height={renderH - 4} rx="1" fill="#17483A" opacity="0.8" />
            <line x1="12" y1="8" x2={renderW - 6} y2="8" stroke="#3E7959" strokeWidth="0.9" opacity="0.6" />
            <line x1="12" y1="16" x2={renderW - 10} y2="16" stroke="#3E7959" strokeWidth="0.7" opacity="0.5" />
            <line x1="12" y1="24" x2={renderW - 6} y2="24" stroke="#3E7959" strokeWidth="0.7" opacity="0.5" />
            {/* Montant chiffré # ... # */}
            <rect x="12" y={renderH - 20} width={renderW - 20} height="12" rx="1.5" fill="#FFFFFF" stroke="#AC8946" strokeWidth="0.7" />
          </g>
        ) : (
          <g>
            {/* Rotation 270° : tête vers la gauche */}
            <rect x={renderW - 7} y="2" width="5" height={renderH - 4} rx="1" fill="#17483A" opacity="0.8" />
            <line x1="6" y1="8" x2={renderW - 12} y2="8" stroke="#3E7959" strokeWidth="0.9" opacity="0.6" />
            <line x1="6" y1="16" x2={renderW - 12} y2="16" stroke="#3E7959" strokeWidth="0.7" opacity="0.5" />
            <line x1="6" y1="24" x2={renderW - 16} y2="24" stroke="#3E7959" strokeWidth="0.7" opacity="0.5" />
            {/* Montant chiffré # ... # */}
            <rect x="6" y={renderH - 20} width={renderW - 20} height="12" rx="1.5" fill="#FFFFFF" stroke="#AC8946" strokeWidth="0.7" />
          </g>
        )}

        {/* Badge d'angle avec la rotation (90° / 270°) */}
        <g transform={`translate(${renderW / 2 - 14}, ${renderH / 2 - 8})`}>
          <rect x="0" y="0" width="28" height="16" rx="3" fill="#0B3028" opacity="0.92" />
          <text
            x="14"
            y="11.5"
            textAnchor="middle"
            fill="#E1C989"
            fontSize="8"
            fontWeight="bold"
            fontFamily="monospace"
          >
            {preset.rotation}°
          </text>
        </g>
      </g>

      {/* Label A4 dans le coin inférieur droit */}
      <text
        x={a4W - 6}
        y={a4H - 5}
        textAnchor="end"
        fill="#999488"
        fontSize="7.5"
        fontWeight="bold"
        fontFamily="sans-serif"
      >
        A4
      </text>
    </svg>
  );
};

export const PrinterInsertionGuideModal: React.FC<PrinterInsertionGuideModalProps> = ({
  isOpen,
  onClose,
  onSelectPreset,
  currentSettings,
  onSkipToCustom,
  isWizardMode = false
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="print-modal-overlay"
      style={{ zIndex: 12000 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="print-modal-content"
        style={{
          maxWidth: "880px",
          width: "95vw",
          borderRadius: "14px",
          overflow: "hidden",
          background: "var(--bg-panel, #FFFDFA)",
          boxShadow: "0 20px 60px rgba(11, 48, 40, 0.25)"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête Prestige Vert Émeraude & Or */}
        <div
          style={{
            background: "linear-gradient(135deg, #0B3028 0%, #17483A 100%)",
            color: "var(--sidebar-text, #F6F2E8)",
            padding: "18px 24px",
            borderBottom: "1px solid rgba(197, 161, 90, 0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            position: "relative"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "10px",
                background: "rgba(197, 161, 90, 0.2)",
                border: "1px solid rgba(225, 201, 137, 0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--sidebar-gold-light, #E1C989)"
              }}
            >
              <Compass size={22} />
            </div>
            <div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "10.5px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--sidebar-gold-light, #E1C989)",
                  marginBottom: "2px"
                }}
              >
                <span>Guide d'Alimentation &amp; Bacs d'Impression</span>
                <span style={{ opacity: 0.5 }}>•</span>
                <span>4 Configurations Recommandées</span>
              </div>
              <h2
                style={{
                  margin: 0,
                  fontSize: "17px",
                  fontWeight: 700,
                  color: "#FFFFFF",
                  fontFamily: "var(--font-sans)"
                }}
              >
                Comment insérez-vous votre chèque dans l'imprimante ?
              </h2>
            </div>
          </div>

          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Fermer"
            style={{
              background: "rgba(255, 255, 255, 0.08)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              color: "#F6F2E8",
              borderRadius: "8px",
              padding: "6px"
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Corps du Guide : 4 Cartes Interactives */}
        <div style={{ padding: "20px 24px", maxHeight: "calc(85vh - 140px)", overflowY: "auto" }}>
          <p
            style={{
              margin: "0 0 16px",
              fontSize: "13px",
              lineHeight: 1.5,
              color: "var(--text-secondary, #777368)"
            }}
          >
            Sélectionnez la configuration physique correspondant à votre modèle d'imprimante pour appliquer automatiquement
            la rotation et l'alignement exacts. Vous pourrez toujours ajuster les millimètres au besoin.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(195px, 1fr))",
              gap: "14px",
              marginBottom: "20px"
            }}
          >
            {RECOMMENDED_INSERTION_PRESETS.map((preset, index) => {
              const isSelected =
                currentSettings &&
                currentSettings.placement === preset.placement &&
                currentSettings.rotation === preset.rotation;

              return (
                <div
                  key={preset.id}
                  onClick={() => onSelectPreset(preset)}
                  style={{
                    background: isSelected ? "var(--gold-light, #FAF6ED)" : "#FFFFFF",
                    border: isSelected
                      ? "2px solid var(--gold-primary, #AC8946)"
                      : "1px solid var(--border-color, #E5DDCE)",
                    borderRadius: "12px",
                    padding: "14px",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    cursor: "pointer",
                    position: "relative",
                    transition: "all 180ms ease",
                    boxShadow: isSelected
                      ? "0 6px 18px rgba(172, 137, 70, 0.22)"
                      : "0 2px 8px rgba(0,0,0,0.03)"
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.borderColor = "var(--gold-border, #D8C6A5)";
                      e.currentTarget.style.transform = "translateY(-2px)";
                      e.currentTarget.style.boxShadow = "0 6px 16px rgba(0,0,0,0.06)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.borderColor = "var(--border-color, #E5DDCE)";
                      e.currentTarget.style.transform = "none";
                      e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.03)";
                    }
                  }}
                >
                  {/* Badge en haut à droite */}
                  {preset.badge && (
                    <div
                      style={{
                        position: "absolute",
                        top: "10px",
                        right: "10px",
                        fontSize: "9.5px",
                        fontWeight: 700,
                        padding: "2px 7px",
                        borderRadius: "9999px",
                        background:
                          preset.badge === "Le plus populaire"
                            ? "rgba(197, 161, 90, 0.2)"
                            : "rgba(23, 72, 58, 0.12)",
                        color:
                          preset.badge === "Le plus populaire"
                            ? "var(--gold-dark, #89672F)"
                            : "var(--sidebar-emerald, #17483A)",
                        border: "1px solid rgba(172, 137, 70, 0.3)"
                      }}
                    >
                      {preset.badge}
                    </div>
                  )}

                  {/* Numéro & Titre */}
                  <div style={{ marginBottom: "10px" }}>
                    <div
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        color: "var(--gold-dark, #89672F)",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em"
                      }}
                    >
                      Option 0{index + 1}
                    </div>
                    <h3
                      style={{
                        margin: "2px 0 0",
                        fontSize: "14.5px",
                        fontWeight: 700,
                        color: "var(--text-primary, #24241F)"
                      }}
                    >
                      {preset.name}
                    </h3>
                  </div>

                  {/* Schéma Visuel SVG */}
                  <div style={{ padding: "8px 0 14px", display: "flex", justifyContent: "center" }}>
                    <InsertionVisualSvg preset={preset} isSelected={isSelected} />
                  </div>

                  {/* Détails du Bac & Recommandations */}
                  <div style={{ marginTop: "auto" }}>
                    <div
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        color: "var(--sidebar-emerald, #17483A)",
                        marginBottom: "4px"
                      }}
                    >
                      {preset.feederType}
                    </div>
                    <div
                      style={{
                        fontSize: "10.5px",
                        color: "var(--text-secondary, #777368)",
                        lineHeight: 1.35,
                        marginBottom: "12px",
                        minHeight: "28px"
                      }}
                    >
                      <strong>Idéal pour :</strong> {preset.recommendedFor}
                    </div>

                    {/* Bouton de sélection */}
                    <button
                      type="button"
                      className="btn-action-card"
                      style={{
                        width: "100%",
                        justifyContent: "center",
                        padding: "7px 10px",
                        fontSize: "12px",
                        fontWeight: 700,
                        background: isSelected ? "var(--sidebar-bg, #0B3028)" : "#FFFFFF",
                        color: isSelected ? "#FFFFFF" : "var(--text-primary, #24241F)",
                        border: isSelected
                          ? "1px solid var(--sidebar-bg, #0B3028)"
                          : "1px solid var(--border-color, #E5DDCE)"
                      }}
                    >
                      {isSelected ? (
                        <>
                          <Check size={14} style={{ color: "var(--sidebar-gold-light, #E1C989)" }} />
                          <span>Actuellement sélectionné</span>
                        </>
                      ) : (
                        <>
                          <span>Choisir cette position</span>
                          <ChevronRight size={13} />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bandeau d'aide informatif */}
          <div
            style={{
              background: "rgba(197, 161, 90, 0.1)",
              border: "1px solid rgba(197, 161, 90, 0.28)",
              borderRadius: "8px",
              padding: "10px 14px",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              fontSize: "12px",
              color: "var(--text-primary, #24241F)"
            }}
          >
            <Info size={16} style={{ color: "var(--gold-dark, #89672F)", flexShrink: 0 }} />
            <div style={{ lineHeight: 1.45 }}>
              <strong>Astuce impression chèque :</strong> Si le texte s'imprime à l'envers lors de votre premier essai,
              basculez simplement entre <strong>90°</strong> et <strong>270°</strong> (inversion du sens de passage).
            </div>
          </div>
        </div>

        {/* Pied d'Actions Modal */}
        <div
          style={{
            padding: "14px 24px",
            background: "#F6F2E9",
            borderTop: "1px solid var(--border-color, #E5DDCE)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "10px"
          }}
        >
          {isWizardMode ? (
            <>
              <button
                type="button"
                className="btn-action-card"
                onClick={onSkipToCustom}
                style={{
                  padding: "8px 16px",
                  fontSize: "12.5px",
                  fontWeight: 600,
                  color: "var(--text-secondary, #777368)"
                }}
              >
                <span>Passer et personnaliser manuellement</span>
              </button>

              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "11.5px", color: "var(--text-muted, #999488)" }}>
                  Étape suivante : Calibrage précis
                </span>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={onSkipToCustom}
                  style={{
                    padding: "8px 18px",
                    fontSize: "12.5px",
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px"
                  }}
                >
                  <span>Continuer vers le calibrage</span>
                  <ChevronRight size={15} />
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: "11.5px", color: "var(--text-secondary, #777368)" }}>
                Cliquez sur l'une des 4 cartes ci-dessus pour appliquer la position directement.
              </div>
              <button
                type="button"
                className="btn-action-card"
                onClick={onClose}
                style={{
                  padding: "8px 18px",
                  fontSize: "12.5px",
                  fontWeight: 600
                }}
              >
                <span>Fermer le guide</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
