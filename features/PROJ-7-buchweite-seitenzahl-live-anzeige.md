# PROJ-7: Buchweite Seitenzahl – Live-Anzeige

## Status: Planned
**Created:** 2026-05-21
**Last Updated:** 2026-05-21

## Dependencies
- Requires **PROJ-1** (Supabase-Datenmodell & RLS) — neue persistierte Felder `chapters.page_count` + `chapters.start_page` (oder gleichwertiges Modell, konkrete Modellierung in `/architecture`)
- Requires **PROJ-5** (Kapitel-Editor) — ersetzt die kapitel-lokale Seitenzahl in den A5-Frames durch den buchweiten Wert

## User Stories
- Als **Schreibender** möchte ich auf jeder A5-Seite die echte Buch-Seitenzahl sehen, damit ich beim Schreiben einschätzen kann, wo im Gesamtbuch ich gerade bin.
- Als **Schreibender** möchte ich, dass die Zahl im Editor mit der Zahl im später gedruckten Buch übereinstimmt — keine Überraschungen beim Drucken.
- Als **Schreibender** möchte ich beim Öffnen eines Kapitels sofort die aktuelle Buch-Position sehen, ohne neu laden zu müssen.
- Als **Schreibender** möchte ich, dass die Buch-Seitenzahlen sich während des Tippens live an meine eigene Kapitel-Länge anpassen (z. B. wenn ein neuer Absatz Zeilen auf die nächste Seite drückt).
- Als **Initiator / Mit-Lesender** möchte ich später auf eine konkrete Buch-Seite verweisen können (z. B. „Seite 73") — die Zahl im Editor stimmt mit der Zahl im fertigen Buch.

## Acceptance Criteria

### Anzeige
- [ ] Jede sichtbare A5-Seite im Editor zeigt oben rechts ihre **buchweite** Seitenzahl (z. B. 47, 48, 49).
- [ ] Die bisherige kapitel-lokale Zählung (1, 2, 3 … pro Kapitel) im A5-Frame entfällt vollständig — sie wird durch den buchweiten Wert ersetzt, nicht ergänzt.
- [ ] Position, Schriftgröße und Styling der Seitenzahl-Beschriftung bleiben gegenüber dem PROJ-5-Stand unverändert (nur der **Wert** ändert sich, das Layout nicht).
- [ ] Editor-Footer (z. B. „12 Seiten") bleibt **kapitel-lokal** — keine Buch-Range hier.

### Offset-Berechnung
- [ ] Kapitel 1 (nach `sort_order`) startet bei Buch-Seite **1**.
- [ ] Kapitel N startet bei Buch-Seite `(Summe der page_count von Kapitel 1..N−1) + 1`.
- [ ] Jedes Kapitel zählt mit **mindestens 1 Seite** — frisch erstellte leere Kapitel verschieben den Offset folgender Kapitel sofort.
- [ ] Cover / Titelblatt / Widmung / Inhaltsverzeichnis: **kein Frontmatter-Offset** in PROJ-7 (out of scope; ggf. eigenes Ticket, sobald PROJ-10 Cover-Editor / Print-on-Demand-Anbieter es nötig macht).

### Liveness
- [ ] Beim Öffnen eines Kapitels lädt der Editor den aktuellen `start_page` für dieses Kapitel aus der DB.
- [ ] Während der User im offenen Kapitel tippt und die Pagination-Engine die lokale Seitenzahl verändert, aktualisieren sich die Buch-Seitenzahlen der sichtbaren Seiten dieses Kapitels **live** (`start_page + seite_index − 1`).
- [ ] Änderungen an **anderen Kapiteln** in parallel offenen Sessions / Tabs / Geräten werden im aktuellen Editor **nicht** live nachgezogen — erst beim nächsten Öffnen aktuell (bewusst kein Realtime-Push; konsistent zum PRD-„Kein Live-Co-Editing"-Nicht-Ziel).

### Reorder & CRUD
- [ ] Nach Umsortieren (DnD) der Kapitel in der Projektübersicht ist beim **nächsten Öffnen** eines Kapitels die Buch-Seitenzahl korrekt zur neuen Reihenfolge.
- [ ] Nach Anlegen eines neuen Kapitels stehen Buch-Seitenzahlen aller nachfolgenden Kapitel beim nächsten Öffnen korrekt zur neuen Position.
- [ ] Nach Löschen eines Kapitels rutschen die Buch-Seitenzahlen nachfolgender Kapitel beim nächsten Öffnen entsprechend nach unten.

### Persistenz
- [ ] Pro Kapitel werden `page_count` (lokale Seitenzahl, vom Editor beim Auto-Save geschrieben) und `start_page` (Buch-Offset, server-seitig berechnet) persistiert. Konkrete Modellierung: Architektur-Skill.
- [ ] Bei Migration werden für alle existierenden Kapitel sinnvolle Defaults berechnet (`page_count` mindestens 1, `start_page` kumuliert nach `sort_order`).

## Edge Cases
- **Frisch erstelltes leeres Kapitel**: `page_count = 1` per Default — Folgekapitel haben sofort korrekten Offset; das leere Kapitel selbst zeigt eine A5-Seite mit der entsprechenden Buch-Seitenzahl.
- **Kapitel-Löschung in anderem Tab**: Aktuell offene Editor-Sessions zeigen weiterhin die alten Buch-Seitenzahlen; erst beim Neu-Öffnen aktuell.
- **Schneller Wechsel zwischen Kapiteln (Open-Close-Open)**: Jedes Öffnen liefert frische `start_page` aus der DB; kein veralteter Browser-Cache.
- **Pagination-Engine verschiebt Zeilen während des Tippens** (Witwen-/Waisen-Regel, Soft-Break): Buch-Seitenzahlen aktualisieren synchron — keine Drift zwischen Engine-Seitenzahl und Buch-Anzeige.
- **Sehr langes Buch (> 500 Seiten)**: Anzeige funktioniert ohne Bereichseinschränkung; UI bleibt stabil (3- bis 4-stellige Zahlen passen in den bestehenden Seitenrand-Slot).
- **Last-Writer-Wins zwischen zwei Sessions, die parallel dasselbe Kapitel speichern**: `page_count` wird vom letzten Writer überschrieben (konsistent zu PROJ-5); `start_page` der Folgekapitel wird beim nächsten Server-Roundtrip nachgezogen.
- **Migration / Backfill stale**: Vor Roll-out muss Backfill für **alle** bestehenden Kapitel erfolgt sein; sonst zeigen Editoren falsche oder leere Zahlen. Acceptance-Test prüft, dass keine Kapitelreihe ohne `start_page` ausgeliefert wird.
- **`page_count` aus alter Editor-Version kommt nie**: Falls ein Client den `page_count` nicht schreibt (z. B. veralteter Build), muss der Server konservativ schätzen oder auf den persistierten Default 1 zurückfallen — Buch-Offset bleibt monoton, nie negativ.

## Technical Requirements
- **Performance:** Buch-Seitenzahl-Update beim Tippen darf das bestehende Pagination-Engine-Frame-Budget nicht spürbar (< 50 ms Zusatzlatenz) belasten.
- **Server:** Recalc von `start_page` muss vor Antwort der Server-Action `loadChapter()` abgeschlossen sein — keine Eventual-Consistency aus User-Sicht.
- **Single Source of Truth:** Der Wert der Seitenzahl im A5-Frame ist `start_page + seite_index − 1`; derselbe Wert muss später im Print-/PDF-Export stehen (Vorbereitung für PROJ-16).
- **RLS:** Lese-/Schreibrechte auf neue Spalten folgen dem bestehenden `chapters`-RLS (Projektmitglied).

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
