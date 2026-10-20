import React, { useState, useEffect, useMemo, useRef } from "react";
import { TopBar } from "./components/TopBar";
import { Sidebar, type NavTab } from "./components/Sidebar";
import { CheckForm } from "./components/CheckForm";
import { ChequePreview } from "./components/ChequePreview";
import { BankTemplateSelector } from "./components/BankTemplateSelector";
import { BankTemplatesPage } from "./components/BankTemplatesPage";
import { HistoryPage } from "./components/HistoryPage";
import { SettingsPage } from "./components/SettingsPage";
import { CalibrationPanel } from "./components/CalibrationPanel";
import { ActionBar } from "./components/ActionBar";
import { amountInFrenchWords, splitWordsByLimit, formatNumericAmount } from "./moneyToWords";
import { defaultBankTemplates, defaultPositions } from "./banksData";
import type { BankTemplate, FieldKey, PrintSettings, ChequeRecord, AppSettings } from "./types";
import { PrintModal, getPaperDimensions, calculateChequePosition } from "./components/PrintModal";
import { SplashScreen } from "./components/SplashScreen";
import { saveChequeRecord } from "./services/db";
import { loadTemplatesFromConfigFile, saveTemplatesToConfigFile } from "./services/templatesConfig";
import { loadAppSettings, saveAppSettings, resetAppSettings } from "./services/appSettings";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

const STORAGE_KEY = "cheque-studio-models-v6";
const PRINT_SETTINGS_KEY = "cheque-studio-print-settings-v1";
const HISTORIQUE_STORAGE_KEY = "cheque-studio-history-v1";

export default function App() {
  // Splash Screen de démarrage (VCheque Studio & Virtanis)
  const [showSplash, setShowSplash] = useState<boolean>(true);

  // 0. App Preferences & Settings
  const [appSettings, setAppSettings] = useState<AppSettings>(() => loadAppSettings());

  // 1. Core Cheque State (Default demo values matching specs)
  const [amount, setAmount] = useState<string>("125450.75");
  const [beneficiary, setBeneficiary] = useState<string>("Entreprise Exemple SARL");
  const [place, setPlace] = useState<string>(() => loadAppSettings().defaultPlace || "Alger");
  const [date, setDate] = useState<string>("2026-10-19");
  const [isCrossed, setIsCrossed] = useState<boolean>(() => loadAppSettings().defaultIsCrossed !== false);

  // 2. Templates & Calibration State
  const [templates, setTemplates] = useState<BankTemplate[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // fallback
    }
    return defaultBankTemplates;
  });

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("el-salam");
  const [activeField, setActiveField] = useState<FieldKey>("beneficiary");
  const [showGuides, setShowGuides] = useState<boolean>(true);
  const [scale, setScale] = useState<number>(100);
  const [activeTab, setActiveTab] = useState<NavTab>("home");

  // 3. Print Dialog & Layout State
  const [isPrintModalOpen, setIsPrintModalOpen] = useState<boolean>(false);
  const [printSettings, setPrintSettings] = useState<PrintSettings>(() => {
    try {
      const saved = localStorage.getItem(PRINT_SETTINGS_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      paperFormat: "a4-portrait",
      placement: "center",
      offsetX: 0,
      offsetY: 0,
      rotation: 0,
      showBorderGuide: false
    };
  });

  // 4. Historique State (Chèques enregistrés et imprimés)
  const [historyRefreshTrigger, setHistoryRefreshTrigger] = useState<number>(0);
  const [history, setHistory] = useState<ChequeRecord[]>(() => {
    try {
      const saved = localStorage.getItem(HISTORIQUE_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  // 5. Feedback / Toast
  const [toast, setToast] = useState<{ message: string; type: "success" | "info" | "warning" } | null>(null);

  // Persist history
  useEffect(() => {
    try {
      localStorage.setItem(HISTORIQUE_STORAGE_KEY, JSON.stringify(history));
    } catch {}
  }, [history]);

  // Persist print settings
  useEffect(() => {
    try {
      localStorage.setItem(PRINT_SETTINGS_KEY, JSON.stringify(printSettings));
    } catch {}
  }, [printSettings]);

  // Load templates from external JSON configuration file on startup
  useEffect(() => {
    loadTemplatesFromConfigFile()
      .then((loaded) => {
        if (loaded && loaded.length > 0) {
          setTemplates(loaded);
        }
      })
      .catch((err) => console.error("Erreur chargement modèles config:", err));
  }, []);

  // Persist templates to external JSON configuration file (not db) so user can copy and backup
  useEffect(() => {
    saveTemplatesToConfigFile(templates).catch((err) =>
      console.error("Erreur sauvegarde modèles config:", err)
    );
  }, [templates]);

  // Toast timer
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // Persist app settings
  useEffect(() => {
    saveAppSettings(appSettings);
  }, [appSettings]);

  // Active template reference
  const currentTemplate = useMemo(() => {
    return templates.find((t) => t.id === selectedTemplateId) || templates[0] || defaultBankTemplates[0];
  }, [templates, selectedTemplateId]);

  // Amount in French words (automatic with settings)
  const words = useMemo(() => {
    return amountInFrenchWords(amount, {
      letterCase: appSettings.letterCase,
      currencyTextVariant: appSettings.currencyTextVariant,
      surroundSymbol: appSettings.textSurroundSymbol,
      zeroCentsMention: appSettings.zeroCentsMention
    });
  }, [amount, appSettings]);

  // Formatted numeric amount with security hashes and currency according to settings
  const formattedNumeric = useMemo(() => {
    return formatNumericAmount(amount, {
      securitySymbol: appSettings.numericSecuritySymbol,
      currencySuffix: appSettings.numericCurrencySuffix,
      decimalSeparator: appSettings.decimalSeparator
    });
  }, [amount, appSettings]);

  // Update position of active field in current template
  const handleUpdateFieldPosition = (key: FieldKey, patch: { x?: number; y?: number; size?: number }) => {
    setTemplates((prev) =>
      prev.map((tpl) => {
        if (tpl.id === currentTemplate.id) {
          return {
            ...tpl,
            positions: {
              ...tpl.positions,
              [key]: {
                ...tpl.positions[key],
                ...patch
              }
            }
          };
        }
        return tpl;
      })
    );
  };

  // Keyboard nudge for active field calibration
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA" ||
        document.activeElement?.tagName === "SELECT"
      ) {
        return;
      }

      const step = e.altKey ? 0.1 : e.shiftKey ? 2.0 : 0.5;
      const currentPos = currentTemplate.positions[activeField];

      if (e.key === "ArrowUp") {
        e.preventDefault();
        handleUpdateFieldPosition(activeField, { y: Math.max(0, Number((currentPos.y - step).toFixed(1))) });
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        handleUpdateFieldPosition(activeField, { y: Math.min(currentTemplate.height, Number((currentPos.y + step).toFixed(1))) });
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        handleUpdateFieldPosition(activeField, { x: Math.max(0, Number((currentPos.x - step).toFixed(1))) });
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleUpdateFieldPosition(activeField, { x: Math.min(currentTemplate.width, Number((currentPos.x + step).toFixed(1))) });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeField, currentTemplate]);

  // Action handlers
  const handleEditFocus = () => {
    const el = document.getElementById("amount-field");
    el?.focus();
    setToast({ message: "Saisie activée. Modifiez vos informations.", type: "info" });
  };

  const handleSave = () => {
    const rawVal = parseFloat(amount.replace(/\s/g, "").replace(",", "."));
    if (isNaN(rawVal) || rawVal <= 0) {
      setToast({ message: "Veuillez saisir un montant valide avant d'enregistrer le chèque.", type: "warning" });
      return;
    }

    const now = new Date().toISOString();
    const newRecord: ChequeRecord = {
      id: "cheque-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7),
      amount,
      beneficiary: beneficiary.trim() || "Bénéficiaire non spécifié",
      place: place.trim() || "Alger",
      date: date || new Date().toISOString().split("T")[0],
      bankTemplateId: currentTemplate.id,
      bankName: currentTemplate.name,
      status: "saved",
      isCrossed,
      createdAt: now,
      updatedAt: now
    };

    saveChequeRecord(newRecord).catch(console.error);
    setHistory((prev) => [newRecord, ...prev]);
    setHistoryRefreshTrigger((n) => n + 1);
    setToast({
      message: `Chèque enregistré avec succès dans l'Historique (${rawVal.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} DZD).`,
      type: "success"
    });
  };

  const handlePrint = () => {
    setIsPrintModalOpen(true);
  };

  const handlePrintTestPage = () => {
    setPrintSettings((prev) => ({ ...prev, showBorderGuide: true }));
    setIsPrintModalOpen(true);
    setToast({
      message: "Configurez l'emplacement de la feuille de test puis lancez l'impression.",
      type: "info"
    });
  };

  const handleConfirmPrint = () => {
    setIsPrintModalOpen(false);

    // Enregistrer automatiquement le chèque dans l'historique avec le statut 'imprimé'
    const now = new Date().toISOString();
    const printedRecord: ChequeRecord = {
      id: "cheque-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7),
      amount,
      beneficiary: beneficiary.trim() || "Bénéficiaire non spécifié",
      place: place.trim() || "Alger",
      date: date || new Date().toISOString().split("T")[0],
      bankTemplateId: currentTemplate.id,
      bankName: currentTemplate.name,
      status: "printed",
      isCrossed,
      createdAt: now,
      printedAt: now
    };
    saveChequeRecord(printedRecord).catch(console.error);
    setHistory((prev) => [printedRecord, ...prev]);
    setHistoryRefreshTrigger((n) => n + 1);

    setToast({
      message: "Impression lancée et archivée dans l'historique.",
      type: "success"
    });
    setTimeout(() => {
      window.print();
    }, 200);
  };

  // Handlers pour l'Historique
  const handleCloneToHome = (record: ChequeRecord) => {
    setAmount(record.amount);
    setBeneficiary(record.beneficiary);
    setPlace(record.place);
    setDate(record.date);
    setIsCrossed(record.isCrossed !== false);
    if (templates.some((t) => t.id === record.bankTemplateId)) {
      setSelectedTemplateId(record.bankTemplateId);
    }
    setActiveTab("home");
    setToast({
      message: `Chèque pour "${record.beneficiary}" cloné vers l'Accueil pour modification.`,
      type: "success"
    });
  };

  const handleReprintFromHistory = (record: ChequeRecord) => {
    setAmount(record.amount);
    setBeneficiary(record.beneficiary);
    setPlace(record.place);
    setDate(record.date);
    setIsCrossed(record.isCrossed !== false);
    if (templates.some((t) => t.id === record.bankTemplateId)) {
      setSelectedTemplateId(record.bankTemplateId);
    }
    setIsPrintModalOpen(true);
    setToast({
      message: `Réimpression du chèque pour "${record.beneficiary}".`,
      type: "info"
    });
  };

  const handleDeleteHistoryRecord = (id: string) => {
    setHistory((prev) => prev.filter((item) => item.id !== id));
    setToast({ message: "Chèque retiré de l'historique.", type: "info" });
  };

  const handleClearHistory = () => {
    if (window.confirm("Êtes-vous sûr de vouloir vider l'historique de tous les chèques ?")) {
      setHistory([]);
      setToast({ message: "Historique vidé.", type: "info" });
    }
  };

  const handleResetPositions = () => {
    if (window.confirm(`Réinitialiser les coordonnées du modèle "${currentTemplate.name}" ?`)) {
      setTemplates((prev) =>
        prev.map((t) => (t.id === currentTemplate.id ? { ...t, positions: defaultPositions } : t))
      );
      setToast({ message: "Positions réinitialisées par défaut.", type: "info" });
    }
  };

  const handleSubmitForm = () => {
    setToast({ message: "Aperçu du chèque actualisé.", type: "success" });
  };

  const handleSaveCustomTemplate = (savedTemplate: BankTemplate) => {
    setTemplates((prev) => {
      const exists = prev.some((t) => t.id === savedTemplate.id);
      if (exists) {
        return prev.map((t) => (t.id === savedTemplate.id ? savedTemplate : t));
      }
      return [...prev, savedTemplate];
    });
    setSelectedTemplateId(savedTemplate.id);
    setToast({
      message: `Modèle "${savedTemplate.name}" enregistré avec succès.`,
      type: "success"
    });
  };

  const handleDeleteTemplate = (id: string) => {
    setTemplates((prev) => {
      const filtered = prev.filter((t) => t.id !== id);
      return filtered.length > 0 ? filtered : defaultBankTemplates;
    });
    if (selectedTemplateId === id) {
      setSelectedTemplateId(defaultBankTemplates[0].id);
    }
    setToast({
      message: "Modèle supprimé avec succès.",
      type: "info"
    });
  };

  return (
    <div className="app-layout">
      {/* 0. Écran de démarrage (Splash Screen) */}
      {showSplash && <SplashScreen onFinish={() => setShowSplash(false)} />}

      {/* 1. Barre supérieure */}
      <TopBar onOpenSettings={() => setActiveTab("settings")} />

      {/* 2. Corps de l'application (Barre latérale + Zone centrale + Colonne droite) */}
      <div className="app-body">
        {/* A. Barre latérale gauche */}
        <Sidebar activeTab={activeTab} onSelectTab={(tab) => setActiveTab(tab)} />

        {activeTab === "templates" ? (
          <BankTemplatesPage
            templates={templates}
            selectedTemplateId={selectedTemplateId}
            onSelectTemplate={setSelectedTemplateId}
            onSaveTemplate={handleSaveCustomTemplate}
            onDeleteTemplate={handleDeleteTemplate}
            onImportTemplates={(imported) => {
              setTemplates(imported);
              if (imported.length > 0) {
                setSelectedTemplateId(imported[0].id);
              }
              setToast({
                message: `${imported.length} modèle(s) importé(s) avec succès dans le fichier de configuration.`,
                type: "success"
              });
            }}
            onBackToHome={() => setActiveTab("home")}
          />
        ) : activeTab === "history" ? (
          <HistoryPage
            history={history}
            refreshTrigger={historyRefreshTrigger}
            onCloneToHome={handleCloneToHome}
            onReprintCheque={handleReprintFromHistory}
            onDeleteRecord={handleDeleteHistoryRecord}
            onClearHistory={handleClearHistory}
            onBackToHome={() => setActiveTab("home")}
          />
        ) : activeTab === "settings" ? (
          <SettingsPage
            settings={appSettings}
            onUpdateSettings={(newSettings) => {
              setAppSettings(newSettings);
              setToast({ message: "Paramètres enregistrés.", type: "success" });
            }}
            onResetSettings={() => {
              const defaults = resetAppSettings();
              setAppSettings(defaults);
              setToast({ message: "Paramètres réinitialisés par défaut.", type: "info" });
            }}
            onBackToHome={() => setActiveTab("home")}
          />
        ) : (
          <>
            {/* B. Zone centrale principale */}
            <main className="main-content-area">
              <div className="main-header">
                <h1 className="page-title">Remplir un chèque</h1>
                <p className="page-subtitle">Saisissez les informations du chèque et prévisualisez le résultat.</p>
              </div>

              <div className="central-cards-grid">
                {/* Carte de saisie */}
                <CheckForm
                  amount={amount}
                  onChangeAmount={setAmount}
                  beneficiary={beneficiary}
                  onChangeBeneficiary={setBeneficiary}
                  place={place}
                  onChangePlace={setPlace}
                  date={date}
                  onChangeDate={setDate}
                  words={words}
                  isCrossed={isCrossed}
                  onChangeIsCrossed={setIsCrossed}
                  onSubmit={handleSubmitForm}
                />

                {/* Carte d'aperçu du chèque */}
                <ChequePreview
                  currentTemplate={currentTemplate}
                  amount={amount}
                  words={words}
                  beneficiary={beneficiary}
                  place={place}
                  date={date}
                  isCrossed={isCrossed}
                  formattedNumeric={formattedNumeric}
                  activeField={activeField}
                  onSelectField={setActiveField}
                  onUpdateFieldPosition={handleUpdateFieldPosition}
                  showGuides={showGuides}
                  scale={scale}
                  onChangeScale={setScale}
                />
              </div>

              {/* Barre d'actions inférieure (Imprimer le chèque, Enregistrer, Modifier) */}
              <ActionBar
                onEdit={handleEditFocus}
                onSave={handleSave}
                onPrint={handlePrint}
              />

              {/* Pied de page espace de travail (Footer) */}
              <footer className="workspace-main-footer">
                <div className="footer-left-info">
                  <span className="footer-app-name">VCheque Studio</span>
                  <span className="footer-sep">•</span>
                  <span>Système Professionnel d'Édition & Calibrage de Chèques Algériens</span>
                </div>
                <div className="footer-right-info">
                  <span>By <strong className="gold-text">Virtanis</strong></span>
                  <span className="footer-sep">•</span>
                  <a
                    href="https://virtanis.net"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="footer-link"
                  >
                    virtanis.net
                  </a>
                </div>
              </footer>
            </main>

            {/* C. Colonne droite (Modèles bancaires & Calibrage) */}
            <aside className="right-panel-column">
              <BankTemplateSelector
                templates={templates}
                selectedId={selectedTemplateId}
                onSelectTemplate={setSelectedTemplateId}
                onOpenManageTemplates={() => setActiveTab("templates")}
              />

              <CalibrationPanel
                currentTemplate={currentTemplate}
                activeField={activeField}
                onSelectField={setActiveField}
                onUpdatePosition={handleUpdateFieldPosition}
                onResetPositions={handleResetPositions}
                showGuides={showGuides}
                onToggleGuides={() => setShowGuides((v) => !v)}
                scale={scale}
                onChangeScale={setScale}
                onPrintTestPage={handlePrintTestPage}
              />
            </aside>
          </>
        )}
      </div>

      {/* Toast Notification */}
      {toast && (
        <div className={`app-toast toast-${toast.type}`} role="status">
          {toast.type === "success" && <CheckCircle2 size={16} />}
          {toast.type === "info" && <Info size={16} />}
          {toast.type === "warning" && <AlertCircle size={16} />}
          <span>{toast.message}</span>
          <button type="button" className="toast-dismiss" onClick={() => setToast(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Print Configuration & Positioning Modal with Live Preview */}
      <PrintModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        onConfirmPrint={handleConfirmPrint}
        settings={printSettings}
        onChangeSettings={setPrintSettings}
        currentTemplate={currentTemplate}
        amount={amount}
        beneficiary={beneficiary}
        date={date}
        isCrossed={isCrossed}
        formattedNumeric={formattedNumeric}
      />

      {/* Dedicated Print Layer (Hidden on screen, exact 100% physical mm on printer) */}
      {(() => {
        const paper = getPaperDimensions(
          printSettings.paperFormat,
          currentTemplate.width,
          currentTemplate.height
        );
        const pos = calculateChequePosition(
          paper.width,
          paper.height,
          currentTemplate.width,
          currentTemplate.height,
          printSettings.placement,
          printSettings.offsetX,
          printSettings.offsetY,
          printSettings.rotation
        );

        const isRotated90 = printSettings.rotation === 90 || printSettings.rotation === 270;
        const wrapperLeft = isRotated90
          ? pos.left + (pos.effW - currentTemplate.width) / 2
          : pos.left;
        const wrapperTop = isRotated90
          ? pos.top + (pos.effH - currentTemplate.height) / 2
          : pos.top;

        return (
          <div
            className="print-only-sheet"
            style={{
              width: `${paper.width}mm`,
              height: `${paper.height}mm`
            }}
          >
            <div
              className="print-cheque-wrapper"
              style={{
                left: `${wrapperLeft}mm`,
                top: `${wrapperTop}mm`,
                width: `${currentTemplate.width}mm`,
                height: `${currentTemplate.height}mm`,
                transform: printSettings.rotation ? `rotate(${printSettings.rotation}deg)` : undefined,
                transformOrigin: "center center",
                border: printSettings.showBorderGuide ? "1px dashed #777777" : "none"
              }}
            >
              {/* Barres d'encaissement Chèque barré (// Non endossable) dans le coin supérieur gauche */}
              {isCrossed && (
                <div
                  className="print-crossed-bars"
                  style={{
                    position: "absolute",
                    left: "0mm",
                    top: "0mm",
                    width: "30mm",
                    height: "30mm",
                    pointerEvents: "none",
                    overflow: "hidden"
                  }}
                >
                  <svg
                    style={{ width: "100%", height: "100%", display: "block" }}
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                  >
                    <line x1="0" y1="44" x2="44" y2="0" stroke="#000000" strokeWidth="2.8" strokeLinecap="square" />
                    <line x1="0" y1="74" x2="74" y2="0" stroke="#000000" strokeWidth="2.8" strokeLinecap="square" />
                    <text
                      x="29.5"
                      y="29.5"
                      transform="rotate(-45 29.5 29.5)"
                      fontSize="6"
                      fontWeight="bold"
                      fill="#000000"
                      letterSpacing="0.6"
                      textAnchor="middle"
                      dy="-1.2"
                    >
                      NON ENDOSSABLE
                    </text>
                  </svg>
                </div>
              )}

              <div
                className="print-field"
                style={{
                  left: `${currentTemplate.positions.beneficiary.x}mm`,
                  top: `${currentTemplate.positions.beneficiary.y}mm`,
                  fontSize: `${currentTemplate.positions.beneficiary.size}mm`
                }}
              >
                {beneficiary}
              </div>

              {(() => {
                const [wL1, wL2] = splitWordsByLimit(words, currentTemplate.wordsMaxLineLength || 55);
                return (
                  <>
                    <div
                      className="print-field"
                      style={{
                        left: `${currentTemplate.positions.words.x}mm`,
                        top: `${currentTemplate.positions.words.y}mm`,
                        fontSize: `${currentTemplate.positions.words.size}mm`,
                        maxWidth: currentTemplate.wordsLine1MaxWidth ? `${currentTemplate.wordsLine1MaxWidth}mm` : undefined
                      }}
                    >
                      {wL1}
                    </div>

                    {wL2 && (
                      <div
                        className="print-field"
                        style={{
                          left: `${currentTemplate.positions.wordsSecondLine.x}mm`,
                          top: `${currentTemplate.positions.wordsSecondLine.y}mm`,
                          fontSize: `${currentTemplate.positions.wordsSecondLine.size}mm`,
                          maxWidth: currentTemplate.wordsLine2MaxWidth ? `${currentTemplate.wordsLine2MaxWidth}mm` : undefined
                        }}
                      >
                        {wL2}
                      </div>
                    )}
                  </>
                );
              })()}

              <div
                className="print-field numeric"
                style={{
                  left: `${currentTemplate.positions.numeric.x}mm`,
                  top: `${currentTemplate.positions.numeric.y}mm`,
                  fontSize: `${currentTemplate.positions.numeric.size}mm`,
                  textAlign: currentTemplate.positions.numeric.align || "right"
                }}
              >
                {formattedNumeric}
              </div>

              <div
                className="print-field"
                style={{
                  left: `${currentTemplate.positions.place.x}mm`,
                  top: `${currentTemplate.positions.place.y}mm`,
                  fontSize: `${currentTemplate.positions.place.size}mm`
                }}
              >
                {place}
              </div>

              <div
                className="print-field"
                style={{
                  left: `${currentTemplate.positions.date.x}mm`,
                  top: `${currentTemplate.positions.date.y}mm`,
                  fontSize: `${currentTemplate.positions.date.size}mm`
                }}
              >
                {date ? date.split("-").reverse().join("/") : ""}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}