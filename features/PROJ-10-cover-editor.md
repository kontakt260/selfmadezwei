# PROJ-10: Cover-Editor

## Status: Deployed
**Created:** 2026-05-21
**Last Updated:** 2026-05-22
**Deployed:** 2026-05-22 (stage-app.narravit.de)

## Dependencies
- Requires **PROJ-1** (Supabase-Datenmodell & RLS) — `project_covers`-Tabelle existiert (1:1 zu projects, mit `image_url`, `theme`, `metadata`-JSONB)
- Requires **PROJ-2** (Auth + SSR) — Session-Auth für Schreibzugriff
- Requires **PROJ-4** (Kapitel-Routing & Persistenz) — Einstieg zum Cover-Editor liegt in der Projektübersicht
- Soft dependency: **PROJ-3** (Persönlicher Bereich + Konto) — Project-Cards auf der Startseite [src/app/page.tsx](src/app/page.tsx) zeigen das Cover-Preview

## User Stories
- Als **Schreibender** oder **Initiator** möchte ich ein hochwertig wirkendes Cover für das Lebensbuch gestalten können, ohne Designer-Kenntnisse zu brauchen.
- Als **Schreibender** möchte ich die wichtigsten Cover-Angaben (Titel, Untertitel, Autor) in klaren Feldern eintragen, mit sofortiger Vorschau, wie das Cover später aussehen wird.
- Als **Schreibender** möchte ich aus einer kuratierten Auswahl an Mustern und Farben wählen — keine freie Farbpalette, kein Schrift-Chaos. So bleibt das Ergebnis ästhetisch zur Marke passend.
- Als **Schreibender** möchte ich optional ein Foto hochladen können (z. B. Familienportrait, Schmuckbild), das oben im Cover-Layout erscheint.
- Als **Projektleiter** und **Co-Autor** möchte ich beide am Cover arbeiten können — das Cover ist Teamarbeit.
- Als **Schreibender** möchte ich keinen separaten „Speichern"-Klick brauchen — Auto-Save soll meine Änderungen automatisch sichern, wie im Kapitel-Editor.
- Als **eingeloggter User** möchte ich auf der Startseite (persönlicher Bereich) jedes meiner Projekte mit seinem aktuellen Cover als Vorschau sehen — so erkenne ich auf einen Blick, welches Buch welche ist, ohne den Titel lesen zu müssen.

## Acceptance Criteria

### Zugang & Berechtigungen
- [ ] In der Projektübersicht gibt es einen klar sichtbaren Einstieg „Cover bearbeiten" (Karte oder Button, Position wird in `/architecture` und `/frontend` festgelegt).
- [ ] Der Einstieg ist für alle Projekt-Mitglieder (Projektleiter und Co-Autoren) sichtbar und nutzbar.
- [ ] Route: `/projektuebersicht/[project_id]/cover-bearbeiten`.
- [ ] Server-seitige Auth-Prüfung: nur eingeloggte Mitglieder des jeweiligen Projekts dürfen lesen/schreiben.
- [ ] Bei parallelen Schreibzugriffen zweier Sessions gilt **Last-Writer-Wins** — konsistent zum Kapitel-Editor-Verhalten (PROJ-5).

### Editier-Oberfläche (Vorderseite, einziger MVP-Teil)
- [ ] Editor zeigt zwei Bereiche nebeneinander (Desktop/Tablet) bzw. übereinander (Phone): **Eingabe-Felder links/oben**, **Live-Vorschau rechts/unten**.
- [ ] Eingabe-Felder:
    - **Titel** (Pflicht): vorbefüllt mit `projects.title`. Single-Line, max. 60 Zeichen.
    - **Untertitel** (optional): single-Line, max. 80 Zeichen.
    - **Autor-Zeile** (optional): single-Line, max. 80 Zeichen. „von …" als Placeholder, aber der User schreibt den vollen Text frei (er kann auch „Lebensgeschichte von Maria Müller" oder „Eine Erzählung von Großmutter Erna" eingeben).
    - **Muster** (Theme): Auswahl aus 4–6 kuratierten Mustern (z. B. dezente geometrische Form, botanisches Schmuckelement, Linie, Punkte). Visueller Picker. Schriftart wird **nicht** vom Muster beeinflusst — sie ist projekt-weit fest.
    - **Hintergrundfarbe** (Farbe): Auswahl aus 6–8 kuratierten Vorlagen (z. B. Sand, Eichenholz, Salbei, Bordeaux, Anthrazit, Pastell-Rosé). Visueller Picker. Keine freie Farbpalette.
    - **Cover-Foto** (optional): Upload-Button mit Datei-Picker. Format JPG/PNG. Max. 10 MB. Empfohlene Mindestmaße werden im UI angezeigt (Print-Qualität). Bereits hochgeladenes Foto kann ersetzt oder entfernt werden.
- [ ] Muster und Farbe sind **orthogonal** — jede Kombination ist erlaubt.
- [ ] **Schriftart und Schriftgrößen sind fest** und ergeben sich aus dem Marken-Style (gleiche Typografie wie restlicher Portal-Style).

### Live-Vorschau
- [ ] Die Vorschau rendert die Vorderseite des Buches in echtem Verhältnis (typografisch korrekt, Foto im richtigen Rahmen, Hintergrundfarbe + Muster sichtbar).
- [ ] Foto-Position: **eingebetteter Rahmen im oberen Drittel der Vorderseite** (ca. 60 % der Breite, zentriert). Darunter Titel-Block, Autor-Zeile am unteren Rand.
- [ ] Wenn kein Foto hochgeladen ist, bleibt der Foto-Bereich leer (kein Platzhalter sichtbar); die Position des Titel-Blocks bleibt unverändert.
- [ ] Jede Eingabe-Änderung aktualisiert die Vorschau **sofort** (während des Tippens / direkt nach Auswahl).
- [ ] Vorschau-Render muss responsiv sein und auf allen unterstützten Viewports (Phone, Tablet, Desktop) gut lesbar bleiben.

### Auto-Save
- [ ] Änderungen werden nach kurzer Inaktivität (ca. 2 Sek) automatisch persistiert. Kein expliziter „Speichern"-Button.
- [ ] Speicher-Status sichtbar (z. B. „Speichern …", „Gespeichert" mit Zeitstempel) — analog zu PROJ-5.
- [ ] Beim ersten Speichervorgang für ein Projekt, das noch keine Cover-Daten hat, wird die `project_covers`-Reihe angelegt; danach reguläres Update.
- [ ] Foto-Upload speichert das Bild im Storage-Bucket und persistiert die URL in `project_covers.image_url`. Upload läuft asynchron mit eigener Statusanzeige (Lade-Indikator).

### Anzeige als Mini-Vorschau (Single Source of Truth)
- [ ] Die Cover-Render-Komponente ist **dieselbe** für drei Kontexte:
    - die große Live-Vorschau im Editor,
    - die Mini-Vorschau auf der „Cover bearbeiten"-Karte in der Projektübersicht (`/projektuebersicht/[project_id]`),
    - die Mini-Vorschau in der jeweiligen `ProjectCard` auf der Startseite [src/app/page.tsx](src/app/page.tsx).
- [ ] Die Komponente skaliert verlustfrei zwischen Edit-Vorschau-Größe und Card-Thumbnail-Größe (Titel-Größe, Foto-Größe und Muster-Skalierung passen sich proportional an).
- [ ] **Default-Zustand (kein Cover bearbeitet, d. h. keine `project_covers`-Reihe oder Default-Werte überall):** an allen drei Stellen wird ein generisches Default-Cover gerendert (Default-Muster, Default-Farbe, Titel aus `projects.title`, leere Untertitel/Autor/Foto). Kein "Cover noch nicht bearbeitet"-Text — das Default-Cover ist die natürliche Anzeige.
- [ ] Auf der Startseite ersetzt die Cover-Vorschau das bisherige statische Buch-Icon der `ProjectCard`.

### Server-Lader-Erweiterungen
- [ ] [src/app/page.tsx](src/app/page.tsx) (Startseite/persönlicher Bereich) lädt zu jedem Projekt zusätzlich die `project_covers`-Reihe (falls vorhanden) und reicht sie an `ProjectCard` durch.
- [ ] Die Projektübersicht-Server-Component lädt die `project_covers`-Reihe für die „Cover bearbeiten"-Karte mit.
- [ ] Cover-Daten werden in einem einzigen Read pro Projekt geladen (kein N+1-Pattern beim Auflisten vieler Projekte).

### Phone-Verhalten
- [ ] Im Gegensatz zum Kapitel-Editor (PROJ-5) ist der Cover-Editor **phone-tauglich**. Layout stapelt Eingabe-Felder und Vorschau vertikal; Touch-Picker für Muster und Farbe.

## Edge Cases
- **Foto-Upload schlägt fehl (z. B. Netzfehler):** Inline-Fehler unter dem Foto-Button; Cover-Daten bleiben unverändert; Vorschau zeigt vorigen Foto-Stand.
- **Foto zu groß (> 10 MB) oder falsches Format:** Validierung vor Upload-Start; Inline-Fehler mit Hinweis auf erlaubte Formate und Größe.
- **Foto zu klein für Print-Qualität:** Inline-Warnung („Das Bild ist sehr klein und wird im gedruckten Buch unscharf wirken — empfohlen sind mindestens 1500 × 1500 px"), aber Upload wird trotzdem erlaubt — User entscheidet.
- **Concurrent Edit zweier Sessions:** Last-Writer-Wins. Wer zuletzt speichert, dessen Stand gewinnt. Andere offene Session sieht erst beim nächsten Reload aktuell.
- **Concurrent View: Startseite ist offen, während jemand das Cover in einem anderen Tab bearbeitet:** ProjectCard zeigt den Stand vom letzten Server-Render; aktualisiert sich erst beim Reload der Startseite. Konsistent zum „kein Live-Co-Editing"-Nicht-Ziel.
- **Projekt wird gelöscht, während Editor offen ist:** Nächster Auto-Save schlägt fehl; Hinweis „Dieses Projekt existiert nicht mehr." + Redirect persönlicher Bereich.
- **User verliert das Recht (wird aus Projekt entfernt) während Editor offen ist:** Nächster Auto-Save schlägt mit Berechtigungs-Fehler; Hinweis + Redirect.
- **Sehr lange Titel/Untertitel:** Validierung schneidet auf Maxima ab; Eingabe stoppt beim Limit; Vorschau zeigt den Text wie eingegeben.
- **Titel ist auf der Startseite-Card zu lang für die kleine Skalierung:** die Cover-Komponente kümmert sich um Truncate/Wrap; Card-Thumbnail bleibt formstabil.
- **User entfernt das Foto:** `image_url` wird auf NULL gesetzt; Storage-Objekt wird (zumindest DB-seitig) entkoppelt. Storage-Cleanup ist ein Folge-Detail.
- **Theme- oder Farb-Katalog wird im Code erweitert/geändert, nachdem ein User schon eine Wahl getroffen hat:** wenn der gespeicherte Wert noch existiert, bleibt er; wenn er entfernt wurde, fällt das Cover auf den Default zurück.
- **Eingaben mit Zeilenumbrüchen einkopiert (z. B. aus Word):** werden zu Single-Line normalisiert (Newlines entfernt) — Titel ist keine Mehr-Zeilen-Eingabe.
- **Browser-Crash zwischen zwei Auto-Saves:** Letzte gespeicherte Version bleibt erhalten; max. ca. 2 Sek Eingaben können verloren gehen.
- **Phone-Upload aus der Galerie:** Standardverhalten des nativen Datei-Pickers wird genutzt; HEIC/HEIF aus iOS-Galerie wird ggf. abgelehnt (kein Format-Support) — Hinweis bei Fehler.
- **Startseite mit vielen Projekten (z. B. > 20):** Cover-Read pro Projekt darf das Page-Load nicht spürbar verzögern; ein einzelner JOIN/Batch-Read ist nötig (kein N+1).

## Technical Requirements
- **Auth + Session:** alle Schreibaktionen serverseitig auf Auth + Project-Membership prüfen. Keine Vertrauensstellung gegenüber dem Client.
- **RLS:** `project_covers` und Storage-Bucket folgen den Membership-Policies aus PROJ-1. Lesen + Schreiben nur für Mitglieder des jeweiligen Projekts.
- **Storage:** Cover-Fotos werden in einem dedizierten Bucket (Name in `/architecture`) abgelegt; pro Projekt eindeutiges Dateinamen-Schema.
- **Datenmodell-Nutzung:** Titel/Untertitel/Autor/Muster/Farbe leben im `metadata`-JSONB (strukturierte Schlüssel); `theme` und `image_url` nutzen die existierenden Top-Level-Spalten. Konkrete Modellierung in `/architecture`.
- **Performance:** Live-Vorschau muss < 50 ms auf Eingabe reagieren. Foto-Upload darf die UI nicht blockieren (asynchron mit Status). Startseite mit vielen Projekten: Cover-Read als Batch/JOIN.
- **Print-Bereitschaft:** Vorschau-Rendering ist die Single Source of Truth für den späteren Print-Export (PROJ-16) — derselbe Code-Pfad oder dieselbe Daten-Spec wird vom PoD-Adapter wieder verwendet.
- **Reuse-Komponente:** die Cover-Render-Komponente muss skalierbar designt sein (drei Größen-Kontexte: Editor-Preview, Übersicht-Karte, Startseite-Thumbnail) — keine Hardcoded-Pixel-Werte für Schriften und Foto-Position.
- **Accessibility:** alle Eingabe-Felder mit Labels; Picker mit Tastatur-Navigation; Vorschau hat `aria-label` mit Klartext-Beschreibung des aktuellen Cover-Stands.
- **i18n / Copy:** alle User-sichtbaren Texte deutsch (konsistent mit Portal-Style).
- **Pflege der Kataloge (Muster + Farben):** initial im Code als kuratierte Liste; Inhalte werden vor Roll-out mit dem narravit-Team abgestimmt. Spätere Erweiterungen sind reguläre Code-Updates (keine Admin-UI).

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### A) Komponenten-Struktur (PM-Sicht)

```
Cover-Editor-Seite /projektuebersicht/[project_id]/cover-bearbeiten (NEU, Server-Component)
+-- Server-Lader (NEU)
|   +-- lädt Projekt + eigene Mitgliedschaft (Auth-Gate)
|   +-- lädt project_covers-Reihe (falls vorhanden) inkl. signed URL für image_url
+-- CoverEditorClient (NEU)
    +-- Eingabe-Felder (links/oben)
    |   +-- Titel (vorbefüllt aus projects.title)
    |   +-- Untertitel (optional)
    |   +-- Autor-Zeile (optional)
    |   +-- Muster-Picker (visueller Picker aus Code-Katalog)
    |   +-- Farb-Picker (visueller Picker aus Code-Katalog)
    |   +-- Foto-Upload (Datei-Picker + Status-Indikator)
    +-- CoverRender (NEU — die zentrale Single-Source-of-Truth-Komponente)
    |   +-- Nimmt CoverData + Größen-Kontext entgegen
    |   +-- Rendert in echtem A5-Verhältnis (148:210 Portrait)
    |   +-- Skaliert verlustfrei zwischen Editor-/Übersicht-/Card-Kontext
    +-- Save-Status (analog PROJ-5: "Speichern …", "Gespeichert HH:MM")
    +-- Auto-Save-Loop (debounced ~2 Sek)

Projektübersicht-Seite /projektuebersicht/[project_id] (existiert, erweitert)
+-- Server-Lader (erweitert)
|   +-- bisher: lädt Projekt + Kapitel + Mitglieder
|   +-- NEU: lädt project_covers (samt signed URL falls Foto vorhanden)
+-- "Cover bearbeiten"-Karte (NEU)
    +-- CoverRender im Mittel-Format
    +-- Klick → öffnet /cover-bearbeiten

Startseite / persönlicher Bereich /src/app/page.tsx (existiert, erweitert)
+-- Server-Lader (erweitert)
|   +-- bisher: lädt Projekte + Mitgliedschaften
|   +-- NEU: lädt project_covers aller eigenen Projekte als Batch (1 Read, kein N+1)
|   +-- erzeugt signed URLs für alle Cover-Fotos parallel
+-- ProjectCard (existiert, Inhalt angepasst)
    +-- bisher: statisches Buch-Icon + Titel
    +-- NEU: CoverRender im Thumbnail-Format ersetzt das Icon

Datenbank
+-- project_covers (existiert, KEIN Schema-Wechsel)
|   +-- project_id (unique, FK → projects)
|   +-- image_url   → Storage-Pfad des Cover-Fotos (nullable)
|   +-- theme       → Muster-Slug (Default beim Anlegen)
|   +-- metadata    → JSONB mit subtitle, author_line, background_color
|   +-- created_at, updated_at, id

Storage
+-- project-covers-Bucket (NEU)
    +-- PRIVATE Bucket (signed URLs nur für Mitglieder)
    +-- RLS auf Bucket-Ebene (lesen + schreiben nur für Projekt-Mitglieder)
    +-- Datei-Schema: <project_id>/cover-<timestamp>.<ext>

Code-Kataloge (NEU, im Repo, keine DB-Pflege)
+-- src/lib/cover-themes.ts   (~4–6 Muster: id, Label, SVG-Asset/Komponente)
+-- src/lib/cover-colors.ts   (~6–8 Farben: id, Label, hex-/Tailwind-Wert)
```

### B) Datenmodell (Plain Language)

Tabelle `project_covers` existiert bereits aus PROJ-1 — kein Schema-Wechsel nötig. Bedeutung der Felder im PROJ-10-Kontext:

```
project_covers (1:1 mit projects)
+-- project_id        Eindeutige Verknüpfung zum Projekt
+-- image_url         Storage-Pfad des Cover-Fotos (nullable)
|                     Bei "kein Foto": NULL
+-- theme             Muster-Identifier (Slug, z. B. "linie", "botanik", "punkte")
|                     Verweist auf einen Eintrag im Code-Katalog
+-- metadata          JSONB mit den frei-strukturierbaren Cover-Daten:
|                       - subtitle           (string, optional)
|                       - author_line        (string, optional)
|                       - background_color   (color-id aus dem Code-Katalog)
|                       - schema_version     (1, für spätere Migrations-Steuerung)
+-- created_at, updated_at, id   (existieren)
```

Cover-Titel wird **nicht** in `project_covers` gespeichert — er ist `projects.title` (Single Source of Truth). Wenn der User im Cover-Editor den Titel ändert, schreibt das in `projects.title` (existierender Pfad). So bleiben Projekt-Titel und Cover-Titel synchron.

Theme- und Farb-Kataloge sind **Code-Konstanten**, nicht DB-Reihen — sie werden vom Entwicklerteam gepflegt, nicht vom User.

### C) Tech-Entscheidungen (begründet)

1. **Eine Cover-Render-Komponente für drei Kontexte** — die Spec verlangt Single Source of Truth. Die Komponente nimmt `coverData` + einen Größen-Kontext (z. B. via Container-Width oder Aspect-Ratio-Wrapper) entgegen und rendert das Cover in echtem A5-Verhältnis. Skaliert wird über CSS-`em`/`%`-Werte relativ zur Container-Breite — keine harten Pixel-Größen für Schriften oder Foto-Position. So gilt automatisch: dieselben Daten ergeben in jeder Größe (Editor / Übersichts-Karte / Startseiten-Thumbnail) **dasselbe** visuelle Verhältnis.

2. **HTML/CSS-Render statt SVG-Render** — für den MVP wird die Cover-Komponente als reguläre React/Tailwind-HTML-Komponente gebaut. SVG ist verlockend wegen perfekter Skalierbarkeit, aber Text-Rendering (eigene Schriftart, deutsche Umlaute, lange Zeilen-Umbrüche, automatische Hyphenation) ist in SVG fummelig. HTML mit relativen Größen erreicht 98 % der Verhältnistreue mit deutlich einfacherem Code. Print-Export (PROJ-16) wird separat entschieden — entweder Puppeteer-PDF aus der existierenden HTML oder eine zweite SVG-Render-Variante.

3. **Theme + Farbe als Code-Konstanten** — die Kataloge werden vom narravit-Team kuratiert, nicht vom User. Eine DB-Tabelle wäre Overkill: keine User-Schreibrechte, keine Versionierungs-UI, kein Bedarf nach Laufzeit-Änderungen. Code-Konstanten sind reviewbar, typsicher und in Git versioniert. Erweiterung = neuer Code-PR.

4. **Privater Storage-Bucket mit signed URLs** — Cover-Fotos können sehr private Inhalte sein (Familienportraits, alte Schwarz-Weiß-Bilder). Ein öffentlicher Bucket mit dauerhaften URLs würde Datenschutz-Risiken einführen (URL-Leak = jeder im Internet kann das Foto sehen). Daher: privater Bucket, Lese-Zugriff via signed URL, die pro Page-Render frisch generiert wird (typische Gültigkeit 1 Stunde). RLS auf Bucket-Ebene erlaubt Lese-Zugriff nur Mitgliedern des jeweiligen Projekts.

5. **Foto-Upload direkt zum Storage, nicht durch Server** — der Upload läuft client-direkt zu Supabase Storage (mit Auth-Token). Vorteil: Next.js-Server muss keinen 10-MB-File-Stream durchschleusen, kein Memory-Druck. Die anschließende Persistierung des Storage-Pfads in `project_covers.image_url` läuft als separater Auto-Save.

6. **Auto-Save als debounced Server-Action (~2 Sek)** — identisch zum Kapitel-Editor-Pattern aus PROJ-5. UPSERT auf `project_covers` (project_id ist unique). Bei jedem Speichervorgang wird `updated_at` automatisch gesetzt (DB-Default).

7. **Default-Cover ohne DB-Reihe** — wenn ein Projekt nie im Cover-Editor war, existiert keine `project_covers`-Reihe. Die Cover-Render-Komponente rendert in diesem Fall ein synthetisches Default (Titel aus `projects.title`, Default-Theme, Default-Farbe, kein Foto, keine Subtitle, kein Autor). Erst beim ersten Auto-Save wird die DB-Reihe angelegt. Vorteil: keine N+1-Probleme auf der Startseite mit Projekten, die noch kein Cover haben — die fehlende Reihe ist okay.

8. **Batch-Read für Startseite** — die existierende `app/page.tsx` lädt Projekte + Mitgliedschaften. PROJ-10 ergänzt einen **einzigen** zusätzlichen Read: `SELECT * FROM project_covers WHERE project_id IN (<projekt-ids des users>)`. Damit ist die Cover-Information für alle Projekte des Users mit einer Query verfügbar — kein N+1. Signed URLs werden anschließend parallel pro Projekt mit Foto generiert (selbst bei 20 Projekten unter 200 ms).

9. **Cover-Titel und Projekt-Titel sind dieselbe Quelle** — wenn der User im Cover-Editor den Titel ändert, wird `projects.title` aktualisiert (nicht eine separate Cover-Titel-Spalte). Vorteil: keine Sync-Probleme zwischen Projektliste und Cover. Konsistenz wie bei PROJ-5 (Chapter-Title ist die einzige Überschriftenquelle).

10. **Phone-Editor erlaubt** — im Gegensatz zum A5-Kapitel-Editor (Phone-Sperre laut PROJ-5) ist der Cover-Editor klein und in vertikalem Stack auf Phones gut bedienbar. Touch-Picker für Muster/Farbe sind Standard-UI-Patterns.

### D) Neue Abhängigkeiten (Pakete)

Keine neuen npm-Pakete erforderlich. Alles mit existierenden Mitteln (Next.js Server Components + Server Actions, `@supabase/ssr`, Tailwind + shadcn/ui).

Theme-Muster-Assets: 4–6 SVG-Dateien werden im Repo unter `public/cover-themes/` abgelegt; werden als `<img>` oder inline-SVG referenziert. Erstellung der Assets ist Design-Arbeit, keine zusätzliche Library.

### E) Skalierbare Render-Komponente (zentrales Konzept)

```
CoverRender (eine Komponente, drei Größen-Kontexte)
+-- Props:
|   +-- coverData (title, subtitle, authorLine, themeId, colorId, imageUrl)
|   +-- size: "editor" | "overview" | "card"   (steuert nur die Container-Größe)
+-- Render:
|   +-- Outer-Wrapper mit fixer Aspect-Ratio (148:210, A5-Hochformat)
|   +-- Innen alle Größen via em / % relativ zum Wrapper:
|       +-- Hintergrund-Farbe als CSS-Variable aus dem Farb-Katalog
|       +-- Theme-Muster als inline-SVG-Layer (max. zwei Schichten)
|       +-- Foto-Rahmen oben im oberen Drittel (60 % Breite, zentriert)
|       +-- Titel-Block in der Mitte (Schrift skaliert mit em)
|       +-- Untertitel + Autor-Zeile am unteren Drittel
+-- Skalierungs-Verhalten:
    +-- Editor-Kontext:   Outer-Wrapper z. B. 400 px breit → 564 px hoch
    +-- Übersicht-Kontext: Outer-Wrapper z. B. 240 px breit → 339 px hoch
    +-- Card-Kontext:     Outer-Wrapper z. B. 120 px breit → 170 px hoch
    +-- Innenleben skaliert proportional über em — keine harten Werte
    +-- Bei sehr kleinen Größen (Card) kann Untertitel/Autor optisch
        zur Lesbarkeit abgeschnitten/versteckt werden (CSS-Media-Query
        oder `data-size`-Attribut). Die Detail-Entscheidung trifft /frontend.
```

Diese Komponente ist der Schlüssel: einmal sauber gebaut, garantiert sie automatische Konsistenz zwischen Editor-Vorschau, Übersicht-Karte und Startseiten-Thumbnail.

### F) Datenmodell-Nutzung & Migration-Plan

1. **Storage-Bucket-Migration A** — legt den Bucket `project-covers` an (privat), aktiviert RLS-Policies:
    - Lesen: jeder User darf Pfade lesen, deren erstes Path-Segment einer `project_id` entspricht, in der er Mitglied ist.
    - Schreiben/Löschen: dieselbe Bedingung (zusätzlich serverseitige Auth-Prüfung in der Server-Action).
2. **(Optional) Schema-Migration B** — falls in `project_covers` Defaults für `theme` und `metadata` gewünscht sind (z. B. theme = 'linie', metadata = '{ "schema_version": 1 }'), werden sie als DB-Defaults gesetzt. Sonst werden Defaults in der Cover-Render-Komponente als Fallback gehandhabt — beides funktioniert; ich empfehle DB-Defaults, weil sie reviewbar sind und Annahmen explizit machen.
3. **Backfill bestehender Projekte:** **nicht nötig** — Projekte ohne `project_covers`-Reihe rendern Default-Cover via Komponente. Wenn der User dann den Cover-Editor öffnet und etwas ändert, wird die Reihe angelegt.
4. **RLS-Migration für `project_covers`-Tabelle** — falls noch nicht vollständig aus PROJ-1 vorhanden:
    - SELECT: jedes Projekt-Mitglied.
    - INSERT/UPDATE: jedes Projekt-Mitglied (beide Rollen, Last-Writer-Wins).
    - DELETE: nicht im MVP-Workflow benötigt (Cover wird beim Projekt-Löschen per CASCADE entfernt); RLS verbietet ansonsten DELETE.
5. **Frontend-Migration:**
    - Neue Route `src/app/projektuebersicht/[project_id]/cover-bearbeiten/page.tsx` (Server-Component).
    - Neue Komponenten: `CoverEditorClient`, `CoverRender`.
    - Neue Server-Action `saveCoverAction` (UPSERT auf `project_covers` + ggf. Update `projects.title`).
    - Neue Server-Action `uploadCoverPhotoAction` (oder direkter Storage-Upload aus dem Client).
    - Erweiterung `app/page.tsx`-Server-Lader um Cover-Batch-Read.
    - Erweiterung Projektübersicht-Server-Lader um Cover-Read.
    - Anpassung `ProjectCard.tsx`: ersetzt das statische Buch-Icon durch `<CoverRender size="card" data={…} />`.
    - Neue Code-Konstanten-Dateien: `src/lib/cover-themes.ts`, `src/lib/cover-colors.ts`.
    - Theme-SVG-Assets unter `public/cover-themes/`.

Alle DB-/Storage-Migrationen laufen zuerst gegen den `stage`-Branch, dann nach Verifikation gegen `main`.

### G) RLS-Übersicht

```
project_covers (Tabelle)
+-- SELECT:   jedes Mitglied des jeweiligen Projekts
+-- INSERT:   jedes Mitglied (beide Rollen, Last-Writer-Wins)
+-- UPDATE:   jedes Mitglied
+-- DELETE:   gesperrt für reguläre Rollen (CASCADE via project-DELETE bleibt erlaubt)
+-- Service-Role: voller Zugriff (nur für Migrationen)

project-covers (Storage-Bucket, PRIVATE)
+-- SELECT:   Mitglied des Projekts, dessen ID im Path-Prefix steht
+-- INSERT:   wie SELECT
+-- UPDATE:   wie SELECT
+-- DELETE:   wie SELECT (für "Foto entfernen"-Aktion)
+-- Service-Role: voller Zugriff
+-- Signed-URL-Generierung: nur für Mitglieder, kurze Gültigkeit (~1 Stunde)
```

### H) Speicher- und Lese-Fluss (vereinfacht)

```
Beim Öffnen der Startseite (Persönlicher Bereich):
  Server-Lader liest:
    - Projekt-Mitgliedschaften des Users
    - Projekte
    - project_covers für alle gefundenen project_ids (Batch-Read, 1 Query)
  Für jedes Cover mit Foto: parallel signed URL erzeugen (~1 h Gültigkeit)
  Render: ProjectCard pro Projekt, jeweils mit <CoverRender size="card" />
  Default-Cover (keine Reihe vorhanden): rendert mit synthetischen Defaults

Beim Öffnen der Projektübersicht:
  Server-Lader liest project_covers für DIESES Projekt
  Falls Foto: signed URL erzeugen
  "Cover bearbeiten"-Karte rendert <CoverRender size="overview" />

Beim Öffnen des Cover-Editors:
  Server-Lader: wie Projektübersicht
  CoverEditorClient mountet mit aktuellen Daten
  Live-Vorschau rendert <CoverRender size="editor" />
  Bei jeder Eingabe → State-Update → Vorschau zeigt neuen Stand sofort

Beim Auto-Save (~2 Sek nach letzter Eingabe):
  saveCoverAction wird aufgerufen mit dem aktuellen CoverData-Stand
  Server prüft Auth + Project-Membership
  UPSERT auf project_covers (project_id ist unique)
  Wenn Titel geändert wurde: zusätzliches UPDATE auf projects.title
  Antwort: "Gespeichert HH:MM"

Beim Foto-Upload:
  Client validiert Format + Größe lokal
  Falls OK: Upload direkt zum Storage-Bucket (Pfad <project_id>/cover-<timestamp>.<ext>)
  Storage prüft RLS (User muss Projekt-Mitglied sein)
  Nach Upload-Erfolg: Client ruft saveCoverAction mit der neuen image_url
  Vorschau aktualisiert sich (signed URL lokal kennt der Client schon)
  Altes Foto bleibt im Bucket (Cleanup-Job ist Folge-Detail / out of scope)

Beim Entfernen des Fotos:
  Client setzt image_url auf null
  saveCoverAction persistiert
  Optional: Storage-Object wird nicht sofort gelöscht (lazy cleanup)
```

### I) Sicherheits- und Performance-Überlegungen

- **Foto-URL-Leak verhindert** durch private Bucket + signed URLs mit kurzer Gültigkeit. Wer die URL kopiert, kann das Foto kurzfristig sehen, aber die URL läuft nach ~1 h ab. Wenn jemand dauerhaft Zugriff bekommen soll, muss er als Projekt-Mitglied hinzugefügt werden (PROJ-9).
- **Foto-Upload-DoS-Risiko**: User könnte Mega-Dateien hochladen. Mitigation: Client-Validation auf 10 MB + Format vor Upload-Start; Storage-Bucket-Quota im Supabase-Plan begrenzt die Gesamtfläche. Eigener Per-User-Quota wäre Overengineering für MVP.
- **Cover-Daten-Race**: Last-Writer-Wins für `project_covers` und `projects.title`. Bei sehr seltenen Konflikten (zwei Mitglieder bearbeiten gleichzeitig) ist Datenverlust auf max. die Eingaben der letzten ~2 Sek beschränkt — akzeptabel, da Cover-Bearbeitung selten kollidiert.
- **Startseite-Performance** mit vielen Projekten: Batch-Read + parallele Signed-URL-Generation skaliert auf ~50 Projekte ohne wahrnehmbare Verzögerung. Bei wachsenden Größen später CDN-Caching oder per-User-Pagination möglich.
- **Theme-SVG-Bundle-Size**: 4–6 SVGs zu je ~5–20 KB sind tragbar; werden als statische Assets ausgeliefert (Vercel Edge Cache).

### J) Offene Punkte für Folge-Tickets (out of scope für PROJ-10)

- **Storage-Cleanup-Job**: alte Cover-Fotos, die durch Replace entstanden sind, sammeln sich im Bucket. Ein Cron-Job könnte verwaiste Foto-Objekte (kein passender DB-Eintrag mehr) entfernen. Eigenes Ticket.
- **Rückseite + Buchrücken**: explizit out of scope.
- **Freie Farb-/Schrift-Wahl**: explizit out of scope; Code-Kataloge sind fix.
- **Klappentext-Editor**: würde mit Rückseite kommen — eigenes Ticket.
- **Admin-UI für Theme-/Farb-Pflege**: nur sinnvoll, wenn Nicht-Entwickler den Katalog pflegen sollen. Aktuell unnötig.
- **Pixel-perfekter Print-Export**: PROJ-16 (Print-on-Demand-Adapter) konsumiert die in PROJ-10 standardisierten Cover-Daten und übersetzt sie in PDF/X oder vom PoD-Anbieter geforderte Formate.
- **Cover-Versionshistorie**: Undo/Redo bzw. Liste vergangener Stände. Eigenes Ticket bei Bedarf.
- **Multiple Fotos / Foto-Anordnung**: aktuell genau 1 Foto im oberen Drittel. Wenn später mehrere Fotos erwünscht sind, eigenes Ticket.

## Implementation Notes (Frontend) — 2026-05-22

**Komponenten + Routen neu angelegt:**
- `src/lib/cover-colors.ts` — Code-Katalog mit 8 kuratierten Farben (id, label, surface, ink, accent).
- `src/lib/cover-themes.tsx` — Code-Katalog mit 6 Mustern (schlicht, linie, rahmen, art-deco, botanik, punkte) als inline-SVG-Layer.
- `src/lib/cover-types.ts` — Gemeinsame Typen (`CoverData`, `CoverRowRaw`, `CoverSize`, `COVER_SCHEMA_VERSION`).
- `src/components/cover/CoverRender.tsx` — Single-Source-of-Truth-Renderer (148:210, `container-type: inline-size`, cqw-basierte Schrift-Skalierung). Drei Größen-Kontexte (`editor` / `overview` / `card`).
- `src/components/cover/CoverEditorClient.tsx` — Eingabe-Felder + Live-Vorschau + 2 s debounced Auto-Save + Foto-Upload (Client-direkt → Storage-Bucket `project-covers`).
- `src/app/projektuebersicht/[project_id]/cover-bearbeiten/page.tsx` — Server-Component mit Auth-Gate + Cover-Lader + signed URL.
- `src/app/projektuebersicht/[project_id]/cover-bearbeiten/actions.ts` — `saveCoverAction` (UPSERT auf `project_covers` + bedingtes `projects.title`-Update) und `getCoverImageSignedUrlAction`.

**Bestehende Dateien erweitert:**
- `src/app/projektuebersicht/[project_id]/page.tsx` — Server-Lader liest `project_covers` mit, Cover-Editor-Placeholder durch echte Cover-Karte mit Vorschau + Link ersetzt.
- `src/app/page.tsx` — Cover-Batch-Read über alle Projekte des Users (eine Query), signed URLs parallel pro Projekt mit Foto. `ProjectCardData` um `coverData` erweitert.
- `src/components/ProjectCard.tsx` — Statisches Buch-Icon durch `<CoverRender size="card" />` ersetzt.

**Verifikation:**
- `npx tsc --noEmit` — sauber.
- `npx next build` — sauber, neue Route `/projektuebersicht/[project_id]/cover-bearbeiten` registriert.

## Implementation Notes (Backend) — 2026-05-22

**Infrastruktur bereits vorhanden aus PROJ-1** — keine neue Migration nötig:
- `project_covers`-Table: RLS aktiv, Policies `project_covers: select/insert/update as member` via `get_my_project_ids()`. DELETE-Policy fehlt absichtlich → einzig CASCADE-Delete via `projects`-FK erlaubt.
- `updated_at`-Trigger `set_updated_at_project_covers` aktiv.
- Storage-Bucket `project-covers`: PRIVATE, 10 MB Limit, MIME-Whitelist (jpeg/png/webp/gif). Storage-Policies via `(string_to_array(name, '/'))[1]::uuid IN (get_my_project_ids())` — Path-Prefix-basierter Mitglieder-Check für SELECT/INSERT/UPDATE/DELETE.
- Doku: `supabase/migrations/20260515200002_storage_buckets.sql` (Z. 11 + 77–104).

**Server-Actions in /frontend bereits gebaut** — werden in /backend nur durch Tests verifiziert:
- `saveCoverAction` — Auth + Membership-Check, Titel-Update nur wenn geändert (sonst kein `projects.updated_at`-Bump), UPSERT auf `project_covers` mit `onConflict: project_id`.
- `getCoverImageSignedUrlAction` — Path-Prefix-Validation gegen `projectId` zusätzlich zur RLS-Authorität.

**Integration-Tests:** `cover-bearbeiten/actions.test.ts` — 17 Tests grün (Validation, Auth-Gate, Membership-Gate, Path-Traversal-Schutz, Storage-Error-Handling, Happy-Path).

**Test-Suite gesamt:** 123/123 grün.

## QA Test Results — 2026-05-22

### Testing-Lauf

| Lauf | Ergebnis |
|------|----------|
| Vitest (gesamte Suite) | **123/123 grün** |
| Vitest (cover-bearbeiten/actions.test.ts) | **17/17 grün** |
| Playwright PROJ-10 E2E (chromium) | **10/12 grün** — 2 dokumentierte Fehler (siehe BUG-1, BUG-3) |
| `npx next build` | **sauber** — Route `/projektuebersicht/[project_id]/cover-bearbeiten` registriert |
| `npx tsc --noEmit` | **sauber** |

### Acceptance-Criteria-Abdeckung

Statisches Code-Review + automatisierte Tests:

**Zugang & Berechtigungen** — ✅ alle 5 Kriterien erfüllt
- Einstieg von Projektübersicht via Karte + Cover-Vorschau-Link → AC-Entry-1 ✓
- Sichtbar für alle Mitglieder (kein Rollen-Gate) ✓ (kein RoleCheck im Markup)
- Route `/projektuebersicht/[project_id]/cover-bearbeiten` registriert ✓
- Server-seitige Auth + Membership-Check (`page.tsx` + `saveCoverAction`) ✓
- Last-Writer-Wins via UPSERT auf `project_covers.project_id` (UNIQUE) ✓

**Editier-Oberfläche** — ✅ alle Kriterien erfüllt
- 2-Spalten Desktop / vertikal Phone-Layout via Tailwind `lg:grid` ✓
- Titel max. 60 (Zod + Input maxLength) ✓
- Untertitel max. 80 ✓
- Autor-Zeile max. 80 ✓
- 6 Muster + 8 Farben als Code-Konstanten ✓
- Foto-Upload Format-/Größen-Check vor Upload ✓
- Schriftarten fest (Merriweather/PT-Serif) ✓

**Live-Vorschau** — ✅ erfüllt
- A5-Hochformat via `aspectRatio: "148 / 210"` + `containerType: inline-size` ✓
- Foto-Bereich oberes Drittel (60 % Breite, zentriert) ✓
- `useMemo`-basierte Live-Daten — sofortige Aktualisierung beim Tippen → AC-Page-6 ✓
- Responsive über 3 Größen-Kontexte ✓

**Auto-Save** — ✅ erfüllt
- 2 s Debounce in `useEffect` mit `clearTimeout` ✓
- Statusanzeige „Speichern …" / „Gespeichert HH:MM" → AC-Page-7 ✓
- UPSERT legt Row beim ersten Save an ✓
- Foto-Upload mit asynchroner Statusanzeige (`Wird hochgeladen …`) ✓

**Mini-Vorschau (Single Source of Truth)** — ✅ erfüllt
- `CoverRender` rendert mit demselben Code für editor/overview/card ✓
- cqw-basierte Skalierung — kein Hardcoded-Pixel ✓
- Default-Cover synthetisiert ohne DB-Row (DEFAULT_THEME_ID + DEFAULT_COLOR_ID) ✓
- Startseiten-`ProjectCard` ersetzt Buch-Icon durch `<CoverRender size="card" />` ✓

**Server-Lader** — ✅ erfüllt
- `app/page.tsx` Batch-Read (`SELECT … WHERE project_id IN (…)`) — KEIN N+1 ✓
- Signed URLs via `Promise.all()` parallel pro Projekt mit Foto ✓
- Projektübersicht + Cover-Editor laden je 1 zusätzlichen Read ✓

**Phone-Verhalten** — ✅ erfüllt
- Kein Phone-Block, vertikales Stack-Layout via Tailwind ✓

### Sicherheits-Audit (Red Team)

| Vektor | Befund |
|--------|--------|
| Auth-Bypass: anonymer Save | Middleware + Server-Component-Auth-Gate → 401-Pfad blockiert ✓ |
| Authz-Bypass: fremdes Projekt | RLS auf `project_covers` + defense-in-depth Membership-Check ✓ |
| Path-Traversal in `image_url` | Regex `/^[0-9a-fA-F-]{36}\/cover-[0-9]+\.(ext)$/` validiert Shape ⚠️ **BUG-2** |
| XSS via Titel/Subtitel/Autor | React-Escape automatisch, keine `dangerouslySetInnerHTML` ✓ |
| MIME-Type-Spoofing beim Upload | Privater Bucket, signed URLs, Content-Type vom Bucket erzwungen ✓ (Risiko niedrig) |
| Signed-URL-Leak | ~1 h Gültigkeit, nur Mitglieder können signen ✓ |
| CSRF | Next.js Server Actions haben built-in Token-Schutz ✓ |
| Foto-Upload-DoS | Client-Validierung 10 MB + Bucket-File-Size-Limit 10 MB ✓ |
| RLS-Lücke `project_covers` DELETE | Keine DELETE-Policy → Default-Deny, nur CASCADE via `projects`-FK ✓ |
| Service-Role-Key im Client | Action-Funktion verwendet nur `createClient()` (anon + cookie) ✓ |

### Gefundene Bugs

#### BUG-1 (High) — PROJ-4 E2E-Regression: alter Cover-Placeholder-Text geprüft

**Schweregrad:** High (CI bricht)
**Ort:** `tests/PROJ-4-kapitel-routing-persistenz.spec.ts:91`
**Symptom:** `AC-PÜ-3` prüft `page.getByText(/PROJ-10/)` — den Platzhalter-Text „Der Cover-Editor ist in Kürze verfügbar (PROJ-10)". Dieser Text existiert nicht mehr, weil PROJ-10 die Karte real implementiert.
**Reproduce:** `npx playwright test PROJ-4 -g "AC-PÜ-3" --project=chromium` → fail.
**Fix-Vorschlag:** PROJ-4-Test anpassen: Assertion ersetzen durch Existenz-Check der echten Cover-Karte (z. B. `getByRole("link", { name: /Cover-Editor öffnen/ })`).

#### BUG-2 (Medium) — `saveCoverAction.imagePath` validiert Project-ID-Prefix nicht

**Schweregrad:** Medium (Daten-Integrität, kein Confidentiality-Leak)
**Ort:** `src/app/projektuebersicht/[project_id]/cover-bearbeiten/actions.ts` (saveCoverSchema → imagePathSchema)
**Symptom:** Die Regex `/^[0-9a-fA-F-]{36}\/cover-[0-9]+\.(jpg|jpeg|png|webp)$/i` validiert nur das Shape — sie prüft NICHT, dass die UUID am Anfang des Pfads = `input.projectId` ist. Ein Mitglied beider Projekte A und B könnte `saveCoverAction({ projectId: A, imagePath: "<B_id>/cover-123.jpg" })` aufrufen und auf A's Cover-Row den Foto-Pfad von B legen.
**Confidentiality:** RLS auf Storage-Bucket greift trotzdem (Mitglieder von A ohne Mitgliedschaft in B können das Foto nicht laden) — daher KEIN Leak, nur kaputte Vorschau für betroffene User.
**Reproduce:** Mit Service-Role oder Doppel-Mitglied: `INSERT INTO project_covers (project_id, image_url) VALUES ('<A>', '<B>/cover-1.jpg')` ist heute via `saveCoverAction` erlaubt.
**Fix-Vorschlag:** In `saveCoverAction` denselben Path-Prefix-Check ergänzen, der in `getCoverImageSignedUrlAction` schon vorhanden ist: `if (imagePath && !imagePath.startsWith(\`${projectId}/\`)) return { error: "Pfad gehört nicht zum Projekt." };`

#### BUG-3 (Medium) — Foto-Upload-Button: Accessible Name enthält gesamten Hilfstext

**Schweregrad:** Medium (A11y + bricht E2E AC-Page-5)
**Ort:** `src/components/cover/CoverEditorClient.tsx` — `FieldShell` als `<label>` umschließt den File-Upload-Bereich
**Symptom:** Das `<label>`-Wrapping macht den Hilfstext-Paragraph („JPG, PNG oder WebP. Max. 10 MB. Empfohlen: mindestens 1500 × 1500 px …") zum Teil des Accessible-Name der Foto-Buttons. Screen-Reader liest den ganzen Wartungstext vor; Tests/Tools, die nach `name=/Foto hochladen/` suchen, finden den Button nicht.
**Reproduce:** Playwright-Snapshot zeigt: `button "Cover-Foto (optional) JPG, PNG oder WebP. Max. 10 MB. Empfohlen: mindestens 1500 × 1500 px für Print-Qualität." [...]`
**Fix-Vorschlag:** `FieldShell` so umbauen, dass es per Prop entscheidet, ob es als `<label>` oder als `<div>`/`<fieldset>` rendert. Für reine Eingabe-Felder (Titel/Untertitel/Autor) bleibt `<label>` korrekt. Für Picker-Gruppen + Foto-Upload (die intern Buttons / Pseudo-Buttons benutzen, nicht ein einzelnes Form-Element) wird `<div>`/`<fieldset>` mit `<legend>` korrekt. Alternativ: explizites `aria-label` auf die Buttons.

#### BUG-4 (Low) — Kein Redirect bei Projekt-Löschung oder Member-Revoke während Editor offen

**Schweregrad:** Low (UX-Spec-Deviation, keine Daten-Risiken)
**Ort:** `src/components/cover/CoverEditorClient.tsx` → `performSave`-Error-Branch
**Symptom:** Spec sagt: "Projekt wird gelöscht / User verliert Recht → Hinweis + Redirect persönlicher Bereich." Aktuelle Implementierung zeigt nur Inline-Fehler „Projekt nicht gefunden." — kein automatischer Redirect.
**Fix-Vorschlag:** Bei `error === "Projekt nicht gefunden."` zusätzlich `router.replace("/persoenlicher-bereich")` auslösen.

#### BUG-5 (Low) — Playwright AC-Auth-1 (anonymer Zugriff → /anmelden) flaky

**Schweregrad:** Low (Test-Env-Quirk)
**Ort:** `tests/PROJ-10-cover-editor.spec.ts:126`
**Symptom:** Test schlägt fehl, weil die URL nach `goto()` mit frischem `browser.newContext()` (ohne Auth) immer noch /cover-bearbeiten bleibt. Manuelles Reproduzieren in echtem Browser zeigt: Middleware redirected korrekt zu /anmelden. Vermutlich Caching/Cookie-Inheritance-Quirk im Playwright-Dev-Server-Modus.
**Code-Review:** Middleware-Logik in `src/lib/supabase/middleware.ts:89` ist korrekt — anonyme Calls auf nicht-public Routen werden auf /anmelden umgeleitet. /cover-bearbeiten ist NICHT in `PUBLIC_ROUTES` → wird umgeleitet.
**Fix-Vorschlag:** Test-Setup mit `await ctx.clearCookies()` ergänzen oder die Assertion zu `await p.waitForURL(/\/anmelden/, { timeout: 8000 })`.

#### Bugs nach Schweregrad

| Schweregrad | Anzahl |
|-------------|--------|
| Critical    | 0      |
| High        | 1 (BUG-1 — Test-Regression) |
| Medium      | 2 (BUG-2 Path-Traversal, BUG-3 A11y) |
| Low         | 2 (BUG-4 Redirect, BUG-5 Test-Flake) |

### Regression-Tests verwandter Features

| Feature | Status |
|---------|--------|
| PROJ-3 (Persönlicher Bereich) | ProjectCard mit Cover statt Icon → kein Layout-Bruch in lokalem Test, Vitest grün ✓ |
| PROJ-4 (Projektübersicht) | Cover-Editor-Sektion ersetzt — E2E `AC-PÜ-3` bricht (BUG-1) |
| PROJ-5 (Kapitel-Editor) | Keine Berührung — unverändert |
| PROJ-6 (Stripe / Paywall) | PaywallStats-Sektion unverändert |
| PROJ-8 (Erzähl-Impulse) | Kapitel-Liste mit Impulse-Banner unverändert |
| PROJ-9 (Mitglieder + Einladungen) | Nutzerübersicht-Sektion unverändert |

### Production-Ready Decision

**NICHT READY** — wegen BUG-1 (High, CI bricht). BUG-2 (Medium, Daten-Integrität) sollte vor Roll-out gefixt werden. BUG-3 (A11y) sollte vor Public-Launch gefixt sein. BUG-4 + BUG-5 sind keine Blocker.

**Empfohlene Reihenfolge zum Fix:**
1. BUG-1 (PROJ-4-Test-Update) — schnellster Fix, CI muss grün
2. BUG-2 (Path-Prefix-Check in `saveCoverAction`) — Security-Härtung
3. BUG-3 (A11y-Fix für Foto-Upload-Section) — A11y-Compliance
4. BUG-4 + BUG-5 — optional, nach Roll-out

---

## Bug-Fixes 2026-05-22

| Bug | Status | Fix |
|-----|--------|-----|
| BUG-1 | ✅ behoben | `tests/PROJ-4-kapitel-routing-persistenz.spec.ts` AC-PÜ-3 prüft jetzt die echte Cover-Karte (Link `Cover-Editor öffnen` + `href`-Attribut). |
| BUG-2 | ✅ behoben | `saveCoverAction` enthält jetzt einen `imagePath.startsWith(\`${projectId}/\`)`-Check vor dem UPSERT. Neuer Vitest-Case („rejects image path whose UUID prefix does not match projectId") deckt das ab. |
| BUG-3 | ✅ behoben | `FieldShell` rendert per `as`-Prop entweder als `<label>` (Form-Inputs) oder als `<div>` (Muster-/Farb-Picker, Foto-Upload). Buttons im Foto-Upload haben damit den erwarteten Accessible Name. |
| BUG-4 | ⏳ offen | Spec-Deviation; kein Roll-out-Blocker. Folge-Ticket nach Bedarf. |
| BUG-5 | ✅ behoben | `tests/PROJ-10-cover-editor.spec.ts` AC-Auth-1 setzt jetzt explizit `storageState: { cookies: [], origins: [] }` für den frischen Context. |

**Verifikation:**
- Vitest gesamt: **124/124 grün** (1 neuer Test für BUG-2)
- Playwright PROJ-10 (chromium): **12/12 grün**
- Playwright PROJ-4 AC-PÜ-3: **grün**
- `npx tsc --noEmit` + `npx next build`: sauber

**Production-Ready Decision (Update):** **READY** — alle Critical/High/Medium-Bugs behoben. BUG-4 (Low) bleibt als Follow-up. Status → Approved.

## Deployment

**Datum:** 2026-05-22
**Branch:** stage → stage-app.narravit.de (Vercel Auto-Deploy)
**Commit:** `7c41d20 feat(PROJ-10): Cover-Editor — Live-Vorschau, Auto-Save, Mini-Cover auf Cards`

**Pre-Deployment-Checks:**
- `npx tsc --noEmit` — sauber
- `npx next build` — sauber, Route `/projektuebersicht/[project_id]/cover-bearbeiten` registriert
- Vitest 124/124 grün
- Playwright PROJ-10 chromium 12/12 grün
- Playwright PROJ-4 AC-PÜ-3 grün (Regression behoben)
- Keine neuen Env-Variablen — keine `.env.local.example`-Änderung
- Keine neue Supabase-Migration nötig (Bucket + RLS aus PROJ-1)

**Manuelle Verifikation (auf Stage):**
- Stage-Domain: https://stage-app.narravit.de
- Smoke-Test offen: Cover-Editor öffnen, Felder editieren, Auto-Save „Gespeichert HH:MM" verifizieren, Mini-Cover auf Startseite + Projektübersicht prüfen

**Production-Rollout (durch User):**
- `git checkout main && git merge stage` (manuell)
- Supabase: kein Branch-Merge nötig
- Vercel main-Deploy startet automatisch nach Push

**Folge-Tickets:**
- BUG-4 (Low) — Redirect bei Projekt-Löschung/Member-Revoke mid-edit, kein Blocker
