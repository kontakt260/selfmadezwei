# PROJ-5: Kapitel-Editor (A5, TipTap, Tablet)

## Status: Planned
**Created:** 2026-05-15
**Last Updated:** 2026-05-15

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
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
