# PROJ-9: Projekt-Mitglieder + Einladungen

> **Kurzfassung (PROJ-31).** Das vollständige Tech Design, Bau-Notizen, QA-Protokolle und der Deployment-Verlauf stehen unverändert im [Archiv](archive/PROJ-9-projekt-mitglieder-einladungen.md).

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
<!-- Refine 2026-05-21: Rollen sind nach Einladungs-Annahme fest. Wer eine
     andere Rolle braucht, wird entfernt und mit neuer Rolle erneut eingeladen.
     Frühere User-Story „Rolle eines bestehenden Mitglieds nachträglich ändern"
     gestrichen. -->

- Als **Projektleiter** möchte ich Mitglieder wieder entfernen können, wenn sie nicht mehr am Projekt mitarbeiten sollen.
- Als **Mitglied** (Projektleiter oder Co-Autor) möchte ich das Projekt selbst verlassen können, wenn ich nicht mehr mitwirken will — solange dadurch nicht der letzte Projektleiter wegfällt.
- Als **Co-Autor** möchte ich sehen, wer sonst noch im Projekt ist (Transparenz), aber ich erwarte keine Management-Funktionen.

## Acceptance Criteria

### Mitgliederliste (Projektübersicht)
- [ ] Auf jeder Projektübersichts-Seite gibt es eine Sektion „Nutzerübersicht" mit allen Mitgliedern des Projekts.
- [ ] Jede Mitglieder-Zeile zeigt: Avatar mit Initiale (Farbe aus stabilem Hash der user-id, gemäß `projektuebersicht-palette.ts`), Anzeigename, E-Mail, Rolle als Klartext-Label („Projektleiter" oder „Co-Autor").
- [ ] Anzeigename = `full_name` aus `profiles` falls vorhanden, sonst aus dem Email-Local-Part abgeleitet (Title-Case wie in der alten App).
- [ ] **Projektleiter** sieht pro Mitglied: Rollen-Label (statische Anzeige) + Entfernen-Button (Trash-Icon). Rollen sind fest (Refine 2026-05-21) — kein Wechsel-Control.
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
> **Änderung 2026-10-14 (Jakob):** Kein manuelles Teilen mehr. Einladungen gehen ausschließlich per Mail (PROJ-11). Step 2 bestätigt nur noch: „Wir haben die Einladung per Mail an name@beispiel.de geschickt. Sie ist 14 Tage gültig." + „Schließen". Kein Link, kein „Link kopieren"; die Server-Action gibt Token und Link nicht mehr an den Browser zurück. Die Kriterien darunter sind damit überholt.

- [ ] Nach erfolgreichem Submit wechselt das Modal auf eine zweite Ansicht: Erfolgs-Meldung („Einladung für name@beispiel.de wurde angelegt") + generierte Token-URL prominent + „Link kopieren"-Button (kopiert in Zwischenablage) + Hinweis „Der Link ist 14 Tage gültig — bitte leite ihn manuell an die Person weiter."
- [ ] „Schließen"-Button beendet das Modal. Der Link ist danach in der UI nicht mehr abrufbar.
- [ ] Die Token-URL hat die Form `<app-origin>/einladung/<token>`.

### Accept-Flow (Eingeladene Person)
- [ ] Route `/einladung/<token>` zeigt für gültige, ungenutzte Token eine Vorschau: Projektname, zugewiesene Rolle, Name des einladenden Projektleiters. ~~Ablaufdatum~~ — **Änderung 2026-10-14 (Jakob):** kein „Gültig bis" auf der Seite; die eingeladene Person muss das Ablaufdatum nicht kennen. Abgelaufene Einladungen zeigen weiterhin „Diese Einladung ist abgelaufen".
- [ ] Wenn der Token-Empfänger **nicht eingeloggt** ist: die Vorschau-Seite enthält Buttons „Anmelden" und „Konto erstellen", beide leiten zur Login/Signup-Seite mit vorausgefüllter E-Mail-Adresse aus der Einladung. Nach erfolgreichem Login/Signup landet der User zurück auf `/einladung/<token>`.
- [ ] Wenn der Token-Empfänger **eingeloggt** ist und die eingeloggte E-Mail **exakt** der Einladungs-E-Mail entspricht: „Annehmen"-Button ist sichtbar. Klick fügt den User als Mitglied hinzu (Rolle aus Einladung), markiert die Einladung als angenommen (`accepted_at` gesetzt) und leitet zur Projektübersicht.
- [ ] Wenn der Token-Empfänger **eingeloggt** ist, aber mit einer **anderen** E-Mail als der eingeladenen: kein „Annehmen"-Button. Stattdessen Hinweis „Diese Einladung gilt für a@x.de, du bist als b@x.de eingeloggt. Bitte melde dich mit der korrekten Adresse an." + „Abmelden"-Button.
- [ ] „Ablehnen" gibt es in PROJ-9 **nicht** — die Einladung läuft entweder regulär ab oder wird durch Annehmen verbraucht.
- [ ] Server-Action `acceptInvitation` prüft serverseitig: Token-Existenz + Gültigkeit + `accepted_at IS NULL` + Email-Match zur eingeloggten Session — keine Aktion ohne strikte Email-Übereinstimmung.

### Mitglied entfernen (Projektleiter)
- [ ] Klick auf Trash-Button öffnet Bestätigungs-Dialog mit Name + Warnung „Der Nutzer verliert den Zugriff auf dieses Projekt …".
- [ ] „Endgültig entfernen" löscht die `project_members`-Zeile.
- [ ] **Constraint:** das letzte Mitglied mit Rolle „Projektleiter" kann nicht entfernt werden — Trash-Button ist in diesem Fall deaktiviert mit Tooltip „Mindestens ein Projektleiter muss verbleiben."

<!-- Refine 2026-05-21: Rolle-Wechsel komplett entfernt. Begründung:
     Produktentscheidung des Users — einmal vergebene Rollen bleiben fest.
     Soll eine Person eine andere Rolle bekommen, wird sie entfernt und
     mit neuer Rolle erneut eingeladen. Die zugehörige UPDATE-RLS-Policy
     und der Last-PL-UPDATE-Trigger wurden in der Migration
     `20260521235000_proj9_lock_member_roles.sql` entfernt. Die
     `changeRoleAction`-Server-Action wurde gelöscht. -->

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

## Technische Entscheidungen
_Kurzform. Die vollständige Begründung steht im Archiv._

### C) Tech-Entscheidungen (begründet)

1. **Token-Generierung via Server-side Crypto-Random** — der Token wird beim Erstellen der Einladung auf dem Server generiert, niemals im Client.

2. **Accept-Page-Read über `SECURITY DEFINER`-Postgres-Funktion** — die einladende Person ist (noch) kein Mitglied des Projekts, hat also per RLS keinen normalen Lesezugriff auf das Projekt oder die Einladung.

3. **Strikte E-Mail-Übereinstimmung beim Accept** — die Server-Action vergleicht die eingeloggte Auth-User-E-Mail mit dem Einladungs-Empfänger-Feld (case-insensitive Vergleich mit Trim).

4. **Last-PL-Constraint serverseitig + DB-Trigger als Fail-Safe** — drei Verteidigungs-Ebenen:  - UI: Buttons deaktiviert bei letztem PL.  - Server-Action: prüft Anzahl der verbleibenden PL vor jeder schreibenden Aktion.  - DB-Trigger (BEFORE DELETE/UPDATE auf `project_members`): blockt Operationen, die das Projekt mit 0 PL zurücklassen würden.

5. **2-Stufen-Modal als reiner Client-Zustand** — der Modal-Wechsel zwischen Step 1 (Eingabe) und Step 2 (Link-Anzeige) ist ein React-State-Übergang innerhalb derselben Modal-Komponente.

6. **Anmelden/Signup mit `next`-Redirect-Parameter** — der Token-Link führt im nicht-eingeloggten Fall auf eine Variante der Accept-Page, deren Buttons zu `/anmelden?email=<invited>&next=/einladung/<token>` und `/registrieren?email=<invited>&next=/einladung/<token>` zeigen.

7. **Retention-Job via `pg_cron`** — Postgres-Extension `pg_cron` wird durch eine einmalige Migration (Retention-Migration D) aktiviert.

8. **Mitgliederliste server-side, Verwaltungs-UI client-side** — die initiale Mitgliederliste wird bereits beim Page-Render serverseitig gelesen und als Prop durchgereicht (sofort sichtbar, kein Loading-Spinner).

9. **Keine Realtime-Subscriptions** — Mitgliederliste aktualisiert sich nur beim Page-Reload bzw. nach eigener Aktion.

10. **Server-Action-Reuse für identische Schreib-Pfade** — Remove und Self-Leave teilen sich serverseitig 90 % der Logik (DELETE + Last-PL-Check).

## Offene Punkte
- Ideen für später: Übersicht ausstehender Einladungen mit Widerrufen, Einladungs-Inbox, Audit-Log, mehrere Einladungen auf einmal.
- Angenommene Einladungen behalten die E-Mail als Verlaufsdatum. Eine Anonymisierung ist offen.
