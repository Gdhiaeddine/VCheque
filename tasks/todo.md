# Task List: Export PDF, Confirmation d'Impression & Journal d'Audit

## Phase 1: Data Model & Persistence

### Task 1: Print Audit Types & SQLite / Storage Layer
**Description:** Define `PrintAttemptRecord`, `PrintAttemptStatus`, and update `ChequeRecord` in `types.ts`. Implement the `print_logs` SQLite table, indices, LocalStorage fallback mirror, and CRUD functions (`logPrintAttempt`, `updatePrintAttemptStatus`, `getPrintAttempts`, `clearPrintLogs`) in `db.ts`.

**Acceptance criteria:**
- [x] `PrintAttemptRecord` is declared in `src/types.ts` with fields (`id`, `chequeId`, `beneficiary`, `amount`, `bankName`, `bankTemplateId`, `paperFormat`, `placement`, `status`, `attemptedAt`, `confirmedAt`, `failureReason`, `copyNumber`).
- [x] SQLite table `print_logs` is created on database initialization if not exists.
- [x] CRUD functions in `src/services/db.ts` operate with both SQLite and LocalStorage fallback.

**Verification:**
- [x] TypeScript check compiles cleanly: `npm run build`
- [x] In-memory/LocalStorage fallback preserves print attempt records.

**Dependencies:** None

**Files likely touched:**
- `src/types.ts`
- `src/services/db.ts`

**Estimated scope:** Small (2 files)

---

## Phase 2: PDF Export Engine

### Task 2: High-Precision Vector PDF Export Service & UI Actions
**Description:** Create `src/services/pdfExport.ts` utilizing `jspdf` to export cheques with sub-millimeter precision in either exact cheque dimensions or sheet format (A4 portrait/landscape with user-selected placement and optional cut lines). Integrate PDF export buttons in `ActionBar.tsx`, `PrintModal.tsx`, and `HistoryPage.tsx`.

**Acceptance criteria:**
- [x] `exportChequeToPdf` generates vector text with proper fonts, crossed bars (`//`), and optional "Non endossable" notice.
- [x] Supports both exact cheque sizing (`currentTemplate.width` × `currentTemplate.height` mm) and full sheet placement (A4 with offsets).
- [x] "Exporter en PDF" button is accessible in `ActionBar.tsx` and inside `PrintModal.tsx`.
- [x] Each cheque row in `HistoryPage.tsx` allows direct PDF export.

**Verification:**
- [x] `npm run build` succeeds without bundle or type errors.
- [x] Clicking "Exporter en PDF" prompts a `.pdf` file download.

**Dependencies:** Task 1

**Files likely touched:**
- `src/services/pdfExport.ts`
- `src/components/ActionBar.tsx`
- `src/components/PrintModal.tsx`
- `src/components/HistoryPage.tsx`
- `src/styles.css`

**Estimated scope:** Medium (4-5 files)

---

## Checkpoint: Foundation & PDF Export
- [x] Database layer for audit logs functions correctly.
- [x] Direct vector PDF download works for any bank template.
- [x] Build succeeds: `npm run build`.

---

## Phase 3: Post-Print Physical Confirmation Workflow

### Task 3: Post-Print Confirmation Modal & State Separation in App.tsx
**Description:** Create `PrintConfirmationModal.tsx` and update the printing flow in `App.tsx` so that launching the print dialog registers a "requested" audit attempt, and only upon explicit user confirmation in the post-print dialog is the cheque marked as `status: "printed"` with incremented `printCount`. If the print failed or was cancelled, record the failure reason and retain the cheque's previous status (`saved` / draft).

**Acceptance criteria:**
- [x] Clicking "Lancer l'impression" creates an audit record with `status: "requested"` without immediately committing `status: "printed"`.
- [x] `PrintConfirmationModal.tsx` displays upon return from the print dialog, asking whether physical printing succeeded.
- [x] Selecting "Oui, impression réussie" updates the cheque to `status: "printed"`, increments `printCount`, and confirms the audit log.
- [x] Selecting "Non, incident / Annulé" logs the incident (bourrage, alignement, annulation) without corrupting cheque status or printCount.
- [x] Option to retry printing immediately from the confirmation modal.

**Verification:**
- [x] Workflow test: launch print -> confirm success -> verify cheque marked printed and printCount = 1.
- [x] Workflow test: launch print -> report incident (bourrage) -> verify cheque remains draft and incident is recorded in audit log.
- [x] `npm run build` compiles cleanly.

**Dependencies:** Task 1, Task 2

**Files likely touched:**
- `src/components/PrintConfirmationModal.tsx`
- `src/App.tsx`
- `src/styles.css`

**Estimated scope:** Medium (3 files)

---

## Phase 4: Audit Log UI & History Integration

### Task 4: Cheque & Global Print Audit View in HistoryPage
**Description:** Enhance `HistoryPage.tsx` to include an "Audit des impressions" tab/toggle to view all printing attempts globally, as well as an inspectable popover/drawer on each cheque showing its specific print history and status transitions.

**Acceptance criteria:**
- [x] HistoryPage provides a toggle between "Historique des chèques" and "Journal d'audit des impressions".
- [x] Audit log view displays date/time, beneficiary, amount, bank, target copy number, status badge (Demandé, Confirmé, Incident, Annulé), and notes.
- [x] Cheques with print history show a clickable audit badge opening a details popover with their specific print attempt history.
- [x] Filter options by audit status (Tous, Confirmés, Incidents).

**Verification:**
- [x] `npm run build` compiles without errors.
- [x] All audit entries appear with accurate statuses and timestamps.

**Dependencies:** Task 1, Task 3

**Files likely touched:**
- `src/components/HistoryPage.tsx`
- `src/styles.css`

**Estimated scope:** Medium (2 files)

---

## Checkpoint: Full Feature Verification
- [x] End-to-end check: PDF export produces crisp vector PDF.
- [x] Print workflow separates requested vs confirmed print.
- [x] Audit log tracks all print attempts with incident reporting.
- [x] `npm run build` succeeds with zero errors.
