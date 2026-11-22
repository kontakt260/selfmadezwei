# PROJ-17: Rate-Limiting für Auth-Endpunkte

## Status: Approved
**Created:** 2026-05-16
**Last Updated:** 2026-11-22 (QA bestanden, Handtest auf Stage bestätigt; BUG-10 und die Korrektur von BUG-5 lokal geprüft, noch nicht auf Stage)
**Priority:** P0 (Security-Blocker für Public-Launch)
**Trigger:** Vibe-Security-Audit 2026-05-16 — High-Finding #1

> ℹ️ **Anpassung 2026-11-22 (Jakob).** Die Prüfung vor dem Tech Design hat die Spec vom Mai an drei Stellen verändert:
> - **Zähler in Supabase statt Upstash:** kein neuer Anbieter und keine zusätzliche Stelle, die den Login lahmlegen kann.
> - **Cloudflare Turnstile (CAPTCHA) kommt dazu:** Die Supabase-Anmeldung ist mit dem öffentlichen Schlüssel auch direkt erreichbar, an der App vorbei (auf Stage per Testaufruf bestätigt). Limits in der App allein schützen diesen Weg nicht.
> - **Supabase-Limits für unseren Server anheben:** Supabase zählt alle Anfragen unserer Server gegen dieselbe Server-IP, ein Angreifer könnte die Anmeldung sonst für alle Kunden blockieren. Die Limits pro echter Kunden-IP prüft deshalb die App.
>
> **Änderung beim Bau (2026-11-22):** Die zuerst geplante IP-Weitergabe an Supabase über einen Secret Key entfällt. Supabase überspringt die CAPTCHA-Prüfung bei Anfragen mit Admin-Rechten, ein solcher Key hätte den Schutz auf dem App-Weg aushebeln können.
>
> Außerdem deckt PROJ-17 jetzt den Checkout-Start für Gäste (PROJ-6) und die Einladungen (PROJ-11 BUG-10) ab.

## Dependencies
- Requires: PROJ-2 (Auth + SSR) — die zu schützenden Server Actions sind dort implementiert
- Requires: PROJ-6 (Checkout-Start ohne Konto) und PROJ-9 (Einladungen) — beide bekommen ein eigenes Limit
- Muss vor dem Public-Launch live sein

## Problem
Die Auth-Server-Actions besitzen **keinerlei Rate-Limiting**. Konkret betroffen:

| Action | Datei | Angriff ohne Limit |
|--------|-------|--------------------|
| `loginAction` | [src/app/anmelden/actions.ts:28](../src/app/anmelden/actions.ts#L28) | Passwort-Brute-Force auf bekannte E-Mails |
| `registerAction` | [src/app/registrieren/actions.ts:53](../src/app/registrieren/actions.ts#L53) | `auth.users`-Bloat + Mailversand-Spam (Bestätigungs-Mails) |
| `forgotPasswordAction` | [src/app/passwort-vergessen/actions.ts:15](../src/app/passwort-vergessen/actions.ts#L15) | E-Mail-Bombing beliebiger Adressen, das Mail-Kontingent brennt aus |
| `resendConfirmAction` | [src/app/anmelden/actions.ts:84](../src/app/anmelden/actions.ts#L84) | Wie oben |
| `resetPasswordAction` (persönlicher Bereich) | [src/app/persoenlicher-bereich/actions.ts:48](../src/app/persoenlicher-bereich/actions.ts#L48) | Mail-Spam an die eigene Adresse |
| `startCheckoutAction` | [src/app/checkout/actions.ts:81](../src/app/checkout/actions.ts#L81) | Massenhaft Stripe-Sessions ohne Anmeldung |
| `createInvitationAction` | [src/app/projektuebersicht/[project_id]/members-actions.ts:62](../src/app/projektuebersicht/[project_id]/members-actions.ts#L62) | Mails mit frei wählbarem Text von unserer Domain (PROJ-11 BUG-10) |

Zwei weitere Befunde vom 2026-11-22:

- **Direkter Weg an der App vorbei:** Die Supabase-Anmeldung nimmt Aufrufe mit dem öffentlichen Schlüssel direkt an. Ein Testaufruf gegen Stage kam bis zur Passwortprüfung. Wer so angreift, umgeht jedes Limit in der App.
- **Gemeinsame Server-IP:** Supabase begrenzt pro IP (Registrierung und Passwort-Reset: 30 pro 5 Minuten, Passwort-Login: 150 pro 5 Minuten). Unsere Server Actions rufen Supabase vom Vercel-Server aus auf, alle Kunden teilen sich also dieses Limit. Bei einem Ansturm oder Angriff wären auch echte Kunden gesperrt.

## User Stories
- Als Plattform-Betreiber möchte ich, dass ein Angreifer mit einem Skript keine Brute-Force-Angriffe auf Anmeldedaten fahren kann, damit Konten echter Nutzer geschützt bleiben.
- Als Plattform-Betreiber möchte ich, dass niemand das E-Mail-Kontingent durch massenhafte Reset-/Resend-Anfragen verbrennen kann, damit echte Nutzer ihre Mails weiterhin erhalten.
- Als legitimer Nutzer möchte ich klare Fehlermeldungen sehen, wenn ich (z. B. nach Tippfehlern) ans Rate-Limit stoße, damit ich verstehe, wann ich es erneut versuchen kann.
- Als Kundin oder Kunde möchte ich mich auch dann anmelden können, wenn gerade viele andere das Portal nutzen oder jemand es angreift.
- Als wenig technikaffine Person möchte ich beim Anmelden keine Bilderrätsel lösen müssen.

## Acceptance Criteria

### Infrastruktur
- [ ] Neue Tabelle für die Zähler in Supabase (Migration), RLS aktiv, keine Policies, Zugriff nur für die Service-Role
- [ ] Die Zählung läuft atomar in der Datenbank, auch parallele Anfragen werden korrekt gezählt
- [ ] Abgelaufene Zähler werden automatisch gelöscht
- [ ] IP-Adressen und E-Mail-Adressen liegen nur als Hash mit geheimem Schlüssel in der Tabelle (abgeleitet vom vorhandenen Server-Schlüssel, keine neue Variable)
- [ ] Zentrales Modul `src/lib/rate-limit.ts` mit vorkonfigurierten Limits pro Anwendungsfall

### Limit-Konfiguration

| Aktion | Limit | Gezählt wird |
|---|---|---|
| Login, pro IP | 5 / 15 Minuten | nur Fehlversuche |
| Login, pro Konto (E-Mail) | 10 / Stunde | nur Fehlversuche |
| Passwort vergessen | 3 / Stunde pro IP **und** 3 / Stunde pro E-Mail | jede Anfrage |
| Bestätigungs-Mail erneut senden | 3 / Stunde pro IP **und** 3 / Stunde pro E-Mail | jede Anfrage |
| Registrierung | 10 / Stunde pro IP | jede Anfrage |
| Passwort-Reset im persönlichen Bereich | 3 / Stunde pro Konto | jede Anfrage |
| Checkout-Start | 20 / Stunde pro IP | jede Anfrage |
| Einladungen | 20 / Tag pro Projekt | jede Einladung |

- [ ] Alle Limits oben sind umgesetzt, jeder Bereich zählt getrennt
- [ ] Eine erfolgreiche Anmeldung setzt den Zähler des Kontos zurück und zählt selbst nicht. Frühere Fehlversuche der IP bleiben stehen, sonst könnte jemand sie mit dem eigenen Konto immer wieder löschen

### CAPTCHA (Cloudflare Turnstile)
- [ ] Turnstile sitzt auf Anmelden, Registrieren, Passwort vergessen, „Bestätigung erneut senden" und dem Passwort-Reset im persönlichen Bereich
- [ ] Die Prüfung läuft im Normalfall unsichtbar, ohne Bilderrätsel
- [ ] Das Prüf-Token geht mit dem Auth-Aufruf an Supabase, Supabase prüft es serverseitig. Der geheime Schlüssel liegt nur in Supabase
- [ ] Das Turnstile-Skript lädt nur auf den Seiten, die es brauchen
- [ ] Lädt Turnstile nicht, sieht die Person einen verständlichen Hinweis mit „Erneut versuchen". Es gibt keinen Weg an der Prüfung vorbei
- [ ] Anmeldung mit Google und Facebook funktioniert unverändert
- [ ] Stage nutzt die Testschlüssel von Cloudflare, damit die E2E-Tests weiterlaufen. Production nutzt echte Schlüssel für `app.narravit.de`
- [ ] CAPTCHA wird in Supabase erst eingeschaltet, wenn der passende Code ausgeliefert ist

### IP-Ermittlung und Supabase-Limits
- [ ] Die Kunden-IP kommt aus `x-vercel-forwarded-for`, Fallback ist der erste Eintrag von `x-forwarded-for`, sonst ein gemeinsamer Bucket `unknown`. Vercel überschreibt diese Header, Clients können sie nicht fälschen
- [ ] Auth-Aufrufe laufen weiter mit dem öffentlichen Schlüssel, damit Supabase das CAPTCHA immer prüft
- [ ] Die Auth-Limits in Supabase sind angehoben, weil alle App-Anfragen von der Server-IP kommen (Werte in `docs/production/prod-umzug.md`)

### Fehlerverhalten
- [ ] Rate-Limit-Überschreitung führt zu einem verständlichen Fehler in der bestehenden `State`-Struktur der jeweiligen Action, immer in der Sie-Form:
  - Login: „Zu viele Versuche. Bitte warten Sie 15 Minuten oder setzen Sie Ihr Passwort zurück."
  - Reset/Resend: **gleich aussehende Erfolgsantwort wie bei einer legitimen Anfrage** (Schutz vor User-Enumeration), der Mailversand wird übersprungen
  - Registrierung: „Zu viele Registrierungsversuche. Bitte versuchen Sie es später erneut."
  - Checkout: „Zu viele Versuche. Bitte versuchen Sie es in einer Stunde erneut."
  - Einladung: „Für heute wurden zu viele Einladungen verschickt. Bitte versuchen Sie es morgen erneut."
- [ ] Der Rate-Limit-Check läuft **vor** jedem Supabase-Auth-Call
- [ ] Beim Limit-Hit wird ein strukturiertes Log-Event geschrieben (`rate_limit_hit`, Bereich, Hash), nie IP oder E-Mail im Klartext

### Dokumentation & Tests
- [ ] `src/lib/rate-limit.test.ts` (Vitest) prüft Limits, Fenster, getrennte Bereiche, Zurücksetzen und Verhalten bei Datenbankfehlern
- [ ] `tests/PROJ-17-rate-limiting.spec.ts` (Playwright): sechs fehlgeschlagene Logins in Folge, beim sechsten erscheint „Zu viele Versuche"
- [ ] Alle neuen Env-Variablen und Supabase-Einstellungen stehen in `docs/production/prod-umzug.md`

## Edge Cases
- **Proxy vor Vercel:** `x-forwarded-for` wäre dann nicht mehr verlässlich. Aktuell gibt es keinen. Bei einer späteren Cloudflare-Adoption muss die IP-Ermittlung angepasst werden.
- **Localhost-Dev ohne Proxy:** Alle Anfragen zählen auf `127.0.0.1`. Mit `RATE_LIMIT_DISABLED=true` lassen sich die Limits abschalten, in Production wird die Variable ignoriert.
- **Datenbank-Ausfall:** Anmeldung, Registrierung und Mail-Aktionen blockieren mit einer allgemeinen Fehlermeldung (fail-closed). Supabase Auth wäre dann ohnehin nicht verfügbar. Der Checkout läuft weiter (fail-open), damit ein kurzer Aussetzer keinen Kauf verhindert.
- **Legitimer Nutzer hinter geteilter IP** (Firmen-NAT, Mobilfunk): Beim Login zählen nur Fehlversuche, normale Anmeldungen belasten das Limit nicht.
- **Angreifer sperrt ein fremdes Konto** durch Fehlversuche: Das Limit pro Konto gilt nur für den Passwort-Login. Die betroffene Person kommt über „Passwort vergessen" oder Google/Facebook weiter hinein.
- **Doppelt eingereichte Forms:** Der Zähler springt um 2 statt 1. Akzeptiert, durch Submit-Disable im Frontend bereits reduziert.
- **Festes Zeitfenster:** An der Fenstergrenze sind kurz bis zu doppelt so viele Versuche möglich. Akzeptiert, weil die Limits niedrig sind und Turnstile zusätzlich schützt.
- **Geschenk- und Einlöse-Links:** Sie enthalten 256 Bit Zufall und brauchen kein eigenes Limit.

## Technical Requirements
- **Zähler:** Supabase (PostgreSQL), keine zusätzlichen Pakete für Redis
- **CAPTCHA:** Cloudflare Turnstile über die eingebaute CAPTCHA-Prüfung von Supabase Auth
- **Fail-Mode:** fail-closed für Auth und Mail-Aktionen, fail-open für den Checkout
- **Key-Namespacing:** getrennte Bereiche pro Aktion und Kennung
- **PII:** Kennungen nur als Hash mit geheimem Schlüssel, kurze Lebensdauer. Logs ohne Klartext-IP oder -Mail
- **Run-Reihenfolge in der Action:** Validate (Zod) → Rate-Limit-Check → Supabase-Call. Unfertige Formulare zählen nicht

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### A) Aufbau

```
Anmelde-Seiten (Anmelden, Registrieren, Passwort vergessen, Konto)
+-- bestehendes Formular
+-- Turnstile-Prüfung (neu, meist unsichtbar)
+-- Hinweis, wenn die Prüfung nicht lädt oder zu viele Versuche vorliegen

Server (Vercel)
+-- Kunden-IP ermitteln
+-- Zentrale Limit-Prüfung (neu)
|   +-- Login, Reset, Resend, Registrierung
|   +-- Checkout-Start, Einladungen
+-- Auth-Aufruf mit Prüf-Token

Supabase
+-- Zähler-Tabelle (neu, nur für den Server)
+-- Auth prüft das Turnstile-Token, auch beim direkten Aufruf
+-- Auth-Limits, für die gemeinsame Server-IP angehoben
```

### B) Was gespeichert wird

Jeder Zähler enthält:
- den Bereich, zum Beispiel „Login pro IP"
- eine Kennung als nicht rückrechenbaren Hash
- die Anzahl im aktuellen Zeitfenster
- den Zeitpunkt, an dem das Fenster endet

Gespeichert in Supabase, ohne Zugriff für angemeldete oder anonyme Nutzer. Abgelaufene Zähler löscht ein täglicher Datenbank-Job. Klartext-IPs oder E-Mail-Adressen werden nicht gespeichert.

### C) Die drei Schutzschichten

| Schicht | Schützt gegen | Warum sie nötig ist |
|---|---|---|
| **Turnstile** | Bots, auch auf dem direkten Weg zu Supabase | Einzige Schicht, die nicht an der App hängt |
| **Limits in der App** | Passwort-Raten, Mail-Bombing, Stripe- und Einladungs-Spam | Feine Regeln pro Konto, E-Mail und Projekt, verständliche Meldungen |
| **Angehobene Supabase-Limits** | Aussperren aller Kunden über die gemeinsame Server-IP | Bleiben als grobe Obergrenze bestehen, ohne echte Kunden zu blockieren |

### D) Entscheidungen

- **Supabase statt Upstash (Jakob):** Kein neuer Anbieter und Vertrag. Fällt die Datenbank aus, ist die Anmeldung ohnehin nicht möglich, es entsteht also kein zusätzlicher Ausfallpunkt.
- **Turnstile statt hCaptcha (Jakob):** Läuft meist unsichtbar, das passt zur älteren Zielgruppe. Supabase unterstützt es direkt.
- **Nur Fehlversuche zählen beim Login:** Tippfehler bleiben der Maßstab, normale Anmeldungen in einem Haushalt lösen nichts aus.
- **Checkout fail-open:** Ein Datenbank-Aussetzer soll keinen Verkauf kosten. Das Risiko ist klein, weil Stripe die Zahlung selbst absichert.

### E) Neue Abhängigkeiten

- `@marsidev/react-turnstile` — fertige Einbindung des Turnstile-Widgets in React

### F) Reihenfolge der Umstellung

Die Reihenfolge ist wichtig: Ist CAPTCHA in Supabase aktiv, bevor der Code das Token mitschickt, kann sich niemand mehr anmelden.

1. Migration für die Zähler auf Stage einspielen (Jakob). Muss vor dem Push laufen, weil Login und Registrierung ohne Zähler blockieren
2. Site Key in Vercel setzen (Jakob). Stage nutzt den öffentlichen Testschlüssel von Cloudflare
3. Code auf Stage ausliefern
4. Auth-Limits anheben und CAPTCHA in Supabase einschalten (Jakob)
5. `/qa` auf Stage
6. Beim Go-live dieselben Schritte für Production laut `docs/production/prod-umzug.md`, dort mit echten Turnstile-Schlüsseln

## Implementation Notes — 2026-11-22

- **Frontend:** `src/components/auth/TurnstileField.tsx` auf Anmelden, „Bestätigung erneut senden", Registrieren, Passwort vergessen und Passwort-Reset im persönlichen Bereich. Das Widget nimmt ohne Rückfrage keinen Platz ein, der Button bleibt gesperrt, bis ein Token da ist. Nach jeder Server-Antwort wird ein neues Token geholt.
- **Backend:** Migration `20261122110000_proj17_rate_limit.sql`, zentrales Modul `src/lib/rate-limit.ts`, Token-Helfer `src/lib/captcha.ts`. Abgesichert sind Login, Registrierung, beide Passwort-Resets, Resend, Checkout-Start und Einladungen.
- **Login:** Jeder Versuch wird vorab atomar gezählt und nur bei einem falschen Passwort stehen gelassen. Die IP wird zuerst geprüft, eine gesperrte IP erhöht also nicht den Zähler eines fremden Kontos.
- **Abweichungen vom Design:** keine IP-Weitergabe per Secret Key (siehe Hinweis oben), kein eigener `RATE_LIMIT_SECRET`, und die erfolgreiche Anmeldung löscht den IP-Zähler nicht.
- **E2E:** Die allgemeinen Suites laufen mit abgeschalteten Limits und dem Cloudflare-Testschlüssel. Die Limits prüft `E2E_RATE_LIMIT=1 npx playwright test tests/PROJ-17-rate-limiting.spec.ts --project=chromium`, das geht erst nach der Migration.

**Geprüft:** Unit-Tests, Typprüfung, Lint und Build. Echtes Turnstile-Widget in Chromium mit den Testschlüsseln von Cloudflare: Prüfung besteht, blockiert (Fehlerhinweis mit „Erneut versuchen") und sichtbare Rückfrage. Neues Token nach jeder Antwort, keine Layout-Verschiebung, kein Querscrollen bei 375 px.

**Auf der Stage-Datenbank geprüft (2026-11-22):** Migration eingespielt. Von 20 parallelen Versuchen bei Limit 5 kamen genau 5 durch, Zurücknehmen und Ablauf des Zeitfensters funktionieren. Der öffentliche Schlüssel darf weder lesen noch löschen noch die Funktionen aufrufen. Der sechste falsche Login im Browser wird gesperrt (`tests/PROJ-17-rate-limiting.spec.ts`).

**CAPTCHA auf Stage aktiv (2026-11-22):** Direkte Aufrufe von Login und Passwort-Reset ohne Token lehnt Supabase mit `captcha_failed` ab. Mit aktivem CAPTCHA laufen alle E2E-Suites (132 bestanden, 2 übersprungen) und der Limit-Test.

**Live auf `stage-app.narravit.de` (Jakob, 2026-11-22):** Anmeldung, Registrierung mit Bestätigungsmail und beide Passwort-Resets klappen mit aktivem CAPTCHA.

**Noch nicht geprüft:** Echte Turnstile-Schlüssel: Der Test-Secret auf Stage akzeptiert jedes Token, gefälschte Token werden erst mit dem echten Schlüssel in Production abgelehnt.

## QA Test Results

**Getestet:** 2026-11-22, Commit `75071d2`
**Umgebung:** lokaler Server gegen die Stage-Datenbank mit echten Limits und den Testschlüsseln von Cloudflare, dazu Live-Test von Jakob auf `stage-app.narravit.de`
**Tester:** QA Engineer (AI)

**Nicht abgedeckt:** Automatisch getestet wurde nur in Chromium, weil WebKit auf diesem Mac abstürzt und Firefox nicht installiert ist. Gefälschte Token lassen sich erst mit dem echten Schlüssel prüfen. Dass Vercel den IP-Header überschreibt, stammt aus der Vercel-Doku und wurde nicht auf Vercel selbst getestet.

### Automatische Tests
- [x] Unit-Tests: 590 bestanden
- [x] E2E: 132 bestanden, 2 übersprungen
- [x] Limit-E2E mit echten Zählern: bestanden
- [x] Typprüfung fehlerfrei, Lint ohne Fehler (2 Warnungen)

### Acceptance Criteria (22 von 24 bestanden, 2 offen bis zum Go-live)

#### Infrastruktur (5/5)
- [x] Tabelle mit RLS, ohne Policies, Zugriff nur über die Service-Role
- [x] Atomare Zählung: Von 20 parallelen Versuchen bei Limit 5 kamen genau 5 durch
- [x] Abgelaufene Zähler löscht der aktive Job `rate-limit-counters-cleanup`
- [x] IP und E-Mail liegen nur als HMAC-Hash vor
- [x] Zentrales Modul `src/lib/rate-limit.ts`

#### Limits (2/2)
- [x] Alle acht Limits sind umgesetzt und zählen getrennt
- [x] Erfolgreiche Anmeldung setzt den Kontozähler zurück und lässt frühere Fehlversuche der IP stehen

#### CAPTCHA (7/8, 1 offen)
- [x] Sitzt auf allen fünf Formularen, auch mit zwei Widgets auf `/anmelden?error=expired_link`
- [x] Läuft im Normalfall unsichtbar
- [x] Token geht an Supabase, der geheime Schlüssel kommt im Code nicht vor
- [x] Skript lädt nur auf den Seiten mit Formular
- [x] Lädt Turnstile nicht, erscheinen nach spätestens 10 Sekunden Hinweis und „Erneut versuchen" (BUG-2 behoben)
- [x] Google und Facebook funktionieren mit aktivem CAPTCHA (Handtest Jakob auf Stage)
- [ ] **Offen bis Go-live:** Stage nutzt Testschlüssel, Production braucht echte Schlüssel
- [x] CAPTCHA wurde erst nach dem Code-Deploy eingeschaltet

#### IP-Ermittlung und Supabase-Limits (2/3, 1 offen)
- [ ] **Offen:** Reihenfolge der Header ist im Code korrekt, das Überschreiben durch Vercel ist nicht selbst getestet
- [x] Auth-Aufrufe laufen mit dem öffentlichen Schlüssel
- [x] Supabase-Limits sind auf Stage angehoben

#### Fehlerverhalten (3/3)
- [x] Meldungen in Sie-Form, Reset und Resend antworten über dem Limit wie im Erfolgsfall
- [x] Limit-Prüfung läuft vor jedem Supabase-Aufruf
- [x] Log-Event `rate_limit_hit` enthält nur Bereich und gekürzten Hash

#### Dokumentation und Tests (3/3)
- [x] `src/lib/rate-limit.test.ts`
- [x] `tests/PROJ-17-rate-limiting.spec.ts`
- [x] Variablen und Einstellungen in `docs/production/prod-umzug.md`

### Security Audit
- [x] Direkter Weg an der App vorbei: `signup`, `otp`, `magiclink`, `recover`, `resend` und Passwort-Login lehnen Aufrufe ohne Token mit `captcha_failed` ab
- [x] Anonyme Konten sind ausgeschaltet
- [x] Öffentlicher Schlüssel kann die Zähler weder lesen noch löschen noch die Funktionen aufrufen
- [x] Parallele Anfragen umgehen das Limit nicht
- [x] `get_my_project_ids` liefert ohne Anmeldung 0 Zeilen (Advisor-Warnung ohne Auswirkung)
- [x] Fremde Adressen lassen sich ohne gültiges CAPTCHA nicht mehr sperren (BUG-1 behoben)

### Bugs

#### BUG-1: Reset- und Bestätigungsmails fremder Konten lassen sich ohne CAPTCHA sperren
- **Status:** Behoben 2026-11-22. Ein CAPTCHA-Fehler nimmt den Zähler der Adresse zurück. Der Zähler der IP bleibt stehen und bremst massenhafte Versuche.
- **Severity:** High
- **Ursache:** Reset und Resend zählen den E-Mail-Zähler vor der CAPTCHA-Prüfung und nehmen ihn bei `captcha_failed` nicht zurück.
- **Reproduktion:**
  1. Drei Anfragen ohne Token für eine fremde Adresse senden, alle von derselben IP. Jede endet mit dem CAPTCHA-Fehler.
  2. Die betroffene Person fordert von einer anderen IP einen Link an.
  3. Erwartet: Die Mail wird verschickt.
  4. Tatsächlich: Die Seite meldet „E-Mail unterwegs", es geht aber keine Mail raus. Eine Kontrolladresse war nicht betroffen.
- **Folge:** Mit drei Anfragen pro Stunde kann jemand ohne jede Lösung des CAPTCHAs die Passwort-Wiederherstellung eines Kontos dauerhaft blockieren, und die Person erfährt es nicht.
- **Restrisiko nach dem Fix:** Wer gültige Token löst, kann das Limit pro Adresse weiter ausschöpfen. Das ist dann nur noch mit CAPTCHA möglich und schickt dem Opfer drei echte Mails.
- **Priorität:** Vor dem Go-live

#### BUG-2: Ohne Turnstile bleibt die Anmeldung dauerhaft gesperrt, ohne Erklärung
- **Status:** Behoben 2026-11-22. Nach 10 Sekunden ohne Ergebnis erscheinen Hinweis und „Erneut versuchen". Der Retry lädt das Skript neu, Eingaben bleiben stehen. Nicht unterstützte Browser bekommen einen eigenen Hinweis.
- **Severity:** High
- **Reproduktion:**
  1. `challenges.cloudflare.com` blockieren (Content-Blocker, Firmennetz) oder einen von Turnstile nicht unterstützten Browser nutzen.
  2. `/anmelden` öffnen und warten.
  3. Erwartet: Verständlicher Hinweis mit „Erneut versuchen".
  4. Tatsächlich: Der Button bleibt gesperrt, „Sicherheitsprüfung läuft …" steht unbegrenzt da, es gibt keinen Hinweis und keinen Retry.
- **Folge:** Trifft alle fünf Formulare. Gerade ältere Geräte der Zielgruppe wären ohne Erklärung ausgesperrt.
- **Priorität:** Vor dem Go-live

#### BUG-3: Sichtbare Rückfrage sprengt das Formular auf schmalen Handys
- **Status:** Behoben 2026-11-22. Unter 450 px nutzt das Widget die kompakte Größe (150 × 140 px). Geprüft bei 320 und 375 px.
- **Severity:** Medium
- **Reproduktion:** Rückfrage (Testschlüssel `3x…FF`) bei 320 px öffnen.
- **Tatsächlich:** Das Widget braucht mindestens 300 px und zieht das ganze Formular mit. Felder und Buttons laufen rechts über die Karte, unter etwa 348 px auch über den Bildschirmrand. Bei 375 px schrumpft der rechte Innenabstand sichtbar. Die Checkbox bleibt klickbar.
- **Priorität:** Vor dem Go-live

#### BUG-4: Technische Fehler beim Login erscheinen als „E-Mail oder Passwort falsch"
- **Status:** Behoben 2026-11-22. Unbestätigte Adresse: „Bitte bestätigen Sie zuerst Ihre E-Mail." Technischer Fehler: „Das hat gerade nicht geklappt. Bitte versuchen Sie es in einigen Minuten erneut." Beides ist nur per Unit-Test geprüft.
- **Entscheidung (Jakob, 2026-11-22):** Der Login darf nennen, ob eine Adresse ein Konto hat, das ersetzt die Regel aus PROJ-2. Meldungen: „Zu dieser E-Mail gibt es noch kein Konto." und „Das Passwort stimmt leider nicht." Die Prüfung läuft über `account_exists` (Migration `20261122120000`, nur Service-Role, liest `auth.users`), erst nach bestandenem CAPTCHA und innerhalb des Login-Limits. Schlägt sie fehl, bleibt es bei „E-Mail oder Passwort falsch." Reset und Resend bleiben neutral.
- **Severity:** Medium (vorbestehend, aus dem Code belegt)
- **Tatsächlich:** Überlast, Ausfall und eine noch nicht bestätigte E-Mail zeigen dieselbe Meldung wie ein falsches Passwort. Wer das richtige Passwort eingibt, sucht den Fehler dann an der falschen Stelle.
- **Priorität:** Vor dem Go-live empfohlen

#### BUG-5: E-Mail-Feld wird nach jedem fehlgeschlagenen Login geleert
- **Status:** Behoben 2026-11-22. Die Adresse bleibt stehen, das Passwort wird geleert.
- **Korrektur:** Der erste Fix (`fdafb43`, gesteuertes Feld) löschte Text, der vor dem Laden des JavaScripts getippt oder vom Passwort-Manager eingetragen wurde. Jetzt bleibt das Feld ungesteuert, die Action gibt die Adresse zurück (`src/lib/form-values.ts`).
- **Severity:** Medium (vorbestehend)
- **Tatsächlich:** React setzt das Formular nach der Action zurück. Die Person muss die Adresse bei jedem Versuch neu eintippen.
- **Priorität:** Vor dem Go-live empfohlen

#### BUG-6: CAPTCHA-Fehler verbrauchen Versuche bei Registrierung und Konto-Reset
- **Status:** Behoben 2026-11-22. Im Test blieben elf CAPTCHA-Fehler in Folge ohne Sperre.
- **Severity:** Low
- **Tatsächlich:** Zehn CAPTCHA-Fehler sperren die Registrierung dieser IP für eine Stunde (im Test belegt). Beim Passwort-Reset im Konto zählen drei Fehler auf dieselbe Weise (aus dem Code belegt).
- **Priorität:** Zusammen mit BUG-1 beheben

#### BUG-7: Login-Zähler bleiben nach einem Passwort-Reset stehen
- **Severity:** Low (aus dem Code belegt)
- **Tatsächlich:** Der Reset meldet die Person direkt an. Meldet sie sich danach ab, kann die nächste Anmeldung mit dem neuen Passwort noch bis zu einer Stunde gesperrt sein.
- **Priorität:** Nice to have

#### BUG-8: Registrierung verrät, ob eine Adresse schon ein Konto hat
- **Status:** Akzeptiert mit der Entscheidung zu BUG-4 (2026-11-22). Auch der Login nennt das jetzt bewusst.
- **Severity:** Low (vorbestehend)
- **Tatsächlich:** Die Meldung „bereits registriert" bestätigt bestehende Adressen. CAPTCHA und 10 Versuche pro Stunde bremsen das Abfragen, verhindern es aber nicht.
- **Priorität:** Produktentscheidung

#### BUG-9: Prüfung auf geleakte Passwörter ist ausgeschaltet
- **Severity:** Low (Supabase-Advisor)
- **Tatsächlich:** Supabase prüft neue Passwörter nicht gegen bekannte Datenlecks. Die Einstellung liegt im Supabase-Dashboard. Die Registrierung braucht dafür eine eigene Meldung, sonst steht dort nur „Registrierung fehlgeschlagen".
- **Priorität:** Vor dem Go-live empfohlen

#### BUG-10: Registrierung und „Passwort vergessen" leeren die Felder nach einem Fehler
- **Status:** Behoben 2026-11-22, auch für „Bestätigung erneut senden". Name und Adresse bleiben stehen, Passwörter nie. Im Browser geprüft, auch mit Text, der vor dem Laden der Seite getippt wurde.
- **Severity:** Medium (vorbestehend, beim Nachtest von BUG-5 gefunden)
- **Reproduktion:** Registrierung mit zwei verschiedenen Passwörtern absenden, oder „Passwort vergessen" mit fehlgeschlagener Sicherheitsprüfung.
- **Tatsächlich:** Name und E-Mail (Registrierung) sowie die E-Mail (Passwort vergessen) sind danach leer.
- **Priorität:** Vor dem Go-live empfohlen

### Nachtest nach den Fixes (2026-11-22, lokal gegen Stage)
- [x] Unit-Tests: 620 bestanden. Typprüfung, Lint und Production-Build fehlerfrei
- [x] E2E in Chromium: 134 bestanden, 2 übersprungen. Limit-E2E bestanden
- [x] Login nennt im Browser „noch kein Konto" und „Passwort stimmt nicht"
- [x] `account_exists` auf Stage eingespielt: nur `service_role` darf sie aufrufen, der öffentliche Schlüssel bekommt 401, keine neuen Security-Advisor-Hinweise
- [x] Drei Anfragen ohne Token sperren eine fremde Adresse nicht mehr (Reset und Resend)
- [x] Blockiertes Skript: Hinweis und Retry erscheinen, nach dem Retry ist das Formular frei, auch mit zwei Widgets auf einer Seite
- [x] Sichtbare Rückfrage bleibt bei 320 und 375 px im Formular

**Nicht abgedeckt:** Mobile Safari startet auf diesem Mac nicht (71 Fehlschläge beim Browserstart, kein Testergebnis). Die Fixes laufen seit Commit `fdafb43` auf `stage-app.narravit.de` (Deployment READY). Jakob hat dort beide Login-Meldungen, die stehen bleibende E-Mail, Google und Facebook geprüft: alles klappt.

### Summary
- **Acceptance Criteria:** 22 von 24 bestanden, 2 offen bis zum Go-live (echter Schlüssel, IP-Header auf Vercel)
- **Bugs:** 10 gefunden, 7 behoben, BUG-8 akzeptiert. Offen: BUG-7, BUG-9 (Low)
- **Security:** Keine offenen Critical- oder High-Befunde
- **Production Ready:** JA für den Code. Die zwei offenen Punkte lassen sich erst auf Production prüfen und stehen in `docs/production/prod-umzug.md`
- **Empfehlung:** Beim Go-live `/deploy` entlang der Checkliste

## Deployment
_To be added by /deploy_
