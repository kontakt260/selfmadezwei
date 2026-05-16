# PROJ-17: Rate-Limiting für Auth-Endpunkte

## Status: Planned
**Created:** 2026-05-16
**Last Updated:** 2026-05-16
**Priority:** P0 (Security-Blocker für Public-Launch)
**Trigger:** Vibe-Security-Audit 2026-05-16 — High-Finding #1

## Dependencies
- Requires: PROJ-2 (Auth + SSR) — die zu schützenden Server Actions sind dort implementiert
- Empfohlen vor: jedem öffentlich erreichbaren Deployment (auch Stage), spätestens vor PROJ-6 (Stripe)

## Problem
Die im Zuge von PROJ-2 implementierten Auth-Server-Actions besitzen **keinerlei Rate-Limiting**. Konkret betroffen:

| Action | Datei | Angriff ohne Limit |
|--------|-------|--------------------|
| `loginAction` | [src/app/anmelden/actions.ts:33](../src/app/anmelden/actions.ts#L33) | Passwort-Brute-Force auf bekannte E-Mails |
| `registerAction` | [src/app/registrieren/actions.ts:31](../src/app/registrieren/actions.ts#L31) | `auth.users`-Bloat + Mailversand-Spam (Bestätigungs-Mails) |
| `forgotPasswordAction` | [src/app/passwort-vergessen/actions.ts:19](../src/app/passwort-vergessen/actions.ts#L19) | E-Mail-Bombing beliebiger Adressen → Supabase-Mail-Quota brennt aus |
| `resendConfirmAction` | [src/app/anmelden/actions.ts:58](../src/app/anmelden/actions.ts#L58) | Wie oben |

Supabase hat eigene serverseitige Limits, diese sind aber permissiv (>10 Versuche/Min/IP nicht ausgeschlossen) und schützen unsere Mail-Quota nicht. Die Projekt-Regel [.claude/rules/security.md:25](../.claude/rules/security.md#L25) verlangt Rate-Limiting explizit; die PROJ-2-QA hat es übersehen.

## User Stories
- Als Plattform-Betreiber möchte ich, dass ein Angreifer mit einem Skript keine Brute-Force-Angriffe auf Anmeldedaten fahren kann, damit Konten echter Nutzer geschützt bleiben.
- Als Plattform-Betreiber möchte ich, dass niemand das Supabase-E-Mail-Kontingent durch massenhafte Reset-/Resend-Anfragen verbrennen kann, damit echte Nutzer ihre Mails weiterhin erhalten.
- Als legitimer Nutzer möchte ich klare Fehlermeldungen sehen, wenn ich (z. B. nach Tippfehlern) ans Rate-Limit stoße, damit ich verstehe, wann ich es erneut versuchen kann.

## Acceptance Criteria

### Backend / Infrastructure
- [ ] Upstash Redis-Instanz angelegt; Connection-String in `UPSTASH_REDIS_REST_URL` und `UPSTASH_REDIS_REST_TOKEN` als Server-only Env-Vars hinterlegt (keine `NEXT_PUBLIC_*`-Prefixe)
- [ ] Beide Vars in `.env.local.example` mit Dummy-Werten und Warnkommentar dokumentiert
- [ ] Paket `@upstash/ratelimit` und `@upstash/redis` als Dependencies installiert
- [ ] Zentrales Modul `src/lib/rate-limit.ts` exportiert vorkonfigurierte Limiter pro Use Case (Login, Reset, Resend, Register)

### Limit-Konfiguration
- [ ] **Login (`loginAction`):** Sliding Window, **5 Versuche / 15 Minuten / IP**
- [ ] **Passwort-Reset (`forgotPasswordAction`):** zwei kombinierte Limiter:
  - **3 Anfragen / Stunde / IP** (verhindert IP-basiertes Bombing)
  - **3 Anfragen / Stunde / E-Mail** (verhindert mailadressspezifisches Bombing über IP-Rotation)
- [ ] **Resend-Confirm (`resendConfirmAction`):** identisch zu Reset (3/h/IP + 3/h/E-Mail)
- [ ] **Register (`registerAction`):** Sliding Window, **10 Registrierungen / Stunde / IP**

### IP-Ermittlung (Manipulationsschutz)
- [ ] IP wird aus `x-forwarded-for`-Header gelesen, nimmt nur den **ersten** Eintrag der Liste (`split(',')[0].trim()`) — das ist der Client; spätere Einträge sind vom Angreifer fälschbar
- [ ] Fallback bei fehlendem Header: `unknown` — als ein-Bucket geteilt für alle Requests ohne Header (führt zu konservativem, geteiltem Limit für seltene Edge-Cases)
- [ ] Auf Vercel verlässlich; in lokaler Dev-Umgebung (kein Proxy) wird `127.0.0.1` aller User geshared — akzeptabel für Dev

### Fehlerverhalten
- [ ] Rate-Limit-Überschreitung führt zu einem für den Endnutzer verständlichen Fehler in der bestehenden `State`-Struktur der jeweiligen Action:
  - Login: `{ error: "Zu viele Versuche. Bitte warte 15 Minuten und probiere es erneut." }`
  - Reset/Resend: aus Security-Gründen **gleich aussehende Erfolgsantwort wie bei legitimer Anfrage** (User-Enumeration-Schutz beibehalten) — der Mailversand wird einfach übersprungen
  - Register: `{ error: "Zu viele Registrierungsversuche. Bitte später erneut probieren." }`
- [ ] Rate-Limit-Check läuft **vor** jedem Supabase-Auth-Call (sonst wird die Mail trotzdem verschickt)
- [ ] Beim Limit-Hit wird ein strukturiertes Log-Event geschrieben (`logger.warn({ event: 'rate_limit_hit', endpoint, ip_hash })`), damit Missbrauch auswertbar ist — IP nur als Hash, kein Klartext

### Dokumentation & Tests
- [ ] `src/lib/rate-limit.test.ts` (Vitest) testet die zentrale Limiter-Konfiguration: gleicher IP gegen denselben Endpoint, 5×→6× → letzter Call wird abgelehnt
- [ ] `tests/PROJ-17-rate-limiting.spec.ts` (Playwright): integraler E2E-Test, der 6 fehlgeschlagene Logins in Folge feuert und beim 6. die Fehlermeldung "Zu viele Versuche" sieht
- [ ] README-Abschnitt "Rate-Limiting" mit Limits-Tabelle und Hinweis, wie Limits in Dev temporär hochgesetzt werden können

## Edge Cases
- **Mehrere Proxies / Cloudflare vor Vercel:** `x-forwarded-for` enthält dann eine Liste. Erster Eintrag = Client. Cloudflare-spezifischer Header `cf-connecting-ip` wird **nicht** verwendet, weil keine Cloudflare-Pflicht vorausgesetzt wird; bei späterer Cloudflare-Adoption Header-Priorität in `rate-limit.ts` anpassen.
- **Localhost-Dev ohne Proxy:** Alle Devs sharen `127.0.0.1` → konservativ ok; bei Bedarf via Env-Var `RATE_LIMIT_DISABLED=true` global deaktivieren (nur außerhalb Production).
- **Upstash-Ausfall:** `@upstash/ratelimit` fällt im Default fail-open zurück → in Produktion **fail-closed** konfigurieren (`analytics: false, ephemeralCache: undefined`) und bei Redis-Fehler User mit generischer Fehlermeldung blocken. Trade-off bewusst: lieber kurze Downtime als offene Tür.
- **Legitimer Nutzer hinter geteilter IP** (Firmen-NAT, Mobil-Carrier): 5 Login-Versuche/15 min sind eng. Akzeptiert als Trade-off; späteres Tuning nach Real-Traffic-Analyse.
- **Doppelt eingereichte Forms** (Doppelklick / Network-Retry): Rate-Limit-Counter springt um 2 statt 1. Akzeptiert; durch Submit-Disable im Frontend bereits reduziert.
- **Geteilter Limit-Pool über Endpunkte vermeiden:** Login-Limit darf nicht den Register-Counter berühren — getrennte Redis-Keys (`rl:login:<ip>`, `rl:reset:<email>` etc.).

## Technical Requirements
- **Provider:** Upstash Redis (Serverless, REST-API-basiert) — funktioniert in Edge-Runtime und Node-Runtime ohne Connection-Pooling-Probleme
- **Library:** `@upstash/ratelimit` mit `slidingWindow`-Algorithmus (genauer als Fixed-Window, kein Boundary-Burst)
- **Fail-Mode:** **fail-closed** in Production, fail-open in Development (über `NODE_ENV === 'production'` Check im Limiter-Wrapper)
- **Key-Namespacing:** `rl:<endpoint>:<identifier>` — z. B. `rl:login:1.2.3.4` oder `rl:reset_email:user@example.com`
- **PII:** E-Mail-Adressen in Redis-Keys sind kurzlebig (1 h TTL). Logs nur mit Hashed-IP, keine Klartext-IP-/Mail-Persistierung.
- **Kein DoS-Vektor durch Limiter selbst:** Upstash Free-Tier hat 10.000 Commands/Tag — bei realistischer Auth-Last (max. 1–2 Calls/User/Session) reichlich. Bei Skalierung auf Pay-As-You-Go umstellen.
- **Run-Reihenfolge in der Action:** Validate (Zod) → Rate-Limit-Check → Supabase-Call. Bei Validierungsfehler **vor** dem Limit-Counter abbrechen, damit unfertige Formulare nicht ins Limit zählen.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
