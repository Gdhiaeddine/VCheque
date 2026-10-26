import React, { useEffect, useMemo, useRef, useState } from "react";
import "./SplashScreen.css";
import monogramUrl from "../assets/logo.png";
import monumentUrl from "../assets/splash/maqam-echahid.webp";
import chequeUrl from "../assets/splash/cheque-decoration.svg";
import ornamentUrl from "../assets/splash/ornament.webp";

const FADE_OUT_MS = 480;

export interface SplashScreenProps {
  /** Appelé une fois le fondu de sortie terminé. */
  onFinish: () => void;
  /** Vrai lorsque l'initialisation réelle de l'application est terminée. */
  initReady?: boolean;
  /** Message décrivant un échec de démarrage, le cas échéant. */
  initError?: string | null;
  /** Durée minimale d'affichage (rendu visuel uniquement). */
  minDurationMs?: number;
  /** Garde-fou : l'écran ne peut jamais bloquer l'application indéfiniment. */
  maxDurationMs?: number;
}

/**
 * Écran de démarrage premium Virtanis Cheq.
 * La barre de progression reflète le travail réel de démarrage :
 * remplissage discret jusqu'à 88 % pendant l'attente, puis 100 %
 * uniquement lorsque l'application signale la fin de l'initialisation.
 */
export const SplashScreen: React.FC<SplashScreenProps> = ({
  onFinish,
  initReady = false,
  initError = null,
  minDurationMs = 1500,
  maxDurationMs = 9000
}) => {
  const [progress, setProgress] = useState(0);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [minElapsed, setMinElapsed] = useState(false);
  const [forced, setForced] = useState(false);

  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  const fadeTimerRef = useRef<number | null>(null);
  const finishedRef = useRef(false);

  const prefersReducedMotion = useMemo(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  );

  const startFadeOut = React.useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setIsFadingOut(true);
    fadeTimerRef.current = window.setTimeout(() => onFinishRef.current(), FADE_OUT_MS);
  }, []);

  // Durée minimale d'affichage (raccourcie si mouvement réduit).
  useEffect(() => {
    const t = window.setTimeout(() => setMinElapsed(true), prefersReducedMotion ? 200 : minDurationMs);
    return () => window.clearTimeout(t);
  }, [minDurationMs, prefersReducedMotion]);

  // Garde-fou : ne jamais rester bloqué sur l'écran de démarrage.
  useEffect(() => {
    const t = window.setTimeout(() => setForced(true), maxDurationMs);
    return () => window.clearTimeout(t);
  }, [maxDurationMs]);

  // Échec d'initialisation : message visible puis sortie propre.
  useEffect(() => {
    if (!initError) return;
    console.error("[VCheq] Échec d'initialisation:", initError);
    const t = window.setTimeout(startFadeOut, 2200);
    return () => window.clearTimeout(t);
  }, [initError, startFadeOut]);

  // Cible : 100 % seulement quand l'initialisation réelle est terminée.
  const target = initReady || forced ? (minElapsed ? 100 : 88) : 88;

  useEffect(() => {
    if (isFadingOut) return;
    if (prefersReducedMotion) {
      setProgress(target);
      if (target >= 100) startFadeOut();
      return;
    }
    const step = window.setInterval(() => {
      setProgress((prev) => {
        const next = prev + (target - prev) * 0.14;
        return Math.abs(target - next) < 1.5 ? target : next;
      });
    }, 50);
    return () => window.clearInterval(step);
  }, [target, isFadingOut, prefersReducedMotion, startFadeOut]);

  useEffect(() => {
    if (!isFadingOut && progress >= 100) startFadeOut();
  }, [progress, isFadingOut, startFadeOut]);

  // Nettoyage du timer de fondu au démontage.
  useEffect(
    () => () => {
      if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current);
    },
    []
  );

  const statusText = initError
    ? "Une erreur est survenue lors de l'initialisation."
    : progress >= 100
      ? "Application prête."
      : initReady
        ? "Chargement des modèles bancaires..."
        : "Démarrage de l'application...";

  return (
    <div
      className={`splash-screen ${isFadingOut ? "splash-fading" : ""}`}
      onClick={() => startFadeOut()}
      role="dialog"
      aria-label="Écran de démarrage Virtanis Cheq"
    >
      {/* 1) Atmosphère : vignette de bords + grain fin */}
      <div className="splash-bg" aria-hidden="true">
        <div className="splash-grain" />
      </div>

      {/* 2) Maqam Echahid, illustration atmosphérique */}
      <div className="splash-monument" aria-hidden="true">
        <div className="splash-monument-inner">
          <img src={monumentUrl} alt="" draggable={false} />
        </div>
      </div>

      {/* 3) Chèque décoratif avec pennage doré, coin inférieur droit */}
      <div className="splash-cheque" aria-hidden="true">
        <img src={chequeUrl} alt="" draggable={false} />
      </div>

      {/* 4) Courbes dorées balayant les bords */}
      <div className="splash-curves" aria-hidden="true">
        <svg className="splash-curves-tr" viewBox="0 0 940 300" fill="none">
          <defs>
            <linearGradient id="curveTRG" x1="0" y1="0" x2="1" y2="0.3">
              <stop offset="0" stopColor="#8C682C" stopOpacity="0" />
              <stop offset="0.3" stopColor="#C49A4A" stopOpacity="0.75" />
              <stop offset="0.75" stopColor="#E4C77D" stopOpacity="0.55" />
              <stop offset="1" stopColor="#8C682C" stopOpacity="0.05" />
            </linearGradient>
          </defs>
          <path
            d="M160 12 C310 160, 560 218, 820 118 C880 92, 912 66, 934 16"
            stroke="url(#curveTRG)"
            strokeWidth="1.4"
          />
          <path
            d="M100 12 C270 210, 560 268, 830 158 C888 132, 918 106, 948 46"
            stroke="url(#curveTRG)"
            strokeWidth="1"
            opacity="0.35"
          />
        </svg>

        <svg className="splash-curves-bl" viewBox="0 0 720 820" fill="none">
          <defs>
            <linearGradient id="curveBLG" x1="0" y1="0" x2="0.8" y2="1">
              <stop offset="0" stopColor="#E4C77D" stopOpacity="0.6" />
              <stop offset="0.55" stopColor="#C49A4A" stopOpacity="0.45" />
              <stop offset="1" stopColor="#8C682C" stopOpacity="0.05" />
            </linearGradient>
          </defs>
          <path
            d="M-40 360 C210 290, 420 430, 530 660 C570 750, 595 810, 615 900"
            stroke="url(#curveBLG)"
            strokeWidth="1.5"
          />
          <path
            d="M-40 460 C190 420, 370 540, 465 730"
            stroke="url(#curveBLG)"
            strokeWidth="1"
            opacity="0.3"
          />
        </svg>

        <svg className="splash-curves-br" viewBox="0 0 460 240" fill="none">
          <defs>
            <linearGradient id="curveBRG" x1="0" y1="0" x2="1" y2="0.4">
              <stop offset="0" stopColor="#8C682C" stopOpacity="0" />
              <stop offset="0.5" stopColor="#C49A4A" stopOpacity="0.4" />
              <stop offset="1" stopColor="#8C682C" stopOpacity="0.05" />
            </linearGradient>
          </defs>
          <path d="M-30 150 C130 96, 280 104, 420 180" stroke="url(#curveBRG)" strokeWidth="1.2" />
          <path d="M-30 200 C120 152, 250 158, 380 220" stroke="url(#curveBRG)" strokeWidth="1" opacity="0.3" />
        </svg>
      </div>

      {/* 5) Ornements géométriques des coins */}
      <div className="splash-ornament splash-ornament-tr" aria-hidden="true">
        <img src={ornamentUrl} alt="" draggable={false} />
      </div>
      <div className="splash-ornament splash-ornament-bl" aria-hidden="true">
        <img src={ornamentUrl} alt="" draggable={false} />
      </div>

      {/* 6) Marque, produit, description, chargement */}
      <main className="splash-content">
        <div
          className="splash-monogram"
          aria-hidden="true"
          style={{
            WebkitMaskImage: `url("${monogramUrl}")`,
            maskImage: `url("${monogramUrl}")`
          }}
        />
        <h1 className="splash-brand">VIRTANIS</h1>
        <div className="splash-product">
          <span className="splash-product-rule splash-product-rule-left" aria-hidden="true" />
          <span className="splash-product-name">CHEQ</span>
          <span className="splash-product-rule splash-product-rule-right" aria-hidden="true" />
        </div>
        <p className="splash-desc">Remplissage et impression de chèques</p>

        <div
          className="splash-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
          aria-label="Progression du démarrage"
        >
          <div className="splash-progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <p className={`splash-status ${initError ? "splash-status-error" : ""}`} role="status" aria-live="polite">
          {statusText}
        </p>
      </main>

      {/* 7) Signatures de pied */}
      <footer className="splash-footer">
        <div className="splash-footer-scrim" aria-hidden="true" />
        <div className="splash-footer-company">
          <span className="splash-footer-rule splash-footer-rule-left" aria-hidden="true" />
          <div className="splash-footer-company-text">
            <span className="splash-footer-name">Virtanis</span>
            <span className="splash-footer-tagline">Technology &amp; Solutions</span>
          </div>
        </div>
        <div className="splash-footer-partner">
          <span className="splash-footer-rule splash-footer-rule-right" aria-hidden="true" />
          <span className="splash-footer-partner-text">Votre partenaire logiciel</span>
        </div>
      </footer>
    </div>
  );
};
