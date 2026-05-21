# PROJ-9: Projekt-Mitglieder + Einladungen

## Status: Deployed
**Created:** 2026-05-21
**Last Updated:** 2026-05-21 — Deployed to stage-app.narravit.de

## Dependencies
- Requires **PROJ-1** (Supabase-Datenmodell & RLS) — `project_members`, `invitations` Tabellen + `member_role` Enum existieren bereits
- Requires **PROJ-2** (Auth + SSR) — Login/Signup-Flow nötig für Accept-Page
- Requires **PROJ-4** (Kapitel-Routing & Persistenz) — Mitgliederliste wird in der Projektübersicht angezeigt
- Soft dependency: **PROJ-11** (Resend-Transaktionsmails) — sobald live, übernimmt PROJ-11 den automatischen Versand der Einladungs-Mails; bis dahin werden Links manuell weitergeleitet

## User Stories
- Als **Initiator/Projektleiter** möchte ich Familienmitglieder zu meinem Projekt einladen können, damit mehrere Personen gemeinsam am Lebensbuch arbeiten können.
- Als **Initiator/Projektleiter** möchte ich einen Einladungs-Link erzeugen, den ich z. B. per WhatsApp oder Mail an die einzuladende Person schicken kann — auch wenn sie noch keinen Account hat.
- Als **eingeladene Person** möchte ich über den Link auf einer klaren Seite den Beitritt bestätigen können, mit Anzeige von Projekt, Rolle und Einladendem — damit ich weiß, worauf ich klicke.
- Als **eingeladene Person ohne Account** möchte ich beim Öffnen des Links unkompliziert ein Konto anlegen können, ohne die Einladung zu verlieren.
- Als **Projektleiter** möchte ich die Rolle eines bestehenden Mitglieds nachträglich ändern können (Co-Autor ↔ Projektleiter), damit ich Verantwortung teilen oder zurückziehen kann.
- Als **Projektleiter** möchte ich Mitglieder wieder entfernen können, wenn sie nicht mehr am Projekt mitarbeiten sollen.
- Als **Mitglied** (Projektleiter oder Co-Autor) möchte ich das Projekt selbst verlassen können, wenn ich nicht mehr mitwirken will — solange dadurch nicht der letzte Projektleiter wegfällt.
- Als **Co-Autor** möchte ich sehen, wer sonst noch im Projekt ist (Transparenz), aber ich erwarte keine Management-Funktionen.

## Acceptance Criteria

### Mitgliederliste (Projektübersicht)
- [ ] Auf jeder Projektübersichts-Seite gibt es eine Sektion „Nutzerübersicht" mit allen Mitgliedern des Projekts.
- [ ] Jede Mitglieder-Zeile zeigt: Avatar mit Initiale (Farbe aus stabilem Hash der user-id, gemäß `projektuebersicht-palette.ts`), Anzeigename, E-Mail, Rolle als Klartext-Label („Projektleiter" oder „Co-Autor").
- [ ] Anzeigename = `full_name` aus `profiles` falls vorhanden, sonst aus dem Email-Local-Part abgeleitet (Title-Case wie in der alten App).
- [ ] **Projektleiter** sieht pro Mitglied: Rollen-Wechsel-Control (Dropdown oder Toggle) + Entfernen-Button (Trash-Icon).
- [ ] **Co-Autor** sieht die Liste, aber keine Management-Buttons; lediglich ein eigener „Projekt verlassen"-Button am Ende der Sektion.
- [ ] Bei nur 1 Mitglied (nur Projektleiter selbst): Sektion zeigt diesen Eintrag plus den prominenten „Nutzer hinzufügen"-Button.

### Pending-Einladungen (out of UI scope für MVP)
- [ ] Pending-Einladungen werden bewusst **nicht** als separate Liste in der UI angezeigt.
- [ ] Konsequenz: Wer den Link beim Erstellen verloren hat, muss eine neue Einladung erzeugen (führt zu einer neuen Invitation-Row in der DB; alte bleibt bis Ablauf liegen).
- [ ] Abgelaufene Einladungen werden **30 Tage nach Ablauf** (`expires_at`) automatisch aus der DB entfernt — Bereinigung läuft als planbarer Job (konkrete Implementierung in `/architecture`).

### Einladung erstellen — Modal Step 1 (Eingabe)
- [ ] „Nutzer hinzufügen"-Button öffnet ein Modal mit Formularfeldern: E-Mail-Adresse (Pflicht) und Rolle (Dropdown: „Projektleiter" / „Co-Autor", Default „Co-Autor").
- [ ] Validierung E-Mail-Format (Standard-Regex), live Feedback unter dem Feld.
- [ ] „Einladen"-Button ist deaktiviert, solange E-Mail ungültig ist.
- [ ] **Pre-Checks vor Submit:**
    - E-Mail gehört bereits zu einem aktiven Mitglied → Inline-Fehler „Diese Person ist bereits Mitglied dieses Projekts."
    - E-Mail ist die des aktuell eingeloggten Projektleiters → Inline-Fehler „Du kannst dich nicht selbst einladen."
- [ ] Bei Abbrechen wird das Modal geschlossen, kein DB-Eintrag.

### Einladung erstellen — Modal Step 2 (Link-Anzeige)
- [ ] Nach erfolgreichem Submit wechselt das Modal auf eine zweite Ansicht: Erfolgs-Meldung („Einladung für name@beispiel.de wurde angelegt") + generierte Token-URL prominent + „Link kopieren"-Button (kopiert in Zwischenablage) + Hinweis „Der Link ist 14 Tage gültig — bitte leite ihn manuell an die Person weiter."
- [ ] „Schließen"-Button beendet das Modal. Der Link ist danach in der UI nicht mehr abrufbar.
- [ ] Die Token-URL hat die Form `<app-origin>/einladung/<token>`.

### Accept-Flow (Eingeladene Person)
- [ ] Route `/einladung/<token>` zeigt für gültige, ungenutzte Token eine Vorschau: Projektname, zugewiesene Rolle, Name des einladenden Projektleiters, Ablaufdatum.
- [ ] Wenn der Token-Empfänger **nicht eingeloggt** ist: die Vorschau-Seite enthält Buttons „Anmelden" und „Konto erstellen", beide leiten zur Login/Signup-Seite mit vorausgefüllter E-Mail-Adresse aus der Einladung. Nach erfolgreichem Login/Signup landet der User zurück auf `/einladung/<token>`.
- [ ] Wenn der Token-Empfänger **eingeloggt** ist und die eingeloggte E-Mail **exakt** der Einladungs-E-Mail entspricht: „Annehmen"-Button ist sichtbar. Klick fügt den User als Mitglied hinzu (Rolle aus Einladung), markiert die Einladung als angenommen (`accepted_at` gesetzt) und leitet zur Projektübersicht.
- [ ] Wenn der Token-Empfänger **eingeloggt** ist, aber mit einer **anderen** E-Mail als der eingeladenen: kein „Annehmen"-Button. Stattdessen Hinweis „Diese Einladung gilt für a@x.de, du bist als b@x.de eingeloggt. Bitte melde dich mit der korrekten Adresse an." + „Abmelden"-Button.
- [ ] „Ablehnen" gibt es in PROJ-9 **nicht** — die Einladung läuft entweder regulär ab oder wird durch Annehmen verbraucht.
- [ ] Server-Action `acceptInvitation` prüft serverseitig: Token-Existenz + Gültigkeit + `accepted_at IS NULL` + Email-Match zur eingeloggten Session — keine Aktion ohne strikte Email-Übereinstimmung.

### Mitglied entfernen (Projektleiter)
- [ ] Klick auf Trash-Button öffnet Bestätigungs-Dialog mit Name + Warnung „Der Nutzer verliert den Zugriff auf dieses Projekt …".
- [ ] „Endgültig entfernen" löscht die `project_members`-Zeile.
- [ ] **Constraint:** das letzte Mitglied mit Rolle „Projektleiter" kann nicht entfernt werden — Trash-Button ist in diesem Fall deaktiviert mit Tooltip „Mindestens ein Projektleiter muss verbleiben."

### Rolle ändern (Projektleiter)
- [ ] Inline-Control pro Mitglied erlaubt Umschalten zwischen „Projektleiter" und „Co-Autor".
- [ ] Änderung wird sofort persistiert; UI zeigt unmittelbar die neue Rolle.
- [ ] **Constraint:** der letzte verbliebene Projektleiter kann sich (oder einen anderen letzten PL) nicht degradieren — Versuch zeigt Fehlerhinweis „Befördere zuerst eine andere Person zum Projektleiter, bevor du deine Rolle wechselst."
- [ ] Projektleiter kann den eigenen Status ändern (sich selbst degradieren), solange ein anderer PL existiert.

### Projekt verlassen (beide Rollen)
- [ ] Am Ende der Mitglieder-Sektion ist ein eigener „Projekt verlassen"-Button für das aktuell eingeloggte Mitglied sichtbar.
- [ ] Klick öffnet Bestätigungs-Dialog: „Möchtest du das Projekt … wirklich verlassen? Du verlierst den Zugriff."
- [ ] Bestätigung entfernt die eigene `project_members`-Zeile und leitet auf den persönlichen Bereich.
- [ ] **Constraint:** der letzte verbliebene Projektleiter kann nicht selbst verlassen — Button deaktiviert mit Tooltip „Befördere zuerst eine andere Person zum Projektleiter."

### Sicherheit / RLS
- [ ] Alle schreibenden Aktionen (Invite, Remove, Role-Change, Self-Leave, Accept) werden serverseitig auf Auth + Rolle geprüft — UI-Disables sind nicht die alleinige Verteidigung.
- [ ] Ein Co-Autor kann selbst per manuell zusammengebauten API-Calls keine Invite/Remove/Role-Change-Aktionen ausführen (RLS + Server-Action-Guards).
- [ ] Token-Werte werden kryptografisch sicher generiert (mind. 128 Bit Entropie); konkrete Erzeugung in `/architecture`.

## Edge Cases
- **Email gehört bereits zu einem aktiven Mitglied:** Pre-Check in Step 1 verhindert Submit mit Inline-Fehler. Kein Invitation-Row wird angelegt.
- **Email gehört zu einem User, der schon mal Mitglied war und entfernt wurde:** behandelt wie neue Einladung — die alte `project_members`-Zeile ist weg, ein erneutes Beitreten ist erlaubt.
- **Selbst-Einladung:** Pre-Check in Step 1 verhindert dies; Server-Action prüft zusätzlich.
- **Token abgelaufen:** Accept-Route zeigt „Diese Einladung ist abgelaufen. Bitte fordere eine neue an." — kein User wird Mitglied.
- **Token bereits angenommen:** Accept-Route zeigt „Diese Einladung wurde bereits angenommen." — wenn der angenommene User dem aktuellen User entspricht, Redirect zur Projektübersicht; sonst Fehlerhinweis.
- **Token resolves zu gelöschtem Projekt:** Accept-Route zeigt „Dieses Projekt existiert nicht mehr."
- **Eingeladener User loggt sich mit anderer E-Mail ein:** strikte Ablehnung — kein „Trotzdem-Annehmen"-Pfad. Hinweis fordert zum Abmelden + Neuanmelden mit der eingeladenen Adresse auf.
- **Concurrent Accept (zwei Tabs):** Token hat Single-Use-Semantik (`accepted_at` wird beim Annehmen gesetzt); der zweite Klick zeigt „bereits angenommen".
- **Projektleiter wird entfernt, während eine seiner ausgestellten Einladungen noch ausstehend ist:** Einladung bleibt gültig (sie ist projekt-scoped, nicht einladender-scoped).
- **Last-PL-Schutz:** alle 3 betroffenen Pfade (Entfernen / Degrade / Self-Leave) müssen sowohl UI-seitig (Buttons disabled) als auch server-seitig (Server-Action-Reject) den Check durchführen.
- **Promotion zum Projektleiter eines Mitglieds, das gerade entfernt wird:** Race-Condition — zweite Aktion (Promote) schlägt fehl mit „Mitglied nicht mehr im Projekt".
- **Co-Autor versucht im Browser einen geleakten Server-Action-Endpoint mit Invite-Payload:** RLS + Server-Action-Guard lehnen ab; UI zeigt generischen Fehlerhinweis.
- **Sehr lange Anzeigenamen / E-Mail-Adressen:** Truncate mit Ellipsis in der Zeile; voller Wert per Tooltip / Title-Attribut.
- **Pending-Invitation für eine Person, die danach selbst über die normale Signup-Flow einen Account anlegt** (ohne den Token-Link zu nutzen): die Einladung bleibt bis Ablauf gültig; sobald die Person den Link öffnet, kann sie regulär annehmen.
- **DSGVO / Daten-Retention:** Invitations werden 30 Tage nach `expires_at` automatisch entfernt (siehe Pending-Einladungen-Sektion); angenommene Einladungen können denselben Retention-Job durchlaufen, da `accepted_at` der Endzustand ist.

## Technical Requirements
- **Auth + Session-Absicherung:** alle Aktionen prüfen die eingeloggte Session serverseitig; kein Vertrauen auf Client-Daten.
- **RLS-Policies:** existierende Policies für `project_members` und `invitations` aus PROJ-1 werden um die spezifischen Schreibrechte ergänzt (nur Projektleiter darf Invite/Remove/Role-Change; jede Person darf eigene Mitgliedschaft löschen, sofern Last-PL-Constraint erfüllt).
- **Token-Sicherheit:** kryptografisch starke Token (mind. 128 Bit Entropie), Speicherung als opaque String — keine Inhalts-Inferenz aus Token möglich.
- **Performance:** Mitgliederliste ist klein (typisch 1–10 Einträge); kein Pagination-Bedarf.
- **Accessibility:** Modale haben `role="dialog"` + `aria-labelledby`; Trash-Buttons und Rollen-Controls sind tastatur-bedienbar mit klaren Focus-States.
- **Retention-Job:** ein zeitgesteuerter Job (z. B. Supabase Edge Function via Cron oder `pg_cron`) entfernt Invitations älter als 30 Tage über `expires_at` — Implementierung in `/architecture`.
- **i18n / Copy:** alle User-sichtbaren Texte deutsch (Sie/Du-Form konsistent zum bestehenden Portal; PROJ-3-Stand prüfen).

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### A) Komponenten-Struktur (PM-Sicht)

```
Projektübersicht-Seite (existiert, Server-Component)
+-- Server-Lader (erweitert)
|   +-- bisher: lädt Projekt + Kapitel
|   +-- NEU: lädt zusätzlich die Mitgliederliste (mit Profil-Daten) und
|            die Rolle des eingeloggten Users für dieses Projekt
+-- ProjectUsersSection (NEU — 1:1-Migration aus alter App, an Echtdaten gekoppelt)
    +-- Mitglieder-Header („Nutzerübersicht" + "Nutzer hinzufügen"-Button für PL)
    +-- Mitglieder-Liste (Avatar + Name + E-Mail + Rolle)
    |   +-- bei Rolle "Projektleiter" des Betrachters:
    |   |   +-- Rollen-Wechsel-Control (Co-Autor ↔ Projektleiter)
    |   |   +-- Entfernen-Button (Trash)
    |   +-- bei Rolle "Co-Autor" des Betrachters: nur Anzeige
    +-- "Projekt verlassen"-Button (alle Mitglieder, eigene Aktion)
    +-- AddUserModal (2-stufig)
    |   +-- Step 1: Email + Rolle Eingabe → submit → server creates invitation
    |   +-- Step 2: Erfolgs-Ansicht mit Token-Link + "Kopieren"-Button
    +-- ConfirmRemoveModal (Bestätigungs-Dialog)
    +-- ConfirmLeaveModal (Bestätigungs-Dialog)
    +-- Last-PL-Tooltip (bei deaktivierten Aktions-Buttons)

Einladungs-Annahme-Seite /einladung/[token] (NEU, Server-Component)
+-- Server-Lader
|   +-- liest Invitation per Token über privilegierten Pfad (Token IS die Auth)
|   +-- liest Projekt-Name und Inviter-Name dazu
|   +-- prüft Auth-Status der Session und ggf. Email-Match
+-- AcceptView (Client-Wrapper für die jeweilige Variante):
    +-- Variante "ungültig/abgelaufen/bereits angenommen/Projekt gelöscht"
    |   +-- Hinweis-Text + Link zurück zur Startseite
    +-- Variante "nicht eingeloggt"
    |   +-- Vorschau (Projektname, Rolle, Einladender, Ablauf)
    |   +-- "Anmelden"-Button (Redirect zu Login mit pre-filled email + return-URL)
    |   +-- "Konto erstellen"-Button (Redirect zu Signup mit pre-filled email + return-URL)
    +-- Variante "eingeloggt, Email passt nicht"
    |   +-- Hinweis "gilt für a@x.de, du bist b@x.de"
    |   +-- "Abmelden"-Button
    +-- Variante "eingeloggt, Email passt"
        +-- Vorschau + prominenter "Annehmen"-Button
        +-- Klick → Server-Action accept → Redirect Projektübersicht

Datenbank
+-- project_members (Tabelle existiert)
|   +-- id, project_id, user_id, role, created_at — kein Schema-Wechsel
+-- invitations (Tabelle existiert)
|   +-- id, project_id, email, token, role, expires_at, accepted_at, created_at
|   +-- kein Schema-Wechsel; Token-Generierung wird in Server-Action gehärtet
+-- RLS-Erweiterung (Migration)
|   +-- ergänzt fehlende Policies für die schreibenden Aktionen
+-- Retention-Job (pg_cron oder Supabase Edge Function mit Cron-Schedule)
    +-- läuft täglich, löscht Invitations mit expires_at älter als 30 Tage
```

### B) Datenmodell (Plain Language)

Beide Tabellen existieren bereits aus PROJ-1 — kein Schema-Wechsel nötig. Hier nur die Bedeutung der Felder im Kontext von PROJ-9:

```
project_members
+-- id                Eindeutige Mitgliedschafts-ID
+-- project_id        Verknüpfung zum Projekt
+-- user_id           Verknüpfung zum Auth-User (profiles.id)
+-- role              "projektleiter" oder "co_author"
+-- created_at        Beitritts-Zeitpunkt

invitations
+-- id                Eindeutige Einladungs-ID
+-- project_id        Zu welchem Projekt eingeladen wird
+-- email             E-Mail-Adresse der eingeladenen Person (auch ohne Account)
+-- token             Opaque, kryptografisch sicherer Zufallswert (≥ 128 Bit Entropie)
+-- role              Rolle, die der Eingeladene bekommt
+-- expires_at        Ablauf-Zeitpunkt (Standard: created_at + 14 Tage)
+-- accepted_at       NULL solange ausstehend; gesetzt beim Annehmen (Single-Use-Marker)
+-- created_at        Erstellzeitpunkt der Einladung
```

Anzeigename eines Mitglieds wird aus `profiles.full_name` gelesen, mit Fallback auf Email-Local-Part (Title-Case). Avatar-Initiale = erster Buchstabe des Anzeigenamens. Avatar-Farbe = stabiler Hash aus `user_id` (Logik bereits in `projektuebersicht-palette.ts`).

### C) Tech-Entscheidungen (begründet)

1. **Token-Generierung via Server-side Crypto-Random** — der Token wird beim Erstellen der Einladung auf dem Server generiert, niemals im Client. Base64url-codierter Zufallswert mit ≥ 128 Bit Entropie. Damit ist Brute-Force aussichtslos und der Token selbst ist die Authentifizierung für die Accept-Seite — keine zusätzliche Geheimhaltung der angezeigten Projektnamen nötig.

2. **Accept-Page-Read über `SECURITY DEFINER`-Postgres-Funktion** — die einladende Person ist (noch) kein Mitglied des Projekts, hat also per RLS keinen normalen Lesezugriff auf das Projekt oder die Einladung. Der Token-Lookup läuft daher **fest** über eine dedizierte Postgres-Funktion (siehe Funktions-Migration C), die mit `SECURITY DEFINER` ausgestattet ist und ausschließlich Token-basiert lookt — sie gibt nur die strikt notwendigen Felder zurück (Projektname, Rolle, Inviter-Name, Ablauf, eingeladene Email). Vorteile gegenüber einem allgemeinen Service-Role-Client im Next.js-Code: der privilegierte Zugriff ist auf genau diese eine Operation eingeengt; der Service-Role-Key muss nicht in jede Server-Action geschleust werden; die Whitelist-Felder lassen sich im DB-Review prüfen.

3. **Strikte E-Mail-Übereinstimmung beim Accept** — die Server-Action vergleicht die eingeloggte Auth-User-E-Mail mit dem Einladungs-Empfänger-Feld (case-insensitive Vergleich mit Trim). Mismatch → Reject. Verhindert, dass jemand eine fremde Einladung mit dem eigenen Account akzeptiert.

4. **Last-PL-Constraint serverseitig + DB-Trigger als Fail-Safe** — drei Verteidigungs-Ebenen:
    - UI: Buttons deaktiviert bei letztem PL.
    - Server-Action: prüft Anzahl der verbleibenden PL vor jeder schreibenden Aktion.
    - DB-Trigger (BEFORE DELETE/UPDATE auf `project_members`): blockt Operationen, die das Projekt mit 0 PL zurücklassen würden.
    Der DB-Trigger ist die letzte Verteidigung — schützt auch bei manipulierten Server-Action-Calls (z. B. Race-Condition mit zwei parallelen Degrade-Klicks).

5. **2-Stufen-Modal als reiner Client-Zustand** — der Modal-Wechsel zwischen Step 1 (Eingabe) und Step 2 (Link-Anzeige) ist ein React-State-Übergang innerhalb derselben Modal-Komponente. Kein Routing, keine URL-Änderung — Mantel-Modal bleibt geöffnet, Inhalt wechselt. Bei Schließen ist der Token-Link weg aus dem UI; nur die Person, die ihn rechtzeitig kopiert hat, behält ihn.

6. **Anmelden/Signup mit `next`-Redirect-Parameter** — der Token-Link führt im nicht-eingeloggten Fall auf eine Variante der Accept-Page, deren Buttons zu `/anmelden?email=<invited>&next=/einladung/<token>` und `/registrieren?email=<invited>&next=/einladung/<token>` zeigen. Falls die existierenden Login/Signup-Flows den `next`-Parameter aus PROJ-2 noch nicht respektieren, muss er nachgerüstet werden (kleine Erweiterung an der `signIn`/`signUp`-Server-Action). E-Mail-Vorbefüllung sorgt dafür, dass der User automatisch die richtige Adresse benutzt, was die Email-Mismatch-Falle in den meisten Fällen vermeidet.

7. **Retention-Job via `pg_cron`** — Postgres-Extension `pg_cron` wird durch eine einmalige Migration (Retention-Migration D) aktiviert. Ein täglicher Job (z. B. nachts) führt einen DELETE auf `invitations` aus, der alle Reihen mit `expires_at < now() - 30 Tage` entfernt. Vorteil: keine externe Infrastruktur (kein Vercel Cron, keine Edge Function nötig), Logik lebt direkt in der DB als Migration und ist reviewbar.

8. **Mitgliederliste server-side, Verwaltungs-UI client-side** — die initiale Mitgliederliste wird bereits beim Page-Render serverseitig gelesen und als Prop durchgereicht (sofort sichtbar, kein Loading-Spinner). Verwaltungs-Interaktionen (Add, Remove, Role-Change, Leave) sind Client-Actions, die Server-Actions aufrufen; nach Erfolg wird die Page revalidiert.

9. **Keine Realtime-Subscriptions** — Mitgliederliste aktualisiert sich nur beim Page-Reload bzw. nach eigener Aktion. Konsistent zum PRD-Nicht-Ziel „kein Live-Co-Editing". Wenn parallel ein anderer PL gerade eine Person hinzufügt, sehe ich das erst beim nächsten Reload — akzeptabel für die seltene Mitglieder-Verwaltung.

10. **Server-Action-Reuse für identische Schreib-Pfade** — Remove und Self-Leave teilen sich serverseitig 90 % der Logik (DELETE + Last-PL-Check). Daher eine gemeinsame Server-Action mit Parameter „aufgrund welcher Auth-Beziehung" — Code-Duplikat vermieden.

### D) Neue Abhängigkeiten (Pakete)

Keine neuen npm-Pakete erforderlich. Alles mit existierenden Mitteln (Next.js Server Components + Server Actions, `@supabase/ssr`, Tailwind + shadcn/ui).

Postgres-Erweiterung: `pg_cron` wird durch die Retention-Migration D **einmalig** im `stage`- und später im `main`-Branch via `CREATE EXTENSION IF NOT EXISTS pg_cron` aktiviert. Keine Klick-Aktivierung in Supabase Studio nötig — die Migration ist die Source of Truth.

### E) Speicher- und Lese-Fluss (vereinfacht)

```
Beim Öffnen der Projektübersicht:
  Server-Lader liest parallel:
    - Projekt-Daten
    - Kapitel-Liste
    - Mitglieder-Liste (mit Profilen) für dieses Projekt
    - Eigene Rolle in diesem Projekt
  → Übersicht rendert; ProjectUsersSection bekommt alles als Props

Beim Klick auf "Nutzer hinzufügen" (nur PL sichtbar):
  Modal Step 1 öffnet (rein client-seitig)
  User trägt Email + Rolle ein
  Pre-Checks (client + server):
    - Email-Format
    - bereits Mitglied? (Server-side Lookup auf project_members)
    - Selbst-Einladung? (Vergleich mit eigener Email)
  Server-Action createInvitation:
    - Auth + Rolle prüfen
    - Token kryptografisch erzeugen
    - Invitation-Row anlegen (project_id, email, token, role, expires_at = now + 14 Tage)
    - Token an Client zurückgeben
  Modal Step 2 zeigt: Erfolg + Link + Kopier-Button + Hinweis auf 14 Tage Gültigkeit
  User klickt Schließen → Modal weg → Link nicht mehr in UI sichtbar

Beim Öffnen von /einladung/<token>:
  Server-Lader liest die Einladung per privilegiertem Pfad (Token-Lookup)
  Liest dazu Projekt-Name und Inviter-Name (falls Projekt + Inviter noch existieren)
  Prüft:
    - Token gefunden?           → sonst Hinweis "ungültig"
    - expires_at < now?         → Hinweis "abgelaufen"
    - accepted_at != NULL?      → Hinweis "bereits angenommen" (ggf. Redirect)
    - Projekt existiert noch?   → sonst Hinweis "Projekt nicht mehr verfügbar"
  Prüft Auth-Status:
    - nicht eingeloggt → Variante mit Anmelden/Signup-Buttons
    - eingeloggt + Email-Match strikt → Variante mit Annehmen-Button
    - eingeloggt + Email-Mismatch → Variante mit Abmelden-Hinweis

Beim Klick auf "Annehmen":
  Server-Action acceptInvitation:
    - Auth prüfen
    - Token erneut lesen + Email-Match erneut prüfen (Defense-in-Depth)
    - Project_members-Row anlegen (project_id, user_id = current, role aus Einladung)
    - Invitations-Row aktualisieren (accepted_at = now())
    - Beide Schritte in einer Transaktion
  Erfolg → Redirect Projektübersicht des Projekts

Beim Klick auf Trash (Mitglied entfernen, nur PL):
  ConfirmRemoveModal öffnet
  Bestätigung → Server-Action removeMember:
    - Auth + PL-Rolle prüfen
    - Last-PL-Check: wenn das zu entfernende Mitglied der letzte PL wäre → reject
    - DELETE project_members-Row
  Erfolg → Page revalidate

Beim Rollen-Wechsel:
  Server-Action changeRole:
    - Auth + PL-Rolle prüfen
    - Last-PL-Check: degrade des letzten PL → reject
    - UPDATE project_members.role
  Erfolg → Page revalidate

Beim "Projekt verlassen" (alle Rollen):
  ConfirmLeaveModal öffnet
  Bestätigung → Server-Action leaveProject:
    - Auth prüfen
    - Last-PL-Check (falls man selbst PL ist)
    - DELETE eigene project_members-Row
  Erfolg → Redirect persönlicher Bereich

Beim Retention-Job (täglich):
  pg_cron triggert SQL-Statement
  DELETE FROM invitations WHERE expires_at < now() - INTERVAL '30 days'
  (DB-only, kein Client-Touch)
```

### F) Migration-Plan

1. **RLS-Migration A** — ergänzt die in PROJ-1 angelegten Policies:
    - `project_members` SELECT: jeder eingeloggte User darf Reihen sehen, deren `project_id` Teil seiner eigenen Membership ist.
    - `project_members` INSERT/UPDATE/DELETE: nur möglich für User, die in demselben `project_id` Rolle „projektleiter" haben, plus Spezialfall: jeder darf seine eigene Reihe per DELETE entfernen (Self-Leave) — Last-PL-Check passiert im Trigger.
    - `invitations` SELECT: User sehen Reihen nur, wo sie PL des Projekts sind ODER die Einladung wird per privilegiertem Pfad (Service-Role-Function) geladen.
    - `invitations` INSERT: nur PL des Projekts.
    - `invitations` UPDATE: nur das Setzen von `accepted_at` durch die Accept-Server-Action (privilegierter Pfad).
    - `invitations` DELETE: nur Retention-Job (Service-Role).

2. **Trigger-Migration B** — `BEFORE DELETE` und `BEFORE UPDATE OF role` auf `project_members`:
    - blockt die Operation, wenn sie das Projekt mit 0 Projektleitern zurücklassen würde.
    - Fehlermeldung wird vom Server-Action gefangen und in einen menschlichen Hinweis übersetzt.

3. **Funktions-Migration C** — `SECURITY DEFINER` Postgres-Funktion `lookup_invitation_by_token(text)`:
    - Nimmt einen Token entgegen.
    - Liefert (project_id, project_title, role, email, expires_at, accepted_at, inviter_full_name) zurück, sofern Token existiert; sonst NULL.
    - Keine Authentifizierung nötig (Token ist das Geheimnis).
    - Rate-Limiting-Diskussion: könnte sinnvoll sein, um Brute-Force-Token-Enumeration zu erschweren — aber 128-Bit-Entropie macht dies ohnehin praktisch unmöglich; daher kein Limit in PROJ-9.

4. **Retention-Migration D** — aktiviert `pg_cron` (falls noch nicht aktiv) und legt einen täglichen Job an, der den DELETE auf abgelaufene Invitations ausführt.

5. **Frontend-Migration** (kein DB-Schritt):
    - Port von `ProjectUsersSection` aus der alten App, an Echtdaten gekoppelt.
    - Neue Route `/einladung/[token]/page.tsx` als Server-Component.
    - Neue Server-Actions in `src/app/projektuebersicht/[project_id]/actions.ts` (oder eigene Datei `members-actions.ts`) für invite/remove/change-role/leave.
    - Neue Server-Action im Einladungs-Modul für accept.
    - Erweiterung der Login/Signup-Flows um `next`-Redirect (falls noch nicht vorhanden).

Alle DB-Migrationen laufen zuerst gegen den `stage`-Branch, dann nach Verifikation gegen `main`.

### G) RLS-Übersicht

```
project_members
+-- SELECT:      jedes Mitglied des jeweiligen Projekts darf alle Reihen sehen
+-- INSERT:      nur Projektleiter des jeweiligen Projekts
+-- UPDATE role: nur Projektleiter; Trigger blockt Last-PL-Degrade
+-- DELETE:      Projektleiter darf jede Reihe;
                 jeder darf seine EIGENE Reihe (Self-Leave);
                 Trigger blockt Last-PL-Delete
+-- Service-Role: voller Zugriff (nur für Migrationen + Accept-Pfad)

invitations
+-- SELECT:      nur Projektleiter des jeweiligen Projekts
                 (Token-Lookup für nicht-Mitglieder läuft über SECURITY-DEFINER-Funktion)
+-- INSERT:      nur Projektleiter des jeweiligen Projekts
+-- UPDATE:      blockiert für reguläre Rollen;
                 das Setzen von accepted_at läuft über Server-Action mit Service-Role
+-- DELETE:      blockiert für reguläre Rollen;
                 Retention-Job läuft als Service-Role
+-- Service-Role: voller Zugriff
```

### H) Sicherheits-Annahmen + Risiken

- **Token-Leak im Messenger**: wenn der PL den Link per WhatsApp/SMS verschickt und ein Familienmitglied den Chat einsehen kann, könnte die falsche Person akzeptieren. Schutz: strikte E-Mail-Übereinstimmung beim Accept — der Token allein reicht nicht, der Akzeptierende muss als die eingeladene E-Mail eingeloggt sein.
- **E-Mail-Hijacking**: wenn jemand Zugriff auf das E-Mail-Konto der eingeladenen Person hat, könnte er per Signup mit dieser E-Mail einen Account erzeugen und akzeptieren. Schutz: das ist im Allgemeinen ein Identitäts-Problem außerhalb von PROJ-9 — Auth-Provider (Supabase Auth) sollte E-Mail-Verifikation aktiv haben (PROJ-2 hat das).
- **Race auf Last-PL**: zwei PLs klicken parallel „Projektleiter degradieren" auf sich selbst. UI-Disables greifen nur lokal; Server-Actions können in der Zwischenzeit beide aufgerufen werden. Schutz: der DB-Trigger ist die letzte Instanz und blockt zuverlässig — eine der beiden Aktionen wird mit Fehler aus der DB zurückgewiesen.
- **Token-Enumeration**: bei 128-Bit-Entropie sind ~3.4 × 10^38 mögliche Token. Selbst Milliarden Requests pro Sekunde finden keinen gültigen Token in absehbarer Zeit. Kein Rate-Limit nötig.
- **DSGVO**: nicht angenommene Einladungen enthalten E-Mail-Adressen Dritter. Auto-Cleanup nach 30 Tagen Ablauf (Retention-Job) deckt den größten Teil ab. Angenommene Einladungen behalten die E-Mail nur als Verlaufs-Datum; können bei Bedarf zusätzlich anonymisiert werden (out of scope).

### I) Offene Punkte für Folge-Tickets (out of scope für PROJ-9)

- **PROJ-11 Resend-Hook**: Sobald Mailing live ist, klinkt sich PROJ-11 in `createInvitation` ein und schickt eine Mail an die eingeladene Adresse mit dem Token-Link. Die UI-Step-2-View des Modals bleibt für manuelle Weiterleitung erhalten, ggf. mit zusätzlichem Hinweis „Mail wurde verschickt".
- **Pending-Einladungen-UI**: falls später gewünscht, kann eine Sektion „Ausstehende Einladungen" mit Widerrufen/Erneut-Kopieren ergänzt werden. Datenmodell deckt das bereits ab.
- **In-App-Einladungs-Inbox**: für eingeladene User, die mehrere Projekte angeboten bekommen, könnte eine Inbox im persönlichen Bereich sinnvoll sein. Eigenes Ticket.
- **Audit-Log**: wer hat wen wann eingeladen/entfernt? Wäre eine eigene Tabelle. Eigenes Ticket.
- **Bulk-Invite**: mehrere E-Mails gleichzeitig einladen. Eigenes Ticket.

## Implementation Notes — Phase Backend (2026-05-21)

### Migration

`supabase/migrations/20260521230000_proj9_members_invitations.sql`
gegen `stage`-Branch (`kdjhxqitfxnsavhiafdn`) angewendet — kombiniert
die 4 Spec-Migrationen in einem File:

**A) RLS-Lockdown auf project_members + invitations**

- `project_members SELECT` (alt: nur eigene Row) → neu: alle Members
  eines Projekts, in dem ich Member bin.
- `project_members INSERT/UPDATE/DELETE` neu eingeführt:
  - INSERT/UPDATE: nur PL des Projekts (via Helper `am_i_pl_of(uuid)`).
  - DELETE: PL darf jede Reihe + jeder darf eigene Reihe (Self-Leave).
- `invitations SELECT` (alt: PL ODER Email-Match) → neu: nur PL.
  Token-Lookup für nicht-Mitglieder läuft über die SECURITY-DEFINER-
  Funktion `lookup_invitation_by_token` (D).
- `invitations INSERT`: nur PL.
- `invitations UPDATE/DELETE`: keine Policy → silent block für
  authenticated. Service-Role-Pfad (Accept-Action + Retention-Job)
  umgeht RLS.

**B) Last-PL-Trigger** (`enforce_last_projektleiter`)

- `BEFORE DELETE` und `BEFORE UPDATE OF role` auf project_members.
- Wirft `23514` wenn die Operation das Projekt mit 0 PLs zurückließe.
- DB-seitige letzte Verteidigung (3 Ebenen: UI-Disable + Server-Action-
  Guard + Trigger).

**C) SECURITY-DEFINER-Function `lookup_invitation_by_token(text)`**

- Whitelist-Felder: invitation_id, project_id, project_title, email,
  role, expires_at, accepted_at, inviter_full_name. **Kein Token-Echo.**
- EXECUTE für anon + authenticated + service_role (Token IST das
  Geheimnis; 256 Bit Entropie via crypto.randomBytes(32)).
- Tracking via neue Spalte `invitations.created_by` (FK auf profiles,
  ON DELETE SET NULL), joined auf profiles.full_name.

**D) Helper `am_i_pl_of(p_project_id UUID)`**

- SECURITY DEFINER, vermeidet RLS-Rekursion in den project_members-
  Policies, die self-referenzieren würden.
- EXECUTE nur für authenticated + service_role.

**E) pg_cron Retention-Job „invitations-retention-30days"**

- `CREATE EXTENSION pg_cron` läuft idempotent.
- Job um 03:00 UTC täglich:
  `DELETE FROM invitations WHERE expires_at < now() - INTERVAL '30 days'`.

### Live-Verifikation (stage)

- Trigger: Versuch, das einzige PL-Mitglied vom QA-Projekt zu löschen
  → `ERROR: 23514 Letzter Projektleiter kann nicht entfernt werden` ✓
- pg_cron: `SELECT * FROM cron.job WHERE jobname = 'invitations-retention-30days'`
  → active = true, schedule = `0 3 * * *` ✓
- Policies: 6 neue auf project_members + invitations (verifiziert).

### Code-Änderungen

**Server-Actions (`src/app/projektuebersicht/[project_id]/members-actions.ts`):**

5 neue Server-Actions, alle mit Auth-Guard + Zod-Validation:

- `createInvitationAction` — Token-Generierung via `crypto.randomBytes(32)`
  (256 Bit Entropie, base64url), Self-Invite-Block, Bereits-Member-Block,
  PL-Check, INSERT in invitations (FK auf created_by gesetzt).
- `removeMemberAction` — DELETE per memberId, Trigger-Fehler 23514 →
  klare Last-PL-Fehlermeldung.
- `changeRoleAction` — UPDATE role, Trigger-Fehler 23514 → klare
  Last-PL-Degrade-Fehlermeldung.
- `leaveProjectAction` — DELETE own row, Trigger-Fehler 23514 → klare
  Self-Leave-Fehlermeldung. Redirect zu /persoenlicher-bereich nach Erfolg.
- `acceptInvitationAction` — Token-Lookup via RPC, strikte E-Mail-
  Übereinstimmung, Defense-in-Depth-Validierung (expires_at, accepted_at,
  project_id). Schreibt via Service-Role (project_members INSERT +
  invitations UPDATE), behandelt 23505-Race gracefully.

**Accept-Page (`src/app/einladung/[token]/page.tsx`):**

Server-Component mit 6 Varianten (Token ungültig / Projekt gelöscht /
bereits angenommen / abgelaufen / nicht eingeloggt / eingeloggt+match /
eingeloggt+mismatch). Lookup via `supabase.rpc("lookup_invitation_by_token")`.
Nicht-eingeloggte Variante zeigt zwei CTAs mit pre-filled email +
`next=/einladung/<token>` für Login/Signup-Roundtrip.

**Accept-Button (`AcceptInvitationButton.tsx`):**

Client-Komponente, ruft `acceptInvitationAction`, navigiert bei Erfolg
zur Projektübersicht.

**Middleware (`src/lib/supabase/middleware.ts`):**

- `/einladung` in `PUBLIC_ROUTES` (Token = Auth; anonyme Vorschau muss
  möglich sein).
- `/einladung` in `NO_PAYMENT_BYPASS` (frisch registrierte Eingeladene
  haben noch kein Projekt → würden sonst zu /onboarding umgeleitet).

**Types (`src/lib/database.types.ts`):**

- invitations.Row/Insert/Update um `created_by: string | null`.
- Functions-Block um `am_i_pl_of` + `lookup_invitation_by_token`.

### Test-Ergebnisse

- Vitest: **100/100 grün** (21 neue PROJ-9-Tests in `members-actions.test.ts`):
  - createInvitationAction (5): not-auth, self-invite, not-PL, already-member, happy-path.
  - removeMemberAction (4): not-auth, not-found, last-PL-23514, happy.
  - changeRoleAction (3): invalid role, last-PL-degrade-23514, happy.
  - leaveProjectAction (2): not-auth, last-PL-self-leave-23514.
  - acceptInvitationAction (7): not-auth, token-not-found, already-accepted,
    expired, email-mismatch, happy-path (project_members INSERT +
    invitations UPDATE via Service-Role-Mock), duplicate-key-23505-tolerant.
- `tsc --noEmit`: sauber.

## Implementation Notes — Phase Frontend (2026-05-21)

### Neue Komponenten

- `src/components/projektuebersicht/ProjectUsersSection.tsx` — schmaler
  Server-Wrapper, der die Daten an den Client reicht.
- `src/components/projektuebersicht/ProjectUsersClient.tsx` — vollständige
  Mitglieder-UI mit:
  - Avatar (Initiale + stable-hash Farbe via `accentColorForStableId`)
  - Anzeigename (full_name → Email-Local-Part Fallback)
  - Rolle-Label oder Rolle-Toggle (für PL) als `<select>` mit
    disabled-Title bei Last-PL.
  - Trash-Button (PL) mit disabled-Title bei Last-PL.
  - „Projekt verlassen"-Button mit disabled-Title bei Last-PL-Self.
  - AddUser-Modal 2 Steps (Input → Erfolgs-Link + Copy-Button).
  - Confirm-Remove-Modal + Confirm-Leave-Modal.
- `ProjectUsersClient.test.tsx` — 9 Vitest-Tests: Rollen-Sichtbarkeit,
  Last-PL-Disable (Trash/Toggle/Leave), Modal-Step-Switch,
  Email-Validation, Display-Name-Fallback.

### Geänderte Server-Component

`src/app/projektuebersicht/[project_id]/page.tsx`:

- Lädt `project_members` parallel zu Projekt + Kapitel + Impulses.
- Holt zugehörige `profiles` (full_name, email) im zweiten Query.
- Mappt zu `MemberDisplay[]` mit `isMe`-Marker.
- Ersetzt den alten „PROJ-9 placeholder" durch
  `<ProjectUsersSection projectId members myRole />`.

### Registrieren-`next`-Forwarding

- `src/app/registrieren/page.tsx` liest jetzt `email` + `next` aus
  searchParams: Email wird als `defaultValue` ins Input gesetzt, `next`
  via hidden Form-Input mitgeführt.
- `src/app/registrieren/actions.ts`: Schema um `next` erweitert;
  `safeNext()`-Helper akzeptiert nur relative URLs (Open-Redirect-Schutz);
  Post-Email-Confirm-Redirect zeigt auf `next` (falls geliefert) statt
  hardcoded `/onboarding`. Akzeptiert URL-Pfade wie `/einladung/<token>`.
- Anmelden hatte die `next`-Logik bereits.

### Test-Ergebnisse (Frontend-Phase)

- Vitest: **109/109 grün** (+9 Frontend-Tests).
- `tsc --noEmit`: sauber.

### Manuelles für Production-Roll-out (main)
- Migration `20260521230000_proj9_members_invitations.sql` gegen main-DB
  anwenden (via Supabase Branches → stage → Merge).
- `pg_cron` muss auf main aktiviert sein (CREATE EXTENSION sollte
  problemlos durchlaufen, falls Supabase-Plan es erlaubt — Stage hat's
  bestätigt).
- Verify Trigger + Policies wie auf stage.

## QA Test Results

**QA-Run:** 2026-05-21 · QA-Engineer: Claude (Opus 4.7)
**Production-Ready:** ⚠️ NOT READY — **1 High-Severity-Bug** zu fixen (Bug B-1, siehe unten).

### Zusammenfassung

| Bereich | Tests | Status |
|---|---|---|
| Vitest (Server-Actions + Banner + Client) | 109 / 109 | ✅ grün (30 PROJ-9-spezifisch) |
| SQL-Layer-Red-Team | 5 / 5 | ✅ grün |
| Playwright PROJ-9 Spec | 7 / 7 | ✅ grün |
| Regression (Full-Suite, --retries=2) | 73 passed | ⚠️ 1 echter Bug + 6 stale/flaky |

### Pflicht-Tests pro AC

| AC-Block | Quelle | Status |
|---|---|---|
| Mitgliederliste rendert mit Avatar/Name/Email/Rolle | Playwright AC-List-1 | ✅ |
| PL sieht „Nutzer hinzufügen" | Playwright AC-List-2 | ✅ |
| Co-Autor sieht KEINE Management-Buttons | Vitest (ProjectUsersClient.test.tsx) | ✅ |
| Last-PL Trash-Disable mit Tooltip | Vitest + Playwright AC-LastPL-1 | ✅ |
| Last-PL „Projekt verlassen"-Disable | Vitest + Playwright AC-LastPL-2 | ✅ |
| AddUser-Modal Step 1 mit Email/Rolle | Vitest + Playwright AC-Modal-1 | ✅ |
| AddUser-Modal Step 2 mit Token-Link + Copy-Button | Playwright AC-Modal-2 | ✅ |
| Submit disabled bei ungültiger Email | Vitest | ✅ |
| /einladung/[token] zeigt „nicht gefunden" bei Müll-Token | Playwright AC-Accept-1 | ✅ |
| acceptInvitation: strikte E-Mail-Übereinstimmung | Vitest ×7 | ✅ |
| Token-Generierung 256 Bit Entropie | Vitest (acceptUrl matches base64url ≥40 chars) | ✅ |
| Self-Invite-Block, Bereits-Member-Block | Vitest | ✅ |
| createInvitation FK auf created_by | Code-Review (Server-Action) | ✅ |
| Retention-Job (pg_cron) | `SELECT FROM cron.job` (active=true) | ✅ |

### Security-Audit (SQL-Layer-Red-Team)

| # | Angriffsvektor | Mitigation | Status |
|---|---|---|---|
| S-1 | Non-Member SELECT auf fremde project_members | RLS-Policy `project_id IN get_my_project_ids()` → 0 rows | ✅ |
| S-2 | Non-Member SELECT auf fremde invitations | RLS-Policy `am_i_pl_of(project_id)` → 0 rows | ✅ |
| S-3 | Co-Autor / Non-PL INSERT project_members | RLS-WITH-CHECK `am_i_pl_of` → 42501 | ✅ |
| S-4 | Co-Autor / Non-PL INSERT invitations | RLS-WITH-CHECK `am_i_pl_of` → 42501 | ✅ |
| S-5 | Co-Autor UPDATE/DELETE auf project_members | RLS-Policy filtert silent → 0 rows | ✅ |
| S-6 | anon lookup_invitation_by_token mit echtem Token | erlaubt (Spec: Token IS Auth) — Whitelist-Felder, kein Token-Echo | ✅ |
| S-7 | anon lookup_invitation_by_token mit Müll-Token | 0 rows; 256-Bit-Entropie macht Brute-Force unmöglich | ✅ |
| S-8 | Email-Hijack: anderer User akzeptiert fremde Einladung | Strikte E-Mail-Match in acceptInvitationAction → reject | ✅ |
| S-9 | Last-PL-Schutz umgehbar? | DB-Trigger fängt UPDATE+DELETE auf Application-, Service-Role-, Postgres-Ebene (BEFORE-Trigger) | ✅ |

### Bugs

#### B-1 (HIGH) — Last-PL-Trigger blockt Project-CASCADE-DELETE

**Schweregrad:** High (bricht PROJ-3 deployed-Feature „Projekt löschen").

**Symptom:** Wenn der Projektleiter sein eigenes Projekt löscht (PROJ-3
deleteProjectAction → `DELETE FROM projects WHERE id = ...`), feuert die
ON-DELETE-CASCADE-Kette auch auf project_members. Der neue
`enforce_last_projektleiter`-Trigger sieht „letzte PL-Reihe wird gelöscht"
und wirft `23514 Letzter Projektleiter kann nicht entfernt werden`. Die
gesamte Transaktion rolled back — das Projekt bleibt unlöschbar.

**Reproduktion:**

```sql
-- Als der PL des Projekts:
DELETE FROM projects WHERE id = '<own-project-id>';
-- → ERROR: 23514 Letzter Projektleiter kann nicht entfernt werden
```

**Warum nicht im E2E aufgefallen:** Keine bestehende E2E-Suite ruft
`deleteProjectAction` als Klick-Pfad — der Bug ist latent und würde sich
beim ersten produktiven Klick auf „Projekt löschen" zeigen.

**Empfohlener Fix (für `/backend PROJ-9`):**

Trigger muss CASCADE-DELETEs vom Projekt erkennen und das Last-PL-
Verbot nur im Single-Member-DELETE-Pfad anwenden. Eine bewährte Strategie:

```sql
-- In enforce_last_projektleiter(), vor dem PL-Count-Check:
IF NOT EXISTS (SELECT 1 FROM projects WHERE id = OLD.project_id) THEN
  -- Projekt wird gleichzeitig gelöscht (CASCADE) → kein Last-PL-Check nötig.
  RETURN OLD;
END IF;
```

Begründung: Wenn die `projects`-Reihe in derselben Transaktion bereits
gelöscht ist, findet die CASCADE-Kette gerade statt. Die Last-PL-
Invariante gilt nur für Projekte, die nach der Transaktion noch
existieren sollen.

Alternative: explizite Session-Variable, die `deleteProjectAction` vor
dem DELETE setzt (`SET LOCAL narravit.allow_project_cascade = 'true'`)
und die der Trigger respektiert. Sauberer, aber Server-Action muss daran
denken.

#### B-2 (Low) — PROJ-4 AC-PÜ-3 stale durch PROJ-9-Roll-out

**Schweregrad:** Low (Test-Maintenance).

**Symptom:** PROJ-4 Spec-Test AC-PÜ-3 sucht nach `getByRole("heading", { name: "Projektmitglieder" })` und Placeholder-Text `/PROJ-9/`. Beide
sind durch das PROJ-9-Roll-out entfernt — die neue Sektion heißt
„Nutzerübersicht" und hat keine Placeholder-Texte mehr.

**Fix:** In `tests/PROJ-4-kapitel-routing-persistenz.spec.ts` Zeile 88
das Heading-Assertion auf „Nutzerübersicht" + PROJ-9-Placeholder-
Assertion entfernen. Wäre normalerweise mit dem PROJ-9-PR mit-erledigt
worden — wir tracken's hier als bekannten Test-Refactor-Schritt.

### Regression-Findings

`npx playwright test --retries=2`: **73 passed, 7 failed, 9 not-run.**

| # | Test | Severity | Ursache |
|---|---|---|---|
| R-1 | PROJ-4 AC-PÜ-3 | Low (B-2 oben) | Stale, durch PROJ-9-Roll-out |
| R-2 | PROJ-4 AC-Ch-2, PROJ-7 (3 Tests), PROJ-8 Banner (2 Tests) | Low | Bekannte Turbopack-Dev-Server-Flake (`__webpack_modules__[moduleId]`) — pre-existing, kein PROJ-9-Bezug |

**Keine PROJ-9-Code-Regressions** — die 7 Final-Failures sind alle
entweder Test-Stale (R-1) oder pre-existing Turbopack-Flake (R-2).

### E2E-Suite — PROJ-9

Datei: `tests/PROJ-9-mitglieder-einladungen.spec.ts` (7 Tests, alle grün):

- `AC-List-1/2`: Nutzerübersicht-Sektion + „Nutzer hinzufügen"-Button für PL
- `AC-LastPL-1/2`: Trash + „Projekt verlassen" disabled bei Sole-PL
- `AC-Modal-1/2`: 2-Step-Flow: Eingabe → Erfolgs-View mit Token-Link
- `AC-Accept-1`: /einladung/<bogus-token> zeigt „Einladung nicht gefunden"

### Production-Ready-Empfehlung

⚠️ **NOT READY.** B-1 ist eine HIGH-Severity-Regression auf PROJ-3
(deployed!) und MUSS vor Roll-out gefixt sein. Funktional sind alle ACs
des Features selbst erfüllt — der Bug entstand in der Migration durch
die Wechselwirkung mit der bestehenden FK-CASCADE-Beziehung.

**Empfohlener Fix-Schritt:** 1-Migration mit dem CASCADE-Detection-Patch
im Trigger (siehe B-1). 10-Minuten-Aufgabe für `/backend`. Danach erneut
`/qa PROJ-9`.

B-2 ist Test-Maintenance und blockt nicht den Roll-out — kann in einem
PROJ-4-Refine oder mit PROJ-9 zusammen committed werden.

> Next step: `/backend PROJ-9` für Bug-B-1-Fix-Migration; danach erneut `/qa PROJ-9` für die Approval-Bestätigung.

## Bug-Fix Notes — Phase Backend Round 2 (2026-05-21)

### B-1 — Last-PL-Trigger CASCADE-aware

Migration `supabase/migrations/20260521233000_proj9_trigger_cascade_aware.sql`
gegen `stage`-Branch angewendet. Reines Function-Update auf
`enforce_last_projektleiter()`:

```sql
IF NOT EXISTS (SELECT 1 FROM projects WHERE id = OLD.project_id) THEN
  RETURN OLD;  -- CASCADE-DELETE vom Projekt erkannt
END IF;
```

Steht als erste Bedingung im DELETE-Branch — vor dem Last-PL-Check.

**Live-Verifikation auf stage:**

| Pfad | Vorher | Nachher |
|---|---|---|
| Direkt-`DELETE FROM project_members WHERE id = last_pl` als authenticated | 23514 ✓ | 23514 ✓ (Schutz bleibt) |
| `DELETE FROM projects WHERE id = own_project` als PL | 23514 ✗ (Bug) | 0 Reihen verbleibend ✓ (Cascade läuft) |

Der Last-PL-Schutz greift weiterhin im Application-Delete-Pfad — er
unterscheidet jetzt zuverlässig zwischen „User löscht einzelne
Mitgliedschaft" (blockt bei Last-PL) und „Projekt wird komplett
gelöscht" (Cascade läuft durch).

### B-2 — PROJ-4 AC-PÜ-3 Stale-Test

`tests/PROJ-4-kapitel-routing-persistenz.spec.ts` Zeile 88: Heading-
Assertion auf „Nutzerübersicht" umgestellt (vorher „Projektmitglieder").
Placeholder-Assertion auf `/PROJ-9/` entfernt — der echte Mitglieder-
Section hat keinen Placeholder-Text mehr.

### Approval-QA-Run (2026-05-21)

Nach dem Fix-Round erneut durchgelaufen:

- **B-1-Negativ-Test**: PL versucht Direkt-DELETE des einzigen PL-Members
  → blockt weiter mit „Letzter Projektleiter kann nicht entfernt werden" ✓
- **B-1-Positiv-Test**: PL löscht eigenes Projekt → CASCADE durch, projects
  und project_members beide entfernt ✓
- **Vitest**: 109/109 grün.
- **Playwright Full-Suite `--retries=2`**: 72 passed, 4 failed (alle
  bekannte pre-existing Turbopack-Dev-Server-Flakes auf PROJ-7/PROJ-8-
  Editor-Tests — kein PROJ-9-Bezug), 3 flaky (Retry-grün), 1 skipped, 9
  not-run (Kaskade aus den PROJ-7-Flakes).
- **Keine PROJ-9-Regressions**; B-2-Fix verifiziert (PROJ-4 AC-PÜ-3 ist
  nicht mehr in den Failure-Lists).

**Production-Ready:** ✅ READY — Status auf Approved.

## Deployment

**Date:** 2026-05-21
**Target:** stage-app.narravit.de (Vercel Preview-Env, Branch `stage`)

### Was geht live
- 2 Migrationen auf stage-Supabase:
  - `20260521230000_proj9_members_invitations.sql`: RLS-Lockdown auf
    project_members + invitations, Last-PL-Trigger, SECURITY-DEFINER-
    Lookup-Function, pg_cron-Retention-Job, invitations.created_by-Spalte.
  - `20260521233000_proj9_trigger_cascade_aware.sql`: B-1-Fix — Trigger
    erkennt Project-CASCADE-DELETE und übergeht den Last-PL-Check, wenn
    das Projekt selbst gelöscht wird.
- Frontend:
  - ProjectUsersSection in der Projektübersicht (ersetzt den alten
    „Projektmitglieder"-Placeholder).
  - AddUserModal 2-Step (Eingabe → Token-Link + Copy-Button).
  - Confirm-Modale für Remove + Leave.
  - Last-PL-Disable-Logik (UI + Server-Action + DB-Trigger als 3-Layer-
    Verteidigung).
- Server-Actions: createInvitation, acceptInvitation, removeMember,
  changeRole, leaveProject — alle mit Auth-Guard + Zod-Validation.
- Accept-Page `/einladung/[token]/` mit 6 Token-Status-Varianten,
  SECURITY-DEFINER-Lookup, strikter E-Mail-Match.
- Login/Signup: `next`-Param-Forwarding (Registrieren-Seite folgt jetzt
  dem Pattern, das Anmelden bereits hatte).

### Manuelles für Production-Roll-out (main)
- Beide Migrationen gegen main-Supabase anwenden:
  - `20260521230000_proj9_members_invitations.sql`
  - `20260521233000_proj9_trigger_cascade_aware.sql`
  (am einfachsten via Supabase Branches → stage → Merge to main).
- `CREATE EXTENSION pg_cron` läuft idempotent; falls deine Supabase-
  Region pg_cron nicht hat (sollte aber eu-central-1 nach Tier-Update),
  Retention-Job manuell ergänzen oder als externes Cron-Job laufen lassen.
- Verify nach Migration:
  - 3 RLS-Policies pro Tabelle (project_members + invitations).
  - 2 Trigger auf project_members (DELETE + UPDATE OF role).
  - cron.job „invitations-retention-30days" aktiv.
- Anschließend `git checkout main && git merge stage && git push origin main`
  → Vercel Production-Deploy.
