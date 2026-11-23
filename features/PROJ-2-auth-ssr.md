# PROJ-2: Auth + SSR

> **Kurzfassung (PROJ-31).** Das vollständige Tech Design, Bau-Notizen, QA-Protokolle und der Deployment-Verlauf stehen unverändert im [Archiv](archive/PROJ-2-auth-ssr.md).

## Status: Deployed
**Created:** 2026-05-15
**Last Updated:** 2026-05-16

> ℹ️ **Kauf ohne Konto (2026-11-16, PROJ-6):** `/onboarding` und `/kauf-erfolgreich` sind öffentliche Routen. Eingeloggte Konten ohne Projekt („Zustand 2") werden zuerst auf `/kauf-einloesen` geleitet, das einen bezahlten Kauf ohne Konto zuordnet und sonst zu `/onboarding` weiterführt. Angemeldete Nutzer, die `/anmelden` oder `/registrieren` mit `?next=` aufrufen, landen direkt auf dem Ziel. Details: [PROJ-6, Refinement 2026-11-16](PROJ-6-stripe-zahlungen.md).

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
- [ ] Falsche Zugangsdaten zeigen einen Fehler. **Geändert 2026-11-22 (Jakob, PROJ-17 BUG-4):** Der Login nennt jetzt, ob es zur Adresse noch kein Konto gibt oder das Passwort nicht stimmt. Die Abfrage läuft erst nach bestandenem CAPTCHA und innerhalb des Login-Limits.
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
- Sicherheit: Keine User-Enumeration beim Passwort-Reset (generische Meldung). Beim Login seit 2026-11-22 bewusst aufgehoben, siehe PROJ-17 BUG-4
- Sicherheit: Session-Token nur in HTTP-Only-Cookies (Supabase SSR-Client), nicht in `localStorage`
- Sicherheit: Middleware läuft auf der Next.js Edge Runtime; kein Auth-Check nur client-seitig
- Sicherheit: `service_role`-Key ausschließlich server-seitig; kein Zugang im Browser-Bundle
- SSR: Supabase-Client für Server Components und Middleware über `@supabase/ssr` (Cookie-basiert)
- Onboarding-State: Wizard-Daten in React-State oder `sessionStorage` (kein DB-Write vor Zahlung); bei Seitenreload zurück zu Schritt 1
- PROJ-1-Abhängigkeit: `project_members.role` muss vor Implementierung auf `ENUM(projektleiter, co_author)` geändert sein

---

## Nachtrag 2026-10-14 — Mail-Links und Anmeldewege
- `/auth/callback` bestätigt Mail-Links zusätzlich per `token_hash` und `type`, damit sie auch in einem anderen Browser funktionieren. Der Code-Weg für Google und Facebook bleibt.
- **Produktentscheidung:** Pro E-Mail-Adresse funktionieren alle Anmeldewege. Wer sich mit Google oder Facebook registriert hat, kann über „Passwort vergessen“ ein Passwort festlegen.
- Bei einem fehlgeschlagenen Reset-Link bietet die Anmeldeseite „Neuen Link anfordern“. `same_password` und `weak_password` zeigen einen eigenen Hinweis am Passwort-Feld.
- Die Auth-Mail-Vorlagen liegen in `supabase/templates/`. Ihr Einsatz steht in `docs/production/prod-umzug.md`.

## Offene Punkte
- BUG-9 (Low): Der shadcn-Input nutzt `rounded-md` trotz `--radius: 0`.
- BUG-10 (Low): Warnung wegen mehrerer Lockfiles.
- Die Middleware lädt je Anfrage alle Projekte des Kontos. Die Optimierung ist für PROJ-13 vorgesehen.
