# PROJ-19: Production-Hardening (Headers, Middleware-Caching, Env-Failsafe)

> **Kurzfassung (PROJ-31).** Das vollständige Tech Design, Bau-Notizen, QA-Protokolle und der Deployment-Verlauf stehen unverändert im [Archiv](archive/PROJ-19-production-hardening.md).

## Status: Approved
**Created:** 2026-05-16
**Last Updated:** 2026-11-22 — Tech Design von Jakob freigegeben
**Priority:** P1 (vor Public-Launch erforderlich, nicht zwingend vor Stage)
**Trigger:** Vibe-Security-Audit 2026-05-16 — Medium- und Low-Findings #3, #4, #6

## Dependencies
- Requires: PROJ-2 (Auth + SSR) — die zu härtende Middleware und das Env-Var-Setup leben dort
- Verwandt mit: PROJ-13 (Stabilität & Observability) — komplementär, aber separat scharf gestellt: PROJ-19 ist defensiv/sicherheitsorientiert, PROJ-13 reaktiv/observability-orientiert

## User Stories
- Als Plattform-Betreiber möchte ich, dass die App nicht per `<iframe>` auf fremden Seiten einbettbar ist, damit Clickjacking-Phishing gegen mein Auth-Formular nicht möglich ist.
- Als Plattform-Betreiber möchte ich, dass jeder Page-Load nicht zwangsläufig eine DB-Query auslöst, damit ich vorhersehbare Kosten und keinen DoS-Hebel über authentifizierte Wegwerf-Accounts habe.
- Als Plattform-Betreiber möchte ich, dass ein Deploy mit fehlender `NEXT_PUBLIC_SITE_URL` **scheitert** statt heimlich kaputte Mails zu verschicken, damit Config-Fehler sofort sichtbar werden.

## Acceptance Criteria

### A) Security-Headers in `next.config.ts`
- [ ] `next.config.ts` erhält eine `async headers()`-Funktion, die folgenden Block für **alle Routen** (`source: "/(.*)"`)  liefert:
  - [ ] `X-Frame-Options: DENY` (verhindert Iframe-Einbettung der gesamten App)
  - [ ] `X-Content-Type-Options: nosniff` (verhindert MIME-Sniffing-XSS bei user-uploaded Bildern)
  - [ ] `Referrer-Policy: origin-when-cross-origin` (leakt nicht den vollen Pfad an externe Links)
  - [ ] `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` (HSTS, 2-Jahres-Pin) — **nur in Production setzen** (lokales Dev über `http://localhost` darf nicht in HSTS-Bann)
  - [ ] `Permissions-Policy: camera=(), microphone=(), geolocation=()` (default-deny für Browser-APIs; Vapi nutzt keine Web-Mic-API, alles serverseitig)
- [ ] **CSP vorbereitet, aber als Report-Only**: `Content-Security-Policy-Report-Only` mit `default-src 'self'; img-src 'self' https://*.supabase.co data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://*.supabase.co` — Report-URI kann zunächst leer bleiben, später an Sentry/Logging anbinden (PROJ-13). **Enforce-Mode in eigenem Folge-Ticket nach Stripe (PROJ-6)** — Stripe-Hosted-Checkout läuft auf eigener Domain, also kein CSP-Konflikt; aber CSP-Tuning braucht Real-Traffic-Daten.
- [ ] Header werden via `curl -I https://<stage-url>` verifizierbar (Negativtest: ohne Hardening fehlen sie)
- [ ] Bestehende E2E-Tests laufen unverändert grün — keine Header darf den Auth-Flow brechen

### B) Middleware-Caching für Portal-Status
- [ ] Portal-Status-Berechnung (`hasNeverPaid` / `allExpired` / `active`) wird in einem **signierten, HTTP-only Cookie** `portal_status` mit **5-Minuten-TTL** gecached
- [ ] Cookie-Werte: `active` | `expired` | `never_paid` (kein Klartext-Datum, keine Projektdaten — minimal & nicht-PII)
- [ ] Cookie-Signierung über `crypto.createHmac('sha256', process.env.SESSION_SECRET).update(value).digest('hex')` — verhindert User-Manipulation der Status-Werte
- [ ] **Cache-Invalidierung**: Cookie wird explizit gelöscht durch
  - Stripe-Webhook nach erfolgreicher Zahlung (Trigger für sofortigen Re-Check) → wird im Rahmen von PROJ-6 in den Webhook-Handler integriert
  - Logout (`signOut`-Aufruf)
- [ ] Bei Cookie-Miss oder ungültiger Signatur: bestehender Pfad (Supabase-Query) als Fallback
- [ ] Bei Cookie-Hit: **keine** Supabase-Query in der Middleware → das ist der Performance-Gewinn
- [ ] Neue Env-Var `SESSION_SECRET` (mindestens 32 Byte Zufallsdaten) in `.env.local.example` mit Generierungs-Hinweis dokumentiert (`openssl rand -base64 32`)
- [ ] Bei fehlender `SESSION_SECRET` in Production: **Startup-Fail** (siehe Block C), nicht silent-Fallback auf Unsigned-Cookie
- [ ] Lasttest-Smoke (manuell, nicht in CI): Mit `k6` oder `wrk` zwei Szenarien fahren: 100 Requests/s ohne Cache vs. mit Cache → erwartete Reduktion der Supabase-DB-Hits um ≥ 90 %

### C) Env-Var-Failsafe für `NEXT_PUBLIC_SITE_URL` (und weitere kritische Vars)
- [ ] Neues Modul `src/lib/env.ts` validiert alle erforderlichen Env-Vars beim Modul-Load via Zod-Schema; exportiert ein typisiertes `env`-Objekt
- [ ] In Production (`process.env.NODE_ENV === 'production'`) **throwt** das Schema bei fehlender Var → App startet nicht, statt mit Defaults zu laufen
- [ ] In Development zeigt das Schema eine **Warnung** in der Konsole, aber lässt den Default-Fallback zu (Dev-Experience)
- [ ] Schema deckt mindestens ab: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`, `SESSION_SECRET` (aus Block B) — und ab PROJ-17/PROJ-6 die Stripe-/Upstash-Keys
- [ ] Alle Server Actions importieren `env` statt direkt auf `process.env.NEXT_PUBLIC_SITE_URL` mit `??`-Fallback zuzugreifen → Single Source of Truth
- [ ] `.env.local.example` ist die kanonische Referenz für das Schema; ein README-Abschnitt erklärt: *"Wenn du eine neue Env-Var brauchst → erst in `src/lib/env.ts` + `.env.local.example` eintragen, dann verwenden"*

### Dokumentation & Tests
- [ ] `tests/PROJ-19-production-hardening.spec.ts` (Playwright): drei Tests
  - [ ] Header-Test: Hauptseite laden, alle 5 Pflicht-Headers via Playwright-`response.headers()` prüfen
  - [ ] Cookie-Cache-Test: zwei Page-Loads in Folge mit eingeloggtem User; im zweiten Load **darf keine** `projects`-Query gegen Supabase erfolgen (Network-Mock oder Spy)
  - [ ] Manipulations-Test: Cookie-Wert manuell auf `active` setzen ohne korrekte Signatur → Middleware ignoriert und fällt auf Supabase-Query zurück
- [ ] `src/lib/env.test.ts` (Vitest): Schema gegen leeres und vollständiges Env-Set testen

## Edge Cases
- **HSTS-Preload-Liste**: `preload` im `Strict-Transport-Security`-Header ist **bindend** — einmal in der Preload-Liste, kann eine Domain nur über monatelange Prozeduren wieder raus. Erst aktivieren, wenn die finale Production-Domain feststeht und keine Sub-Subdomain mit HTTP-only-Bedarf existiert. **Default zunächst ohne `preload`-Token**, später per Spec-Update ergänzen.
- **CSP `unsafe-inline` für Styles**: Tailwind erzeugt Inline-Styles für Animations-Keyframes; harte CSP würde Layout brechen. Empfohlene Härtungs-Reihenfolge: erst Report-Only mit Nonces evaluieren, später Enforce.
- **Cookie-Cache + Portal-Verlängerung (PROJ-6):** Wenn der User direkt nach erfolgreicher Stripe-Zahlung weiterklickt, könnte der Cookie noch `expired` halten und ihn auf `/zugang-abgelaufen` schicken. Der Stripe-Webhook (PROJ-6) muss daher den Cookie über einen Server-Action-Cookie-Reset invalidieren — **wird in PROJ-6-Spec als Akzeptanzkriterium ergänzt** sobald PROJ-19 gemerged ist.
- **Mehrere Browser-Tabs**: Cookie ist domain-weit shared; das ist korrekt, da Portal-Status auch user-weit (nicht tab-weit) gilt.
- **Env-Failsafe-False-Positives**: Vercel-Preview-Deployments haben `NEXT_PUBLIC_SITE_URL` ggf. nicht gesetzt → Schema muss `NEXT_PUBLIC_VERCEL_URL` als Fallback in Preview-Environments akzeptieren. Im Schema explizit handhaben.
- **Service Worker / PWA**: Aktuell nicht im Projekt; falls künftig: `Service-Worker-Allowed`-Header und CSP-Anpassung notwendig.

## Technical Requirements
- **A) Headers:** native Next.js-`headers()`-API in `next.config.ts`; keine Custom-Middleware-Logic nötig → keine Performance-Auswirkung pro Request
- **B) Cookie:** `httpOnly: true`, `secure: true` (in Prod), `sameSite: 'lax'`, `maxAge: 300` (5 min); Wert-Schema: `<status>.<unix-timestamp>.<hmac>` — Timestamp im Cookie ermöglicht Cache-Ablauf-Check auch wenn Browser den Cookie nicht von selbst löscht
- **C) Env-Failsafe:** Validation läuft beim ersten Import von `src/lib/env.ts` — d.h. beim Boot der Next.js-Server-Runtime. Production-Boot scheitert sofort sichtbar (Vercel-Build-Log) statt erst zur ersten Request-Time.
- **Reihenfolge der Umsetzung**: A → C → B (A und C sind trivial; B braucht etwas mehr Sorgfalt mit Webhook-Integration in PROJ-6)
- **Nichts davon braucht eine Datenbank-Migration** → kein Supabase-Stage-Branch-Touch nötig

## Technische Entscheidungen
_Kurzform. Die vollständige Begründung steht im Archiv._

### C) Änderungen gegenüber der Spec vom Mai

| Spec vom Mai | Design | Warum |
|---|---|---|
| Cookie-Cache für den Portal-Status | **Entfällt** | Kaum Nutzen, schwächt die Paywall (siehe D) |
| `SESSION_SECRET` | Entfällt | Wurde nur für den Cookie gebraucht |
| Mikrofon gesperrt, weil Vapi es nicht nutzt | Bleibt vorerst gesperrt, PROJ-12 gibt es nur auf den Aufnahme-Routen frei | Vapi ist ersetzt, die Aufnahme läuft künftig im Browser |
| CSP ohne Turnstile | CSP kennt Turnstile und lokale Bildvorschauen | Sonst wäre die Anmeldung beim späteren Scharfschalten blockiert |
| CSP komplett nur beobachten | Kleiner Kern sofort aktiv, der Rest wird beobachtet | Der Kern (kein Einbetten, keine fremde Basis-URL, keine Plugins) bricht nichts und schützt sofort |
| Prüfung der Variablen beim Serverstart | Prüfung beim Build | Eine fehlerhafte Konfiguration geht gar nicht erst live |
| Umgebung über `NODE_ENV` erkennen | Kunden-Umgebung = Branch `main` oder Adresse `app.narravit.de` | `NODE_ENV` steht auch auf Stage auf „production" |
| Upstash-Schlüssel prüfen | Entfällt | PROJ-17 zählt in Supabase |
| Ersatz-Adresse für Preview-Builds | Entfällt | Die Adresse ist für Preview in Vercel gesetzt |

### D) Warum der Cookie-Cache entfällt

1. **Kaum Nutzen:** Die Abfrage dauert auf Stage im Schnitt 0,4 ms, höchstens 3 ms (4.597 gemessene Aufrufe).
2. **Schwächt die Paywall:** Die Datenbank kennt die Paywall beim Lesen nicht, diese Prüfung ist dort die zentrale Sperre.
3. **Die geplante Invalidierung funktioniert nicht:** Der Stripe-Webhook läuft von Server zu Server und kann kein Cookie im Browser löschen.
4. **Neues Geheimnis:** Der Cache bräuchte einen weiteren Schlüssel in jeder Umgebung.

Neu bewerten, falls die Abfrage in den Supabase-Statistiken oder bei echter Last auffällt.

### Spätere Entscheidungen
- **Identitätsprüfung vor dem Konto-Löschen:** Abschnitt I des Tech Designs hat Jakob am 2026-11-23 verworfen, sie wird nicht gebaut.
- Kein Cookie-Cache, kein `SESSION_SECRET`, keine Migration, keine neuen Pakete.

## Offene Punkte
- Nicht geprüft: Seiten hinter der App-Anmeldung auf Stage, vollständige Anmeldung bei Google und Facebook, echte Stripe-Session, Firefox und Safari, Embed-Elemente in Webflow.
