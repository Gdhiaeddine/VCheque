import React, { useState, useEffect, useMemo, useRef } from "react";
import { TopBar } from "./components/TopBar";
import { Sidebar, type NavTab } from "./components/Sidebar";
import { CheckForm } from "./components/CheckForm";
import { ChequePreview } from "./components/ChequePreview";
import { BankTemplateSelector } from "./components/BankTemplateSelector";
import { BankTemplatesPage } from "./components/BankTemplatesPage";
import { HistoryPage } from "./components/HistoryPage";
import { BeneficiariesPage } from "./components/BeneficiariesPage";
import { SettingsPage } from "./components/SettingsPage";
import { CalibrationPanel } from "./components/CalibrationPanel";
import { ActionBar } from "./components/ActionBar";
import { amountInFrenchWords, splitWordsByLimit, formatNumericAmount } from "./moneyToWords";
import { defaultBankTemplates, defaultPositions } from "./banksData";
import type { BankTemplate, FieldKey, PrintSettings, ChequeRecord, ChequeStatus, AppSettings, PrintAttemptRecord } from "./types";
import { PrintModal, getPaperDimensions, calculateChequePosition } from "./components/PrintModal";
import { PrintConfirmationModal } from "./components/PrintConfirmationModal";
import { ExportPdfModal } from "./components/ExportPdfModal";
import { SplashScreen } from "./components/SplashScreen";
import { saveChequeRecord, findDuplicateCheque, autoRecordBeneficiary, logPrintAttempt, updatePrintAttemptStatus } from "./services/db";
import { loadTemplatesFromConfigFile, saveTemplatesToConfigFile, LOCAL_TEMPLATES_KEY } from "./services/templatesConfig";
import { loadAppSettings, saveAppSettings, resetAppSettings } from "./services/appSettings";
import { exportChequeToPdf } from "./services/pdfExport";
import {
  CheckCircle2,
  AlertCircle,
  Info,
  X,
  AlertTriangle,
  RefreshCw,
  PanelRightClose,
  PanelRightOpen,
  Eye,
  EyeOff,
  Building2,
  Sliders,
  Printer,
  ZoomIn,
  Save,
  FileText
} from "lucide-react";

const STORAGE_KEY = "cheque-studio-models-v6";
const PRINT_SETTINGS_KEY = "cheque-studio-print-settings-v1";
const HISTORIQUE_STORAGE_KEY = "cheque-studio-history-v1";

export default function App() {
  // Splash Screen de démarrage (Virtanis Cheq)
  const [showSplash, setShowSplash] = useState<boolean>(true);

  // Signal d'initialisation réelle : vrai quand le chargement de la configuration est terminé
  const [initReady, setInitReady] = useState<boolean>(false);

  // 0. App Preferences & Settings
  const [appSettings, setAppSettings] = useState<AppSettings>(() => loadAppSettings());

  // 1. Core Cheque State (Default demo values matching specs)
  const [amount, setAmount] = useState<string>("125450.75");
  const [beneficiary, setBeneficiary] = useState<string>("Entreprise Exemple SARL");
  const [place, setPlace] = useState<string>(() => loadAppSettings().defaultPlace || "Alger");
  const [date, setDate] = useState<string>("2026-10-19");
  const [isCrossed, setIsCrossed] = useState<boolean>(() => loadAppSettings().defaultIsCrossed !== false);
  const [crossedWithText, setCrossedWithText] = useState<boolean>(() => loadAppSettings().defaultCrossedWithText !== false);
  const [showChequeNumber, setShowChequeNumber] = useState<boolean>(() => loadAppSettings().defaultShowChequeNumber ?? false);
  const [chequeNumber, setChequeNumber] = useState<string>("0048291");

  // 2. Templates & Calibration State
  const [templates, setTemplates] = useState<BankTemplate[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_TEMPLATES_KEY) || localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Si les modèles en cache manquent de logoUrl, enrichir avec les logos par défaut
          return parsed.map((item) => {
            const def = defaultBankTemplates.find((d) => d.id === item.id);
            if (def && (!item.logoUrl || item.logoUrl.includes("/src/assets/"))) {
              return { ...item, logoUrl: def.logoUrl };
            }
            return item;
          });
        }
      }
    } catch {
      // fallback
    }
    return defaultBankTemplates;
  });

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("el-salam");
  const [activeField, setActiveField] = useState<FieldKey | null>("beneficiary");
  const [showGuides, setShowGuides] = useState<boolean>(true);
  const [scale, setScale] = useState<number>(100);
  const [activeTab, setActiveTab] = useState<NavTab>("home");

  // Sidebar Layout States (Persistants pour confort utilisateur)
  const [isLeftCollapsed, setIsLeftCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("vcheque_left_collapsed") === "true";
    } catch {
      return false;
    }
  });

  const [isRightCollapsed, setIsRightCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("vcheque_right_collapsed") === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("vcheque_left_collapsed", String(isLeftCollapsed));
    } catch {}
  }, [isLeftCollapsed]);

  useEffect(() => {
    try {
      localStorage.setItem("vcheque_right_collapsed", String(isRightCollapsed));
    } catch {}
  }, [isRightCollapsed]);

  // Raccourci clavier Ctrl+B pour masquer/afficher le menu latéral
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "b" || e.key === "B")) {
        e.preventDefault();
        setIsLeftCollapsed((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

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

  // 5. Active Cheque tracking (Évite les doublons lors de l'enregistrement ou de la réimpression)
  const [activeChequeId, setActiveChequeId] = useState<string | null>(null);
  const [activeChequeStatus, setActiveChequeStatus] = useState<ChequeStatus | null>(null);
  const [activePrintCount, setActivePrintCount] = useState<number>(0);

  // Modal d'alerte doublon
  const [duplicateWarning, setDuplicateWarning] = useState<{
    isOpen: boolean;
    duplicateRecord: ChequeRecord;
    action: "save" | "print";
  } | null>(null);

  // Validation d'impression physique effective (post-impression)
  const [pendingPrintConfirmation, setPendingPrintConfirmation] = useState<{
    isOpen: boolean;
    attemptId: string;
    recordId: string;
    copyNumber: number;
    chequeData: {
      id: string;
      amount: string;
      beneficiary: string;
      bankName: string;
      date: string;
      copyNumber: number;
    };
  } | null>(null);

  // Modal de confirmation de nouveau chèque si des modifications sont non enregistrées
  const [newChequeModalOpen, setNewChequeModalOpen] = useState<boolean>(false);

  // Modal d'exportation PDF avec choix du format et options
  const [isExportPdfModalOpen, setIsExportPdfModalOpen] = useState<boolean>(false);

  // 6. Feedback / Toast
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
      .catch((err) => console.error("Erreur chargement modèles config:", err))
      .finally(() => setInitReady(true));
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

      if (e.key === "Escape") {
        setActiveField(null);
        return;
      }

      if (!activeField) {
        return;
      }

      const step = e.altKey ? 0.1 : e.shiftKey ? 2.0 : 0.5;
      const currentPos = currentTemplate.positions[activeField];
      if (!currentPos) return;

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

  // Détection si des données sont présentes sur le formulaire pour afficher le bouton "Nouveau chèque"
  const hasChequeData = useMemo(() => {
    return Boolean(
      amount.trim() ||
      (beneficiary.trim() && beneficiary.trim() !== "Entreprise Exemple SARL") ||
      activeChequeId !== null
    );
  }, [amount, beneficiary, activeChequeId]);

  // Détection fine si le chèque en cours a des modifications non enregistrées
  const isFormDirty = useMemo(() => {
    if (!activeChequeId) {
      const num = parseFloat(amount.replace(/\s/g, "").replace(",", "."));
      const hasAmount = !isNaN(num) && num > 0;
      const hasCustomBeneficiary = Boolean(
        beneficiary.trim() && beneficiary.trim() !== "Entreprise Exemple SARL"
      );
      return hasAmount || hasCustomBeneficiary;
    }
    const saved = history.find((h) => h.id === activeChequeId);
    if (!saved) return true;
    return (
      saved.amount !== amount ||
      saved.beneficiary !== (beneficiary.trim() || "Bénéficiaire non spécifié") ||
      saved.place !== (place.trim() || "Alger") ||
      saved.date !== date ||
      saved.bankTemplateId !== currentTemplate.id ||
      (saved.isCrossed !== false) !== isCrossed ||
      (saved.crossedWithText !== false) !== crossedWithText ||
      Boolean(saved.showChequeNumber) !== showChequeNumber ||
      (showChequeNumber && (saved.chequeNumber || "") !== (chequeNumber || ""))
    );
  }, [activeChequeId, history, amount, beneficiary, place, date, currentTemplate.id, isCrossed, crossedWithText, showChequeNumber, chequeNumber]);

  // Réinitialisation effective vers un nouveau chèque vierge
  const executeNewCheque = () => {
    setAmount("");
    setBeneficiary("");
    setPlace(appSettings.defaultPlace || "Alger");
    setDate(new Date().toISOString().split("T")[0]);
    setIsCrossed(appSettings.defaultIsCrossed !== false);
    setCrossedWithText(appSettings.defaultCrossedWithText !== false);
    setShowChequeNumber(appSettings.defaultShowChequeNumber ?? false);
    setChequeNumber("0048291");
    setActiveChequeId(null);
    setActiveChequeStatus(null);
    setActivePrintCount(0);
    setNewChequeModalOpen(false);
    setToast({ message: "Nouveau chèque vierge prêt pour la saisie.", type: "info" });
    setTimeout(() => {
      document.getElementById("amount-field")?.focus();
    }, 100);
  };

  // Clic sur "Nouveau chèque"
  const handleNewCheque = () => {
    if (!hasChequeData) return;
    if (isFormDirty) {
      setNewChequeModalOpen(true);
    } else {
      executeNewCheque();
    }
  };

  const executeSave = (targetId?: string) => {
    const rawVal = parseFloat(amount.replace(/\s/g, "").replace(",", "."));
    const now = new Date().toISOString();
    const recordId = targetId || activeChequeId || ("cheque-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7));
    const isExisting = Boolean(targetId || activeChequeId);
    const existingRecord = history.find((h) => h.id === recordId);

    const newRecord: ChequeRecord = {
      id: recordId,
      amount,
      beneficiary: beneficiary.trim() || "Bénéficiaire non spécifié",
      place: place.trim() || "Alger",
      date: date || new Date().toISOString().split("T")[0],
      bankTemplateId: currentTemplate.id,
      bankName: currentTemplate.name,
      status: isExisting && (activeChequeStatus === "printed" || existingRecord?.status === "printed") ? "printed" : "saved",
      printCount: existingRecord?.printCount ?? activePrintCount,
      isCrossed,
      crossedWithText,
      showChequeNumber,
      chequeNumber: showChequeNumber ? (chequeNumber.trim() || undefined) : undefined,
      createdAt: existingRecord?.createdAt || now,
      updatedAt: now,
      printedAt: existingRecord?.printedAt,
      lastPrintedAt: existingRecord?.lastPrintedAt
    };

    saveChequeRecord(newRecord).catch(console.error);
    if (newRecord.beneficiary && newRecord.beneficiary !== "Bénéficiaire non spécifié") {
      autoRecordBeneficiary(newRecord.beneficiary).catch(console.error);
    }
    setActiveChequeId(recordId);
    setActiveChequeStatus(newRecord.status);
    setActivePrintCount(newRecord.printCount || 0);

    setHistory((prev) => {
      const filtered = prev.filter((item) => item.id !== recordId);
      return [newRecord, ...filtered];
    });
    setHistoryRefreshTrigger((n) => n + 1);

    setToast({
      message: isExisting
        ? `Chèque mis à jour dans l'Historique (${rawVal.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} DZD).`
        : `Chèque enregistré avec succès dans l'Historique (${rawVal.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} DZD).`,
      type: "success"
    });
  };

  const handleSave = async () => {
    const rawVal = parseFloat(amount.replace(/\s/g, "").replace(",", "."));
    if (isNaN(rawVal) || rawVal <= 0) {
      setToast({ message: "Veuillez saisir un montant valide avant d'enregistrer le chèque.", type: "warning" });
      return;
    }

    // Si aucun ID actif, rechercher si un chèque identique existe déjà dans l'historique
    if (!activeChequeId) {
      const duplicate = await findDuplicateCheque({
        amount,
        beneficiary: beneficiary.trim() || "Bénéficiaire non spécifié",
        date: date || new Date().toISOString().split("T")[0],
        bankTemplateId: currentTemplate.id
      });

      if (duplicate) {
        setDuplicateWarning({
          isOpen: true,
          duplicateRecord: duplicate,
          action: "save"
        });
        return;
      }
    }

    executeSave();
  };

  const handleExportPdf = async (
    mode: "exact-cheque" | "sheet" = "exact-cheque",
    includeBackground: boolean = false,
    customFilename?: string
  ) => {
    const rawVal = parseFloat(amount.replace(/\s/g, "").replace(",", "."));
    if (isNaN(rawVal) || rawVal <= 0) {
      setToast({ message: "Veuillez saisir un montant valide avant d'exporter en PDF.", type: "warning" });
      return;
    }

    try {
      const res = await exportChequeToPdf({
        mode,
        template: currentTemplate,
        amount,
        formattedNumeric,
        words,
        beneficiary: beneficiary.trim() || "Bénéficiaire",
        place: place.trim() || "Alger",
        date: date || new Date().toISOString().split("T")[0],
        isCrossed,
        crossedWithText,
        showChequeNumber,
        chequeNumber: showChequeNumber ? (chequeNumber.trim() || undefined) : undefined,
        printSettings,
        includeBackground,
        filename: customFilename
      });

      if (res.canceled) {
        return;
      }

      const fileNameOnly = res.filePath ? res.filePath.split(/[\\/]/).pop() : null;
      setToast({
        message: fileNameOnly
          ? `PDF enregistré avec succès : ${fileNameOnly}`
          : `Fichier PDF exporté avec succès (${mode === "sheet" ? "Mise en page feuille" : "Format chèque 1:1"}).`,
        type: "success"
      });
    } catch (err) {
      console.error("Erreur génération PDF:", err);
      setToast({ message: "Erreur lors de la création du document PDF.", type: "warning" });
    }
  };

  const handlePrint = async () => {
    const rawVal = parseFloat(amount.replace(/\s/g, "").replace(",", "."));
    if (isNaN(rawVal) || rawVal <= 0) {
      setToast({ message: "Veuillez saisir un montant valide avant d'imprimer.", type: "warning" });
      return;
    }

    // Si aucun ID actif, rechercher si un chèque identique existe déjà dans l'historique
    if (!activeChequeId) {
      const duplicate = await findDuplicateCheque({
        amount,
        beneficiary: beneficiary.trim() || "Bénéficiaire non spécifié",
        date: date || new Date().toISOString().split("T")[0],
        bankTemplateId: currentTemplate.id
      });

      if (duplicate) {
        setDuplicateWarning({
          isOpen: true,
          duplicateRecord: duplicate,
          action: "print"
        });
        return;
      }
    }

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

    const now = new Date().toISOString();
    const recordId = activeChequeId || ("cheque-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7));
    const existingRecord = history.find((h) => h.id === recordId);
    const targetCopyNumber = (existingRecord?.printCount || activePrintCount || 0) + 1;
    const attemptId = "attempt-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7);

    // 1. Enregistrer immédiatement la tentative dans le Journal d'Audit au statut "demandé" (requested)
    const attemptRecord: PrintAttemptRecord = {
      id: attemptId,
      chequeId: recordId,
      beneficiary: beneficiary.trim() || "Bénéficiaire non spécifié",
      amount,
      bankName: currentTemplate.name,
      bankTemplateId: currentTemplate.id,
      paperFormat: printSettings.paperFormat,
      placement: printSettings.placement,
      status: "requested",
      attemptedAt: now,
      copyNumber: targetCopyNumber
    };
    logPrintAttempt(attemptRecord).catch(console.error);

    // 2. Si le chèque n'a pas encore été sauvegardé en base, l'enregistrer comme brouillon pour préserver l'ID
    if (!existingRecord) {
      const draftRecord: ChequeRecord = {
        id: recordId,
        amount,
        beneficiary: beneficiary.trim() || "Bénéficiaire non spécifié",
        place: place.trim() || "Alger",
        date: date || new Date().toISOString().split("T")[0],
        bankTemplateId: currentTemplate.id,
        bankName: currentTemplate.name,
        status: activeChequeStatus || "saved",
        printCount: activePrintCount || 0,
        isCrossed,
        crossedWithText,
        showChequeNumber,
        chequeNumber: showChequeNumber ? (chequeNumber.trim() || undefined) : undefined,
        createdAt: now,
        updatedAt: now
      };
      saveChequeRecord(draftRecord).catch(console.error);
      setActiveChequeId(recordId);
      setHistory((prev) => [draftRecord, ...prev.filter((item) => item.id !== recordId)]);
    }

    setToast({
      message: "Envoi à l'imprimante... Veuillez valider la sortie papier après impression.",
      type: "info"
    });

    // 3. Lancer le dialogue système d'impression et préparer le modal de confirmation post-impression
    setTimeout(() => {
      window.print();
      setPendingPrintConfirmation({
        isOpen: true,
        attemptId,
        recordId,
        copyNumber: targetCopyNumber,
        chequeData: {
          id: recordId,
          amount,
          beneficiary: beneficiary.trim() || "Bénéficiaire non spécifié",
          bankName: currentTemplate.name,
          date: date || new Date().toISOString().split("T")[0],
          copyNumber: targetCopyNumber
        }
      });
    }, 200);
  };

  const handlePostPrintSuccess = async () => {
    if (!pendingPrintConfirmation) return;
    const { attemptId, recordId, copyNumber } = pendingPrintConfirmation;
    const now = new Date().toISOString();

    // 1. Confirmer la tentative dans le journal d'audit
    await updatePrintAttemptStatus(attemptId, "confirmed", { confirmedAt: now });

    // 2. Mettre à jour le chèque comme imprimé (ou réimprimé)
    const existingRecord = history.find((h) => h.id === recordId);
    const printedRecord: ChequeRecord = {
      id: recordId,
      amount,
      beneficiary: beneficiary.trim() || "Bénéficiaire non spécifié",
      place: place.trim() || "Alger",
      date: date || new Date().toISOString().split("T")[0],
      bankTemplateId: currentTemplate.id,
      bankName: currentTemplate.name,
      status: "printed",
      printCount: copyNumber,
      isCrossed,
      crossedWithText,
      showChequeNumber,
      chequeNumber: showChequeNumber ? (chequeNumber.trim() || undefined) : undefined,
      createdAt: existingRecord?.createdAt || now,
      updatedAt: now,
      printedAt: existingRecord?.printedAt || now,
      lastPrintedAt: now
    };

    await saveChequeRecord(printedRecord);
    if (printedRecord.beneficiary && printedRecord.beneficiary !== "Bénéficiaire non spécifié") {
      autoRecordBeneficiary(printedRecord.beneficiary).catch(console.error);
    }

    setActiveChequeId(recordId);
    setActiveChequeStatus("printed");
    setActivePrintCount(copyNumber);

    setHistory((prev) => [printedRecord, ...prev.filter((item) => item.id !== recordId)]);
    setHistoryRefreshTrigger((n) => n + 1);
    setPendingPrintConfirmation(null);

    setToast({
      message: copyNumber > 1
        ? `Réimpression N°${copyNumber} confirmée avec succès.`
        : "Impression physique validée et enregistrée avec succès.",
      type: "success"
    });
  };

  const handlePostPrintFailure = async (reason: string) => {
    if (!pendingPrintConfirmation) return;
    const { attemptId } = pendingPrintConfirmation;
    await updatePrintAttemptStatus(attemptId, "failed", { failureReason: reason });
    setPendingPrintConfirmation(null);
    setHistoryRefreshTrigger((n) => n + 1);

    setToast({
      message: `Incident d'impression consigné (${reason}). Le chèque est conservé en brouillon.`,
      type: "warning"
    });
  };

  const handlePostPrintRetry = () => {
    window.print();
  };

  // Handlers pour l'Historique
  const handleCloneToHome = (record: ChequeRecord) => {
    setAmount(record.amount);
    setBeneficiary(record.beneficiary);
    setPlace(record.place);
    setDate(record.date);
    setIsCrossed(record.isCrossed !== false);
    setCrossedWithText(record.crossedWithText !== false);
    if (record.chequeNumber) {
      setChequeNumber(record.chequeNumber);
      setShowChequeNumber(true);
    } else {
      setShowChequeNumber(record.showChequeNumber ?? false);
    }
    if (templates.some((t) => t.id === record.bankTemplateId)) {
      setSelectedTemplateId(record.bankTemplateId);
    }
    setActiveChequeId(record.id);
    setActiveChequeStatus(record.status);
    setActivePrintCount(record.printCount || (record.status === "printed" ? 1 : 0));
    setActiveTab("home");
    setToast({
      message: `Chèque chargé pour modification (ID existant conservé).`,
      type: "info"
    });
  };

  const handleReprintFromHistory = (record: ChequeRecord) => {
    setAmount(record.amount);
    setBeneficiary(record.beneficiary);
    setPlace(record.place);
    setDate(record.date);
    setIsCrossed(record.isCrossed !== false);
    setCrossedWithText(record.crossedWithText !== false);
    if (record.chequeNumber) {
      setChequeNumber(record.chequeNumber);
      setShowChequeNumber(true);
    } else {
      setShowChequeNumber(record.showChequeNumber ?? false);
    }
    if (templates.some((t) => t.id === record.bankTemplateId)) {
      setSelectedTemplateId(record.bankTemplateId);
    }
    setActiveChequeId(record.id);
    setActiveChequeStatus(record.status);
    setActivePrintCount(record.printCount || 1);
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

  const handleCreateChequeForBeneficiary = (beneficiaryName: string) => {
    setBeneficiary(beneficiaryName);
    setAmount("");
    setActiveChequeId(null);
    setActiveChequeStatus(null);
    setActivePrintCount(0);
    setActiveTab("home");
    setToast({
      message: `Bénéficiaire « ${beneficiaryName} » sélectionné. Saisissez le montant.`,
      type: "info"
    });
    setTimeout(() => {
      document.getElementById("amount-field")?.focus();
    }, 120);
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
      {/* 0. Écran de démarrage (Virtanis Cheq) — lié au signal d'initialisation réel */}
      {showSplash && <SplashScreen onFinish={() => setShowSplash(false)} initReady={initReady} />}

      {/* 1. Barre supérieure */}
      <TopBar onOpenSettings={() => setActiveTab("settings")} />

      {/* 2. Corps de l'application (Barre latérale + Zone centrale + Colonne droite) */}
      <div className="app-body">
        {/* A. Barre latérale gauche */}
        <Sidebar
          activeTab={activeTab}
          onSelectTab={(tab) => setActiveTab(tab)}
          isCollapsed={isLeftCollapsed}
          onToggleCollapse={() => setIsLeftCollapsed((v) => !v)}
        />

        {activeTab === "templates" ? (
          <BankTemplatesPage
            templates={templates}
            selectedTemplateId={selectedTemplateId}
            onSelectTemplate={setSelectedTemplateId}
            onSaveTemplate={handleSaveCustomTemplate}
            onDeleteTemplate={handleDeleteTemplate}
            onImportTemplates={(imported) => {
              const enriched = imported.map((item) => {
                const def = defaultBankTemplates.find((d) => d.id === item.id);
                if (def && (!item.logoUrl || item.logoUrl.includes("/src/assets/"))) {
                  return { ...item, logoUrl: def.logoUrl };
                }
                return item;
              });
              setTemplates(enriched);
              if (enriched.length > 0) {
                setSelectedTemplateId(enriched[0].id);
              }
              setToast({
                message: `${enriched.length} modèle(s) importé(s) avec succès avec logos dans la configuration.`,
                type: "success"
              });
            }}
            onBackToHome={() => setActiveTab("home")}
          />
        ) : activeTab === "history" ? (
          <HistoryPage
            history={history}
            templates={templates}
            refreshTrigger={historyRefreshTrigger}
            onCloneToHome={handleCloneToHome}
            onReprintCheque={handleReprintFromHistory}
            onDeleteRecord={handleDeleteHistoryRecord}
            onClearHistory={handleClearHistory}
            onBackToHome={() => setActiveTab("home")}
          />
        ) : activeTab === "beneficiaries" ? (
          <BeneficiariesPage
            onCreateChequeForBeneficiary={handleCreateChequeForBeneficiary}
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
                <div className="header-main-title-row">
                  <div>
                    <div className="title-with-badge">
                      <h1 className="history-main-title">Remplir un chèque</h1>
                      <span
                        className="db-badge"
                        title="L'aperçu du chèque se met à jour instantanément à la saisie"
                      >
                        Aperçu en direct
                      </span>
                    </div>
                    <p className="history-main-subtitle">
                      Saisissez les informations du chèque et prévisualisez le résultat.
                    </p>
                  </div>
                </div>
              </div>

              {/* Barre d'actions supérieure (Nouveau chèque, Enregistrer, Modifier, Imprimer) */}
              <ActionBar
                onNew={handleNewCheque}
                showNewButton={hasChequeData}
                onEdit={handleEditFocus}
                onSave={handleSave}
                onPrint={handlePrint}
                onExportPdf={() => {
                  const rawVal = parseFloat(amount.replace(/\s/g, "").replace(",", "."));
                  if (isNaN(rawVal) || rawVal <= 0) {
                    setToast({ message: "Veuillez saisir un montant valide avant d'exporter en PDF.", type: "warning" });
                    return;
                  }
                  setIsExportPdfModalOpen(true);
                }}
                activeStatus={activeChequeStatus}
                printCount={activePrintCount}
              />

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
                  crossedWithText={crossedWithText}
                  onChangeCrossedWithText={setCrossedWithText}
                  showChequeNumber={showChequeNumber}
                  onChangeShowChequeNumber={setShowChequeNumber}
                  chequeNumber={chequeNumber}
                  onChangeChequeNumber={setChequeNumber}
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
                  crossedWithText={crossedWithText}
                  showChequeNumber={showChequeNumber}
                  chequeNumber={chequeNumber}
                  formattedNumeric={formattedNumeric}
                  activeField={activeField}
                  onSelectField={setActiveField}
                  onUpdateFieldPosition={handleUpdateFieldPosition}
                  showGuides={showGuides}
                  scale={scale}
                  onChangeScale={setScale}
                />
              </div>

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
            <aside className={`right-panel-column ${isRightCollapsed ? "collapsed" : ""}`}>
              {/* En-tête avec bouton de réduction */}
              <div className="right-panel-header">
                {!isRightCollapsed && (
                  <span className="right-panel-title">Outils & Calibrage</span>
                )}
                <button
                  type="button"
                  className="right-panel-toggle-btn"
                  onClick={() => setIsRightCollapsed((prev) => !prev)}
                  title={isRightCollapsed ? "Développer le volet (Outils & Calibrage)" : "Réduire le volet (icônes seules)"}
                  aria-label={isRightCollapsed ? "Développer le volet" : "Réduire le volet"}
                >
                  {isRightCollapsed ? <PanelRightOpen size={18} /> : <PanelRightClose size={18} />}
                </button>
              </div>

              {isRightCollapsed ? (
                /* Mode compact : Dock d'icônes avec raccourcis rapides */
                <div className="right-panel-dock">
                  {/* Modèle de banque actif */}
                  <button
                    type="button"
                    className="right-dock-btn bank-dock-btn"
                    onClick={() => setIsRightCollapsed(false)}
                    title={`Modèle actif : ${currentTemplate.name}\n(Cliquer pour développer)`}
                    aria-label={`Modèle : ${currentTemplate.name}`}
                  >
                    {currentTemplate.logoUrl ? (
                      <img src={currentTemplate.logoUrl} alt={currentTemplate.shortName} className="dock-bank-logo-img" />
                    ) : (
                      <Building2 size={24} />
                    )}
                  </button>

                  <div className="dock-separator" />

                  {/* Toggle Repères visuels */}
                  <button
                    type="button"
                    className={`right-dock-btn ${showGuides ? "active" : ""}`}
                    onClick={() => setShowGuides((v) => !v)}
                    title={showGuides ? "Masquer la grille et les repères mm" : "Afficher la grille et les repères mm"}
                    aria-label="Repères visuels"
                  >
                    {showGuides ? <Eye size={18} /> : <EyeOff size={18} />}
                  </button>

                  {/* Calibrage des coordonnées */}
                  <button
                    type="button"
                    className="right-dock-btn"
                    onClick={() => setIsRightCollapsed(false)}
                    title="Calibrage précis des coordonnées (Cliquer pour ouvrir)"
                    aria-label="Calibrage"
                  >
                    <Sliders size={18} />
                  </button>

                  {/* Zoom / Échelle rapide */}
                  <button
                    type="button"
                    className="right-dock-btn"
                    onClick={() => setScale((s) => (s >= 120 ? 80 : s + 20))}
                    title={`Zoom aperçu : ${scale}%\n(Cliquer pour modifier)`}
                    aria-label="Zoom"
                  >
                    <ZoomIn size={18} />
                    <span className="dock-mini-text">{scale}%</span>
                  </button>

                  <div className="dock-separator" />

                  {/* Impression feuille de test */}
                  <button
                    type="button"
                    className="right-dock-btn test-print-btn"
                    onClick={handlePrintTestPage}
                    title="Imprimer une feuille de test de calibrage"
                    aria-label="Imprimer feuille test"
                  >
                    <Printer size={18} />
                  </button>
                </div>
              ) : (
                /* Mode complet */
                <div className="right-panel-content">
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
                </div>
              )}
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
        onExportPdf={() => handleExportPdf("sheet")}
        settings={printSettings}
        onChangeSettings={setPrintSettings}
        currentTemplate={currentTemplate}
        amount={amount}
        beneficiary={beneficiary}
        date={date}
        isCrossed={isCrossed}
        crossedWithText={crossedWithText}
        showChequeNumber={showChequeNumber}
        chequeNumber={chequeNumber}
        formattedNumeric={formattedNumeric}
        isReprint={activeChequeStatus === "printed" || activePrintCount > 0}
        printCount={activePrintCount}
      />

      {/* Modal d'Exportation PDF haute précision (Format chèque 1:1 ou Feuille A4, avec ou sans fond bancaire) */}
      <ExportPdfModal
        isOpen={isExportPdfModalOpen}
        onClose={() => setIsExportPdfModalOpen(false)}
        currentTemplate={currentTemplate}
        amount={amount}
        beneficiary={beneficiary}
        date={date}
        onConfirmExport={async ({ mode, includeBackground, filename }) => {
          await handleExportPdf(mode, includeBackground, filename);
        }}
      />

      {/* Modal d'Avertissement de Doublon (Meilleure pratique bancaire) */}
      {duplicateWarning && (
        <div className="duplicate-modal-overlay" role="dialog" aria-modal="true">
          <div className="duplicate-modal-content">
            <div className="duplicate-modal-header">
              <div className="duplicate-icon-box">
                <AlertTriangle size={22} />
              </div>
              <div>
                <h3 className="duplicate-modal-title">Chèque identique détecté dans l'historique</h3>
                <p className="duplicate-modal-subtitle">
                  Un chèque avec les mêmes coordonnées (Montant, Bénéficiaire, Banque, Date) a déjà été enregistré ou imprimé.
                </p>
              </div>
            </div>

            <div className="duplicate-modal-body">
              <div className="duplicate-record-card">
                <div className="duplicate-detail-row">
                  <span className="label">Bénéficiaire :</span>
                  <span className="value">{duplicateWarning.duplicateRecord.beneficiary}</span>
                </div>
                <div className="duplicate-detail-row">
                  <span className="label">Montant :</span>
                  <span className="value">
                    {Number(duplicateWarning.duplicateRecord.amount.replace(/\s/g, "").replace(",", ".")).toLocaleString("fr-FR", { minimumFractionDigits: 2 })} DZD
                  </span>
                </div>
                <div className="duplicate-detail-row">
                  <span className="label">Banque :</span>
                  <span className="value">{duplicateWarning.duplicateRecord.bankName}</span>
                </div>
                <div className="duplicate-detail-row">
                  <span className="label">Statut actuel :</span>
                  <span className="value">
                    {duplicateWarning.duplicateRecord.status === "printed"
                      ? `Imprimé (x${duplicateWarning.duplicateRecord.printCount || 1})`
                      : "Enregistré (brouillon)"}
                  </span>
                </div>
              </div>

              <p className="duplicate-modal-question">
                Souhaitez-vous réimprimer / mettre à jour ce chèque sans créer de doublon dans l'historique, ou émettre un nouveau chèque distinct ?
              </p>
            </div>

            <div className="duplicate-modal-actions">
              <div className="duplicate-modal-actions-buttons">
                <button
                  type="button"
                  className="btn-duplicate-new"
                  onClick={() => {
                    const action = duplicateWarning.action;
                    setDuplicateWarning(null);
                    if (action === "save") {
                      executeSave();
                    } else {
                      setIsPrintModalOpen(true);
                    }
                  }}
                >
                  Nouveau chèque distinct
                </button>

                <button
                  type="button"
                  className="btn-duplicate-update"
                  onClick={() => {
                    const target = duplicateWarning.duplicateRecord;
                    const action = duplicateWarning.action;
                    setActiveChequeId(target.id);
                    setActiveChequeStatus(target.status);
                    setActivePrintCount(target.printCount || (target.status === "printed" ? 1 : 0));
                    setDuplicateWarning(null);

                    if (action === "save") {
                      executeSave(target.id);
                    } else {
                      setIsPrintModalOpen(true);
                    }
                  }}
                >
                  <RefreshCw size={14} />
                  <span>
                    {duplicateWarning.duplicateRecord.status === "printed"
                      ? "Réimprimer ce chèque (Mise à jour)"
                      : "Mettre à jour ce chèque"}
                  </span>
                </button>
              </div>

              <button
                type="button"
                className="btn-duplicate-cancel"
                onClick={() => setDuplicateWarning(null)}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmation Nouveau Chèque (Protection des modifications non enregistrées) */}
      {newChequeModalOpen && (
        <div className="duplicate-modal-overlay" role="dialog" aria-modal="true">
          <div className="duplicate-modal-content">
            <div className="duplicate-modal-header">
              <div className="duplicate-icon-box gold">
                <AlertCircle size={22} />
              </div>
              <div>
                <h3 className="duplicate-modal-title">
                  {activeChequeId
                    ? "Enregistrer les modifications avant de créer un nouveau chèque ?"
                    : "Enregistrer ce chèque avant de commencer un nouveau ?"}
                </h3>
                <p className="duplicate-modal-subtitle">
                  {activeChequeId
                    ? "Ce chèque a été modifié. Souhaitez-vous enregistrer vos modifications dans l'historique avant de repartir sur un chèque vierge ?"
                    : "Le chèque en cours contient des informations non enregistrées. Souhaitez-vous le sauvegarder dans l'historique ?"}
                </p>
              </div>
            </div>

            <div className="duplicate-modal-body">
              <div className="duplicate-record-card">
                <div className="duplicate-detail-row">
                  <span className="label">Bénéficiaire :</span>
                  <span className="value">{beneficiary.trim() || "Bénéficiaire non spécifié"}</span>
                </div>
                <div className="duplicate-detail-row">
                  <span className="label">Montant :</span>
                  <span className="value">
                    {formattedNumeric}
                  </span>
                </div>
                <div className="duplicate-detail-row">
                  <span className="label">Modèle Banque :</span>
                  <span className="value">{currentTemplate.name}</span>
                </div>
                <div className="duplicate-detail-row">
                  <span className="label">Date :</span>
                  <span className="value">{date}</span>
                </div>
              </div>

              <p className="duplicate-modal-question">
                Que souhaitez-vous faire ?
              </p>
            </div>

            <div className="duplicate-modal-actions">
              <div className="duplicate-modal-actions-buttons">
                {/* 1. Enregistrer / Mettre à jour puis ouvrir un nouveau */}
                <button
                  type="button"
                  className="btn-duplicate-update"
                  onClick={() => {
                    const rawVal = parseFloat(amount.replace(/\s/g, "").replace(",", "."));
                    if (!isNaN(rawVal) && rawVal > 0) {
                      executeSave(activeChequeId || undefined);
                    }
                    executeNewCheque();
                  }}
                  title="Enregistrer et ouvrir un nouveau chèque vierge"
                >
                  <Save size={15} />
                  <span>
                    {activeChequeId ? "Mettre à jour et nouveau" : "Enregistrer et nouveau"}
                  </span>
                </button>

                {/* 2. Abandonner les modifications et créer un nouveau */}
                <button
                  type="button"
                  className="btn-duplicate-new btn-discard-danger"
                  onClick={executeNewCheque}
                  title="Abandonner les modifications actuelles et ouvrir un chèque vierge"
                >
                  Ignorer les modifications
                </button>
              </div>

              {/* 3. Annuler et continuer l'édition */}
              <button
                type="button"
                className="btn-duplicate-cancel"
                onClick={() => setNewChequeModalOpen(false)}
              >
                Continuer l'édition
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Validation d'Impression Physique (Distinction demandé vs confirmé) */}
      {pendingPrintConfirmation && (
        <PrintConfirmationModal
          isOpen={pendingPrintConfirmation.isOpen}
          attemptId={pendingPrintConfirmation.attemptId}
          chequeData={pendingPrintConfirmation.chequeData}
          onConfirmSuccess={handlePostPrintSuccess}
          onReportFailure={handlePostPrintFailure}
          onRetryPrint={handlePostPrintRetry}
        />
      )}

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
              {/* Barres d'encaissement Chèque barré (//) avec ou sans texte dans le coin supérieur gauche */}
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
                    {crossedWithText && (
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
                    )}
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

              {showChequeNumber && chequeNumber && currentTemplate.positions.chequeNumber && (
                <div
                  className="print-field"
                  style={{
                    left: `${currentTemplate.positions.chequeNumber.x}mm`,
                    top: `${currentTemplate.positions.chequeNumber.y}mm`,
                    fontSize: `${currentTemplate.positions.chequeNumber.size}mm`,
                    textAlign: currentTemplate.positions.chequeNumber.align || "left"
                  }}
                >
                  {chequeNumber}
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}