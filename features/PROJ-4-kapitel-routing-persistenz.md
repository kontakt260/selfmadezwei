# PROJ-4: Kapitel-Routing & Persistenz

## Status: In Progress
**Created:** 2026-05-15
**Last Updated:** 2026-05-17

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

### A) Komponentenstruktur (Übersicht)

```
Home-Seite (/)                                      ← Server Component
+-- Hero-Bild
+-- Header "Willkommen zurück bei NARRAVIT"
+-- Sektion "Ihre Projekte"
|   +-- "Weiteren Projekt-Zugang kaufen"-Button     → /onboarding
|   +-- ProjectGrid
|       +-- ProjectCard × N                         ← Client Component (1:1 aus alter App)
|           +-- Titel, Letzte Bearbeitung, Kapitelanzahl
|           +-- "Öffnen"-Button                     → /projektuebersicht/[project_id]
|           +-- Löschen-Button (nur projektleiter)
|               +-- DeleteProjectModal (Portal, 2-stufig, 1:1 aus alter App)
|   +-- Leerzustand (wenn 0 Projekte): Hinweistext + Link zu /onboarding

Projektübersicht (/projektuebersicht/[project_id])  ← Server Component
+-- Header
|   +-- "Zurück zur Startseite"-Link
|   +-- Projekttitel (h1)
|   +-- Beschreibungszeile "Projekt bearbeiten und verwalten"
+-- SectionShell "Cover bearbeiten + Code"          ← visueller Platzhalter (PROJ-10/12)
+-- SectionShell "Kapitel"                          ← ChapterSectionClient
|   +-- SectionHeader + Aktions-Buttons
|       +-- "Reihenfolge speichern" (erscheint nur wenn Reihenfolge dirty ist)
|       +-- "Eigenes Kapitel"-Button
|       +-- "Erzähl-Impuls"-Button
|   +-- ChapterList (HTML5 Drag-and-Drop)
|       +-- ChapterRow × N
|           +-- DragHandle + Nummerierung
|           +-- Kapiteltitel (PT Serif), Quelle, Wortanzahl
|           +-- Umbenennen-Button (Bleistift-Icon) → RenameChapterModal
|           +-- Löschen-Button (Trash-Icon)        → DeleteChapterModal (3s Countdown)
|           +-- "Bearbeiten"-Link                  → /projektuebersicht/[id]/kapiteleditor/[chapter_id]
|   +-- Leerzustand (wenn 0 Kapitel)
|   +-- Modals (native Portale, 1:1 aus alter App):
|       +-- AddChapterModal        (Titel-Input, Enter-Bestätigung)
|       +-- ErzaehlImpulsModal     (Shuffle, Impuls-Box, Übernehmen)
|       +-- RenameChapterModal     (vorausgefülltes Input, Enter-Bestätigung)
|       +-- DeleteChapterModal     (3s Countdown, danach Button aktiv)
+-- StatCard-Raster (2 Spalten)                     ← Platzhalter ohne echte Werte
|   +-- "Telefonzeit übrig"                         ← Platzhalter (PROJ-12)
|   +-- "Projektzugang endet in"                    ← Platzhalter (PROJ-6)
+-- SectionShell "Projektmitglieder"                ← Platzhalter (PROJ-9)
```

**Navbar**: Bereits vollständig migriert und an Supabase Auth angebunden (`src/components/Navbar.tsx`).
Die aktive-Seite-Erkennung für `/projektuebersicht/[project_id]` funktioniert bereits korrekt mit der bestehenden `pathMatchesRoute`-Logik.

---

### B) Datenmodell (bestehende Tabellen aus PROJ-1)

**Was PROJ-4 liest:**

| Seite | Tabellen | Filter |
|-------|----------|--------|
| Home `/` | `project_members` JOIN `projects` | `user_id = auth.uid()`, sortiert nach `updated_at DESC` |
| Projektübersicht `/projektuebersicht/[project_id]` | `projects`, `project_members` (Rolle), `chapters` | `project_id = URL-Param`, `sort_order ASC` |

**Was PROJ-4 schreibt (Server Actions):**

| Aktion | Operation | Tabelle |
|--------|-----------|---------|
| Projekt löschen | DELETE (Cascade → chapters, members, cover) | `projects` |
| Kapitel hinzufügen | INSERT (title, project_id, sort_order, chapter_origin, body=null) | `chapters` |
| Kapitel umbenennen | UPDATE title WHERE id | `chapters` |
| Kapitel löschen | DELETE WHERE id | `chapters` |
| Reihenfolge speichern | UPDATE sort_order für jedes Kapitel | `chapters` |

**Wortanzahl**: Wird client-seitig aus dem `body`-JSONB (TipTap/ProseMirror-Format) berechnet —
kein DB-Write. Bei `body = null` ist die Wortanzahl 0.

---

### C) Tech-Entscheidungen (mit Begründung)

| Entscheidung | Begründung |
|-------------|------------|
| Server Components für initialen Load | Kein Lade-Spinner, keine Client-Fetches, schnelle First-Contentful-Paint |
| Server Actions statt API Routes | Type-safe, weniger Boilerplate, direkte `revalidatePath`-Integration |
| Client Components nur für interaktive Teile | `ProjectCard` und `ChapterSectionClient` brauchen lokalen UI-State (Modals, Drag) |
| HTML5 native Drag API | Spec schreibt es vor; keine externe Bibliothek nötig (`no-dnd-kit`) |
| Custom Portale für Modals | 1:1-Übernahme aus alter App — bewährte UX, kein shadcn Dialog |
| Optimistische UI-Updates | Kapitel-Aktionen aktualisieren sofort den lokalen State; Server Action läuft im Hintergrund; bei Fehler: Toast + State-Revert |
| `revalidatePath` nach Mutation | Server Component refetcht aktualisierte Daten; kein manuelles State-Syncing nötig |
| Keine redirect-Shims für alte URLs | Die alte `/projektuebersicht?project=...` URL war nie auf der neuen App live |

---

### D) Sicherheits-Architektur (kritisch)

**Prinzip: Zwei unabhängige Verteidigungslinien**

1. **RLS (Row Level Security)** — Supabase-Datenbankebene: verhindert, dass unauthorisierte Zugriffe überhaupt Daten zurückgeben oder schreiben können.
2. **Server Action Guards** — Anwendungsebene: explizite Authentifizierungs- und Rollenprüfung vor jeder Mutation.

**RLS-Anforderungen** (müssen in PROJ-1-Migration vorhanden sein — vor Implementierung prüfen):

| Tabelle | Operation | Policy |
|---------|-----------|--------|
| `projects` | SELECT | user in `project_members` für dieses Projekt |
| `projects` | DELETE | user hat `role = 'projektleiter'` in `project_members` |
| `chapters` | SELECT | user in `project_members` für `chapters.project_id` |
| `chapters` | INSERT | user in `project_members` für Ziel-`project_id` |
| `chapters` | UPDATE | user in `project_members` für `chapters.project_id` |
| `chapters` | DELETE | user in `project_members` für `chapters.project_id` |

**Pflicht-Muster für jede Server Action:**
1. `supabase.auth.getUser()` — schlägt fehl wenn keine gültige Session
2. Zod-Validierung aller Eingaben (UUID-Format, Textlänge, Array-Länge)
3. Datenbankoperation — RLS erzwingt Berechtigung automatisch
4. Ergebnis prüfen (0 betroffene Zeilen = Zugriff verweigert → Fehler zurückgeben)

**Spezifische Angriffsvektoren und Gegenmaßnahmen:**

| Angriff | Gegenmaßnahme |
|---------|--------------|
| `co_author` sendet Projekt-Lösch-Request | Server Action prüft Rolle explizit; RLS-Policy blockt DELETE für Nicht-Projektleiter |
| IDOR: Angreifer rät fremde `chapter_id` | RLS UPDATE/DELETE prüft Projektmitgliedschaft; 0 Zeilen betroffen |
| `addChapter` mit fremder `project_id` | RLS INSERT Policy prüft Mitgliedschaft; INSERT schlägt fehl |
| Massen-Update-Angriff via `saveChapterOrder` | Server Action validiert: ALLE übergebenen `chapter_id`s müssen zur übergebenen `project_id` gehören — bei Unstimmigkeit wird die gesamte Operation abgelehnt |
| Überlange Titel | Zod-Schema: max. 200 Zeichen auf Server-Seite erzwungen |
| Ungültige UUID-Formate | Zod `z.string().uuid()` vor jedem DB-Query |

**Masse-Update-Schutz (`saveChapterOrderAction`) im Detail:**
- Eingabe: `{ projectId: UUID, orderedIds: UUID[] }`
- Schritt 1: Abfrage aller Kapitel-IDs dieses Projekts aus der DB
- Schritt 2: Sicherheitsprüfung: `orderedIds.length === dbIds.length` und alle IDs stimmen überein
- Schritt 3: Nur wenn Prüfung besteht → Bulk-Update von `sort_order`
- Zweck: Verhindert, dass ein Angreifer Kapitel aus anderen Projekten in seine `sort_order`-Liste einschleust

---

### E) Dateistruktur (neue Dateien)

```
src/app/
  page.tsx                                         ← Ersetzt mit Home-Page (alter App-UI + Supabase)
  projektuebersicht/
    [project_id]/
      page.tsx                                     ← Server Component (validate + fetch)
      ProjektuebersichtClient.tsx                  ← Client Component wrapper
      actions.ts                                   ← Alle Server Actions für PROJ-4
      kapiteleditor/
        [chapter_id]/
          page.tsx                                 ← Platzhalter-Route (Inhalt: PROJ-5)

src/components/
  ProjectCard.tsx                                  ← Client Component (1:1 aus alter App, angepasst)
  projektuebersicht/
    ChapterSectionClient.tsx                       ← Aus ChapterDragList migriert
    ChapterListSection.tsx                         ← Thin wrapper (1:1 aus alter App)

src/lib/
  projektuebersicht-erzaehl-impulse.ts             ← 1:1 aus alter App (Mock-Titelliste)
  projektuebersicht-chapters.ts                    ← Nur Typ-Definitionen (kein Mock-State)
```

---

### F) Keine neuen Abhängigkeiten

Alle benötigten Packages sind bereits installiert:
- Zod (Input-Validierung)
- Supabase (DB + Auth)
- React (Drag API, useState, useTransition)
- next/navigation (redirect, notFound, revalidatePath)

## Backend Implementation Notes (2026-05-17)

### RLS Verification
All required RLS policies confirmed present on stage branch (`kdjhxqitfxnsavhiafdn`):

| Tabelle | Operation | Policy |
|---------|-----------|--------|
| `chapters` | SELECT | `project_id IN (get_my_project_ids())` ✓ |
| `chapters` | INSERT | `project_id IN (get_my_project_ids())` ✓ |
| `chapters` | UPDATE | `project_id IN (get_my_project_ids())` ✓ |
| `chapters` | DELETE | `project_id IN (get_my_project_ids())` ✓ |
| `projects` | SELECT | `id IN (get_my_project_ids())` ✓ |
| `projects` | INSERT | `auth.role() = 'authenticated'` ✓ |
| `projects` | UPDATE | `id IN (get_my_project_ids())` ✓ |
| `projects` | DELETE | user has `role = 'projektleiter'` in `project_members` ✓ |
| `project_members` | SELECT | `user_id = auth.uid()` ✓ |

No new migrations required — PROJ-1 already applied all necessary policies.

### Unit Tests
32 tests in `src/app/projektuebersicht/[project_id]/actions.test.ts` — all passing.

Coverage per action:
- `deleteProjectAction` — 6 tests (invalid UUID, unauthenticated, non-member, co_author, DB error, success)
- `addChapterAction` — 6 tests (empty title, >200 chars, bad UUID, unauthenticated, sort_order=0, sort_order=last+1)
- `addImpulseChapterAction` — 2 tests (chapter_origin + source_impulse_id, unauthenticated)
- `renameChapterAction` — 6 tests (empty title, >200 chars, bad UUID, unauthenticated, DB error, success)
- `deleteChapterAction` — 4 tests (bad chapterId, bad projectId, unauthenticated, success)
- `saveChapterOrderAction` — 8 tests (non-JSON, non-UUID items, bad projectId, unauthenticated, count mismatch, foreign ID, success)

## QA Test Results (2026-05-17)

### Automated Tests (Unit)
- **49/49 unit tests passing** (`npm test`)
  - 32 Server Action tests (`actions.test.ts`)
  - 17 utility tests: `reorderChapters` (7) + `countWordsFromBody` (10) (`projektuebersicht-chapters.test.ts`)

### E2E Tests
Written in `tests/PROJ-4-kapitel-routing-persistenz.spec.ts` (52 tests across Chromium + Mobile Safari).

**Results before bug fix:**
- ✅ Home-Seite (/) — AC-Home-1 bis AC-Home-4: **PASS** (4/4)
- ❌ Projektübersicht — AC-PÜ-1 bis AC-PÜ-6: **FAIL** (blocked by BUG-1)
- ❌ Kapitel CRUD — AC-Ch-1 bis AC-Ch-11: **FAIL** (blocked by BUG-1)
- ❌ Sicherheit — AC-Sec-1 bis AC-Sec-4: **FAIL** (AC-Sec-1/2 Test-Design-Issue; AC-Sec-3/4 blocked by BUG-1)
- ❌ Responsive & Navigation — AC-Nav-1: **FAIL** (blocked by BUG-1)

### Bugs Found

#### BUG-1 — HIGH: Projektübersicht-Seite: Runtime Error durch render prop über Server/Client-Grenze

**Schweregrad:** High  
**Datei:** `src/components/projektuebersicht/ChapterListSection.tsx`  
**Symptom:** Die Seite `/projektuebersicht/[project_id]` zeigt sofort den Next.js Dev Overlay mit einem Runtime Error. Kein Inhalt der Seite ist sichtbar oder interaktiv.

**Fehler:**
```
Functions cannot be passed directly to Client Components unless you explicitly 
expose it by marking it with "use server". Or maybe you meant to call this function 
rather than return it.
<... renderSectionHeader={function renderSectionHeader}>
```

**Ursache:** `ChapterListSection.tsx` übergibt `renderSectionHeader` (eine normale Funktion / Render Prop) als Prop an `ChapterSectionClient` ("use client"). In Next.js App Router dürfen über die Server/Client-Grenze nur serialisierbare Werte oder Server Actions übergeben werden. Eine einfache Funktion ist nicht serialisierbar.

**Schritte zur Reproduktion:**
1. Als angemeldeter Nutzer zu `/projektuebersicht/[project_id]` navigieren
2. Seite zeigt sofort Next.js Runtime Error Overlay

**Fix-Empfehlung:** Den `renderSectionHeader`-Render-Prop entfernen. Den SectionHeader-JSX (mit den Aktions-Buttons "Eigenes Kapitel", "Erzähl-Impuls", "Reihenfolge speichern") direkt INNERHALB von `ChapterSectionClient.tsx` rendern, da die Buttons ohnehin Client-Callbacks aufrufen (`openAddOwnChapterModal` etc.).

---

#### BUG-2 — Low: Security-Tests für unauthenticated Redirect (Test-Design)

**Schweregrad:** Low (kein echter Sicherheitsfehler)  
**Symptom:** Playwright-Tests `AC-Sec-1` und `AC-Sec-2` zeigen, dass unauthenticated User nicht zu `/anmelden` weitergeleitet werden.  
**Befund:** `curl` bestätigt, dass der Server korrekt `307 → /anmelden` zurückgibt. Die Diskrepanz ist auf eine Playwright-spezifische Verhaltensweise bei `browser.newContext()` zurückzuführen. Kein echter Sicherheitsbefund.

### Sicherheits-Audit

- ✅ Server Actions: alle 6 Aktionen haben Auth-Check, Zod-Validierung, explizite UUID-Prüfung
- ✅ `saveChapterOrderAction`: IDOR-Schutz gegen Mass-Update-Angriff (DB-seitiger ID-Abgleich)
- ✅ Projekt-Löschen: explizite `projektleiter`-Rollenprüfung in der Server Action
- ✅ Cross-Project-IDOR: `.eq("project_id", projectId)` Guard in renameChapter + deleteChapter
- ✅ RLS als zweite Verteidigungslinie: alle Policies korrekt gesetzt (verifiziert)
- ✅ Kein Secrets-Leak: Service Role Key nicht im Client-Bundle
- ⚠️ BUG-1 verhindert vollständigen Browser-Security-Test der Chapter-Funktionen

### Entscheidung
**NICHT PRODUCTION-READY**

**Grund:** BUG-1 (High) — die Kernseite `/projektuebersicht/[project_id]` ist durch einen Runtime Error komplett unzugänglich.

**Nächste Schritte:**
1. BUG-1 beheben: `renderSectionHeader`-Render-Prop aus `ChapterListSection.tsx` entfernen; SectionHeader in `ChapterSectionClient.tsx` integrieren
2. Danach `/qa PROJ-4` erneut ausführen

## Deployment
_To be added by /deploy_
