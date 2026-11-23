# PROJ-3: Persönlicher Bereich + Konto

## Status: Approved

> Der Bereich **Account löschen** wurde neu gebaut (Refine 2026-11-22), die QA ist bestanden, der Code ist noch nicht deployed. Alle anderen Sektionen bleiben unverändert wie deployed.

**Created:** 2026-05-15
**Last Updated:** 2026-11-22 — Refined: Konto-Löschen neu geregelt, siehe „Refine 2026-11-22". Davor 2026-05-21 — Refined: Email-Edit + Apple-OAuth revert (Commit `02cf7d8` ⇄ `942f97a`); „Mein Zugang"-Sektion entfernt (Info ab PROJ-6 in Projektübersicht); Delete-Button-Label vereinfacht.

## Dependencies
- Requires: PROJ-2 (Auth + SSR) — für Session und OAuth-Provider-Erkennung
- Requires: PROJ-1 (Supabase-Datenmodell & RLS) — für `profiles` und `project_members`
- Soft dependency: PROJ-6 (Stripe-Zahlungen) — Rechnungsliste benötigt Stripe-Integration; Sektion ist in PROJ-3 als Placeholder angelegt, Stripe-Daten kommen mit PROJ-6
- Verwandt: PROJ-9 (Mitglieder, Rollen, Verlassen eines Projekts), PROJ-11 (Mail an die Nachfolge)
- Eigene Specs, noch zu schreiben: PROJ-26 Papierkorb für Kapitel und Projekte, PROJ-27 Zustimmung zu den AGB

## User Stories
- Als eingeloggter Nutzer möchte ich meinen Namen jederzeit ändern können, damit meine Anzeige in der App aktuell bleibt.
- Als Nutzer möchte ich eine Liste meiner bisherigen Zahlungen einsehen, damit ich Rechnungen für die Buchhaltung herunterladen kann.
- Als E-Mail+Passwort-Nutzer möchte ich mein Passwort direkt aus dem Konto-Bereich zurücksetzen können, damit ich nicht zur Anmeldeseite navigieren muss.
- Als Nutzer möchte ich meinen Account unwiderruflich löschen können, aber erst nach einer expliziten Bestätigung, damit versehentliche Löschungen verhindert werden.
- Als Mitglied eines gemeinsamen Projekts möchte ich, dass unser Buch bestehen bleibt, wenn eine andere Person ihr Konto löscht, damit niemand meine Texte durch eine eigene Kontolöschung vernichten kann.
- Als einzige Projektleitung möchte ich beim Löschen meines Kontos eine Nachfolge bestimmen, damit das Buch weitergeführt werden kann und ich trotzdem jederzeit gehen kann.

> **Bewusst ausgeklammert:** E-Mail-Adresse-Selbstbedienungs-Änderung (siehe Implementation Notes 2026-05-21). E-Mail-Wechsel läuft aktuell über den Support.

## Acceptance Criteria

### Seite & Layout
- [ ] Seite unter `/persoenlicher-bereich` (geschützte Route, Anmeldung erforderlich; auch mit abgelaufenem Zugang oder ohne Projekt erreichbar und von `/zugang-abgelaufen` aus verlinkt, damit das Konto immer gelöscht werden kann)
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
- [ ] **Löschen ist immer möglich:** Keine Rolle und kein Projekt blockiert die Kontolöschung.
- [ ] **Ein Konto löscht nie ein Projekt, in dem andere mitwirken.** Das gilt auch, wenn die Person Eigentümer oder Käufer ist, das Projekt verlassen hat oder daraus entfernt wurde.
- [ ] **Projekte nur mit dieser Person:** werden im Dialog aufgelistet und mit Kapiteln, Cover, Logo und Bildern im Speicher gelöscht.
- [ ] **Gemeinsame Projekte:** werden im Dialog aufgelistet und bleiben mit allen Kapiteln bestehen, auch mit den von dieser Person geschriebenen. War sie Eigentümer, geht das Eigentum an eine verbleibende Projektleitung über.
- [ ] **Einzige Projektleitung mit Co-Autoren:** Der Dialog zeigt pro Projekt eine Nachfolge-Auswahl, die am längsten beteiligte Person ist vorausgewählt. Sie wird sofort Projektleitung und per Mail informiert. Dieselbe Auswahl gilt beim Verlassen eines Projekts.
- [ ] **Noch nicht angenommenes Geschenk:** Löscht ein Käufer ohne eigenen Zugang sein Konto, bleiben Projekt und Einladung gültig. Beim Annehmen wird die beschenkte Person Eigentümer.
- [ ] **Wird entfernt:** Profil, Name, E-Mail, Anmeldung, Mitgliedschaften, noch nicht versendete Mails an die Person und ihre Angaben in bereits eingelösten Käufen (`purchase_claims`). Offene, bezahlte Käufe bleiben bestehen, damit sie nicht verloren gehen. Die Zuordnung „wer hat dieses Kapitel geschrieben" entfällt.
- [ ] **Bleibt erhalten:** `payments` und Rechnungen wegen der Aufbewahrungspflicht, ohne Verbindung zum gelöschten Konto.
- [ ] **Mitschreibende je Kapitel:** Künftig wird gespeichert, wer an einem Kapitel geschrieben hat, damit der Support Anfragen prüfen kann. Mitglieder können diese Angabe weder sehen noch ändern.
- [ ] **Sichere Prüfung:** Dialog und Löschung nutzen denselben serverseitigen Stand aus Mitgliedschaft und Eigentum. Schlägt eine Prüfung fehl, wird nichts gelöscht und eine Fehlermeldung gezeigt. Es bleibt kein halb gelöschtes Konto zurück.
- [ ] Bei erfolgreicher Löschung: Supabase-Account wird gelöscht, Session wird beendet, Nutzer wird zu `/anmelden` weitergeleitet
- [ ] **Texte:** Sektion und Dialog nennen weder Export noch Kopie. Der Satz „Exportieren Sie vorher ggf. wichtige Texte oder Bilder" entfällt. Der Dialog lautet:

  > **Account wirklich löschen?**
  > Das Löschen kann nicht rückgängig gemacht werden. Rechnungen müssen wir aus steuerlichen Gründen acht Jahre aufbewahren.
  >
  > **Wird gelöscht**
  > - Ihr Account: [Name] ([E-Mail])
  > - Projekt „[Titel]" (je Projekt, in dem nur Sie mitwirken)
  >
  > **Bleibt bestehen**
  > - Projekt „[Titel]" (je gemeinsames Projekt)
  >
  > Möchten Sie eigene Texte entfernen lassen, schreiben Sie uns bitte vor der Löschung an kontakt@narravit.de.
  >
  > **Nachfolge** (nur für die einzige Projektleitung eines Projekts mit weiteren Mitgliedern, nie für Co-Autoren): Wer soll „[Titel]" weiterführen? [Auswahl]
  >
  > Tippen Sie **LÖSCHEN** zur Bestätigung.

### Sonderfälle über den Support
- [ ] Eigene Texte aus einem gemeinsamen Projekt entfernen, eine Kopie der eigenen Inhalte und Streitfälle werden auf Anfrage geklärt, nicht über eigene Funktionen in der App.
- [ ] Antwort innerhalb eines Monats, Entscheidung und Begründung werden dokumentiert. Bei einer Ablehnung wird auf das Beschwerderecht hingewiesen.
- [ ] Eine Kopie umfasst die eigenen Texte und selbst hochgeladenen Bilder in einem gängigen Format, die erste ist kostenlos. Druckfertige Dateien, Satz, Layout, Cover und Kapitel anderer gehören nicht dazu.

## Edge Cases
- Nutzer klickt mehrfach auf "Name speichern" → idempotent; doppelte Supabase-Requests werden durch Button-Disabled-State während des Requests verhindert
- Nutzer löscht Account und hat offene Projekt-Einladungen (als Empfänger) → Normale Einladungen an diese Adresse werden entfernt, das Projekt bleibt unberührt. Eine offene Geschenk-Einladung bleibt bis zu ihrem Ablauf gültig, sonst wäre das bezahlte Geschenk für niemanden mehr erreichbar (PROJ-9 behandelt den vollständigen Einladungsflow)
- Projekt nur mit dieser Person, aber mit offener normaler Einladung → Projekt wird mitgelöscht, die Einladung wird ungültig; der Dialog nennt das Projekt unter „Wird gelöscht"
- Zwei Projektleitungen löschen gleichzeitig ihr Konto → der Server prüft jede Löschung einzeln; die zweite Person muss eine Nachfolge wählen, falls sie nun die einzige Projektleitung ist
- Die gewählte Nachfolge löscht gleichzeitig ihr Konto oder verlässt das Projekt → Löschung bricht ab, der Dialog zeigt die aktuelle Auswahl neu
- Erzählende Person ohne Konto (PROJ-12): Hat sie in einem Projekt nur mit dem Käufer bereits erzählt, muss der Dialog darauf hinweisen. Regel beim Bau von PROJ-12 festlegen.
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

## Refine 2026-11-22: Konto-Löschen

**Anlass:** Die Prüfung von Code und Stage-Schema hat gezeigt, dass eine Kontolöschung ganze Projekte anderer vernichten kann. `projects.owner_id` steht auf `ON DELETE CASCADE`, die bisherige Prüfung zählt aber nur Mitglieder mit der Rolle Projektleiter. Betroffen sind Eigentümer mit zweiter Projektleitung, Eigentümer, die das Projekt verlassen haben oder entfernt wurden, und angemeldete Käufer eines Geschenks ohne eigenen Zugang. Der Trigger zum letzten Projektleiter schützt nicht, weil zuerst das Projekt gelöscht wird.

**Entscheidungen von Jakob:**
- Das Löschen des Kontos muss immer möglich sein.
- Die Kontolöschung löscht das Konto, aber nicht die Kapitel in gemeinsamen Projekten.
- Sonderfälle und Sonderwünsche werden auf Anfrage über den Support geklärt und nicht alle in Dialoge und Funktionen eingebaut.
- Gelöschte Kapitel und Projekte mit mehreren Mitgliedern kommen in einen 14-Tage-Papierkorb (eigene Spec PROJ-26).
- Mitschreibende stimmen beim Beitritt den AGB zu (eigene Spec PROJ-27). Die AGB unterscheiden nach Rollen.
- Der Dialog erwähnt keine Kopie, und die App bietet keinen standardisierten Export an.

**Rechtliche Einordnung (Recherche, keine Rechtsberatung, vor dem Go-live anwaltlich prüfen):**
- Art. 17 DSGVO betrifft die Daten der löschenden Person, nicht automatisch die Texte anderer.
- Die bloße Möglichkeit, ein Kapitel zu lesen oder zu bearbeiten, macht es nicht zum gemeinsamen Werk. Das Urheberrecht bleibt bei der schreibenden Person (§§ 7, 8, 29 UrhG). Dass ihre Texte im Buch bleiben dürfen, stützt sich deshalb auf ein einfaches, auf dieses Buch begrenztes Nutzungsrecht in den AGB (§ 31 UrhG).
- Die eigenen Texte sind in der Regel auch personenbezogene Daten. Löschung und Kopie auf Anfrage (Art. 15, 17, 20 DSGVO) lassen sich nicht per AGB ausschließen, auch nicht wegen des Motivs, das Buch anderswo zu drucken.
- Keine Pflicht besteht für einen Export-Button, einen Hinweis im Lösch-Dialog oder druckfertige Dateien. Die Datenschutzerklärung muss die Rechte aber nennen (Art. 13 DSGVO).

## Technical Requirements
- Sicherheit: Name- und E-Mail-Updates ausschließlich über Server Actions / API Routes — kein direkter Client-Write auf `profiles`
- Sicherheit: OAuth-Provider-Erkennung serverseitig; kein Vertrauen auf Client-State
- Sicherheit: Account-Löschung prüft serverseitig Mitgliedschaft und Eigentum und bricht bei jedem Prüffehler ab
- Änderungen an RLS, Foreign Keys und am Auth-Ablauf brauchen Jakobs ausdrückliche Freigabe; Migrationen spielt Jakob selbst ein
- Stripe: Rechnungsliste und Download-Links kommen direkt aus der Stripe API (server-seitig) — nicht aus der `payments`-Tabelle; PROJ-6 baut den Stripe-Client
- UX: Alle destruktiven Aktionen (Löschen) nur über AlertDialog mit Bestätigung
- UX: Toast-Feedback nach Name-Save und nach Passwort-Reset-Trigger (shadcn/ui `Sonner`)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

> **Stand 2026-11-22, von Jakob freigegeben, einschließlich der zwei Datenbank-Änderungen.** Gilt für den Bereich „Account löschen" aus dem Refine vom selben Tag. Papierkorb (PROJ-26) und AGB-Zustimmung (PROJ-27) bekommen eigene Designs.

### A) Aufbau

```
Persönlicher Bereich
+-- Sektion „Account löschen" (Text ohne Export-Hinweis)
    +-- Lösch-Dialog (bestehender AlertDialog)
        +-- Übersicht, beim Öffnen frisch vom Server geladen
        |   +-- Wird gelöscht (Account und Einzelprojekte)
        |   +-- Bleibt bestehen
        |   +-- Hinweis auf verschenkte Bücher (ohne Titel)
        +-- Nachfolge-Auswahl je Projekt (bestehendes Select)
        +-- Bestätigung mit LÖSCHEN
        +-- Lade- und Fehlerzustand

Nutzerübersicht im Projekt
+-- Dialog „Projekt verlassen"
    +-- Nachfolge-Auswahl, falls man die einzige Projektleitung ist

Seite „Zugang abgelaufen"
+-- Link „Zum persönlichen Bereich"

Im Hintergrund
+-- Löschablauf auf dem Server (ein Schritt: alles oder nichts)
+-- Mail „Sie leiten jetzt dieses Projekt"
+-- Aufräumen der Dateien, Wiederholung im bestehenden täglichen Cron
```

### B) Was gespeichert wird

| Daten | Änderung |
|---|---|
| Eigentümer eines Projekts | Hängt nicht mehr am Konto. Wird ein Konto gelöscht, bleibt das Projekt bestehen |
| Mitschreibende je Kapitel (neu) | Kapitel, Person und Zeitpunkt des ersten Beitrags. Nur für den Support, Mitglieder können es weder sehen noch ändern. Der Eintrag verschwindet mit dem Konto |
| Aufräum-Liste für Dateien (neu) | Nur die Projekt-ID und der Stand der Versuche, keine personenbezogenen Daten |
| Mail-Warteschlange | Kennt zusätzlich die neue Nachfolge-Mail |

### C) Ablauf beim Löschen

1. **Prüfen:** Der Server lädt den aktuellen Stand und prüft die gewählte Nachfolge. Bei einem Fehler passiert nichts.
2. **Ein Datenbankschritt, alles oder nichts:** Nachfolge setzen, Eigentum übergeben, Einzelprojekte löschen, eingelöste Käufe bereinigen, Einladungen an die Person entfernen, Dateien zum Aufräumen vormerken.
3. **Konto löschen:** Profil und Mitgliedschaften verschwinden dabei automatisch in einem Schritt.
4. **Nacharbeiten:** Dateien löschen, offene Mails bereinigen, die Nachfolge informieren. Scheitert etwas davon, holt es der tägliche Cron nach.
5. **Abschluss:** Abmelden und Weiterleitung zu `/anmelden`.

Scheitert Schritt 3, bleibt das Konto bestehen und die Löschung lässt sich wiederholen. Bereits gelöschte Einzelprojekte bleiben gelöscht, weil die Person das bestätigt hat.

### D) Entscheidungen

| Entscheidung | Warum |
|---|---|
| Projekt löst sich vom Konto | Das behebt die Ursache. Das Eigentümer-Feld wird sonst nirgends für Rechte genutzt, die Änderung ist also risikoarm |
| Sperre für die letzte Projektleitung bleibt | Weil das Projekt nun bestehen bleibt, greift sie künftig wirklich. Fehlt die Nachfolge, bricht die Löschung ab, statt Inhalte zu verlieren |
| Nachfolge gilt sofort, ohne Annahme | Müsste jemand erst zustimmen, könnte eine Person ihr Konto nicht zuverlässig löschen |
| Mitschreibende in eigener Tabelle | Mitglieder dürfen Kapitel ändern und könnten eine Angabe im Kapitel selbst fälschen (Lehre aus PROJ-1 BUG-2) |
| Erfasst wird, wer schreibt, nicht wer anlegt | Oft legt eine Person das Kapitel an und eine andere schreibt es. Für Support-Anfragen zählt, wer den Text verfasst hat |
| Verschenkte Bücher nur als allgemeiner Hinweis | Der Käufer ohne eigenen Zugang darf den Titel der beschenkten Person nicht sehen |
| Offene Geschenk-Einladung bleibt gültig | Sonst wäre ein bezahltes Geschenk für niemanden mehr erreichbar |
| Offene Käufe bleiben, eingelöste werden bereinigt | Ein bezahlter, noch nicht eingelöster Kauf ginge sonst verloren |
| Dateien über eine Aufräum-Liste | Der Speicher gehört nicht zur Datenbank-Transaktion. So geht keine Datei verloren, die eigentlich gelöscht werden muss. PROJ-26 nutzt denselben Baustein |
| Bestehende RLS-Regeln bleiben unverändert | Der Löschablauf läuft nur auf dem Server. Die neuen Tabellen sind für Browser-Zugriffe komplett gesperrt |

### E) Datenbank-Änderungen (von Jakob freigegeben, Jakob spielt sie ein)

1. **Schutz-Änderung:** Das Projekt hängt nicht mehr am Konto. Sie funktioniert auch mit dem heutigen Code und schließt die gefährliche Lücke sofort, deshalb kommt sie zuerst.
2. **Bau-Änderung:** Mitschreibende je Kapitel, Aufräum-Liste, serverseitiger Löschablauf und die neue Mail-Art. Muss vor dem Code-Deploy eingespielt werden.

### F) Neue Abhängigkeiten

Keine neuen Pakete, keine neue Umgebungsvariable.

### G) Reihenfolge der Umsetzung

1. Schutz-Änderung einspielen und prüfen
2. Bau-Änderung und Löschablauf auf dem Server, mit automatischen Tests für alle Fälle aus der Spec
3. Lösch-Dialog, Nachfolge beim Verlassen, Link auf „Zugang abgelaufen"
4. Nachfolge-Mail im bestehenden Mail-Design
5. Auf Stage prüfen, Go-live-Liste ergänzen

## Implementation Notes — Backend 2026-11-22

**Stand:** Code und Unit-Tests sind fertig, nichts ist committet oder deployed.
- [x] Schutz-Migration `20261122130000_proj3_project_survives_account_delete.sql`, auf Stage eingespielt und geprüft.
- [x] Bau-Migration `20261122140000_proj3_account_deletion.sql` auf Stage eingespielt, Tabellen, Trigger und Rechte dort geprüft. Der neue Code läuft nur lokal gegen Stage, deployed ist er nicht. E2E mit dem QA-Konto: 7 von 7 (Dialog, Bestätigung, Abbrechen, Letzte-Leitung-Sperre), ohne eine echte Löschung. Lokal mit PGlite (echtes Postgres) zusammen mit allen 24 Migrationen eingespielt, 51 von 51 Datenbank-Szenarien bestanden: alle Löschfälle, Verlassen, Mitschreibende, Rechte. Nicht abgedeckt, weil PGlite nur eine Verbindung hat: gleichzeitige Löschungen, und die Supabase-Funktion `auth.admin.deleteUser` selbst.
- [x] Löschablauf, Übersicht im Dialog, Nachfolge beim Löschen und Verlassen, Aufräumen der Dateien im täglichen Cron, Nachfolge-Mail, Link auf „Zugang abgelaufen".

**Abweichungen und Ergänzungen:**
- Der Dialog heißt weiter „Account wirklich löschen?", passend zu Abschnitt und Button.
- Die Löschung prüft die Eingabe „LÖSCHEN" jetzt auch auf dem Server.
- Die Datenbank bricht ab, wenn ein Projekt gelöscht würde, das die Person im Dialog nicht gesehen hat.
- Hat eine Person als einzige Mitwirkende ein noch nicht angenommenes Geschenk im Projekt, wird die beschenkte Person mit der Annahme Projektleitung.
- Der E2E-Test AC-18 klickte die echte Löschung an und hätte das QA-Konto auf Stage gelöscht. Er prüft jetzt nur noch den Dialog und darf den Button nie klicken.
- Die Nachfolge-Mail nutzt das bestehende Mail-Layout, ein Frame in der Figma-Datei fehlt noch.

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

## Nachtrag 2026-10-14 — Passwort für Google-/Facebook-Konten

- Abschnitt „Sicherheit" zeigt den Button jetzt auch für Konten, die per Google oder Facebook angelegt wurden (früher nur Hinweis „Passwort-Verwaltung erfolgt dort").
- Drei Zustände:
  - E-Mail-Konto: unverändert „Passwort zurücksetzen".
  - Google-/Facebook-Konto ohne Passwort: „Sie melden sich über Google an. Wenn Sie sich zusätzlich mit einer E-Mail-Adresse und einem Passwort anmelden möchten, können Sie hier ein Passwort festlegen." — Button „Passwort festlegen".
  - Google-/Facebook-Konto mit Passwort: Hinweis, dass zusätzlich ein Passwort festgelegt ist — Button „Passwort ändern".
- Ob ein Passwort existiert, liefert Supabase nicht mit dem Nutzer-Objekt. Das Reset-Formular setzt deshalb beim Speichern den Marker `has_password` in den Nutzer-Metadaten; ausgewertet wird er in `src/lib/auth/has-password.ts` (mit Unit-Test). Der Marker steuert nur die Beschriftung, keine Berechtigung.
- Bewusst **ohne** Datenbank-Änderung: Eine Hilfsfunktion in der Datenbank wäre genauer gewesen, die Supabase-Anbindung durfte am 2026-10-14 aber keine Migration anwenden („You do not have permission").
- Nicht im Browser mit einem Google-Konto geprüft (QA-Konto ist ein E-Mail-Konto); Typprüfung, Unit-Tests und der E2E-Test für E-Mail-Konten (AC-13) sind grün.

## QA Test Results — Konto-Löschen (2026-11-22)

**Getestet:** 2026-11-22
**App:** lokaler Dev-Server (`localhost:3000`) gegen die Stage-Datenbank
**Tester:** QA Engineer (AI)
**Testkonten:** je Lauf zwei temporäre Konten, danach restlos entfernt und auf Stage nachgeprüft. Das QA-Konto blieb unberührt.

### Acceptance Criteria Status

- [x] AC-D1: Button öffnet den Dialog
- [x] AC-D2: Löschen erst nach Eingabe von `LÖSCHEN`, auch auf dem Server geprüft
- [x] AC-D3: Löschen ist immer möglich, keine Rolle blockiert es
- [x] AC-D4: Ein Konto löscht nie ein Projekt, in dem andere mitwirken, auch nicht mit manipuliertem Formular
- [x] AC-D5: Einzelprojekte werden mit Kapiteln und Dateien aus allen vier Speichern gelöscht
- [x] AC-D6: Gemeinsame Projekte bleiben, das Eigentum geht über
- [x] AC-D7: Nachfolge wird gesetzt und die Mail ausgelöst (Zustellung nicht geprüft, lokal fehlt der Resend-Schlüssel)
- [x] AC-D8: Dieselbe Nachfolge-Auswahl funktioniert beim Verlassen eines Projekts
- [x] AC-D9: Offene Geschenk-Einladung bleibt gültig, die beschenkte Person wird Projektleitung
- [x] AC-D10: Profil, Anmeldung, Mitgliedschaften, normale Einladungen und Daten eingelöster Käufe werden entfernt
- [x] AC-D11: Zahlungen bleiben ohne Personenbezug, offene Käufe bleiben bestehen
- [x] AC-D12: Mitschreibende werden über die echte Session erfasst und verschwinden mit dem Konto
- [x] AC-D13: Bei jeder fehlgeschlagenen Prüfung wird nichts gelöscht
- [x] AC-D14: Nach der Löschung ist die Session beendet und keine Anmeldung mehr möglich
- [ ] AC-D15: Dialogtexte sind lesbar. **BUG-2:** Auf Smartphone und Tablet verdeckt die Kopfzeile Überschrift und Warnung
- [x] AC-D16: Von „Zugang abgelaufen" führt ein Link zum persönlichen Bereich, das Löschen bleibt erreichbar

Die drei Kriterien unter „Sonderfälle über den Support" sind ein Arbeitsablauf und keine App-Funktion. Sie stehen in `docs/production/prod-umzug.md`, Abschnitt 8.

### Edge Cases Status

- [x] Nachfolge verlässt das Projekt, während gelöscht wird (5 parallele Durchläufe): kein Datenverlust
- [x] Doppelter Löschversuch: Nachfolge und Mail genau einmal
- [x] Zwei Projektleitungen verlassen gleichzeitig (5 Durchläufe): eine bleibt immer
- [x] Echtes `deleteUser` bei der letzten Projektleitung wird von der Datenbank abgelehnt, nichts ändert sich
- [x] Gescheiterter Versuch lässt sich wiederholen
- [x] Offene normale Einladung, abgelaufenes Geschenk und Geschenk an die eigene Adresse
- [ ] Zwei Projektleitungen lösen im selben Moment ein echtes `deleteUser` aus: nur einzeln geprüft (Datenbank-Sperre und paralleler Vorbereitungsschritt)
- [ ] Erzählende Person ohne Konto: Regel folgt mit PROJ-12

### Security Audit Results

- [x] Angemeldete und anonyme Nutzer erreichen keine der fünf neuen Funktionen und keine der beiden neuen Tabellen (gegen die echte Stage-API geprüft)
- [x] Manipulierte Formulare: fehlende Bestätigung, nicht bestätigtes Projekt, fremde Nachfolge, zusätzliches fremdes Projekt
- [x] XSS: Projekttitel mit HTML wird im Dialog nur als Text angezeigt
- [x] Die Person kommt immer aus der geprüften Session, nie aus dem Formular
- [x] **BUG-6:** Keine erneute Identitätsprüfung vor der unwiderruflichen Löschung (bewusst akzeptiert, Jakob 2026-11-23)
- [ ] **BUG-7:** Co-Autoren dürfen laut RLS-Regel das Feld `owner_id` ändern

### Bugs Found

#### BUG-2: Kopfzeile verdeckt Überschrift und Warnung im Lösch-Dialog
- **Severity:** High
- **Schritte:** Auf Smartphone (375 px) oder Tablet (768 px) mit mehreren Projekten den Lösch-Dialog öffnen und ganz nach oben scrollen.
- **Erwartet:** Überschrift und Warnung sind sichtbar. **Tatsächlich:** Die Kopfzeile (`z-[60]`) liegt über dem Dialog (`z-50`), die Überschrift ist nicht erreichbar.
- **Priorität:** Vor dem Deployment beheben. Der E2E-Test ist mit `test.fail` markiert.

#### BUG-3: Alte Fehlermeldung bleibt beim erneuten Öffnen stehen
- **Severity:** Low
- **Schritte:** Fehler im Dialog auslösen, „Abbrechen", Dialog erneut öffnen. Die alte Meldung ist weiter sichtbar.
- **Priorität:** Vor dem Deployment beheben. Der E2E-Test ist mit `test.fail` markiert.

#### BUG-4: Projekte mit nie angenommenem Geschenk bleiben für immer gespeichert
- **Severity:** Medium
- **Schritte:** Käufer mit eigenem Zugang schreibt Kapitel und löscht sein Konto, die beschenkte Person nimmt nie an.
- **Erwartet:** Die Inhalte werden nach einer festen Frist gelöscht. **Tatsächlich:** Die Einladung wird 30 Tage nach Ablauf entfernt, das Projekt bleibt ohne Mitglieder und ohne Eigentümer dauerhaft liegen. Kein Job räumt es auf.
- **Priorität:** Vor dem Go-live, zusammen mit der offenen Aufbewahrungsregel von 90 Tagen.

#### BUG-5: Text im Lösch-Dialog hat zu wenig Kontrast
- **Severity:** Medium
- **Gemessen:** 3,46:1, gefordert sind mindestens 4,5:1 (WCAG AA). Das ist für die ältere Zielgruppe relevant. Vermutliche Ursache: `text-muted-foreground` der `AlertDialogDescription` setzt sich gegen `text-[#535252]` durch.
- **Priorität:** Vor dem Deployment beheben.

#### BUG-6: Keine erneute Identitätsprüfung vor der Löschung
- **Severity:** Medium
- **Beschreibung:** Eine offene Sitzung und das Wort `LÖSCHEN` reichen. Wer an ein entsperrtes Gerät kommt, kann Konto und Einzelprojekte unwiderruflich löschen. Bestand schon vor diesem Refine.
- **Priorität:** Produktentscheidung. Für Google- und Facebook-Konten bräuchte es einen Code per Mail statt eines Passworts.
- **Entscheidung Jakob, 2026-11-23:** Es bleibt bei `LÖSCHEN`, das Risiko ist bewusst akzeptiert.

#### BUG-7: Co-Autoren können das Feld `owner_id` ändern
- **Severity:** Low
- **Beschreibung:** Die RLS-Regel `projects: update as member` gilt für die ganze Zeile. Das Feld verleiht keine Rechte und führt nach der Schutz-Migration nicht mehr zum Löschen. Aus der Regel abgeleitet, nicht ausgeführt.
- **Priorität:** Bei der nächsten RLS-Änderung mit erledigen.

#### BUG-8: Projektlisten sind auf dem Smartphone zentriert
- **Severity:** Low
- **Beschreibung:** Die Aufzählungspunkte stehen links, der Text in der Mitte.
- **Priorität:** Zusammen mit BUG-2 beheben.

Der frühere BUG-1 (Button nach dem Sole-Owner-Fehler) ist überholt, weil es diese Sperre nicht mehr gibt. Dass auch das normale Löschen eines Projekts seine Dateien nicht entfernt, wird mit PROJ-26 gelöst.

### Automatische Tests

- Unit-Tests: 649 von 649 bestanden
- Datenbank mit PGlite: 51 von 51 Szenarien bestanden
- Echte Löschung gegen Stage (`tests/PROJ-3-konto-loeschen.spec.ts`, nur mit `E2E_ACCOUNT_DELETION=1`): 21 von 21, davon 3 als bekannte Fehler markiert
- E2E-Regression Chromium: 134 bestanden, 23 übersprungen, 0 fehlgeschlagen

**Nicht geprüft:** Firefox und Safari (auf diesem Mac nicht lauffähig, Smartphone und Tablet nur als Chromium-Ansicht), die tatsächliche Zustellung der Nachfolge-Mail und der Ablauf auf `stage-app.narravit.de`, weil der Code noch nicht deployed ist.

### Summary

- **Acceptance Criteria:** 15 von 16 bestanden
- **Bugs:** 7 offen (0 Critical, 1 High, 3 Medium, 3 Low)
- **Security:** Kernschutz bestanden, 2 Hinweise offen (BUG-6, BUG-7)
- **Production Ready:** NEIN
- **Empfehlung:** Erst BUG-2 beheben, sinnvollerweise zusammen mit BUG-3, BUG-5 und BUG-8, dann erneut `/qa`

### Nachbesserung 2026-11-22

Jakob: alle Bugs beheben und sinnvoll auf Projekte verteilen.

| Bug | Stand |
|---|---|
| BUG-2 Kopfzeile | Behoben: Alle Lösch-Dialoge und die Mitglieder-Dialoge liegen über der Kopfzeile. Im Test auf 375 und 768 px bestätigt |
| BUG-3 Alte Fehlermeldung | Behoben und getestet |
| BUG-4 Nie angenommene Geschenke | Verschoben nach **PROJ-28**. Entscheidung Jakob: Projekte laufen mit dem Projektzugang aus |
| BUG-5 Kontrast | Behoben und per Test auf mindestens 4,5:1 abgesichert |
| BUG-6 Identitätsprüfung | Bewusst nicht umgesetzt (Jakob, 2026-11-23), es bleibt bei `LÖSCHEN` |
| BUG-7 Eigentümer-Feld | Behoben: Migration `20261122150000_proj3_protect_project_owner.sql` ist auf Stage aktiv und gegen die echte API getestet |
| BUG-8 Zentrierte Listen | Behoben und getestet |

**Textänderungen von Jakob:** Der Satz zu gemeinsamen Kapiteln ist entfernt. „Wird gelöscht" nennt jetzt zuerst den Account, danach die Projekte. Die Nachfolge-Auswahl erscheint nur für die einzige Projektleitung eines Projekts mit weiteren Mitgliedern.

**Tests nach der Nachbesserung:** Unit 649 von 649, Datenbank mit PGlite 53 von 53, echte Löschung gegen Stage 23 von 23, E2E-Regression Chromium 134 bestanden, 25 übersprungen (davon 23 die abgesicherte Löschsuite), 0 fehlgeschlagen. Typprüfung und Production-Build sind grün, ESLint meldet 0 Fehler. Nach dem Lauf waren auf Stage keine Testdaten mehr vorhanden, das QA-Konto ist unberührt.

**Ergebnis:** 16 von 16 Kriterien bestanden, keine offenen Critical- oder High-Bugs in PROJ-3. **Status: Approved.**

**Weiterhin nicht geprüft:** die tatsächliche Zustellung der Nachfolge-Mail, Firefox und Safari, der Ablauf auf `stage-app.narravit.de` (Code noch nicht deployed) und zwei wirklich zeitgleiche `deleteUser`-Aufrufe. Vor dem Go-live offen bleiben PROJ-26, PROJ-27, PROJ-28 und die Identitätsprüfung in PROJ-19.

## Deployment

**Deployed:** 2026-05-17
**Branch:** stage → Vercel Preview
**Commits:** `e36fd38` (feat), `eca4809` (QA tests), `0269986` (UI polish + banner)
**Build:** ✅ `next build` passed (TypeScript clean, all 13 routes generated)
**Pre-flight:** 17/17 Playwright E2E tests green on stage
