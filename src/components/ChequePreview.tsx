import React, { type CSSProperties, type PointerEvent as ReactPointerEvent, useRef } from "react";
import { FileText, ZoomIn, ZoomOut, Move, Eye } from "lucide-react";
import type { BankTemplate, FieldKey } from "../types";
import { splitWordsByLimit } from "../moneyToWords";

interface ChequePreviewProps {
  currentTemplate: BankTemplate;
  amount: string;
  words: string;
  beneficiary: string;
  place: string;
  date: string;
  isCrossed?: boolean;
  crossedWithText?: boolean;
  formattedNumeric?: string;
  activeField: FieldKey;
  onSelectField: (key: FieldKey) => void;
  onUpdateFieldPosition: (key: FieldKey, patch: { x?: number; y?: number }) => void;
  showGuides: boolean;
  scale: number;
  onChangeScale: (updater: (s: number) => number) => void;
  backgroundScan?: string | null;
}

export const ChequePreview: React.FC<ChequePreviewProps> = ({
  currentTemplate,
  amount,
  words,
  beneficiary,
  place,
  date,
  isCrossed = true,
  crossedWithText = true,
  formattedNumeric,
  activeField,
  onSelectField,
  onUpdateFieldPosition,
  showGuides,
  scale,
  onChangeScale,
  backgroundScan
}) => {
  const paperRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ clientX: number; clientY: number; initX: number; initY: number } | null>(null);
  const [draggingField, setDraggingField] = React.useState<FieldKey | null>(null);

  // Formatted date for display
  const formattedDate = React.useMemo(() => {
    if (!date) return "";
    const parts = date.split("-");
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return date;
  }, [date]);

  // Formatted numeric amount
  const formattedAmount = formattedNumeric || React.useMemo(() => {
    const num = Number(amount.replace(/\s/g, "").replace(",", "."));
    if (!amount.trim() || !Number.isFinite(num) || num < 0) return "—";
    return num.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " #";
  }, [amount]);

  // Split words if long based on template's max line length
  const [wordsL1, wordsL2] = React.useMemo(() => {
    const limit = currentTemplate.wordsMaxLineLength || 55;
    return splitWordsByLimit(words, limit);
  }, [words, currentTemplate.wordsMaxLineLength]);

  // Pointer drag handling
  const handlePointerDown = (key: FieldKey, e: ReactPointerEvent) => {
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // fallback
    }
    onSelectField(key);
    setDraggingField(key);
    dragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      initX: currentTemplate.positions[key].x,
      initY: currentTemplate.positions[key].y
    };
  };

  const handlePointerMove = (e: ReactPointerEvent) => {
    if (!draggingField || !dragStartRef.current || !paperRef.current) return;
    const rect = paperRef.current.getBoundingClientRect();
    const mmPerPixelX = currentTemplate.width / rect.width;
    const mmPerPixelY = currentTemplate.height / rect.height;

    const deltaX = (e.clientX - dragStartRef.current.clientX) * mmPerPixelX;
    const deltaY = (e.clientY - dragStartRef.current.clientY) * mmPerPixelY;

    const newX = Math.max(0, Math.min(currentTemplate.width, Number((dragStartRef.current.initX + deltaX).toFixed(1))));
    const newY = Math.max(0, Math.min(currentTemplate.height, Number((dragStartRef.current.initY + deltaY).toFixed(1))));

    onUpdateFieldPosition(draggingField, { x: newX, y: newY });
  };

  const handlePointerUp = (e: ReactPointerEvent) => {
    if (draggingField) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // fallback
      }
      setDraggingField(null);
      dragStartRef.current = null;
    }
  };

  // Met à jour dynamiquement la conversion millimètre -> pixel sur le canevas du chèque
  // pour que la taille du texte s'adapte strictement au chèque rendu, et non à la taille de la fenêtre
  React.useEffect(() => {
    const el = paperRef.current;
    if (!el) return;

    const updateRatio = () => {
      if (el && currentTemplate.width > 0) {
        const clientW = el.clientWidth;
        if (clientW > 0) {
          const mmToPx = clientW / currentTemplate.width;
          el.style.setProperty("--mm-to-px", `${mmToPx.toFixed(4)}px`);
        }
      }
    };

    updateRatio();
    const ro = new ResizeObserver(updateRatio);
    ro.observe(el);
    return () => ro.disconnect();
  }, [currentTemplate.width]);

  const getStyle = (key: FieldKey): CSSProperties => {
    const pos = currentTemplate.positions?.[key];
    if (!pos) return { display: "none" };
    const isRight = pos.align === "right";
    const mmToCqw = (100 / currentTemplate.width).toFixed(4);
    return {
      left: isRight ? undefined : `${(pos.x / currentTemplate.width) * 100}%`,
      right: isRight ? `${((currentTemplate.width - pos.x) / currentTemplate.width) * 100}%` : undefined,
      top: `${(pos.y / currentTemplate.height) * 100}%`,
      fontSize: `calc(${pos.size} * var(--mm-to-px, ${mmToCqw}cqw))`,
      textAlign: pos.align || "left",
      maxWidth: pos.maxWidth ? `${(pos.maxWidth / currentTemplate.width) * 100}%` : undefined
    };
  };

  const activeBg = backgroundScan
    ? `url(${backgroundScan})`
    : currentTemplate.backgroundImage
    ? `url(${currentTemplate.backgroundImage})`
    : undefined;

  return (
    <div className="card cheque-preview-card">
      <div className="card-header">
        <div className="header-title-group">
          <FileText size={18} className="gold-icon" />
          <h2 className="card-title">Aperçu du chèque</h2>
          <span className="template-badge-pill">{currentTemplate.name}</span>
        </div>

        <div className="zoom-toolbar">
          <button
            type="button"
            className="zoom-tool-btn"
            onClick={() => onChangeScale((s) => Math.max(70, s - 10))}
            title="Dézoomer"
          >
            <ZoomOut size={14} />
          </button>
          <span className="zoom-value">{scale}%</span>
          <button
            type="button"
            className="zoom-tool-btn"
            onClick={() => onChangeScale((s) => Math.min(140, s + 10))}
            title="Zoomer"
          >
            <ZoomIn size={14} />
          </button>
        </div>
      </div>

      <div className="preview-canvas-stage">
        <div
          ref={paperRef}
          className="cheque-paper-canvas"
          style={{
            aspectRatio: `${currentTemplate.width} / ${currentTemplate.height}`,
            transform: `scale(${scale / 100})`,
            backgroundImage: activeBg
          }}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {/* Default specimen layout if no background image or scan loaded */}
          {!activeBg && (
            <div className="specimen-watermark-layer">
              <div className="specimen-header-row">
                <span className="specimen-bank-badge">{currentTemplate.shortName}</span>
                <span className="specimen-title">{currentTemplate.name}</span>
                <span className="specimen-currency">DZD</span>
              </div>
              <div className="specimen-line line-1" />
              <span className="specimen-label-benef">Payez à l'ordre de</span>
              <div className="specimen-line line-2" />
              <span className="specimen-label-words">La somme de</span>
              <div className="specimen-line line-3" />
              <div className="specimen-line line-4" />
              <span className="specimen-label-date">Lieu et date</span>
              <div className="specimen-footer-note">SPÉCIMEN FICTIF — NON VALABLE POUR PAIEMENT</div>
            </div>
          )}

          {/* Alignment Crosshair Guides */}
          {showGuides && (
            <div className="preview-guides-layer">
              <div className="guide-vert" />
              <div className="guide-horiz" />
            </div>
          )}

          {/* Barres Chèque barré (//) avec ou sans texte "NON ENDOSSABLE" */}
          {isCrossed && (
            <div
              className="cheque-crossed-indicator"
              title={crossedWithText ? "Chèque barré — Non endossable" : "Chèque barré simple (sans texte)"}
            >
              <svg className="crossed-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
                <line x1="0" y1="44" x2="44" y2="0" stroke="#1e1e18" strokeWidth="2.8" strokeLinecap="square" />
                <line x1="0" y1="74" x2="74" y2="0" stroke="#1e1e18" strokeWidth="2.8" strokeLinecap="square" />
                {crossedWithText && (
                  <text
                    x="29.5"
                    y="29.5"
                    transform="rotate(-45 29.5 29.5)"
                    fontSize="6.2"
                    fontWeight="800"
                    fill="#1e1e18"
                    letterSpacing="0.6"
                    textAnchor="middle"
                    dy="-1.2"
                  >
                    NON ENDOSSABLE
                  </text>
                )}
              </svg>
            </div>
          )}

          {/* 1. Bénéficiaire */}
          <div
            className={`positioned-field ${activeField === "beneficiary" ? "selected" : ""}`}
            style={getStyle("beneficiary")}
            onPointerDown={(e) => handlePointerDown("beneficiary", e)}
            title="Bénéficiaire (glisser pour ajuster)"
          >
            <span className="field-text">{beneficiary || "Bénéficiaire"}</span>
            {activeField === "beneficiary" && (
              <span className="field-coord-bubble">
                <Move size={10} /> {currentTemplate.positions.beneficiary.x.toFixed(1)}, {currentTemplate.positions.beneficiary.y.toFixed(1)} mm
              </span>
            )}
          </div>

          {/* 2. Montant en lettres (Ligne 1) */}
          <div
            className={`positioned-field ${activeField === "words" ? "selected" : ""}`}
            style={getStyle("words")}
            onPointerDown={(e) => handlePointerDown("words", e)}
            title="Montant en lettres (L1)"
          >
            <span className="field-text">{wordsL1}</span>
            {activeField === "words" && (
              <span className="field-coord-bubble">
                <Move size={10} /> {currentTemplate.positions.words.x.toFixed(1)}, {currentTemplate.positions.words.y.toFixed(1)} mm
              </span>
            )}
          </div>

          {/* Montant en lettres (Ligne 2 si montant long) */}
          {wordsL2 && (
            <div
              className={`positioned-field ${activeField === "wordsSecondLine" ? "selected" : ""}`}
              style={getStyle("wordsSecondLine")}
              onPointerDown={(e) => handlePointerDown("wordsSecondLine", e)}
              title="Montant en lettres (L2)"
            >
              <span className="field-text">{wordsL2}</span>
              {activeField === "wordsSecondLine" && (
                <span className="field-coord-bubble">
                  <Move size={10} /> {currentTemplate.positions.wordsSecondLine.x.toFixed(1)}, {currentTemplate.positions.wordsSecondLine.y.toFixed(1)} mm
                </span>
              )}
            </div>
          )}

          {/* 3. Montant chiffré */}
          <div
            className={`positioned-field numeric ${activeField === "numeric" ? "selected" : ""}`}
            style={getStyle("numeric")}
            onPointerDown={(e) => handlePointerDown("numeric", e)}
            title="Montant en chiffres"
          >
            <span className="field-text">{formattedAmount}</span>
            {activeField === "numeric" && (
              <span className="field-coord-bubble">
                <Move size={10} /> {currentTemplate.positions.numeric.x.toFixed(1)}, {currentTemplate.positions.numeric.y.toFixed(1)} mm
              </span>
            )}
          </div>

          {/* 4. Lieu (Fait à) */}
          <div
            className={`positioned-field ${activeField === "place" ? "selected" : ""}`}
            style={getStyle("place")}
            onPointerDown={(e) => handlePointerDown("place", e)}
            title="Lieu (glisser pour ajuster)"
          >
            <span className="field-text">{place || "Lieu"}</span>
            {activeField === "place" && (
              <span className="field-coord-bubble">
                <Move size={10} /> {currentTemplate.positions.place.x.toFixed(1)}, {currentTemplate.positions.place.y.toFixed(1)} mm
              </span>
            )}
          </div>

          {/* 5. Date (Le) */}
          <div
            className={`positioned-field ${activeField === "date" ? "selected" : ""}`}
            style={getStyle("date")}
            onPointerDown={(e) => handlePointerDown("date", e)}
            title="Date (glisser pour ajuster)"
          >
            <span className="field-text">{formattedDate || "Date"}</span>
            {activeField === "date" && (
              <span className="field-coord-bubble">
                <Move size={10} /> {currentTemplate.positions.date.x.toFixed(1)}, {currentTemplate.positions.date.y.toFixed(1)} mm
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Bloc Détails du chèque */}
      <div className="cheque-details-block">
        <h3 className="details-block-title">
          <Eye size={13} className="details-icon" />
          <span>Détails du chèque</span>
        </h3>
        <div className="details-grid">
          <div className="detail-item">
            <span className="detail-label">Banque / Modèle :</span>
            <strong className="detail-val">{currentTemplate.name}</strong>
          </div>
          <div className="detail-item">
            <span className="detail-label">Montant en DZD :</span>
            <strong className="detail-val">{formattedAmount}</strong>
          </div>
          <div className="detail-item">
            <span className="detail-label">Bénéficiaire :</span>
            <strong className="detail-val">{beneficiary || "—"}</strong>
          </div>
          <div className="detail-item">
            <span className="detail-label">Lieu :</span>
            <strong className="detail-val">{place || "—"}</strong>
          </div>
          <div className="detail-item">
            <span className="detail-label">Date :</span>
            <strong className="detail-val">{formattedDate || "—"}</strong>
          </div>
          <div className="detail-item full-row">
            <span className="detail-label">Montant en lettres :</span>
            <span className="detail-val-words">{words}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
