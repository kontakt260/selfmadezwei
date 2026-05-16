# PROJ-4: Kapitel-Routing & Persistenz

## Status: Planned
**Created:** 2026-05-15
**Last Updated:** 2026-05-15

## Dependencies
- Requires: PROJ-1 (Supabase-Datenmodell & RLS) — `projects`, `chapters`, `project_members`
- Requires: PROJ-2 (Auth + SSR) — Session, Middleware, Rollenprüfung
- Soft dependency: PROJ-8 (Erzähl-Impulse) — Impuls-Modal-UI wird in PROJ-4 mit Mock-Daten gebaut; echte Katalogtitel kommen mit PROJ-8

## User Stories
- Als Nutzer möchte ich nach dem Login alle meine Projekte auf der Startseite sehen, damit ich schnell in das richtige Projekt einsteigen kann.
- Als Projektleiter möchte ich ein Projekt dauerhaft löschen können, damit ich nicht mehr benötigte Bücher entfernen kann.
- Als Projektmitglied möchte ich auf der Projektübersicht alle Kapitel in ihrer Reihenfolge sehen und per Drag-and-Drop umsortieren, damit die Buchstruktur meiner Vorstellung entspricht.
- Als Projektmitglied möchte ich ein eigenes Kapitel mit einem selbst gewählten Titel anlegen und sofort in den Editor weitergeleitet werden, damit ich direkt mit dem Schreiben beginnen kann.
- Als Projektmitglied möchte ich einen Erzähl-Impuls als Kapitelvorschlag aus einem Shuffle-Dialog wählen, damit ich auch ohne eigene Idee einen guten Einstieg finde.
- Als Projektmitglied möchte ich einen Kapiteltitel umbenennen und Kapitel löschen können, damit die Buchstruktur gepflegt bleibt.

## Acceptance Criteria

### Seite: Home `/`
- [ ] Zeigt Hero-Bild, Begrüßungsüberschrift "Willkommen zurück bei NARRAVIT" und eine Grid-Liste aller Projekte, in denen der Nutzer Mitglied ist (via `project_members`)
- [ ] Projekte werden als `ProjectCard`-Komponenten gerendert: Titel, "zuletzt bearbeitet"-Timestamp, Kapitelanzahl, "Öffnen"-Button, Löschen-Button
- [ ] "Weiteren Projekt-Zugang kaufen"-Button → `/onboarding`
- [ ] Leerzustand (noch kein Projekt): Hinweistext + Link zu `/onboarding` (tritt in der Praxis selten auf, da PROJ-6 ein Projekt nach Zahlung anlegt)
- [ ] Projekte nach `updated_at` absteigend sortiert

### Projekt löschen (Home — nur `projektleiter`)
- [ ] Löschen-Button auf `ProjectCard` nur für Nutzer mit Rolle `projektleiter` sichtbar
- [ ] Klick öffnet 2-stufigen Dialog (1:1-Übernahme aus alter App):
  - Schritt 1: Warnung + "Weiter zur Bestätigung"-Button
  - Schritt 2: Zufälliger Code `NARRAVIT-XXXXXXXX` wird angezeigt; Nutzer muss ihn exakt abtippen; "Endgültig löschen"-Button disabled bis Code korrekt
- [ ] Nach Löschen: Projekt verschwindet aus der Liste; Toast-Feedback; Cascade löscht Kapitel, Cover, Mitglieder (gemäß PROJ-1 Schema)
- [ ] Serverseitige Prüfung: Nutzer ist `projektleiter` des Projekts (RLS + Server Action)

### Seite: Projektübersicht `/projektuebersicht/[project_id]`
- [ ] `project_id` wird serverseitig validiert: existiert das Projekt, und ist der Nutzer Mitglied? Sonst 404
- [ ] Seitenheader: Projekttitel, "Zurück zur Startseite"-Link
- [ ] Sektion "Cover bearbeiten" — Platzhalter (Inhalt kommt mit PROJ-10)
- [ ] Sektion "Code für das Telefonieren" — Platzhalter (Inhalt kommt mit PROJ-12)
- [ ] Sektion "Kapitel" — vollständig implementiert (s. u.)
- [ ] Stat-Karten "Telefonzeit übrig" und "NARRAVIT-Projektzugang endet in" — Platzhalter (Telefonzeit → PROJ-12; Ablaufdatum aus `portal_access_expires_at` kann in PROJ-4 bereits angezeigt werden)
- [ ] Sektion "Projektmitglieder" — Platzhalter (Inhalt kommt mit PROJ-9)

### Kapitel-Sektion: Anzeige
- [ ] Sortierte Liste aller Kapitel des Projekts (nach `sort_order` aufsteigend)
- [ ] Pro Kapitel: Drag-Handle, Nummerierung, Titel, Quelle ("Erzähl-Impuls" / "Eigenes Kapitel"), Wortanzahl (aus `body` JSONB berechnet oder 0 bei leerem Body), Umbenennen-Button (Bleistift), Löschen-Button (Trash), "Bearbeiten"-Link
- [ ] "Bearbeiten"-Link → `/projektuebersicht/[project_id]/kapiteleditor/[chapter_id]`
- [ ] Leerzustand: Hinweistext "Noch keine Kapitel vorhanden" + beide Aktions-Buttons ("Eigenes Kapitel" + "Erzähl-Impuls") prominent sichtbar
- [ ] Beide Rollen (`projektleiter` und `co_author`) sehen alle Aktionen

### Kapitel-Sektion: Reihenfolge
- [ ] Drag-and-Drop per HTML5 Drag API (1:1-Übernahme aus alter App); visuelles Feedback (Opacity, grüner Rahmen an Drop-Target)
- [ ] Reihenfolge ist "dirty" sobald sie von der gespeicherten Reihenfolge abweicht → "Reihenfolge speichern"-Button erscheint
- [ ] "Reihenfolge speichern" schreibt aktualisierte `sort_order`-Werte für alle Kapitel des Projekts in Supabase (Server Action)
- [ ] Nicht gespeicherte Reihenfolge beim Verlassen der Seite: kein automatisches Speichern; State geht verloren (kein Unsaved-Changes-Dialog in PROJ-4)

### Kapitel hinzufügen: Eigenes Kapitel
- [ ] Klick auf "Eigenes Kapitel" öffnet Modal mit Titel-Input (Pflichtfeld, max. 200 Zeichen)
- [ ] Enter-Taste bestätigt (wenn Titel nicht leer)
- [ ] "Hinzufügen"-Button disabled wenn Titel leer
- [ ] Nach Bestätigung: neues Kapitel wird in Supabase angelegt (`chapter_origin = 'custom'`, `sort_order` = letzter Platz, `body = null`)
- [ ] Direkter Redirect zu `/projektuebersicht/[project_id]/kapiteleditor/[chapter_id]`

### Kapitel hinzufügen: Erzähl-Impuls
- [ ] Klick auf "Erzähl-Impuls" öffnet Modal; öffnet mit einem zufällig gewählten Impuls-Titel aus der Titelliste
- [ ] "Anderen Vorschlag"-Button (Shuffle-Icon) wählt einen anderen zufälligen Titel (nicht denselben wie aktuell)
- [ ] Impuls-Titel wird in einem hervorgehobenen Box-Element angezeigt (`aria-live="polite"`)
- [ ] "Impuls übernehmen"-Button übernimmt den angezeigten Titel als Kapitelname
- [ ] In PROJ-4: Titelliste aus Mock-Daten (`projektuebersicht-erzaehl-impulse.ts`); echte Datenbankanbindung kommt mit PROJ-8
- [ ] Nach Bestätigung: Kapitel in Supabase angelegt (`chapter_origin = 'catalog_impulse'`, `source_impulse_id = null` bis PROJ-8, `sort_order` = letzter Platz); Modal schließt sich; Kapitel erscheint in der Liste — **kein Redirect zum Editor**

### Kapitel umbenennen
- [ ] Umbenennen-Button öffnet Modal mit vorausgefülltem Titel-Input (aktueller Titel); Input wird fokussiert + selektiert
- [ ] Enter-Taste speichert (wenn Titel nicht leer)
- [ ] "Speichern"-Button disabled wenn Titel leer
- [ ] Speichern schreibt neuen Titel in `chapters.title` via Server Action; Modal schließt sich

### Kapitel löschen
- [ ] Löschen-Button öffnet Dialog mit 3-Sekunden-Countdown (1:1-Übernahme aus alter App)
- [ ] Countdown läuft sichtbar ab; "Endgültig löschen"-Button ist disabled solange `countdown > 0`
- [ ] Nach Ablauf: Button aktiv; Klick löscht Kapitel in Supabase via Server Action; Dialog schließt sich; Kapitel verschwindet aus Liste
- [ ] `sort_order`-Werte der verbleibenden Kapitel werden nicht automatisch neu durchnummeriert

### Routing & URL-Struktur
- [ ] Home: `/`
- [ ] Projektübersicht: `/projektuebersicht/[project_id]`
- [ ] Kapitel-Editor: `/projektuebersicht/[project_id]/kapiteleditor/[chapter_id]`
- [ ] Alle Routen serverseitig geschützt (Middleware aus PROJ-2); `project_id` und `chapter_id` server-seitig gegen RLS validiert

## Edge Cases
- Nutzer ruft `/projektuebersicht/[project_id]` mit einer `project_id` auf, bei der er kein Mitglied ist → 404 (RLS gibt 0 Zeilen zurück; Seite rendert Not-Found)
- Kapitel wird gelöscht, während der Nutzer es im Editor geöffnet hat → nächster Save-Versuch im Editor schlägt mit "Kapitel nicht gefunden" fehl (PROJ-5 behandelt diesen Case; PROJ-4 definiert nur das Delete)
- Reihenfolge wird geändert und Browser-Tab geschlossen ohne Speichern → `sort_order` in DB bleibt unverändert; beim nächsten Öffnen ist die alte Reihenfolge wiederhergestellt
- Zwei Mitglieder sortieren gleichzeitig um und speichern → Last-Writer-Wins; kein Locking in PROJ-4 (PROJ-15 behandelt Concurrency)
- Erzähl-Impuls-Liste hat nur einen Eintrag → Shuffle-Button shuffelt weiterhin (zeigt denselben Titel, keine Endlosschleife dank Guard-Logik aus alter App)
- Nutzer mit Rolle `co_author` versucht Projekt zu löschen → Löschen-Button ist gar nicht sichtbar (kein serverseitiger Error nötig, da UI-Schutz ausreicht; Server Action prüft trotzdem)
- Projekt hat keine Kapitel → Leerzustand mit Hinweistext wird angezeigt; "Reihenfolge speichern"-Button erscheint nicht
- Neues Kapitel wird angelegt, aber Redirect zum Editor schlägt fehl → Kapitel ist bereits in DB persistiert; Nutzer kann es über die Kapitelliste öffnen

## Technical Requirements
- Sicherheit: `project_id` und `chapter_id` in allen Server Actions gegen RLS validiert — kein Vertrauen auf Client-State
- Sicherheit: Projekt-Löschen nur für `projektleiter` (serverseitige Rollenprüfung in Server Action)
- Performance: Kapitelliste wird serverseitig gerendert (Server Component); keine Client-Side-Fetches für den initialen Load
- Drag-and-Drop: HTML5 native Drag API (keine externe Bibliothek); Tablet-Touch-Events werden in PROJ-5 geprüft (kein Scope für PROJ-4)
- Mock-Daten: Erzähl-Impulse-Titelliste aus `lib/projektuebersicht-erzaehl-impulse.ts` in PROJ-4; Datenbankanbindung in PROJ-8

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
