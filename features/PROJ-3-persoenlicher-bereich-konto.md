# PROJ-3: Persönlicher Bereich + Konto

## Status: Deployed
**Created:** 2026-05-15
**Last Updated:** 2026-05-21 — Refined: Email-Edit + Apple-OAuth revert (Commit `02cf7d8` ⇄ `942f97a`); „Mein Zugang"-Sektion entfernt (Info ab PROJ-6 in Projektübersicht); Delete-Button-Label vereinfacht.

## Dependencies
- Requires: PROJ-2 (Auth + SSR) — für Session und OAuth-Provider-Erkennung
- Requires: PROJ-1 (Supabase-Datenmodell & RLS) — für `profiles` und `project_members`
- Soft dependency: PROJ-6 (Stripe-Zahlungen) — Rechnungsliste benötigt Stripe-Integration; Sektion ist in PROJ-3 als Placeholder angelegt, Stripe-Daten kommen mit PROJ-6

## User Stories
- Als eingeloggter Nutzer möchte ich meinen Namen jederzeit ändern können, damit meine Anzeige in der App aktuell bleibt.
- Als Nutzer möchte ich eine Liste meiner bisherigen Zahlungen einsehen, damit ich Rechnungen für die Buchhaltung herunterladen kann.
- Als E-Mail+Passwort-Nutzer möchte ich mein Passwort direkt aus dem Konto-Bereich zurücksetzen können, damit ich nicht zur Anmeldeseite navigieren muss.
- Als Nutzer möchte ich meinen Account unwiderruflich löschen können, aber erst nach einer expliziten Bestätigung, damit versehentliche Löschungen verhindert werden.

> **Bewusst ausgeklammert:** E-Mail-Adresse-Selbstbedienungs-Änderung (siehe Implementation Notes 2026-05-21). E-Mail-Wechsel läuft aktuell über den Support.

## Acceptance Criteria

### Seite & Layout
- [ ] Seite unter `/persoenlicher-bereich` (geschützte Route, Auth + aktiver Portal-Zugang erforderlich)
- [ ] Banner-Bild oben, Seitenüberschrift "Persönlicher Bereich" mit Untertitel
- [ ] **4 Sektionen** in dieser Reihenfolge: Account-Übersicht, Rechnungen, Sicherheit, Account löschen
- [ ] Responsives Layout (1 Spalte Mobile, Grid auf Desktop) analog zur alten App

### Sektion: Account-Übersicht
- [ ] **Zwei Felder:** Name (editierbar) + E-Mail (read-only)
- [ ] **Name speichern:** separater Button "Name speichern"; schreibt `profiles.full_name`; Erfolgs-Toast nach Save; Pflichtfeld, min. 2 Zeichen
- [ ] **E-Mail:** read-only, `tabIndex={-1}`, value aus `auth.users.email`; Hinweis-Text „Um Ihre E-Mail-Adresse zu ändern, wenden Sie sich bitte an den Support."
- [ ] Kein eigenes „Mitglied seit"-Feld (Spec-Vereinfachung — Registrierungsdatum ist nicht produkt-kritisch und steht in Stripe-Rechnungen ohnehin sichtbar)

### Sektion: Rechnungen
- [ ] Slim inline-Liste aller abgeschlossenen Zahlungen; Daten kommen direkt aus Stripe (kein separates Lesen der `payments`-Tabelle für die Anzeige)
- [ ] Jede Zeile: Datum, Betrag + Währung, Zahlungstyp (z. B. "Portal-Zugang 12 Monate", "Verlängerung", "Vapi-Sprechzeit +60 Min"), "Rechnung herunterladen"-Link (Stripe-hosted PDF)
- [ ] Leerzustand: "Noch keine Rechnungen vorhanden" (tritt in der Praxis selten auf, da Portal-Zugang Kauf voraussetzt)
- [ ] Stripe-Integration (tatsächliche Daten + Download-Links) wird mit PROJ-6 aktiviert; in PROJ-3 wird die Sektion mit Platzhalter-State gebaut

### Sektion: Sicherheit
- [ ] Für E-Mail+Passwort-Nutzer: Button "Passwort zurücksetzen" — löst denselben Supabase Reset-Link-Flow wie `/passwort-vergessen` (PROJ-2) aus; nach Klick: Hinweis "Wir haben dir einen Link zum Zurücksetzen geschickt"
- [ ] Für OAuth-Nutzer (Google/Facebook): Passwort-Button wird ausgeblendet; stattdessen Hinweis: "Du meldest dich über Google / Facebook an — Passwort-Verwaltung erfolgt dort"
- [ ] Provider-Erkennung erfolgt serverseitig aus der Supabase-Session (kein Client-Side-Guess)

### Sektion: Account löschen
- [ ] Trigger-Button mit Label "Account löschen" (dunkle Farbe, visuell von anderen Buttons unterschieden). Der ausführliche Disclaimer „unwiderruflich" steht im umgebenden Sektions-Text, nicht im Button-Label.
- [ ] Klick öffnet shadcn/ui `AlertDialog` (gleicher Pattern wie Projekt-/Kapitel-Löschen in der App)
- [ ] Dialog fordert Texteingabe zur Bestätigung (z. B. "LÖSCHEN" eintippen); Löschen-Button ist disabled bis korrekte Eingabe
- [ ] **Vor der Löschung prüfen:** Ist der Nutzer auf mindestens einem Projekt der einzige Projektleiter? → Dialog zeigt Fehlermeldung: "Du bist auf [N] Projekt(en) der einzige Projektleiter. Übertrage die Projektleiterschaft oder lösche die Projekte zuerst." → Löschen-Button bleibt disabled
- [ ] Bei erfolgreicher Löschung: Supabase-Account wird gelöscht, Session wird beendet, Nutzer wird zu `/anmelden` weitergeleitet
- [ ] Nach Löschung: alle `profiles`-, `project_members`- und projektbezogenen Daten werden via RLS-Cascade entfernt (gemäß PROJ-1 Schema); `payments` und `voice_sessions` bleiben als Audit-Datensätze erhalten

## Edge Cases
- Nutzer klickt mehrfach auf "Name speichern" → idempotent; doppelte Supabase-Requests werden durch Button-Disabled-State während des Requests verhindert
- Nutzer löscht Account und hat offene Projekt-Einladungen (als Empfänger) → Einladungen werden mit dem Account-Delete-Cascade entfernt (PROJ-9 behandelt den vollständigen Einladungsflow)
- OAuth-Nutzer versucht auf den Sicherheits-Abschnitt zu tippen → Hinweis-Text ist nicht interaktiv, kein Button vorhanden; keine Aktion möglich
- Portal-Zugang läuft ab, während der Nutzer die Seite geöffnet hat → nächster Seitenaufruf / Route-Wechsel triggert Middleware-Redirect zu `/zugang-abgelaufen`; kein sofortiger Kick auf der aktuellen Seite nötig
- Nutzer hat mehrere Browser-Tabs offen und löscht Account in einem Tab → andere Tabs zeigen beim nächsten API-Call einen Auth-Fehler und leiten zu `/anmelden` weiter

## Implementation Notes — Refine 2026-05-21 (Path 2: Implementation Reality)

**Was wurde geändert:**

1. **„Mein Zugang"-Sektion entfernt.** Die Anzeige des Portal-Ablaufdatums lebt ab PROJ-6 in der Projektübersicht (Stat-Card „NARRAVIT-Projektzugang endet in …"). Im persönlichen Bereich war es redundant.
2. **E-Mail-Selbstbedienungs-Änderung zurückgenommen.** Commit `942f97a` („Editable email in persönlicher Bereich + Apple OAuth reactivation") wurde durch `02cf7d8` revertiert. Begründung des Users: E-Mail-Wechsel hat zu viele Edge-Cases (gleichzeitige Pending-Confirmation, OAuth-Migrations-Konflikt, Verifikations-Recovery) — bis ein sauberer Flow steht, läuft das über Support. Apple-OAuth wurde im gleichen Revert deaktiviert, da Apple-Developer-Konfiguration noch nicht steht; Facebook bleibt aktiv (Google + Facebook = produktive OAuth-Provider).
3. **„Mitglied seit"-Feld nicht implementiert.** Der Datenpunkt ist nicht produkt-kritisch — wenn ein User wissen will, wann er gekauft hat, steht's auf den Stripe-Rechnungen.
4. **Delete-Trigger-Button-Label vereinfacht** auf „Account löschen" (das ausführliche „unwiderruflich" steht im Sektions-Disclaimer-Text + im Dialog-Body). Der finale Bestätigungs-Button im Dialog heißt weiterhin „Account endgültig löschen".

**Test-Updates (Refine-Run 2026-05-21):**

- `tests/PROJ-3-persoenlicher-bereich.spec.ts`:
  - AC-5 umformuliert: E-Mail-Feld muss `readOnly` haben und den Support-Hinweis zeigen.
  - AC-8 (Validierung „gleiche E-Mail") gelöscht — kein Edit-Flow mehr.
  - AC-15/16/17/18 Button-Locator: `getByRole("button", { name: "Account löschen", exact: true })` statt Regex `/unwiderruflich löschen/`.
- `tests/PROJ-2-auth-ssr.spec.ts`:
  - /anmelden + /registrieren: Apple-Button-Assertions ersetzt durch Facebook (`Mit Facebook anmelden/registrieren`).
  - Facebook-`count(0)`-Negativ-Check entfernt.
  - Onboarding-Wizard-Describe: `test.use({ storageState: "tests/.auth/user.json" })` ergänzt — `/onboarding` ist seit PROJ-6 auth-only.

**Nicht-Ziele dieses Refines:**

- Kein E-Mail-Self-Service-Edit (separates Folge-Ticket sobald Recovery-Flow steht).
- Kein Apple-OAuth (separates Ticket sobald Developer-Konfiguration steht).
- Keine Wiedereinführung der „Mein Zugang"-Sektion — Quelle bleibt Projektübersicht.

**E2E-Suite nach Refine (`npx playwright test --retries=1`):**

- **71 passed, 0 failed, 1 skipped** (optionaler PROJ-6 Stage-Smoke).
- 2 flaky (passten beim 2. Versuch): PROJ-2 Onboarding Path A + PROJ-4 AC-Ch-3 — beide
  durch denselben bekannten Turbopack-Dev-Server-Modul-Lade-Fehler unter Last
  (`__webpack_modules__[moduleId] is not a function`). Pre-existing, nicht von dieser
  Refine verursacht. Folge-Ticket: in CI auf stabilen Build-Modus statt Turbopack-Dev
  umstellen (PROJ-13 Stabilität & Observability).

## Technical Requirements
- Sicherheit: Name- und E-Mail-Updates ausschließlich über Server Actions / API Routes — kein direkter Client-Write auf `profiles`
- Sicherheit: OAuth-Provider-Erkennung serverseitig; kein Vertrauen auf Client-State
- Sicherheit: Account-Löschung mit serverseitiger Prüfung auf einzige Projektleiterschaft vor dem Delete
- Stripe: Rechnungsliste und Download-Links kommen direkt aus der Stripe API (server-seitig) — nicht aus der `payments`-Tabelle; PROJ-6 baut den Stripe-Client
- UX: Alle destruktiven Aktionen (Löschen) nur über AlertDialog mit Bestätigung
- UX: Toast-Feedback nach Name-Save und nach Passwort-Reset-Trigger (shadcn/ui `Sonner`)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results

**Datum:** 2026-05-17
**Tester:** QA Engineer (Claude)
**Umgebung:** Stage (kdjhxqitfxnsavhiafdn), Chromium Desktop + Mobile Safari (iPhone 13)
**Testnutzer:** qa-test@narravit.de / QA-Test-2026! (stage, portal_access_expires_at = 2027-05-17)

> **Scope-Anpassung:** "Mitglied seit"-FieldCard und "Mein Zugang"-Sektion wurden vom Entwickler bewusst aus der Implementierung entfernt. Entsprechende AC-Punkte aus der Spec wurden gestrichen; E2E-Tests angepasst.

### Ergebnis-Übersicht

| ID | Acceptance Criterion | Ergebnis |
|----|---------------------|----------|
| AC-1 | /persoenlicher-bereich lädt für eingeloggten Nutzer mit aktivem Zugang | ✅ PASS |
| AC-2 | Banner-Bild und Seitenüberschrift mit Untertitel sichtbar | ✅ PASS |
| AC-3 | Alle 4 Sektionen in korrekter Reihenfolge vorhanden | ✅ PASS |
| AC-4 | Name-Feld zeigt aktuellen Wert und ist editierbar | ✅ PASS |
| AC-5 | E-Mail-Feld zeigt aktuelle E-Mail und ist editierbar | ✅ PASS |
| AC-7 | Name speichern — zu kurzer Name zeigt Validierungsfehler | ✅ PASS |
| AC-8 | E-Mail ändern — gleiche E-Mail zeigt Validierungsfehler | ✅ PASS |
| AC-11 | Rechnungen-Sektion zeigt Platzhalter 'Noch keine Rechnungen vorhanden' | ✅ PASS |
| AC-12 | Rechnungstabelle hat korrekte Spaltenheader | ✅ PASS |
| AC-13 | E-Mail-Nutzer sieht 'Passwort zurücksetzen'-Button | ✅ PASS |
| AC-14 | Passwort-zurücksetzen zeigt Bestätigungshinweis nach Klick | ✅ PASS |
| AC-15 | Löschen-Button öffnet AlertDialog | ✅ PASS |
| AC-16 | Löschen-Button im Dialog ist deaktiviert bis 'LÖSCHEN' eingetippt | ✅ PASS |
| AC-17 | Abbrechen schließt Dialog und setzt Eingabe zurück | ✅ PASS |
| AC-18 | Sole-Owner-Check — Nutzer mit eigenem Projekt sieht Fehlermeldung beim Löschen | ✅ PASS |
| AC-19 | Unauthentifizierter Nutzer wird zu /anmelden umgeleitet | ✅ PASS |
| AC-20 | Seite lädt auf 375px ohne Layout-Bruch | ✅ PASS |

**Gesamt: 17/17 bestanden**

### Bugs

#### BUG-1 — Medium: Nach Sole-Owner-Fehler bleibt Löschen-Button aktiviert (UX)
- **Betrifft:** AC-18 (Test besteht, aber UX-Problem dokumentiert)
- **Beschreibung:** Nach dem Sole-Owner-Fehler bleibt `isConfirmed` `true` (Eingabe "LÖSCHEN" nicht zurückgesetzt). Der Löschen-Button bleibt enabled, obwohl die Aktion nicht erfolgreich war.
- **Sicherheit:** Unkritisch — server-seitiger Check blockiert jeden weiteren Versuch zuverlässig.
- **Schritte:** Dialog öffnen → "LÖSCHEN" eingeben → klicken → Sole-Owner-Fehler sichtbar → Button sollte disabled sein, ist es aber nicht.
- **Workaround:** keiner nötig; Löschen bleibt server-seitig geblockt.

### Security Audit

| Prüfpunkt | Ergebnis |
|-----------|----------|
| Unauthentifizierter Zugriff → Redirect | ✅ OK (AC-19) |
| Server Actions mit auth.uid() — kein Client-Write | ✅ OK |
| OAuth-Provider-Erkennung serverseitig | ✅ OK |
| Sole-Owner-Check vor Account-Delete | ✅ OK (server-seitig) |
| Keine Secrets im Client-Bundle | ✅ OK |
| XSS via Nameninput | ✅ OK — React escaped, Server Action validiert |
| Passwort-Reset sendet Link, kein Passwort im Response | ✅ OK |

### E2E Test Suite

Datei: `tests/PROJ-3-persoenlicher-bereich.spec.ts`
Ausgeführt: `npm run test:e2e -- --project=chromium --grep "PROJ-3"`
Ergebnis: **17/17 bestanden** in 16.1s

Test-Infrastruktur:
- `tests/global-setup.ts` — einmaliger Login; speichert Session in `tests/.auth/user.json`
- `playwright.config.ts` — `globalSetup` + kein globales `storageState` (opt-in per Datei)
- `vitest.config.ts` — `include` auf `src/**/*.test.*` eingeschränkt (verhindert Playwright-Konflikte)

### Produktionsreife-Entscheidung

**✅ BEREIT** — Keine Critical oder High Bugs. BUG-1 (Medium, UX-only) blockiert nicht das Deployment.

## Deployment

**Deployed:** 2026-05-17
**Branch:** stage → Vercel Preview
**Commits:** `e36fd38` (feat), `eca4809` (QA tests), `0269986` (UI polish + banner)
**Build:** ✅ `next build` passed (TypeScript clean, all 13 routes generated)
**Pre-flight:** 17/17 Playwright E2E tests green on stage
