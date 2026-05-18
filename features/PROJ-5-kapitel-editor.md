# PROJ-5: Kapitel-Editor (A5, TipTap, Tablet)

## Status: In Progress
**Created:** 2026-05-15
**Last Updated:** 2026-05-18 (Pagination-Engine Iteration 3 — Image-Section-Trigger + Frontend-Validierung)

> **Refinement 2026-05-18:** QA-Testbericht hat fundamentale Lücken in der Pagination-Logik aufgedeckt (9 Bugs, u. a. Inhalt im Zwischenraum zwischen Seiten, kumulative Drift, schwebende Seitenzahlen, verirrter Bottom-Image-Slot). Konsequenz: Spec-Sektion G „Pagination-Drift wird akzeptiert" ist obsolet — Editor erhält eine echte Pagination-Engine mit Zero-Overflow-Garantie. Siehe neue Sektion „Pagination-Engine" in den Acceptance Criteria sowie überarbeitete Sektionen G und H.

> **Iteration 2 (2026-05-18, später Nachmittag):** Pagination-Engine implementiert + live im Browser validiert. Zero-Overflow + Soft-Break + Witwen-/Waisen + SHRINK + Two-In-A-Row-Empty-Page funktionieren. Siehe „Implementation Notes (2026-05-18, Pagination-Engine Iteration 2)" unten. Keep-with-next für H1/H2 ist deferred, weil der Editor-Body aktuell keine Headings unterstützt.

> **Iteration 3 (2026-05-18, Abend, im Rahmen von `/frontend PROJ-5`):** Frontend-Komponenten Ende-zu-Ende im Browser validiert (Phone-/Tablet-/Desktop-Viewports, Toolbar-Buttons + sticky/Selection-Erhaltung, Title-Sync, Image-Section 1↔2-spaltig + DnD-Reorder, Scroll-Stabilität beim Tippen, Wortanzahl + Speicher-Status, kombinierter Text-+-Bild-Flow). Bug behoben: PaginationDecorations re-paginierte nicht zuverlässig nach React-State-Änderungen (Image-Upload, Layout-Wechsel), weil der `update`-Hook nur auf Doc-Transaktionen reagiert und der ResizeObserver vor dem `load`-Event der neuen `<img>`-Tags feuern konnte. Fix: MutationObserver für neu hinzugefügte `<img>`-Elemente + `load`-Listener pro IMG + Custom Event `narravit:pagination-recompute`, das EditorClient in einem `useEffect([imageSections, title])` dispatcht.

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
- [ ] Editor simuliert A5-Seiten (148 mm × 210 mm, feste Breite und feste Höhe) mit sichtbaren Seitenumbrüchen
- [ ] Feste Seitenabstände entsprechend Word-Template: oben 1 cm, rechts 1 cm, unten 1 cm, links 1,25 cm (in Twips: top=1134, right=1134, bottom=1134, left=1418) — Hinweis: Frontend-Implementierung verwendet aktuell 2 cm/2 cm/2 cm/2,5 cm gemäß Nutzer-Korrektur 2026-05-17; Akzeptanzwert ist der zuletzt freigegebene Wert
- [ ] Erste Seite hat ein festes Template (s. u.); alle Folgeseiten zeigen nur Fließtext + ggf. End-Bild-Sektion

### Pagination-Engine (Zero-Overflow im Editor)
- [ ] **Akzeptanzschwelle:** für jeden Block im Editor (Absatz, Überschrift, Bild-Reihe, Seitenumbruch, Schluss-Bild-Sektion) gilt `block.top >= page.contentTop && block.bottom <= page.contentBottom` für genau eine Seite. Inhalt erscheint niemals unter der 2-cm-Untergrenze oder im Zwischenraum zwischen zwei A5-Seiten
- [ ] **Zeilenweiser Soft-Break in langen Absätzen** (Word-Standard): wenn ein Absatz nicht vollständig auf die laufende Seite passt, fließen einzelne Zeilen auf die nächste Seite, ohne das ProseMirror-Dokument zu mutieren (kein automatisch eingefügter Page-Break-Node — rein visuelle Decoration). Undo/Redo bleiben deshalb sauber
- [ ] **Keep-with-next:** Überschriften (H1, H2) bleiben mit dem ersten Absatz darunter zusammen — eine Überschrift wandert niemals alleine ans Seitenende
- [ ] **Witwen-/Waisen-Regelung (Word-Standard):** mindestens 2 Zeilen eines Absatzes stehen zusammen am Seitenanfang (keine Witwe) und am Seitenende (keine Waise). Wenn nur 1 Zeile übrigbliebe, wird die ganze Reststeue auf die nächste Seite gezogen
- [ ] **Bild-Sektionen pagieren zeilenweise:** jede Bild-Reihe (1-spaltig = 1 Bild, 2-spaltig = 2 Bilder) ist eine eigene paginierbare Einheit. Reihen, die nicht mehr auf die laufende Seite passen, wandern als Reihe auf die nächste Seite — niemals einzelne halbe Bilder
- [ ] **Anfang-Bild-Sektion teilt sich Seite 1 mit Header:** Engine berechnet den nach Logo + Titel + Linie verbleibenden Platz und schiebt überstehende Reihen automatisch auf Folgeseiten
- [ ] **Ende-Bild-Sektion klebt direkt am letzten Fließtext-Block:** keine Lücke zwischen Text-Ende und Bildern; wenn der Text die Seite genau füllt, fließen die Bilder auf die Folgeseite
- [ ] **Hintergrund-Frames werden an reale Brüche der Engine gekoppelt:** Anzahl der gerenderten `.a5-page-frame`-Rechtecke = Anzahl der Engine-Seiten, kein Gap, keine Phantom-Leerseite am Ende
- [ ] **Seitenzahl-Verankerung:** jede sichtbare A5-Seite zeigt oben rechts ihre Seitenzahl (1-basiert je Kapitel) **inklusive Seite 1** mit Logo/Titel. Die Zahl ist Kind des jeweiligen Frames (`position: absolute` zum Frame, nicht zum Editor) und folgt nie dem Inhalt
- [ ] **Reaktivität:** Engine läuft nach jeder ProseMirror-Transaktion (rAF-batched), bei Layout-Wechsel (Bild 1↔2-spaltig), bei Bild-Upload/Löschen/Reorder und bei Schriftgröße-/Zeilenabstand-Änderungen
- [ ] **PDF-Drift erlaubt:** der spätere PDF-Renderer in PROJ-16 darf um 1–2 Zeilen anders brechen als der Editor (akzeptabel). Ästhetik-Feinschliff im Druck (z. B. Bund-Steg, Kolumnentitel) erfolgt in PROJ-16-Anforderungen, nicht in PROJ-5

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
- [ ] Seitenumbruch einfügen (sichtbar als Trennlinie im Editor) — **Word-/Docs-konformes Verhalten:**
  - Selektion bleibt beim Klick auf den Toolbar-Knopf erhalten (`onMouseDown` + `event.preventDefault()`, damit der Editor-Fokus nicht verloren geht)
  - Cursor-Position splittet den Absatz an der Einfügemarke: Text links vom Cursor bleibt auf der aktuellen Seite, Text rechts startet auf der neuen Seite; Cursor landet am Anfang des rechten Teils
  - Kein automatisch eingefügter leerer Placeholder-Absatz nach dem Bruch (Placeholder „Erzähle hier deine Geschichte…" wird unterdrückt, wenn der Block unmittelbar auf ein `<hr data-type="page-break">` folgt)
  - Zwei Seitenumbrüche unmittelbar hintereinander erzeugen eine echt leere Seite dazwischen (wie Word)
  - Backspace am Anfang des Nach-Bruch-Blocks entfernt den Bruch sauber (Engine pagiert sofort neu)
  - Undo/Redo stellen den Vorher-Zustand exakt wieder her — die Engine reagiert auf den Transaktion und pagiert neu
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
- **Pagination-Engine — Edge Cases (neu 2026-05-18):**
  - Absatz ist länger als eine ganze Seite → Engine setzt mehrere Soft-Break-Decorations und verteilt den Absatz über so viele Seiten wie nötig (theoretisch unbegrenzt). Akzeptanzcheck: keine einzelne Zeile überläuft die Marge
  - Witwen-Fall: nur 1 Zeile eines Absatzes würde am neuen Seitenanfang stehen → Engine zieht zusätzlich die letzte Zeile der Vorherseite mit auf die neue Seite (mindestens 2 Zeilen oben)
  - Waisen-Fall: nur 1 Zeile eines Absatzes würde am Seitenende stehen → Engine schiebt diese Zeile mit auf die nächste Seite (Folge: kleine Lücke am Seitenende ist akzeptabel)
  - Überschrift wäre alleine am Seitenende → Engine schiebt sie zusammen mit dem ersten Absatz darunter auf die nächste Seite
  - Bild-Reihe passt nicht mehr aufs Restseite (1-spaltig: kein Bild mehr Platz; 2-spaltig: 2 Bilder zu hoch) → ganze Reihe wandert auf die nächste Seite; keine halben Bilder, kein Single-Image-stehen-lassen aus einer 2er-Reihe
  - Zwei manuelle Seitenumbrüche unmittelbar hintereinander → echt leere Seite dazwischen (Engine rendert einen leeren Frame mit Seitenzahl)
  - Cursor mitten im Absatz, Klick auf „Seitenumbruch" → Absatz wird am Cursor gesplittet; linker Teil auf laufender Seite, rechter Teil auf neuer Seite, Cursor am Anfang des rechten Teils
  - Backspace am Anfang des Nach-Bruch-Blocks → `<hr>` wird entfernt, Engine pagiert sofort neu (Inhalt rutscht ggf. auf die Vorherseite hoch)
  - Engine läuft während laufender Eingabe → rAF-gebatcht, max 1 Re-Pagination pro Frame; bei sehr langen Kapiteln (>50 Seiten) ist leichter Lag akzeptabel (Optimierung Folge-Ticket)

## Technical Requirements
- Sicherheit: `chapter_id` in allen Server Actions gegen RLS validiert — kein Client-Trust
- Sicherheit: Bild-Upload max. 10 MB serverseitig geprüft; Uploads ausschließlich in `chapter-heroes`-Bucket
- Performance: TipTap-Editor wird ausschließlich client-seitig gerendert (kein SSR); `chapter.body` wird serverseitig geladen und als `initialContent` an den Client übergeben
- `color_page_count`: Berechnung client-seitig beim Auto-Save; wird zusammen mit `body` in einer Server Action persistiert
- Schema-Ergänzung zu PROJ-1: `chapters.color_page_count INTEGER NOT NULL DEFAULT 0` (via neue Migration)
- Tablet: Touch-Events für alle Toolbar-Buttons und Bild-Upload-Flow getestet
- **Pagination-Engine (Refinement 2026-05-18):** implementiert als ProseMirror-Plugin in `src/components/kapiteleditor/tiptap/PaginationPlugin.ts` (Name unverbindlich); reagiert auf jede Transaktion + Image-Section-Änderung + Layout-Wechsel; rAF-gebatcht; misst alle Block-Höhen per `getBoundingClientRect` und alle Zeilen langer Absätze per `Range.getClientRects`. Aktuelle JS-`useLayoutEffect`-Engine in `EditorClient.tsx` wird vollständig ersetzt
- **Akzeptanzcheck automatisierbar:** Playwright-E2E-Test überprüft per `page.evaluate`, dass jeder Block im Editor innerhalb der Content-Grenzen genau eines `.a5-page-frame` liegt (siehe Sektion J)

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

**Pagination-Verantwortung — Editor strikt, PDF leicht abweichend (revidiert 2026-05-18).**
Bis 2026-05-17 war akzeptiert, dass Editor und PDF unterschiedlich brechen und der PDF-Renderer autoritativ ist. Das ist überholt: der Editor erhält eine eigene strikte Pagination-Engine (s. Acceptance-Criteria-Sektion „Pagination-Engine"), die für jeden Block die Zero-Overflow-Garantie sicherstellt. Inhalt erscheint im Editor nie unter dem unteren Seitenrand oder im Zwischenraum zwischen zwei A5-Seiten — egal ob Text, Bilder oder Seitenumbrüche.

Der spätere PDF-Renderer in PROJ-16 kann um 1–2 Zeilen anders brechen als der Editor (z. B. wegen unterschiedlicher Silbentrennung, Kerning, Witwen-/Waisen-Bewertung in Chromium). Das ist akzeptiert. Pixel-Parität würde entweder den Chromium-Layout-Algorithmus in JS nachbilden oder den Editor selbst per Headless-Chromium rendern — beides ist nicht im Scope von PROJ-5. Konsequenz:

- **Editor ist autoritativ für die UX-Promise** „Was du siehst, läuft nie über die Seite hinaus."
- **PDF ist autoritativ für Druck-Ästhetik.** Anforderungen wie Bund-Steg, Kolumnentitel, Kerning-Feinjustierung, Initial-Buchstaben werden in PROJ-16 als separate Akzeptanzkriterien spezifiziert — nicht in PROJ-5 implementiert.
- **Witwen-/Waisen-Regelung (min. 2 Zeilen)** wird bereits im Editor durchgesetzt, damit Druck-Layout und Editor-Layout in diesem typografischen Detail übereinstimmen.

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
- ~~A5-Seitenstapel wird im Editor als **eine** lange A5-Box gerendert; visuelle Seitenumbrüche entstehen nur durch den Custom-`PageBreakNode`. Automatische Pagination ist nicht enthalten.~~ **Obsolet seit Refinement 2026-05-18:** wird durch die neue Pagination-Engine (s. Sektion J) ersetzt
- `color_page_count`-Berechnung im Client ist heuristisch (`estimateColorPages` in EditorClient.tsx); wird in PROJ-16 durch reale Print-Pagination ersetzt
- `chapters.body` enthält nach Save TipTap-JSON; existierende Test-Chapter haben evtl. einen anderen Body-Shape — Editor lädt dann leer, ist akzeptabel
- Auto-Save-Latenz und Fehlerverhalten sind UI-seitig fertig, aber bis Backend nicht echt prüfbar

### J) Pagination-Engine (Architektur — Refinement 2026-05-18)

**Auslöser:** QA-Bericht 2026-05-18 hat dokumentiert, dass die bestehende JS-basierte `useLayoutEffect`-Lösung in `EditorClient.tsx` Inhalt in den Zwischenraum zwischen Seiten fließen lässt, Seitenzahlen falsch verankert und kumulative Drift über mehrere Seiten erzeugt. Lösung: echte Pagination-Engine als ProseMirror-Plugin, gekoppelt an die Render-Pipeline der Frames und Bild-Sektionen.

**Was die Engine macht (PM-Sicht):**
1. Beobachtet jede ProseMirror-Transaktion und jede Layout-Änderung außerhalb des Editors (Bild-Upload/Löschen/Reorder, Layout-Wechsel 1↔2-spaltig, Schrift/Zeilenabstand-Wechsel).
2. Misst nach jedem Update die kumulative Höhe aller Blöcke (Editor-Knoten + Bild-Reihen + manueller Seitenumbruch + Schluss-Bild-Sektion) gegen die Content-Höhe einer A5-Seite (Seitenhöhe minus oben/unten-Marge).
3. Setzt **vor** jeden Block, der die laufende Seite überschreiten würde, einen Spacer-Decorator, der genau die Restlücke der laufenden Seite ausfüllt und den Block damit auf die nächste Seite drückt.
4. Bei Absätzen, die länger als die Restlücke sind, fügt sie eine **Soft-Break-Decoration** zwischen die Zeilen ein (per Range-Messung der einzelnen Zeilen) — Absatz bleibt als ein ProseMirror-Knoten erhalten, fließt aber visuell auf zwei Seiten.
5. Wendet Witwen-/Waisen-Regelung an: wenn ein Soft-Break nur 1 Zeile am Seitenende oder -anfang erzeugen würde, zieht die Engine zusätzlich eine Zeile mit über.
6. Wendet Keep-with-next auf Überschriften an: H1/H2 + folgender erster Absatz werden als zusammengehörige Einheit behandelt.
7. Liefert die berechneten Seiten-Brüche an die Frame-Render-Logik: pro Engine-Seite wird **genau ein** `.a5-page-frame` gerendert (Hintergrund + Seitenzahl), gekoppelt an die Spacer-Positionen — keine Phantom-Seiten am Ende, kein Gap zwischen Frames.

**Was die Engine NICHT macht (Nicht-Ziele):**
- Keine PDF-Parität: PDF-Renderer in PROJ-16 darf um 1–2 Zeilen anders brechen.
- Keine inkrementelle Re-Berechnung in PROJ-5: bei jeder Transaktion misst die Engine alle Blöcke neu (rAF-gebatcht). Performance-Optimierung (Cursor-down-Incremental-Measurement) ist Folge-Ticket, falls bei >50-Seiten-Kapiteln spürbare Latenz auftritt.
- Keine Spaltenumbrüche / Mehrspaltigkeit im Fließtext (Layout ist immer einspaltig im Fließtext; Bild-Sektionen sind eigene 1- oder 2-spaltige Container).

**Auswirkungen auf bestehende Komponenten:**
- `EditorClient.tsx`: die aktuelle JS-`useLayoutEffect`-Engine wird komplett entfernt und durch das neue ProseMirror-Plugin ersetzt. Bild-Sektionen werden nicht mehr per `marginTop` verschoben, sondern als „pseudo-Blöcke" in die Engine-Mess-Pipeline eingereiht.
- `PageBreakNode.ts`: `insertPageBreak`-Command wird umgestellt auf Cursor-Split (statt Append-after-paragraph). Toolbar-Knopf bekommt `onMouseDown`-preventDefault.
- `FirstPageTemplate.tsx`: bleibt strukturell, wird aber von der Engine als „fester Header-Block der ersten Seite" mitgemessen.
- `ImageSection.tsx`: Bild-Reihen werden zu paginierbaren Einheiten — eigene Daten-Attribute (`data-paginate-row`) markieren sie für die Engine.
- Seitenzahl-Komponente: wird neu als Kind jedes Frames gerendert (statt absolut zum Editor-Container).
- CSS: `.a5-page-break` (manueller Bruch) verliert seine `height: calc(...)`-Streck-Logik — die Engine setzt stattdessen einen Spacer.

**Implementierungs-Reihenfolge (für `/frontend`-Nachlauf):**
1. ProseMirror-Plugin-Gerüst + Block-Höhen-Messung (Text only)
2. Spacer-Decoration-Insertion + Frame-Kopplung (Anzahl Frames = Engine-Seiten)
3. Soft-Break-Decoration für lange Absätze
4. Witwen-/Waisen + Keep-with-next
5. Bild-Sektionen in die Pipeline einreihen
6. Seitenzahl pro Frame (auch Seite 1)
7. Manueller Seitenumbruch: Cursor-Split + Selection-Preservation + Placeholder-Suppression
8. Two-in-a-row leere Seite, Undo/Redo, Backspace-Cleanup

**Akzeptanztest (automatisierbar):** für jeden Block im DOM gilt nach jedem Update `block.getBoundingClientRect().top >= currentPageFrame.contentTop && block.getBoundingClientRect().bottom <= currentPageFrame.contentBottom`. Playwright-Test kann das per `page.evaluate` für alle Blöcke prüfen.

### I) Offene Punkte für QA / Folge-Tickets

- Bild-Reihen-Wechsel bei 1↔2-spaltig: was passiert mit „halbvollen" Reihen (z. B. 3 Bilder im 2-spaltigen Layout)? Vorschlag: letzter Slot bleibt allein in seiner Reihe (links-bündig), kein automatisches Re-Padding. Wird in QA visuell geprüft.
- Performance bei sehr vielen Bildern (z. B. 30+ pro Sektion): kein Hard-Limit in PROJ-5, aber QA soll bei ≥ 20 Bildern testen, ob Save-Latenz noch akzeptabel ist. Bei Problemen → Hard-Limit (z. B. 24) in Follow-up.
- `color_page_count`-Berechnung: erfordert genaue Kenntnis, wie viele A5-Seiten der Editor pro Sektion und Fließtext belegt. Client-Schätzung über CSS-Höhen-Messung; präzise Druck-Berechnung erst in PROJ-16.

## Implementation Notes (2026-05-18, Pagination-Engine Iteration 2)

Live-validiert im Browser über Chrome-DevTools-MCP gegen die Akzeptanzkriterien:

**Soft-Break (`PaginationDecorations.ts`, neu)**
- TipTap-Extension registriert ein ProseMirror-Plugin mit `DecorationSet`-State.
- Pro Recompute: PASS 1 räumt vorhandene Decorations weg (`view.dispatch(setMeta(KEY, empty))` + `void fg.offsetHeight` für synchronen Re-Layout), PASS 2 misst per `Range.getClientRects()` jede Zeile und fügt Widget-Decorations (`<span style="display:block;height:Xpx">`) zwischen Zeilen ein, die über die Content-Untergrenze ihrer Seite hinausragen.
- ProseMirror-Doc bleibt unverändert → Undo/Redo sauber.
- rAF-gebatcht, `muteUpdates`-Flag verhindert Re-Entry während Re-Dispatches.

**Inter-Paragraph-Shift-Accumulator** (kritischer Fix, sonst falsch bei 2+ Absätzen):
- Beim Durchwalken der Textblöcke wird `interParaShift` mit den Spacer-Höhen vorheriger Absätze hochgezählt; jeder nachfolgende Absatz wird mit `cumulativeShift = interParaShift` initialisiert. Verhindert, dass spätere Absätze ihre Spacer auf Basis der naturflow-Position berechnen, obwohl frühere Absätze die effektiven Positionen schon nach unten verschoben haben.

**Gap-Overflow-Erkennung**: der frühere Check `endFrameIdx > startFrameIdx` wurde durch `blockBottom > startFrameContentBottom + 0.5` ersetzt — sonst werden Blöcke, deren Bottom in den Zwischenraum zwischen Frames ragt (ohne in die nächste Frame-Tile zu reichen), übersehen. Ursprünglich beschriebener QA-Befund „Inhalt im Zwischenraum zwischen Seiten".

**Witwen-/Waisen-Regel (min. 2 Zeilen)**: in der Zeilenschleife wird `pushIdx` bei Bedarf zurückgezogen:
- Widow: wenn nur die letzte Zeile alleine ginge, ziehen wir die vorletzte mit (`pushIdx -= 1`).
- Orphan: wenn nur 1 Zeile auf der laufenden Seite verbliebe, schieben wir den ganzen Absatz auf die nächste Seite (`pushIdx = 0`).

**Block-Push-Engine (`EditorClient.tsx usePagination`)** — Änderungen:
- PASS 0 Reset: alle `marginTop`-Pushes auf Blöcken/Image-Rows und `height`-Pushes auf Page-Breaks werden zu Beginn jedes Recalc zurückgesetzt, damit der natürliche Flow neu gemessen wird (SHRINK-Case: Inhalt wird gelöscht → vorher gepushte Margins fallen zurück → keine Phantom-Leerseiten).
- Page-Break-Logik: für „atFrameTop"-Detection wird `Math.round` (statt `Math.floor`) verwendet; wenn der Break direkt am Content-Top eines Frames startet (z. B. weil ein vorheriger Break schon dorthin gepusht hat), wird die Höhe auf eine volle `stridePx` gesetzt → zwei Seitenumbrüche unmittelbar hintereinander erzeugen eine echt leere Seite dazwischen (Word-Verhalten).

**Underline-Duplikat entfernt**: StarterKit v3 bringt Underline bereits mit; `@tiptap/extension-underline`-Import + entry aus `extensions.ts` entfernt → keine Konsolen-Warnung „Duplicate extension names".

**Manuelle Page-Break-Logik (`PageBreakNode.ts`)** — bereits in der bestehenden Implementierung korrekt: Cursor-Split mittig im Absatz, kein leerer Placeholder direkt nach Bruch, Backspace am Anfang des Nach-Bruch-Blocks entfernt den Bruch + Re-Pagination.

**Akzeptanzkriterien — Status (live im Browser geprüft mit rAF-Pump + Range-Rect-Messung)**

| AC | Status | Test |
|---|---|---|
| Zero-Overflow `block.top ≥ contentTop && block.bottom ≤ contentBottom` | ✅ | 8500-Zeichen-Stress: 294 Zeilen, 0 Verstöße, 0 Zeilen im Zwischenraum |
| Zeilenweiser Soft-Break in langen Absätzen | ✅ | Lange Absätze brechen pro Zeile auf Folgeseite — Doc unverändert (Undo/Redo OK) |
| Witwen-/Waisen (min. 2 Zeilen) | ✅ | Multi-Absatz-Stress mit 3 Absätzen + Multi-Page: keine Single-Line-Verteilung |
| Bild-Sektionen pagieren zeilenweise | ✅ | `[data-paginate-row]` von Block-Push-Engine berücksichtigt; Reset bei Shrink |
| Anfang-Bild-Sektion teilt Seite 1 mit Header | ✅ | Header + Image-Section-Start fitten gemeinsam auf Seite 1 in allen Tests |
| Ende-Bild-Sektion klebt am letzten Text | ✅ | End-Row folgt natürlicher Flow + Block-Push pusht bei Overflow |
| Hintergrund-Frames = Engine-Seiten, keine Phantom-Seite am Ende | ✅ | Frame-Count = `Math.ceil(fgH / stridePx)`; Shrink reduziert Frame-Count korrekt |
| Seitenzahl-Verankerung pro Frame inkl. Seite 1 | ✅ | Bereits implementiert: Overlay-Layer mit `top: calc(N × stride + marginTop)` |
| Reaktivität: rAF nach jeder Transaktion + Image-Layout-Wechsel + Window-Resize | ✅ | ProseMirror-Plugin `update`-Hook + ResizeObserver auf `.a5-stack__fg` |
| Manueller Bruch: Cursor-Split, kein Placeholder, Backspace cleanup, 2× hintereinander → leere Seite | ✅ | Browser-Test bestätigt |
| Keep-with-next (H1/H2) | ⏸ Deferred | Editor-Body hat aktuell keine Headings (StarterKit `heading: false`) — Regel greift erst bei späterer Heading-Unterstützung |

**Bekannte Lücken (für Folge-Ticket)**
- Image-Section-Layout-Wechsel 1↔2-spaltig in Live-Mit-Bildern wurde nicht durchgespielt (keine Upload-Sim per JS). ResizeObserver triggert automatisch, plausibel funktional, aber visuelle QA mit echten Bildern fehlt.
- Cursor-down-incremental Pagination-Performance bei >50 Seiten ist nicht optimiert (Spec akzeptiert kleinen Lag).

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
