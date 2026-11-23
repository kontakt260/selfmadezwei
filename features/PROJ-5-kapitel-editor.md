# PROJ-5: Kapitel-Editor (A5, TipTap, Tablet)

> **Kurzfassung (PROJ-31).** Das vollständige Tech Design, Bau-Notizen, QA-Protokolle und der Deployment-Verlauf stehen unverändert im [Archiv](archive/PROJ-5-kapitel-editor.md).

## Status: Deployed
**Created:** 2026-05-15
**Last Updated:** 2026-11-21 (Bild-Upload-Fix für große Fotos)

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

## Technische Entscheidungen
_Kurzform. Die vollständige Begründung steht im Archiv._

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

### F) Tech-Entscheidungen (Begründungen)

1. **Unified Loop statt zweier Engines** — Rom-Cause-Fix für Bug 1 + alle Race-Symptome. Komplexitätsreduktion: ein Codepfad, eine Wahrheit, ein rAF-Tick.
2. **PaginationDecorations bleibt erhalten als Renderer** — wir wollen die Vorteile der ProseMirror-Widget-Decorations (Undo-sicher, Re-Render-stabil) behalten.
3. **characterData-Observation** — zwingend nötig, damit Tippen ein Pagination-Recalc auslöst. Heute fehlt das vollständig.
4. **Hypher (DE+EN) statt nur CSS-`hyphens`** — Browser-`hyphens: auto` ist nicht deterministisch, kennt nur eine Sprache pro `lang`-Attribut und versagt bei Phantasiewörtern + Sonderzeichen.
5. **mousedown-preventDefault auf allen Toolbar-Slots** — das Pattern existiert bereits funktionierend an einem Button; wir replizieren es.
6. **Enter-Rule + Paste-Sanitizer statt Triple-Click-Workaround** — die Wurzel ist eine kaputte Absatz-Struktur. Wir reparieren das Schema, nicht die Selektions-Logik.

## Offene Punkte
- RUN2-BUG-1 (Low): Die Zeile vor einem Seitenabstand ist nicht bündig zur rechten Marge, zurückgestellt.
- Das Springen von etwa 50 ms nach jedem manuellen Umbruch bleibt. Es soll mit PROJ-21 behoben werden, indem beide Engines in fester Reihenfolge laufen.
- Die Zusammenlegung der beiden Seitenumbruch-Engines ist vertagt (PROJ-21, PROJ-25).
- Keep-with-next für Überschriften ist zurückgestellt, weil der Editor-Text keine Überschriften hat.
- Die Seitenberechnung beim Cursor nach unten ist ab etwa 50 Seiten nicht optimiert. Die Spec akzeptiert kleine Verzögerungen.
- Vor Production: Handtest in weiteren Browsern.
- Bei mehr als 20 Bildern je Sektion ist die Speicherzeit nicht belegt. Bei Problemen ein Limit setzen, etwa 24.
- Halbvolle Bildreihen beim Wechsel zwischen 1- und 2-spaltig prüfen (Vorschlag: Das letzte Bild bleibt links allein).
- `color_page_count` ist eine Schätzung, die genaue Druckberechnung kommt mit PROJ-16.
- Bei UI-Zoom ungleich 100 % kann eine Zeile rundungsbedingt bis etwa 1 px vom Inhaltsbereich abweichen.
