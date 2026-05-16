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

### ⛔ Sicherheits-Blocker (aus PROJ-1 BUG-2 — High)
Diese Kriterien sind **Go-Live-Blocker**: ohne sie darf der Stripe-Webhook nicht produktiv geschaltet werden, sonst ist die Bezahlschranke vollständig umgehbar (jeder `co_author` könnte sich via direktem `UPDATE projects SET portal_access_expires_at = ...` unbegrenzten Portal-Zugang gewähren).

- [ ] **`portal_access_expires_at` ist für authentifizierte Clients schreibgeschützt.** Umsetzung über *eine* der beiden Optionen:
  - **Option A (empfohlen):** Neue Tabelle `project_access` (`project_id UUID PK FK projects(id) ON DELETE CASCADE`, `expires_at TIMESTAMPTZ`, `updated_at`). RLS aktiviert, nur SELECT-Policy für Projektmitglieder, **keine** INSERT/UPDATE/DELETE-Policy. Spalte `projects.portal_access_expires_at` entfällt; Middleware und alle Reads lesen aus `project_access`.
  - **Option B:** `BEFORE UPDATE`-Trigger auf `projects`, der `RAISE EXCEPTION` wirft, wenn `NEW.portal_access_expires_at IS DISTINCT FROM OLD.portal_access_expires_at` und `auth.uid() IS NOT NULL` (= nicht `service_role`).
- [ ] **Negativtest in der QA-Suite:** Authentifizierter Client (Rolle `co_author`) versucht `UPDATE projects SET portal_access_expires_at = '2099-01-01'` → muss mit RLS-/Trigger-Fehler zurückgewiesen werden. Test muss Teil von `tests/PROJ-6-stripe-zahlungen.spec.ts` sein und vor Go-Live grün laufen.
- [ ] **Migration für den Fix** liegt unter `supabase/migrations/<timestamp>_proj6_paywall_lockdown.sql` und wird **gegen den `stage`-Branch** angewendet (nicht direkt gegen `main`).

### Webhook-Sicherheit (verpflichtend, kein Kompromiss)
- [ ] Webhook-Route läuft mit `runtime = 'nodejs'` (nicht Edge), liest Body als Raw-String (`await req.text()`)
- [ ] `stripe.webhooks.constructEvent(rawBody, signatureHeader, webhookSecret)` wird **vor jeder DB-Operation** aufgerufen; ungültige Signatur → `return new Response(null, { status: 400 })`
- [ ] Webhook-Route ist im Middleware-Matcher **ausgenommen** (Stripe sendet keine User-Session; sonst 302-Redirect statt 400)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` wird ausschließlich in dieser Route (und in PROJ-11 Mail-Sender) verwendet, **niemals** mit `NEXT_PUBLIC_`-Prefix; `.env.local.example` dokumentiert das mit Dummy-Wert und Warnkommentar
- [ ] Idempotenz-Check: vor jedem Write `SELECT 1 FROM payments WHERE stripe_session_id = $1` — wenn vorhanden, 200 OK ohne weitere Schreibvorgänge

### Produkte & Preise
- [ ] 3 kaufbare Produkte in Stripe konfiguriert: **Portal-Zugang Initial** (249 €, 12 Monate), **Portal-Zugang Verlängerung** (99 €, 12 Monate), **Vapi +60 Min** (19 €)
- [ ] Alle Preise in EUR; keine Abonnements (Einmalkauf)

### Einstiegspunkte
- [ ] **`/onboarding` ist eingeloggten Nutzern vorbehalten** (Anpassung gegenüber PROJ-2-Default, wo es in `PUBLIC_ROUTES` steht): Middleware-Check ergänzen, dass nicht-authentifizierte Aufrufe auf `/registrieren?next=/onboarding` redirecten — andernfalls könnte ein anonymer User Checkout starten und der Webhook bekäme keine `user_id`-Zuordnung. Hintergrund: Vibe-Security-Audit 2026-05-16, Medium-Finding #5.
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
- Sicherheit: Stripe Secret Key, Webhook-Secret und `SUPABASE_SERVICE_ROLE_KEY` ausschließlich serverseitig (Env-Variablen); niemals im Client exponiert; niemals als `NEXT_PUBLIC_*`
- Sicherheit: Paywall-Spalten (`portal_access_expires_at` etc.) niemals als Spalte in einer für Mitglieder UPDATE-baren Tabelle — separate Tabelle mit reinem `service_role`-Write (siehe Sicherheits-Blocker oben)
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
