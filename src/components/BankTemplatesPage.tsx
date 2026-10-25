import React, { useState, useEffect, useRef, useMemo, type PointerEvent as ReactPointerEvent } from "react";
import {
  Building2,
  Plus,
  Upload,
  Trash2,
  Copy,
  Check,
  Sliders,
  FileText,
  Move,
  Eye,
  Info,
  ArrowLeft,
  Sparkles,
  Image as ImageIcon,
  CheckCircle2,
  X,
  Type,
  FolderOpen,
  Download,
  UploadCloud,
  FileCode
} from "lucide-react";
import type { BankTemplate, FieldKey, Positions } from "../types";
import { defaultPositions } from "../banksData";
import { amountInFrenchWords, splitWordsByLimit } from "../moneyToWords";
import {
  getConfigFilePath,
  openConfigFileFolder,
  exportTemplatesFile
} from "../services/templatesConfig";

interface BankTemplatesPageProps {
  templates: BankTemplate[];
  selectedTemplateId: string;
  onSelectTemplate: (id: string) => void;
  onSaveTemplate: (template: BankTemplate) => void;
  onDeleteTemplate: (id: string) => void;
  onImportTemplates?: (templates: BankTemplate[]) => void;
  onBackToHome: () => void;
}

const FIELD_LABELS: Record<FieldKey, string> = {
  beneficiary: "Bénéficiaire (À l'ordre de)",
  words: "Montant en lettres (Ligne 1)",
  wordsSecondLine: "Montant en lettres (Ligne 2)",
  numeric: "Montant en chiffres",
  place: "Lieu (Fait à)",
  date: "Date (Le)",
  chequeNumber: "Numéro de chèque"
};

export const BankTemplatesPage: React.FC<BankTemplatesPageProps> = ({
  templates,
  selectedTemplateId,
  onSelectTemplate,
  onSaveTemplate,
  onDeleteTemplate,
  onImportTemplates,
  onBackToHome
}) => {
  // State: Template selection / edit mode
  const [editingTemplate, setEditingTemplate] = useState<BankTemplate | null>(null);
  const [activeEditorField, setActiveEditorField] = useState<FieldKey>("words");
  const [testAmountWords, setTestAmountWords] = useState<string>("Cent vingt-cinq mille quatre cent cinquante dinars algériens et soixante-quinze centimes");
  const [draggingField, setDraggingField] = useState<FieldKey | null>(null);
  const [configFilePath, setConfigFilePath] = useState<string>("");
  const [isCopied, setIsCopied] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const jsonImportRef = useRef<HTMLInputElement>(null);
  const dragStartRef = useRef<{ clientX: number; clientY: number; origX: number; origY: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getConfigFilePath().then(setConfigFilePath).catch(console.error);
  }, []);

  // Met à jour dynamiquement le ratio mm -> px sur le canevas de l'éditeur
  // pour que la taille du texte reste strictement proportionnelle au chèque
  useEffect(() => {
    const el = canvasRef.current;
    if (!el || !editingTemplate) return;

    const updateRatio = () => {
      if (el && editingTemplate.width > 0) {
        const clientW = el.clientWidth;
        if (clientW > 0) {
          const mmToPx = clientW / editingTemplate.width;
          el.style.setProperty("--mm-to-px", `${mmToPx.toFixed(4)}px`);
        }
      }
    };

    updateRatio();
    const ro = new ResizeObserver(updateRatio);
    ro.observe(el);
    return () => ro.disconnect();
  }, [editingTemplate?.width, editingTemplate?.id]);

  const handleCopyPath = () => {
    if (configFilePath) {
      navigator.clipboard.writeText(configFilePath);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2500);
    }
  };

  const handleImportJsonFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].positions) {
          if (onImportTemplates) {
            onImportTemplates(parsed);
          } else {
            // Sauvegarder chaque modèle importé
            for (const t of parsed) {
              onSaveTemplate(t);
            }
          }
          alert(`Importation réussie : ${parsed.length} modèle(s) bancaire(s) chargé(s) depuis le fichier.`);
        } else {
          alert("Le fichier JSON sélectionné n'est pas un format valide de modèles de chèques.");
        }
      } catch (err) {
        alert("Erreur lors de la lecture du fichier JSON. Vérifiez sa structure.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // Initialize a new blank template
  const handleCreateNew = () => {
    const newId = `custom-bank-${Date.now()}`;
    const newTemplate: BankTemplate = {
      id: newId,
      name: "Nouveau Chéquier Personnalisé",
      shortName: "Nouvelle Banque",
      bankCode: "000",
      themeColor: "#AC8946",
      width: 175,
      height: 80,
      backgroundImage: undefined,
      positions: {
        ...defaultPositions,
        words: { ...defaultPositions.words, maxWidth: 130 },
        wordsSecondLine: { ...defaultPositions.wordsSecondLine, maxWidth: 120 }
      },
      wordsMaxLineLength: 55,
      wordsLine1MaxWidth: 130,
      wordsLine2MaxWidth: 120,
      notes: "Modèle personnalisé créé par l'utilisateur.",
      isCustom: true
    };
    setEditingTemplate(newTemplate);
    setActiveEditorField("words");
  };

  // Duplicate an existing template
  const handleDuplicate = (source: BankTemplate) => {
    const newId = `copy-${source.id}-${Date.now()}`;
    const duplicated: BankTemplate = {
      ...source,
      id: newId,
      name: `${source.name} (Copie)`,
      shortName: `${source.shortName} (Copie)`,
      isCustom: true,
      positions: JSON.parse(JSON.stringify(source.positions))
    };
    setEditingTemplate(duplicated);
    setActiveEditorField("words");
  };

  // Upload specimen background image
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && editingTemplate) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        setEditingTemplate((prev) => (prev ? { ...prev, backgroundImage: result } : null));
      };
      reader.readAsDataURL(file);
    }
  };

  // Upload bank logo / icon
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && editingTemplate) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        setEditingTemplate((prev) => (prev ? { ...prev, logoUrl: result } : null));
      };
      reader.readAsDataURL(file);
    }
  };

  // Update field coordinate or dimension
  const handleUpdateField = (key: FieldKey, patch: Partial<BankTemplate["positions"][FieldKey]>) => {
    if (!editingTemplate) return;
    setEditingTemplate((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        positions: {
          ...prev.positions,
          [key]: {
            ...prev.positions[key],
            ...patch
          }
        }
      };
    });
  };

  // Split test words based on current max line length
  const [testL1, testL2] = useMemo(() => {
    const limit = editingTemplate?.wordsMaxLineLength || 55;
    return splitWordsByLimit(testAmountWords, limit);
  }, [testAmountWords, editingTemplate?.wordsMaxLineLength]);

  // Handle visual drag on canvas
  const handlePointerDown = (key: FieldKey, e: ReactPointerEvent) => {
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    setActiveEditorField(key);
    setDraggingField(key);
    if (!editingTemplate) return;
    dragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      origX: editingTemplate.positions[key].x,
      origY: editingTemplate.positions[key].y
    };
  };

  const handlePointerMove = (e: ReactPointerEvent) => {
    if (!draggingField || !dragStartRef.current || !canvasRef.current || !editingTemplate) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mmPerPixelX = editingTemplate.width / rect.width;
    const mmPerPixelY = editingTemplate.height / rect.height;

    const deltaX = (e.clientX - dragStartRef.current.clientX) * mmPerPixelX;
    const deltaY = (e.clientY - dragStartRef.current.clientY) * mmPerPixelY;

    const nextX = Math.max(0, Math.min(editingTemplate.width, dragStartRef.current.origX + deltaX));
    const nextY = Math.max(0, Math.min(editingTemplate.height, dragStartRef.current.origY + deltaY));

    handleUpdateField(draggingField, {
      x: Number(nextX.toFixed(1)),
      y: Number(nextY.toFixed(1))
    });
  };

  const handlePointerUp = (e: ReactPointerEvent) => {
    if (draggingField) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
      setDraggingField(null);
      dragStartRef.current = null;
    }
  };

  // Save the template
  const handleSave = () => {
    if (!editingTemplate) return;
    onSaveTemplate(editingTemplate);
    onSelectTemplate(editingTemplate.id);
    setEditingTemplate(null);
  };

  return (
    <div className="bank-templates-page">
      {/* 1. Header de la page */}
      <div className="templates-page-header">
        <div className="header-breadcrumbs">
          <button type="button" className="btn-back-crumb" onClick={onBackToHome}>
            <ArrowLeft size={16} />
            <span>Retour à l'accueil (Saisie)</span>
          </button>
        </div>

        <div className="header-main-title-row">
          <div>
            <div className="title-with-badge">
              <h1 className="history-main-title">Modèles Bancaires & Chéquiers</h1>
              <span className="count-pill">{templates.length}</span>
              <span className="db-badge" title="Stockés dans un fichier de configuration externe copiable">
                Config JSON
              </span>
            </div>
            <p className="history-main-subtitle">
              Créez et personnalisez les formats de chèques de n'importe quelle banque avec leurs emplacements et longueurs de lignes par défaut.
            </p>
          </div>

          <div className="header-actions-group">
            <button
              type="button"
              className="btn-create-template"
              onClick={handleCreateNew}
            >
              <Plus size={16} />
              <span>Nouveau modèle de chèque</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Éditeur de modèle (Si un modèle est en cours de création ou d'édition) */}
      {editingTemplate ? (
        <div className="template-editor-card">
          <div className="editor-top-bar">
            <div className="editor-badge-group">
              <span className="editor-badge">
                <Sparkles size={14} />
                Édition du modèle
              </span>
              <h2 className="editor-model-name">{editingTemplate.name}</h2>
            </div>

            <div className="editor-actions">
              <button
                type="button"
                className="btn-editor-cancel"
                onClick={() => setEditingTemplate(null)}
              >
                Annuler
              </button>
              <button
                type="button"
                className="btn-editor-save"
                onClick={handleSave}
              >
                <Check size={16} />
                <span>Enregistrer ce modèle</span>
              </button>
            </div>
          </div>

          <div className="editor-layout-grid">
            {/* Colonne gauche : Formulaire de configuration */}
            <div className="editor-form-column">
              {/* Bloc 1: Infos Générales */}
              <div className="editor-section">
                <h3 className="editor-section-title">
                  <Building2 size={16} />
                  <span>Informations de la banque</span>
                </h3>

                <div className="form-group-grid">
                  <div className="form-field full-width">
                    <label>Nom complet de la banque :</label>
                    <input
                      type="text"
                      className="editor-input"
                      value={editingTemplate.name}
                      onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
                      placeholder="Ex: Banque de Développement Local (BDL)"
                    />
                  </div>

                  <div className="form-field">
                    <label>Nom court / Sigle :</label>
                    <input
                      type="text"
                      className="editor-input"
                      value={editingTemplate.shortName}
                      onChange={(e) => setEditingTemplate({ ...editingTemplate, shortName: e.target.value })}
                      placeholder="Ex: BDL"
                    />
                  </div>

                  <div className="form-field">
                    <label>Code Banque :</label>
                    <input
                      type="text"
                      className="editor-input"
                      value={editingTemplate.bankCode}
                      onChange={(e) => setEditingTemplate({ ...editingTemplate, bankCode: e.target.value })}
                      placeholder="Ex: 005"
                    />
                  </div>

                  <div className="form-field">
                    <label>Largeur chèque (mm) :</label>
                    <input
                      type="number"
                      step="0.5"
                      className="editor-input"
                      value={editingTemplate.width}
                      onChange={(e) => setEditingTemplate({ ...editingTemplate, width: parseFloat(e.target.value) || 175 })}
                    />
                  </div>

                  <div className="form-field">
                    <label>Hauteur chèque (mm) :</label>
                    <input
                      type="number"
                      step="0.5"
                      className="editor-input"
                      value={editingTemplate.height}
                      onChange={(e) => setEditingTemplate({ ...editingTemplate, height: parseFloat(e.target.value) || 80 })}
                    />
                  </div>
                </div>
              </div>

              {/* Bloc 2: Logo / Icône de la Banque */}
              <div className="editor-section">
                <h3 className="editor-section-title">
                  <Building2 size={16} />
                  <span>Logo ou Icône de la banque</span>
                </h3>

                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png, image/jpeg, image/webp, image/svg+xml"
                  hidden
                  onChange={handleLogoUpload}
                />

                <div className="image-upload-box logo-upload-box">
                  {editingTemplate.logoUrl ? (
                    <div className="uploaded-preview-badge logo-preview-badge">
                      <div className="logo-thumb-wrapper">
                        <img src={editingTemplate.logoUrl} alt="Logo banque" className="logo-thumb-preview" />
                      </div>
                      <div className="thumb-meta">
                        <span className="thumb-status">✓ Logo actif</span>
                        <div className="thumb-actions">
                          <button
                            type="button"
                            className="btn-thumb-action"
                            onClick={() => logoInputRef.current?.click()}
                          >
                            Remplacer le logo
                          </button>
                          <button
                            type="button"
                            className="btn-thumb-action delete"
                            onClick={() => setEditingTemplate({ ...editingTemplate, logoUrl: undefined })}
                          >
                            Supprimer
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="empty-upload-prompt" onClick={() => logoInputRef.current?.click()}>
                      <UploadCloud size={24} className="upload-icon" />
                      <strong>Cliquez pour importer le logo de la banque</strong>
                      <span>PNG, SVG, WEBP ou JPG (recommandé : format carré ou détouré)</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Bloc 2 bis: Image du Chèque Scanné */}
              <div className="editor-section">
                <h3 className="editor-section-title">
                  <ImageIcon size={16} />
                  <span>Image du spécimen de chèque</span>
                </h3>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png, image/jpeg, image/webp"
                  hidden
                  onChange={handleImageUpload}
                />

                <div className="image-upload-box">
                  {editingTemplate.backgroundImage ? (
                    <div className="uploaded-preview-badge">
                      <img src={editingTemplate.backgroundImage} alt="Spécimen chèque" className="thumb-preview" />
                      <div className="thumb-meta">
                        <span className="thumb-status">✓ Image de fond active</span>
                        <div className="thumb-actions">
                          <button
                            type="button"
                            className="btn-thumb-action"
                            onClick={() => fileInputRef.current?.click()}
                          >
                            Remplacer l'image
                          </button>
                          <button
                            type="button"
                            className="btn-thumb-action delete"
                            onClick={() => setEditingTemplate({ ...editingTemplate, backgroundImage: undefined })}
                          >
                            Supprimer
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="empty-upload-prompt" onClick={() => fileInputRef.current?.click()}>
                      <Upload size={24} className="upload-icon" />
                      <strong>Cliquez pour importer l'image du chèque scanné</strong>
                      <span>JPG, PNG ou WEBP (recommandé : scan haute résolution 300 DPI)</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Bloc 3: Configuration Spécifique du Montant en Lettres (Taille max pour chaque ligne) */}
              <div className="editor-section highlight-gold">
                <h3 className="editor-section-title">
                  <Type size={16} />
                  <span>Taille maximale & Découpage du Montant en Lettres</span>
                </h3>

                <p className="section-instruction-note">
                  Définissez la longueur maximale de la première ligne avant renvoi automatique à la deuxième ligne, ainsi que la largeur limite en millimètres.
                </p>

                <div className="form-group-grid">
                  <div className="form-field full-width">
                    <label>Longueur maximale Ligne 1 (Nombre max de caractères) :</label>
                    <div className="stepper-inline">
                      <input
                        type="number"
                        className="editor-input"
                        value={editingTemplate.wordsMaxLineLength || 55}
                        onChange={(e) =>
                          setEditingTemplate({
                            ...editingTemplate,
                            wordsMaxLineLength: parseInt(e.target.value) || 55
                          })
                        }
                      />
                      <span className="input-unit">caractères</span>
                    </div>
                    <span className="field-hint">Dès que le montant dépasse ce seuil, les mots suivants basculent sur la 2ème ligne.</span>
                  </div>

                  {/* Ligne 1 */}
                  <div className="form-field">
                    <label>Largeur max Ligne 1 (mm) :</label>
                    <input
                      type="number"
                      step="1"
                      className="editor-input"
                      value={editingTemplate.wordsLine1MaxWidth || editingTemplate.positions.words.maxWidth || 130}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 130;
                        setEditingTemplate({
                          ...editingTemplate,
                          wordsLine1MaxWidth: val,
                          positions: {
                            ...editingTemplate.positions,
                            words: { ...editingTemplate.positions.words, maxWidth: val }
                          }
                        });
                      }}
                    />
                  </div>

                  <div className="form-field">
                    <label>Taille police Ligne 1 (mm) :</label>
                    <input
                      type="number"
                      step="0.1"
                      className="editor-input"
                      value={editingTemplate.positions.words.size}
                      onChange={(e) => handleUpdateField("words", { size: parseFloat(e.target.value) || 3.2 })}
                    />
                  </div>

                  {/* Ligne 2 */}
                  <div className="form-field">
                    <label>Largeur max Ligne 2 (mm) :</label>
                    <input
                      type="number"
                      step="1"
                      className="editor-input"
                      value={editingTemplate.wordsLine2MaxWidth || editingTemplate.positions.wordsSecondLine.maxWidth || 120}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 120;
                        setEditingTemplate({
                          ...editingTemplate,
                          wordsLine2MaxWidth: val,
                          positions: {
                            ...editingTemplate.positions,
                            wordsSecondLine: { ...editingTemplate.positions.wordsSecondLine, maxWidth: val }
                          }
                        });
                      }}
                    />
                  </div>

                  <div className="form-field">
                    <label>Taille police Ligne 2 (mm) :</label>
                    <input
                      type="number"
                      step="0.1"
                      className="editor-input"
                      value={editingTemplate.positions.wordsSecondLine.size}
                      onChange={(e) => handleUpdateField("wordsSecondLine", { size: parseFloat(e.target.value) || 3.2 })}
                    />
                  </div>
                </div>

                {/* Simulateur de découpage en direct */}
                <div className="words-simulator-box">
                  <div className="simulator-label">Test de découpage en direct :</div>
                  <input
                    type="text"
                    className="simulator-input"
                    value={testAmountWords}
                    onChange={(e) => setTestAmountWords(e.target.value)}
                    placeholder="Tapez un montant en lettres pour tester..."
                  />
                  <div className="simulator-output">
                    <div className="split-line-result">
                      <span className="split-badge">L1 ({testL1.length} car.) :</span>
                      <strong className="split-text">{testL1 || "—"}</strong>
                    </div>
                    {testL2 && (
                      <div className="split-line-result">
                        <span className="split-badge secondary">L2 ({testL2.length} car.) :</span>
                        <strong className="split-text">{testL2}</strong>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Bloc 4: Emplacements des autres champs */}
              <div className="editor-section">
                <h3 className="editor-section-title">
                  <Sliders size={16} />
                  <span>Emplacements par défaut des champs</span>
                </h3>

                <div className="fields-settings-accordion">
                  {(["beneficiary", "numeric", "place", "date", "chequeNumber"] as FieldKey[]).map((key) => {
                    const pos = editingTemplate.positions[key];
                    const isSelected = activeEditorField === key;
                    return (
                      <div
                        key={key}
                        className={`field-setting-card ${isSelected ? "active" : ""}`}
                        onClick={() => setActiveEditorField(key)}
                      >
                        <div className="field-setting-header">
                          <strong>{FIELD_LABELS[key]}</strong>
                          <span className="coord-summary-pill">
                            X: {pos.x} mm | Y: {pos.y} mm
                          </span>
                        </div>

                        {isSelected && (
                          <div className="field-setting-body" onClick={(e) => e.stopPropagation()}>
                            <div className="field-coord-row">
                              <label>Position X (mm) :</label>
                              <input
                                type="number"
                                step="0.5"
                                className="editor-input-small"
                                value={pos.x}
                                onChange={(e) => handleUpdateField(key, { x: parseFloat(e.target.value) || 0 })}
                              />

                              <label>Position Y (mm) :</label>
                              <input
                                type="number"
                                step="0.5"
                                className="editor-input-small"
                                value={pos.y}
                                onChange={(e) => handleUpdateField(key, { y: parseFloat(e.target.value) || 0 })}
                              />

                              <label>Taille (mm) :</label>
                              <input
                                type="number"
                                step="0.1"
                                className="editor-input-small"
                                value={pos.size}
                                onChange={(e) => handleUpdateField(key, { size: parseFloat(e.target.value) || 3.0 })}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Colonne droite : Canevas de calibrage visuel avec glisser-déposer */}
            <div className="editor-preview-column">
              <div className="preview-sticky-box">
                <div className="preview-box-header">
                  <div>
                    <h3 className="preview-title">Aperçu & Calibrage visuel</h3>
                    <p className="preview-sub">Glissez-déposez directement les champs sur le chèque.</p>
                  </div>
                  <span className="active-field-badge">
                    Champ actif : <strong>{FIELD_LABELS[activeEditorField]}</strong>
                  </span>
                </div>

                <div
                  ref={canvasRef}
                  className="editor-canvas-stage"
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  style={{
                    aspectRatio: `${editingTemplate.width} / ${editingTemplate.height}`,
                    backgroundImage: editingTemplate.backgroundImage ? `url(${editingTemplate.backgroundImage})` : undefined
                  }}
                >
                  {/* Watermark / specimen border si aucune image */}
                  {!editingTemplate.backgroundImage && (
                    <div className="canvas-placeholder-guides">
                      <span className="canvas-placeholder-bank">{editingTemplate.name}</span>
                      <span className="canvas-placeholder-dim">
                        {editingTemplate.width} × {editingTemplate.height} mm
                      </span>
                    </div>
                  )}

                  {/* Champs positionnables */}
                  {(["beneficiary", "words", "wordsSecondLine", "numeric", "place", "date", "chequeNumber"] as FieldKey[]).map(
                    (key) => {
                      const pos = editingTemplate.positions[key];
                      const isSelected = activeEditorField === key;
                      const isRight = pos.align === "right";

                      let displayText = FIELD_LABELS[key];
                      if (key === "words") displayText = testL1 || "Cent vingt-cinq mille dinars...";
                      if (key === "wordsSecondLine") displayText = testL2 || "soixante-quinze centimes";
                      if (key === "numeric") displayText = "# 125 450,75 DA #";
                      if (key === "beneficiary") displayText = "Entreprise Exemple SARL";
                      if (key === "place") displayText = "Alger";
                      if (key === "date") displayText = "19/10/2026";
                      if (key === "chequeNumber") displayText = "N° 0048291";

                      return (
                        <div
                          key={key}
                          className={`canvas-drag-field ${isSelected ? "selected" : ""}`}
                          style={{
                            left: isRight ? undefined : `${(pos.x / editingTemplate.width) * 100}%`,
                            right: isRight ? `${((editingTemplate.width - pos.x) / editingTemplate.width) * 100}%` : undefined,
                            top: `${(pos.y / editingTemplate.height) * 100}%`,
                            fontSize: `calc(${pos.size} * var(--mm-to-px, ${(100 / editingTemplate.width).toFixed(4)}cqw))`,
                            maxWidth: pos.maxWidth ? `${(pos.maxWidth / editingTemplate.width) * 100}%` : undefined
                          }}
                          onPointerDown={(e) => handlePointerDown(key, e)}
                        >
                          <span className="drag-field-text">{displayText}</span>
                          {isSelected && (
                            <span className="canvas-field-coord-pill">
                              <Move size={9} /> {pos.x.toFixed(1)}, {pos.y.toFixed(1)} mm
                            </span>
                          )}
                        </div>
                      );
                    }
                  )}
                </div>

                <div className="preview-footer-hints">
                  <Info size={14} className="hint-icon" />
                  <span>
                    Astuce : Cliquez sur un champ puis déplacez-le à la souris pour ajuster précisément son positionnement sur le chèque.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Fiche de configuration externe (Fichier JSON) */}
          <div className="config-file-card">
            <div className="config-file-left">
              <div className="config-file-icon">
                <FileCode size={22} />
              </div>
              <div className="config-file-info">
                <div className="config-file-title-row">
                  <h3 className="config-file-title">Fichier de configuration des modèles (.json)</h3>
                  <span className="config-badge-sync">Fichier externe copiable</span>
                </div>
                <p className="config-file-desc">
                  Vos modèles bancaires et calibrages sont stockés dans un fichier JSON physique, indépendant de la base de données. Vous pouvez le copier d'un ordinateur à un autre ou le sauvegarder.
                </p>
                {configFilePath && (
                  <div className="config-path-box">
                    <span className="config-path-text" title={configFilePath}>
                      {configFilePath}
                    </span>
                    <button
                      type="button"
                      className="btn-copy-path"
                      onClick={handleCopyPath}
                      title="Copier le chemin absolu du fichier"
                    >
                      {isCopied ? <Check size={13} /> : <Copy size={13} />}
                      <span>{isCopied ? "Copié !" : "Copier le chemin"}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="config-file-actions">
              <button
                type="button"
                className="btn-config-action explorer"
                onClick={() => openConfigFileFolder()}
                title="Ouvrir le dossier contenant ce fichier dans l'Explorateur Windows pour le copier"
              >
                <FolderOpen size={15} />
                <span>Ouvrir l'emplacement</span>
              </button>

              <button
                type="button"
                className="btn-config-action export"
                onClick={() => exportTemplatesFile(templates)}
                title="Télécharger une copie de sauvegarde de ce fichier JSON"
              >
                <Download size={15} />
                <span>Exporter (.json)</span>
              </button>

              <button
                type="button"
                className="btn-config-action import"
                onClick={() => jsonImportRef.current?.click()}
                title="Importer des modèles depuis un fichier JSON existant"
              >
                <UploadCloud size={15} />
                <span>Importer (.json)</span>
              </button>
              <input
                type="file"
                ref={jsonImportRef}
                accept=".json,application/json"
                style={{ display: "none" }}
                onChange={handleImportJsonFile}
              />
            </div>
          </div>

          {/* 3. Liste des modèles existants */}
          <div className="templates-catalog-grid">
          {templates.map((tpl) => {
            const isCurrent = tpl.id === selectedTemplateId;
            return (
              <div key={tpl.id} className={`template-catalog-card ${isCurrent ? "current-active" : ""}`}>
                <div className="catalog-card-header">
                  <div className="card-badge-row">
                    {tpl.logoUrl ? (
                      <img src={tpl.logoUrl} alt={tpl.name} className="catalog-card-logo-img" />
                    ) : (
                      <span
                        className="bank-color-dot"
                        style={{ backgroundColor: tpl.themeColor || "var(--gold-primary)" }}
                      />
                    )}
                    <span className="card-bank-code">Code : {tpl.bankCode || "—"}</span>
                    {tpl.isCustom ? (
                      <span className="custom-model-tag">Personnalisé</span>
                    ) : (
                      <span className="builtin-model-tag">Modèle officiel</span>
                    )}
                  </div>
                  {isCurrent && <span className="active-tag-badge">Modèle actif</span>}
                </div>

                <h3 className="catalog-card-title">{tpl.name}</h3>
                <p className="catalog-card-notes">{tpl.notes || "Format chèque bancaire standard."}</p>

                {/* Spécifications physiques */}
                <div className="catalog-specs-row">
                  <div className="spec-pill">
                    <span className="spec-label">Dimensions :</span>
                    <strong className="spec-val">{tpl.width} × {tpl.height} mm</strong>
                  </div>
                  <div className="spec-pill">
                    <span className="spec-label">Ligne 1 max :</span>
                    <strong className="spec-val">{tpl.wordsMaxLineLength || 55} car.</strong>
                  </div>
                  <div className="spec-pill">
                    <span className="spec-label">Image de fond :</span>
                    <strong className="spec-val">{tpl.backgroundImage ? "Scan intégré" : "Non"}</strong>
                  </div>
                </div>

                {/* Miniature chèque */}
                <div
                  className="catalog-mini-preview"
                  style={{
                    aspectRatio: `${tpl.width} / ${tpl.height}`,
                    backgroundImage: tpl.backgroundImage ? `url(${tpl.backgroundImage})` : undefined
                  }}
                >
                  {!tpl.backgroundImage && (
                    <div className="mini-placeholder-content">
                      <span>{tpl.shortName}</span>
                      <small>{tpl.width} × {tpl.height} mm</small>
                    </div>
                  )}
                </div>

                {/* Boutons d'action */}
                <div className="catalog-card-actions">
                  <button
                    type="button"
                    className="btn-card-use"
                    onClick={() => {
                      onSelectTemplate(tpl.id);
                      onBackToHome();
                    }}
                  >
                    <CheckCircle2 size={15} />
                    <span>{isCurrent ? "Continuer avec ce modèle" : "Utiliser ce modèle"}</span>
                  </button>

                  <div className="card-sub-actions">
                    <button
                      type="button"
                      className="btn-card-icon"
                      onClick={() => setEditingTemplate(JSON.parse(JSON.stringify(tpl)))}
                      title="Modifier ce modèle"
                    >
                      <Sliders size={14} />
                      <span>Modifier</span>
                    </button>

                    <button
                      type="button"
                      className="btn-card-icon"
                      onClick={() => handleDuplicate(tpl)}
                      title="Dupliquer ce modèle"
                    >
                      <Copy size={14} />
                      <span>Dupliquer</span>
                    </button>

                    {tpl.isCustom && (
                      <button
                        type="button"
                        className="btn-card-icon danger"
                        onClick={() => {
                          if (window.confirm(`Supprimer définitivement le modèle "${tpl.name}" ?`)) {
                            onDeleteTemplate(tpl.id);
                          }
                        }}
                        title="Supprimer ce modèle"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        </>
      )}
    </div>
  );
};
