import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { TopBar } from "./components/TopBar";
import { Sidebar, type NavTab } from "./components/Sidebar";
import { CheckForm } from "./components/CheckForm";
import { ChequePreview } from "./components/ChequePreview";
import { BankTemplateSelector } from "./components/BankTemplateSelector";
import { BankTemplatesPage } from "./components/BankTemplatesPage";
import { HistoryPage } from "./components/HistoryPage";
import { BeneficiariesPage } from "./components/BeneficiariesPage";
import { ReconciliationPage } from "./components/ReconciliationPage";
import { SettingsPage } from "./components/SettingsPage";
import { CalibrationPanel } from "./components/CalibrationPanel";
import { ActionBar } from "./components/ActionBar";
import { amountInFrenchWords, splitWordsByLimit, formatNumericAmount } from "./moneyToWords";
import { defaultBankTemplates, defaultPositions } from "./banksData";
import type {
  BankTemplate,
  FieldKey,
  PrintSettings,
  ChequeRecord,
  ChequeStatus,
  AppSettings,
  PrintAttemptRecord,
  CompanyRecord,
  BankAccountRecord,
  ChequeBookRecord,
  BatchItem,
  BatchExecutionReport,
  UserRecord,
  SecuritySettings
} from "./types";
import { PrintModal, getPaperDimensions, calculateChequePosition } from "./components/PrintModal";
import { PrintConfirmationModal } from "./components/PrintConfirmationModal";
import { ExportPdfModal } from "./components/ExportPdfModal";
import { SplashScreen } from "./components/SplashScreen";
import { CompanyManagerModal } from "./components/CompanyManagerModal";
import { BankAccountsModal } from "./components/BankAccountsModal";
import { BatchImportModal } from "./components/BatchImportModal";
import { BatchPrintRunnerModal } from "./components/BatchPrintRunnerModal";
import { BatchReportModal } from "./components/BatchReportModal";
import { LockScreenModal } from "./components/LockScreenModal";
import { UserSessionManagerModal } from "./components/UserSessionManagerModal";
import { AuditTrailModal } from "./components/AuditTrailModal";
import { BackupRestoreModal } from "./components/BackupRestoreModal";
import { hasPermission, getPermissionErrorMessage } from "./services/permissions";
import {
  saveChequeRecord,
  findDuplicateCheque,
  autoRecordBeneficiary,
  logPrintAttempt,
  updatePrintAttemptStatus,
  getActiveCompany,
  getBankAccounts,
  getChequeBooks,
  saveChequeBook,
  saveBatchCheques,
  getActiveChequeBookForAccount,
  incrementChequeBookNumber,
  updateAccountBalance,
  getSecuritySettings,
  saveSecuritySettings,
  getActiveUser,
  setActiveUser,
  logAuditEvent,
  getActiveCompanyId
} from "./services/db";
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

  // 1. Core Cheque State (Default blank values for fresh entry)
  const [amount, setAmount] = useState<string>("");
  const [beneficiary, setBeneficiary] = useState<string>("");
  const [place, setPlace] = useState<string>(() => loadAppSettings().defaultPlace || "Alger");
  const [date, setDate] = useState<string>(() => new Date().toISOString().split("T")[0]);
  const [isCrossed, setIsCrossed] = useState<boolean>(() => loadAppSettings().defaultIsCrossed !== false);
  const [crossedWithText, setCrossedWithText] = useState<boolean>(() => loadAppSettings().defaultCrossedWithText !== false);
  const [showChequeNumber, setShowChequeNumber] = useState<boolean>(() => loadAppSettings().defaultShowChequeNumber ?? false);
  const [chequeNumber, setChequeNumber] = useState<string>("");

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

  // Multi-dossiers d'entreprise & Comptes bancaires
  const [activeCompany, setActiveCompany] = useState<CompanyRecord | null>(null);
  const [showCompanyModal, setShowCompanyModal] = useState<boolean>(false);
  const [showBankAccountsModal, setShowBankAccountsModal] = useState<boolean>(false);
  const [companyAccounts, setCompanyAccounts] = useState<BankAccountRecord[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(() => {
    try {
      const compId = getActiveCompanyId();
      const saved = localStorage.getItem(`vcheque_selected_account_${compId}`);
      if (saved === "none") return null;
      if (saved) return saved;
    } catch {
      // fallback
    }
    return null;
  });
  const [activeChequeBook, setActiveChequeBook] = useState<ChequeBookRecord | null>(null);

  // Module 1.6 : Importation et traitement en lot
  const [showBatchImportModal, setShowBatchImportModal] = useState<boolean>(false);
  const [showBatchRunnerModal, setShowBatchRunnerModal] = useState<boolean>(false);
  const [showBatchReportModal, setShowBatchReportModal] = useState<boolean>(false);
  const [batchRunnerItems, setBatchRunnerItems] = useState<BatchItem[]>([]);
  const [batchRunnerAccountId, setBatchRunnerAccountId] = useState<string | undefined>(undefined);
  const [batchRunnerChequeBookId, setBatchRunnerChequeBookId] = useState<string | undefined>(undefined);
  const [batchRunnerAutoRecordBen, setBatchRunnerAutoRecordBen] = useState<boolean>(true);
  const [batchExecutionReport, setBatchExecutionReport] = useState<BatchExecutionReport | null>(null);
  const [allChequeBooks, setAllChequeBooks] = useState<ChequeBookRecord[]>([]);

  // Module 1.8 : Sécurité, Rôles, Authentification & Traçabilité
  const [securitySettings, setSecuritySettings] = useState<SecuritySettings>(() => getSecuritySettings());
  const [currentUser, setCurrentUser] = useState<UserRecord | null>(() => getActiveUser());
  const [isLocked, setIsLocked] = useState<boolean>(() => {
    try {
      const s = getSecuritySettings();
      return !!s.isAuthEnabled;
    } catch {
      return false;
    }
  });
  const [showUserManagerModal, setShowUserManagerModal] = useState<boolean>(false);
  const [showAuditTrailModal, setShowAuditTrailModal] = useState<boolean>(false);
  const [showBackupRestoreModal, setShowBackupRestoreModal] = useState<boolean>(false);
  const [backupModalInitialTab, setBackupModalInitialTab] = useState<"export" | "restore" | "auto">("export");

  // Synchronisation des paramètres de sécurité lors de changements
  const refreshSecurity = useCallback(() => {
    const s = getSecuritySettings();
    setSecuritySettings(s);
    const u = getActiveUser();
    setCurrentUser(u);
  }, []);

  // Verrouillage automatique après inactivité
  useEffect(() => {
    if (!securitySettings.isAuthEnabled || !securitySettings.autoLockTimeoutMinutes || securitySettings.autoLockTimeoutMinutes <= 0) {
      return;
    }

    let timer: any = null;
    const timeoutMs = securitySettings.autoLockTimeoutMinutes * 60 * 1000;

    const resetTimer = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        setIsLocked(true);
        logAuditEvent(
          "auth_lock",
          "security",
          `Verrouillage automatique après ${securitySettings.autoLockTimeoutMinutes} minutes d'inactivité`
        ).catch(console.warn);
      }, timeoutMs);
    };

    const activityEvents = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    activityEvents.forEach((evt) => window.addEventListener(evt, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      if (timer) clearTimeout(timer);
      activityEvents.forEach((evt) => window.removeEventListener(evt, resetTimer));
    };
  }, [securitySettings.isAuthEnabled, securitySettings.autoLockTimeoutMinutes]);

  // 6. Feedback / Toast
  const [toast, setToast] = useState<{ message: string; type: "success" | "info" | "warning" } | null>(null);

  // Charger les comptes bancaires et chéquiers de l'entreprise
  const loadCompanyAccounts = useCallback(async (companyId: string) => {
    try {
      const list = await getBankAccounts(companyId);
      setCompanyAccounts(list);
      if (list.length > 0) {
        const key = `vcheque_selected_account_${companyId}`;
        const savedPref = localStorage.getItem(key);
        if (savedPref === "none") {
          // L'utilisateur a explicitement dissocié le compte : conserver l'état dissocié
          setSelectedAccountId(null);
          setActiveChequeBook(null);
        } else if (savedPref && list.some((a) => a.id === savedPref)) {
          // Restaurer le compte précédemment sélectionné par l'utilisateur
          setSelectedAccountId(savedPref);
        } else if (!savedPref) {
          // Première utilisation : initialiser avec le compte par défaut de l'entreprise
          const def = list.find((a) => a.isDefault) || list[0];
          setSelectedAccountId(def.id);
          try {
            localStorage.setItem(key, def.id);
          } catch {}
        } else {
          // Le compte précédemment sauvegardé n'existe plus dans la liste : dissocier
          setSelectedAccountId(null);
          setActiveChequeBook(null);
          try {
            localStorage.setItem(key, "none");
          } catch {}
        }
      } else {
        setSelectedAccountId(null);
        setActiveChequeBook(null);
      }
    } catch (err) {
      console.warn("Erreur chargement comptes bancaires entreprise:", err);
    }
  }, []);

  // Charger tous les chéquiers associés aux comptes de l'entreprise
  const refreshChequeBooks = useCallback(async () => {
    if (companyAccounts.length === 0) {
      setAllChequeBooks([]);
      return;
    }
    try {
      const lists = await Promise.all(
        companyAccounts.map((acc) => getChequeBooks(acc.id))
      );
      setAllChequeBooks(lists.flat());
    } catch (err) {
      console.warn("Erreur chargement chéquiers:", err);
    }
  }, [companyAccounts]);

  useEffect(() => {
    refreshChequeBooks();
  }, [refreshChequeBooks]);

  // Multi-sociétés : chargement de l'entreprise active et écoute des changements de dossier
  useEffect(() => {
    const loadCompany = async () => {
      try {
        const comp = await getActiveCompany();
        setActiveCompany(comp);
        if (comp) {
          loadCompanyAccounts(comp.id);
        }
      } catch (err) {
        console.warn("Erreur chargement active company:", err);
      }
    };
    loadCompany();

    const handleCompanyChanged = (e: any) => {
      loadCompany();
      setHistoryRefreshTrigger((n) => n + 1);
    };

    window.addEventListener("vcheque:company-changed", handleCompanyChanged);
    return () => window.removeEventListener("vcheque:company-changed", handleCompanyChanged);
  }, [loadCompanyAccounts]);

  // Synchronisation du chéquier actif et du modèle bancaire lors du changement de compte sélectionné
  useEffect(() => {
    if (selectedAccountId) {
      getActiveChequeBookForAccount(selectedAccountId)
        .then((book) => {
          setActiveChequeBook(book);
          if (book && book.currentNumber) {
            setChequeNumber((prev) => (prev.trim() === "" ? book.currentNumber : prev));
            setShowChequeNumber(appSettings.defaultShowChequeNumber ?? false);
          }
        })
        .catch(console.warn);

      const acc = companyAccounts.find((a) => a.id === selectedAccountId);
      if (acc && acc.bankTemplateId) {
        const tplExists = templates.some((t) => t.id === acc.bankTemplateId);
        if (tplExists) {
          setSelectedTemplateId(acc.bankTemplateId);
        }
      }
    } else {
      setActiveChequeBook(null);
    }
  }, [selectedAccountId, companyAccounts, templates]);

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
    if (!amount.trim()) return "";
    return amountInFrenchWords(amount, {
      letterCase: appSettings.letterCase,
      currencyTextVariant: appSettings.currencyTextVariant,
      surroundSymbol: appSettings.textSurroundSymbol,
      zeroCentsMention: appSettings.zeroCentsMention
    });
  }, [amount, appSettings]);

  // Formatted numeric amount with security hashes and currency according to settings
  const formattedNumeric = useMemo(() => {
    if (!amount.trim()) return "";
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
      beneficiary.trim() ||
      chequeNumber.trim() ||
      activeChequeId !== null
    );
  }, [amount, beneficiary, chequeNumber, activeChequeId]);

  // Détection fine si le chèque en cours a des modifications non enregistrées
  const isFormDirty = useMemo(() => {
    if (!activeChequeId) {
      const num = parseFloat(amount.replace(/\s/g, "").replace(",", "."));
      const hasAmount = !isNaN(num) && num > 0;
      const hasBeneficiary = Boolean(beneficiary.trim());
      const hasChequeNum = Boolean(chequeNumber.trim());
      return hasAmount || hasBeneficiary || hasChequeNum;
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
    if (activeChequeBook && activeChequeBook.currentNumber) {
      setChequeNumber(activeChequeBook.currentNumber);
    } else {
      setChequeNumber("");
    }
    setShowChequeNumber(appSettings.defaultShowChequeNumber ?? false);
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
      companyId: activeCompany?.id || "company-default",
      accountId: selectedAccountId || undefined,
      chequeBookId: activeChequeBook?.id || undefined,
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
      chequeNumber: chequeNumber.trim() || undefined,
      createdAt: existingRecord?.createdAt || now,
      updatedAt: now,
      printedAt: existingRecord?.printedAt,
      lastPrintedAt: existingRecord?.lastPrintedAt
    };

    saveChequeRecord(newRecord).catch(console.error);
    if (newRecord.beneficiary && newRecord.beneficiary !== "Bénéficiaire non spécifié") {
      autoRecordBeneficiary(newRecord.beneficiary, activeCompany?.id).catch(console.error);
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
    if (!hasPermission(currentUser?.role, "cheque:create")) {
      setToast({ message: getPermissionErrorMessage("cheque:create"), type: "warning" });
      return;
    }

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
    if (!hasPermission(currentUser?.role, "cheque:print")) {
      setToast({ message: getPermissionErrorMessage("cheque:print"), type: "warning" });
      return;
    }

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
        companyId: activeCompany?.id || "company-default",
        accountId: selectedAccountId || undefined,
        chequeBookId: activeChequeBook?.id || undefined,
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
      companyId: activeCompany?.id || "company-default",
      accountId: selectedAccountId || undefined,
      chequeBookId: activeChequeBook?.id || undefined,
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
      chequeNumber: chequeNumber.trim() || undefined,
      createdAt: existingRecord?.createdAt || now,
      updatedAt: now,
      printedAt: existingRecord?.printedAt || now,
      lastPrintedAt: now
    };

    await saveChequeRecord(printedRecord);
    if (printedRecord.beneficiary && printedRecord.beneficiary !== "Bénéficiaire non spécifié") {
      autoRecordBeneficiary(printedRecord.beneficiary, activeCompany?.id).catch(console.error);
    }

    // Incrémenter automatiquement le carnet de chèques actif de l'entreprise
    if (activeChequeBook && activeChequeBook.id) {
      try {
        await incrementChequeBookNumber(activeChequeBook.id);
        const updated = await getActiveChequeBookForAccount(activeChequeBook.accountId);
        setActiveChequeBook(updated);
        if (updated && updated.currentNumber) {
          setChequeNumber(updated.currentNumber);
        }
        if (activeCompany) {
          loadCompanyAccounts(activeCompany.id);
        }
      } catch (bookErr) {
        console.warn("Erreur avancement chéquier:", bookErr);
      }
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

  // =========================================================================
  // MODULE 1.6 : IMPORTATION ET TRAITEMENT EN LOT
  // =========================================================================

  // Traitement en lot : Sauvegarde directe dans l'historique
  const handleSaveBatch = async (
    items: BatchItem[],
    targetAccountId?: string,
    targetChequeBookId?: string,
    autoIncrementChequeNumber: boolean = true,
    autoRecordBeneficiaries: boolean = true
  ) => {
    const compId = activeCompany?.id || "company-default";
    const acc = companyAccounts.find((a) => a.id === targetAccountId) || companyAccounts[0];
    const targetTpl = templates.find((t) => t.id === acc?.bankTemplateId) || currentTemplate;
    const now = new Date().toISOString();

    const targetBook = allChequeBooks.find((b) => b.id === targetChequeBookId) || activeChequeBook;
    let nextNum = targetBook?.currentNumber || "0000001";
    const recordsToSave: ChequeRecord[] = [];
    const results: BatchExecutionReport["items"] = [];

    for (const item of items) {
      let assignedNumber = item.chequeNumber;
      if (autoIncrementChequeNumber) {
        assignedNumber = assignedNumber || nextNum;
        const parsed = parseInt(nextNum, 10);
        if (!isNaN(parsed)) {
          nextNum = String(parsed + 1).padStart(nextNum.length, "0");
        }
      }

      const recId = "cheque-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7);
      const chequeRec: ChequeRecord = {
        id: recId,
        companyId: compId,
        accountId: targetAccountId || selectedAccountId || undefined,
        chequeBookId: targetChequeBookId || activeChequeBook?.id || undefined,
        amount: item.formattedAmount,
        beneficiary: item.beneficiary,
        place: item.place || place,
        date: item.date || date,
        chequeNumber: assignedNumber,
        showChequeNumber: Boolean(assignedNumber),
        reference: item.reference,
        bankTemplateId: targetTpl.id,
        bankName: targetTpl.name,
        status: "saved",
        printCount: 0,
        createdAt: now,
        updatedAt: now
      };

      recordsToSave.push(chequeRec);

      results.push({
        beneficiary: item.beneficiary,
        amount: item.formattedAmount,
        chequeNumber: assignedNumber,
        status: "saved",
        reason: item.statusMessage
      });
    }

    // Sauvegarde en lot dans SQLite / LocalStorage
    await saveBatchCheques(recordsToSave, autoRecordBeneficiaries);

    // Mettre à jour le chéquier actif avec le nouveau numéro
    if (targetBook && autoIncrementChequeNumber) {
      const updatedBook: ChequeBookRecord = {
        ...targetBook,
        currentNumber: nextNum,
        leavesUsed: targetBook.leavesUsed + recordsToSave.length
      };
      await saveChequeBook(updatedBook);
      if (activeChequeBook?.id === targetBook.id) {
        setActiveChequeBook(updatedBook);
      }
      refreshChequeBooks();
    }

    // Déduire le solde bancaire
    if (targetAccountId) {
      const totalDeduction = items.reduce((sum, i) => sum + i.numericAmount, 0);
      await updateAccountBalance(targetAccountId, -totalDeduction);
      if (activeCompany) loadCompanyAccounts(activeCompany.id);
    }

    setHistoryRefreshTrigger((n) => n + 1);

    const totalAmount = items.reduce((sum, i) => sum + i.numericAmount, 0);
    const report: BatchExecutionReport = {
      batchId: "batch-save-" + Date.now(),
      companyId: compId,
      companyName: activeCompany?.name || "Virtanis",
      accountId: targetAccountId,
      accountLabel: acc ? `${acc.label} (${acc.ribOrIban})` : undefined,
      totalRowsRead: items.length,
      totalImported: items.length,
      totalPrinted: 0,
      totalErrors: 0,
      totalDuplicatesDetected: 0,
      totalAmountNumeric: totalAmount,
      totalAmountFormatted: totalAmount.toLocaleString("fr-FR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }),
      executedAt: now,
      items: results
    };

    setBatchExecutionReport(report);
    setShowBatchReportModal(true);

    setToast({
      message: `${items.length} chèque(s) importé(s) et enregistré(s) avec succès dans l'historique !`,
      type: "success"
    });
  };

  // Traitement en lot : Démarrer le runner d'impression successive
  const handleStartSequentialPrint = (
    items: BatchItem[],
    targetAccountId?: string,
    targetChequeBookId?: string,
    autoIncrementChequeNumber: boolean = true,
    autoRecordBeneficiaries: boolean = true
  ) => {
    if (!hasPermission(currentUser?.role, "batch:print")) {
      setToast({ message: getPermissionErrorMessage("batch:print"), type: "warning" });
      return;
    }

    setBatchRunnerItems(items);
    setBatchRunnerAccountId(targetAccountId);
    setBatchRunnerChequeBookId(targetChequeBookId);
    setBatchRunnerAutoRecordBen(autoRecordBeneficiaries);
    setShowBatchRunnerModal(true);
  };

  // Impression individuelle successive depuis le runner
  const handlePrintBatchItem = async (
    item: BatchItem,
    assignedChequeNumber: string
  ): Promise<{ success: boolean; error?: string; chequeId: string }> => {
    const compId = activeCompany?.id || "company-default";
    const acc = companyAccounts.find((a) => a.id === batchRunnerAccountId) || companyAccounts[0];
    const targetTpl = templates.find((t) => t.id === acc?.bankTemplateId) || currentTemplate;
    const now = new Date().toISOString();
    const recId = "cheque-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7);

    // Mettre à jour l'état de l'écran principal pour la mise en page d'impression
    setAmount(item.formattedAmount);
    setBeneficiary(item.beneficiary);
    setDate(item.date);
    setPlace(item.place);
    const shouldShowChequeNum = appSettings.defaultShowChequeNumber ?? false;
    setChequeNumber(assignedChequeNumber);
    setShowChequeNumber(shouldShowChequeNum);
    setSelectedTemplateId(targetTpl.id);

    const chequeRec: ChequeRecord = {
      id: recId,
      companyId: compId,
      accountId: acc?.id,
      chequeBookId: batchRunnerChequeBookId || activeChequeBook?.id,
      amount: item.formattedAmount,
      beneficiary: item.beneficiary,
      place: item.place || place,
      date: item.date || date,
      chequeNumber: assignedChequeNumber,
      showChequeNumber: shouldShowChequeNum,
      reference: item.reference,
      bankTemplateId: targetTpl.id,
      bankName: targetTpl.name,
      status: "printed",
      printCount: 1,
      createdAt: now,
      updatedAt: now,
      printedAt: now
    };

    try {
      await saveChequeRecord(chequeRec);
      if (batchRunnerAutoRecordBen) {
        await autoRecordBeneficiary(item.beneficiary, compId);
      }

      // Logger la tentative d'impression au statut confirmé
      const attemptId = "attempt-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7);
      await logPrintAttempt({
        id: attemptId,
        chequeId: recId,
        companyId: compId,
        beneficiary: item.beneficiary,
        amount: item.formattedAmount,
        bankName: targetTpl.name,
        bankTemplateId: targetTpl.id,
        paperFormat: printSettings.paperFormat,
        placement: printSettings.placement,
        status: "confirmed",
        attemptedAt: now,
        confirmedAt: now,
        copyNumber: 1
      });

      // Déduire le solde bancaire
      if (acc?.id) {
        await updateAccountBalance(acc.id, -item.numericAmount);
      }

      // Incrémenter le chéquier
      if (batchRunnerChequeBookId) {
        await incrementChequeBookNumber(batchRunnerChequeBookId);
      }

      // Lancer l'impression physique
      window.print();

      return { success: true, chequeId: recId };
    } catch (err: any) {
      console.error("Erreur impression chèque lot:", err);
      return { success: false, error: err?.message || "Erreur d'impression", chequeId: recId };
    }
  };

  const handleFinishBatchRunner = (report: BatchExecutionReport) => {
    setShowBatchRunnerModal(false);
    setBatchExecutionReport(report);
    setShowBatchReportModal(true);
    setHistoryRefreshTrigger((n) => n + 1);
    if (activeCompany) loadCompanyAccounts(activeCompany.id);
    refreshChequeBooks();
  };

  const handleSelectAccount = (accId: string | null) => {
    setSelectedAccountId(accId);
    const compId = activeCompany?.id || getActiveCompanyId();
    try {
      const key = `vcheque_selected_account_${compId}`;
      if (accId) {
        localStorage.setItem(key, accId);
      } else {
        localStorage.setItem(key, "none");
        setActiveChequeBook(null);
      }
    } catch (e) {
      console.warn("Erreur sauvegarde compte émetteur local:", e);
    }
  };

  const handleDissociateAccount = () => {
    setSelectedAccountId(null);
    setActiveChequeBook(null);
    const compId = activeCompany?.id || getActiveCompanyId();
    try {
      localStorage.setItem(`vcheque_selected_account_${compId}`, "none");
    } catch (e) {
      console.warn("Erreur sauvegarde dissociation local:", e);
    }
    setToast({
      message: "Compte bancaire et chéquier dissociés du chèque en cours.",
      type: "info"
    });
  };

  // Handlers pour l'Historique
  const handleCloneToHome = (record: ChequeRecord) => {
    setAmount(record.amount);
    setBeneficiary(record.beneficiary);
    setPlace(record.place);
    setDate(record.date);
    setIsCrossed(record.isCrossed !== false);
    setCrossedWithText(record.crossedWithText !== false);
    setChequeNumber(record.chequeNumber || "");
    setShowChequeNumber(record.showChequeNumber ?? (appSettings.defaultShowChequeNumber ?? false));
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
    if (!hasPermission(currentUser?.role, "cheque:print")) {
      setToast({ message: getPermissionErrorMessage("cheque:print"), type: "warning" });
      return;
    }

    setAmount(record.amount);
    setBeneficiary(record.beneficiary);
    setPlace(record.place);
    setDate(record.date);
    setIsCrossed(record.isCrossed !== false);
    setCrossedWithText(record.crossedWithText !== false);
    setChequeNumber(record.chequeNumber || "");
    setShowChequeNumber(record.showChequeNumber ?? (appSettings.defaultShowChequeNumber ?? false));
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
    if (!hasPermission(currentUser?.role, "cheque:delete")) {
      setToast({ message: getPermissionErrorMessage("cheque:delete"), type: "warning" });
      return;
    }
    setHistory((prev) => prev.filter((item) => item.id !== id));
    setToast({ message: "Chèque retiré de l'historique.", type: "info" });
  };

  const handleClearHistory = () => {
    if (!hasPermission(currentUser?.role, "history:clear")) {
      setToast({ message: getPermissionErrorMessage("history:clear"), type: "warning" });
      return;
    }
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
      <TopBar
        onOpenSettings={() => setActiveTab("settings")}
        activeCompany={activeCompany}
        onOpenCompanyManager={() => setShowCompanyModal(true)}
        currentUser={currentUser}
        onOpenUserManager={() => setShowUserManagerModal(true)}
        onLockSession={() => {
          setIsLocked(true);
          logAuditEvent("auth_lock", "security", "Verrouillage manuel de session").catch(console.warn);
        }}
        isAuthEnabled={securitySettings.isAuthEnabled}
      />

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
            activeCompanyId={activeCompany?.id}
            onCloneToHome={handleCloneToHome}
            onReprintCheque={handleReprintFromHistory}
            onDeleteRecord={handleDeleteHistoryRecord}
            onClearHistory={handleClearHistory}
            onBackToHome={() => setActiveTab("home")}
            onOpenBatchImport={() => setShowBatchImportModal(true)}
            onNavigateToReconciliation={() => setActiveTab("reconciliation")}
            currentUser={currentUser}
          />
        ) : activeTab === "beneficiaries" ? (
          <BeneficiariesPage
            activeCompanyId={activeCompany?.id}
            refreshTrigger={historyRefreshTrigger}
            onCreateChequeForBeneficiary={handleCreateChequeForBeneficiary}
            onBackToHome={() => setActiveTab("home")}
          />
        ) : activeTab === "reconciliation" ? (
          <ReconciliationPage
            activeCompanyId={activeCompany?.id}
            onBackToHome={() => setActiveTab("home")}
            onOpenCheckDetails={handleCloneToHome}
            currentUser={currentUser}
          />
        ) : activeTab === "settings" ? (
          <SettingsPage
            settings={appSettings}
            onUpdateSettings={(newSettings) => {
              setAppSettings(newSettings);
              saveAppSettings(newSettings);
              if (!activeChequeId) {
                setShowChequeNumber(newSettings.defaultShowChequeNumber ?? false);
                setIsCrossed(newSettings.defaultIsCrossed !== false);
                setCrossedWithText(newSettings.defaultCrossedWithText !== false);
                if (newSettings.defaultPlace) {
                  setPlace(newSettings.defaultPlace);
                }
              }
              setToast({ message: "Paramètres enregistrés.", type: "success" });
            }}
            onResetSettings={() => {
              const defaults = resetAppSettings();
              setAppSettings(defaults);
              if (!activeChequeId) {
                setShowChequeNumber(defaults.defaultShowChequeNumber ?? false);
                setIsCrossed(defaults.defaultIsCrossed !== false);
                setCrossedWithText(defaults.defaultCrossedWithText !== false);
                setPlace(defaults.defaultPlace || "Alger");
              }
              setToast({ message: "Paramètres réinitialisés par défaut.", type: "info" });
            }}
            onBackToHome={() => setActiveTab("home")}
            onOpenUserManager={() => setShowUserManagerModal(true)}
            onOpenAuditTrail={() => setShowAuditTrailModal(true)}
            onOpenBackupRestore={(tab) => {
              setBackupModalInitialTab(tab || "export");
              setShowBackupRestoreModal(true);
            }}
            onOpenBackup={() => {
              setBackupModalInitialTab("export");
              setShowBackupRestoreModal(true);
            }}
            onOpenRestore={() => {
              setBackupModalInitialTab("restore");
              setShowBackupRestoreModal(true);
            }}
            onOpenAutoBackup={() => {
              setBackupModalInitialTab("auto");
              setShowBackupRestoreModal(true);
            }}
            currentUser={currentUser}
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

              {/* Barre d'actions supérieure (Nouveau chèque, Enregistrer, Modifier, Imprimer, Traitement en lot) */}
              <ActionBar
                onNew={handleNewCheque}
                showNewButton={hasChequeData}
                onEdit={handleEditFocus}
                onSave={handleSave}
                onPrint={handlePrint}
                onOpenBankAccounts={() => setShowBankAccountsModal(true)}
                onOpenBatchImport={() => setShowBatchImportModal(true)}
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
                currentUser={currentUser}
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
                  accounts={companyAccounts}
                  selectedAccountId={selectedAccountId}
                  onChangeSelectedAccountId={handleSelectAccount}
                  activeChequeBook={activeChequeBook}
                  onOpenBankAccountsModal={() => setShowBankAccountsModal(true)}
                  onDissociateAccount={handleDissociateAccount}
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

      {/* Modal Multi-sociétés / Gestion des dossiers d'entreprises */}
      <CompanyManagerModal
        isOpen={showCompanyModal}
        onClose={() => setShowCompanyModal(false)}
        onCompanyChanged={(comp) => {
          setActiveCompany(comp);
          loadCompanyAccounts(comp.id);
          setHistoryRefreshTrigger((prev) => prev + 1);
          setToast({
            message: `Dossier actif basculé sur "${comp.name}".`,
            type: "info"
          });
        }}
      />

      {/* Modal Comptes bancaires & Chéquiers */}
      <BankAccountsModal
        isOpen={showBankAccountsModal}
        onClose={() => setShowBankAccountsModal(false)}
        templates={templates}
        currentAccountId={selectedAccountId}
        currentChequeBookId={activeChequeBook?.id}
        onAccountSelected={(acc, nextChequeNum, selectedBook) => {
          if (!acc) {
            handleDissociateAccount();
            return;
          }
          handleSelectAccount(acc.id);
          setSelectedTemplateId(acc.bankTemplateId);
          if (selectedBook) {
            setActiveChequeBook(selectedBook);
          }
          if (nextChequeNum) {
            setChequeNumber(nextChequeNum);
            setShowChequeNumber(appSettings.defaultShowChequeNumber ?? false);
          }
          setToast({
            message: `Compte "${acc.label}" sélectionné pour le chèque en cours.`,
            type: "success"
          });
        }}
      />

      {/* Module 1.6 : Modal Importation et Traitement en Lot */}
      <BatchImportModal
        isOpen={showBatchImportModal}
        onClose={() => setShowBatchImportModal(false)}
        existingCheques={history}
        companyAccounts={companyAccounts}
        chequeBooks={allChequeBooks}
        activeAccountId={selectedAccountId || undefined}
        activeCompanyId={activeCompany?.id || "company-default"}
        templates={templates}
        currentTemplate={currentTemplate}
        onSaveBatch={handleSaveBatch}
        onStartSequentialPrint={handleStartSequentialPrint}
        onOpenBankAccounts={() => setShowBankAccountsModal(true)}
      />

      {/* Module 1.6 : Modal Runner d'impression successive */}
      {showBatchRunnerModal && (
        <BatchPrintRunnerModal
          isOpen={showBatchRunnerModal}
          onClose={() => setShowBatchRunnerModal(false)}
          items={batchRunnerItems}
          targetAccount={companyAccounts.find((a) => a.id === batchRunnerAccountId)}
          targetChequeBook={allChequeBooks.find((b) => b.id === batchRunnerChequeBookId)}
          templates={templates}
          printSettings={printSettings}
          companyId={activeCompany?.id || "company-default"}
          companyName={activeCompany?.name || "Virtanis"}
          onPrintCurrentItem={handlePrintBatchItem}
          onFinishRunner={handleFinishBatchRunner}
        />
      )}

      {/* Module 1.6 : Rapport de Traitement et Audit du lot */}
      <BatchReportModal
        isOpen={showBatchReportModal}
        onClose={() => setShowBatchReportModal(false)}
        report={batchExecutionReport}
      />

      {/* Module 1.8 : Sécurité & Traçabilité */}
      <LockScreenModal
        isOpen={isLocked}
        onUnlock={() => {
          setCurrentUser(getActiveUser());
          setIsLocked(false);
          refreshSecurity();
        }}
      />

      <UserSessionManagerModal
        isOpen={showUserManagerModal}
        onClose={() => {
          setShowUserManagerModal(false);
          refreshSecurity();
        }}
        currentUser={currentUser}
        onUserChanged={(user) => {
          setCurrentUser(user);
          setToast({
            message: `Session active : ${user.displayName} (${user.role})`,
            type: "success"
          });
        }}
      />

      <AuditTrailModal
        isOpen={showAuditTrailModal}
        onClose={() => setShowAuditTrailModal(false)}
      />

      <BackupRestoreModal
        isOpen={showBackupRestoreModal}
        onClose={() => {
          setShowBackupRestoreModal(false);
          refreshSecurity();
        }}
        initialTab={backupModalInitialTab}
        currentUser={currentUser}
        onRestoreSuccess={() => {
          setHistoryRefreshTrigger((n) => n + 1);
          refreshSecurity();
          setToast({
            message: "Données restaurées avec succès depuis l'archive certifiée !",
            type: "success"
          });
        }}
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