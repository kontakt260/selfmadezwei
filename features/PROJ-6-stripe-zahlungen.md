# PROJ-6: Stripe-Zahlungen (Portal + Vapi-Paket)

## Status: Planned
**Created:** 2026-05-15
**Last Updated:** 2026-05-15

## Dependencies
- Requires: PROJ-2 (Auth + SSR) — Session, Onboarding-Wizard-Daten, Middleware
- Requires: PROJ-1 (Supabase-Datenmodell & RLS) — `payments`, `invitations`, `project_members`, `projects`, `voice_sessions`-Tabellen
- Requires: PROJ-4 (Kapitel-Routing & Persistenz) — Projektübersicht als Einstiegspunkt für Verlängerung & Vapi-Nachkauf

## User Stories
- Als Käufer möchte ich nach dem Onboarding-Wizard sicher per Stripe bezahlen, damit mein Portal-Zugang sofort aktiv ist.
- Als Käufer möchte ich nach erfolgreicher Zahlung eine klare Bestätigungsseite sehen, damit ich weiß, dass alles geklappt hat.
- Als Projektleiter möchte ich meinen Portal-Zugang direkt aus der Projektübersicht verlängern, damit ich nie unvorbereitet ausgesperrt werde.
- Als Projektleiter möchte ich Vapi-Sprechzeit nachkaufen, wenn mein Kontingent zur Neige geht.
- Als Geschenkkäufer möchte ich, dass die Einladung an die beschenkte Person automatisch nach Zahlung verschickt wird, damit ich nichts manuell erledigen muss.

## Acceptance Criteria

### Produkte & Preise
- [ ] 3 kaufbare Produkte in Stripe konfiguriert: **Portal-Zugang Initial** (249 €, 12 Monate), **Portal-Zugang Verlängerung** (99 €, 12 Monate), **Vapi +60 Min** (19 €)
- [ ] Alle Preise in EUR; keine Abonnements (Einmalkauf)

### Einstiegspunkte
- [ ] "Jetzt kaufen"-CTA am Ende des Onboarding-Wizards (PROJ-2) → startet Checkout für **Portal-Zugang Initial**
- [ ] Stat-Karte "NARRAVIT-Projektzugang endet in" in `/projektuebersicht/[project_id]` → Verlängerungs-Button → startet Checkout für **Portal-Zugang Verlängerung** (mit `project_id`)
- [ ] Stat-Karte "Telefonzeit übrig" in `/projektuebersicht/[project_id]` → Button → startet Checkout für **Vapi +60 Min** (mit `project_id`)
- [ ] Verlängerung und Vapi-Nachkauf sind **ausschließlich** über die Projektübersicht zugänglich (nicht über `/persoenlicher-bereich`)

### Stripe Hosted Checkout
- [ ] Alle Checkouts laufen über Stripe Hosted Checkout (Weiterleitung auf stripe.com)
- [ ] `success_url`: `/kauf-erfolgreich` (inkl. Stripe `session_id` als Query-Parameter zur serverseitigen Verifikation)
- [ ] `cancel_url` für Initial-Kauf: `/onboarding`; für Verlängerung und Vapi: `/projektuebersicht/[project_id]`
- [ ] Onboarding-Konfiguration (Geschenkdaten, Rollen, Buyer-Zugang) wird als Stripe-Checkout-Metadata übergeben, damit der Webhook die korrekte Projektstruktur anlegt

### Erfolgsseite `/kauf-erfolgreich`
- [ ] Seite ist serverseitig verifiziert: `session_id` aus URL → Stripe API; direkte Aufrufe ohne gültige `session_id` → Redirect zu `/`
- [ ] **Initial-Kauf (für mich selbst):** Überschrift "Willkommen bei NARRAVIT!", Text "Dein Zugang ist aktiv — viel Freude beim Schreiben.", Button "Jetzt starten" → `/`
- [ ] **Initial-Kauf (Geschenk):** Wie oben, zusätzlich Hinweis "Die Einladung wurde an [E-Mail] verschickt — sobald sie angenommen wird, kann die beschenkte Person loslegen."
- [ ] **Verlängerung oder Vapi +60 Min:** Bestätigung "Kauf erfolgreich — dein Konto wurde aktualisiert.", Button "Zurück zum Projekt" → `/projektuebersicht/[project_id]`

### Abbruch
- [ ] Abbruch Initial-Kauf → `/onboarding` + Toast "Zahlung nicht abgeschlossen — du kannst es erneut versuchen."
- [ ] Abbruch Verlängerung/Vapi → `/projektuebersicht/[project_id]` + Toast "Kauf nicht abgeschlossen."

### Stripe Webhook (`checkout.session.completed`)
- [ ] Webhook-Endpunkt verarbeitet `checkout.session.completed`
- [ ] Webhook-Signatur wird serverseitig verifiziert (Stripe-Webhook-Secret); ungültige Signaturen → 400
- [ ] Idempotenz: `payments.stripe_session_id UNIQUE` verhindert doppelte Einträge bei Webhook-Retries

**Initial-Kauf (249 €):**
- [ ] Neues Projekt anlegen: `title = "Lebensgeschichten"`, `portal_access_expires_at = now() + 12 Monate`
- [ ] `payments`-Eintrag anlegen (type = `initial_portal_access`, status = `completed`)
- [ ] "Für mich selbst" **oder** "Als Geschenk — Nur Telefon": Käufer → `project_members` als `projektleiter`
- [ ] "Als Geschenk — Auch Computer" + Käufer behält Zugang: Käufer → `project_members` als `projektleiter`; `invitations`-Eintrag für Empfänger anlegen (PROJ-11 verschickt die E-Mail)
- [ ] "Als Geschenk — Auch Computer" + Käufer verzichtet auf Zugang: Käufer **nicht** in `project_members`; `invitations`-Eintrag für Empfänger anlegen mit Rolle `projektleiter` (PROJ-11 verschickt die E-Mail)
- [ ] Inklusiv-10 h Vapi-Sprechzeit ist implizit im Initial-Kauf enthalten; kein separater Eintrag nötig — Berechnung erfolgt relativ zu `initial_portal_access`-Payment

**Portal-Verlängerung (99 €):**
- [ ] `projects.portal_access_expires_at` = aktuelles Ablaufdatum + 12 Monate (kein Zeitverlust)
- [ ] `payments`-Eintrag anlegen (type = `portal_access_renewal`, status = `completed`)

**Vapi +60 Min (19 €):**
- [ ] `payments`-Eintrag anlegen (type = `vapi_voice_minutes_60`, status = `completed`)
- [ ] Verfügbare Sprechzeit ergibt sich aus: 36.000 s (10 h Inklusiv) + Σ aller `vapi_voice_minutes_60`-Payments × 3.600 − Σ `voice_sessions.duration_seconds` des Projekts

## Edge Cases
- Webhook trifft ein, bevor der Nutzer `/kauf-erfolgreich` aufruft → Projekt ist bereits angelegt; Erfolgsseite liest State über Stripe API (session_id), nicht aus der DB
- Doppelter Webhook-Call (Stripe-Retry) → `payments.stripe_session_id UNIQUE` verhindert doppelten Eintrag; kein zweites Projekt angelegt
- Käufer schließt Browser nach Checkout, ohne `/kauf-erfolgreich` zu sehen → Webhook hat ausgelöst; Zugang ist aktiv; nächster Login landet auf `/` mit aktivem Projekt
- Empfänger-E-Mail beim Geschenk-Kauf existiert bereits als Supabase-User → Webhook legt `invitations`-Eintrag trotzdem an; PROJ-11 handhabt den Spezialfall bei der E-Mail-Zustellung
- Käufer verlängert Zugang, obwohl er noch > 30 Tage aktiv ist → Verlängerung wird trotzdem verarbeitet; kein serverseitiger Block
- Vapi +60 Min für Projekt, das noch volles 10-h-Inklusiv-Kontingent hat → Kauf trotzdem möglich; Gesamtguthaben steigt
- Portal-Verlängerung für Projekt, bei dem der Käufer keinen `project_members`-Eintrag hat (Geschenk, Zugang verzichtet) → Verlängerung nur durch den beschenkten `projektleiter` möglich (einziges Mitglied mit Projektzugang)
- Webhook schlägt wegen DB-Fehler fehl → Stripe retried; Idempotenz verhindert Duplikate; falls Projekt bereits angelegt: Update statt Insert

## Technical Requirements
- Sicherheit: Stripe-Webhook-Signatur serverseitig mit `stripe.webhooks.constructEvent` verifiziert; ungültige Requests mit 400 ablehnen
- Sicherheit: Stripe Secret Key und Webhook-Secret ausschließlich serverseitig (Env-Variablen); niemals im Client exponiert
- Idempotenz: `payments.stripe_session_id UNIQUE` (aus PROJ-1) ist die einzige Duplikat-Schutzmaßnahme — kein eigenes Locking nötig
- `/kauf-erfolgreich` ruft Stripe API serverseitig auf (session_id → Session-Objekt) zur Verifikation; keine DB-Query als primäre Datenquelle für den Erfolgsfall
- Abhängigkeit PROJ-11: Einladungs-E-Mails werden durch PROJ-11 (Resend) verschickt; PROJ-6 legt nur den `invitations`-Eintrag in der DB an
- Hinweis zu PROJ-3: "Zugang verlängern"- und Vapi-Nachkauf-Buttons aus dem persönlichen Bereich entfallen; PROJ-3 ist via `/refine PROJ-3` zu aktualisieren

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
