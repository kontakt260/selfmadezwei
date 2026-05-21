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

### A) Komponenten-Struktur (PM-Sicht)

```
NARRAVIT-Portal
+-- /onboarding (auth-gated)
|   +-- OnboardingWizard
|   |   +-- Schritt 1-N (Geschenkmodus, Rollen, …) — existiert bereits
|   +-- "Jetzt kaufen"-CTA  → startCheckout("initial")
+-- /projektuebersicht/[pid]
|   +-- ProjectStats
|   |   +-- "Zugang endet in …" + "Verlängern"-Button → startCheckout("renewal", pid)
|   |   +-- "Telefonzeit übrig" + "Nachkaufen"-Button → startCheckout("vapi", pid)
+-- /kauf-erfolgreich
|   +-- ServerComponent (verifiziert session_id via Stripe-API)
|   +-- BestätigungsCard (3 Varianten: Initial-Selbst, Initial-Geschenk, Renewal/Vapi)
+-- /api/stripe/checkout (POST — Server-Action statt API-Route bevorzugt)
|   +-- erzeugt Stripe-Checkout-Session inkl. Metadata
+-- /api/stripe/webhook (POST — Node-Runtime)
    +-- verifiziert Signatur
    +-- routet nach Produkt-Typ:
        +-- initial   → createProjectFromCheckout()
        +-- renewal   → extendProjectAccess()
        +-- vapi      → recordVapiVoiceTopUp()
```

### B) Datenmodell — Änderungen gegenüber PROJ-1

#### B.1 Paywall-Lockdown (Sicherheits-Blocker)

`portal_access_expires_at` zieht aus `projects` aus in eine neue Tabelle
`project_access`:

```
project_access
+-- project_id   UUID PK FK projects(id) ON DELETE CASCADE
+-- expires_at   TIMESTAMPTZ
+-- updated_at   TIMESTAMPTZ
```

- RLS aktiviert.
- Nur SELECT-Policy für Projekt-Mitglieder.
- KEINE INSERT/UPDATE/DELETE-Policy → nur `service_role` (Webhook) darf
  schreiben.
- Middleware + alle Reads (Projektübersicht-Stats, Server-Components)
  lesen aus `project_access`, nicht mehr aus `projects.portal_access_expires_at`.
- Spalte `projects.portal_access_expires_at` wird in Migration entfernt.

#### B.2 Bestehende Tabellen (Read-Only-Bezug, keine Schema-Änderung)

- `payments` (aus PROJ-1) — Eintrag pro erfolgreicher Stripe-Session,
  `stripe_session_id` UNIQUE für Idempotenz.
- `projects` — neue Projekte werden vom Webhook angelegt (service_role).
- `project_members` — Käufer + ggf. Beschenkte werden eingetragen.
- `invitations` (aus PROJ-1) — bei Geschenk-Käufen mit „Computer-Zugang".
- `voice_sessions` (aus PROJ-1) — Vapi-Verbrauch; Verfügbarkeit
  berechnet aus 36 000 s Inklusiv + Σ Top-Up-Minuten × 3 600 − Σ
  `voice_sessions.duration_seconds`.

### C) Webhook-Sicherheits-Architektur

Drei Verteidigungslinien gegen Manipulation:

```
Stripe → POST /api/stripe/webhook
   |
   v
[1] Signatur-Verifikation (Stripe-Webhook-Secret)
       fail → 400 (kein DB-Zugriff)
       pass → weiter
   |
   v
[2] Idempotenz-Check
       SELECT 1 FROM payments WHERE stripe_session_id = $1
       gefunden → 200 OK ohne Schreibvorgang
       nicht gefunden → weiter
   |
   v
[3] Schreiben über service_role
       - INSERT payments
       - INSERT project (initial) / UPDATE project_access (renewal/vapi)
       - INSERT project_members
       - INSERT invitations (Geschenk-Modus)
```

**Wichtige Constraints:**

- Route nutzt `export const runtime = 'nodejs';` — Edge-Runtime kann
  Raw-Body nicht garantiert lesen, Stripe-Signaturen verlangen
  byte-genaues Original.
- Body wird via `await req.text()` als Raw-String gelesen, NICHT als
  JSON-geparst — Stripe signiert den Raw-Body.
- Webhook-Pfad ist im Middleware-Matcher AUSGENOMMEN: Stripe sendet
  keine User-Session, sonst würde Middleware mit 302-Redirect statt
  400-Error antworten.
- `SUPABASE_SERVICE_ROLE_KEY` ausschließlich in dieser Route (+ PROJ-11
  Mail-Sender) verwendet, NIEMALS mit `NEXT_PUBLIC_`-Prefix.

### D) Checkout-Initiierung (3 Einstiegspunkte)

Alle drei Checkouts laufen über dieselbe Server-Action
`startCheckout(productType, projectId?)`, die:

1. Server-seitig die Session validiert (eingeloggter Nutzer).
2. Stripe Hosted Checkout Session erstellt mit:
   - `price_id` aus statischer Map (3 Produkte).
   - `success_url` = `/kauf-erfolgreich?session_id={CHECKOUT_SESSION_ID}`.
   - `cancel_url` = je nach Kontext:
     - Initial → `/onboarding`.
     - Renewal/Vapi → `/projektuebersicht/{pid}`.
   - `metadata`:
     - `user_id`: aktueller Supabase-User.
     - `product_type`: `initial` | `renewal` | `vapi`.
     - `project_id`: nur bei Renewal/Vapi.
     - **bei Initial**: serialisierte Onboarding-Wizard-Auswahl
       (Geschenkmodus, Empfänger-Email, Rolle, „Käufer behält Zugang?").
3. Redirect auf `session.url` (Stripe Hosted Checkout).

**Onboarding-Gating:**
`/onboarding` wird in `PUBLIC_ROUTES` der Middleware ENTFERNT. Nicht-
authentifizierte Aufrufe redirecten auf `/registrieren?next=/onboarding`.
Sonst könnte ein anonymer Nutzer einen Checkout starten, der Webhook
hätte keine `user_id`-Zuordnung — Projekt würde nicht korrekt angelegt.

### E) Erfolgsseite `/kauf-erfolgreich` (Verifikations-Fluss)

```
Nutzer landet auf /kauf-erfolgreich?session_id=cs_test_abc…
   |
   v
ServerComponent:
   - Liest session_id aus URL
   - Ruft stripe.checkout.sessions.retrieve(session_id)
   - Wenn session.status !== 'complete' oder session.payment_status !== 'paid'
     → redirect("/")
   - Liest session.metadata.product_type + session.metadata.project_id
   - Rendert die passende Bestätigungs-Variante:
       +-- Initial-Selbst    → "Willkommen bei NARRAVIT!" + Button → /
       +-- Initial-Geschenk  → "Einladung wurde an [email] verschickt" + Button → /
       +-- Renewal/Vapi      → "Kauf erfolgreich" + Button → /projektuebersicht/{pid}
```

**Wichtig:** Die Erfolgsseite liest den Zustand AUSSCHLIESSLICH aus
Stripe (per session_id), NICHT aus der DB. Grund: Stripe garantiert
nicht, dass der Webhook VOR der Erfolgsseite eingetroffen ist. Die
DB-Seite ist „eventually consistent" — der Server-API-Call zu Stripe
gibt uns synchron die definitive Wahrheit.

### F) Initial-Kauf — 5 Geschenk-Varianten

```
User-Selection im Wizard                  Webhook-Aktion
─────────────────────────────────────────────────────────────────
„Für mich selbst"                         CREATE project + buyer als projektleiter
„Geschenk — Nur Telefon"                  CREATE project + buyer als projektleiter
                                          (Empfänger nutzt nur Vapi-Telefon, kein
                                           Portal-Login nötig)
„Geschenk — Auch Computer"
   ↳ Käufer behält Zugang                 CREATE project + buyer als projektleiter
                                          + invitations-Eintrag für Empfänger
                                            (Rolle: co_author)
   ↳ Käufer verzichtet auf Zugang         CREATE project (kein buyer-Eintrag in
                                            project_members)
                                          + invitations-Eintrag für Empfänger
                                            (Rolle: projektleiter)
```

Webhook entscheidet anhand der Stripe-Metadata (vom Wizard serialisiert).
Die 5 Varianten sind durch zwei Boolean-Flags abbildbar:
`is_gift` (true wenn Geschenk-Modus) + `buyer_retains_access` (true wenn
Käufer Zugriff behält, irrelevant ohne `is_gift`).

### G) Renewal & Vapi — vereinfachte Webhook-Pfade

Diese beiden Produkte sind „Zusatzkäufe" auf ein bestehendes Projekt.
Der Webhook erwartet `project_id` in der Metadata; existiert das Projekt
nicht ODER ist der Käufer kein `projektleiter` darin → Webhook
loggt einen Fehler und stoppt (kein 400, weil Stripe sonst retried —
stattdessen 200 OK mit interner Fehler-Notation).

```
Renewal:
   UPDATE project_access SET
     expires_at = GREATEST(expires_at, NOW()) + INTERVAL '12 months'
   WHERE project_id = :pid;
   INSERT payments(type='portal_access_renewal', …);

Vapi:
   INSERT payments(type='vapi_voice_minutes_60', …);
   (Verfügbare Sprechzeit wird BEI BEDARF berechnet, nicht persistiert)
```

**GREATEST**-Trick verhindert Zeitverlust: wenn der Nutzer verlängert,
während das Projekt noch aktiv ist, wird die Verlängerung an das
aktuelle Ablaufdatum drangehängt.

### H) Tech-Entscheidungen (Begründungen)

1. **Stripe Hosted Checkout statt Stripe Elements** — Geringere
   Compliance-Last (PCI-DSS), kein eigenes Bezahlformular, Stripe
   pflegt die Card-Sicherheit. Nachteil (eigene Brand-UI nicht
   möglich) ist für unser Single-Buyer-Flow akzeptabel.
2. **Webhook in Node-Runtime, nicht Edge** — Stripe-Signaturen
   verlangen byte-genauen Raw-Body, was Edge-Runtime nicht garantiert.
3. **`project_access` als separate Tabelle** — Verschließt das
   Loch aus PROJ-1 BUG-2 (jeder co_author könnte sich unbegrenzten
   Zugang setzen). Die Memory-Notiz "Paywall-Felder in separater
   Tabelle" ist eingehalten.
4. **Server-Action statt API-Route für `startCheckout`** —
   Nutzt Next.js' built-in CSRF-Schutz, eingeloggter User automatisch
   verfügbar via `auth.getUser()`.
5. **Stripe-API als primäre Datenquelle der Erfolgsseite** —
   Vermeidet Race-Condition zwischen Webhook-Eintreffen und User-
   Browser-Rückkehr. DB ist eventually consistent.
6. **Einmalkauf statt Subscriptions** — Produktentscheidung aus
   PRD/Roadmap; Subscriptions würden zusätzlichen Webhook-Flow
   (`invoice.paid`, `customer.subscription.updated`) erfordern, der
   PROJ-6-Scope sprengt.
7. **`/kauf-erfolgreich` als ServerComponent (nicht Client)** —
   Stripe API-Call braucht Secret Key → server-only. Vermeidet eine
   separate API-Route.

### I) Neue Abhängigkeiten

| Paket | Zweck | Größe |
| :--- | :--- | :--- |
| `stripe` | Stripe-SDK (Server) für Checkout + Webhook + Session-Verify | ~280 KB (server-only, kein Bundle-Impact) |

Optional (für Type-Safety):
| Paket | Zweck |
| :--- | :--- |
| `@types/stripe` | TypeScript-Types (im SDK bereits enthalten ab v11) |

KEINE Client-seitigen Stripe-Pakete (kein `@stripe/stripe-js`,
kein `@stripe/react-stripe-js`) — alles läuft serverseitig + Hosted
Checkout Redirect.

### J) Migration — Reihenfolge der Schritte

Migration `<timestamp>_proj6_paywall_lockdown.sql` (gegen `stage`,
nicht `main`):

1. CREATE TABLE `project_access` (project_id PK, expires_at, updated_at).
2. INSERT INTO `project_access` aus bestehenden
   `projects.portal_access_expires_at`-Werten (Bestandsdaten-Migration).
3. ALTER TABLE `projects` DROP COLUMN `portal_access_expires_at`.
4. RLS-Policies für `project_access`:
   - ENABLE RLS.
   - SELECT-Policy: Projekt-Mitglieder dürfen lesen.
   - KEINE INSERT/UPDATE/DELETE-Policy (= nur service_role kann
     schreiben).
5. Indizes anpassen (Middleware liest `project_access.project_id`
   häufig — Primary Key reicht).

Migration `<timestamp>_proj6_checkout_metadata_columns.sql` (optional,
abhängig von PROJ-1-Schema):
1. ALTER TABLE `payments` ADD COLUMN `type` (`initial_portal_access` |
   `portal_access_renewal` | `vapi_voice_minutes_60`) — falls noch
   nicht aus PROJ-1.

### K) Environment-Variablen

```
STRIPE_SECRET_KEY           # Server-only, niemals NEXT_PUBLIC_
STRIPE_WEBHOOK_SECRET       # Server-only, aus Stripe Dashboard
STRIPE_PRICE_ID_INITIAL     # price_xxx aus Stripe
STRIPE_PRICE_ID_RENEWAL     # price_xxx aus Stripe
STRIPE_PRICE_ID_VAPI_60     # price_xxx aus Stripe
SUPABASE_SERVICE_ROLE_KEY   # Server-only (bestehend, von PROJ-1)
NEXT_PUBLIC_SITE_URL        # für success_url/cancel_url-Aufbau
```

`.env.local.example` erweitern mit allen 5 STRIPE_*-Variablen
inkl. Warn-Kommentaren („NIEMALS mit NEXT_PUBLIC_-Prefix").

### L) Test-Strategie (für /qa)

Pflicht-Tests in `tests/PROJ-6-stripe-zahlungen.spec.ts`:

1. **Negativtest Paywall-Lockdown:** Authentifizierter `co_author`
   versucht `UPDATE projects SET portal_access_expires_at = …` → muss
   FEHLSCHLAGEN (Spalte existiert nicht mehr) UND
   `UPDATE project_access SET expires_at = …` → muss mit RLS-Fehler
   FEHLSCHLAGEN.
2. **Webhook-Signaturen:** Request mit falscher/fehlender Signatur →
   400. Mit gültiger Signatur → 200 + DB-Schreibung.
3. **Idempotenz:** Zwei Webhook-Calls mit derselben `stripe_session_id`
   → nur ein `payments`-Eintrag, kein doppeltes Projekt.
4. **Onboarding-Auth-Gate:** Anonymer Aufruf von `/onboarding` →
   Redirect auf `/registrieren?next=/onboarding`.
5. **Erfolgsseite Session-Verify:** Aufruf ohne `session_id` ODER mit
   ungültiger ID → Redirect auf `/`.
6. **Renewal-GREATEST-Trick:** Verlängerung bei noch aktivem Projekt
   → `expires_at` = altes Datum + 12 Monate (nicht NOW() + 12 Monate).
7. **Vapi-Verfügbarkeit:** Nach 2 Top-Ups + N Voice-Sessions →
   `36000 + 2*3600 − Σduration` Sekunden übrig.

### M) Risiken & Gegenmaßnahmen

| Risiko | Wahrscheinlichkeit | Gegenmaßnahme |
| :--- | :--- | :--- |
| Webhook trifft VOR Erfolgsseite ein und ändert State unbemerkt | Hoch | OK — Erfolgsseite liest aus Stripe, nicht DB. Webhook-Reihenfolge irrelevant. |
| Webhook trifft NACH Erfolgsseite ein | Mittel | Erfolgsseite zeigt korrekten State (Stripe ist sync). Wenn User auf „Zum Projekt" klickt bevor Webhook eintrifft → Projekt existiert evtl. noch nicht. Mitigation: kurzes Polling (1 s, 3 s, 5 s) auf Projektübersicht, fallback "wird vorbereitet …". (Folge-Ticket.) |
| Stripe-Test-Mode-Daten in Prod-DB | Hoch | `.env.production` ≠ `.env.local`. Stripe-Account-Modus (test vs live) durch SECRET_KEY-Prefix erkennbar (`sk_test_` vs `sk_live_`). Migration mit kosmetischen Markierungen. |
| Service-Role-Key-Leak | Hoch (kritisch wenn passiert) | Strikt SERVER-only. ESLint-Regel verbieten von `NEXT_PUBLIC_SUPABASE_SERVICE_*`. CI-Check + Code-Review. |
| Race: 2 Browser-Tabs starten gleichzeitig Checkout | Niedrig | Stripe erstellt 2 unterschiedliche Sessions; je eine wird zum Webhook führen. Zweite Session legt nichts an (idempotenz pro `stripe_session_id`). User sieht 2 erfolgreiche Käufe — keine Duplikate. |
| User bezahlt, Webhook scheitert | Niedrig | Stripe retried automatisch (3 d). Bei Endgültig-Fail: Manuelle Behandlung via Stripe Dashboard + Admin-Tool (Folge-Ticket). |

### N) Implementierungs-Roadmap

1. **Migration paywall_lockdown** (DB-Schema-Änderung) → CI-grün gegen
   stage.
2. **Middleware-Update** — `project_access` als Read-Quelle,
   `/onboarding` aus PUBLIC_ROUTES entfernen.
3. **Stripe-Produkte anlegen** im Stripe-Dashboard, 3 Price-IDs in
   ENV setzen.
4. **`startCheckout`-Server-Action** — alle 3 Einstiegspunkte verkabelt
   (Onboarding-CTA, Projektübersicht-Stats).
5. **Webhook-Route** `/api/stripe/webhook` — Signatur-Verify +
   Idempotenz + 3 Aktionspfade (initial/renewal/vapi) + Geschenk-
   Varianten.
6. **Erfolgsseite** `/kauf-erfolgreich` — ServerComponent mit Stripe-
   Verify + 3 Bestätigungs-Varianten.
7. **Abbruch-Toasts** — auf Onboarding und Projektübersicht.
8. **QA-Pflicht-Tests** (siehe L) — alle 7 müssen grün sein vor
   Go-Live.

### O) Abhängigkeit zu PROJ-3 (refine)

PROJ-3 (Persönlicher Bereich + Konto) zeigt aktuell „Zugang verlängern"-
und Vapi-Nachkauf-Buttons. Nach PROJ-6 entfallen diese:

- Verlängerung und Vapi-Nachkauf sind ausschließlich über die
  Projektübersicht zugänglich (AC oben).
- PROJ-3 muss via `/refine PROJ-3` aktualisiert werden: alle
  zahlungsbezogenen UI-Elemente raus, stattdessen Link „zur
  Projektübersicht".

### P) Abhängigkeit zu PROJ-11 (Resend-Mails)

PROJ-6 legt nur den `invitations`-Eintrag in der DB an. Die
Einladungs-E-Mail an den Beschenkten verschickt PROJ-11 (Resend-
Transaktionsmail). PROJ-6 ist NICHT für E-Mail-Versand verantwortlich
— Trigger ist der INSERT in `invitations`, den PROJ-11 abonniert oder
direkt aufruft (Pattern wird in PROJ-11-Spec festgelegt).

### Q) Open Questions (zu klären vor /backend)

- [ ] Stripe-Account: Test-Mode-Account-ID festlegen, Prod-Account-ID
  festlegen.
- [ ] DSGVO/AGB-Texte für Stripe-Checkout (terms_of_service_url,
  privacy_policy_url, support_url).
- [ ] Rechnungsadresse: in Stripe-Checkout abfragen oder im
  persönlichen Bereich pflegen?
- [ ] Mehrwertsteuer-Behandlung: in 249 € enthalten oder zzgl.?
  Stripe-Tax aktivieren?
- [ ] Sprache/Locale der Stripe-Checkout-Page: standardmäßig DE,
  Fallback EN?

## Implementation Notes — Phase Frontend (2026-05-21)

Frontend-UI für PROJ-6 ist live (Phase `/frontend`). Stripe-Backend
(Webhook, Migration, echte Checkout-Sessions) folgt in `/backend PROJ-6`.

### Neue Dateien

- `src/app/checkout/actions.ts` — Server-Action `startCheckoutAction`,
  3 Produkt-Pfade (initial / renewal / vapi), Auth- und Eingabe-
  Validierung. Stub-Antwort `{ stubbed: true }` bis Stripe in /backend
  angebunden wird.
- `src/app/kauf-erfolgreich/page.tsx` — ServerComponent für die
  Erfolgsseite. Verifiziert `session_id` (PROJ-6 Frontend-Phase via
  Stub: `stub_<URL-encoded JSON>`; in /backend ersetzt durch echten
  `stripe.checkout.sessions.retrieve`). 4 Bestätigungs-Varianten
  (initial-self, initial-gift, renewal, vapi).
- `src/components/projektuebersicht/PaywallStats.tsx` — Client-
  Komponente mit den zwei Stat-Karten + Buy-Buttons.
- `src/components/CheckoutCancelToast.tsx` — Liest
  `?checkout=cancelled` aus der URL und zeigt einen Sonner-Toast.

### Geänderte Dateien

- `src/app/onboarding/OnboardingWizard.tsx` — `handlePurchase` ruft
  jetzt `startCheckoutAction` mit dem vollständigen Wizard-State auf.
  Loading-State (`useTransition` + Loader2), Success-/Error-Feedback.
- `src/app/onboarding/page.tsx` — `<CheckoutCancelToast>` eingebunden.
- `src/app/projektuebersicht/[project_id]/page.tsx` — Stat-Card-
  Placeholder durch `<PaywallStats>` ersetzt; Daten-Berechnung für
  Vapi-Verfügbarkeit (`36 000 + Σ top-ups × 3 600 − Σ voice-sessions`)
  und Portal-Ablaufdatum eingebaut. `<CheckoutCancelToast>` eingebunden.
- `src/lib/supabase/middleware.ts` — `/onboarding` aus PUBLIC_ROUTES
  entfernt; anonyme Aufrufe von `/onboarding` redirecten auf
  `/registrieren?next=/onboarding`. Neue `NO_PAYMENT_BYPASS`-Liste
  (`/onboarding`, `/kauf-erfolgreich`) verhindert Loop in der
  „kein-Projekt → onboarding"-Weiterleitung.

### Verbleibende Backend-Arbeit (`/backend PROJ-6`)

- Migration `project_access`-Tabelle anlegen (Paywall-Lockdown).
- Stripe-Produkte + Price-IDs konfigurieren, Env-Vars setzen.
- `startCheckoutAction` durch echte Stripe-Checkout-Session-Erstellung
  ersetzen (inkl. `success_url`/`cancel_url`, Metadata).
- `/api/stripe/webhook`-Route (Node-Runtime) mit Signatur-Verify +
  Idempotenz + 3 Aktionspfaden.
- `/kauf-erfolgreich`'s `verifyStripeSessionStub` durch echten
  Stripe-API-Call ersetzen.
- Webhook im Middleware-Matcher ausnehmen.
- 7 Pflicht-Tests in `tests/PROJ-6-stripe-zahlungen.spec.ts`.

### Live-Verifikation (Browser, 2026-05-21)

- `/onboarding` lädt für eingeloggte Nutzer, Wizard rendert mit dem
  letzten Schritt „Jetzt kaufen — 249 €". Klick zeigt grüne Bestätigung
  „Checkout-Daten validiert ✓ — Stripe-Hosted-Checkout wird in /backend
  PROJ-6 angebunden."
- `/projektuebersicht/[pid]` zeigt beide neuen Stat-Karten mit den
  Kauf-Buttons. „Um 12 Monate verlängern" ist disabled solange kein
  `portal_access_expires_at` gesetzt ist; „60 Minuten nachkaufen" ist
  disabled solange kein initial-Payment vorliegt.
- Anonyme Aufrufe von `/onboarding` werden auf
  `/registrieren?next=/onboarding` umgeleitet.
- TypeScript-Check (`npx tsc --noEmit`) ohne Fehler.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
