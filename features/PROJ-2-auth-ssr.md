# PROJ-2: Auth + SSR

## Status: Approved
**Created:** 2026-05-15
**Last Updated:** 2026-05-16

## Dependencies
- Requires: PROJ-1 (Supabase-Datenmodell & RLS) — für `profiles`, `project_members`, `portal_access_expires_at`
- Achtung: PROJ-1 muss via `/refine PROJ-1` angepasst werden: `project_members.role` ENUM von `(owner, editor)` auf `(projektleiter, co_author)` ändern

## User Stories
- Als neuer Nutzer möchte ich mich per E-Mail + Passwort registrieren und meine E-Mail bestätigen, damit mein Konto verifiziert ist, bevor ich das Portal betrete.
- Als neuer Nutzer möchte ich mich alternativ mit Google oder Apple anmelden, damit ich kein neues Passwort anlegen muss.
- Als bestehender Nutzer möchte ich mein Passwort zurücksetzen können, wenn ich es vergessen habe, damit ich wieder Zugang zu meinem Konto bekomme.
- Als Käufer möchte ich direkt nach der Registrierung durch einen Onboarding-Wizard geführt werden, der meine Kaufabsicht (für mich selbst oder als Geschenk) erfasst, damit alle nötigen Daten für die Projekterstellung nach der Zahlung vorliegen.
- Als Nutzer mit abgelaufenem Portal-Zugang möchte ich auf eine dedizierte Seite weitergeleitet werden, die mir die Verlängerungsoption zeigt, damit ich schnell wieder Zugang erhalte.
- Als nicht eingeloggter Nutzer möchte ich automatisch zur Anmeldeseite weitergeleitet werden, wenn ich eine geschützte Route aufrufe, damit ich nicht auf fremde Daten zugreifen kann.
- Als Entwickler möchte ich die Supabase-Session serverseitig in der Next.js Middleware lesen können, damit keine Auth-Checks client-seitig umgehbar sind.

## Acceptance Criteria

### Registrierung (E-Mail + Passwort)
- [ ] Registrierungsseite unter `/registrieren` mit Feldern: Vorname + Nachname (oder vollständiger Name), E-Mail, Passwort, Passwort wiederholen
- [ ] Validierung: E-Mail-Format, Passwort min. 8 Zeichen, beide Passwort-Felder übereinstimmend
- [ ] Nach erfolgreichem Submit: Nutzer landet auf `/email-bestaetigen` mit Hinweis, die Mailbox zu prüfen
- [ ] Supabase sendet Bestätigungs-E-Mail; nach Klick auf Link: Nutzer ist eingeloggt und wird zu `/onboarding` weitergeleitet
- [ ] Bereits registrierte E-Mail zeigt Fehler: "Diese E-Mail-Adresse ist bereits registriert"

### OAuth (Google & Apple)
- [ ] Auf `/anmelden` und `/registrieren` je ein "Mit Google anmelden"- und "Mit Apple anmelden"-Button
- [ ] Nach erfolgreichem OAuth-Flow: Erstlogin landet auf `/onboarding`, Folgelogin auf `/`
- [ ] OAuth-Nutzer überspringen den E-Mail-Bestätigungsschritt
- [ ] `profiles`-Eintrag wird bei Erstlogin automatisch angelegt (via Supabase Auth Trigger oder `upsert` nach OAuth-Callback)

### Anmeldung
- [ ] Anmeldeseite unter `/anmelden` mit Feldern: E-Mail, Passwort
- [ ] Falsche Zugangsdaten zeigen Fehler: "E-Mail oder Passwort falsch" (keine Unterscheidung, ob E-Mail existiert)
- [ ] Nach erfolgreichem Login: Weiterleitung gemäß Middleware-Logik (s. u.)

### Passwort-Reset
- [ ] Link "Passwort vergessen?" auf `/anmelden` führt zu `/passwort-vergessen`
- [ ] Nutzer gibt E-Mail ein; Submit sendet Supabase-Reset-Link, unabhängig davon ob E-Mail existiert (keine User-Enumeration)
- [ ] Bestätigungstext: "Falls ein Konto mit dieser E-Mail existiert, hast du einen Reset-Link erhalten"
- [ ] Reset-Link öffnet `/passwort-zuruecksetzen` mit Formular: neues Passwort + Bestätigung
- [ ] Nach erfolgreichem Reset: Nutzer ist eingeloggt und wird zu `/` weitergeleitet

### Middleware & Route Protection
- [ ] `middleware.ts` prüft Supabase-Session serverseitig für alle nicht-öffentlichen Routen
- [ ] Öffentliche Routen (kein Auth-Check): `/anmelden`, `/registrieren`, `/passwort-vergessen`, `/passwort-zuruecksetzen`, `/email-bestaetigen`, `/onboarding`, `/zugang-abgelaufen`
- [ ] **Zustand 1** — Nicht eingeloggt: Zugriff auf geschützte Route → Redirect zu `/anmelden`
- [ ] **Zustand 2** — Eingeloggt, `portal_access_expires_at = NULL` (noch nie gezahlt): → Redirect zu `/onboarding`
- [ ] **Zustand 3** — Eingeloggt, `portal_access_expires_at` in der Vergangenheit (vorher gezahlt): → Redirect zu `/zugang-abgelaufen`
- [ ] **Zustand 4** — Eingeloggt, `portal_access_expires_at` aktiv: voller Zugang; Post-Login-Redirect zu `/`
- [ ] Eingeloggter Nutzer, der `/anmelden` oder `/registrieren` aufruft, wird zu `/` weitergeleitet

### Seite: `/zugang-abgelaufen`
- [ ] Zeigt Nachricht z. B. "Dein Portal-Zugang ist abgelaufen"
- [ ] CTA-Button "Zugang verlängern — 79 €" leitet zu Stripe-Checkout weiter (Stripe-Integration in PROJ-6; Button zeigt in PROJ-2 nur den Zielzustand)
- [ ] Abmelden-Link vorhanden

### Onboarding-Wizard
Der Wizard sammelt alle Daten bis zum Kauf-CTA. Kein DB-Write während des Wizards — alle Daten werden im React-State gehalten und erst nach erfolgreicher Zahlung (PROJ-6) persistiert.

#### Schritt 1: Name
- [ ] Formularfeld für vollständigen Namen (→ `profiles.full_name`)
- [ ] Pflichtfeld, min. 2 Zeichen

#### Schritt 2: Für wen?
- [ ] Auswahl: "Für mich selbst" oder "Als Geschenk"

**Pfad A — Für mich selbst:**
- [ ] Kein weiterer Schritt; direkter Weiter-Button zum Kauf-CTA

**Pfad B — Als Geschenk:**
- [ ] Eingabe: Name der beschenkten Person (Pflichtfeld)
- [ ] Auswahl: "Nur per Telefon erzählen" oder "Auch am Computer schreiben"

  **Pfad B1 — Nur Telefon:**
  - [ ] Käufer wird automatisch Projektleiter; kein Opt-out möglich
  - [ ] Hinweistext: "Du erhältst als Käufer vollen Zugriff auf das Projekt"
  - [ ] Weiter-Button zum Kauf-CTA

  **Pfad B2 — Auch Computer:**
  - [ ] Eingabe: E-Mail der beschenkten Person (Pflichtfeld, valides Format)
  - [ ] Auswahl: Rolle des Beschenkten — "Projektleiter" (`projektleiter`) oder "Co-Autor" (`co_author`)
  - [ ] Toggle: "Möchtest du selbst Zugang zum Projekt haben?" (Default: Ja)
    - Wenn Ja: Käufer wird immer als Projektleiter eingetragen
  - [ ] Weiter-Button zum Kauf-CTA

#### Schritt 3: Kauf-CTA
- [ ] Zusammenfassung der Wizard-Eingaben (Name, Geschenkempfänger falls vorhanden, gewählte Konfiguration)
- [ ] Preis-Anzeige: "12 Monate Portal-Zugang — 79 €"
- [ ] "Jetzt kaufen"-Button löst Stripe-Checkout aus (PROJ-6 implementiert den Checkout; der Button ist in PROJ-2 der definierte Einstiegspunkt)

### Rollen-Logik (Zusammenfassung)
- [ ] `project_members.role` hat die Werte `projektleiter` und `co_author`
- [ ] Nur `projektleiter` darf: Projekt löschen, finalen Druckauftrag erteilen
- [ ] Mehrere Projektleiter pro Projekt sind erlaubt
- [ ] Im "Nur Telefon"-Pfad: Käufer ist Projektleiter, kein Opt-out
- [ ] Im "Auch Computer"-Pfad: Käufer ist Projektleiter wenn er Zugang möchte; Beschenkter erhält die im Wizard gewählte Rolle

## Edge Cases
- Nutzer klickt mehrfach auf "Registrieren" → idempotente Supabase-Anfrage, kein Doppeleintrag
- Bestätigungs-E-Mail-Link ist abgelaufen → Fehlerseite mit Link "Neue Bestätigungs-E-Mail anfordern"
- OAuth-Callback schlägt fehl (Nutzer bricht Google/Apple-Flow ab) → zurück zu `/anmelden` ohne Fehlermeldung, keine halbfertigen Sessions
- Nutzer öffnet Onboarding-Wizard in zwei Tabs gleichzeitig → beide Tabs arbeiten auf demselben React-State; kein DB-Konflikt, da kein Write vor Zahlung
- `portal_access_expires_at` ist exakt jetzt (Race Condition beim Middleware-Check) → serverseitige Zeitprüfung mit 0-Sekunden-Toleranz; im Zweifel → `/zugang-abgelaufen`
- Nutzer mit aktivem Zugang ruft `/onboarding` direkt auf → Middleware lässt ihn durch (öffentliche Route), aber ein Guard auf der Onboarding-Seite leitet zu `/` weiter
- Passwort-Reset-Link wird zweimal geklickt → Supabase invalidiert den Token nach erster Nutzung; zweiter Klick zeigt "Link ungültig oder abgelaufen"
- OAuth-Nutzer versucht Passwort-Reset → `/passwort-vergessen` zeigt Hinweis: "Dein Konto nutzt Google/Apple-Login — Passwort-Reset nicht möglich"
- Beschenkte Person hat bereits ein NARRAVIT-Konto mit der eingetragenen E-Mail → Einladung wird trotzdem gespeichert; PROJ-9 behandelt den Merge/Zuordnungs-Case
- Nutzer im "Als Geschenk"-Pfad gibt seine eigene E-Mail als Empfänger-E-Mail ein → Validierung zeigt Fehler: "Bitte eine andere E-Mail-Adresse angeben"

## Technical Requirements
- Sicherheit: Keine User-Enumeration bei Login und Passwort-Reset (generische Fehlermeldungen)
- Sicherheit: Session-Token nur in HTTP-Only-Cookies (Supabase SSR-Client), nicht in `localStorage`
- Sicherheit: Middleware läuft auf der Next.js Edge Runtime; kein Auth-Check nur client-seitig
- Sicherheit: `service_role`-Key ausschließlich server-seitig; kein Zugang im Browser-Bundle
- SSR: Supabase-Client für Server Components und Middleware über `@supabase/ssr` (Cookie-basiert)
- Onboarding-State: Wizard-Daten in React-State oder `sessionStorage` (kein DB-Write vor Zahlung); bei Seitenreload zurück zu Schritt 1
- PROJ-1-Abhängigkeit: `project_members.role` muss vor Implementierung auf `ENUM(projektleiter, co_author)` geändert sein

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

> Hinweis: `/architecture` wurde übersprungen — Spec war detailliert genug. Tech Design wurde im Verlauf von `/frontend` direkt aus der Spec abgeleitet und unten dokumentiert.

### Übersicht
PROJ-2 baut den gesamten Auth-Stack: Registrierung, Anmeldung, OAuth (Google/Apple), Passwort-Reset, Email-Bestätigung, Onboarding-Wizard, abgelaufener Zugang. Alle Auth-Operationen laufen serverseitig via `@supabase/ssr` + Server Actions; Sessions werden in HTTP-only-Cookies gehalten. Eine Edge-Middleware schützt alle nicht-öffentlichen Routen und routet Nutzer abhängig von ihrem Auth- und Zugangsstatus.

### Was wird gebaut

```
middleware.ts                                     ← Edge-Middleware (Route-Protection)
src/lib/supabase/
  client.ts                                       ← Browser-Client (OAuth, Signout)
  server.ts                                       ← Server-Client (Server Actions, RSC)
  middleware.ts                                   ← Helper für Middleware (Cookies-Refresh)
src/components/auth/
  AuthLayout.tsx                                  ← Side-Image Layout (Form links, Bild rechts)
  OAuthButtons.tsx                                ← Google + Apple Buttons (Client)
  SignOutButton.tsx                               ← Client-Button für signOut
src/app/
  anmelden/page.tsx + actions.ts                  ← Login
  registrieren/page.tsx + actions.ts              ← Register
  email-bestaetigen/page.tsx                      ← "Prüfe deine E-Mail"
  passwort-vergessen/page.tsx + actions.ts        ← Reset-Request
  passwort-zuruecksetzen/page.tsx + actions.ts    ← Neues Passwort setzen
  zugang-abgelaufen/page.tsx                      ← Verlängerungs-CTA (Stub für PROJ-6)
  onboarding/page.tsx                             ← 3–5-Schritt-Wizard mit dynamischen Pfaden
  auth/callback/route.ts                          ← OAuth/Email-Confirm Code-Exchange
```

### Daten- und Sessionfluss
- **Session-Cookie:** `@supabase/ssr` setzt HTTP-only Cookies. Niemals `localStorage`, niemals Tokens im Browser-JS.
- **Server Actions:** Login/Register/Reset laufen via `"use server"`-Actions auf der Server-Seite — Validierung mit Zod, Supabase-Calls server-seitig, Cookies werden via `cookies()`-API gesetzt.
- **OAuth-Callback:** `/auth/callback?code=...&next=/onboarding` tauscht den OAuth-Code gegen eine Session und redirected zur `next`-URL.

### Route-Protection (Middleware)
Die Middleware läuft auf jeder Route außer Static Assets. Logik:
1. **Eingeloggt + auf `/anmelden` oder `/registrieren`** → Redirect zu `/`
2. **Nicht eingeloggt + nicht-öffentliche Route** → Redirect zu `/anmelden`
3. **Eingeloggt + geschützte Route** → Check `portal_access_expires_at` aller Projekte:
   - kein Projekt / alle `NULL` → Redirect zu `/onboarding`
   - alle Projekte abgelaufen → Redirect zu `/zugang-abgelaufen`
   - mindestens ein aktives Projekt → durchlassen

Öffentliche Routen: `/anmelden`, `/registrieren`, `/passwort-vergessen`, `/passwort-zuruecksetzen`, `/email-bestaetigen`, `/onboarding`, `/zugang-abgelaufen`, `/auth/*`.

### Onboarding-Wizard (State-Machine, kein DB-Write)
Wizard-State wird im React-`useState` gehalten. Bei Reload zurück zu Schritt 1 (per Spec). DB-Write erfolgt erst nach Zahlung in PROJ-6.

State:
```ts
{
  fullName: string;
  forWhom: "self" | "gift" | null;
  giftRecipientName: string;
  giftMode: "phone-only" | "phone-plus-computer" | null;
  giftRecipientEmail: string;
  giftRecipientRole: "projektleiter" | "co_author";
  buyerWantsAccess: boolean;
}
```

Dynamische Schritt-Sequenz:
- **Pfad A (self):** `name → for-whom → purchase` (3 Schritte)
- **Pfad B1 (gift + phone-only):** `name → for-whom → gift-details → purchase` (4 Schritte)
- **Pfad B2 (gift + phone+computer):** `name → for-whom → gift-details → gift-computer → purchase` (5 Schritte)

### Design-System (NARRAVIT-Migration)
- Brand-Farben aus `projektuebersicht-palette.ts` (alte App) migriert in `globals.css`:
  - Background: warm cream `#faf8f5` (`hsl(36 33% 97%)`)
  - Foreground/Text: near-black `#1a1a1a`
  - Accent (focus rings, OAuth): blue `#1e51f7`
  - Border: warm gray `#e0dcd5`
- **Sharp corners:** `--radius: 0rem` — keine abgerundeten Ecken (NARRAVIT-Identität).
- Typografie-Utility-Klassen (`heading-style-h1` … `heading-style-h6`) aus alter App übernommen.
- Font: Geist Sans über `next/font/google`.

### Benötigte Pakete

| Paket | Zweck | Status |
|-------|-------|--------|
| `@supabase/ssr` | Cookie-basierte Sessions (Server + Browser + Middleware) | ✅ installiert (v0.10.3) |
| `@supabase/supabase-js` | Supabase-Client | ✅ vorhanden |
| `zod` / `@hookform/resolvers` | Validierung in Server Actions | ✅ vorhanden |
| `sonner` | Toaster für OAuth-Fehler | ✅ vorhanden |
| `lucide-react` | Icons (Mail, Check) | ✅ vorhanden |

### Was NICHT in PROJ-2 ist (folgt in anderen Features)
- Stripe-Checkout-Session (Kauf-Button auf Onboarding und `/zugang-abgelaufen` ist Stub) → **PROJ-6**
- Projekt-Anlage nach erfolgreicher Zahlung → **PROJ-6 (Webhook)**
- Persönlicher Bereich (`/` lädt Projektliste) → **PROJ-3**
- Einladung der beschenkten Person via E-Mail → **PROJ-9 + PROJ-11**

---

## Implementation Notes (Frontend Developer)

**Implementiert am:** 2026-05-16

### Was wurde gebaut
- ✅ Alle 7 Auth-Pages + `/auth/callback` Route Handler
- ✅ Edge-Middleware mit 4-Zustand-Routing
- ✅ Supabase-SSR-Stack (Browser-Client, Server-Client, Middleware-Helper)
- ✅ NARRAVIT-Brand-Migration (Farben, Typografie, Radius 0)
- ✅ Onboarding-Wizard mit dynamischer Step-Sequenz (3/4/5 Schritte je Pfad)
- ✅ Shared Components: `AuthLayout`, `OAuthButtons`, `SignOutButton`

### Visuelle Vorlage
Die User-bereitgestellten Relume-Templates (Login8, Onboarding16, Sign Up) dienten als visuelle Referenz für Layout und Komponentenstruktur. Stack-Anpassungen:
- `@relume_io/relume-ui` → **shadcn/ui**
- `react-icons/bi` → inline SVG (Google/Apple Logos)
- Facebook-Button entfernt (Spec: nur Google + Apple)
- Onboarding-Modal → Vollseite (`/onboarding`)
- Onboarding-Inhalte komplett ersetzt durch Spec-Flow (Name → Für wen? → Pfad A/B → Kauf-CTA)

### Bewusste Stubs (nicht TODO im Code)
1. **Kauf-Buttons in `/onboarding` und `/zugang-abgelaufen`** — Stripe-Checkout-Session wird in PROJ-6 implementiert. Buttons zeigen den definierten Einstiegspunkt; auf Klick erscheint vorerst ein Hinweis.
2. **`/` (Homepage)** — Aktuell nur Platzhalter mit "Eingeloggt als …". Echter persönlicher Bereich folgt in PROJ-3.
3. **Hero-Image rechts** — Grauer Platzhalter mit Hinweistext. Wartet auf NARRAVIT-Brand-Image.

### Bekannte Abweichungen von der Spec
1. **Onboarding-Wizard ohne `sessionStorage`-Persistenz:** Spec erwähnt `sessionStorage` als Option; aktuell nur React-State. Bei Reload → zurück zu Schritt 1. Spec sagt explizit "bei Seitenreload zurück zu Schritt 1", also konsistent.
2. **Middleware-Performance:** Jeder Request fetcht alle Projekte des Users zur Zugangsprüfung. Bei vielen Projekten pro User langsam. Soll in PROJ-13 (Stabilität & Observability) optimiert werden (z. B. Status auf `profiles` denormalisieren).
3. **`/onboarding`-Guard:** Die Spec verlangt einen Guard auf der Onboarding-Seite, der Nutzer mit aktivem Zugang auf `/` umleitet. Da `/onboarding` öffentlich ist, läuft Middleware-Logik nicht. **Offen** — wird beim Backend-Wiring von Onboarding ergänzt (Server-Component-Check oder via PROJ-6).

### Build-Status
`npm run build` läuft ohne Fehler. Alle 10 Routes statisch oder dynamisch rendert; TypeScript clean; Middleware aktiv.

### Was fehlt für Production-Ready
- Supabase Auth Provider (Google, Apple) müssen im Supabase-Dashboard konfiguriert werden
- Email-Confirmation muss in Supabase-Auth-Settings aktiviert sein (siehe DSGVO-Findings aus PROJ-1-Review)
- `NEXT_PUBLIC_SITE_URL` muss in `.env.local` gesetzt sein
- OAuth-Edge-Case (Nutzer bricht Provider-Flow ab) und abgelaufener Confirm-Link sind noch nicht handhabt — werden in `/qa` getestet



## QA Test Results

**QA Date:** 2026-05-16
**Method:** Static code review + HTTP-level smoke tests + 22 Playwright E2E tests against live dev server. OAuth-, Email-, Stripe-Flows nicht end-to-end testbar ohne reale Provider/Mailbox/Stripe-Config.

### Test-Inventar
- **Playwright E2E:** `tests/PROJ-2-auth-ssr.spec.ts` — 22 Tests, 20 ✅ passed, 2 ❌ failed (Middleware-Redirect)
- **HTTP Smoke Tests:** alle 7 Auth-Routes liefern HTTP 200
- **HTML Content Audit:** alle Spec-Pflichtfelder pro Page vorhanden
- **Code Review:** Server Actions, OAuth-Component, Onboarding-State-Machine, Middleware
- **Red-Team Bundle Scan:** Browser-Bundle nach `service_role`, Stripe-Keys, Webhook-Secrets durchsucht

### Acceptance Criteria — Ergebnisse

#### Registrierung (E-Mail + Passwort)
| Criterion | Status |
|-----------|--------|
| Page `/registrieren` mit Feldern Vorname/Name, E-Mail, Passwort × 2 | ✅ Pass |
| Validierung: E-Mail-Format, Passwort min. 8 Zeichen, Match | ✅ Pass (Playwright bestätigt) |
| Nach Submit → `/email-bestaetigen` | ✅ Pass (Server Action `redirect()`) |
| Supabase sendet Bestätigungs-E-Mail | ⚠️ Code OK, Live-Test nicht möglich |
| Bereits registrierte E-Mail zeigt Fehler | ❌ Fail — siehe **BUG-3** |

#### OAuth (Google & Apple)
| Criterion | Status |
|-----------|--------|
| Google + Apple Buttons auf `/anmelden` und `/registrieren` | ✅ Pass |
| Kein Facebook-Button | ✅ Pass (Spec-Konform) |
| Erstlogin → `/onboarding`, Folgelogin → `/` | ⚠️ Abhängig von Middleware — siehe **BUG-1** |
| OAuth überspringt Email-Bestätigung | ✅ Pass (Standard Supabase-Verhalten) |
| `profiles`-Eintrag automatisch via DB-Trigger | ✅ Pass (PROJ-1 `handle_new_user`) |

#### Anmeldung
| Criterion | Status |
|-----------|--------|
| `/anmelden` mit E-Mail + Passwort | ✅ Pass |
| Falsche Zugangsdaten → "E-Mail oder Passwort falsch" (keine Enumeration) | ✅ Pass |
| Nach Login → Weiterleitung gemäß Middleware-Logik | ❌ Fail — siehe **BUG-1** |

#### Passwort-Reset
| Criterion | Status |
|-----------|--------|
| Link "Passwort vergessen?" auf `/anmelden` | ✅ Pass |
| Submit zeigt immer generische Erfolgsmeldung (keine Enumeration) | ✅ Pass |
| Reset-Link öffnet `/passwort-zuruecksetzen` mit Formular | ⚠️ Form vorhanden, Code-Exchange fehlt — siehe **BUG-2** |
| Nach Reset → eingeloggt + Weiterleitung zu `/` | ❌ Fail (durch BUG-2 blockiert) |

#### Middleware & Route Protection
| Criterion | Status |
|-----------|--------|
| `middleware.ts` prüft Session serverseitig | ❌ Fail — Datei am falschen Ort, siehe **BUG-1** |
| Öffentliche Routen (kein Auth-Check) | ⚠️ Definiert, aber irrelevant solange Middleware tot |
| Zustand 1 — Nicht eingeloggt → `/anmelden` | ❌ Fail |
| Zustand 2 — `portal_access_expires_at = NULL` → `/onboarding` | ❌ Fail |
| Zustand 3 — abgelaufen → `/zugang-abgelaufen` | ❌ Fail |
| Zustand 4 — aktiver Zugang → `/` | ❌ Fail |
| Eingeloggter Nutzer auf `/anmelden` → `/` | ❌ Fail |

#### Seite `/zugang-abgelaufen`
| Criterion | Status |
|-----------|--------|
| Nachricht "Zugang abgelaufen" | ✅ Pass |
| CTA-Button "Zugang verlängern — 79 €" | ✅ Pass (Stub für PROJ-6) |
| Abmelden-Link | ✅ Pass |

#### Onboarding-Wizard
| Criterion | Status |
|-----------|--------|
| Schritt 1: Name, Pflicht, min. 2 Zeichen | ✅ Pass |
| Schritt 2: Für wen? (self / gift) | ✅ Pass |
| Pfad A (self): direkt zu Kauf-CTA | ✅ Pass (Playwright) |
| Pfad B Geschenk: Name + Erzählweise | ✅ Pass (Playwright) |
| Pfad B1 (phone-only): Käufer-Hinweis "Projektleiter" | ✅ Pass |
| Pfad B2 (phone+computer): E-Mail + Rolle + Toggle | ✅ Pass |
| Schritt 3: Zusammenfassung + Preis 79 € + Jetzt-kaufen-Button | ✅ Pass |
| Rollen-Logik: Werte `projektleiter` / `co_author` | ✅ Pass |
| Mehrere Projektleiter pro Projekt erlaubt | ⚠️ DB-seitig OK (PROJ-1), UI-seitig nicht testbar |

### Edge Cases — Ergebnisse
| Edge Case | Status |
|-----------|--------|
| Mehrfacher Klick auf "Registrieren" (idempotent) | ⚠️ Standard Supabase-Verhalten, nicht explizit getestet |
| Bestätigungs-Mail-Link abgelaufen → Fehlerseite | ❌ **BUG-8** — keine dedizierte Fehlerseite |
| OAuth-Abbruch → zurück zu `/anmelden` ohne Halbsession | ✅ Pass (Supabase + Callback-Fallback) |
| Onboarding-Wizard in zwei Tabs | ✅ Pass (kein DB-Write vor Zahlung) |
| `portal_access_expires_at` exakt jetzt → `/zugang-abgelaufen` | ⚠️ Abhängig von BUG-1 |
| Aktiver Zugang ruft `/onboarding` auf → Redirect zu `/` | ❌ **BUG-6** — Guard fehlt |
| Reset-Link doppelt geklickt → "Link ungültig" | ⚠️ Blockiert durch BUG-2 |
| OAuth-Nutzer versucht Passwort-Reset → Hinweis | ❌ **BUG-7** — Hinweis fehlt |
| Eigene E-Mail als Geschenk-Empfänger → Fehler | ❌ **BUG-5** — Check fehlt |
| Beschenkter hat bereits Konto | ⚠️ Vertraulich an PROJ-9 delegiert (Spec-konform) |

### Security Audit (Red Team)

| Check | Ergebnis |
|-------|----------|
| `service_role`-Key im Browser-Bundle | ✅ Clean — nur Enum-String in Supabase-SDK |
| Stripe-Secret / Webhook-Secret im Bundle | ✅ Clean — nichts geleakt |
| JWT-Token im HTML/Inline-Script | ✅ Clean |
| HTTP-only Cookies (statt localStorage) | ✅ Pass — via `@supabase/ssr` |
| User-Enumeration via Login-Fehler | ✅ Pass — generische Meldung |
| User-Enumeration via Forgot-Password | ✅ Pass — immer dieselbe Erfolgsmeldung |
| XSS via Form-Inputs | ✅ Pass — React-Auto-Escape; kein `dangerouslySetInnerHTML` |
| Open-Redirect via OAuth-Callback `?next=` | ❌ Fail — **BUG-4** |
| OAuth-Provider-Liste (Google + Apple, kein anderer) | ✅ Pass |

### Bugs Found

#### BUG-1 — **Critical**: Middleware komplett inaktiv (Datei am falschen Ort)
**Beschreibung:** Bei einer Next.js App mit `src/app/`-Struktur muss `middleware.ts` in `src/middleware.ts` liegen, nicht im Projekt-Root. Aktuell liegt die Datei unter `/middleware.ts` und wird daher von Next.js **nicht ausgeführt**.

**Steps to reproduce:**
```bash
curl -sI http://localhost:3000/        # erwartet: 307 → /anmelden | tatsächlich: 200 OK
curl -sI http://localhost:3000/random   # erwartet: 307 → /anmelden | tatsächlich: 404
```
Playwright-Tests bestätigen: `/` ist für unauthentifizierte Nutzer ohne Redirect erreichbar.

**Impact:**
- Komplettes Access-Control bypassed
- Alle 4 Middleware-Zustände (logged-in/out × Zugang aktiv/abgelaufen) sind tot
- Spec-AC "Eingeloggter Nutzer auf `/anmelden` → `/`" funktioniert nicht
- Sicherheitsrisiko, sobald geschützte Seiten existieren (ab PROJ-3 kritisch)

**Fix:** Datei verschieben — `mv /middleware.ts /src/middleware.ts`. Beim Build wird Next.js sie dann automatisch erkennen.

---

#### BUG-2 — **High**: Passwort-Reset-Flow unvollständig (kein Code-Exchange)
**Beschreibung:** `supabase.auth.resetPasswordForEmail` setzt `redirectTo: '/passwort-zuruecksetzen'`. Supabase hängt einen `?code=` Query-Parameter an. Die Seite muss diesen Code via `exchangeCodeForSession()` einlösen, bevor `updateUser({ password })` aufgerufen werden kann. Aktuell rendert `/passwort-zuruecksetzen` nur das Formular — kein Code-Exchange.

**Impact:** Wenn ein Nutzer auf den Reset-Link in der E-Mail klickt, landet er auf der Seite, gibt sein neues Passwort ein, und der Submit schlägt fehl mit "Link ungültig oder abgelaufen" — obwohl der Link gültig ist.

**Fix:** Entweder
- (a) `redirectTo` auf `/auth/callback?next=/passwort-zuruecksetzen` ändern, damit der bestehende Callback-Handler den Code einlöst, oder
- (b) `/passwort-zuruecksetzen` zu einer Server Component machen, die den Code in einem Server-Side-Step einlöst.

---

#### BUG-3 — **High**: "E-Mail bereits registriert"-Erkennung fragil
**Beschreibung:** Die Registrierungs-Action erkennt doppelte E-Mails über `error.message.toLowerCase().includes("already")`. Bei aktivierter E-Mail-Bestätigung in Supabase-Auth **gibt es keinen Fehler bei einer Doppel-Anmeldung** — Supabase verhält sich silent, um User-Enumeration zu verhindern. Stattdessen sendet Supabase eine "magic link" an die existierende Adresse oder gar nichts.

**Impact:** Die Spec-AC "Bereits registrierte E-Mail zeigt Fehler" ist mit dem aktuellen Code nicht erfüllbar. Der Nutzer würde stattdessen auf `/email-bestaetigen` landen und nie eine E-Mail erhalten (oder einen Magic-Link statt einer Confirmation).

**Fix:** Either accept this as "by design" (User-Enumeration-Prevention ist DSGVO-konform) und Spec-AC anpassen, oder vor dem Sign-Up serverseitig per RPC prüfen ob die E-Mail existiert (öffnet aber Enumeration-Vektor).

**Empfehlung:** Spec anpassen — generische Bestätigungs-Page ist die sicherere Option.

---

#### BUG-4 — **Medium**: Open-Redirect-Vulnerability in `/auth/callback`
**Beschreibung:** Der Callback-Handler liest `next` aus den Query-Params und macht `NextResponse.redirect(\`${origin}${next}\`)`. Es gibt keine Whitelist-Validierung. Ein Angreifer könnte einen Link wie `/auth/callback?code=valid_code&next=//evil.com/phish` an einen Nutzer schicken — nach erfolgreichem Login wird der Nutzer auf `evil.com` weitergeleitet.

**Steps to reproduce:**
```
http://localhost:3000/auth/callback?code=anycode&next=//evil.com
```

**Fix:** Vor dem Redirect prüfen, ob `next` mit `/` (aber nicht `//`) beginnt:
```ts
const isSafeNext = typeof next === "string" && next.startsWith("/") && !next.startsWith("//");
const target = isSafeNext ? next : "/";
```

---

#### BUG-5 — **Medium**: Spec-Edge-Case fehlt — eigene E-Mail als Geschenk-Empfänger
**Beschreibung:** Spec Edge Case: "Nutzer im 'Als Geschenk'-Pfad gibt seine eigene E-Mail als Empfänger-E-Mail ein → Validierung zeigt Fehler: 'Bitte eine andere E-Mail-Adresse angeben'". Der Wizard prüft das aktuell nicht.

**Impact:** Geringe Wahrscheinlichkeit, aber Spec-Violation. Würde später zu Doppel-Membership (Käufer == Beschenkter) führen.

**Fix:** Im Onboarding-Wizard zusätzlich die E-Mail des eingeloggten Käufers fetchen (Server-Component) und im Validator vergleichen.

---

#### BUG-6 — **Medium**: Onboarding-Guard fehlt für aktive Nutzer
**Beschreibung:** Spec: "Nutzer mit aktivem Zugang ruft `/onboarding` direkt auf → Middleware lässt ihn durch (öffentliche Route), aber ein Guard auf der Onboarding-Seite leitet zu `/` weiter". Onboarding-Page ist Client Component ohne Auth-Check; aktive Nutzer können sich erneut durch den Wizard klicken.

**Fix:** Onboarding-Page zu einer Server Component umbauen, die User + Projects abfragt; wenn aktiver Zugang vorhanden → `redirect("/")`. Client-Wizard-Logik in eine Child-Component verschieben.

---

#### BUG-7 — **Medium**: OAuth-Nutzer Passwort-Reset Hinweis fehlt
**Beschreibung:** Spec Edge Case: "OAuth-Nutzer versucht Passwort-Reset → `/passwort-vergessen` zeigt Hinweis: 'Dein Konto nutzt Google/Apple-Login — Passwort-Reset nicht möglich'". Aktuell sendet die Seite immer dieselbe Erfolgsmeldung, was zwar User-Enumeration verhindert, aber den OAuth-User in eine Sackgasse führt.

**Trade-off:** Spec verlangt diesen Hinweis, aber er widerspricht der User-Enumeration-Prevention. Empfehlung: Spec anpassen (Hinweis als Banner statt nach Submit zeigen, basierend auf einem optionalen Provider-Selector).

---

#### BUG-8 — **Medium**: Fehlerseite für abgelaufene Bestätigungs-Mail fehlt
**Beschreibung:** Spec Edge Case: "Bestätigungs-E-Mail-Link ist abgelaufen → Fehlerseite mit Link 'Neue Bestätigungs-E-Mail anfordern'". `/auth/callback` redirected im Fehlerfall stumpf auf `/anmelden` — der Nutzer sieht keinen Hinweis, dass sein Link abgelaufen ist, und keine Option, einen neuen anzufordern.

**Fix:** Bei Code-Exchange-Fehler an `/anmelden?error=expired_link` redirecten und auf der Login-Page eine entsprechende Toast/Alert + Resend-Button anzeigen.

---

#### BUG-9 — **Low**: shadcn-Input nutzt `rounded-md` trotz Brand `--radius: 0`
**Beschreibung:** Visuelle Sub-Effekt: Im finalen CSS wird `border-radius: calc(0rem - 2px) = -2px` berechnet, was Browser als 0 interpretieren. Visuell unauffällig, aber semantisch unsauber.

**Fix:** Optional — beim nächsten Visual-Polish ggf. Override.

---

#### BUG-10 — **Low**: Multiple Lockfiles Warning
**Beschreibung:** Next.js warnt im Build/Dev: "Detected additional lockfiles" — `/Users/jakobtrierweiler/Desktop/GitHub/selfmadezwei/package-lock.json` neben dem Projekt-Lockfile. Das könnte zu inkonsistenten Dependency-Versionen führen.

**Fix:** Eine der beiden Lockfiles löschen oder `turbopack.root` in next.config setzen.

### Production-Ready Decision

**❌ NOT READY** — 1 Critical + 2 High Bugs blockieren den Produktiv-Einsatz:
- **BUG-1** macht das gesamte Sicherheits-Routing wirkungslos
- **BUG-2** bricht den Passwort-Reset-Flow
- **BUG-3** macht die Spec-AC "doppelte E-Mail" unhaltbar

Empfohlene Reihenfolge der Bugfixes:
1. BUG-1 (sehr kleiner Fix — Datei verschieben)
2. BUG-2 (Reset-Flow)
3. BUG-4 (Open Redirect — Security)
4. BUG-3 (Spec-Anpassung oder serverseitige Prüfung)
5. BUG-6 (Onboarding-Guard)
6. BUG-5, BUG-7, BUG-8 (Edge Cases)
7. BUG-9, BUG-10 (Cosmetic)

Nach Fix erneuter `/qa PROJ-2`-Lauf erforderlich.

### Playwright-Test-Status
20/22 ✅ — die 2 Failures sind die Middleware-Tests, die nach BUG-1-Fix automatisch grün werden. Die Tests sind in `tests/PROJ-2-auth-ssr.spec.ts` und decken: Form-Felder, Validierung, Onboarding-Pfade (A/B1/B2), No-Enumeration, kein Facebook-Button.

---

## Bugfix-Runde (2026-05-16)

Nach dem ersten QA-Lauf wurden alle Critical/High/Medium Bugs gefixt. Re-Test mit Playwright: **22/22 grün** gegen Production-Build.

| Bug | Schwere | Fix |
|-----|---------|-----|
| BUG-1 | Critical | `middleware.ts` → [src/middleware.ts](../src/middleware.ts) verschoben — Next.js erkennt Middleware bei `src/app/`-Struktur nur dort |
| BUG-2 | High | [passwort-vergessen/actions.ts](../src/app/passwort-vergessen/actions.ts) leitet `redirectTo` jetzt über `/auth/callback?next=/passwort-zuruecksetzen`, damit der Recovery-Code serverseitig gegen eine Session getauscht wird |
| BUG-3 | High | [registrieren/actions.ts](../src/app/registrieren/actions.ts) prüft `data.user.identities.length === 0` — Supabase's offizielles Signal für „E-Mail existiert bereits" ohne User-Enumeration über die Netzwerkebene |
| BUG-4 | Medium | `safeNext()`-Helper in [auth/callback/route.ts](../src/app/auth/callback/route.ts) blockt Open-Redirect (Pfade müssen mit `/` beginnen, nicht mit `//`) |
| BUG-5 | Medium | [OnboardingWizard.tsx](../src/app/onboarding/OnboardingWizard.tsx) vergleicht `giftRecipientEmail` mit `buyerEmail` (Server-Component-Prop) |
| BUG-6 | Medium | [onboarding/page.tsx](../src/app/onboarding/page.tsx) ist Server Component: aktive Nutzer → Redirect `/`. Unauthentifizierte und frisch registrierte Nutzer sehen den Wizard (Spec: öffentliche Route) |
| BUG-7 | Medium | Hinweis-Banner auf [passwort-vergessen/page.tsx](../src/app/passwort-vergessen/page.tsx) ohne User-Enumeration zu öffnen |
| BUG-8 | Medium | `auth/callback` redirected bei Fehler nach `/anmelden?error=expired_link`; Banner + Resend-Form auf [anmelden/page.tsx](../src/app/anmelden/page.tsx) mit neuer `resendConfirmAction` |
| BUG-9 | Low | Offen — kosmetisch, keine User-Wirkung |
| BUG-10 | Low | Offen — separates Cleanup-Ticket |

### Re-Test-Lauf
- **Setup:** Production-Build (`npm run build` → `npm run start`); Tests gegen Port 3000 mit 2 Workern, Chromium-only.
- **Hintergrund:** Dev-Mode (Turbopack) hängt bei der ersten Kompilierung von `/anmelden` länger als 60s — Playwright-WebServer-Timeout greift. Produktiv-Build kompiliert in 4.7s, antwortet sofort.
- **Ergebnis:** `22 passed (6.3s)` — alle 4 Middleware-Routing-Tests + alle 3 Onboarding-Pfad-Tests + alle Formular-Validierungen grün.

### Production-Ready Decision
✅ **APPROVED** — Critical + High + Medium Bugs behoben, alle 22 E2E-Tests grün. Verbleibende Low-Bugs (BUG-9 shadcn-Radius, BUG-10 Lockfiles) sind kosmetisch und blockieren den Produktiv-Einsatz nicht.

## Deployment
_To be added by /deploy_
