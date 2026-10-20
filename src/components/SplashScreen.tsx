import React, { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";

interface SplashScreenProps {
  onFinish: () => void;
  minDurationMs?: number;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  onFinish,
  minDurationMs = 1300
}) => {
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [progress, setProgress] = useState(10);

  useEffect(() => {
    // Progression animée de la barre de chargement
    const intervalTime = 50;
    const step = 90 / (minDurationMs / intervalTime);

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(timer);
          return 100;
        }
        return Math.min(100, prev + step);
      });
    }, intervalTime);

    // Déclenchement du fondu de sortie
    const timeout = setTimeout(() => {
      setIsFadingOut(true);
      setTimeout(() => {
        onFinish();
      }, 450); // durée du fade-out CSS
    }, minDurationMs);

    return () => {
      clearInterval(timer);
      clearTimeout(timeout);
    };
  }, [minDurationMs, onFinish]);

  const handleSkip = () => {
    if (!isFadingOut) {
      setIsFadingOut(true);
      setTimeout(onFinish, 300);
    }
  };

  const handleOpenLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Le lien s'ouvre dans le navigateur par défaut
  };

  return (
    <div
      className={`splash-screen-overlay ${isFadingOut ? "fade-out" : ""}`}
      onClick={handleSkip}
      title="Cliquer pour accéder directement"
      role="dialog"
      aria-modal="true"
    >
      <div className="splash-card" onClick={(e) => e.stopPropagation()}>
        {/* Ligne 1 : Les deux logos épurés sur la même ligne */}
        <div className="splash-logos-row">
          <img
            src="/icon-splash.png"
            alt="Logo VCheque Studio"
            className="splash-logo-img app-logo-clean"
          />

          <img
            src="/logo.png"
            alt="Logo Virtanis V"
            className="splash-logo-img virtanis-v-spin"
          />
        </div>

        {/* Ligne 2 : Nom de l'application */}
        <div className="splash-title-block">
          <h1 className="splash-app-title">
            <span className="gold-accent">V</span>Cheque Studio
          </h1>
          <span className="splash-app-subtitle">
            Système Professionnel d'Édition & Calibrage de Chèques Algériens
          </span>
        </div>

        {/* Ligne 3 : By Virtanis & lien virtanis.net */}
        <div className="splash-footer-row">
          <span className="splash-author-text">By Virtanis</span>
          <span className="splash-dot-separator">•</span>
          <a
            href="https://virtanis.net"
            target="_blank"
            rel="noopener noreferrer"
            className="splash-link"
            onClick={handleOpenLink}
          >
            <span>virtanis.net</span>
            <ExternalLink size={12} className="link-icon" />
          </a>
        </div>

        {/* Ligne de progression minimaliste */}
        <div className="splash-progress-track">
          <div
            className="splash-progress-bar"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
};
