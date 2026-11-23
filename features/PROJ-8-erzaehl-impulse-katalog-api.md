# PROJ-8: Erzähl-Impulse (Katalog + API)

> **Kurzfassung (PROJ-31).** Das vollständige Tech Design, Bau-Notizen, QA-Protokolle und der Deployment-Verlauf stehen unverändert im [Archiv](archive/PROJ-8-erzaehl-impulse-katalog-api.md).

## Status: Deployed
**Created:** 2026-05-21
**Last Updated:** 2026-11-23 — Erweiterung Impuls-Bibliothek geplant (Basis deployed to stage-app.narravit.de am 2026-05-21)

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
- [ ] `ErzaehlImpulsModal` lädt die Impulse zur Laufzeit aus `impulse_catalog` (server-seitig per Server-Component oder Server-Action), nicht mehr aus [src/lib/projektuebersicht-erzaehl-impulse.ts](../src/lib/projektuebersicht-erzaehl-impulse.ts).
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
- [ ] Auto-Rotation alle **15 Sekunden** (Jakob, 2026-11-22; vorher ~7 Sekunden, das war zum Lesen zu schnell) durch die Sequenz, zyklisch. Übergang als Cross-Fade (kurze sanfte Animation, nicht hart).
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

## Erweiterung 2026-11-23: Impuls-Bibliothek (geplant, noch nicht gebaut)

> Wunsch von Jakob nach der Recherche bei Storyworth. Der Abschnitt beschreibt das Ziel, Umsetzung erst nach `/refine PROJ-8`.

**Ziel:** Statt eines zufälligen Impulses im Dialog gibt es in der Kapitelübersicht eine Bibliothek mit vielen Erzähl-Impulsen als einzelne Karten, die sich gut filtern lassen.

**Stand heute:** 15 Impulse in 9 Kategorien (Beruf, Beziehungen, Bildung, Erfahrungen, Familie, Heimat, Kindheit, Lebensphasen, Werte). Für eine echte Bibliothek braucht es deutlich mehr Inhalte.

### Anforderungen

- [ ] Der Button „Erzähl-Impuls" in der Kapitelübersicht öffnet die Bibliothek.
- [ ] Jeder Impuls ist eine eckige Karte mit Titel, Kategorie und einer Beispielfrage.
- [ ] Ein Dropdown filtert nach Thema. Die Auswahl „Alle Themen" ist die Vorgabe.
- [ ] Ein zweiter Filter blendet Impulse aus, die schon im Buch sind.
- [ ] Impulse, die schon im Buch sind, bleiben erkennbar und lassen sich nicht doppelt hinzufügen.
- [ ] Ein Klick zeigt alle Leitfragen, ein Button legt daraus ein Kapitel an.
- [ ] Die Funktion „Zufälliger Impuls" bleibt als Einstieg für alle, die nicht suchen möchten.
- [ ] Große Schrift, hoher Kontrast und klare Bedienung für Menschen über 60, auf Tablet und Desktop, auf dem Handy einspaltig.
- [ ] Im Lesemodus (PROJ-28) kann man stöbern, aber nichts hinzufügen.
- [ ] Die Leitfragen bleiben in der Du-Form, alle anderen Texte in der Sie-Form.

### Illustrationen (Wunsch Jakob, 2026-11-23)

Die Karten sollen später leichte, handgemalt wirkende Illustrationen bekommen, zum Beispiel Haus, Drachen, Brille oder Briefumschlag. Sie müssen wirklich gut aussehen und werden nicht nebenbei erzeugt.

Vorgeschlagener Ablauf:

1. Einen festen Stil festlegen und an 3 bis 5 Motiven testen, bis Jakob ihn freigibt.
2. Zuerst ein Motiv pro Thema erstellen (9 Stück), erst danach eventuell eines pro Impuls.
3. Alle Bilder mit derselben Stilvorlage, freigestellt und in einheitlicher Größe erzeugen.
4. Nutzungsrechte des Bildwerkzeugs für kommerzielle Nutzung vorher prüfen.

Wegen Inhalten, Illustrationen und Oberfläche wird die Bibliothek vermutlich ein eigenes Projekt. Das wird beim `/refine` entschieden.

### Offen für `/refine`

1. Wie viele Impulse soll die Bibliothek zum Start haben, und wer schreibt sie? Vorschlag: etwa 100, von Claude entworfen und von Jakob freigegeben.
2. Reichen die 9 Kategorien, oder kommt ein zweiter Filter nach Lebensphase dazu?
3. Der automatische Versand aus PROJ-12 nutzt dieselbe Bibliothek als Quelle.

## Technische Entscheidungen
_Kurzform. Die vollständige Begründung steht im Archiv._

### C) Tech-Entscheidungen (begründet)

1. **Liste statt strukturiertes Objekt für `leading_questions`** — die Einträge sind reine Strings; eine native Postgres-Liste (Text-Array) ist der direkte Weg.

2. **Text-Spalte statt Enum für `category`** — der Katalog soll „nach und nach" wachsen, neue Kategorien inklusive.

3. **Server-side Read statt Client-Fetch** — die Projektübersicht-Seite ist bereits eine Server-Component.

4. **Banner ohne Animations-Bibliothek** — Tailwind-Transitions auf der Sichtbarkeit reichen für einen Cross-Fade vollständig aus.

5. **Banner-Schließen-Status nur im Browser-Speicher der Komponente** — explizite Entscheidung aus der Spec.

6. **Erkennung von `prefers-reduced-motion` via Standard-CSS-Media-Query** — Browser-API ist seit Jahren stabil.

7. **Kein Caching-Layer für den Katalog** — bei 15–200 erwarteten Einträgen lädt eine einfache Datenbank-Abfrage in Sub-Millisekunden.

8. **YAML-Mirror als Pflege-Quelle, SQL-Migration als Apply-Vehikel** — die Impuls-Daten leben in einer reviewbaren YAML-Datei (z.

9. **`source_impulse_id` mit `ON DELETE SET NULL` belassen** — diese FK-Regel ist in der Schema-Spec von PROJ-1 schon so umgesetzt (zur Erinnerung verifizieren).

10. **Rolle des Service-Roles für Seed-Migrationen** — Migrationen laufen über die Service-Rolle, die RLS umgeht.

## Offene Punkte
- Ideen für später: Admin-Oberfläche für den Katalog, Mehrsprachigkeit, Metadaten je Frage, Auswertung gewählter Impulse.
