# PROJ-19: Production-Hardening (Headers, Middleware-Caching, Env-Failsafe)

## Status: Approved
**Created:** 2026-05-16
**Last Updated:** 2026-11-22 — Tech Design von Jakob freigegeben
**Priority:** P1 (vor Public-Launch erforderlich, nicht zwingend vor Stage)
**Trigger:** Vibe-Security-Audit 2026-05-16 — Medium- und Low-Findings #3, #4, #6

## Dependencies
- Requires: PROJ-2 (Auth + SSR) — die zu härtende Middleware und das Env-Var-Setup leben dort
- Verwandt mit: PROJ-13 (Stabilität & Observability) — komplementär, aber separat scharf gestellt: PROJ-19 ist defensiv/sicherheitsorientiert, PROJ-13 reaktiv/observability-orientiert

## Problem
Drei Befunde aus dem Vibe-Security-Audit, die isoliert betrachtet jeweils Medium/Low sind, aber gemeinsam ein klares Production-Hardening-Paket bilden:

1. **Fehlende Security-Headers** — `next.config.ts` enthält keinen `async headers()`-Block. Die Projekt-Regel [.claude/rules/security.md:27-31](../.claude/rules/security.md#L27) verlangt X-Frame-Options, X-Content-Type-Options, Referrer-Policy, HSTS — keiner ist gesetzt. **Konkret ausnutzbar:** Login-Seite per `<iframe>` einbettbar → Clickjacking. MIME-Sniffing kann bei vom User hochgeladenen Logo-/Cover-Bildern aus PROJ-1-Storage XSS-Vektoren öffnen.
2. **Middleware-Cost-Amplifier** — [src/lib/supabase/middleware.ts:72-94](../src/lib/supabase/middleware.ts#L72-L94) triggert bei jedem authentifizierten Request auf einer nicht-öffentlichen Route eine `projects`-Query. Bei 20 Page-Loads/Session = 20 DB-Hits, nur für Routing-Entscheidung. Cost-/DoS-Vektor: 200 parallele Requests eines Wegwerf-Accounts → Supabase-Free-Tier-Connection-Limit (60) erschöpft.
3. **`NEXT_PUBLIC_SITE_URL`-Fallback auf `localhost:3000`** — Drei Server Actions ([anmelden:67](../src/app/anmelden/actions.ts#L67), [registrieren:47](../src/app/registrieren/actions.ts#L47), [passwort-vergessen:28](../src/app/passwort-vergessen/actions.ts#L28)) fallen still auf `http://localhost:3000` zurück, wenn die Env-Var in Produktion vergessen wird → Auth-Mails enthalten ungültige Callback-Links, Nutzer können sich nicht einloggen. Silent Failure ohne Alarm.

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

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

> **Stand 2026-11-22, von Jakob freigegeben (Abschnitte A bis H).** Abschnitt I ist davon ausgenommen und wird vor dem Bau separat entworfen und freigegeben. Die Spec stammt vom Mai. Seitdem sind Turnstile, die Audio-Aufnahme im Browser und die Paywall pro Projekt dazugekommen. Das Design passt die Spec deshalb an, am stärksten bei Block B.

### A) Aufbau

```
Build auf Vercel
+-- Konfigurations-Prüfung (neu)
|   +-- Pflichtwerte für Stage und Production
|   +-- Zusatzregeln für die Kunden-Umgebung
|   +-- Bei einem Fehler bricht der Build ab, die laufende Version bleibt online

Jede Antwort der App
+-- Sicherheits-Header (neu, zentral an einer Stelle)
|   +-- Schutz vor Einbetten, MIME-Sniffing und unverschlüsseltem Zugriff
|   +-- Browser-Rechte gesperrt (Kamera, Mikrofon, Standort)
|   +-- Content-Security-Policy: kleiner Kern aktiv, der Rest im Beobachtungsmodus

Mail-Links, Auth-Weiterleitungen, Stripe-Rückleitung
+-- Eine zentrale Quelle für die Adresse der App (statt bisher mehrerer Stellen)
```

### B) Was gespeichert wird

Nichts Neues: keine Tabelle, keine Migration, kein Cookie, keine neue Variable.

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

1. **Kaum Nutzen:** Die Abfrage dauert auf Stage im Schnitt 0,4 ms, höchstens 3 ms (4.597 gemessene Aufrufe). Die Prüfung der Anmeldung läuft bei jedem Seitenaufruf ohnehin weiter.
2. **Schwächt die Paywall:** Die Datenbank kennt die Paywall beim Lesen nicht, diese Prüfung ist dort die zentrale Sperre. Ein Status pro Konto kann nicht abbilden, dass eines von mehreren Projekten abgelaufen ist. Abgelaufene oder entzogene Zugänge blieben bis zu 5 Minuten offen.
3. **Die geplante Invalidierung funktioniert nicht:** Der Stripe-Webhook läuft von Server zu Server und kann kein Cookie im Browser löschen. Wer gerade verlängert hat, sähe bis zu 5 Minuten „Zugang abgelaufen".
4. **Neues Geheimnis:** Der Cache bräuchte einen weiteren Schlüssel in jeder Umgebung.

Neu bewerten, falls die Abfrage in den Supabase-Statistiken oder bei echter Last auffällt.

### E) Sicherheits-Header

| Schutz | Wirkung |
|---|---|
| Einbetten verboten | Die App lässt sich nicht in fremde Seiten einbauen (Clickjacking). **Annahme:** Auch Webflow bettet sie nirgends per iframe ein |
| Kein MIME-Sniffing | Hochgeladene Dateien werden nicht als Skript ausgeführt |
| Referrer begrenzt | Fremde Seiten sehen nur die Domain, nie Pfade mit Einladungs- oder Aufnahme-Token |
| HTTPS erzwingen | 2 Jahre, inklusive Subdomains von `app.narravit.de`. **Ohne `preload`**, weil sich das kaum rückgängig machen lässt |
| Browser-Rechte | Kamera, Mikrofon und Standort sind gesperrt |
| Technik-Hinweis entfernt | Die Antwort verrät nicht mehr, dass Next.js läuft |

### F) Konfigurations-Prüfung

| Regel | Stage | Kunden-Umgebung | Lokal |
|---|---|---|---|
| Pflichtwerte: Supabase, App-Adresse, Stripe, Resend, Cron, Turnstile | Build bricht ab | Build bricht ab | Warnung |
| Adresse ist `https://app.narravit.de` | nicht geprüft | Pflicht | nicht geprüft |
| Stripe-Schlüssel ist ein Live-Schlüssel | nicht geprüft | Pflicht | nicht geprüft |
| Kein Turnstile-Testschlüssel | erlaubt | Build bricht ab | erlaubt |
| Keine Test-Schalter (`EMAIL_TEST_RECIPIENT`, `RATE_LIMIT_DISABLED`) | erlaubt | Build bricht ab | erlaubt |
| Rabattcode fehlt | Warnung | Warnung | still |

**Folge für den Go-live:** In Production fehlen heute sieben Pflichtwerte (`CRON_SECRET`, `RESEND_API_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` und vier Stripe-Werte). Bis sie gesetzt sind, scheitert jeder Build von `main`, die laufende Version bleibt online. Das ist gewollt: Die Variablen müssen vor dem Merge stehen. Die Reihenfolge kommt beim Bau in `docs/production/prod-umzug.md`.

### G) Neue Abhängigkeiten

Keine.

### H) Reihenfolge der Umsetzung

1. Sicherheits-Header
2. Konfigurations-Prüfung und zentrale App-Adresse
3. Automatische Tests, dabei CSP-Meldungen in den wichtigen Abläufen auswerten
4. Auf Stage prüfen: Anmeldung mit Turnstile, Google/Facebook, Stripe-Checkout, Bilder
5. Go-live-Liste ergänzen

### I) Ergänzung aus PROJ-3 BUG-6 (noch zu entwerfen und freizugeben)

Vor dem unwiderruflichen Löschen eines Kontos reicht heute eine offene Sitzung. Geplant ist eine erneute Identitätsprüfung, Vorschlag: ein Code per Mail, weil Google- und Facebook-Konten kein Passwort haben. Das ändert den Auth-Ablauf und braucht Jakobs ausdrückliche Freigabe.

## Implementation Notes — Backend 2026-11-22

**Gebaut (Abschnitte A bis H):**
- Sicherheits-Header für alle Routen in `src/lib/config/security-headers.ts`, eingebunden in `next.config.ts`. Der Hinweis auf Next.js in den Antworten ist entfernt.
- Content-Security-Policy: `frame-ancestors`, `base-uri` und `object-src` sind aktiv, der Rest läuft im Beobachtungsmodus und kennt Turnstile, Supabase und lokale Bildvorschauen.
- Konfigurationsprüfung beim Build in `src/lib/config/build-config.ts`. Meldungen nennen nur Namen von Variablen, nie Werte.
- Zentrale App-Adresse in `src/lib/site-url.ts`. Die stillen Ersatzwerte `localhost` in vier Server Actions und die Produktionsadresse in den Mails sind entfernt.

**Kein Cookie-Cache, kein `SESSION_SECRET`, keine Migration, keine neue Variable, keine neuen Pakete.** Abschnitt I (Identitätsprüfung) ist nicht gebaut.

**Ergänzungen gegenüber dem Design:**
- Als Kunden-Umgebung zählt zusätzlich `VERCEL_ENV=production`, damit auch ein Deployment ohne Git-Branch die strengen Regeln bekommt.
- Eingeschränkte Stripe-Live-Schlüssel (`rk_live_`) gelten ebenfalls als Live-Schlüssel.
- HTTPS wird auf allen Vercel-Deployments erzwungen, also auch auf Stage, und nie auf localhost.

**Geprüft:**
- Unit-Tests 690 von 690, Typprüfung, ESLint und Production-Build
- E2E gegen einen echten Production-Build: 8 von 8 (Header, Einbett-Schutz, Turnstile, keine CSP-Meldung auf Anmeldung, Projekt, Editor, Cover und persönlichem Bereich)
- E2E-Regression Chromium: 142 bestanden, 25 übersprungen, 0 fehlgeschlagen
- Echte Builds brechen ab: Stage ohne Pflichtwerte und `main` mit Testwerten
- Regeln gegen die echten Variablennamen in Vercel: Stage besteht, Production meldet genau die sieben fehlenden Werte
- Website: Im Custom Code von Webflow steht kein iframe

**Noch offen für `/qa`:** Ablauf auf `stage-app.narravit.de` (noch nicht deployed), Anmeldung mit Google und Facebook, Weiterleitung zum Stripe-Checkout, Bild-Upload unter der Beobachtung der CSP, Firefox und Safari. Embed-Elemente in Webflow ließen sich nicht prüfen.

## QA Test Results

**Getestet:** 2026-11-22
**App:** echter Production-Build (`next build` und `next start`) auf `localhost:3000` gegen die Stage-Datenbank
**Tester:** QA Engineer (AI)
**Umfang:** Abschnitte A bis H des Tech Designs. Abschnitt I (Identitätsprüfung) ist nicht gebaut.

### Acceptance Criteria Status

- [x] AC-1: Einbetten verboten (`X-Frame-Options: DENY`, `frame-ancestors 'none'`), im Browser mit fremder Seite geprüft
- [x] AC-2: `X-Content-Type-Options: nosniff`
- [x] AC-3: Referrer begrenzt, eine fremde Seite sieht von `/einladung/<token>` nur die Domain
- [x] AC-4: Kamera, Mikrofon und Standort gesperrt
- [x] AC-5: Header gelten für Seiten, 404, Middleware-Weiterleitung, Auth-Callback, API und statische Dateien
- [x] AC-6: Technik-Hinweis `X-Powered-By` entfernt
- [x] AC-7: CSP-Kern ist aktiv, eingeschleuste Basis-Adresse und Plugins werden blockiert
- [x] AC-8: Beobachtungsmodus meldet in den wichtigen Abläufen nichts: Anmeldung mit Turnstile, Start von Google und Facebook, Weiterleitung zu Stripe, Projekt, Editor, Cover, persönlicher Bereich, Bild-Upload
- [x] AC-9: HTTPS wird nur auf Vercel und ohne `preload` erzwungen (Regel per Unit-Test, auf localhost im Browser geprüft, auf Vercel noch offen)
- [x] AC-10: Build bricht auf Stage ohne Pflichtwerte ab
- [x] AC-11: Build von `main` bricht bei falscher Adresse, Stripe-Testschlüssel, Turnstile-Testschlüssel und Test-Schaltern ab
- [x] AC-12: Lokal gibt es nur eine Warnung, Meldungen enthalten nie Werte
- [x] AC-13: Regeln gegen die echten Variablennamen in Vercel: Stage besteht, Production meldet genau die sieben fehlenden Werte
- [x] AC-14: Eine zentrale Quelle für die App-Adresse
- [x] AC-15: Kein Cookie-Cache, kein `SESSION_SECRET`, keine Migration

### Security Audit Results

- [x] Clickjacking: Die App lädt nicht in einem fremden Frame
- [x] Token-Schutz: Einladungs-Token gelangen nicht über den Referrer nach außen
- [x] Injection: `<base>` und `<object>` werden vom aktiven CSP-Kern blockiert
- [x] Client-Bundle: keine Secret-Werte, keine Namen geheimer Variablen, keine Stripe-, Webhook- oder Resend-Schlüssel (34 Dateien). Lokal ist nur der Service-Role-Key als Wert vorhanden, die übrigen wurden über ihre Namen und Muster geprüft
- [x] Konfigurationsprüfung gibt keine Werte aus

### Bugs Found

#### BUG-1: Lokaler Production-Build stürzt ohne App-Adresse ab
- **Severity:** Low
- **Schritte:** `.env.local` ohne `NEXT_PUBLIC_SITE_URL`, `npm run build`, `npm run start`, „Passwort vergessen" absenden.
- **Erwartet:** Lokal gilt `http://localhost:3000`. **Tatsächlich:** Die Action wirft `NEXT_PUBLIC_SITE_URL fehlt`. Der Build warnt lokal nur. Auf Stage und Production kann das nicht passieren, weil der Build dort abbricht.
- **Status:** Behoben am 2026-11-22. Lokal gilt jetzt auch im Production-Build `http://localhost:3000`, auf Vercel bleibt der Ersatzwert gesperrt. Die Regression lief danach ohne gesetzte Adresse grün.

#### BUG-2: Gelöschte Kapitel lassen ihre Bilder im Speicher zurück
- **Severity:** Medium
- **Beschreibung:** `deleteChapterAction` entfernt nur den Datensatz. Im QA-Projekt lagen 30 verwaiste Bilder (rund 107 MB). Das betrifft auch persönliche Fotos und bestand schon vor PROJ-19.
- **Priorität:** Vor dem Go-live, gehört zu **PROJ-26** (endgültiges Löschen aus dem Papierkorb entfernt auch die Dateien).

### Automatische Tests

- Unit-Tests: 691 von 691
- PROJ-19 E2E auf dem Production-Build: 15 von 15
- Komplette E2E-Regression Chromium auf dem Production-Build: 148 bestanden, 25 übersprungen, 0 fehlgeschlagen. Der Test AC-14 aus PROJ-3 blieb bewusst außen vor, weil er eine echte Reset-Mail auslöst

### Prüfung auf Stage (2026-11-22, Version `391f93d`)

- Deployment fehlerfrei, die Konfigurationsprüfung hat auf Stage bestanden
- Alle Header stimmen mit der Soll-Liste überein: Seite `/anmelden`, JavaScript-Datei, Datei aus `public/` und echte 404-Antwort. HSTS enthält `includeSubDomains`, aber kein `preload`, `X-Powered-By` fehlt
- Unbekannte Pfade leiten nicht angemeldet zu `/anmelden` weiter und tragen dort ebenfalls alle Header
- Turnstile lädt unter der CSP. Die einzigen Meldungen im Beobachtungsmodus betreffen `vercel.live`, die Vercel-Werkzeugleiste auf Preview-Deployments. Sie gehört nicht in die Regel
- Gemessen im Browser nach Vercel-Anmeldung, weil `curl` an der Deployment-Protection endet. Die Seite wurde nur ohne App-Anmeldung aufgerufen

**Nicht geprüft:** Seiten hinter der App-Anmeldung auf Stage, vollständige Anmeldung bei Google und Facebook, echte Stripe-Session, Firefox und Safari, Embed-Elemente in Webflow.

### Summary

- **Acceptance Criteria:** 15 von 15 bestanden
- **Bugs:** 1 offen (BUG-2, Medium, wird mit PROJ-26 gelöst), BUG-1 ist behoben
- **Security:** bestanden
- **Production Ready:** JA, die Header sind auf Stage bestätigt
- **Empfehlung:** Vor dem Merge auf `main` die sieben fehlenden Production-Werte setzen (`docs/production/prod-umzug.md`, Abschnitt 1, Schritt 5)

## Deployment
_To be added by /deploy_
