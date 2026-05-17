# PROJ-5: Kapitel-Editor (A5, TipTap, Tablet)

## Status: In Progress
**Created:** 2026-05-15
**Last Updated:** 2026-05-17

## Dependencies
- Requires: PROJ-4 (Kapitel-Routing & Persistenz) — URL-Struktur `/projektuebersicht/[project_id]/kapiteleditor/[chapter_id]`, `chapter_id` in URL
- Requires: PROJ-2 (Auth + SSR) — Session, Middleware, Rollenprüfung
- Requires: PROJ-1 (Supabase-Datenmodell & RLS) — `chapters`-Tabelle (`body`, `title`, `hero_image_url`), `chapter-heroes`-Bucket; Schema-Ergänzung: `chapters.color_page_count` (s. Technical Requirements)

## User Stories
- Als Schreibender möchte ich meinen Text in einem A5-Editor tippen, damit ich ein realistisches Bild davon bekomme, wie das fertige Buch aussieht.
- Als Schreibender möchte ich, dass mein Text automatisch gespeichert wird, damit ich mich aufs Schreiben konzentrieren kann ohne Angst vor Datenverlust.
- Als Schreibender möchte ich den Kapitel-Titel direkt im Editor bearbeiten können, damit ich nicht erst zur Projektübersicht wechseln muss.
- Als Schreibender möchte ich Fotos am Anfang und Ende meines Kapitels hochladen und anordnen können, damit meine Erinnerungen bildlich unterstützt werden.
- Als Schreibender möchte ich Seitenumbrüche setzen können, damit ich die Buchstruktur aktiv steuere.
- Als Tablet-Nutzer möchte ich den Editor touch-freundlich bedienen, damit ich auch auf dem Sofa schreiben kann.

## Acceptance Criteria

### Route & Zugriff
- [ ] Route: `/projektuebersicht/[project_id]/kapiteleditor/[chapter_id]`
- [ ] `project_id` und `chapter_id` werden serverseitig gegen RLS validiert; ungültige IDs → 404
- [ ] Phone (viewport < 768 px): Hinweis-Seite statt Editor mit Text "Der Kapitel-Editor ist auf dem Smartphone nicht verfügbar — öffne NARRAVIT auf einem Tablet oder Desktop-Computer."; Link zurück zur Projektübersicht
- [ ] Desktop & Tablet (viewport ≥ 768 px): vollständiger Editor

### A5-Seiten-Layout
- [ ] Editor simuliert A5-Seiten (148 mm × 210 mm, feste Breite) mit sichtbaren Seitenumbrüchen
- [ ] Feste Seitenabstände entsprechend Word-Template: oben 1 cm, rechts 1 cm, unten 1 cm, links 1,25 cm (in Twips: top=1134, right=1134, bottom=1134, left=1418)
- [ ] Erste Seite hat ein festes Template (s. u.); alle Folgeseiten zeigen nur Fließtext

### Erste Seite — Template
- [ ] NARRAVIT-Logo (oben, fest, nicht editierbar)
- [ ] Kapitel-Titel (H1, editierbar direkt im Editor; synchronisiert mit `chapters.title` via Auto-Save-Debounce)
- [ ] Dekoratives Muster (fest, nicht editierbar — Rechtecke + Trennlinie aus Word-Template)
- [ ] Bild-Sektion Anfang (s. u.) zwischen Muster und Fließtext-Beginn
- [ ] Fließtext beginnt unterhalb der Bild-Sektion Anfang

### Bild-Sektionen (Anfang & Ende)
- [ ] Zwei Bild-Sektionen: eine am Anfang (nach Muster, vor Fließtext), eine am Ende (nach Fließtext)
- [ ] Beliebig viele Bilder hochladbar per Klick auf Platzhalter oder "Bild hinzufügen"-Button
- [ ] Layout-Toggle pro Sektion: **1 Bild pro Zeile** (full width) oder **2 Bilder nebeneinander** — Nutzer kann jederzeit wechseln
- [ ] Bilder in jeder Sektion können einzeln gelöscht und per Drag-and-Drop umsortiert werden
- [ ] Bilder werden in den Supabase-Storage-Bucket `chapter-heroes` hochgeladen (max. 10 MB pro Bild; serverseitig geprüft)
- [ ] Leerzustand: Platzhalter "Bild hinzufügen" in beiden Sektionen sichtbar

### Farbseiten-Tracking
- [ ] Jede A5-Seite mit mindestens einem Bild gilt als Farbseite
- [ ] `chapters.color_page_count` wird bei jedem Auto-Save-Durchlauf aktualisiert (client-seitig berechnet, zusammen mit `body` persistiert)
- [ ] Kein aktiver Lesezugriff auf diesen Wert in PROJ-5; Verwendung erfolgt in PROJ-16 (Print-on-Demand)

### Toolbar
- [ ] Fett, Kursiv, Unterstrichen
- [ ] Absatz-Styles: Normal, Blockzitat
- [ ] Aufzählungsliste, nummerierte Liste
- [ ] Textausrichtung: links, zentriert, rechts, Blocksatz
- [ ] Zeilenabstand: 1.0 / 1.5 / 2.0
- [ ] Einrückung rein / raus
- [ ] Seitenumbruch einfügen (sichtbar als Trennlinie im Editor)
- [ ] Undo, Redo
- [ ] Kein Link-Tool

### Auto-Save
- [ ] TipTap-Inhalt (`body`) und Kapitel-Titel (`title`) werden 2 Sekunden nach der letzten Änderung automatisch in Supabase gespeichert (Server Action)
- [ ] Status-Anzeige in der Toolbar: "Gespeichert ✓" / "Wird gespeichert…" / "Fehler beim Speichern"
- [ ] Bei Fehler: Status-Anzeige wechselt zu "Fehler beim Speichern" + Toast-Notification + Retry-Button; Inhalt bleibt im Editor-Speicher erhalten
- [ ] Kein manueller "Speichern"-Button

### Header & Navigation
- [ ] Header zeigt Kapitel-Titel und "Zurück zur Projektübersicht"-Button
- [ ] Kein Unsaved-Changes-Dialog beim Verlassen (Auto-Save macht es unnötig)

### Wortanzahl
- [ ] Statusleiste unterhalb des Editors zeigt Live-Wortanzahl (z. B. "247 Wörter"), berechnet aus dem TipTap-Dokument
- [ ] Wortanzahl wird nicht separat persistiert (PROJ-4 berechnet sie aus `body` für die Kapitelübersicht)

## Edge Cases
- Phone-Viewport (< 768 px) → Hinweis-Seite wird gerendert; kein TipTap-Editor geladen
- Netzwerkausfall beim Auto-Save → Status "Fehler beim Speichern" + Retry-Button; nächste Texteingabe triggert nach erneutem Debounce einen weiteren Save-Versuch
- Kapitel wird von einem anderen Mitglied gelöscht, während Nutzer im Editor schreibt → nächster Auto-Save schlägt fehl mit "Kapitel nicht gefunden"; Toast informiert den Nutzer + Redirect zur Projektübersicht
- Titel im Editor geändert → gleicher 2-Sekunden-Debounce wie `body`; sync zu `chapters.title`
- Bild-Upload > 10 MB → Fehlermeldung mit Limit-Hinweis; kein Upload; bestehende Bilder unberührt
- Zwei Co-Autoren schreiben gleichzeitig → Last-Writer-Wins (kein Locking in PROJ-5; PROJ-15 behandelt Concurrency)
- Keine Bilder in beiden Sektionen → `color_page_count = 0`; Platzhalter "Bild hinzufügen" in Sektionen sichtbar
- Seitenumbruch gesetzt → visuell als Trennlinie im Editor dargestellt; im Druck echter Seitenumbruch

## Technical Requirements
- Sicherheit: `chapter_id` in allen Server Actions gegen RLS validiert — kein Client-Trust
- Sicherheit: Bild-Upload max. 10 MB serverseitig geprüft; Uploads ausschließlich in `chapter-heroes`-Bucket
- Performance: TipTap-Editor wird ausschließlich client-seitig gerendert (kein SSR); `chapter.body` wird serverseitig geladen und als `initialContent` an den Client übergeben
- `color_page_count`: Berechnung client-seitig beim Auto-Save; wird zusammen mit `body` in einer Server Action persistiert
- Schema-Ergänzung zu PROJ-1: `chapters.color_page_count INTEGER NOT NULL DEFAULT 0` (via neue Migration)
- Tablet: Touch-Events für alle Toolbar-Buttons und Bild-Upload-Flow getestet

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

> Hinweis: Im alten Repo existiert kein migrationsfähiger Editor (nur Platzhalter-Seite). PROJ-5 ist ein Frischbau auf Basis der bestehenden Routenstruktur aus PROJ-4.

> **Leitprinzip: Print-First-HTML.** Der Editor zeigt im Browser exakt dieselbe HTML- und CSS-Struktur, aus der später (PROJ-16 Print-on-Demand) das druckfertige A5-PDF gerendert wird. Jede Design-Entscheidung in PROJ-5 wird unter dieser Prämisse getroffen — was im Editor erscheint, muss in einem Headless-Chromium-PDF (oder einem vergleichbaren HTML-zu-PDF-Renderer) verlustfrei reproduzierbar sein.

### A) Komponenten-Struktur (PM-Sicht)

```
Kapitel-Editor-Seite (Server)
├── Phone-Hinweis-Komponente (nur < 768 px Viewport)
│   └── Text + Link „Zurück zur Projektübersicht"
└── Editor-Client (≥ 768 px Viewport, lädt im Browser)
    ├── Kopfleiste
    │   ├── „Zurück zur Projektübersicht"-Link
    │   ├── Kapitel-Titel (groß, direkt editierbar)
    │   └── Status-Anzeige („Gespeichert ✓" / „Wird gespeichert…" / „Fehler")
    ├── Werkzeugleiste (sticky oben)
    │   ├── Format-Knöpfe (Fett, Kursiv, Unterstrichen)
    │   ├── Absatz-Stil (Normal / Blockzitat)
    │   ├── Listen (Aufzählung, nummeriert)
    │   ├── Ausrichtung (links, zentriert, rechts, Blocksatz)
    │   ├── Zeilenabstand (1.0 / 1.5 / 2.0)
    │   ├── Einrückung (rein, raus)
    │   ├── Seitenumbruch einfügen
    │   └── Rückgängig / Wiederherstellen
    └── A5-Seitenstapel (visuelle Buch-Simulation)
        ├── Erste Seite (festes Template)
        │   ├── NARRAVIT-Logo (fest)
        │   ├── Kapitel-Titel als H1 (synchron mit Kopfleiste)
        │   ├── Dekoratives Muster (fest)
        │   ├── Bild-Sektion „Anfang"
        │   │   ├── Layout-Wechsler (1-spaltig | 2-spaltig)
        │   │   ├── Bild-Slot-Raster (gefüllte Slots + leere Platzhalter)
        │   │   │   └── Pro Slot: Bild + Lösch-Knopf + Drag-Griff
        │   │   └── „Bild hinzufügen"-Knopf → öffnet Upload-Dialog
        │   └── Fließtext beginnt darunter
        ├── Folgeseiten (nur Fließtext, automatischer Seitenumbruch)
        └── Letzte Seite
            ├── Fließtext-Ende
            └── Bild-Sektion „Ende" (gleicher Aufbau wie „Anfang")

Bild-Upload-Dialog (modal, wird bei „Bild hinzufügen" geöffnet)
├── Datei-Auswahl (Drag-Drop oder Datei-Browser)
├── Crop-Fläche (festes Verhältnis 3:2 quer)
└── „Hochladen"-Knopf → Upload + Slot wird in Sektion ergänzt

Fußleiste
└── Live-Wortanzahl
```

### B) Datenmodell (Klartext)

**Bestehende Tabelle `chapters` wird um zwei Spalten erweitert** (über neue Migration, dokumentiert in PROJ-1-Anhang):

| Feld | Inhalt |
|---|---|
| `title` (bestand) | Kapitel-Überschrift, synchron mit Editor-H1 |
| `body` (bestand) | Reiner Fließtext als TipTap-JSON (ohne Bilder) |
| `image_sections` *(neu, JSONB)* | Die zwei Bild-Sektionen Anfang + Ende mit Layout-Wahl und Bild-Liste |
| `color_page_count` *(neu, Zahl)* | Anzahl A5-Seiten mit ≥ 1 Bild (für späteren Druck-Preis-Job) |

**Struktur `image_sections` (Klartext):**

```
{
  "start": {
    "layout": "1-spaltig" oder "2-spaltig",
    "images": [
      { "id": eindeutige Bild-ID, "storage_path": Pfad im Bucket, "alt": Alt-Text },
      ...
    ]
  },
  "end": { ... gleiche Struktur ... }
}
```

**Speicher-Ort der Bilddateien:**
- Bucket: `chapter-heroes` (existiert seit PROJ-1, privat, 10 MB-Limit)
- Pfad-Schema: `{project_id}/{chapter_id}/{image_uuid}.jpg`
- Anzeige: Signed URLs mit 1 h Gültigkeit, server-seitig generiert beim Seitenaufruf

**Was nicht in die Datenbank wandert:**
- Wortanzahl wird im Client berechnet, nicht gespeichert
- Layout-Wahl pro Sektion ist Teil von `image_sections`, kein separates Feld
- TipTap kennt keine Custom-Image-Nodes — Bilder leben strikt außerhalb des `body`-Felds

**Speicher-Trigger:**
- Jede Änderung an Titel, Fließtext oder Bild-Sektionen löst denselben 2-Sekunden-Debounce aus
- Bild-Upload + Bild-Löschen + Drag-Reorder speichern sofort (kein Debounce, weil Storage-Operation ohnehin synchron)

### C) Tech-Entscheidungen (begründet)

**Warum TipTap als Editor?**
Bereits in der Roadmap fixiert. Ist Headless (volle Styling-Kontrolle), unterstützt JSON-Persistenz, hat fertige Erweiterungen für Listen / Ausrichtung / Seitenumbruch.

**Warum nur Client-Rendering für TipTap (kein SSR)?**
TipTap verwendet ProseMirror, das DOM-Refs benötigt. Auf dem Server würde es entweder crashen oder unnötig große JS-Bundles erzeugen. Wir laden den Editor erst im Browser, der Server liefert nur das `body`-JSON als Startwert.

**Warum Bilder in separater JSONB-Spalte und nicht als TipTap-Node?**
Die Bild-Sektionen sind keine inline-Inhalte, sondern feste Container an Anfang/Ende. Ein TipTap-Node-Setup wäre überdimensioniert (eigene Schema-Erweiterung, Custom-React-Komponenten, Serialisierung). JSONB ist atomar mit dem Auto-Save, einfach zu lesen/schreiben und entkoppelt von zukünftigen Editor-Updates.

**Warum festes Seitenverhältnis 3:2 quer (laut User-Wahl)?**
Konsistente, druck-taugliche Bildgröße über alle Layouts. Verhindert „Bild zu klein / falsch zugeschnitten"-Probleme im späteren PoD-Job. In 1-spaltig: ca. 12,5 × 8,3 cm; in 2-spaltig: ca. 6 × 4 cm. Wechsel des Layouts ändert nur die Anzeigegröße, keine Re-Crops. Druck-Mindestauflösung für 1-spaltig bei 300 DPI: 1477 × 985 px → Upload-Validierung lehnt zu kleine Originale ab.

**Warum Upload-Crop direkt im Dialog?**
Bilder im Bucket sind dann sofort druckfähig. Späterer Crop oder serverseitiges Resize entfällt. Das verbessert die spätere PoD-Pipeline (PROJ-16). Der Crop wird **ohne Downscaling** angewandt — die Original-Pixel des gewählten Crop-Rechtecks landen 1:1 im Bucket, damit 300 DPI im A5-Druck garantiert sind.

**Warum Drag-and-Drop für Bild-Reihenfolge?**
Spec verlangt es. Wir nutzen die gleiche dnd-Lösung wie für die Kapitel-Liste (PROJ-4), wenn dort eine etabliert ist — neue Abhängigkeit nur wenn nötig.

**Warum Auto-Save ohne manuellen „Speichern"-Knopf?**
Spec verlangt es. Reduziert kognitive Last für Schreibende (Zielgruppe: ältere Generation, technik-unsicher). Status-Anzeige in der Kopfleiste schafft Vertrauen.

**Warum kein Phone-Editor?**
Spec verlangt es; A5-Seitenstapel + Toolbar passt nicht sinnvoll auf < 768 px Viewport. Der Phone-Hinweis ist eine reine Server-Komponente — kein TipTap-Bundle wird geladen.

**Warum Signed URLs statt Public Bucket?**
Bilder können emotional sehr persönlich sein (Familienfotos, Erinnerungen). Privater Bucket + Signed URLs verhindert, dass öffentliche URLs in Suchmaschinen oder Logs landen. RLS sorgt zusätzlich dafür, dass nur Projektmitglieder Signed URLs anfordern können.

**Was wir nicht bauen (Nicht-Ziele für PROJ-5):**
- Kein Live-Co-Editing — Last-Writer-Wins, Versioning kommt in PROJ-15
- Keine Bilder im Fließtext — nur in den zwei festen Sektionen
- Keine echten Word-/PDF-Exporte — nur visuelle A5-Simulation im Browser
- Keine variablen Bild-Layouts (3-spaltig / Collage) — bewusst auf 1- und 2-spaltig beschränkt für vorhersehbare Buch-Optik

### D) Neue Abhängigkeiten (Pakete)

| Paket | Zweck |
|---|---|
| `@tiptap/react` | React-Bindings für den Editor |
| `@tiptap/starter-kit` | Fertige Standard-Funktionen (Fett, Kursiv, Listen, Undo/Redo etc.) |
| `@tiptap/extension-underline` | Unterstrichen (nicht im Starter-Kit) |
| `@tiptap/extension-text-align` | Textausrichtung (links, zentriert, rechts, Blocksatz) |
| `@tiptap/extension-placeholder` | Platzhaltertext im leeren Editor |
| `react-image-crop` | Crop-UI für den Bild-Upload-Dialog (3:2-Verhältnis) |
| `@dnd-kit/core` + `@dnd-kit/sortable` | Drag-and-Drop für Bild-Reihenfolge (nur wenn nicht bereits aus PROJ-4 vorhanden) |

### E) Schema-Ergänzungen (Migration)

Eine neue, nummerierte Migration unter `supabase/migrations/` ergänzt zur bestehenden `chapters`-Tabelle:

1. Spalte `image_sections JSONB NOT NULL DEFAULT '{"start":{"layout":"1-spaltig","images":[]},"end":{"layout":"1-spaltig","images":[]}}'`
2. Spalte `color_page_count INTEGER NOT NULL DEFAULT 0`
3. Optional: Spalte `hero_image_url` (aus PROJ-1) als deprecated markieren — wird durch `image_sections` ersetzt; Cleanup-Migration in separatem Ticket
4. RLS-Policies bleiben unverändert (gleiche Lese-/Schreibrechte wie für `body`)

### F) Speicher- und Lese-Fluss (vereinfacht)

```
Beim Öffnen des Kapitels (Server):
  1. Auth + RLS-Check (project_id, chapter_id)
  2. Lade chapter.title, chapter.body, chapter.image_sections
  3. Generiere Signed URLs (1 h) für alle Bilder in image_sections
  4. Übergib alles als Props an den Editor-Client

Beim Tippen (Client):
  1. Änderung → 2-Sekunden-Debounce → Server Action „chapter_autosave"
  2. Server Action validiert + UPDATE chapters SET title, body, image_sections, color_page_count, updated_at
  3. Status-Anzeige wechselt „Wird gespeichert…" → „Gespeichert ✓"

Beim Bild-Upload (Client):
  1. Datei + Crop-Region wählen
  2. Crop client-seitig (Canvas), erzeugt JPEG ≤ 10 MB
  3. Server Action „chapter_image_upload"
     a. Auth + RLS-Check
     b. Größen- und MIME-Check serverseitig
     c. Upload nach `chapter-heroes` mit deterministischem Pfad
     d. Append in image_sections.{start|end}.images
     e. Rückgabe der neuen Signed URL
  4. Slot erscheint sofort in der Sektion

Beim Bild-Löschen / Reorder (Client):
  1. Server Action mutiert image_sections direkt
  2. Bei Löschen: Storage-Datei wird mit gleicher Action entfernt (atomar)
```

### G) Print-Bereitschaft (PDF-Kontext)

Damit der Kapitel-Inhalt später (PROJ-16) sauber als A5-PDF gedruckt werden kann, gelten in PROJ-5 verbindliche zusätzliche Regeln:

**Eine HTML-Quelle für Bildschirm und Druck.**
Der Editor rendert pro Kapitel eine HTML-Struktur, die ohne strukturelle Änderung von einem Headless-Chromium-Renderer (z. B. Puppeteer/Playwright) in PDF gegossen werden kann. Es gibt **keine** separate „Print-Vorlage" mit anderer Reihenfolge oder anderem Markup — nur unterschiedliche CSS-Kontexte (Editor-CSS für Bildschirm-Anzeige, Print-CSS für `@media print` und `@page`).

**CSS-Strategie.**
- Konstanten in CSS-Variablen geteilt zwischen Editor und Print: `--page-width: 148mm`, `--page-height: 210mm`, `--page-margin-top: 1cm`, `--page-margin-right: 1cm`, `--page-margin-bottom: 1cm`, `--page-margin-left: 1.25cm` (entspricht Word-Template).
- Im Editor: jede A5-Seite ist ein `<section class="a5-page">`-Block mit festen `width`/`min-height` aus den CSS-Variablen → visuelle Buch-Simulation.
- Für PDF (PROJ-16): `@page { size: A5; margin: var(...) }` plus `.page-break { break-after: page; page-break-after: always; }` — der Browser paginiert automatisch.

**Seitenumbruch im TipTap.**
Der „Seitenumbruch einfügen"-Toolbar-Knopf erzeugt einen TipTap-Custom-Node, der im HTML als `<div data-type="page-break" class="page-break"></div>` serialisiert wird. Diese Klasse hat im Editor eine sichtbare Trennlinie und im Print-CSS `break-after: page`. Damit ist jeder Seitenumbruch sowohl visuell editierbar als auch druck-korrekt.

**Schriften.**
Lato, Merriweather und PT Serif werden als selbst gehostete Webfonts unter `/public/fonts/` ausgeliefert (nicht als Google-Fonts-Link). Grund: PDF-Renderer in Headless-Chromium können Schriften nur dann einbetten, wenn sie aus derselben Origin geladen werden und keinen externen Request brauchen. Gleiches `@font-face`-Regelwerk für Bildschirm und Print.

**Asset-Formate.**
- NARRAVIT-Logo und das dekorative Erste-Seite-Muster: **SVG** (nicht PNG), damit sie im Druck scharf bleiben.
- Nutzer-Bilder: JPEG, in voller Crop-Auflösung (siehe oben).

**Was im `body` (TipTap) nicht vorkommen darf.**
Alles, was im PDF nicht reproduzierbar wäre, ist im Editor nicht verfügbar: keine Links, keine Inline-Bilder im Fließtext, keine interaktiven Elemente, keine iFrames. Bilder leben strikt in den Sektionen Anfang/Ende — niemals im Fließtext. Dadurch ist garantiert, dass `body` → HTML → PDF immer verlustfrei läuft.

**Bild-Speicherung.**
Cropped JPEGs liegen im `chapter-heroes`-Bucket in voller Print-Auflösung. Beim PDF-Render zieht PROJ-16 dieselben Dateien per Signed URL → identische Bildqualität in Editor und Druck. Ein etwaiges späteres Resize-Bedürfnis (z. B. Web-Thumbnail) wird in einem Folge-Ticket gelöst, nicht in PROJ-5.

**`color_page_count` ist eine Schätzung.**
Die client-seitige Berechnung in PROJ-5 ist eine Vorschau (für späteren Print-Preis-Vergleich im Editor). Die **autoritative** Zählung übernimmt der PDF-Renderer in PROJ-16 nach erfolgter Pagination. Konsequenz: keine Geschäftslogik darf in PROJ-5 (oder PROJ-6 Stripe) auf `color_page_count` als Wahrheit vertrauen — nur als Anzeige-Wert.

**Pagination-Drift zwischen Editor und PDF.**
Browser-Pagination im Editor (jede A5-Seite als fester Container) und Print-Pagination (Chromium `@page` mit Block-Break-Verhalten) können bei langen Absätzen oder Bildern leicht unterschiedlich brechen. Wir akzeptieren das bewusst — die Editor-Anzeige ist eine **Annäherung**, der PDF-Renderer ist die Wahrheit. Eine perfekte Pixel-Parität gehört nicht zu PROJ-5 (würde Re-Implementation des Chromium-Layout-Algorithmus erfordern).

### H) Frontend-Implementierung (Stand 2026-05-17)

**Was steht:**
- Routenstruktur `/projektuebersicht/[project_id]/kapiteleditor/[chapter_id]` — bestehende Auth/RLS-Logik aus PROJ-4 weiterverwendet
- Phone-Hinweis (server-getriggert via Responsive-Sichtbarkeit; siehe Bekannte Lücken)
- A5-Seitenstil komplett in `globals.css` als CSS-Variablen → derselbe Code rendert Editor und PDF (PROJ-16)
- TipTap-Editor mit Custom-Paragraph (Zeilenabstand + Einrückung als Daten-Attribute, druck-tauglich)
- Custom-Node `PageBreakNode` → produziert `<hr class="a5-page-break">` mit `break-after: page`
- Werkzeugleiste: Fett, Kursiv, Unterstrichen, Blockzitat, Aufzählung, Nummerierung, 4× Ausrichtung, Zeilenabstand 1.0/1.5/2.0, Einrückung ±, Seitenumbruch, Undo, Redo
- Bild-Sektionen Anfang/Ende mit Layout-Wechsler 1-spaltig/2-spaltig und Drag-and-Drop-Sortierung via `@dnd-kit`
- Bild-Upload-Dialog mit `react-image-crop` (festes 3:2-Verhältnis, kein Downscaling, 10-MB-Check client + Warnung wenn < 1477 px)
- Auto-Save-Hook (2 s Debounce) mit Statusanzeige + Retry
- Wortzahl-Anzeige in der Fußleiste

**Was bewusst noch stubbed ist (kommt in `/backend`):**
- `saveDraftStub` in `EditorClient.tsx` — gibt nach 600 ms „Gespeichert" zurück, persistiert nichts
- `uploadImageStub` / `deleteImageStub` — erzeugen Blob-URLs lokal, kein Storage-Upload
- `chapters.image_sections` JSONB-Spalte + `chapters.color_page_count` INTEGER — Migration steht aus
- Server Action `chapter_autosave` (Body, Title, Image-Sections, color_page_count)
- Server Action `chapter_image_upload` mit serverseitiger MIME-/Größenprüfung
- Server Action `chapter_image_delete` (Storage + JSONB atomar)
- Signed-URL-Erzeugung für existierende Bilder beim SSR

**Neue Dependencies (in `package.json`):**
- `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-paragraph`, `@tiptap/extension-text-align`, `@tiptap/extension-underline`, `@tiptap/extension-placeholder`
- `react-image-crop`
- `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`
- shadcn-Komponenten: `toggle`, `toggle-group` (via `npx shadcn add`)

**Neue Komponenten unter `src/components/kapiteleditor/`:**
- `EditorClient.tsx` — Hauptwrapper
- `EditorToolbar.tsx` — Format-Werkzeugleiste
- `FirstPageTemplate.tsx` — Logo + Muster + H1
- `DecorativePattern.tsx` — SVG für erstes-Seite-Muster
- `ImageSection.tsx` — Layout-Wechsler + Slot-Grid + Add-Knopf
- `ImageUploadDialog.tsx` — Datei + Crop
- `PhoneNotice.tsx` — Hinweis-Seite < 768 px
- `SaveStatus.tsx` — Speicher-Status-Pill
- `WordCount.tsx` — Wortanzahl-Pill
- `tiptap/PageBreakNode.ts` + `tiptap/extensions.ts`

**Neue Lib/Hooks:**
- `src/hooks/useAutoSave.ts` — generischer 2-s-Debounce-Hook mit Retry
- `src/lib/kapiteleditor/types.ts` — geteilte Typen
- `src/lib/kapiteleditor/countWords.ts` — Wortzähler aus TipTap-JSON

**Bekannte Lücken / Punkte für QA:**
- Phone vs Editor wird per Responsive-CSS getoggelt (`md:hidden` / `hidden md:block`) — beide Bundles werden geladen, der Tipp aus der Spec „kein TipTap-Bundle wird auf Phone geladen" ist damit noch nicht eingehalten. Optimierung über Server-User-Agent-Sniffing oder dynamischen Import wäre Folge-Ticket
- A5-Seitenstapel wird im Editor als **eine** lange A5-Box gerendert; visuelle Seitenumbrüche entstehen nur durch den Custom-`PageBreakNode`. Automatische Pagination (Editor zeigt mehrere A5-Seiten je nach Inhaltslänge) ist nicht enthalten — der PDF-Renderer in PROJ-16 ist autoritativ für die echte Seitenaufteilung
- `color_page_count`-Berechnung im Client ist heuristisch (`estimateColorPages` in EditorClient.tsx); wird in PROJ-16 durch reale Print-Pagination ersetzt
- `chapters.body` enthält nach Save TipTap-JSON; existierende Test-Chapter haben evtl. einen anderen Body-Shape — Editor lädt dann leer, ist akzeptabel
- Auto-Save-Latenz und Fehlerverhalten sind UI-seitig fertig, aber bis Backend nicht echt prüfbar

### I) Offene Punkte für QA / Folge-Tickets

- Bild-Reihen-Wechsel bei 1↔2-spaltig: was passiert mit „halbvollen" Reihen (z. B. 3 Bilder im 2-spaltigen Layout)? Vorschlag: letzter Slot bleibt allein in seiner Reihe (links-bündig), kein automatisches Re-Padding. Wird in QA visuell geprüft.
- Performance bei sehr vielen Bildern (z. B. 30+ pro Sektion): kein Hard-Limit in PROJ-5, aber QA soll bei ≥ 20 Bildern testen, ob Save-Latenz noch akzeptabel ist. Bei Problemen → Hard-Limit (z. B. 24) in Follow-up.
- `color_page_count`-Berechnung: erfordert genaue Kenntnis, wie viele A5-Seiten der Editor pro Sektion und Fließtext belegt. Client-Schätzung über CSS-Höhen-Messung; präzise Druck-Berechnung erst in PROJ-16.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
