# PROJ-3: Persönlicher Bereich + Konto

## Status: In Progress
**Created:** 2026-05-15
**Last Updated:** 2026-05-17 — Frontend + Backend implementiert (Server Actions: updateName, changeEmail, resetPassword, deleteAccount; Testdaten in stage)

## Dependencies
- Requires: PROJ-2 (Auth + SSR) — für Session, Supabase Auth E-Mail-Änderung, OAuth-Provider-Erkennung
- Requires: PROJ-1 (Supabase-Datenmodell & RLS) — für `profiles`, `project_members`, `portal_access_expires_at`
- Soft dependency: PROJ-6 (Stripe-Zahlungen) — Rechnungsliste und "Verlängern"-CTA benötigen Stripe-Integration; Sektion ist in PROJ-3 angelegt, Stripe-Daten kommen mit PROJ-6

## User Stories
- Als eingeloggter Nutzer möchte ich meinen Namen jederzeit ändern können, damit meine Anzeige in der App aktuell bleibt.
- Als eingeloggter Nutzer möchte ich meine E-Mail-Adresse ändern können und dabei eine Bestätigungs-E-Mail erhalten, damit die neue Adresse sicher verifiziert wird, bevor sie aktiv wird.
- Als Nutzer möchte ich sehen, wann mein Portal-Zugang abläuft, damit ich rechtzeitig verlängern kann (Verlängerung erfolgt in der Projektübersicht).
- Als Nutzer möchte ich eine Liste meiner bisherigen Zahlungen einsehen, damit ich Rechnungen für die Buchhaltung herunterladen kann.
- Als E-Mail+Passwort-Nutzer möchte ich mein Passwort direkt aus dem Konto-Bereich zurücksetzen können, damit ich nicht zur Anmeldeseite navigieren muss.
- Als Nutzer möchte ich meinen Account unwiderruflich löschen können, aber erst nach einer expliziten Bestätigung, damit versehentliche Löschungen verhindert werden.

## Acceptance Criteria

### Seite & Layout
- [ ] Seite unter `/persoenlicher-bereich` (geschützte Route, Auth + aktiver Portal-Zugang erforderlich)
- [ ] Banner-Bild oben, Seitenüberschrift "Persönlicher Bereich" mit Untertitel
- [ ] 5 Sektionen in dieser Reihenfolge: Account-Übersicht, Mein Zugang, Rechnungen, Sicherheit, Account löschen
- [ ] Responsives Layout (1 Spalte Mobile, Grid auf Desktop) analog zur alten App

### Sektion: Account-Übersicht
- [ ] Drei Felder: Name (editierbar), E-Mail (editierbar), Mitglied seit (read-only, aus `profiles.created_at`)
- [ ] **Name speichern:** separater Button "Name speichern"; schreibt `profiles.full_name`; Erfolgs-Toast nach Save; Pflichtfeld, min. 2 Zeichen
- [ ] **E-Mail ändern:** separater Button "E-Mail ändern"; löst Supabase E-Mail-Änderungsflow aus; nach Submit Hinweis: "Bitte bestätige deine neue E-Mail-Adresse — wir haben dir einen Link geschickt." Die alte E-Mail bleibt aktiv bis zur Bestätigung
- [ ] Validierung E-Mail: gültiges Format, nicht identisch mit aktueller E-Mail
- [ ] "Mitglied seit" ist read-only, nicht fokussierbar (tabIndex -1), zeigt Monat + Jahr der Registrierung

### Sektion: Mein Zugang
- [ ] Zeigt: Ablaufdatum des Portal-Zugangs (formatiert als "TT. Monat JJJJ"), verbleibende Tage
- [ ] Solange Zugang > 30 Tage aktiv: neutrale Darstellung
- [ ] Weniger als 30 Tage verbleibend: visuelle Warnung (z. B. gelb/orange) mit Text "Dein Zugang läuft bald ab — verlängere ihn in der Projektübersicht."
- [ ] Kein Verlängerungs-Button in dieser Sektion (Verlängerung erfolgt ausschließlich über `/projektuebersicht/[project_id]` — PROJ-6)
- [ ] Zustand "kein aktiver Zugang" tritt auf dieser Seite nicht auf, da Middleware (PROJ-2) den Nutzer vorher zu `/zugang-abgelaufen` leitet

### Sektion: Rechnungen
- [ ] Slim inline-Liste aller abgeschlossenen Zahlungen; Daten kommen direkt aus Stripe (kein separates Lesen der `payments`-Tabelle für die Anzeige)
- [ ] Jede Zeile: Datum, Betrag + Währung, Zahlungstyp (z. B. "Portal-Zugang 12 Monate", "Verlängerung", "Vapi-Sprechzeit +60 Min"), "Rechnung herunterladen"-Link (Stripe-hosted PDF)
- [ ] Leerzustand: "Noch keine Rechnungen vorhanden" (tritt in der Praxis selten auf, da Portal-Zugang Kauf voraussetzt)
- [ ] Stripe-Integration (tatsächliche Daten + Download-Links) wird mit PROJ-6 aktiviert; in PROJ-3 wird die Sektion mit Platzhalter-State gebaut

### Sektion: Sicherheit
- [ ] Für E-Mail+Passwort-Nutzer: Button "Passwort zurücksetzen" — löst denselben Supabase Reset-Link-Flow wie `/passwort-vergessen` (PROJ-2) aus; nach Klick: Hinweis "Wir haben dir einen Link zum Zurücksetzen geschickt"
- [ ] Für OAuth-Nutzer (Google/Apple): Passwort-Button wird ausgeblendet; stattdessen Hinweis: "Du meldest dich über Google / Apple an — Passwort-Verwaltung erfolgt dort"
- [ ] Provider-Erkennung erfolgt serverseitig aus der Supabase-Session (kein Client-Side-Guess)

### Sektion: Account löschen
- [ ] Button "Ihren Account und Ihre Daten unwiderruflich löschen" (dunkle Farbe, visuell von anderen Buttons unterschieden)
- [ ] Klick öffnet shadcn/ui `AlertDialog` (gleicher Pattern wie Projekt-/Kapitel-Löschen in der App)
- [ ] Dialog fordert Texteingabe zur Bestätigung (z. B. "LÖSCHEN" eintippen); Löschen-Button ist disabled bis korrekte Eingabe
- [ ] **Vor der Löschung prüfen:** Ist der Nutzer auf mindestens einem Projekt der einzige Projektleiter? → Dialog zeigt Fehlermeldung: "Du bist auf [N] Projekt(en) der einzige Projektleiter. Übertrage die Projektleiterschaft oder lösche die Projekte zuerst." → Löschen-Button bleibt disabled
- [ ] Bei erfolgreicher Löschung: Supabase-Account wird gelöscht, Session wird beendet, Nutzer wird zu `/anmelden` weitergeleitet
- [ ] Nach Löschung: alle `profiles`-, `project_members`- und projektbezogenen Daten werden via RLS-Cascade entfernt (gemäß PROJ-1 Schema); `payments` und `voice_sessions` bleiben als Audit-Datensätze erhalten

## Edge Cases
- Nutzer gibt beim E-Mail-Ändern seine aktuelle E-Mail erneut ein → Validierungsfehler: "Das ist bereits deine aktuelle E-Mail-Adresse"
- Nutzer klickt mehrfach auf "Name speichern" → idempotent; doppelte Supabase-Requests werden durch Debounce oder Button-Disabled-State während des Requests verhindert
- Bestätigungs-E-Mail für neue E-Mail kommt nicht an → kein Self-Service-Resend in PROJ-3; Nutzer wendet sich an Support (Resend-Integration in PROJ-11)
- Nutzer löscht Account und hat offene Projekt-Einladungen (als Empfänger) → Einladungen werden mit dem Account-Delete-Cascade entfernt (PROJ-9 behandelt den vollständigen Einladungsflow)
- OAuth-Nutzer versucht auf den Sicherheits-Abschnitt zu tippen → Hinweis-Text ist nicht interaktiv, kein Button vorhanden; keine Aktion möglich
- Weniger als 30 Tage verbleibend → Warnhinweis mit Verweis auf Projektübersicht zur Verlängerung; kein Button im persönlichen Bereich
- Portal-Zugang läuft ab, während der Nutzer die Seite geöffnet hat → nächster Seitenaufruf / Route-Wechsel triggert Middleware-Redirect zu `/zugang-abgelaufen`; kein sofortiger Kick auf der aktuellen Seite nötig
- Nutzer hat mehrere Browser-Tabs offen und löscht Account in einem Tab → andere Tabs zeigen beim nächsten API-Call einen Auth-Fehler und leiten zu `/anmelden` weiter

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
_To be added by /qa_

## Deployment
_To be added by /deploy_
