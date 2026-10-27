import React, { useState, useEffect, useRef } from "react";
import {
  Lock,
  Unlock,
  ShieldAlert,
  KeyRound,
  User,
  Delete,
  Eye,
  EyeOff,
  Sparkles,
  ShieldCheck,
  RotateCcw
} from "lucide-react";
import type { UserRecord } from "../types";
import { verifyPin } from "../services/security";
import { getUsers, getActiveUser, setActiveUser, logAuditEvent } from "../services/db";

interface LockScreenModalProps {
  isOpen: boolean;
  onUnlock: () => void;
}

const LAST_USERNAME_KEY = "vcheque_last_username";

export const LockScreenModal: React.FC<LockScreenModalProps> = ({ isOpen, onUnlock }) => {
  const [usernameInput, setUsernameInput] = useState<string>("");
  const [pinInput, setPinInput] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [failCount, setFailCount] = useState<number>(0);
  const [isLockedOut, setIsLockedOut] = useState<boolean>(false);
  const [lockoutTimer, setLockoutTimer] = useState<number>(0);
  const [savedUserHint, setSavedUserHint] = useState<string | null>(null);

  const usernameRef = useRef<HTMLInputElement | null>(null);
  const pinRef = useRef<HTMLInputElement | null>(null);

  // Initialisation à l'ouverture du modal
  useEffect(() => {
    if (isOpen) {
      // 1. Récupérer le dernier nom d'utilisateur mémorisé
      const saved =
        localStorage.getItem(LAST_USERNAME_KEY) ||
        getActiveUser()?.username ||
        "admin";

      setUsernameInput(saved);
      setSavedUserHint(saved);
      setPinInput("");
      setErrorMsg(null);
      setShowPassword(false);

      // 2. Focus automatique : sur le PIN si l'identifiant est déjà prérempli, sinon sur l'identifiant
      setTimeout(() => {
        if (saved && saved.trim() !== "") {
          pinRef.current?.focus();
        } else {
          usernameRef.current?.focus();
        }
      }, 120);
    }
  }, [isOpen]);

  // Minuteur de temporisation anti-force brute (30 secondes après 5 échecs)
  useEffect(() => {
    let interval: any;
    if (isLockedOut && lockoutTimer > 0) {
      interval = setInterval(() => {
        setLockoutTimer((prev) => {
          if (prev <= 1) {
            setIsLockedOut(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isLockedOut, lockoutTimer]);

  if (!isOpen) return null;

  const triggerFail = () => {
    const newFails = failCount + 1;
    setFailCount(newFails);
    setPinInput("");
    if (newFails >= 5) {
      setIsLockedOut(true);
      setLockoutTimer(30);
      setErrorMsg("Trop de tentatives infructueuses. Temporisation de sécurité (30s).");
    } else {
      setErrorMsg(`Identifiant ou code d'accès incorrect (${5 - newFails} tentative(s) restante(s)).`);
    }
    pinRef.current?.focus();
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isLockedOut || isVerifying) return;

    const trimmedUsername = usernameInput.trim();
    if (!trimmedUsername) {
      setErrorMsg("Veuillez saisir votre nom d'utilisateur.");
      usernameRef.current?.focus();
      return;
    }

    setIsVerifying(true);
    setErrorMsg(null);

    try {
      const allUsers = await getUsers();
      const matched = allUsers.find(
        (u) => u.username.toLowerCase() === trimmedUsername.toLowerCase()
      );

      // Si l'utilisateur n'existe pas ou est désactivé
      if (!matched || !matched.isActive) {
        setIsVerifying(false);
        triggerFail();
        return;
      }

      // Si aucun code PIN n'est défini pour cet utilisateur
      if (!matched.pinHash || !matched.pinSalt) {
        localStorage.setItem(LAST_USERNAME_KEY, matched.username);
        setActiveUser(matched);
        await logAuditEvent(
          "auth_login",
          "security",
          `Connexion sans PIN : ${matched.displayName} (${matched.role})`
        );
        setFailCount(0);
        onUnlock();
        return;
      }

      // Vérification du code d'accès
      if (!pinInput.trim()) {
        setErrorMsg("Veuillez saisir votre code d'accès.");
        setIsVerifying(false);
        pinRef.current?.focus();
        return;
      }

      const isValid = await verifyPin(pinInput.trim(), matched.pinSalt, matched.pinHash);
      if (isValid) {
        // Enregistrer le dernier identifiant validé
        localStorage.setItem(LAST_USERNAME_KEY, matched.username);
        setActiveUser(matched);
        await logAuditEvent(
          "auth_login",
          "security",
          `Déverrouillage réussi : ${matched.displayName} (${matched.role})`
        );
        setFailCount(0);
        setErrorMsg(null);
        onUnlock();
      } else {
        triggerFail();
      }
    } catch (err: any) {
      console.error("Erreur de déverrouillage:", err);
      setErrorMsg("Erreur lors de la vérification de sécurité.");
    } finally {
      setIsVerifying(false);
    }
  };

  // Clics sur le pavé numérique virtuel (intéractif à la souris ou au tactile)
  const handleNumClick = (digit: string) => {
    if (isLockedOut || isVerifying) return;
    if (pinInput.length < 16) {
      setPinInput((prev) => prev + digit);
      setErrorMsg(null);
      pinRef.current?.focus();
    }
  };

  const handleBackspace = () => {
    if (isLockedOut || isVerifying) return;
    setPinInput((prev) => prev.slice(0, -1));
    setErrorMsg(null);
    pinRef.current?.focus();
  };

  const handleClear = () => {
    if (isLockedOut || isVerifying) return;
    setPinInput("");
    setErrorMsg(null);
    pinRef.current?.focus();
  };

  return (
    <div className="account-modal-overlay lock-screen-overlay animate-fade-in" role="dialog" aria-modal="true">
      <div className="company-modal-content lock-screen-card animate-scale-up">
        {/* En-tête de prestige de l'application */}
        <div className="company-modal-header lock-modal-header">
          <div className="company-modal-title-row">
            <div className="company-modal-icon-badge gold">
              <Lock size={20} className="text-gold" />
            </div>
            <div>
              <h2 className="company-modal-title">VCheque Studio</h2>
              <span className="statement-subtitle">Session verrouillée · Authentification requise</span>
            </div>
          </div>
          <div className="lock-security-badge" title="Chiffrement PBKDF2-SHA256 actif">
            <ShieldCheck size={14} className="text-emerald" />
            <span>Sécurisé</span>
          </div>
        </div>

        {/* Formulaire de déverrouillage */}
        <form onSubmit={handleSubmit} className="lock-screen-body">
          {/* Champ Identifiant (Nom d'utilisateur) */}
          <div className="form-group mb-3">
            <div className="form-label-row">
              <label htmlFor="lock-username" className="form-label">
                Nom d'utilisateur :
              </label>
              {savedUserHint && savedUserHint === usernameInput.trim() && (
                <span className="saved-user-tag" title="Identifiant de la dernière session mémorisée">
                  Dernier utilisateur
                </span>
              )}
            </div>
            <div className="input-with-icon">
              <User size={16} className="input-icon" />
              <input
                id="lock-username"
                ref={usernameRef}
                type="text"
                className="form-input with-icon"
                placeholder="Ex : admin, operateur, karim..."
                value={usernameInput}
                disabled={isLockedOut || isVerifying}
                onChange={(e) => {
                  setUsernameInput(e.target.value);
                  setErrorMsg(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    pinRef.current?.focus();
                  }
                }}
                autoComplete="username"
              />
            </div>
          </div>

          {/* Champ Code d'accès (PIN ou Mot de passe) */}
          <div className="form-group mb-2">
            <div className="form-label-row">
              <label htmlFor="lock-pin" className="form-label">
                Code d'accès (PIN ou mot de passe) :
              </label>
              <span className="keyboard-hint">Pavé numérique ou clavier actif</span>
            </div>
            <div className="input-with-icon lock-pin-wrapper">
              <KeyRound size={16} className="input-icon" />
              <input
                id="lock-pin"
                ref={pinRef}
                type={showPassword ? "text" : "password"}
                className="form-input with-icon pin-field-input"
                placeholder="••••"
                value={pinInput}
                disabled={isLockedOut || isVerifying}
                onChange={(e) => {
                  setPinInput(e.target.value);
                  setErrorMsg(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="btn-toggle-eye"
                onClick={() => setShowPassword(!showPassword)}
                title={showPassword ? "Masquer le code" : "Afficher le code"}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {/* Messages d'erreur et minuteur de blocage */}
          {errorMsg && (
            <div className="lock-alert-message error animate-shake">
              <ShieldAlert size={15} className="flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {isLockedOut && (
            <div className="lock-alert-message warning animate-pulse">
              <RotateCcw size={15} className="flex-shrink-0 animate-spin" />
              <span>Accès temporairement bloqué. Réessayez dans {lockoutTimer}s.</span>
            </div>
          )}

          {/* Pavé numérique virtuel pour saisie tactile / souris rapide */}
          <div className="lock-numpad-container">
            <div className="lock-numpad-grid">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
                <button
                  key={num}
                  type="button"
                  tabIndex={-1}
                  disabled={isLockedOut || isVerifying}
                  onClick={() => handleNumClick(num)}
                  className="lock-numpad-btn"
                >
                  {num}
                </button>
              ))}

              <button
                type="button"
                tabIndex={-1}
                disabled={isLockedOut || isVerifying}
                onClick={handleClear}
                className="lock-numpad-btn secondary"
                title="Effacer tout"
              >
                Effacer
              </button>

              <button
                key="0"
                type="button"
                tabIndex={-1}
                disabled={isLockedOut || isVerifying}
                onClick={() => handleNumClick("0")}
                className="lock-numpad-btn"
              >
                0
              </button>

              <button
                type="button"
                tabIndex={-1}
                disabled={isLockedOut || isVerifying}
                onClick={handleBackspace}
                className="lock-numpad-btn secondary"
                title="Effacer le dernier caractère"
              >
                <Delete size={16} />
              </button>
            </div>
          </div>

          {/* Bouton principal de déverrouillage */}
          <div className="lock-footer-action">
            <button
              type="submit"
              className="btn-action-luxury-green w-100"
              disabled={isLockedOut || isVerifying}
            >
              <Unlock size={16} />
              <span>{isVerifying ? "Vérification en cours..." : "Déverrouiller la session"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
