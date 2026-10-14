# PROJ-11: Resend-Transaktionsmails

> ℹ️ **Anpassung 2026-10-13:** Vapi entfällt ([PROJ-12](PROJ-12-audio-erzaehlpipeline.md)). „Mail 3 — Vapi-Paket-Kauf-Bestätigung" (Template, Helper, Webhook-Hook) wurde mit dem PROJ-6-Rückbau entfernt; die Portal-Kauf-Mail und die Welcome-Mail nennen jetzt „per Sprachnachricht erzählen" statt Telefon/10 Stunden. Alle Vapi-Passagen weiter unten sind damit überholt. Die neuen Mails (Erzähl-Aufforderung, Erinnerung, „neues Kapitel erzählt") gehören zu PROJ-12 und nutzen die hier gebaute Infrastruktur.

## Status: In Progress
**Created:** 2026-05-22
**Last Updated:** 2026-10-14

## Dependencies
- Requires **PROJ-2** (Auth + SSR) — User-Profile mit E-Mail-Adressen als Empfänger; Verifikations-Status als Voraussetzung für Welcome-Mail
- Requires **PROJ-6** (Stripe-Zahlungen) — Webhook-Hook für Portal-/Vapi-/Verlängerungs-Bestätigungen
- Requires **PROJ-9** (Projekt-Mitglieder + Einladungen) — Hook in `createInvitationAction` für Einladungs-Mail
- Soft dependency: **PROJ-3** (Persönlicher Bereich) — Welcome- und Reminder-Mails verlinken in den Bereich

## User Stories
- Als **Eingeladene Person** möchte ich eine Mail mit dem Einladungs-Link bekommen, sobald jemand mich zum Projekt einlädt — ohne dass der Projektleiter den Link manuell weiterleiten muss.
- Als **Käufer** möchte ich nach einer erfolgreichen Stripe-Zahlung (Portal-Erstkauf, Vapi-Paket, Verlängerung) eine Bestätigungs-Mail mit Zahlungsdetails und einem Link zurück in den persönlichen Bereich. (Die in-App-Bestätigungsseite aus PROJ-6 bleibt das sofortige Feedback; die Mail ist der dauerhafte Beleg.)
- Als **neuer Nutzer** möchte ich nach der Account-Erstellung eine Willkommens-Mail mit kurzer Einleitung und Verweis auf den persönlichen Bereich — separat von der reinen Auth-Verifikations-Mail von Supabase.
- Als **Schreibender mit ablaufendem Portal-Zugang** möchte ich 30 Tage und nochmal 7 Tage vor Ablauf an die Verlängerung erinnert werden, damit mir der Portal-Zugang nicht unerwartet wegbricht.
- Als **narravit-Team** möchte ich Mail-Versand-Fehler in Sentry sehen, ohne den User-Flow durch synchrone Fehler zu unterbrechen — Mail-Versand ist Best-Effort.

## Acceptance Criteria

### Allgemein
- [ ] Mail-Versand läuft über **Resend** als Provider.
- [ ] Absender ist `no-reply@narravit.de` — finales Setup (Anzeigename, exakte Adresse, ggf. Reply-To) wird im Resend-Konto konfiguriert; der App-Code liest die From-Adresse aus einer Environment-Variable.
- [ ] Alle Mails sind **deutsch** (Sie-/Du-Form konsistent zu den restlichen Portal-Texten — wird vor Roll-out final abgestimmt).
- [ ] Alle Mails enthalten im Footer: narravit-Logo, Impressum-Link, Kontakt-Hinweis. Kein Unsubscribe-Link (Transaktionsmails sind nicht abbestellbar — gesetzlich erlaubt).
- [ ] **Versand-Modus:** asynchron / Best-Effort. Eine Versand-Aktion blockiert nie den User-Flow. Bei Fehler wird in Sentry geloggt, aber kein User-Feedback gezeigt.
- [ ] Idempotenz: jede Mail wird pro Auslöse-Event genau einmal verschickt (Stripe-Webhook ist schon idempotent; Invitation-Mail wird pro Invitation-Row einmal verschickt; Welcome-Mail wird pro User einmal verschickt; Reminder werden pro `(user, project, days_before)` einmal verschickt).

### Mail 1 — Einladung
- [ ] Trigger: `createInvitationAction` aus PROJ-9 erfolgreich (Invitation-Row angelegt).
- [ ] Empfänger: die eingeladene E-Mail-Adresse (`invitations.email`).
- [ ] Inhalt: Anrede, Hinweis "X hat dich zum Projekt Y eingeladen", Rolle (Projektleiter / Co-Autor), Einladungs-Link (führt zu `/einladung/<token>`), Hinweis auf 14-Tage-Gültigkeit.
- [ ] Step-2-Modal aus PROJ-9 bleibt erhalten und zeigt den Link weiterhin (für manuelle Weiterleitung als Backup); Texte werden auf "Mail ist unterwegs — du kannst den Link bei Bedarf zusätzlich manuell teilen" angepasst.

### Mail 2 — Portal-Kauf-Bestätigung
- [ ] Trigger: Stripe-Webhook `checkout.session.completed` mit `payment_type = portal_initial` (oder vergleichbarer Identifier aus PROJ-6).
- [ ] Empfänger: die im Stripe-Checkout angegebene Käufer-E-Mail (= `auth.users.email` des Käufers).
- [ ] Inhalt: Anrede, "Willkommen bei narravit — dein Portal-Zugang ist freigeschaltet", Zahlungsdetails (Betrag, Datum, Stripe-Rechnungs-Link falls verfügbar), Hinweis auf 1 Jahr Gültigkeit, "10 Stunden Vapi-Erzählzeit sind inklusive", Link zum persönlichen Bereich.

### Mail 3 — Vapi-Paket-Kauf-Bestätigung
- [ ] Trigger: Stripe-Webhook `checkout.session.completed` mit `payment_type = vapi_minutes`.
- [ ] Empfänger: Käufer-E-Mail.
- [ ] Inhalt: Anrede, "+60 Minuten Vapi-Erzählzeit wurden deinem Projekt hinzugefügt", Projektname, Zahlungsdetails, aktueller Vapi-Minuten-Saldo (sofern aus dem Webhook-Kontext bekannt), Link zur Projektübersicht.

### Mail 4 — Welcome-Mail nach Signup
- [ ] Trigger: Account-Email wurde via Supabase-Auth-Verifikation bestätigt (also **nach** Verifikations-Klick, nicht direkt nach Signup-Submit). Konkrete Hook-Stelle in `/architecture`.
- [ ] Empfänger: die verifizierte E-Mail-Adresse des Accounts.
- [ ] Inhalt: warme Begrüßung, kurze Einführung ("Du kannst jetzt Lebensbücher anlegen, Familienmitglieder einladen, am Telefon oder im Editor schreiben"), Link zum persönlichen Bereich, Kontakt-Hinweis bei Fragen.
- [ ] **Abgrenzung zur Supabase-Verifikations-Mail:** Diese ist technisch ("Klicke hier, um deine E-Mail zu bestätigen") und kommt aus Supabase Auth. Die Welcome-Mail aus PROJ-11 ist inhaltlich (Onboarding) und ist eine **separate Mail**, die erst nach erfolgreicher Verifikation verschickt wird.
- [ ] Pro Account wird die Welcome-Mail genau einmal verschickt (Idempotenz-Marker im `mail_log`).

### Mail 5 — Verlängerungs-Bestätigung (12-Monate-Renewal)
- [ ] Trigger: Stripe-Webhook `checkout.session.completed` mit `payment_type = portal_renewal`.
- [ ] Empfänger: Käufer-E-Mail.
- [ ] Inhalt: Anrede, "Dein Portal-Zugang wurde um 12 Monate verlängert", neues Ablauf-Datum, Zahlungsdetails, Link zum persönlichen Bereich.

### Mail 6 — Reminder 30 Tage vor Ablauf
- [ ] Trigger: täglicher Scheduled Job prüft alle Portal-Zugänge mit `expires_at` zwischen `now + 29 Tage` und `now + 30 Tage`, die noch nicht 30-Tage-erinnert wurden.
- [ ] Empfänger: der Inhaber des Portal-Zugangs (Projektleiter des betreffenden Projekts).
- [ ] Inhalt: ruhiger Hinweis "Dein Portal-Zugang für Projekt Y läuft in 30 Tagen ab — falls du weiter schreiben möchtest, kannst du jetzt verlängern", Ablauf-Datum, Verlängerungs-Link (führt zum Stripe-Checkout der Verlängerung).
- [ ] Pro `(user, project)` wird die 30-Tage-Reminder-Mail genau einmal verschickt (Markierung im `mail_log`).

### Mail 7 — Reminder 7 Tage vor Ablauf
- [ ] Trigger: täglicher Scheduled Job prüft alle Portal-Zugänge mit `expires_at` zwischen `now + 6 Tage` und `now + 7 Tage`, die noch nicht 7-Tage-erinnert wurden.
- [ ] Empfänger: Inhaber des Portal-Zugangs.
- [ ] Inhalt: dringenderer Ton "Nur noch 7 Tage — dein Portal-Zugang läuft am … ab. Verlängere jetzt, um nicht den Zugriff zu verlieren", Ablauf-Datum, Verlängerungs-Link.
- [ ] Pro `(user, project)` wird die 7-Tage-Reminder-Mail genau einmal verschickt.

### Fehlerverhalten
- [ ] Bei Resend-API-Fehler (Timeout, 5xx, Auth-Fehler): Eintrag in Sentry inklusive Mail-Typ, Empfänger (gehasht zur DSGVO-Schonung) und Fehler-Detail. Kein User-sichtbarer Effekt.
- [ ] Bei dauerhaftem Bounce (Empfänger-Adresse existiert nicht): aktuell nur Sentry-Log. Eine separate Bounce-Verarbeitung ist out of scope (siehe Folge-Tickets).
- [ ] Bei Versand-Versuch mit fehlender / ungültiger Empfänger-Adresse: vor dem API-Call abbrechen und Sentry-Warn (kein Resend-Call).
- [ ] Antworten auf no-reply-Mails landen im Posteingang des Resend-Konto-Setups (typisch im Nichts) — Beantwortung von Support-Anliegen läuft über kontakt@narravit.de, das aktiv im Footer der Mails angegeben ist.

## Edge Cases
- **Resend-Quota erschöpft / API down:** Sentry-Eintrag pro Versuch; User-Flows laufen ungestört weiter. Stripe-Webhook ist idempotent — beim nächsten Webhook-Retry (durch Stripe) wird der Mail-Versand erneut versucht (für Stripe-getriggerte Mails). Für Invitation-Mail: kein automatischer Retry; manuelle Weiterleitung des Step-2-Link-Backups deckt den Fall ab.
- **User existiert in Auth, aber profile-Row hat noch keinen full_name:** Mail verwendet Fallback "Hallo," statt personalisiertem "Hallo Maria,".
- **Welcome-Mail an Auth-User, der sich nie verifiziert:** Mail wird **nicht** verschickt. Pro Account ist die Verifikation Voraussetzung.
- **Stripe-Webhook ohne Käufer-E-Mail-Metadaten:** Fallback auf `auth.users.email` des verknüpften Users; falls auch das fehlt, Sentry-Eintrag + keine Mail.
- **User ändert E-Mail nach Account-Erstellung, vor Verlängerungs-Reminder:** Reminder geht an die aktuelle E-Mail-Adresse aus `profiles` zum Zeitpunkt des Versands.
- **Mehrfacher Stripe-Webhook für denselben Event (Stripe-Retry):** Idempotenz im Webhook-Handler verhindert Doppelversand der Mail.
- **30-Tage-Reminder fällt aufs Wochenende oder Feiertag:** Cron läuft täglich, keine Sonderbehandlung — Mail geht am Tag des Match-Fensters raus.
- **Concurrent Run des Reminder-Jobs:** durch Idempotenz-Marker pro `(user, project, days_before)` keine Doppelmails.
- **Reminder für Projekt, das User schon entfernt hat / das gelöscht wurde:** Match-Query prüft Existenz der Projekt-Mitgliedschaft + Projekt; gelöschte Projekte werden ignoriert.
- **User antwortet auf no-reply-Mail:** Antwort verfällt im no-reply-Postfach. Footer der Mails enthält `kontakt@narravit.de` als sichtbare Support-Adresse für tatsächliche Anliegen.
- **DSGVO / Daten-Retention:** Mail-Inhalte enthalten keine sensiblen Daten über das Notwendige hinaus. Logs in Sentry enthalten gehashte oder gekürzte Empfänger-Adressen.
- **HTML-Rendering in alten E-Mail-Clients (Outlook 2010/2013):** Templates werden mit Email-tauglichem HTML/CSS gebaut (tabellenbasiertes Layout, Inline-Styles); konkrete Modellierung in `/architecture`.

## Technical Requirements
- **Resend-API-Key:** wird als `RESEND_API_KEY` in den Environment-Variablen abgelegt (Vercel + lokal); nicht im Client verfügbar.
- **Absender-Domain-Setup:** `narravit.de` muss in Resend als verifizierte Domain mit DKIM + SPF + DMARC eingerichtet sein. Setup-Schritt ist Teil des Roll-out (out of code scope, aber prerequisite). From-Adresse wird im Resend-Konto auf `no-reply@narravit.de` konfiguriert.
- **Server-only:** alle Resend-Aufrufe laufen serverseitig (Server Action, Route Handler, Cron-Job). Niemals aus dem Client.
- **Templates wartbar im Code:** konkrete Modellierung (React-Email-Komponenten vs. HTML-Strings) in `/architecture`.
- **Reminder-Job:** läuft als Scheduled Job (z. B. `pg_cron` oder Supabase Edge Function mit Schedule, konkrete Wahl in `/architecture`). Tägliche Frequenz reicht.
- **Idempotenz-Marker** für Reminder und Welcome: eine eigene kleine Tabelle (z. B. `mail_log` mit `user_id`, `project_id`, `mail_type`, `sent_at`) — Architektur entscheidet das Schema. Stripe-getriggerte Mails brauchen keinen extra Marker (Stripe-Webhook ist bereits idempotent).
- **Observability:** Sentry erfasst alle Versand-Fehler; Resend-Dashboard zeigt Versand-Statistiken pro Mail-Typ (Hash über Mail-Tags).
- **Test-Modus:** in nicht-Produktions-Umgebung (`stage-app.narravit.de`, lokal) Versand entweder an eine Sandbox-Adresse oder über Resend-Testmode, damit Testdaten keine echten Mails auslösen.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### A) Komponenten-Struktur (PM-Sicht)

```
Mail-Modul (NEU, App-weit nutzbar)
+-- Resend-Client (zentral konfiguriert)
|   +-- liest RESEND_API_KEY aus Environment
|   +-- liest EMAIL_FROM aus Environment (Default: no-reply@narravit.de)
|   +-- liest EMAIL_TEST_RECIPIENT (nicht-prod): leitet alle Mails dahin um
+-- E-Mail-Templates (React-Email-Komponenten in src/emails/)
|   +-- Layout-Wrapper (gemeinsamer Header mit narravit-Logo, Footer mit
|   |    Impressum-Link + Kontakt-Adresse)
|   +-- InvitationEmail
|   +-- PortalPurchaseEmail
|   +-- VapiPackagePurchaseEmail
|   +-- WelcomeEmail
|   +-- RenewalEmail
|   +-- ReminderEmail (eine Komponente, Variante 30 / 7 als Prop)
+-- Versand-Helper (einer pro Mail-Typ)
|   +-- nehmen typsichere Props entgegen (Empfänger, Inhalt-Variablen)
|   +-- rufen React-Email-render() auf, dann Resend.send()
|   +-- Bei Idempotenz-pflichtigen Typen (Welcome, Reminder): vorher
|       mail_log-Eintrag mit Unique-Constraint anlegen, nur bei Erfolg
|       Versand starten
|   +-- Fehler → Sentry, kein Throw nach außen (Best-Effort)

Hook-Stellen (existierende Module, erweitert)
+-- createInvitationAction (PROJ-9, members-actions.ts)
|   +-- nach erfolgreicher Invitation-Row → sendInvitationEmail() (fire-and-forget)
+-- Stripe-Webhook /api/stripe/webhook (PROJ-6)
|   +-- nach erfolgreichem checkout.session.completed pro payment_type:
|       portal_initial   → sendPortalPurchaseEmail()
|       vapi_minutes     → sendVapiPackagePurchaseEmail()
|       portal_renewal   → sendRenewalEmail()
+-- Welcome-Hook (NEU, im SSR-Layout oder Middleware)
|   +-- bei Server-Render einer Auth-geschützten Route:
|       wenn User verifiziert (email_confirmed_at != null) UND
|       noch kein mail_log-Eintrag "welcome" für diese user_id existiert
|       → sendWelcomeEmail() (fire-and-forget)
+-- Cron-Endpoint /api/cron/reminders (NEU)
    +-- wird von Vercel Cron täglich aufgerufen
    +-- selektiert ablaufende Portal-Zugänge in den Fenstern [29..30d] und [6..7d]
    +-- pro Match: mail_log-Idempotenz prüfen, dann sendReminderEmail()

Datenbank
+-- mail_log (NEU)
|   +-- Idempotenz-Tabelle pro Welcome- und Reminder-Versand
|   +-- Unique-Constraint verhindert Doppelversand
+-- payments (existiert, PROJ-6)
|   +-- liefert expires_at für Portal-Zugänge zur Reminder-Selektion
+-- auth.users + profiles (existiert)
|   +-- liefert email_confirmed_at + Empfänger-E-Mail
+-- invitations (existiert, PROJ-9)
    +-- liefert Empfänger-E-Mail + Token + Projekt-Bezug
```

### B) Datenmodell (Plain Language)

```
mail_log (NEUE Tabelle)
+-- id              Eindeutige Log-ID
+-- user_id         FK auf auth.users — wer die Mail empfängt (nullable für
|                   Stripe-Mails ohne User-Bezug)
+-- project_id      FK auf projects (nullable; bei Welcome z. B. NULL)
+-- mail_type       Slug, z. B. "welcome", "reminder_30", "reminder_7",
|                   "invitation", "portal_purchase", "vapi_package", "renewal"
+-- sent_at         Zeitstempel des Versand-Versuchs (auch bei Fehler gesetzt)
+-- resend_message_id  Optional: ID aus der Resend-API-Antwort (für späteres
|                      Bounce-Tracking, MVP-Zweck nur Debugging)
+-- error           Optional: Fehlerbeschreibung, falls Versand fehlschlug
+-- created_at      Zeitstempel des DB-Eintrags

Unique-Constraint:
+-- (user_id, project_id, mail_type) für Reminders und Welcome
+-- Bei NULL-Werten in project_id (Welcome) wirkt der Constraint trotzdem
    eindeutig pro user — Postgres behandelt NULL-Werte hier sauber.

Indizes:
+-- (mail_type, sent_at) für schnelle Reminder-Idempotenz-Lookups
```

Andere Tabellen werden **nicht verändert**. Welcome- und Reminder-Idempotenz läuft ausschließlich über `mail_log`. Stripe-Mails brauchen keinen Idempotenz-Marker, weil der Stripe-Webhook bereits idempotent ist (Event-ID-Deduplizierung in PROJ-6).

### C) Tech-Entscheidungen (begründet)

1. **Resend SDK + React-Email-Templates** — Resend ist der gewählte Provider; React-Email (`@react-email/components`) ist der natürliche Begleit-Stack: typsichere Komponenten im Repo, Email-tauglicher HTML/CSS-Output, gute Outlook-/Gmail-Kompatibilität durch Standard-tabellenbasiertes Layout. Vorteile gegenüber HTML-Strings: lokale Vorschau, automatische Plain-Text-Variante, Komponenten-Wiederverwendung (gemeinsamer Layout-Wrapper mit Header/Footer).

2. **`mail_log` mit Unique-Constraint** statt Lookup-vor-Insert — eine zusätzliche Tabelle für Welcome + Reminder ist sauberer als ein Flag auf `profiles` oder eine Spalte auf `payments`. Vorteil: zentrale Stelle für Mail-Geschichte, einfache Erweiterung um weitere Mail-Typen, Race-Conditions durch Unique-Constraint vermieden (zwei parallele Versuche → einer gewinnt, der andere bekommt einen Constraint-Fehler und überspringt den Versand).

3. **Welcome beim nächsten Server-Render statt Auth-Webhook** — Supabase Auth bietet zwar einen Auth-Webhook-Mechanismus, aber er ist eine zusätzliche Konfiguration mit eigener Fehler-Oberfläche (Webhook-URL erreichbar? Secret korrekt? Retries?). Pragmatischer: beim ersten Server-Render nach Verifikation prüfen, ob `email_confirmed_at` gesetzt und `mail_log.welcome` für diese user_id leer ist — falls ja, Welcome verschicken. Funktioniert, weil der Verifikations-Klick den User direkt einloggt → unmittelbar danach passiert der nächste Server-Render. Idempotenz-Marker im `mail_log` verhindert Doppelversand bei späteren Re-Renders.

4. **Vercel Cron statt pg_cron für Reminder** — die Reminder-Logik ist Business-Logik (Personalisierung, Template-Rendering, Resend-Aufruf), keine pure SQL-Operation. Mit pg_cron + pg_net wäre der Aufruf einer HTTP-Route von der DB aus möglich, aber clunky. Vercel Cron ruft direkt eine Next.js API Route auf — gleicher Sprach-/Lib-Stack wie die App, einfacheres Debugging, native Sentry-Anbindung. (PROJ-9-Retention-Cleanup bleibt pg_cron, weil es pure SQL ist.)

5. **Fire-and-forget Versand mit `void` + Sentry-Catch** — Mail-Versand blockiert nie den auslösenden User-Flow. Für Stripe-Webhooks ist das doppelt wichtig: Stripe erwartet eine 200-Antwort in wenigen Sekunden — der Webhook-Handler darf nicht auf eine ggf. langsame Resend-Antwort warten. Promise wird `await`-frei aufgerufen; das Promise selbst hat ein internes try/catch mit Sentry-Capture. Auf Vercel sorgt `waitUntil()` (Edge Runtime) bzw. der normale Node-Eventloop (Node Runtime) dafür, dass das Promise nach dem 200-Response noch zu Ende läuft.

6. **From-Adresse aus Environment-Variable** — die finale Mail-From-Adresse + Anzeigename werden im Resend-Konto definiert (mit verifiziertem DKIM/SPF/DMARC) und in der App nur aus `EMAIL_FROM` (env var) gelesen. Vorteil: kein Code-Deploy, wenn die Adresse später angepasst wird; lokale Entwicklung kann eine andere From nutzen.

7. **Test-Modus über Env-Variable** — `EMAIL_TEST_RECIPIENT` (nur in stage/lokal gesetzt) leitet alle Mails an diese eine Adresse um statt an den echten Empfänger. So können QA-Durchläufe auf stage-app.narravit.de echte Versand-Flows testen, ohne Inboxen Dritter zu treffen. In Produktion ist die Variable leer → normales Verhalten.

8. **Empfänger-E-Mail-Hash in Sentry-Logs** — Sentry-Events zeigen den Mail-Typ + ein gehashtes/gekürztes Empfänger-Merkmal (z. B. SHA-256(email) erste 8 Zeichen), aber nicht die volle Adresse. So bleibt Debugging möglich, DSGVO-Risiko minimal.

9. **Kein Bounce-Webhook im MVP** — Resend bietet einen Bounce-Webhook, der bei Hard-/Soft-Bounces aufgerufen wird. Für PROJ-11 nicht implementiert: bei der erwarteten Mail-Last reicht das passive Sentry-Logging. Wenn später eine Bounce-Verarbeitung nötig wird (z. B. um falsch eingegebene Mitglieder-Mails wiederzufinden), eigenes Ticket.

10. **Keine eigene Mail-Queue** — `resend` ist selbst eine HTTP-API, Resend übernimmt das Queue-Management providerseitig. Eine eigene Queue (z. B. Inngest, Trigger.dev) wäre Overengineering für 7 Mail-Typen.

### D) Neue Abhängigkeiten (Pakete)

- **`resend`** — offizielles Resend-SDK (HTTP-API-Wrapper), server-only.
- **`@react-email/components`** — React-Komponenten für E-Mail-tauglichen HTML-Output (Container, Section, Heading, Text, Button, Link, Hr, Img).
- **`@react-email/render`** — rendert React-Email-Komponenten zu HTML-String + automatischem Plain-Text-Fallback.
- **(Optional, Dev-Only)** `react-email` — lokaler Dev-Server für Live-Preview während Template-Entwicklung. Nicht im Production-Build.

Vercel-Cron erfordert kein npm-Paket — die Konfiguration läuft über `vercel.json`. Sentry und Supabase sind bereits installiert.

### E) Speicher- und Lese-Fluss (vereinfacht)

```
Beim Erstellen einer Einladung (PROJ-9):
  Server-Action createInvitationAction läuft wie bisher:
    1. Invitation-Row in DB anlegen
    2. Token zurückgeben (für Step-2-Modal-Link)
  NEU danach (fire-and-forget):
    3. sendInvitationEmail({ to, projectName, role, token, inviterName }) starten
    4. Promise läuft im Hintergrund: Template rendern → Resend-API → Sentry bei Fehler

Beim Stripe-Webhook (PROJ-6):
  Existierende Logik verarbeitet den Event (Idempotenz-Check, payments-Insert, Portal-Freischaltung etc.)
  NEU am Ende, je nach payment_type:
    portal_initial   → sendPortalPurchaseEmail({ to, amount, expiresAt })
    vapi_minutes     → sendVapiPackagePurchaseEmail({ to, projectName, amount })
    portal_renewal   → sendRenewalEmail({ to, newExpiresAt, amount })
  Alle fire-and-forget; Stripe-Webhook antwortet sofort mit 200.

Beim Server-Render einer Auth-geschützten Route (Welcome):
  Auth-Layer prüft Session wie bisher.
  NEU: Wenn user.email_confirmed_at gesetzt:
    Lookup mail_log: existiert ein "welcome"-Eintrag für diese user_id?
    Wenn nein:
      INSERT mail_log (user_id, mail_type="welcome") — mit ON CONFLICT DO NOTHING
      Bei Insert-Erfolg: sendWelcomeEmail({ to, fullName }) im Hintergrund
      Bei Konflikt (parallele Sitzung): nichts tun
  Performance: dieser Check läuft pro Render, ist aber ein 1-Row-Lookup mit Index → < 5 ms.

Beim Cron-Lauf (täglich für Reminder):
  Vercel Cron ruft /api/cron/reminders mit dem Cron-Secret-Header auf.
  Route validiert Cron-Secret (Schutz vor manuellen Aufrufen).
  Selektiert payments mit type=portal_initial OR portal_renewal, deren expires_at
    im Fenster [now+29d .. now+30d] (für reminder_30) oder
    im Fenster [now+6d .. now+7d] (für reminder_7) liegt.
  Pro Match:
    LEFT JOIN mail_log auf (user_id, project_id, mail_type) — wenn schon vorhanden, skip.
    INSERT mail_log mit Unique-Constraint (ON CONFLICT DO NOTHING).
    Bei Insert-Erfolg: sendReminderEmail({ to, variant, projectName, expiresAt }) im Hintergrund.
  Antwort der Route: { processed: N, sent: M }.
```

### F) Migration-Plan

1. **DB-Migration A** — `mail_log` Tabelle anlegen (Spalten siehe B), Unique-Constraint auf `(user_id, project_id, mail_type)`, Index auf `(mail_type, sent_at)`.
2. **RLS-Migration B** — alle Operationen auf `mail_log` für reguläre Rollen sperren; nur Service-Role darf lesen/schreiben.
3. **Domain-Verifikation (manuell, prerequisite)** — `narravit.de` in Resend mit DKIM + SPF + DMARC einrichten; ohne diesen Schritt verschickt Resend keine Mails von dieser Domain.
4. **Env-Variablen (Vercel + lokal)**:
    - `RESEND_API_KEY` (production secret)
    - `EMAIL_FROM` (z. B. `narravit <no-reply@narravit.de>`)
    - `EMAIL_TEST_RECIPIENT` (nur stage + lokal; in production leer)
    - `CRON_SECRET` (Schutz für Cron-Endpoint)
5. **Vercel-Cron-Konfiguration** in `vercel.json` — täglicher Aufruf von `/api/cron/reminders` (z. B. 09:00 UTC). Vercel sendet automatisch einen authentifizierten Header zur Verifikation.
6. **Code-Migration** (Frontend/Backend-Skills):
    - `src/lib/email/client.ts` — Resend-Client + Konfig-Loading
    - `src/lib/email/send-*.ts` — Helper pro Mail-Typ
    - `src/lib/email/idempotency.ts` — mail_log-Insert-Helper
    - `src/emails/Layout.tsx`, `src/emails/<Mail>.tsx` — Templates
    - Erweiterung von [src/app/projektuebersicht/[project_id]/members-actions.ts](src/app/projektuebersicht/[project_id]/members-actions.ts) um Invitation-Mail-Hook
    - Erweiterung von [src/app/api/stripe/webhook/route.ts](src/app/api/stripe/webhook/route.ts) um 3 Mail-Hooks
    - Welcome-Hook im Auth-geschützten Layout (z. B. `app/layout.tsx` Server-Component) oder einem dedizierten `app/(auth)/layout.tsx`
    - Neue Route `src/app/api/cron/reminders/route.ts`
    - Tests pro Mail-Helper (Mock Resend-Client) und für den Cron-Endpoint
7. **Step-2-Modal-Anpassung** in PROJ-9 — Hinweistext von „bitte leite den Link manuell weiter" auf „Mail ist unterwegs — du kannst den Link bei Bedarf zusätzlich manuell teilen" anpassen.

Alle DB-Migrationen laufen zuerst gegen den `stage`-Branch.

### G) RLS-Übersicht

```
mail_log
+-- SELECT:  gesperrt für reguläre Rollen
+-- INSERT:  gesperrt für reguläre Rollen
+-- UPDATE:  gesperrt für reguläre Rollen
+-- DELETE:  gesperrt für reguläre Rollen
+-- Service-Role: voller Zugriff (Versand-Helper + Cron-Endpoint laufen
                  serverseitig mit Service-Role)
```

Keine User-direkte Interaktion mit `mail_log` — Spalte wird ausschließlich serverseitig befüllt.

### H) Sicherheit + Performance

- **Resend-API-Key-Leakage verhindert** durch serverseitige-only Nutzung. Bei statischem Build wird die Variable nie in Client-Bundles eingebettet (Next.js prefixt Client-Vars mit `NEXT_PUBLIC_` — `RESEND_API_KEY` hat diesen Prefix nicht).
- **Cron-Endpoint-Missbrauch** verhindert durch Vercel-Cron-Secret-Header-Check (oder über Vercel-Cron-Signature, je nach Vercel-Plan). Ohne den richtigen Header schlägt der Endpoint mit 401 fehl.
- **Mail-Flood-Schutz**: Versand pro auslösendem Event ist auf einen Mail-Typ begrenzt; Reminder-Job hat Idempotenz-Marker → kein Doppelversand. Resend-API hat providerseitige Rate-Limits (Free-Tier ~3.000 Mails/Tag) — bei expectedem MVP-Volumen unproblematisch.
- **Performance der Cron-Selektion**: Index auf `payments.expires_at` (sollte aus PROJ-6 schon existieren); pro Cron-Run werden typisch < 20 Match-Reihen erwartet → unter 1 Sekunde Gesamt-Laufzeit.
- **DSGVO**: Mail-Inhalte enthalten keine sensible Inhalte über den notwendigen Kontext hinaus. `mail_log` speichert keine Mail-Bodies, nur Metadaten. Resend-Konto-Logs unterliegen dem Resend-DPA (data processing agreement).
- **DKIM/SPF/DMARC**: ohne korrekte DNS-Konfig würden Mails als Spam markiert / verworfen → ist Pflicht-Prerequisite, kein Code-Schritt.

### I) Offene Punkte für Folge-Tickets (out of scope für PROJ-11)

- **Bounce-Webhook**: Resend kann Bounces an einen Webhook posten. Dann könnte das System Empfänger mit Hard-Bounce markieren und z. B. dem Projektleiter Hinweise zur falsch eingegebenen Mail geben. Eigenes Ticket bei Bedarf.
- **In-App-Inbox für Einladungen**: aktuell sieht der Eingeladene die Einladung erst, wenn er den Link öffnet. Eine Inbox im persönlichen Bereich wäre ein eigenes Feature (siehe auch PROJ-9-Folge-Tickets).
- **Mehrsprachigkeit**: aktuell nur Deutsch; bei späterer Internationalisierung Templates mit Locale-Param.
- **A/B-Testing der Mail-Inhalte**: nicht im MVP.
- **Mail-Statistik-Dashboard im Portal**: Resend-Dashboard ist die Source of Truth für Versand-Statistiken.
- **Bestellungs-PDF-Anhang** für Kauf-Bestätigungen (Rechnung als PDF): Stripe hat eigene Rechnungs-PDFs — Link in die Mail (Stripe-Receipt-URL) ist im MVP ausreichend. PDF-Embedding wäre Folge-Ticket.
- **Anpassbare Mail-Frequenz pro User** (z. B. Reminder ausschalten): nicht im MVP.
- **Multi-Account-Mails**: wenn später ein User mehrere Projekte hat und alle gleichzeitig auslaufen, könnte eine konsolidierte Mail sinnvoll sein statt 3 separate Reminder. Eigenes Ticket bei Bedarf.

## Implementation Notes (Frontend) — 2026-05-25

**Pakete installiert:** `resend@^6.12.3`, `@react-email/components@^1.0.12`, `@react-email/render@^2.0.8`.

**Design-Entscheidungen mit User abgestimmt:**
- Ansprache: **Sie-Form** (konsistent mit Onboarding-Flow + Projekt-Lösch-Dialog).
- Visueller Stil: **Voll designtes Layout** mit Sand-Header (`#D0BCA6`) + Cream-Body (`#F5EFE6`) + weißer Inhalts-Karte + Sand-Footer-Band. Wordmark in der Headline statt Logo-Image (Outlook-sicher).

**Neu angelegt unter `src/emails/`:**
- `Layout.tsx` — Shared Wrapper (Header-Banner, Inhalts-Karte, Footer-Band) + Sub-Komponenten (`MailHeading`, `MailParagraph`, `MailDetailsList`, `MailCtaButton`, `MailInlineFallbackLink`). Alle Styles inline, tabellenbasiertes Email-HTML via React-Email-Komponenten.
- `InvitationEmail.tsx` — Einladungs-Mail (Trigger: PROJ-9 `createInvitationAction`).
- `PortalPurchaseEmail.tsx` — Erstkauf-Bestätigung (Trigger: PROJ-6 Stripe-Webhook `initial_portal_access`).
- `VapiPackagePurchaseEmail.tsx` — +60-Min-Vapi-Aufladung (Trigger: PROJ-6 `vapi_voice_minutes_60`).
- `WelcomeEmail.tsx` — Onboarding-Mail nach Verifikation (Trigger: erster Server-Render mit `email_confirmed_at`).
- `RenewalEmail.tsx` — Verlängerungs-Bestätigung (Trigger: PROJ-6 `renewal_portal_access`).
- `ReminderEmail.tsx` — 30/7-Tage-Reminder, Variante per `variant`-Prop (Trigger: Vercel-Cron `/api/cron/reminders`).
- `index.ts` — zentrale Re-Exports für Backend-Send-Helper.

**Bestehende Datei aktualisiert:**
- `src/components/projektuebersicht/ProjectUsersClient.tsx` — Step-1- und Step-2-Modal-Texte angepasst: Hinweis, dass die Einladung automatisch per Mail verschickt wird; Link kann zusätzlich manuell geteilt werden.

**Verifikation:**
- `npx tsc --noEmit` — sauber.
- `npx next build` — sauber.
- Vitest 124/124 grün.
- Playwright PROJ-9 AddUser-Modal AC-Modal-1/2 grün (Text-Änderung bricht keinen E2E-Test).

## Implementation Notes (Backend) — 2026-05-25

**DB-Migration:**
- `supabase/migrations/20260525190000_proj11_mail_log.sql` — Tabelle `mail_log` mit Spalten `user_id`, `project_id`, `mail_type`, `sent_at`, `resend_message_id`, `error`. UNIQUE NULLS NOT DISTINCT auf `(user_id, project_id, mail_type)` für PG-15-Idempotenz. CHECK-Constraint auf erlaubte `mail_type`-Slugs. RLS aktiv, KEINE Policies → Default-DENY für alle nicht-Service-Rollen. Index auf `(mail_type, sent_at)`.
- Migration ist gegen stage-Branch (`kdjhxqitfxnsavhiafdn`) angewendet; `database.types.ts` regeneriert.

**Email-Lib unter `src/lib/email/`:**
- `client.ts` — Resend-Singleton + `sendEmail()` mit React-Email-`render()`, EMAIL_TEST_RECIPIENT-Override (stage/lokal leitet alle Mails dorthin), Empfänger-Validierung, Fehler-Catch, `hashEmailForLog()` (SHA-256-8-char-Prefix für DSGVO-konformes Logging), `getSiteUrl()`.
- `idempotency.ts` — `reserveMailLog()` (INSERT ON CONFLICT → 23505 = duplicate), `finalizeMailLog()` (UPDATE mit resend_message_id / error), `createNonIdempotentLogEntry()`.
- 6 Send-Helper: `send-invitation.ts`, `send-portal-purchase.ts`, `send-vapi-package.ts`, `send-welcome.ts` (mit reserve/finalize), `send-renewal.ts`, `send-reminder.ts` (mit reserve/finalize). Alle haben `import "server-only"` und fire-and-forget-Semantik via console.error-Logging.

**Hook-Stellen:**
- `members-actions.ts` `createInvitationAction` — nach Invitation-Row-INSERT werden Projekt-Titel + Inviter-Profil in `Promise.all` gelesen, dann `void sendInvitationMail()`.
- `api/stripe/webhook/route.ts` — neue Helper `formatEur()`, `formatGermanDate()`, `resolveBuyerEmail()` (Stripe-customer_details → session.customer_email → profiles fallback). Hooks am Ende jedes Handlers: `handleInitial` → `sendPortalPurchaseMail` (nur wenn `buyerIsMember`), `handleRenewal` → `sendRenewalMail`, `handleVapi` → `sendVapiPackageMail`.
- `api/cron/reminders/route.ts` — täglicher Vercel-Cron mit `CRON_SECRET`-Header-Check (akzeptiert sowohl Vercel-`Authorization: Bearer` als auch `x-cron-secret`). Selektiert `project_access` in Fenstern `[now+29d..now+30d]` und `[now+6d..now+7d]`, löst PL pro Projekt auf und ruft `maybeSendReminderMail`. Antwort: `{ processed, sent, skipped }`.
- `auth/callback/route.ts` — nach `exchangeCodeForSession()` wird bei `email_confirmed_at != null` ein `void maybeSendWelcomeMail()` ausgelöst.

**Konfiguration:**
- `vercel.json` neu — Cron `0 9 * * *` (täglich 09:00 UTC) auf `/api/cron/reminders`.
- `.env.local.example` erweitert um `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_TEST_RECIPIENT`, `CRON_SECRET` mit Doku-Kommentaren.

**Tests:**
- `src/lib/email/client.test.ts` — 9 Tests: invalid recipients, happy path, EMAIL_TEST_RECIPIENT-Redirect, API-Error, thrown errors, hashEmailForLog, getSiteUrl. Klassen-Mock für Resend statt arrow function (Vitest-4-Konstruktor-Kompatibilität).
- `src/lib/email/idempotency.test.ts` — 5 Tests: reserve happy path, 23505 → duplicate, andere Error-Codes → db_error, finalize ok/error path.
- `src/app/api/cron/reminders/route.test.ts` — 9 Tests: Auth-Gate (3 Header-Varianten + wrong-secret), happy-path 30-Tage-Fenster, duplicate-skip, no-PL-skip, no-email-skip, missing-CRON_SECRET → 500.
- Existierende `webhook/route.test.ts` und `members-actions.test.ts` um Mock-Erweiterungen ergänzt (profiles-Tabelle, zusätzliche `Promise.all`-Reads für Mail-Personalisierung) — keine Test-Logik geändert, nur Setup.

**Verifikation:**
- Migration auf stage gegen `kdjhxqitfxnsavhiafdn` angewendet.
- `npx tsc --noEmit` — sauber.
- `npx next build` — sauber, neue Route `/api/cron/reminders` registriert.
- Vitest 147/147 grün (23 neue Tests für PROJ-11 + bestehende 124 grün).

**Resend-Setup als Prerequisite vor Roll-out (manuell durch User):**
- Domain `narravit.de` in Resend mit DKIM + SPF + DMARC verifizieren.
- API-Key generieren und in Vercel-Env-Vars (production + stage) setzen.
- `EMAIL_FROM` setzen, in stage zusätzlich `EMAIL_TEST_RECIPIENT`.
- `CRON_SECRET` generieren (`openssl rand -base64 32`) und in Vercel + lokal hinterlegen.

## QA Test Results — 2026-05-26

### Testing-Lauf

| Lauf | Ergebnis |
|------|----------|
| Vitest (gesamte Suite) | **147/147 grün** (23 neue PROJ-11-Tests + 124 bestehend) |
| Vitest `src/lib/email/client.test.ts` | **9/9 grün** (invalid recipient, happy, EMAIL_TEST_RECIPIENT-Override, API-Error, thrown errors, hashEmailForLog, getSiteUrl) |
| Vitest `src/lib/email/idempotency.test.ts` | **5/5 grün** (reserve happy, 23505 → duplicate, db_error, finalize ok/error) |
| Vitest `src/app/api/cron/reminders/route.test.ts` | **9/9 grün** (3 Auth-Header-Varianten + wrong-secret + 4 happy-/skip-Pfade + missing-CRON_SECRET) |
| `npx tsc --noEmit` | sauber |
| `npx next build` | sauber, Route `/api/cron/reminders` registriert |
| Stripe-Webhook-Regression (PROJ-6) | 4/4 grün — Mock-Erweiterung um `profiles`-Tabelle wirksam |
| Members-Actions-Regression (PROJ-9) | grün — zusätzliche Read-Mocks für Personalisierung wirksam |

### Acceptance-Criteria-Abdeckung (statisches Code-Review)

**Allgemein** — ✅
- Provider Resend ✓ (`src/lib/email/client.ts` Resend-Singleton)
- From-Adresse aus Env-Variable `EMAIL_FROM`, mit Fallback ✓
- Deutsche Mails ✓ (alle Templates in `src/emails/`)
- Footer mit Impressum + Kontakt-Hinweis ✓ (Layout.tsx) — siehe BUG-1
- Versand-Modus asynchron / Best-Effort ✓ (`void sendXxx(...)`-Pattern überall, interne try/catch in Send-Helpern)
- Idempotenz ✓ (mail_log UNIQUE NULLS NOT DISTINCT)

**Mail 1 — Einladung** — ✅
- Trigger `createInvitationAction` ✓ (members-actions.ts:138)
- Empfänger = `invitations.email` ✓
- Inhalt: Anrede, „X hat dich eingeladen", Rolle, Link, 14-Tage-Hinweis ✓
- Step-2-Modal-Anpassung ✓ (ProjectUsersClient.tsx — „Mail ist unterwegs — du kannst den Link bei Bedarf zusätzlich manuell teilen")

**Mail 2 — Portal-Erstkauf** — ✅ (mit Hinweis BUG-3)
- Trigger Stripe-Webhook `initial` ✓ (webhook/route.ts handleInitial)
- Empfänger = `resolveBuyerEmail()` (Stripe customer_details → customer_email → profiles fallback) ✓
- Inhalt: Anrede, „Portal-Zugang freigeschaltet", Betrag, Datum, expiresAt, 10 h Vapi-Hinweis, optionale Invoice-URL ✓

**Mail 3 — Vapi-Paket** — ✅
- Trigger Stripe-Webhook `vapi` ✓
- Empfänger = Käufer ✓
- Inhalt: +60 Min, Projektname, Betrag, Datum ✓

**Mail 4 — Welcome** — ✅
- Trigger `/auth/callback` nach `exchangeCodeForSession` mit `email_confirmed_at != null` ✓
- Idempotenz pro user_id via `mail_log.welcome` ✓
- Abgrenzung zur Supabase-Verifikations-Mail: hier wird die *separate* Welcome-Mail verschickt (Tagging: `type: welcome`) ✓

**Mail 5 — Renewal** — ✅
- Trigger Stripe-Webhook `renewal` ✓
- Inhalt: 12-Monate-Verlängerung, neues expiresAt, Invoice-URL ✓

**Mail 6+7 — Reminder 30/7 Tage** — ✅
- Trigger Vercel-Cron auf `/api/cron/reminders` ✓
- Fenster [now+29d..now+30d] und [now+6d..now+7d] ✓
- Empfänger: PL des Projekts ✓
- Pro `(user, project, mail_type)` einmal ✓
- Variante per Prop, Subject + Eyebrow + Ton kontextabhängig ✓

**Fehlerverhalten** — ✅
- Bei Resend-API-Fehler: `console.error` mit Mail-Typ + 8-char-Hash-Empfänger (DSGVO) ✓
- Bei dauerhaftem Bounce: nur Log (kein automatischer Retry — explizit per Spec) ✓
- Bei ungültiger Empfänger-Adresse: vor API-Call abbrechen, return error ✓

### Sicherheits-Audit (Red Team)

| Vektor | Befund |
|--------|--------|
| RESEND_API_KEY-Client-Leak | `import "server-only"` in client.ts + alle Send-Helpern ✓ — Build würde failen, falls Import in Client-Komponente |
| Cron-Endpoint-Missbrauch | `authorize()` prüft `Authorization: Bearer` ODER `x-cron-secret` gegen `CRON_SECRET`; 401 bei wrong, 500 bei missing env ✓ |
| Mail-Flood / DoS via Cron | mail_log-Idempotenz pro `(user, project, mail_type)` verhindert Doppelversand bei Wiederholungs-Calls ✓ |
| SQL-Injection in mail_log | Supabase-SDK parametrisiert ✓ |
| RLS-Lücke mail_log | RLS aktiv + keine Policies → Default-DENY für anon/authenticated; Service-Role bypasst ✓ |
| XSS in Mail-HTML | React-Email rendert via React-Escape; alle Variablen (inviterName, projectName, etc.) gehen durch JSX ✓ |
| SMTP-Header-Injection via projectName/inviterName in Subjects | KEIN aktives Newline-Stripping in Send-Helpern — siehe BUG-2 |
| DSGVO Empfänger-Adresse in Logs | `hashEmailForLog()` → SHA-256 8-char-Prefix; volle Adresse nirgendwo geloggt ✓ |
| EMAIL_TEST_RECIPIENT-Leak in prod | Env-Variable nur in stage/lokal gesetzt; in prod leer/unset → kein Override ✓ |
| Welcome-Race (zwei parallele Tabs) | reserveMailLog 23505-Conflict → Versand übersprungen ✓ |
| Concurrent Stripe-Webhook-Retry | payments.stripe_session_id UNIQUE; Webhook quittiert duplicate-Path 200 ohne erneuten Send ✓ |
| ResendQuota-Erschöpfung | Send-Result `ok: false` mit Error-Text; UI-Flow ungestört ✓ |
| Path-Traversal in renewUrl | renewUrl wird serverseitig gebaut (`${siteUrl}/projektuebersicht/${project_id}`) — kein User-Input ✓ |

### Gefundene Bugs

#### BUG-1 (Medium) — `/impressum`-Footer-Link führt zu 404

**Schweregrad:** Medium (Footer in JEDER Mail enthält den Link; User klickt → 404)
**Ort:** `src/emails/Layout.tsx:177` (Footer-Block) + jede Mail nutzt das Layout
**Symptom:** Footer enthält `<Link href={impressumUrl}>` mit `impressumUrl = ${baseUrl}/impressum`. Route `src/app/impressum/` existiert NICHT → Click führt zu Next.js-404.
**Reproduce:** Klick auf „Impressum" in beliebiger PROJ-11-Mail.
**Fix-Vorschlag:** Entweder `/impressum`-Route anlegen (Static-Page mit gesetzlich notwendigen Angaben) ODER Footer-Link auf eine externe URL umstellen (z. B. `https://narravit.de/impressum`, falls die Marketing-Site das hostet).

#### BUG-2 (Low) — Subject-Zeilen strippen keine Newlines aus User-Daten

**Schweregrad:** Low (Resend ist sehr wahrscheinlich Header-Injection-sicher; Risiko theoretisch)
**Ort:** `src/lib/email/send-invitation.ts:36`, `send-reminder.ts:63`, `send-vapi-package.ts:25`
**Symptom:** Subject-Strings interpolieren `projectName` direkt. Hypothetisch könnte ein User-Eintrag mit `\r\n` SMTP-Header-Injection erlauben (zusätzliche Bcc-Header etc.). Wir verlassen uns auf Resend's interne Sanitization.
**Mitigation laut Code:** Cover-Action normalisiert `projects.title` auf Single-Line beim Save; reguläre User-Pfade sind safe.
**Fix-Vorschlag:** Defense-in-depth: in `sendEmail` ein `subject = input.subject.replace(/[\r\n]/g, " ").slice(0, 200)` einbauen.

#### BUG-3 (Low) — Käufer ohne Portal-Zugang bekommt KEINE Bestätigungs-Mail

**Schweregrad:** Low (Spec-Lücke, kein Sicherheits-/Funktions-Risiko)
**Ort:** `src/app/api/stripe/webhook/route.ts` `handleInitial` — `if (buyerIsMember)` umschließt den Mail-Versand. Bei gift_mode = `phone-plus-computer` + buyer_retains_access = `0` ist `buyerIsMember = false` → keine Portal-Purchase-Mail.
**Symptom:** Käufer sieht die /kauf-erfolgreich-Seite („Geschenk verschickt"), bekommt aber keine E-Mail-Bestätigung über den Kauf. Spec sagt nicht explizit, ob in diesem Sub-Fall trotzdem eine Mail rausgeht.
**Fix-Vorschlag (out-of-scope für v1):** Eine 8. Mail-Variante „Geschenk verschickt" für den Käufer, die NICHT von Portal-Zugang spricht — eigenes Folge-Ticket.

#### Bugs nach Schweregrad

| Schweregrad | Anzahl |
|-------------|--------|
| Critical    | 0      |
| High        | 0      |
| Medium      | 1 (BUG-1 — Footer-Link 404) |
| Low         | 2 (BUG-2 SMTP-Injection Defense, BUG-3 Käufer-ohne-Zugang-Mail) |

### Regression-Tests verwandter Features

| Feature | Status |
|---------|--------|
| PROJ-6 (Stripe-Webhook) | 4/4 Webhook-Tests grün — Test-Mock-Erweiterung um `profiles`-Read wirksam ✓ |
| PROJ-9 (Mitglieder + Einladungen) | members-actions-Test grün — zusätzliche `projects`+`profiles`-Reads für Mail-Personalisierung mockt ✓ |
| PROJ-10 (Cover-Editor) | unverändert ✓ |
| PROJ-3 (Persönlicher Bereich) | unverändert ✓ |
| PROJ-4 (Projektübersicht) | unverändert ✓ |
| Auth-Callback-Flow | erweitert um Welcome-Hook — Hauptpfad (`exchangeCodeForSession` ok → redirect to `next`) unverändert ✓ |

### Manuelle Live-Tests (offen)

Folgende Punkte können NICHT ohne externe Konfiguration verifiziert werden — sie sind Prerequisite des Roll-outs:
- **Resend-Domain-Verifikation** (DKIM/SPF/DMARC für `narravit.de`) — manueller Schritt im Resend-Konto.
- **Echte Versand-Tests gegen Test-Inbox** — Env-Vars (`RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_TEST_RECIPIENT`) müssen in Vercel/lokal gesetzt sein. Ohne diese ist `sendEmail()` ein No-Op (returns error, kein Send-Call).
- **Vercel-Cron-Live-Lauf** — erfordert Deploy auf stage + `CRON_SECRET` in Vercel-Env.

Diese Live-Tests sollten vor Production-Roll-out unbedingt mit Test-Adresse durchgespielt werden (Stripe-Checkout in Test-Mode → Mail-Empfang in Test-Inbox prüfen; Invitation-Flow durchspielen; Welcome-Mail nach Sign-up verifizieren; Cron manuell mit `x-cron-secret`-Header gegen stage triggern).

### Production-Ready Decision

**READY für stage-Deploy + Live-Verifikation** — keine Critical/High-Bugs.

BUG-1 (Impressum-Link 404) sollte vor Production-Mail-Versand gefixt sein, weil jede Mail diesen Link enthält und Real-User darauf klicken werden. Für stage-Versand-Tests akzeptabel.

BUG-2 (Newline-Stripping) ist Defense-in-Depth; akzeptabel als Folge-Härtung.

BUG-3 (Käufer-ohne-Zugang) ist Spec-Lücke; eigenes Folge-Ticket.

**Empfohlene Reihenfolge zum Fix vor Production:**
1. BUG-1 — Impressum-Route oder externer Link
2. (Roll-out-Prerequisites: Resend-Domain + Env-Vars in Vercel)
3. BUG-2 — defensives Newline-Strippen in `sendEmail`
4. BUG-3 — Geschenk-Käufer-Bestätigungs-Mail (eigenes Ticket)

## QA Re-Test — 2026-10-13

**Anlass:** Abschluss der offenen QA nach dem Vapi-Rückbau (PROJ-6) und der neuen Anforderung „durchgängige Sie-Anrede". Unabhängiges Code-Review aller Versandpfade plus neue Regressionstests. Die Bug-Nummern setzen die Liste vom 2026-05-26 fort.

### Testing-Lauf

| Lauf | Ergebnis |
|------|----------|
| Vitest (gesamte Suite) | **173/173 grün** (13 Dateien) |
| Neu: `src/emails/emails.test.tsx` | **24/24 grün** — jede Vorlage rendert (HTML + Klartext), durchgängige Sie-Anrede, keine Vapi-/Telefon-Reste, Footer mit Impressum + Kontaktadresse |
| `npx tsc --noEmit` / `npx next build` | fehlerfrei, Route `/api/cron/reminders` registriert |
| Playwright Chromium (PROJ-9 Einladungs-Flow, PROJ-2 Auth) | grün; der Einladungs-Flow ruft den Mail-Versand auf (lokal erwartungsgemäß „RESEND_API_KEY is not set") |
| **Nicht ausgeführt** | Echter Versand über Resend, Vercel-Cron-Live-Lauf, Zustellung/Darstellung in Mail-Clients, Mobile Safari/Firefox. Gründe: lokal kein `RESEND_API_KEY`; stage-app.narravit.de liegt hinter dem Vercel-Login; Supabase-Zugriff war am 2026-10-13 nicht möglich. **Nachtrag 2026-10-14:** Über die Supabase-Anbindung geprüft — alle 14 Migrationen aus dem Repo sind im Projekt `kdjhxqitfxnsavhiafdn` (Backend von stage-app.narravit.de) angewendet, einschließlich `proj11_mail_log`. |

### Acceptance Criteria

| Bereich | Ergebnis | Anmerkung |
|---|---|---|
| Allgemein: Resend, From aus Env, deutsch, Sie-Form | ✅ | Sie-Anrede per Test abgesichert. Die Inhaltsbeschreibungen der Kriterien oben nennen noch „du"-Formulierungen — die Vorlagen sind maßgeblich. |
| Allgemein: Footer mit Impressum-Link | ❌ | BUG-1 weiter offen (Link führt ins Leere) |
| Allgemein: Versand blockiert nie den User-Flow | ⚠️ | Blockiert nicht — aber Versand ist auf Vercel nicht garantiert (BUG-5) |
| Allgemein: Idempotenz | ⚠️ | Welcome ✅; Reminder nur für den ersten Laufzeit-Zyklus korrekt (BUG-6) |
| Mail 1 — Einladung (über „Nutzer einladen") | ✅ | Trigger, Empfänger, Inhalt, Modal-Text |
| Mail 1 — Einladung bei Geschenk-Kauf | ❌ | BUG-4: wird nie verschickt |
| Mail 2 — Portal-Kauf | ⚠️ | Inhalt ✅ (ohne Vapi); Rechnungs-Link nie vorhanden bzw. defekt (BUG-7); Käufer ohne eigenen Zugang bekommt keine Mail (BUG-3) |
| Mail 3 — Vapi-Paket | entfällt | mit PROJ-6-Rückbau entfernt |
| Mail 4 — Welcome | ⚠️ | einmal pro Konto ✅; Auslöser zu breit (BUG-8) |
| Mail 5 — Verlängerung | ✅ | Rechnungs-Link wie BUG-7 |
| Mail 6/7 — Reminder 30/7 Tage | ⚠️ | Fenster, Empfänger (alle Projektleiter), Inhalt ✅; Wiederholung im Folgejahr ❌ (BUG-6) |
| Fehlerverhalten: Sentry-Eintrag | ❌ (Abweichung) | Es gibt kein Sentry im Projekt; Fehler landen nur per `console.error` im Server-Log (Empfänger gehasht ✅). Folgt mit PROJ-13. |
| Fehlerverhalten: ungültige Adresse → kein API-Call | ✅ | Unit-Test |

### Sicherheits-Audit

- Cron-Endpunkt: ohne/mit falschem Secret 401, ohne konfiguriertes Secret 500 (Unit-Tests) ✅. Vergleich des Secrets ist nicht zeitkonstant (siehe BUG-11).
- Keine Schlüssel im Client (`server-only` in allen Mail-Modulen) ✅; `mail_log` ohne Policies, nur Service-Role ✅ (laut Migration; auf Stage nicht nachgeprüft).
- Nutzereingaben in Mail-HTML werden von React maskiert ✅.
- Missbrauch als Mail-Schleuder: siehe BUG-10.

### Neue Befunde

#### BUG-4 (High) — Bei Geschenk-Käufen wird keine Einladungs-Mail verschickt
**Ort:** `src/app/api/stripe/webhook/route.ts`, `handleInitial` (Block `if (inviteRecipient && recipientEmail)`).
**Befund:** Der Webhook legt für die beschenkte Person eine Zeile in `invitations` an, ruft aber `sendInvitationMail` nicht auf. Die Einladungs-Mail hängt nur an `createInvitationAction` (manuelles „Nutzer einladen").
**Auswirkung:** Die Bestätigungsseite `/kauf-erfolgreich` sagt dem Käufer „Einladungs-Mail unterwegs an …" — das stimmt nicht. Im Pfad „Auch am Computer schreiben" **ohne** eigenen Käufer-Zugang ist danach niemand Projektmitglied, der Einladungs-Link existiert nur in der Datenbank, und der Käufer bekommt wegen BUG-3 auch keine Kauf-Mail: Ein bezahltes Projekt ist für niemanden erreichbar.
**Reproduktion:** Onboarding → „Als Geschenk" → „Auch am Computer schreiben" → E-Mail der beschenkten Person → „Möchten Sie selbst Zugang?" aus → bezahlen. Erwartet: Einladungs-Mail. Tatsächlich: kein Versandaufruf im Code.
**Status:** per Code-Review festgestellt, nicht live durchgespielt.

#### BUG-5 (High, nicht live reproduziert) — Versand läuft ungesichert nach der Antwort
**Ort:** `void maybeSendWelcomeMail(…)` in `src/app/auth/callback/route.ts`, `void sendInvitationMail(…)` in `members-actions.ts`, `void sendPortalPurchaseMail(…)` / `void sendRenewalMail(…)` im Stripe-Webhook.
**Befund:** Der Versand wird gestartet, aber nicht abgewartet und nicht über `after()` bzw. `waitUntil` an die Laufzeit gebunden. Auf Vercel darf eine Funktion nach dem Senden der Antwort angehalten werden; noch laufende Arbeit ist dann nicht garantiert.
**Auswirkung:** Welcome-, Einladungs-, Kauf- und Verlängerungs-Mails können sporadisch ausbleiben oder stark verzögert kommen. Bei der Welcome-Mail wird der Idempotenz-Marker **vor** dem Versand gesetzt — bricht der Lauf dazwischen ab, wird die Mail nie mehr verschickt. Die Reminder sind nicht betroffen (der Cron wartet den Versand ab).
**Zusatz:** Die Spec-Annahme „beim nächsten Stripe-Retry wird der Mail-Versand erneut versucht" trifft nicht zu: Der Retry endet am Idempotenz-Check (`duplicate`) vor dem Mail-Aufruf.
**Status:** aus Code und Plattformverhalten abgeleitet; lokal läuft der Versandaufruf durch. Muss auf Stage mit echtem Resend-Schlüssel gegengeprüft werden.

#### BUG-6 (Medium) — Reminder funktionieren nur im ersten Laufzeit-Zyklus
**Ort:** `mail_log_idempotency_uq` (`user_id, project_id, mail_type`) + `maybeSendReminderMail`.
**Befund:** Der Schlüssel enthält weder Ablaufdatum noch Jahr. Nach einer Verlängerung trifft der 30-/7-Tage-Reminder des Folgejahres auf den Marker des Vorjahres und wird als Duplikat übersprungen.
**Auswirkung:** Ab dem zweiten Jahr bekommt niemand mehr eine Ablauf-Erinnerung — genau die Mails, die Verlängerungen auslösen sollen. Tritt frühestens ein Jahr nach dem ersten Kauf auf, daher Medium; muss vor den ersten Verlängerungs-Jahrgängen behoben sein.
**Zusatz:** Ein fehlgeschlagener Versand (z. B. Resend nicht erreichbar) lässt den Marker ebenfalls stehen — der Reminder wird nicht nachgeholt.

#### BUG-7 (Low) — Rechnungs-Link ist nie vorhanden und wäre defekt
`invoiceUrl` wird aus `session.invoice` befüllt. Das ist eine Stripe-Rechnungs-**ID** (`in_…`), keine URL; außerdem erzeugt der Checkout im Modus „payment" ohne `invoice_creation` gar keine Rechnung. Ergebnis heute: Der Satz „Ihre Rechnung finden Sie hier" erscheint nie; würde eine Rechnung erzeugt, zeigte der Link auf `in_…`.

#### BUG-8 (Low) — Welcome-Mail hängt an jedem `/auth/callback`
Der Auslöser prüft nur „E-Mail bestätigt + noch kein Marker". Bestandskonten ohne Marker bekommen „Willkommen bei narravit" beim nächsten Passwort-Reset oder OAuth-Login. Schlägt der erste Versand fehl (z. B. fehlender Resend-Schlüssel auf Stage), bleibt der Marker stehen und das Konto bekommt nie eine Welcome-Mail.

#### BUG-9 (Low) — Mails versprechen „per Sprachnachricht erzählen"
Welcome- und Kauf-Mail nennen seit dem PROJ-6-Rückbau das Erzählen per Sprachnachricht. Die Funktion (PROJ-12) ist noch nicht gebaut. Für Stage unkritisch; vor Produktiv-Versand muss PROJ-12 live sein oder der Satz angepasst werden.

#### BUG-10 (Low) — Einladungs-Mail ohne Mengenbegrenzung
Jeder Projektleiter kann beliebig viele Einladungen an beliebige Adressen auslösen; Einlader-Name und Projekttitel sind frei wählbarer Text in einer Mail von der narravit-Domain. Durch die Bezahlschranke (Projekt nötig) begrenzt, trotzdem als Spam-/Phishing-Hebel nutzbar. Empfehlung: Begrenzung pro Projekt/Tag, in PROJ-17 aufnehmen.

#### BUG-11 (Low) — Härtung Cron und Konfiguration
- Secret-Vergleich per `===` statt zeitkonstant.
- Listenabfragen ohne `.limit()`, pro Projekt mehrere Einzelabfragen nacheinander — bei vielen Projekten Laufzeitrisiko.
- Fällt ein täglicher Lauf aus, wird das 1-Tages-Fenster verpasst und der Reminder nie verschickt.
- Datumsangaben werden in Server-Zeit (UTC) formatiert, nicht in deutscher Zeit.
- `EMAIL_TEST_RECIPIENT` hat keine Umgebungs-Sperre: Ist die Variable versehentlich in Produktion gesetzt, gehen alle Mails an die Testadresse.

#### BUG-12 (Low) — Textdetails
- Klartext-Fassung klebt Bezeichnung und Wert zusammen („Betrag249,00 €", „ProjektOmas Lebensbuch").
- Welcome-Mail: „antworten Sie uns einfach an kontakt@narravit.de", während der Footer sagt, dass Antworten nicht ankommen.

### Stand der Befunde vom 2026-05-26
- **BUG-1 (Medium)** — offen: `/impressum` existiert weiterhin nicht (auch nicht in der Routenliste des Builds).
- **BUG-2 (Low)** — offen: kein Entfernen von Zeilenumbrüchen in Betreffzeilen.
- **BUG-3 (Low)** — offen und durch BUG-4 verschärft (siehe dort).

### Befunde nach Schweregrad

| Schweregrad | Anzahl | Befunde |
|---|---|---|
| Critical | 0 | — |
| High | 2 | BUG-4, BUG-5 |
| Medium | 2 | BUG-1, BUG-6 |
| Low | 8 | BUG-2, BUG-3, BUG-7 – BUG-12 |

### Production-Ready Decision
**NOT READY** — zwei High-Befunde. Status bleibt **In Review**.

**Empfohlene Reihenfolge:**
1. BUG-4 — Einladungs-Mail im Geschenk-Pfad verschicken (und BUG-3 gleich mit: Kauf-Bestätigung für Käufer ohne Zugang).
2. BUG-5 — Versand an die Laufzeit binden; Marker-Reihenfolge bei der Welcome-Mail überdenken.
3. BUG-6 — Reminder-Idempotenz um den Ablaufzeitpunkt erweitern (braucht Migration).
4. BUG-1 — Impressum-Link.
5. Danach Live-Test auf Stage mit Resend-Schlüssel und `EMAIL_TEST_RECIPIENT`.

## Implementation Notes (Backend) — 2026-10-14: Fixes aus dem QA Re-Test

**Behoben:**
- **BUG-4 (High) + BUG-3 (Low) — Geschenk-Kauf:** Der Stripe-Webhook verschickt jetzt die Einladungs-Mail an die beschenkte Person (Geschenk-Variante: Betreff „<Käufer> schenkt Ihnen ein Lebensbuch", Button „Geschenk annehmen", Hinweis auf 14 Tage Gültigkeit). Der Käufer bekommt immer eine Kauf-Bestätigung: mit eigenem Zugang wie bisher (plus Hinweis auf die verschickte Einladung), ohne eigenen Zugang als „Ihr Geschenk ist unterwegs" ohne Portal-Verweis.
- **BUG-5 (High) — Versand an die Laufzeit gebunden:** Neuer Helfer `src/lib/email/background.ts` (`sendInBackground`, nutzt `after()` aus `next/server`, auf Vercel per `waitUntil`). Einsatz in `createInvitationAction` und `/auth/callback`. Im Stripe-Webhook werden die Mails direkt abgewartet (Server-zu-Server, niemand wartet auf die Antwort); ein Mail-Fehler lässt den Webhook nicht scheitern, weil Projekt und Zahlung schon gespeichert sind.
- **BUG-6 (Medium) — Reminder im Folgejahr:** Ohne Migration gelöst. Ein Reminder-Marker, der früher als 60 Tage vor dem aktuellen Ablauf gesetzt wurde, gehört zu einem früheren Laufzeit-Zyklus und wird ersetzt (`deleteStaleMailLog`); die eindeutige Kombination `(user_id, project_id, mail_type)` sperrt weiterhin gegen Doppelversand. Schlägt ein Versand fehl, wird der Marker freigegeben (`releaseMailLog`) und der nächste Cron-Lauf versucht es erneut.
- **BUG-11 (Low) — Cron:** Fenster nachholfähig (30-Tage-Erinnerung bei 7–30 Tagen Restlaufzeit, 7-Tage-Erinnerung bei 0–7 Tagen), Mails nennen die tatsächlich verbleibenden Tage (Singular am letzten Tag). Secret-Vergleich zeitkonstant, Listenabfragen mit `.limit()`, Datumsangaben in deutscher Zeit (`src/lib/email/format.ts`), `EMAIL_TEST_RECIPIENT` wird in Vercel-Production ignoriert.
- **BUG-8 (Low) — Welcome-Mail:** Nur noch für Konten, die höchstens 14 Tage alt sind; schlägt der Versand fehl, wird der Marker freigegeben (nächster Login über `/auth/callback` versucht es erneut).
- **BUG-2 (Low):** Betreffzeilen ohne Zeilenumbrüche, max. 200 Zeichen (`sanitizeSubject`).
- **BUG-7 (Low):** Der Rechnungs-Link nutzt die echte `hosted_invoice_url` der Stripe-Rechnung statt der Rechnungs-ID. Solange der Checkout keine Rechnungen erzeugt, entfällt der Satz (unverändert).
- **BUG-12 (Low):** Klartext trennt Bezeichnung und Wert („Betrag 249,00 €"); Welcome-Mail sagt „schreiben Sie uns an" statt „antworten Sie".
- **Absender-Fallback:** `no-reply@mail.narravit.de` statt `no-reply@narravit.de` — nur die Subdomain ist in Resend verifiziert. Abweichung vom Akzeptanzkriterium „Absender `no-reply@narravit.de`".

**Weiter offen:**
- **BUG-1 (Medium) — Impressum:** Weder die App noch narravit.de haben eine Impressum-Seite (narravit.de liefert derzeit überall 404). Braucht die Pflichtangaben vom Betreiber, bevor eine Seite gebaut oder verlinkt werden kann.
- **BUG-9 (Low):** Welcome- und Kauf-Mail erwähnen das Erzählen per Sprachnachricht; erst mit PROJ-12 live korrekt.
- **BUG-10 (Low):** Mengenbegrenzung für Einladungen → PROJ-17.
- Einladung beim Geschenk ohne Käufer-Zugang läuft nach 14 Tagen ab, und niemand im Projekt kann eine neue erstellen. **Entscheidung 2026-10-14 (Jakob):** kein Hinweis in der Mail — Käufer melden sich in dem Fall ohnehin beim Kundenservice, der eine neue Einladung ausstellt.

**Tests:** Vitest 246/246 grün (neu: `background.test.ts`, `send-welcome.test.ts`, `send-reminder.test.ts`; erweitert: Webhook-Mails für alle Kauf-Varianten, Cron-Nachholen und Secret-Präfix, Callback ohne Welcome für Bestandskonten, Client-Betreff und Production-Sperre, Marker-Freigabe, Geschenk-Vorlagen). `npx tsc --noEmit` und `npx next build` fehlerfrei. Playwright PROJ-9 (Einladungs-Flow, Chromium) 7/7 grün; der Versand läuft dabei über `after()` und meldet lokal erwartungsgemäß den fehlenden `RESEND_API_KEY`.

## Deployment
_To be added by /deploy_
