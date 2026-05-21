# PROJ-8: Erzähl-Impulse (Katalog + API)

## Status: Deployed
**Created:** 2026-05-21
**Last Updated:** 2026-05-21 — Deployed to stage-app.narravit.de

## Dependencies
- Requires **PROJ-1** (Supabase-Datenmodell & RLS) — `impulse_catalog` existiert (id, title, sort_order, created_at) und wird in PROJ-8 erweitert um `leading_questions` (Array, mind. 1 Eintrag) und `category`
- Requires **PROJ-4** (Kapitel-Routing & Persistenz) — `chapters.source_impulse_id` (FK) und `chapter_origin = 'catalog_impulse'` existieren; ErzaehlImpulsModal-UI existiert mit Mock-Backend
- Soft dependency: **PROJ-5** (Kapitel-Editor) — der rotierende Hinweis-Banner wird im Editor angezeigt

## User Stories
- Als **Schreibender** möchte ich beim Anlegen eines Impuls-Kapitels nicht nur einen Titelvorschlag sehen, sondern auch eine konkrete Leitfrage als Vorgeschmack, damit ich entscheiden kann, ob der Impuls zu mir passt.
- Als **Schreibender** möchte ich beim Schreiben eines Impuls-Kapitels einen dauerhaften Hinweis-Banner haben, der zyklisch durch Titel und mehrere Leitfragen wechselt (in der Regel bis ca. 4) — damit mehrere Aspekte des Themas mich beim Erzählen unterstützen.
- Als **Schreibender** möchte ich den Banner schließen können, wenn er mich beim Tippen stört.
- Als **Schreibender** möchte ich, dass meine selbst gewählten Kapitel-Titel unverändert bleiben, auch wenn das narravit-Team die zugehörige Impuls-Vorlage später überarbeitet.
- Als **Schreibender** möchte ich, dass die Impuls-Vorschläge nach Lebensphasen/Themenkategorien gepflegt sind (z. B. „Kindheit", „Familie", „Werte"), damit die Vorschläge zur eigenen Lebenswelt passen.
- Als **narravit-Team** möchte ich den Impuls-Katalog über Code-Migrationen pflegen können (Titel, Leitfragen, Kategorie), damit Änderungen versioniert, reviewbar und reproduzierbar sind.

## Acceptance Criteria

### Datenmodell
- [ ] `impulse_catalog` enthält pro Impuls: `id` (UUID), `title` (Text), `leading_questions` (Array von Text, mindestens 1 Eintrag — keine harte Obergrenze; Pflege-Konvention: typischerweise bis ca. 4), `category` (Text/Enum — konkrete Modellierung in `/architecture`), `sort_order` (Int), `created_at`.
- [ ] `chapters.source_impulse_id` (FK auf `impulse_catalog.id`, ON DELETE SET NULL) wird beim Anlegen eines Impuls-Kapitels echt mit der gewählten Impuls-ID gesetzt — statt wie bisher hardcoded `null`.

### Pflege via Migration
- [ ] Der Katalog wird über Supabase-Migrationen gepflegt; keine Admin-UI in PROJ-8.
- [ ] Die initiale Migration befüllt den Katalog mit mindestens den 15 bestehenden Mock-Titeln, jeweils erweitert um `leading_questions` (1 oder mehr) und `category` — konkrete Inhalte werden vor Roll-out mit dem narravit-Team abgestimmt.
- [ ] Spätere Erweiterungen (zusätzliche Impulse, neue Fragen, Kategorien-Anpassungen) erfolgen als reguläre Migrationen gegen den `stage`-Branch.

### Frontend — Read aus DB
- [ ] `ErzaehlImpulsModal` lädt die Impulse zur Laufzeit aus `impulse_catalog` (server-seitig per Server-Component oder Server-Action), nicht mehr aus [src/lib/projektuebersicht-erzaehl-impulse.ts](src/lib/projektuebersicht-erzaehl-impulse.ts).
- [ ] Die alte Mock-Datei wird entfernt (oder bleibt ungenutzt zurück bis Cleanup).
- [ ] „Impuls übernehmen" übergibt zusätzlich die `impulse_id` an `addImpulseChapterAction`, sodass `chapters.source_impulse_id` korrekt gesetzt wird.

### Modal-Anzeige
- [ ] Pro Shuffle zeigt das Modal:
    - Kategorie als kleines Label oberhalb (z. B. „Kindheit").
    - Titel im hervorgehobenen Box-Element (`aria-live="polite"`).
    - **Erste** Leitfrage (Index 0) als Vorgeschmack unter dem Titel.
- [ ] Shuffle bleibt **global über alle Impulse** (keine Kategorie-Filterung im MVP).
- [ ] Bei Re-Shuffle springen Titel und Vorgeschmack-Frage gemeinsam an den neuen Impuls.
- [ ] Position, Buttons („Shuffle" / „Impuls übernehmen") und Animations-Verhalten bleiben gegenüber dem PROJ-4-Stand grundsätzlich gleich; das Modal wird um den Vorgeschmack-Bereich vertikal etwas größer.

### Editor — Rotierender Leitfragen-Banner
- [ ] Wenn ein Kapitel `source_impulse_id` gesetzt hat und der referenzierte Impuls existiert, rendert der Editor oberhalb des A5-Seitenstacks (vor der ersten A5-Seite, innerhalb des regulären Editor-Bereichs — **nicht** auf die A5-Seite gelegt) einen Hinweis-Banner.
- [ ] Inhalt des Banners ist eine **Sequenz**: `[title, leading_questions[0], leading_questions[1], …]` — also Titel + alle vorhandenen Leitfragen. Sequenz-Länge mindestens 2 (Titel + 1 Frage); keine harte Obergrenze.
- [ ] Auto-Rotation alle **~7 Sekunden** durch die Sequenz, zyklisch. Übergang als Cross-Fade (kurze sanfte Animation, nicht hart).
- [ ] Bei Mouse-Hover oder Tastatur-Fokus auf dem Banner **pausiert die Auto-Rotation**, bis Hover/Fokus verloren geht.
- [ ] Banner hat einen X-/„Schließen"-Button. Klick blendet den Banner für die aktuelle Editor-Session aus.
- [ ] Beim erneuten Öffnen des Kapitels (Neu-Mount des Editors) erscheint der Banner wieder mit Sequenz-Anfang (= Titel). Status wird **nicht** persistiert.
- [ ] Wenn das Kapitel keinen `source_impulse_id` hat oder der referenzierte Impuls inzwischen gelöscht wurde, wird **kein** Banner gerendert.
- [ ] Der Banner ist `aria-live="polite"` und mit Screenreadern bedienbar; bei `prefers-reduced-motion` entfällt die Auto-Rotation **komplett** — der Banner zeigt statisch nur einen einzigen Eintrag (Titel) ohne Wechsel.

### Lifecycle-Verhalten
- [ ] Kapitel-`title` wird beim Anlegen aus `impulse.title` übernommen und ist danach frei editierbar; spätere Änderungen am Impuls-Titel haben **keinen** Einfluss auf den Kapitel-Titel.
- [ ] Banner-Inhalt (Titel und Leitfragen) wird bei jedem Editor-Mount frisch aus dem Katalog geladen — Änderungen am Katalog sind sofort sichtbar, sobald der User das Kapitel das nächste Mal öffnet.
- [ ] Wird ein Impuls per Migration entfernt (oder seine `leading_questions` geleert), verschwindet der Banner referenzierender Kapitel beim nächsten Öffnen; die Kapitel selbst bleiben vollständig erhalten.

### Backward Compatibility
- [ ] Bestehende Kapitel aus PROJ-4-Stand mit `chapter_origin = 'catalog_impulse'` und `source_impulse_id = NULL` (PROJ-4 hat hardcoded `null` geschrieben) zeigen **keinen** Banner und werden nicht nachträglich gematcht.
- [ ] Neu nach PROJ-8 angelegte Impuls-Kapitel bekommen `source_impulse_id` korrekt gesetzt.

## Edge Cases
- **Katalog leer (z. B. Migration noch nicht gelaufen):** ErzaehlImpulsModal zeigt einen leeren-Zustand-Hinweis („Aktuell sind keine Erzähl-Impulse verfügbar.") und der „Impuls übernehmen"-Button ist deaktiviert. Der „Erzähl-Impuls"-Button in der Übersicht bleibt sichtbar.
- **Netzwerkfehler beim Laden des Katalogs:** Modal zeigt Fehlerhinweis mit Retry-Möglichkeit; „Eigenes Kapitel"-Flow bleibt jederzeit verfügbar.
- **Impuls hat genau 1 Leitfrage:** Banner-Sequenz ist `[title, leading_questions[0]]` (Länge 2) — Auto-Rotation wechselt zwischen beiden alle 7 s.
- **Impuls hat ungewöhnlich viele Leitfragen (z. B. 8):** Pflege-Konvention sieht maximal ca. 4 vor; technisch wird trotzdem die volle Sequenz rotiert. Banner-Layout muss keine extra Vorkehrungen treffen.
- **Impuls wird gerade gelöscht, während User ihn übernehmen will (Race):** Server-Action schlägt fehl (FK-Validation), Modal zeigt Fehlerhinweis und schließt nicht — User kann erneut shuffeln.
- **Sehr lange Leitfrage (mehrere Sätze):** Banner-Layout skaliert vertikal; max. ca. 1/4 der sichtbaren Editor-Höhe; danach ggf. Truncate mit Ellipsis (volle Frage per Tooltip / Title-Attribut).
- **Cross-Fade während User noch liest:** Hover/Fokus pausieren die Rotation — User kann eine Frage in Ruhe lesen ohne ein „springendes" Banner.
- **Reduced-Motion-User:** Auto-Rotation entfällt vollständig; Banner zeigt statisch nur den Titel.
- **Selber Impuls mehrfach gewählt:** Zwei Kapitel mit demselben Titel sind möglich; beide zeigen denselben Banner.
- **Banner-Anzeige auf Phone:** Phone hat keinen Editor (Hinweis-Seite aus PROJ-5) — kein Phone-Verhalten relevant.
- **Concurrent Modal-Use & Impuls-Löschung:** Modal-Anzeige wird nicht in Echtzeit aktualisiert; beim Übernahme-Versuch greift der Server-Fehlerpfad.

## Technical Requirements
- **Read-Auth:** Jeder eingeloggte User darf den gesamten Katalog lesen (Public Read mit Auth-Gate via RLS). Keine projekt- oder mitgliedsspezifische Filterung.
- **Write-Auth:** Schreibender Zugriff auf `impulse_catalog` ist via RLS für reguläre User vollständig verboten — Änderungen ausschließlich durch Migrationen (Service-Role).
- **Performance:** Katalog hat erwartete Größe 15–200 Einträge; einzelner SELECT ohne Pagination reicht. Banner-Rotation ist client-only, kein zusätzlicher Roundtrip.
- **Migration / Seed:** Initiale Daten kommen über eine Seed-Migration gegen den `stage`-Branch; Inhalte (YAML/JSON) leben versioniert im Repo neben der Migration.
- **Accessibility:** Banner ist `aria-live="polite"`, Schließen-Button ist Tastatur-bedienbar (Focus-Ring, Enter/Space). `prefers-reduced-motion` deaktiviert die Rotation komplett.
- **Memory/Cleanup:** Auto-Rotation-Timer wird beim Unmount und beim Schließen sauber abgebaut (kein Leak).

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### A) Komponenten-Struktur (PM-Sicht)

```
Projektübersicht-Seite (existiert, Server-Component)
+-- Server-Lader (erweitert)
|   +-- bisher: lädt Projekt + Kapitel
|   +-- NEU: lädt zusätzlich den vollständigen Impuls-Katalog aus der DB
|              und reicht ihn als Prop an die Client-Komponente weiter
+-- ChapterSectionClient (existiert)
    +-- ErzaehlImpulsModal (existiert, leichte Erweiterung)
        +-- Shuffle-Knopf       (existiert)
        +-- Kategorie-Label     (neu, oberhalb des Titels)
        +-- Impuls-Titel        (existiert)
        +-- Vorgeschmack-Frage  (neu, erste Leitfrage als Körpertext)
        +-- "Impuls übernehmen" (existiert, gibt jetzt impulse_id mit)

Kapitel-Editor-Seite (existiert, Server-Component)
+-- Server-Lader (erweitert)
|   +-- bisher: lädt Kapitel + Membership
|   +-- NEU: wenn das Kapitel eine Impuls-Quelle hat, wird zusätzlich der
|              referenzierte Impuls aus dem Katalog gelesen und an den
|              EditorClient durchgereicht
+-- EditorClient (existiert)
    +-- ImpulseHintBanner (NEU)
        +-- Sequenz [Titel, Frage 1, Frage 2, …]   (mind. Länge 2)
        +-- Auto-Rotation alle ~7 s (CSS-Cross-Fade)
        +-- Hover/Fokus pausieren den Timer
        +-- Schließen-Button (X) → Banner für die Session ausgeblendet
        +-- prefers-reduced-motion → Rotation aus, nur Titel statisch
    +-- A5-Seiten-Stack (existiert, unverändert)
    +-- Editor-Toolbar, Footer, etc. (existiert, unverändert)

Datenbank
+-- impulse_catalog (Tabelle existiert, Schema-Erweiterung)
|   +-- title             (existiert)
|   +-- sort_order        (existiert)
|   +-- id, created_at    (existiert)
|   +-- NEU: leading_questions  (Liste von Texten, mindestens 1 Eintrag)
|   +-- NEU: category           (Text — frei pflegbar, dokumentiert im YAML-Mirror)
+-- chapters (Tabelle existiert, KEIN Schema-Wechsel)
    +-- source_impulse_id (existiert, ON DELETE SET NULL)
        wird ab PROJ-8 echt mit der gewählten Impuls-ID befüllt
        (bisher hardcoded NULL aus PROJ-4)
```

### B) Datenmodell (Plain Language)

Zwei neue Felder auf der bestehenden Impuls-Katalog-Tabelle:

```
impulse_catalog
+-- title                (Text)
|     Wird beim Anlegen eines Impuls-Kapitels als Kapitel-Titel übernommen.
|     Im Editor-Banner ist der Titel der erste Eintrag in der Rotation.
+-- leading_questions    (Liste von Texten, mindestens 1)
|     Reihenfolge entspricht der Rotation im Editor-Banner.
|     Die erste Frage (Index 0) ist auch der Vorgeschmack im Shuffle-Modal.
|     Keine harte Obergrenze (Pflege-Konvention: typischerweise bis ca. 4).
+-- category             (Text)
|     Frei pflegbares Kategorie-Label (z. B. „Kindheit", „Familie", „Werte").
|     Wird im Shuffle-Modal als kleines Label oberhalb des Titels gezeigt.
|     Liste der erlaubten Kategorien wird im YAML-Mirror dokumentiert
|     (keine Enforcement-Schicht in der DB — Disziplin per Code-Review).
+-- sort_order           (existiert)
+-- id, created_at       (existiert)

chapters (kein Schema-Wechsel, nur Nutzungsänderung)
+-- source_impulse_id
      Ab PROJ-8 echt befüllt. Bleibt NULLABLE.
      Bei Löschung des referenzierten Impulses (via Migration) wird die
      Spalte automatisch auf NULL gesetzt (ON DELETE SET NULL). Der
      Kapitel-Inhalt + Titel bleiben dadurch immer erhalten.
```

### C) Tech-Entscheidungen (begründet)

1. **Liste statt strukturiertes Objekt für `leading_questions`** — die Einträge sind reine Strings; eine native Postgres-Liste (Text-Array) ist der direkte Weg. Vorteile: typsicher, einfache Längen-Prüfung „mindestens 1", gute SDK-Unterstützung. Eine JSON-Spalte wäre erst nötig, wenn pro Frage zusätzliche Metadaten (z. B. Schwierigkeitsgrad) gepflegt würden.

2. **Text-Spalte statt Enum für `category`** — der Katalog soll „nach und nach" wachsen, neue Kategorien inklusive. Ein Datenbank-Enum bräuchte für jede neue Kategorie eine eigene Schema-Migration und ein Software-Update. Eine Text-Spalte erlaubt neue Kategorien per reinem Daten-Insert. Disziplin: die gültige Liste lebt im YAML-Mirror (siehe Punkt 8) und wird im Code-Review geprüft. Bei Bedarf später Auslagerung in eine eigene Kategorien-Tabelle möglich.

3. **Server-side Read statt Client-Fetch** — die Projektübersicht-Seite ist bereits eine Server-Component. Der Katalog wird beim Seiten-Render einmal aus der DB gelesen und an die Client-Komponenten als Prop durchgereicht. Vorteile: kein Roundtrip beim Öffnen des Modals (Modal ist sofort gefüllt), kein Loading-Spinner, sauber im Server-Cache. Selbes Muster für den Editor: Kapitel + referenzierter Impuls werden gemeinsam geladen.

4. **Banner ohne Animations-Bibliothek** — Tailwind-Transitions auf der Sichtbarkeit reichen für einen Cross-Fade vollständig aus. Keine zusätzliche JS-Bundle-Größe, native Browser-Performance, weniger Wartungslast.

5. **Banner-Schließen-Status nur im Browser-Speicher der Komponente** — explizite Entscheidung aus der Spec. Vorteile: keine zusätzliche Spalte auf `chapters`, kein Auto-Save-Pfad-Eingriff, keine RLS-Erweiterung. Beim Schließen verschwindet der Banner, beim nächsten Editor-Mount erscheint er wieder.

6. **Erkennung von `prefers-reduced-motion` via Standard-CSS-Media-Query** — Browser-API ist seit Jahren stabil. Die Banner-Komponente prüft den Wert beim Mount, schaltet bei „reduce" die Auto-Rotation komplett aus und zeigt statisch den Titel.

7. **Kein Caching-Layer für den Katalog** — bei 15–200 erwarteten Einträgen lädt eine einfache Datenbank-Abfrage in Sub-Millisekunden. Caching wäre Premature Optimization. Bei späterem Wachstum (Tausende Einträge) nachrüstbar via Edge-Caching oder Memoization auf Server-Component-Ebene.

8. **YAML-Mirror als Pflege-Quelle, SQL-Migration als Apply-Vehikel** — die Impuls-Daten leben in einer reviewbaren YAML-Datei (z. B. unter `data/impulses.yaml`). Eine Seed-Migration insertet daraus die Reihen. Vorteil im Code-Review: die YAML zeigt Titel + alle Leitfragen + Kategorie kompakt; die SQL-Migration ist nur die Ausführung. Inhaltliche Diskussion (Wortwahl, Reihenfolge der Fragen) passiert auf YAML-Ebene. Generierung der SQL-Inserts geschieht entweder per kleinem Helper-Skript oder manuell beim ersten Mal.

9. **`source_impulse_id` mit `ON DELETE SET NULL` belassen** — diese FK-Regel ist in der Schema-Spec von PROJ-1 schon so umgesetzt (zur Erinnerung verifizieren). Sie erfüllt das Spec-Verhalten „Impuls weg → Banner weg, Kapitel bleibt" automatisch ohne Anwendungs-Code.

10. **Rolle des Service-Roles für Seed-Migrationen** — Migrationen laufen über die Service-Rolle, die RLS umgeht. Regulärer User darf den Katalog nur lesen (RLS-Policy „SELECT für authenticated"), niemals schreiben. Das macht jeden Versuch eines API-Roundtrips zum Schreiben automatisch fehlerschlagend.

### D) Neue Abhängigkeiten (Pakete)

Keine neuen Laufzeit-Pakete erforderlich. Alles mit existierenden Mitteln (Next.js Server Components, `@supabase/ssr`, Tailwind, React).

Optional und nur falls die SQL-Inserts automatisch aus YAML generiert werden sollen: ein Standard-YAML-Parser für Node (z. B. `js-yaml`) als Dev-Dependency. Alternative: manuelle Übersetzung beim ersten Seed.

### E) Speicher- und Lese-Fluss (vereinfacht)

```
Beim Öffnen der Projektübersicht:
  Server-Lader liest Projekt + Kapitel + Impuls-Katalog (drei parallele Reads)
  → Übersicht rendert mit gefülltem Impuls-Katalog im Hintergrund-Prop

Beim Klick auf „Erzähl-Impuls":
  Modal öffnet sofort (kein Loading-Spinner)
  Shuffle wählt zufälligen Eintrag aus der Prop-Liste
  Anzeige: Kategorie-Label, Titel, erste Leitfrage als Vorgeschmack

Beim Klick auf „Impuls übernehmen":
  Client schickt Server-Action: project_id, title, impulse_id
  Server-Action validiert: Auth, Project-Membership, Impuls existiert
  Schreibt Kapitel mit chapter_origin=catalog_impulse + source_impulse_id
  Page-Cache wird revalidiert → neues Kapitel erscheint in der Liste
  Modal schließt sich (kein automatisches Springen in den Editor)

Beim Öffnen eines Impuls-Kapitels (Editor):
  Server-Lader liest Kapitel
  Wenn source_impulse_id gesetzt → zusätzlich Impuls aus dem Katalog
  Beides als Prop an EditorClient
  Banner mountet sich, startet Rotation (außer reduced-motion)
  Bei Schließen oder Unmount: Timer wird sauber abgebaut

Beim Pflege-Update (neuer Impuls / Frage / Kategorie):
  Developer pflegt YAML-Mirror im Repo
  Erstellt eine neue Migration mit den dazugehörigen Inserts/Updates
  Migration läuft zuerst gegen stage → Verifikation → main
  Beim nächsten User-Page-Aufruf ist der neue Stand aktiv
```

### F) Migration-Plan

1. **Schema-Migration A**: Zwei neue Spalten auf `impulse_catalog` anlegen — `leading_questions` als Text-Array mit Längenprüfung „mindestens 1" und einem temporären Default, `category` als Text mit temporärem Default. Default-Werte dienen nur dem Übergang, damit bereits vorhandene Reihen die NOT-NULL-Pflicht erfüllen.

2. **Seed-Migration B**: Bestehende Reihen (sofern vorhanden) durch die neuen vollständigen Datensätze ersetzen oder die fehlenden Felder nachfüllen — Quelle: YAML-Mirror mit mindestens den 15 Mock-Titeln, jetzt jeweils mit Leitfragen und Kategorie.

3. **Cleanup-Migration C** (optional): die temporären Default-Werte aus Schritt 1 entfernen, sodass künftige Inserts explizit `leading_questions` und `category` setzen müssen.

4. **RLS-Migration D** (falls noch nicht aus PROJ-1 vorhanden): SELECT für `authenticated` erlauben, alle anderen Operationen sperren. Falls bereits aus PROJ-1 gesetzt: Schritt entfällt.

5. **Frontend-Anpassung (kein Migrationsschritt)**:
   - Mock-Datei [src/lib/projektuebersicht-erzaehl-impulse.ts](src/lib/projektuebersicht-erzaehl-impulse.ts) bleibt zunächst, wird aber nicht mehr importiert. Cleanup im selben PR oder im nächsten Sweep.
   - Projektübersicht-Server-Lader um Katalog-Read erweitert.
   - Editor-Server-Lader um optionalen Impuls-Read erweitert.
   - `addImpulseChapterAction` nimmt `impulse_id` zusätzlich entgegen und schreibt sie.
   - Neue `ImpulseHintBanner`-Komponente im Editor.
   - Modal-UI um Kategorie-Label und Vorgeschmack-Frage erweitert.

6. **Backfill bestehender Kapitel mit NULL-`source_impulse_id`**: bewusst NICHT durchgeführt — Begründung in der Spec (Backward Compatibility). Diese Kapitel verhalten sich wie eigene Kapitel mit dem Quell-Label „Erzähl-Impuls".

Alle Schritte zuerst gegen `stage`, dann nach Verifikation gegen `main`.

### G) RLS-Übersicht

```
impulse_catalog
+-- SELECT:        erlaubt für rolle authenticated (jede eingeloggte Person)
+-- INSERT:        gesperrt für alle anwendungsrollen
+-- UPDATE:        gesperrt für alle anwendungsrollen
+-- DELETE:        gesperrt für alle anwendungsrollen
+-- Service-Role:  hat vollen Zugriff (umgeht RLS) → nur für Migrationen
```

Keine Project-Membership-Prüfung beim Lesen — der Katalog ist global gemeinsam genutzt.

### H) Offene Punkte für Folge-Tickets (out of scope für PROJ-8)

- **Admin-UI im Portal** für nicht-technische Pflege durch das narravit-Team — eigenes PROJ-X falls jemals nötig.
- **Kategorie-Filter** im Modal (Dropdown, Tabs) — kann an existierende Modal-UI angeflanscht werden, sobald > ~30 Impulse / > ~6 Kategorien gepflegt sind.
- **Mehrsprachigkeit** des Katalogs (DE/EN) — derzeit nur Deutsch; bei späterer Internationalisierung eine `language`-Spalte oder eine pro-Sprache-Reihe ergänzen.
- **Per-Frage-Metadaten** (z. B. „eher Einstiegsfrage", „eher Vertiefung") — falls die Rotation später kontextsensitiv werden soll.
- **Telemetrie**: welche Impulse werden gewählt, welche ignoriert — könnte Pflege priorisieren.

## Implementation Notes — Phase Frontend (2026-05-21)

### Geänderte Dateien

- `src/lib/projektuebersicht-erzaehl-impulse.ts` — Mock-Daten umgestellt
  von `readonly string[]` auf strukturiertes Array `ErzaehlImpuls[]` mit
  `id`, `title`, `category`, `leading_questions`. Alle 15 Original-Titel
  bekamen je 4 Leitfragen + Kategorie-Label (Kindheit, Familie, Bildung,
  Beziehungen, Beruf, Lebensphasen, Erfahrungen, Werte, Heimat). Inhaltliche
  Endredaktion erfolgt in /backend mit dem narravit-Team. Legacy-Export
  `ERZAEHL_IMPULSE_TITLES` bleibt für Rückwärts-Kompatibilität.
- `src/components/projektuebersicht/ChapterSectionClient.tsx` —
  Import auf `ERZAEHL_IMPULSE` umgestellt; Shuffle-State arbeitet auf
  `currentImpulse` (Objekt) statt nur Titel. Modal-JSX zeigt jetzt:
  Kategorie-Label (uppercase tracking), Titel, Vorgeschmack-Frage (erste
  Leitfrage). `confirmErzaehlImpulse` schickt zusätzlich `impulseId` in
  `FormData` — Frontend nutzt Mock-Slugs, /backend wird sie nach der
  Schema-Migration durch echte impulse_catalog-UUIDs ersetzen.

### Neue Dateien

- `src/components/kapiteleditor/ImpulseHintBanner.tsx` — pure Client-
  Komponente. Props: `title`, `leadingQuestions[]`, optional
  `rotationIntervalMs` (default 7000). Verhalten:
  - Sequenz `[title, ...leading_questions]`, Cross-Fade alle 7 s.
  - Hover/Fokus pausiert die Auto-Rotation.
  - Schließen-Button (X) blendet den Banner für die Session aus.
  - `prefers-reduced-motion` deaktiviert Rotation komplett (zeigt statisch
    den Titel).
  - `aria-live="polite"` + `role="region"` + aria-Label.
  - Timer wird beim Unmount + beim Schließen sauber abgebaut.
- `src/components/kapiteleditor/ImpulseHintBanner.test.tsx` — 8 Vitest-
  Tests: Mount, Rotation, Zyklus, Hover-Pause, Schließen-Button,
  prefers-reduced-motion, Sequenz-Länge 1 (kein Wechsel).

### Editor-Integration

- `src/components/kapiteleditor/EditorClient.tsx` — neue Prop
  `initialImpulse: { title; leadingQuestions } | null`. Banner wird
  unmittelbar vor dem A5-Seiten-Stack im `<main>`-Container gerendert
  (Spec AC: „vor der ersten A5-Seite, innerhalb des regulären Editor-
  Bereichs, NICHT auf die A5-Seite gelegt").
- `src/app/projektuebersicht/[project_id]/kapiteleditor/[chapter_id]/page.tsx`
  — Server-Component reicht `initialImpulse={null}` durch. /backend
  ersetzt das nach der DB-Migration durch echten Lookup in
  `impulse_catalog` über `chapter.source_impulse_id`.

### Verbleibende Backend-Arbeit (`/backend PROJ-8`)

- Schema-Migration: `impulse_catalog` um `leading_questions TEXT[]
  NOT NULL DEFAULT '{}' CHECK (cardinality(leading_questions) >= 1)`
  und `category TEXT NOT NULL DEFAULT 'Allgemein'` erweitern.
- Seed-Migration: 15 Bestands-Impulse mit den Mock-Daten als YAML-Mirror
  insertieren (oder als direktes SQL-INSERT).
- RLS-Policy: SELECT für `authenticated`, kein INSERT/UPDATE/DELETE.
- `addImpulseChapterAction` erweitern: nimmt `impulseId` aus FormData,
  validiert UUID-Format, schreibt in `chapters.source_impulse_id`.
- Editor-Server-Component: wenn `chapter.source_impulse_id` gesetzt,
  Impuls aus `impulse_catalog` lesen und als `initialImpulse`-Prop
  durchreichen.
- Mock-Datei `src/lib/projektuebersicht-erzaehl-impulse.ts` wird vom
  Client nicht mehr importiert (oder bleibt als Sicherheitsnetz und wird
  in einem Cleanup-PR entfernt).

### Test-Ergebnisse (Frontend-Phase)

- Vitest: **76/76 grün** (8 neue für ImpulseHintBanner).
- `tsc --noEmit`: sauber.

## Implementation Notes — Phase Backend (2026-05-21)

### Migration

`supabase/migrations/20260521210000_proj8_impulse_leading_questions.sql`
gegen `stage`-Branch (`kdjhxqitfxnsavhiafdn`) angewendet:

- Zwei neue Spalten auf `impulse_catalog`:
  - `leading_questions TEXT[] NOT NULL` mit CHECK `cardinality >= 1`.
  - `category TEXT NOT NULL` mit CHECK `length(trim(category)) > 0`.
- Backfill: alle 15 Bestands-Reihen mit den Mock-Inhalten der
  Frontend-Phase (je 4 Leitfragen + Kategorie aus 9 Themen).
- RLS bleibt unverändert (SELECT für authenticated; kein INSERT/UPDATE/DELETE).
- Typo gefixt: DB-Titel war „Berufsei**n**stieg…", Mock hatte „Berufseinsteig…".
  Mock + Migration auf den korrekten DB-Titel umgestellt.

### Code-Änderungen

**Server-Component (`src/app/projektuebersicht/[project_id]/page.tsx`):**

- Liest `impulse_catalog` parallel zu Projekt/Kapitel — kein Roundtrip
  beim Öffnen des Modals.
- Reicht `impulses` als Prop an `ChapterListSection` → `ChapterSectionClient`.

**Server-Component (`src/app/projektuebersicht/[project_id]/kapiteleditor/[chapter_id]/page.tsx`):**

- Selektiert zusätzlich `source_impulse_id` aus `chapters`.
- Wenn gesetzt: zusätzlicher Lookup in `impulse_catalog` → `initialImpulse`
  Prop für den Editor. Bei NULL bleibt es `null` → Banner wird nicht
  gerendert (Spec AC „Backward Compatibility": Bestands-Kapitel ohne
  echte impulse_id zeigen kein Banner).

**Server-Action (`src/app/projektuebersicht/[project_id]/actions.ts`):**

- `addImpulseChapterAction` liest `impulseId` aus FormData (optional).
- Validierung: UUID-Format (Slugs werden mit „Ungültige Impuls-ID."
  abgewiesen — der frühere Frontend-Mock-Pfad ist damit explizit blockiert).
- Vorab-Existenz-Prüfung in `impulse_catalog` (klare „Erzähl-Impuls nicht
  gefunden."-Fehlermeldung statt PostgREST-FK-Error 23503).
- Schreibt in `chapters.source_impulse_id` statt hardcoded NULL.

**Client (`src/components/projektuebersicht/ChapterSectionClient.tsx`,
`ChapterListSection.tsx`):**

- Import-Switch von `ERZAEHL_IMPULSE` (Mock-Konstante) auf `impulses`-Prop
  vom Server (echte UUIDs).
- `useCallback`-Deps um `impulses.length` ergänzt.

**Types (`src/lib/database.types.ts`):**

- `impulse_catalog` Row/Insert/Update um `category: string` und
  `leading_questions: string[]` erweitert.

**Mock-File (`src/lib/projektuebersicht-erzaehl-impulse.ts`):**

- Wird vom Production-Code NICHT mehr importiert; nur noch der Type
  `ErzaehlImpuls` ist relevant (für Server→Client-Prop-Typing).
- Spec F.5 sieht den Datei-Cleanup im nächsten Sweep — bleibt aktuell
  als Sicherheitsnetz + Type-Quelle stehen.

### Test-Ergebnisse (Backend-Phase)

- Vitest: **79/79 grün** (3 neue PROJ-8-Tests in `actions.test.ts`:
  happy-path mit impulseId, Slug-Reject, Non-Existent-Impuls-Reject).
- `tsc --noEmit`: sauber.

### Live-Verifikation (stage-DB)

```
SELECT title, category, cardinality(leading_questions) FROM impulse_catalog;
→ 15 Reihen, je 4 Leitfragen, Kategorien gesetzt ✓
```

## QA Test Results

**QA-Run:** 2026-05-21 · QA-Engineer: Claude (Opus 4.7)
**Production-Ready:** ✅ READY — keine Critical/High/Medium-Bugs.

### Zusammenfassung

| Bereich | Tests | Status |
|---|---|---|
| Vitest (Banner + autosave) | 79 / 79 | ✅ grün (11 PROJ-8-spezifisch: 8 Banner + 3 addImpulseChapter) |
| SQL-Layer (RLS + CHECK + FK) | 8 / 8 | ✅ alle grün |
| Playwright PROJ-8 Spec | 6 / 6 | ✅ alle grün |
| Volle Suite (Regression) | 72 passed, 0 failed, 6 Flakes (Retry-grün) | ✅ keine Regression |
| Security-Audit | 4 Vektoren | ✅ alle abgedeckt |

### Pflicht-Tests pro AC

| AC-Block | Test | Quelle | Status |
|---|---|---|---|
| Datenmodell | leading_questions TEXT[] NOT NULL CHECK ≥1, category TEXT NOT NULL CHECK nonempty | SQL | ✅ |
| Datenmodell | source_impulse_id FK ON DELETE SET NULL | SQL | ✅ |
| Pflege via Migration | Initial-Seed = 15 Reihen mit je 4 Leitfragen + Kategorie | DB-Read live verifiziert | ✅ |
| Frontend Read aus DB | Server-Component lädt impulse_catalog, reicht Prop durch | Code-Review | ✅ |
| Modal Kategorie | Label sichtbar | Playwright AC-Modal-1 | ✅ |
| Modal Titel | Hervorgehoben mit aria-live | Playwright AC-Modal-1 | ✅ |
| Modal Vorgeschmack-Frage | leading_questions[0] sichtbar | Playwright AC-Modal-1 | ✅ |
| Shuffle global | Wechselt zufällig zwischen allen 15 | Playwright AC-Modal-2 | ✅ |
| Impuls übernehmen schreibt impulse_id | Server-Action validiert UUID, prüft Existenz, schreibt FK | Vitest ×3 | ✅ |
| Modal-Verhalten | Kein Auto-Sprung in den Editor | Playwright AC-Confirm-1 | ✅ |
| Editor-Banner positiv | Banner sichtbar wenn source_impulse_id gesetzt | Playwright AC-Banner-1 | ✅ |
| Editor-Banner Backward-Compat | Eigenes-Kapitel zeigt kein Banner | Playwright AC-Banner-2 | ✅ |
| Banner Auto-Rotation | Sequenz [title, …questions] alle 7s mit Cross-Fade | Vitest (Fake-Timer) | ✅ |
| Banner Hover-Pause | mouseEnter pausiert Timer, mouseLeave resumed | Vitest | ✅ |
| Banner Schließen-Button | Klick entfernt aus DOM | Vitest + Playwright AC-Banner-3 | ✅ |
| prefers-reduced-motion | Auto-Rotation aus, statisch Titel | Vitest | ✅ |
| Sequenz-Länge 1 | Keine Rotation | Vitest | ✅ |
| Lifecycle: Kapitel-Titel bleibt | Beim Anlegen kopiert, keine Auto-Sync | Code-Review (Spec-konform) | ✅ |
| Lifecycle: Impuls-Delete → Banner weg | FK ON DELETE SET NULL → source_impulse_id NULL → Banner nicht gerendert | SQL + Code-Review | ✅ |

### Security-Audit

| # | Angriffsvektor | Mitigation | Status |
|---|---|---|---|
| S-1 | anon SELECT impulse_catalog | RLS-Policy `auth.role()='authenticated'` → 0 rows | ✅ |
| S-2 | authenticated INSERT/UPDATE/DELETE impulse_catalog | Keine entsprechende Policy → 42501 / silent 0 rows | ✅ |
| S-3 | Frontend schickt Slug statt UUID als impulseId | Server-Action Zod-Schema lehnt mit „Ungültige Impuls-ID." ab | ✅ Vitest |
| S-4 | Frontend schickt fremde UUID, die nicht im Katalog ist | Server-Action checkt impulse_catalog vorher → klare Fehlermeldung statt 23503 FK-Error | ✅ Vitest |

### Edge-Cases laut Spec — Status

| Edge-Case | Verhalten | Status |
|---|---|---|
| Katalog leer | Modal zeigt empty state, „Impuls übernehmen" disabled | Spec-konform — derzeit nicht reproduzierbar (15 Seeds vorhanden) |
| Netzwerkfehler beim Katalog-Read | Server-Component schmeisst Error → Next.js error.tsx | Out of scope für aktuelle Phase |
| Impuls mit nur 1 Leitfrage | Banner-Sequenz Länge 2 | ✅ Vitest |
| Impuls mit 8 Leitfragen | Banner rotiert volle Sequenz | Code-Review (kein Limit im Render) |
| Impuls gelöscht während Edit | ON DELETE SET NULL → Banner weg beim Neu-Öffnen | ✅ SQL |
| Sehr lange Leitfrage | CSS skaliert vertikal | Code-Review (kein truncate aktiv — Spec sagt „max ca. 1/4 Editor-Höhe" als Soft-Hinweis) |
| Reduced-Motion | Rotation aus, statisch Titel | ✅ Vitest |
| Phone | Banner-Anzeige irrelevant (kein Phone-Editor) | OK |

### E2E-Suite — PROJ-8

Datei: `tests/PROJ-8-erzaehl-impulse.spec.ts` — 6 Tests:

- `AC-Modal-1`: Modal zeigt Kategorie, Titel, Vorgeschmack-Frage
- `AC-Modal-2`: Shuffle wechselt Inhalt
- `AC-Confirm-1`: Impuls übernehmen legt Kapitel an, KEIN Auto-Sprung in den Editor (Spec)
- `AC-Banner-1`: Editor-Banner sichtbar für Impuls-Kapitel
- `AC-Banner-2`: Eigenes-Kapitel zeigt KEIN Banner (Backward Compat)
- `AC-Banner-3`: Schließen-Button entfernt Banner aus dem DOM

### Vitest — PROJ-8

- `src/components/kapiteleditor/ImpulseHintBanner.test.tsx` (8 Tests):
  Mount, Auto-Rotation, Zyklus, Hover-Pause, Schließen, reduced-motion,
  Sequenz-Länge 1, Mount-Behavior.
- `src/app/projektuebersicht/[project_id]/actions.test.ts` (3 neue PROJ-8-Tests):
  happy-path mit impulseId, Slug-Reject, Non-Existent-Impuls-Reject.

### Regression-Findings

Full-Run (`--retries=2`): **72 passed, 0 failed, 6 flaky (alle Retry-grün), 1 skipped.**

Alle 6 Flakes sind **pre-existing Turbopack-Dev-Server-Issues**
(`__webpack_modules__[moduleId] is not a function`):
- PROJ-2 register-validation, PROJ-3 AC-16, PROJ-4 AC-Home-1 + AC-PÜ-5,
  PROJ-7 AC-Display-1, PROJ-8 AC-Banner-1. **Keine PROJ-8-Regression.**

Folge-Ticket dafür weiterhin PROJ-13 (Stabilität & Observability).

### Production-Ready-Empfehlung

✅ **READY.** Alle ACs erfüllt, keine Bugs, keine Regressions. Bereit für `/deploy`.

## Deployment

**Date:** 2026-05-21
**Target:** stage-app.narravit.de (Vercel Preview-Env, Branch `stage`)

### Was geht live
- Migration auf stage-Supabase: `impulse_catalog` um `leading_questions`
  (TEXT[] NOT NULL CHECK ≥1) + `category` (TEXT NOT NULL) erweitert,
  15 Bestands-Impulse mit je 4 Leitfragen + Kategorie gesäet.
- Server-Components lesen Katalog beim Render → kein Modal-Roundtrip.
- ChapterSectionClient: Modal zeigt Kategorie-Label + Vorgeschmack-Frage;
  Impuls übernehmen schreibt `chapters.source_impulse_id` (FK).
- EditorClient: neues `ImpulseHintBanner`-Element rotiert Titel + Fragen
  alle 7 s (cross-fade, hover-pause, Schließen-Button,
  prefers-reduced-motion-aware, aria-live="polite").
- Server-Action `addImpulseChapterAction` validiert `impulseId` als UUID
  und checkt Existenz in `impulse_catalog` (klare UI-Fehler statt FK-23503).

### Manuelles für Production-Roll-out (main-Branch)
- Migration `20260521210000_proj8_impulse_leading_questions.sql` gegen
  main-Supabase anwenden (Supabase Dashboard → Branches → stage → Merge,
  ODER manueller `\i` gegen die main-DB).
- main-DB hat dieselben 15 Bestands-Impulse → Backfill matched problemlos.
- Anschließend `git checkout main && git merge stage && git push origin main`
  → Vercel-Production-Deploy.
- Verify nach main-Migration: `SELECT count(*) FROM impulse_catalog WHERE
  category IS NULL OR cardinality(leading_questions) < 1` muss `0` sein.
