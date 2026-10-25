# Implementation Plan: Export PDF, Confirmation d'Impression & Journal d'Audit

## Overview
Ce plan implémente les 3 fonctionnalités clés manquantes pour une gestion d'impression bancaire professionnelle :
1. **Exportation directe en PDF** (vectoriel haute fidélité via jsPDF, supportant le format chèque exact 1:1 et la mise en page A4 avec repères).
2. **Distinction entre impression demandée et impression effectivement confirmée** (dialogue de confirmation post-impression validant le résultat physique sur papier avec gestion des incidents).
3. **Journal des tentatives d'impression (Audit Log)** (table SQLite + LocalStorage retraçant l'ensemble des tirages, statuts, dates, formats et motifs d'incidents, avec interface de consultation dédiée).

## Architecture Decisions
- **Génération PDF vectorielle native via `jspdf`** : Génération directe en coordonnées millimétriques réelles (`mm`), garantissant une netteté vectorielle parfaite à l'impression sans pixellisation ni dépendance à un service externe.
- **Workflow de confirmation non-bloquant mais explicite** : Déclenchement d'un modal de confirmation post-impression qui attend le retour de l'utilisateur sur la réalité physique de la sortie papier avant de figer le chèque comme `printed`.
- **Persistance unifiée SQLite + LocalStorage** : Table `print_logs` pour stocker les tentatives avec index d'audit, synchronisée avec un fallback LocalStorage pour une fiabilité totale en mode web ou desktop Tauri.
- **Intégration fluide dans l'interface existante** :
  - Boutons d'export PDF dans la barre d'actions principale, dans la boîte de dialogue d'impression (`PrintModal`) et dans chaque ligne de l'Historique.
  - Onglet ou sélecteur de vue "Journal d'audit des impressions" directement dans la page Historique (`HistoryPage`).

## Task List

### Phase 1: Data Model & Persistence
- **Task 1: Print Audit Types & SQLite / Storage Layer**
  - Étendre `src/types.ts` avec `PrintAttemptRecord`, `PrintAttemptStatus`, et les options PDF.
  - Ajouter la table `print_logs` dans `src/services/db.ts` avec fallback LocalStorage et méthodes CRUD.

### Phase 2: PDF Export Engine
- **Task 2: High-Precision Vector PDF Export Service**
  - Créer `src/services/pdfExport.ts` avec support du format chèque exact et format A4 avec placement et mentions de sécurité.
  - Ajouter les boutons d'export PDF dans `PrintModal.tsx`, `ActionBar.tsx` et `CheckForm.tsx`.

### Phase 3: Post-Print Confirmation Workflow
- **Task 3: Post-Print Physical Confirmation Modal**
  - Créer le composant `PrintConfirmationModal.tsx` permettant à l'utilisateur de déclarer le succès ou l'incident de tirage (bourrage, alignement, annulation).
  - Adapter le flux d'impression dans `src/App.tsx` pour séparer `requested` de `confirmed`.

### Phase 4: Audit Log UI & History Integration
- **Task 4: Cheque & Global Print Audit View in HistoryPage**
  - Ajouter la vue "Journal d'audit des impressions" dans `src/components/HistoryPage.tsx`.
  - Permettre de consulter l'historique des tirages par chèque et d'exporter les chèques en PDF depuis l'historique.

### Phase 5: Verification & End-to-End Validation
- **Task 5: End-to-End Testing & Build Verification**
  - Vérifier la génération PDF, les flux de confirmation réussie / échouée, et la cohérence du journal d'audit.
