# VCheque Studio — Impression & Gestion de Chèques (Algérie) 🇩🇿

[![Tauri v2](https://img.shields.io/badge/Tauri-v2.2-blue?logo=tauri)](https://tauri.app/)
[![React 18](https://img.shields.io/badge/React-18-61dafb?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.0-646CFF?logo=vite)](https://vitejs.dev/)
[![SQLite](https://img.shields.io/badge/SQLite-Local%20DB-003B57?logo=sqlite)](https://sqlite.org/)
[![Platform](https://img.shields.io/badge/Platform-Windows%20Desktop-green)](https://github.com)

**VCheque Studio** est une application desktop moderne, ultra-légère et rapide développée avec **Tauri 2**, **React** et **TypeScript**. Elle simplifie la saisie, la calibration millimétrique, l'impression et l'historisation des chèques pour les entreprises, professionnels et particuliers en Algérie.

---

## 📸 Fonctionnalités Principales

- ✍️ **Saisie assistée & intelligente** :
  - Saisie intuitive du montant en Dinars Algériens (DZD).
  - Conversion automatique et instantanée du montant numérique en toutes lettres en français (règles grammaticales et bancaires respectées).
  - Prise en charge des centimes et formatage automatique des devises.
  - Option chèque barré / non endossable d'un simple clic.

- 📐 **Calibrage millimétrique (Éditeur visuel)** :
  - Ajustement précis de la position (X, Y) et de la taille de police en millimètres (`mm`) pour chaque champ : Montant en chiffres, Montant en lettres, Ordre / Bénéficiaire, Lieu et Date.
  - Aperçu interactif avec grille et repères.
  - Possibilité d'importer un scan de votre chèque en arrière-plan pour caler les éléments au millimètre près.
  - Personnalisation et sauvegarde des dimensions globales du papier (standard 180 × 80 mm ou formats personnalisés).

- 🏦 **Gabarits bancaires algériens préconfigurés** :
  - Modèles intégrés : **BNA**, **BEA**, **CPA**, **BADR**, **BDL**, **CNEP Banque**, **Algérie Poste**, **BNP Paribas El Djazaïr**, **Al Baraka Bank**, **El Salam Bank**, **Société Générale Algérie**, **Fransabank**, **Gulf Bank (AGB)**, **Housing Bank**, **Natixis**, **Trésor Public**, **Trust Bank**, **Arab Bank (ABC)**.
  - Sauvegarde et duplication de profils personnalisés.

- 🖨️ **Module d'impression haute précision** :
  - Fenêtre dédiée de configuration d'impression avec options d'alignement, marges fines et compensation des marges physiques de l'imprimante.
  - Rendu CSS optimisé à l'échelle réelle (100% / pas de déformation).
  - Compatible avec toutes les imprimantes standard (laser, jet d'encre).

- 🗄️ **Historique & Statistiques (Base SQLite locale)** :
  - Enregistrement automatique de chaque chèque émis ou sauvegardé.
  - Base de données locale sécurisée via le plugin **Tauri SQLite** (`sqlite:cheques.db`), avec fallback `localStorage` fluide en environnement Web.
  - Filtrage par statut (*Imprimé*, *Enregistré*), recherche textuelle (bénéficiaire, montant, date) et pagination.
  - Tableau de bord de statistiques (total émis, volume financier global, décompte par statut).

- ⚙️ **Paramètres & Personnalisation** :
  - Gestion des préférences d'impression globales et du lieu par défaut.
  - Interface moderne avec thème sombre / clair et barre de statut native.

---

## 🛠️ Stack Technique

- **Moteur Desktop** : [Tauri v2](https://tauri.app/) (Rust backend minimaliste, sécurisé et économe en mémoire).
- **Frontend** : [React 18](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Vite](https://vitejs.dev/).
- **Base de données** : SQLite via `@tauri-apps/plugin-sql`.
- **Composants & Icônes** : CSS Modules / Tailwind-like utilities, [Lucide React](https://lucide.dev/).

---

## 📋 Prérequis

Avant de compiler ou d'exécuter l'application, assurez-vous d'avoir installé :

1. **Node.js** (version LTS recommandée, >= 18.x) & **npm**
2. **Rust & Cargo** : Installez via [rustup.rs](https://rustup.rs/)
3. **Dépendances système Tauri pour Windows** :
   - [Microsoft Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
   - [WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (installé par défaut sur Windows 10/11)

---

## 🚀 Installation & Lancement

### 1. Cloner le projet et installer les dépendances

```bash
git clone https://github.com/votre-compte/cheque-studio-tauri-prototype.git
cd cheque-studio-tauri-prototype
npm install
```

### 2. Mode Développement Web (test rapide de l'UI)

Pour tester uniquement l'interface dans votre navigateur (avec fallback de stockage local) :

```bash
npm run dev
```

### 3. Mode Desktop Tauri (recommandé)

Pour exécuter l'application dans la fenêtre native Windows avec la base de données SQLite :

```bash
npm run tauri dev
```

---

## 📦 Compilation & Déploiement

Pour générer l'installateur Windows autonome (`.exe` / `.msi`) :

```bash
npm run tauri build
```

Les exécutables générés se trouvent dans :
```
src-tauri/target/release/bundle/nsis/
src-tauri/target/release/bundle/msi/
```

---

## 📁 Structure du Projet

```text
├── assets/                  # Ressources statiques et gabarits bruts
├── public/                  # Fichiers publics Vite
├── scripts/                 # Scripts utilitaires (synchronisation des modèles)
├── src/                     # Code source Frontend (React + TypeScript)
│   ├── assets/              # Logos de banques et icônes
│   ├── components/          # Composants React (Formulaire, Aperçu, Modèles, Historique, Modal d'impression)
│   │   ├── CheckForm.tsx           # Formulaire de saisie du chèque
│   │   ├── ChequePreview.tsx       # Aperçu interactif avec rendu mm
│   │   ├── CalibrationPanel.tsx    # Réglage précis des positions X/Y
│   │   ├── BankTemplatesPage.tsx   # Gestionnaire de gabarits bancaires
│   │   ├── HistoryPage.tsx         # Historique des chèques et statistiques
│   │   └── PrintModal.tsx          # Prévisualisation et paramètres d'impression
│   ├── services/            # Services métier
│   │   ├── db.ts                   # Couche d'accès aux données SQLite
│   │   ├── appSettings.ts          # Préférences utilisateur
│   │   └── templatesConfig.ts      # Chargement et persistance des gabarits
│   ├── banksData.ts         # Définition des banques et coordonnées initiales
│   ├── moneyToWords.ts      # Convertisseur de montants DZD en toutes lettres
│   ├── types.ts             # Définitions TypeScript
│   └── App.tsx              # Composant racine
├── src-tauri/               # Backend Rust & Configuration Tauri
│   ├── src/                 # Code Rust (main.rs, lib.rs)
│   ├── capabilities/        # Permissions Tauri v2 (accès SQL, fs, etc.)
│   ├── icons/               # Icônes de l'application desktop
│   ├── Cargo.toml           # Dépendances Rust
│   └── tauri.conf.json      # Configuration globale de l'application
├── .gitignore               # Règles d'exclusion Git
├── package.json             # Dépendances et scripts npm
└── vite.config.ts           # Configuration du bundler Vite
```

---

## 💡 Guide d'Impression & Calibration

1. **Première calibration** :
   - Sélectionnez la banque de votre chéquier dans la liste des modèles.
   - Si nécessaire, importez une photo ou un scan de votre chèque vierge dans l'aperçu.
   - Ajustez les coordonnées `X` et `Y` de chaque champ dans le panneau de calibrage.
2. **Impression de test** :
   - Imprimez d'abord sur une feuille de papier ordinaire A4 coupée au format ou en plein format.
   - Superposez votre chèque vierge et la feuille imprimée devant une source de lumière pour valider l'alignement.
3. **Paramètres de l'imprimante** :
   - Dans la boîte de dialogue d'impression, réglez toujours l'échelle sur **100 % (Taille réelle)**.
   - Désactivez les options *"Ajuster à la page"* ou *"Adapter au support"*.

---

## ⚠️ Avertissements & Bonnes Pratiques

- **Usage légal** : Cette application est un outil d'aide à la rédaction mécanique de chèques. Elle doit être utilisée exclusivement sur des chèques authentiques vous appartenant ou pour lesquels vous disposez d'un pouvoir légal de signature.
- **Vérification obligatoire** : Les dimensions et coordonnées par défaut sont indicatives. Vérifiez toujours la concordance du texte imprimé avec les lignes de votre carnet de chèques avant toute remise en banque.

---

## 📄 Licence

Ce projet est sous licence propriétaire / privée par défaut. Consultez les mentions légales de votre organisation avant toute redistribution.
