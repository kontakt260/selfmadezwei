# PROJ-2: Auth + SSR

## Status: In Progress
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
_To be added by /qa_

## Deployment
_To be added by /deploy_
