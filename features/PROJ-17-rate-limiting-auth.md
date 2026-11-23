# PROJ-17: Rate-Limiting für Auth-Endpunkte

> **Kurzfassung (PROJ-31).** Das vollständige Tech Design, Bau-Notizen, QA-Protokolle und der Deployment-Verlauf stehen unverändert im [Archiv](archive/PROJ-17-rate-limiting-auth.md).

## Status: Approved
**Created:** 2026-05-16
**Last Updated:** 2026-11-22 (QA bestanden, Handtest auf Stage bestätigt; BUG-10 und die Korrektur von BUG-5 seit `a4684dc` auf Stage, von Jakob bestätigt)
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

## Technische Entscheidungen
_Kurzform. Die vollständige Begründung steht im Archiv._

### D) Entscheidungen

- **Supabase statt Upstash (Jakob):** Kein neuer Anbieter und Vertrag. Fällt die Datenbank aus, ist die Anmeldung ohnehin nicht möglich, es entsteht also kein zusätzlicher Ausfallpunkt.
- **Turnstile statt hCaptcha (Jakob):** Läuft meist unsichtbar, das passt zur älteren Zielgruppe. Supabase unterstützt es direkt.
- **Nur Fehlversuche zählen beim Login:** Tippfehler bleiben der Maßstab, normale Anmeldungen in einem Haushalt lösen nichts aus.
- **Checkout fail-open:** Ein Datenbank-Aussetzer soll keinen Verkauf kosten. Das Risiko ist klein, weil Stripe die Zahlung selbst absichert.

### Spätere Entscheidungen
- **Login-Meldungen (Jakob, 2026-11-22):** Der Login darf nennen, ob eine Adresse ein Konto hat, das ersetzt die Regel aus PROJ-2. Meldungen: „Zu dieser E-Mail gibt es noch kein Konto.“ und „Das Passwort stimmt leider nicht.“ Die Prüfung läuft über `account_exists` (nur Service-Role), erst nach bestandenem CAPTCHA und innerhalb des Login-Limits. Schlägt sie fehl, bleibt es bei „E-Mail oder Passwort falsch.“ Reset und Resend bleiben neutral.

## Offene Punkte
- Offen bis Go-live: Stage nutzt Turnstile-Testschlüssel, Production braucht echte Schlüssel.
- Offen bis Go-live: Das Überschreiben des IP-Headers durch Vercel ist nicht selbst getestet. Die Reihenfolge der Header ist im Code korrekt.
- BUG-7 (Low): Login-Zähler bleiben nach einem Passwort-Reset stehen. Nach dem Abmelden kann die nächste Anmeldung bis zu einer Stunde gesperrt sein.
- BUG-9 (Low, vor dem Go-live empfohlen): Die Prüfung auf geleakte Passwörter ist im Supabase-Dashboard aus. Die Registrierung braucht dafür eine eigene Meldung.
- BUG-8 (Low, akzeptiert am 2026-11-22): Die Registrierung verrät, ob eine Adresse schon ein Konto hat. CAPTCHA und 10 Versuche pro Stunde bremsen das Abfragen.
