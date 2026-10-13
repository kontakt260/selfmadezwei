# PROJ-12: Vapi-Pipeline

> ⚠️ **ÜBERHOLT (2026-10-13):** Vapi wird durch Audio-Sprachnachrichten ersetzt (Aufforderung per Mail/SMS → Aufnahme-Link → Transkript → ausformulierter Kapiteltext; kein Zeit-Kontingent). Diese Spec wird neu gefasst — den Inhalt unten **nicht** mehr umsetzen. Siehe [docs/PRD.md](../docs/PRD.md).

## Status: Planned
**Created:** 2026-05-25
**Last Updated:** 2026-05-25

## Dependencies
- Requires **PROJ-1** (Supabase-Datenmodell & RLS) — neue Spalten `projects.vapi_phone_number` + `projects.vapi_pin`, `chapter_origin`-Enum-Erweiterung um `vapi_call`
- Requires **PROJ-2** (Auth + SSR) — User-Session für Web-UI
- Requires **PROJ-3** (Persönlicher Bereich + Konto) — Onboarding-Wizard liegt hier; Erweiterung um Telefonnummer-Frage im Geschenk-Flow
- Requires **PROJ-4** (Kapitel-Routing & Persistenz) — neue Kapitel-Anlage + Body-Update
- Requires **PROJ-5** (Kapitel-Editor) — Editor zeigt Vapi-erstellte Kapitel danach
- Requires **PROJ-6** (Stripe-Zahlungen) — Guthaben-Berechnung läuft schon (10h initial + Top-ups − consumed)
- Requires **PROJ-8** (Erzähl-Impulse) — Assistant bietet Impulse als Themen-Vorschläge
- Requires **PROJ-9** (Projekt-Mitglieder + Einladungen) — Berechtigungs-Pattern „nur Projektleiter darf ändern, Co-Autor sieht read-only" wird wiederverwendet
- Soft dependency: **PROJ-11** (Resend-Transaktionsmails) — bei niedrigem Guthaben kann Reminder verschickt werden

## User Stories
- Als **Beschenkter / Schreibender** möchte ich einfach eine zentrale Nummer anrufen und sofort dem Assistenten erzählen können — ohne Login, ohne Code-Eingabe, mein Handy reicht.
- Als **Geschenkkäufer** möchte ich beim Anlegen des Projekts direkt die Telefonnummer der beschenkten Person eintragen können, damit sie ohne weitere Schritte einfach anrufen kann.
- Als **Projektleiter** möchte ich in der bestehenden „Code für das Telefonieren"-Sektion der Projektübersicht die zugeordnete Telefonnummer ändern können (z. B. wenn die beschenkte Person ein neues Handy hat).
- Als **Schreibender mit Anruf von fremdem Telefon** (z. B. aus dem Urlaub) möchte ich die 6-stellige Projekt-PIN eingeben können, die in der Projektübersicht sichtbar ist.
- Als **Schreibender** möchte ich am Anfang wählen können, ob ich ein neues Kapitel beginne oder eines weiterführe — und im „neuen Kapitel"-Pfad einen Erzähl-Impuls vorgeschlagen bekommen.
- Als **Schreibender** möchte ich am Ende des Anrufs wissen, dass meine Erzählung gespeichert wurde — entweder als neues Kapitel oder ans bestehende angehängt — und sie später im Portal editieren können.
- Als **Schreibender mit knappem Guthaben** möchte ich 1 Minute vor Ablauf eine sanfte Vorwarnung bekommen, damit der Assistent mich nicht mitten im Satz abschneidet.

## Acceptance Criteria

### Datenmodell (NEU)
- [ ] Neue Spalte `projects.vapi_phone_number` (E.164-Text, nullable, **systemweit unique**). Genau **eine** Nummer pro Projekt — kein separates Multi-Number-Modell.
- [ ] Neue Spalte `projects.vapi_pin` (6-stellig, NOT NULL, automatisch beim Projekt-Anlegen einmalig generiert; eindeutig pro Projekt; **nicht regenerierbar** durch User-Aktion).
- [ ] Versuche, eine bereits anderswo zugeordnete Nummer einem zweiten Projekt zuzuweisen, schlagen mit Hinweis fehl (Unique-Constraint).
- [ ] `chapter_origin`-Enum-Erweiterung um den Wert `vapi_call`.

### Onboarding-Erweiterung
- [ ] In allen Onboarding-Pfaden (`gift + phone-only`, `gift + phone-and-computer`, `for-myself`) gibt es einen **optionalen** Schritt für die Telefonnummer der beschenkten Person bzw. der eigenen Person (E.164-Format, mit Country-Code-Picker oder vorausgewähltem +49). Die Nummer wird, falls eingegeben, beim Projekt-Anlegen als `projects.vapi_phone_number` gespeichert.
- [ ] Wenn die Nummer beim Onboarding leer gelassen wird, bleibt `projects.vapi_phone_number` initial NULL — der Anrufer muss bei späteren Anrufen den 6-stelligen Code eingeben. Die Nummer kann jederzeit nachträglich in der „Code für das Telefonieren"-Sektion vom Projektleiter eingetragen werden.
- [ ] In allen Pfaden wird die `projects.vapi_pin` beim Anlegen automatisch generiert (6-stellig, kryptografisch zufällig).
- [ ] Versucht der User im Onboarding eine Nummer einzutragen, die in einem anderen Projekt bereits zugeordnet ist: Inline-Fehler „Diese Nummer ist bereits einem anderen Projekt zugeordnet."

### „Code für das Telefonieren"-Sektion (bestehende Sektion erweitern)
- [ ] Die bestehende Sektion in [src/app/projektuebersicht/[project_id]/page.tsx:321](src/app/projektuebersicht/[project_id]/page.tsx#L321) wird inhaltlich aktiviert (bisher Platzhalter-Text „wird mit dem Vapi-Modul aktiviert").
- [ ] Sektion zeigt:
    - Die zentrale narravit-Anruf-Nummer (statisch, prominent).
    - Den **6-stelligen Telefon-Code** (= `projects.vapi_pin`) — sichtbar für alle Mitglieder, mit Kopier-Button.
    - Die **zugeordnete Telefonnummer** (= `projects.vapi_phone_number`) mit Bearbeiten-Button für Projektleiter; bei Co-Autoren ist die Nummer read-only ohne Bearbeiten-Button.
- [ ] **Projektleiter** kann die Nummer per Modal eintragen / ändern (Eingabe-Feld E.164, Validierung, Submit setzt neue Nummer; alte wird überschrieben).
- [ ] **Niemand** kann die Nummer löschen — es gibt keine „Entfernen"-Aktion. Falls die Zuordnung wechseln soll, muss eine neue Nummer eingetragen werden, die die alte überschreibt.
- [ ] **Es gibt keine PIN-Regenerieren-Aktion** — die PIN ist beim Projekt-Anlegen final.
- [ ] Wenn `vapi_phone_number` initial leer ist (z. B. nach for-myself-Onboarding ohne Nummer): UI zeigt „Noch keine Nummer hinterlegt" + Button „Nummer eintragen" (nur Projektleiter).

### Anruf-Annahme + Identifikation
- [ ] Bei eingehendem Anruf prüft Vapi zuerst die Anrufer-Nummer gegen `projects.vapi_phone_number`:
    - **Match auf genau ein Projekt:** Projekt eindeutig erkannt → Assistent begrüßt mit Projekt-Name (und falls vorhanden, mit dem Namen der beschenkten Person aus dem Onboarding).
    - **Kein Match (anonyme Nummer / nicht hinterlegte Nummer):** Vapi fragt nach dem 6-stelligen Projekt-Code.
- [ ] Code-Eingabe per Sprache oder Tastenton (DTMF) möglich.
- [ ] Bei 3 falschen Code-Versuchen wird der Anruf höflich beendet („Wir konnten dich leider keinem Projekt zuordnen — bitte prüfe deinen Code in der Projektübersicht").
- [ ] Falls eine eingehende Nummer (durch Race-Bedingung oder DB-Inkonsistenz) mehrere Projekte matched: defensiv abweisen + Sentry-Alarm. Unique-Constraint sollte das ausschließen.

### Guthaben-Prüfung (vor Anruf-Beginn)
- [ ] Nach Projekt-Identifikation prüft das System das verfügbare Guthaben (`36_000 + topups*3_600 − consumed_seconds`) für dieses Projekt.
- [ ] **Bei 0 Sek Restguthaben:** höfliche Ansage „Du hast aktuell keine Sprechzeit mehr — bitte kaufe im Portal ein Zusatzpaket und ruf gleich nochmal an" + Anruf-Ende. Keine `voice_session`-Reihe wird angelegt.
- [ ] **Bei < 60 Sek:** Anruf wird trotzdem angenommen; Assistent erwähnt früh „Wir haben heute nur kurz Zeit — höchstens noch eine Minute".
- [ ] **Bei ausreichend Guthaben (≥ 60 Sek):** normaler Flow.

### Kapitel-Auswahl
- [ ] Nach Identifikation + Guthaben fragt Assistent: „Möchtest du heute ein neues Kapitel beginnen oder eines weiterführen?"
- [ ] **Bei „neu":** Assistent bietet einen zufälligen aktiven Erzähl-Impuls (aus PROJ-8) als Vorschlag an und fragt „Magst du heute über [Titel] erzählen — oder hast du ein eigenes Thema?" User kann annehmen, ablehnen (→ neuer Vorschlag) oder eigenes Thema nennen.
- [ ] **Bei „weiterführen":** Assistent listet die letzten 3 Kapitel des Projekts (nach `updated_at`) und fragt „Möchtest du Kapitel A, B oder C weiterführen?" User wählt per Sprache.
- [ ] **Bei Projekt mit 0 Kapiteln:** „weiterführen" entfällt; Assistent geht direkt in den „neu"-Pfad.

### Gesprächs-Verlauf
- [ ] Assistent ist freundlich, geduldig, gibt Raum zum Erzählen und stellt bei Bedarf sanfte Folgefragen, die zum gewählten Impuls / Thema passen.
- [ ] Stimme und Persona werden in `/architecture` und der Vapi-Konfiguration final festgelegt (Default-Richtung: weiblich, warm, deutsche Muttersprache, mittlere Geschwindigkeit).
- [ ] Während des Gesprächs zählt die Vapi-interne Zeitmessung die verbrauchten Sekunden.
- [ ] **60-Sekunden-Vorwarnung:** wenn das Restguthaben auf 60 Sek fällt, unterbricht der Assistent sanft mit „Wir haben noch eine Minute — möchtest du noch etwas sagen, bevor wir Schluss machen?"
- [ ] Bei Erreichen von 0 Sek: Assistent verabschiedet sich kurz („Vielen Dank für deine Geschichte — bis zum nächsten Mal") und beendet das Gespräch.
- [ ] User kann jederzeit „Tschüss" / „Ende" sagen — Assistent verabschiedet sich und beendet sauber.

### Speicherung nach Anruf-Ende
- [ ] Vapi sendet am Ende des Anrufs einen **signierten Webhook** an narravit mit: Anruf-ID, identifiziertes Projekt, Dauer in Sekunden, Transcript (Plain-Text + ggf. strukturiertes Format), gewählter Pfad (neu vs. weiterführen), Kapitel-Referenz (bei Weiterführung) oder Impuls-/Thema-Info (bei Neu).
- [ ] Server validiert die Webhook-Signatur — verworfene Requests werden nicht verarbeitet.
- [ ] Server legt eine `voice_sessions`-Reihe an mit `duration_seconds`, `project_id`, `chapter_id` (verknüpft mit dem betroffenen Kapitel), `chapter_origin`. `user_id` bleibt **NULL** für anonyme Phone-Anrufer (Telefon-Identifikation ist projekt-scoped, nicht user-scoped).
- [ ] **Bei „neu":** ein neues Kapitel wird in `chapters` angelegt; Title = Impuls-Titel oder User-Thema; Body = Transcript; `chapter_origin = "vapi_call"`; `source_impulse_id` gesetzt falls Impuls genutzt; `sort_order` = letzter Platz.
- [ ] **Bei „weiterführen":** das ausgewählte Kapitel bekommt das neue Transcript an seinen bestehenden Body angehängt (sauberer Absatz-Umbruch + Datum-Marker „— Erzählt am 25.05.2026").
- [ ] Transcript wird **niemals** verworfen, wenn der Anruf vor sauberem Abschluss bricht (Netzfehler, plötzliches Auflegen): Vapi liefert auch dann den Webhook mit den bis dahin aufgezeichneten Daten.
- [ ] Idempotenz: doppelte Webhook-Zustellung (Vapi-Retry) wird durch die Anruf-ID erkannt; Re-Insert wird verhindert.

### Audit + Anzeige in der Projektübersicht
- [ ] Vapi-erstellte Kapitel sind in der Projektübersicht als „Erzählt am Telefon" (analog zu „Eigenes Kapitel" / „Erzähl-Impuls") gekennzeichnet — kommt aus `chapter_origin`.
- [ ] Verbrauchte Vapi-Sekunden werden in `PaywallStats` automatisch in der verfügbaren Restzeit reflektiert (Berechnung läuft schon, PROJ-12 fügt nur neue `voice_sessions`-Reihen hinzu).

## Edge Cases
- **Anruf von hinterlegter Nummer, aber Projekt hat 0 Sek Restguthaben:** höfliche Ansage + Anruf-Ende.
- **Anruf, aber Nummer wurde inzwischen auf eine andere geändert:** alte Nummer matched nicht mehr → Code-Fallback. Wenn auch der Code nicht eingegeben wird → Anruf endet.
- **Versuch, eine bereits in Projekt A registrierte Nummer in Projekt B einzutragen:** Unique-Constraint blockt, Server-Action gibt klaren Fehler an die UI zurück. Projektleiter von B muss die Nummer zuerst in A überschreiben lassen.
- **Geschenkkäufer tippt beim Onboarding die Nummer falsch:** Onboarding-Validierung prüft E.164-Format; bei Tippfehler im echten Wert (z. B. eine Ziffer falsch) fällt das erst beim ersten Anruf-Versuch auf — Projektleiter kann die Nummer dann in der Projektübersicht korrigieren.
- **Code-Eingabe per Sprache, aber Spracherkennung versteht falsch:** dem Anrufer wird die erkannte Ziffer wiederholt; bei Mismatch nochmal versuchen lassen, max. 3 Versuche.
- **User legt mitten im Anruf auf:** Vapi-Webhook kommt trotzdem mit Teil-Transcript; Server verarbeitet wie regulär (Kapitel wird angelegt / angehängt).
- **Transcript ist leer** (User hat nicht gesprochen, nur Stille / Atmen): kein Kapitel anlegen, nur `voice_session`-Reihe mit `duration_seconds` für die Abrechnung; Sentry-Log mit Hinweis „leeres Transcript".
- **Transcript ist sehr kurz** (z. B. unter 10 Wörter): wird normal gespeichert; User kann im Editor entscheiden, ob er es behalten oder löschen will.
- **Vapi-Webhook signiert mit falschem Secret** (Replay-Attack oder Provider-Wechsel): Request wird verworfen, Sentry-Alarm.
- **Vapi-Webhook kommt doppelt** (Vapi-Retry nach Timeout): Idempotenz über die Vapi-Call-ID; zweiter Insert wird verhindert.
- **User wählt „weiterführen", aber das genannte Kapitel ist mehrdeutig** (zwei Kapitel mit ähnlichem Titel): Assistent fragt nach, listet beide kurz mit Anfang-Zitat.
- **Race: Anruf läuft, parallel kauft jemand Top-Up:** Guthaben-Berechnung bei Anruf-Start ist atomar; während des Anrufs gilt der zu Beginn ermittelte Wert (Top-Ups gelten erst beim nächsten Anruf).
- **Anrufer ruft mit unterdrückter Nummer an:** automatisch Code-Fallback-Pfad.
- **Nummer-Änderung während ein Anruf läuft:** der laufende Anruf ist schon authentifiziert und läuft zu Ende; nur künftige Anrufe nutzen die neue Nummer für die automatische Erkennung.
- **Onboarding ohne Nummer (alle Pfade):** Projekt wird angelegt, `vapi_phone_number` bleibt NULL; Beschenkter / Schreibender muss bei Anruf den 6-stelligen Code eingeben (oder die Nummer wird später in der Projektübersicht vom Projektleiter eingetragen). Insbesondere im `phone-only`-Geschenk-Pfad ist die Nummer-Eingabe bewusst optional: der Geschenkkäufer kennt sie evtl. noch nicht und kann sie nachreichen.
- **Stille während des Anrufs** (User denkt nach): Assistent wartet mind. X Sekunden bevor er nachfragt; Default-Wert wird in `/architecture` festgelegt.

## Technical Requirements
- **Webhook-Signatur:** Vapi liefert eine Signatur (HMAC oder ähnliches) — Server **muss** die Signatur prüfen, sonst Request verwerfen. Secret als `VAPI_WEBHOOK_SECRET` im Env.
- **Assistant-Konfiguration:** Prompt + Stimme + LLM-Modell + Tools werden im Vapi-Dashboard konfiguriert; Identifikations-/Auth-Logik nutzt Vapi-Tool-Calls (Function Calls), die unsere Server-Endpoints rufen, um Phone-Match / Code-Check / Kapitel-Liste / Erzähl-Impuls-Vorschlag zu liefern.
- **LLMs serverseitig:** alle LLM-Aufrufe (für Assistant-Reaktionen) laufen über Vapi-Server-Konfiguration mit unserem API-Key — niemals Client-Side.
- **Server-Tool-Endpoints:** alle Endpoints, die Vapi anruft (Match-Phone, Verify-Code, List-Chapters, Suggest-Impulse, Save-Session) sind mit Vapi-Signatur-Check geschützt und liefern minimale Datenmenge.
- **Datenmodell-Erweiterungen:**
    - `projects.vapi_phone_number` (E.164-Text, nullable, unique)
    - `projects.vapi_pin` (6-stellig, NOT NULL, default zufällig generiert, **kein User-UPDATE**)
    - `chapter_origin`-Enum-Erweiterung um `vapi_call`
    - `voice_sessions` ggf. um `vapi_call_id` (Idempotenz)
- **RLS-Policies:**
    - `projects.vapi_pin`: SELECT für jedes Projekt-Mitglied; **kein** UPDATE durch reguläre Rollen (auch nicht Projektleiter); INSERT nur beim ursprünglichen Projekt-Insert via Service-Role-Trigger.
    - `projects.vapi_phone_number`: SELECT für jedes Projekt-Mitglied; UPDATE nur für Projektleiter.
- **PIN-Sicherheit:** Projekt-PIN wird beim Server generiert; Speicherung als gehashter Wert in der DB (bcrypt o. ä.), Klartext-PIN wird zusätzlich verschlüsselt mit projekt-spezifischem Key gespeichert, sodass das Portal sie anzeigen kann (oder alternativ: Klartext bleibt in der DB mit RLS-Schutz). Konkrete Modellierung in `/architecture`.
- **Phone-Number-Validierung:** E.164-Format-Check bei jedem Insert/Update; Normalisierung (Leerzeichen, Bindestriche entfernen) vor dem Speichern.
- **Performance:** alle Server-Tool-Endpoints für Vapi müssen < 500 ms antworten, sonst wirkt der Assistent zäh.
- **Observability:** alle Anruf-Phasen (Auth, Chapter-Pick, Session-End) werden mit Sentry-Tags geloggt; Vapi-Dashboard liefert zusätzliche Call-Statistiken.
- **i18n:** Assistant-Sprache ist Deutsch; Texte/Prompts werden vor Roll-out mit dem narravit-Team abgestimmt.
- **DSGVO:** Transcript ist personenbezogene Daten; Speicherung im `chapters.body` ist legitim (User-Inhalt seiner eigenen Lebensgeschichte); kein zusätzliches Logging des Transcripts außerhalb der DB. Telefonnummern in `projects.vapi_phone_number` haben dieselbe Schutzstufe wie andere personenbezogene Felder; Löschung beim Projekt-Löschen via CASCADE.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### A) Komponenten-Struktur (PM-Sicht)

```
Onboarding-Wizard /onboarding (existiert, erweitert)
+-- Steps-Array bekommt EINEN neuen Schritt "phone-number" (NEU)
|   +-- Self-Pfad:         name → phone-number → purchase
|   +-- Gift phone-only:   for-whom → name → gift-details → phone-number → purchase
|   +-- Gift phone+computer: for-whom → name → gift-details → gift-computer → phone-number → purchase
+-- StepPhoneNumber (NEU, Client-Komponente)
    +-- Text passt sich an Kontext an:
    |   - "Telefonnummer von <Beschenkter>" (Geschenk-Pfade)
    |   - "Deine Telefonnummer" (Self-Pfad)
    +-- E.164-Eingabefeld (Country-Code-Picker vorausgewählt +49)
    +-- "Überspringen"-Button → leer weiter
    +-- Validierung vor Submit: E.164-Format + nicht in anderem Projekt vergeben

Projekt-Anlage (Server-Action beim Wizard-Submit, existiert, erweitert)
+-- bisher: legt projects + project_members (Projektleiter) an
+-- NEU: schreibt vapi_phone_number falls eingegeben
+-- NEU: DB-Default generiert vapi_pin automatisch (DB-Trigger, kein App-Code)

Projektübersicht "Code für das Telefonieren"-Sektion (existiert als Placeholder)
+-- bisher: nur Hinweis-Text "wird mit dem Vapi-Modul aktiviert (PROJ-12)"
+-- NEU: voll funktional
    +-- Server-Lader (erweitert): liest projects.vapi_phone_number + vapi_pin
    +-- TelefonSection-Komponente (NEU)
        +-- Zentrale narravit-Anruf-Nummer (statisch, prominent)
        +-- 6-stelliger Telefon-Code (Klartext, Kopier-Button)
        +-- Zugeordnete Nummer (mit Bearbeiten-Button NUR für Projektleiter)
        +-- "Nummer eintragen / ändern"-Modal (Projektleiter)
            +-- E.164-Feld, Validierung, Unique-Check serverseitig

Vapi-Subsystem (NEU, App-extern + Server-Endpoints)
+-- Vapi-Dashboard-Konfiguration (extern, Setup-Aufgabe)
|   +-- Assistant: Prompt + Stimme + LLM-Modell
|   +-- Eingehende-Nummer-Routing zu unserem Assistant
|   +-- Tool-Definitionen (Function Calls) → unsere Endpoints
|   +-- End-of-Call-Webhook → unser Endpoint
+-- Tool-Endpoints (NEU, /api/vapi/tools/...)
|   +-- lookup_by_phone   (Anrufer-Nr → Projekt-Daten)
|   +-- verify_pin        (Code → Projekt-Daten)
|   +-- list_chapters     (Projekt-ID → letzte 3 Kapitel)
|   +-- suggest_impulse   (→ zufälliger aktiver Impuls)
|   +-- alle mit Vapi-Signatur-Check
+-- End-of-Call-Webhook (NEU, /api/vapi/webhook)
    +-- Signatur-Check
    +-- Idempotenz-Check via vapi_call_id
    +-- voice_sessions-Insert
    +-- Kapitel-Anlage (neu) oder Body-Append (weiterführen)

Datenbank
+-- projects (existiert, ZWEI neue Spalten)
|   +-- vapi_phone_number   (E.164-Text, nullable, systemweit unique)
|   +-- vapi_pin            (6-stellig, NOT NULL, DB-Default = zufällig)
+-- voice_sessions (existiert, EINE neue Spalte)
|   +-- vapi_call_id        (Text, nullable, unique) → Idempotenz
+-- chapter_origin Enum (existiert, ein neuer Wert)
    +-- existiert: "custom" | "catalog_impulse"
    +-- NEU:       "vapi_call"
```

### B) Datenmodell (Plain Language)

```
projects (Erweiterung um zwei Felder)
+-- vapi_phone_number   E.164-Format, optional
|                       Eine Nummer pro Projekt. Systemweit eindeutig
|                       (eine Nummer kann nur EINEM Projekt zugeordnet sein).
+-- vapi_pin            6-stellig, immer gesetzt
                        Wird beim Projekt-Insert von der DB automatisch
                        generiert (kryptografisch zufällig).
                        Nicht regenerierbar durch User-Aktion.

voice_sessions (Erweiterung um ein Feld)
+-- vapi_call_id        Optionale eindeutige Anruf-ID von Vapi.
                        Verhindert Doppelverarbeitung bei Webhook-Retry.

chapter_origin (Enum-Erweiterung)
+-- Neuer Wert "vapi_call"
    Markiert Kapitel, die durch einen Vapi-Anruf erstellt wurden.
```

Andere Daten kommen aus existierenden Tabellen: `projects.title`, `chapters` (Lese-Liste + Append-Body), `payments` (Guthaben-Berechnung), `voice_sessions` (Verbrauch-Summe), `impulse_catalog` (Vorschläge), Onboarding-Recipient-Name aus dem Wizard.

### C) Tech-Entscheidungen (begründet)

1. **PIN als Klartext in der DB mit RLS-Schutz** — Spec verlangt, dass die PIN in der Projektübersicht im Klartext sichtbar ist. Eine gehashte Speicherung würde diese Anzeige unmöglich machen (Hashes sind nicht rückführbar). Eine zusätzliche Doppel-Speicherung (gehasht + verschlüsselt) wäre Defense-in-Depth, aber bringt für eine **6-stellige PIN mit 3-Versuche-Limit** kaum messbaren Mehrwert: Brute-Force ist durch das Limit ausgeschlossen, und Klartext-in-DB ist durch RLS (nur Mitglieder lesen) plus Supabase-Encryption-at-Rest gut geschützt. Für MVP: Klartext, RLS-streng. Bei späterem Bedarf (Audit-Anforderung) später nachhärten.

2. **PIN-Generierung im DB-Default-Trigger** statt App-Code — beim Projekt-Insert generiert ein Postgres-`DEFAULT`-Ausdruck eine 6-stellige Zahl (mit führenden Nullen). Vorteil: keine App-Logik dazwischen, garantiert keine PIN-lose Projekt-Reihe, und Code-Pfad ist überall (Wizard, Tests, Migrationen) identisch.

3. **Eine Nummer pro Projekt mit systemweitem Unique-Constraint** — bewusste Vereinfachung gegenüber Multi-Number-Modell. Vorteile: kein N:1-Lookup-Aufwand, keine Default-Marker-Logik, keine Multi-Number-UI. Die Spec bestätigt explizit: Nummer ist nur überschreibbar, nicht löschbar — also brauchen wir nicht mal eine Versions-/Audit-Spur.

4. **Vapi-Tool-Endpoints als signierte Next.js-API-Routes** — Vapi unterstützt zwei Modelle: (a) Direktanbindung an OpenAI/Anthropic-API mit eingebetteten Tool-Definitionen oder (b) HTTP-Tool-Endpoints, die wir hosten. Wir wählen (b), weil die Auth- und Projekt-Daten in unserer Supabase liegen und nicht zu Vapi exportiert werden sollen. Alle Endpoints prüfen die Vapi-Signatur per geteiltem Secret (`VAPI_WEBHOOK_SECRET`); ungesignete Requests werden mit 401 abgewiesen.

5. **End-of-Call als eigener Webhook, nicht als Tool** — Vapi unterscheidet zwischen Live-Tools (während des Gesprächs) und End-of-Call-Reports (nach Auflegen). Die Speicherung des Transcripts gehört in den End-of-Call-Webhook, weil sie nicht während des Gesprächs nötig ist und Vapi-seitig automatisch retried wird, wenn unser Server kurz nicht antwortet. Idempotenz über die Vapi-eigene `call.id`.

6. **chapter_origin-Enum-Erweiterung statt eigener Spalte** — `chapter_origin` existiert schon mit "custom" | "catalog_impulse". Ein dritter Wert "vapi_call" passt natürlich in dieses Modell. Keine zusätzliche Spalte nötig.

7. **Transcript landet direkt in `chapters.body`** (keine separate Speicherung) — beim "neu"-Pfad als kompletter Body; beim "weiterführen"-Pfad als Append mit Trenner. Vorteil: kein Sync-Problem zwischen Transcript-Tabelle und Kapitel-Inhalt; User kann sofort im Editor weiterarbeiten. Nachteil: das ursprüngliche Transcript ist nicht separat archiviert — wenn der User es im Editor verändert, ist das Original weg. Für MVP akzeptiert; ein optionaler Audit-Snapshot wäre Folge-Ticket.

8. **Onboarding-Step "phone-number" als optionaler Schritt** zwischen den projekt-relevanten Daten und dem Kauf-Schritt — gleiche UX-Pattern wie alle anderen Steps. Position im Steps-Array hängt vom Wizard-Pfad ab (siehe Komponenten-Tree).

9. **Bestehende "Code für das Telefonieren"-Sektion aktivieren** statt eigene neue Sektion bauen — die Spec verlangt explizit Wiederverwendung. Place-holder-Hinweis in [page.tsx:321](src/app/projektuebersicht/[project_id]/page.tsx#L321) wird durch echte UI ersetzt.

10. **Stille-Erkennung Default = 5 Sekunden** — Vapi-Konfig-Wert, kein Code. Ältere Schreibende brauchen länger zum Denken, 5 Sek ist sanfter als die Default-3-Sek der meisten Voice-AIs. Vor Roll-out im Pilot-Test ggf. nachregeln.

11. **Vapi-Stimme & Persona im Dashboard, nicht im Code** — Stimm-Auswahl (Vendor: z. B. ElevenLabs deutsche Stimmen), Sprechgeschwindigkeit, Prompt-Tonalität werden im Vapi-Dashboard konfiguriert. So kann das narravit-Team das ohne Code-Deploy anpassen.

### D) Neue Abhängigkeiten (Pakete)

- Keine neuen npm-Pakete für das Core-Setup. Vapi wird über HTTP-API + Webhooks angebunden, ohne SDK.
- Optional: `libphonenumber-js` für robuste E.164-Validierung/Normalisierung (kleines Paket, ~15 KB gzipped, hochwertige Validierung). Empfohlen, aber nicht zwingend — die Wizard-Eingabe könnte auch via Regex validiert werden. Empfehlung: installieren, weil Telefonnummer-Edge-Cases (Festnetz vs. Mobil, Länderwahl, Whitespace, Bindestriche) sonst fummelig werden.
- Vercel/Next.js-Standard-Tools (route handlers, Server Actions) — schon da.

### E) Speicher- und Lese-Fluss (vereinfacht)

```
Beim Wizard-Submit (Projekt-Anlegen):
  Server-Action erhält Wizard-State + ggf. eingegebene Telefonnummer
  1. INSERT projects (title, owner_id, vapi_phone_number?, vapi_pin = DB-Default-zufällig)
     - Falls Nummer schon anderswo: Unique-Constraint-Fehler → an UI weiterreichen
  2. INSERT project_members (projektleiter)
  3. Onboarding-Daten (recipient_name etc.) wie bisher
  Redirect zur Projektübersicht des neuen Projekts.

Beim Öffnen der Projektübersicht:
  Server-Lader liest zusätzlich: projects.vapi_phone_number + vapi_pin
  TelefonSection rendert beides; Bearbeiten-Button nur für Projektleiter sichtbar.

Beim Klick auf "Nummer eintragen/ändern" (Projektleiter):
  Modal öffnet mit aktueller Nummer (oder leer).
  User tippt neue Nummer ein.
  Submit ruft Server-Action "updateVapiPhoneNumber" mit (project_id, neue Nummer).
  Server prüft: Auth + PL-Rolle, E.164-Format, Unique-Constraint.
  UPDATE projects.vapi_phone_number.

Beim eingehenden Anruf bei Vapi:
  Vapi nimmt den Anruf entgegen mit unserer zentralen Nummer.
  Vapi ruft Tool "lookup_by_phone" mit caller_phone:
    Unser Endpoint:
      - SELECT id, title, vapi_pin, vapi_seconds_available FROM projects
        WHERE vapi_phone_number = caller_phone
      - 0 Treffer → return { matched: false }
      - 1 Treffer → return { matched: true, project: {...}, recipient_name }
  Falls matched: Vapi begrüßt mit Projekt-Name.
  Falls nicht matched: Vapi fragt nach Code.
    Vapi ruft Tool "verify_pin" mit pin:
      - SELECT id, title FROM projects WHERE vapi_pin = pin
      - 0 oder >1 → return { matched: false }
      - 1 → return { matched: true, project: {...} }
    Falls nicht matched: Vapi versucht 2x weiter (3 Versuche total), dann beendet.

Nach Identifikation:
  Vapi prüft Guthaben (in lookup-Response enthalten).
  Bei 0 Sek: Vapi-Prompt sagt höflich, Anruf endet (kein voice_sessions-Insert).
  Sonst: Vapi fragt "neues Kapitel oder weiterführen?".

Bei "weiterführen":
  Vapi ruft Tool "list_chapters" mit project_id → letzte 3 Kapitel mit Title + Anker-Zitat.
  Vapi fragt User, welches.
Bei "neu":
  Vapi ruft Tool "suggest_impulse" → zufälliger aktiver Impuls (Title + erste Leitfrage).
  Vapi bietet an; User nimmt/ablehnt/eigenes Thema.

Während des Gesprächs:
  Vapi führt das Gespräch, zählt Verbrauchszeit selbst.
  60s vor Limit: Vapi sagt Vorwarnung (Prompt-Logik).
  Bei 0 / "Tschüss": Vapi sagt Abschied, beendet Anruf.

Nach Anruf-Ende:
  Vapi POSTet End-of-Call-Report an unseren /api/vapi/webhook
  Payload: call.id, project_id, duration_sec, transcript, path, chapter_id?, impulse_id?, topic?
  Unser Endpoint:
    1. Signatur prüfen (sonst 401)
    2. SELECT FROM voice_sessions WHERE vapi_call_id = call.id
       - Falls vorhanden: Idempotenz, return 200 ohne weitere Arbeit
    3. INSERT voice_sessions (project_id, duration_sec, vapi_call_id, chapter_id, user_id = NULL, chapter_origin)
    4. Je nach path:
       - "neu":         INSERT chapters (title, body=transcript, chapter_origin="vapi_call", source_impulse_id?)
       - "weiterführen": UPDATE chapters SET body = body || '\n\n— Erzählt am DD.MM.YYYY ---\n\n' || transcript WHERE id = chapter_id
       - "leeres transcript": kein chapters-Insert/Update, nur voice_session-Insert (Abrechnung)
    5. return 200
```

### F) Migration-Plan

1. **Schema-Migration A** — Erweitert `projects`:
    - neue Spalte `vapi_phone_number` (E.164-Text, nullable, **unique**)
    - neue Spalte `vapi_pin` (6-stellig text, NOT NULL, DB-Default = kryptografisch zufällige 6-stellige Zahl mit führenden Nullen)
    - Backfill für bestehende Projekte: jedes Projekt bekommt eine zufällige `vapi_pin` (NOT-NULL muss erfüllt werden), `vapi_phone_number` bleibt NULL.

2. **Schema-Migration B** — Erweitert `voice_sessions`:
    - neue Spalte `vapi_call_id` (Text, nullable, **unique**) für Idempotenz.

3. **Enum-Migration C** — `chapter_origin` bekommt zusätzlich den Wert `vapi_call`. Postgres-Enum-Erweiterung ist nicht-blockierend (ALTER TYPE ... ADD VALUE).

4. **RLS-Migration D** — Policies erweitern:
    - `projects.vapi_pin` SELECT: jedes Projekt-Mitglied (Read-only sichtbar).
    - `projects.vapi_pin` UPDATE: **gesperrt** für alle regulären Rollen (nur Service-Role beim initialen Insert; kein User-UPDATE).
    - `projects.vapi_phone_number` SELECT: jedes Projekt-Mitglied.
    - `projects.vapi_phone_number` UPDATE: nur Projektleiter (über Server-Action mit Service-Role-Bypass oder spezifischer RLS-Policy).
    - `voice_sessions.vapi_call_id` benötigt keine zusätzlichen RLS-Anpassungen (Tabelle ist eh Service-Role-write-only).

5. **Onboarding-Erweiterung** (kein DB-Schritt):
    - Steps-Array um "phone-number" erweitern (kontext-abhängig).
    - Neuer `StepPhoneNumber`-Component.
    - Wizard-State um `phoneNumber: string | null`.
    - Server-Action beim Submit schreibt die Nummer mit ins INSERT.

6. **Telefon-Sektion ausfüllen** (kein DB-Schritt):
    - `TelefonSection`-Komponente, ersetzt den Placeholder-Text in [page.tsx:321](src/app/projektuebersicht/[project_id]/page.tsx#L321).
    - Server-Action `updateVapiPhoneNumber` (Projektleiter-only).
    - Modal-Komponente für Nummer-Eingabe.

7. **Vapi-Tool-Endpoints + Webhook** (kein DB-Schritt):
    - 4 Tool-Endpoints unter `/api/vapi/tools/...`
    - 1 Webhook-Endpoint unter `/api/vapi/webhook`
    - alle mit Signatur-Check.

8. **Vapi-Dashboard-Setup** (extern, manuell):
    - Account erstellen, Assistant konfigurieren (Prompt, Stimme, LLM, Stille-Wert = 5 Sek, Tool-Definitionen, Webhook-URL).
    - Inbound-Telefonnummer einrichten und mit Assistant verknüpfen.
    - `VAPI_WEBHOOK_SECRET` generieren und in unsere Env-Vars eintragen.

Alle DB-Migrationen laufen zuerst gegen den `stage`-Branch.

### G) Vapi-Tools (Subsystem-Detail)

```
Tool: lookup_by_phone
  Input:  caller_phone (E.164)
  Output: { matched: bool, project?: { id, title, vapi_seconds_available, recipient_name? } }
  Zweck:  Anrufer-Identifikation via Nummer

Tool: verify_pin
  Input:  pin (6-stellig)
  Output: { matched: bool, project?: { id, title, vapi_seconds_available } }
  Zweck:  Fallback-Identifikation via Code

Tool: list_chapters
  Input:  project_id
  Output: { chapters: [{ id, title, opening_snippet }] }  (letzte 3 nach updated_at)
  Zweck:  Auswahl-Hilfe für "weiterführen"

Tool: suggest_impulse
  Input:  (kein)
  Output: { impulse?: { id, title, first_leading_question } }
  Zweck:  Vorschlag für "neues Kapitel"

Webhook: end_of_call
  Input:  { call_id, project_id, duration_sec, transcript, path, chapter_id?, impulse_id?, topic? }
  Output: 200 OK (kein Body nötig)
  Zweck:  Transcript persistieren, voice_session anlegen
```

Alle Tool-Endpoints und der Webhook prüfen die Vapi-Signatur über `VAPI_WEBHOOK_SECRET`. Verworfene Requests werden mit 401 abgewiesen und in Sentry geloggt.

### H) RLS-Übersicht

```
projects
+-- vapi_phone_number  SELECT: jedes Projekt-Mitglied
|                      UPDATE: nur Projektleiter (via Server-Action)
+-- vapi_pin           SELECT: jedes Projekt-Mitglied (Klartext lesbar)
                       UPDATE: gesperrt für alle regulären Rollen
                       INSERT: nur beim Projekt-Insert via DB-Default

voice_sessions
+-- Service-Role schreibt (Webhook); SELECT für Projekt-Mitglieder lesbar
+-- vapi_call_id ist nur intern relevant (Idempotenz)

Vapi-Tool-Endpoints + Webhook
+-- Erreichbar von außen, geschützt durch Signatur-Check
+-- Server-Role für DB-Operationen (umgeht User-RLS, da kein User-Login)
```

### I) Sicherheit + Performance

- **Webhook-Signatur-Check** ist Pflicht — ohne sind alle Endpoints offen für jeden Internet-Bot. Signatur prüft Body-Hash gegen Shared-Secret per HMAC.
- **PIN-Brute-Force ausgeschlossen** durch 3-Versuche-Limit pro Anruf. Kein Rate-Limit auf Tool-Endpoint-Ebene nötig (Vapi-Plattform begrenzt die Aufruffrequenz natürlich auf 1/Anruf).
- **Phone-Number-Unique-Race**: zwei Wizard-Submits mit derselben Nummer gleichzeitig — Postgres-Unique-Constraint blockt einen, Server-Action gibt klaren Fehler zurück.
- **Transcript-Größe**: typische Anrufdauer 5–15 Minuten → 1.000–4.000 Wörter. Postgres-Text-Spalte hat kein praktisches Limit. `chapters.body` ist schon JSONB (TipTap-Doc-Format) — Vapi-Transcript wird daher als TipTap-kompatibler JSON-Block übersetzt (z. B. Plain-Text in Paragraphs). Konkrete Übersetzungslogik in `/frontend` oder `/backend`.
- **Performance der Tool-Endpoints**: Vapi-Spec verlangt < 1 Sek Response für eine flüssige Konversation. Unsere Endpoints haben einfache 1-Row-Lookups mit Index → < 100 ms erwartet.
- **End-of-Call-Webhook-Performance**: ein INSERT + ein INSERT/UPDATE im Worst Case; < 200 ms. Vapi hat einen Timeout — Retry erfolgt automatisch, Idempotenz schützt vor Doppelverarbeitung.
- **DSGVO / Audio-Recording**: Vapi speichert standardmäßig Audio-Aufzeichnungen. Im Vapi-Dashboard prüfen, ob Recording-Retention auf nötiges Minimum gesetzt ist (z. B. 7 Tage). Für DSGVO-Konformität ggf. Audio-Recording **deaktivieren**, nur Transcript behalten — Setup-Entscheidung beim Roll-out.
- **Cost-Tracking**: Vapi-Dashboard zeigt Kosten pro Anruf (LLM + Voice + Telefonie). Saldo-Berechnung in narravit bleibt purely Sekunden-basiert (10h + Top-ups − consumed); die wirtschaftliche Kalkulation der Top-up-Preise (19 €/60min) muss die Vapi-Kosten decken (Stripe-Preis-Konfig in PROJ-6).

### J) Offene Punkte für Folge-Tickets (out of scope für PROJ-12)

- **Audit-Snapshot des Original-Transcripts** vor dem User-Editing: aktuell wird das Transcript zu `chapters.body` und ist nach erster Editor-Bearbeitung "weg". Eigenes Ticket bei Bedarf.
- **PIN-Regenerierung**: bewusst aus dem MVP rausgenommen. Wenn später ein Bedarf entsteht (z. B. Telefon ging verloren, Code könnte kompromittiert sein), eigenes Ticket.
- **Multi-Number-Support pro Projekt** (Handy + Festnetz): bewusst aus dem MVP rausgenommen. Wenn später relevant, Datenmodell-Migration.
- **SMS-Verifikation der eingetragenen Telefonnummer**: aktuell Self-Service ohne Verify. Bei Bedarf eigenes Ticket (z. B. via Twilio, ~5 ct/SMS).
- **Reminder bei niedrigem Sprechzeit-Saldo per Resend-Mail**: könnte in PROJ-11 als zusätzlicher Mail-Typ ergänzt werden, sobald hier echte Nutzungsdaten existieren.
- **Anruf-Statistik im Portal** (wie oft, wann, wie lange wurde angerufen): aktuell nur im Vapi-Dashboard sichtbar. Folge-Ticket falls für Mitglieder relevant.
- **Live-Status "Anruf läuft gerade"** in der Projektübersicht: könnte Realtime-Subscription auf voice_sessions sein. Out of scope.
- **Voice-Commands jenseits von "neu / weiterführen / Tschüss"**: z. B. "Kapitel umbenennen", "letzten Absatz löschen", "lese mir das letzte Kapitel vor". Out of scope.
- **Mehrsprachigkeit**: aktuell nur Deutsch. Andere Sprachen brauchen eigene Vapi-Assistant-Configs.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
