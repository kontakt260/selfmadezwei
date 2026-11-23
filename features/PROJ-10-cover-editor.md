# PROJ-10: Cover-Editor

> **Kurzfassung (PROJ-31).** Das vollständige Tech Design, Bau-Notizen, QA-Protokolle und der Deployment-Verlauf stehen unverändert im [Archiv](archive/PROJ-10-cover-editor.md).

## Status: Deployed
**Created:** 2026-05-21
**Last Updated:** 2026-05-22
**Deployed:** 2026-05-22 (stage-app.narravit.de)

## Dependencies
- Requires **PROJ-1** (Supabase-Datenmodell & RLS) — `project_covers`-Tabelle existiert (1:1 zu projects, mit `image_url`, `theme`, `metadata`-JSONB)
- Requires **PROJ-2** (Auth + SSR) — Session-Auth für Schreibzugriff
- Requires **PROJ-4** (Kapitel-Routing & Persistenz) — Einstieg zum Cover-Editor liegt in der Projektübersicht
- Soft dependency: **PROJ-3** (Persönlicher Bereich + Konto) — Project-Cards auf der Startseite `src/app/(start)/page.tsx` zeigen das Cover-Preview

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
    - die Mini-Vorschau in der jeweiligen `ProjectCard` auf der Startseite `src/app/(start)/page.tsx`.
- [ ] Die Komponente skaliert verlustfrei zwischen Edit-Vorschau-Größe und Card-Thumbnail-Größe (Titel-Größe, Foto-Größe und Muster-Skalierung passen sich proportional an).
- [ ] **Default-Zustand (kein Cover bearbeitet, d. h. keine `project_covers`-Reihe oder Default-Werte überall):** an allen drei Stellen wird ein generisches Default-Cover gerendert (Default-Muster, Default-Farbe, Titel aus `projects.title`, leere Untertitel/Autor/Foto). Kein "Cover noch nicht bearbeitet"-Text — das Default-Cover ist die natürliche Anzeige.
- [ ] Auf der Startseite ersetzt die Cover-Vorschau das bisherige statische Buch-Icon der `ProjectCard`.

### Server-Lader-Erweiterungen
- [ ] `src/app/(start)/page.tsx` (Startseite/persönlicher Bereich) lädt zu jedem Projekt zusätzlich die `project_covers`-Reihe (falls vorhanden) und reicht sie an `ProjectCard` durch.
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

## Technische Entscheidungen
_Kurzform. Die vollständige Begründung steht im Archiv._

### C) Tech-Entscheidungen (begründet)

1. **Eine Cover-Render-Komponente für drei Kontexte** — die Spec verlangt Single Source of Truth.

2. **HTML/CSS-Render statt SVG-Render** — für den MVP wird die Cover-Komponente als reguläre React/Tailwind-HTML-Komponente gebaut.

3. **Theme + Farbe als Code-Konstanten** — die Kataloge werden vom narravit-Team kuratiert, nicht vom User.

4. **Privater Storage-Bucket mit signed URLs** — Cover-Fotos können sehr private Inhalte sein (Familienportraits, alte Schwarz-Weiß-Bilder).

5. **Foto-Upload direkt zum Storage, nicht durch Server** — der Upload läuft client-direkt zu Supabase Storage (mit Auth-Token).

6. **Auto-Save als debounced Server-Action (~2 Sek)** — identisch zum Kapitel-Editor-Pattern aus PROJ-5.

7. **Default-Cover ohne DB-Reihe** — wenn ein Projekt nie im Cover-Editor war, existiert keine `project_covers`-Reihe.

8. **Batch-Read für Startseite** — die existierende `app/page.tsx` lädt Projekte + Mitgliedschaften.

9. **Cover-Titel und Projekt-Titel sind dieselbe Quelle** — wenn der User im Cover-Editor den Titel ändert, wird `projects.title` aktualisiert (nicht eine separate Cover-Titel-Spalte).

10. **Phone-Editor erlaubt** — im Gegensatz zum A5-Kapitel-Editor (Phone-Sperre laut PROJ-5) ist der Cover-Editor klein und in vertikalem Stack auf Phones gut bedienbar.

### K) Geplant für PROJ-20: Buchrücken (Jakob, 2026-11-23)

Wunsch nach der Recherche bei Storyworth: Der Cover-Editor zeigt das Buch künftig **mit Buchrücken** und füllt ihn automatisch.

- [ ] Die Vorschau zeigt Vorderseite und Buchrücken zusammen, damit das Cover wie ein echtes Buch wirkt.
- [ ] Titel und Autorenzeile erscheinen automatisch auf dem Buchrücken, in Farbe und Stil des Covers.
- [ ] Die Rückenbreite richtet sich nach der Seitenzahl des Buchs (PROJ-7).
- [ ] Ist der Rücken für den Text zu schmal, wird der Text sinnvoll gekürzt oder ausgeblendet.
- [ ] Die Daten fließen später in das Druck-PDF für den Umschlag (PROJ-16).

**Abhängigkeit:** Die genaue Rückenbreite pro Seitenzahl und der Beschnitt kommen von der Druckerei (voraussichtlich CPI). Bis dahin kann die Vorschau mit einem Näherungswert arbeiten, das Druck-PDF nicht. Umsetzung in PROJ-20.

## Offene Punkte
- BUG-4 (Low): Kein Redirect, wenn das Projekt gelöscht oder die Mitgliedschaft entzogen wird, während der Editor offen ist.
- Alte Cover-Fotos können sich beim Ersetzen im Bucket sammeln. Ein Aufräum-Job für verwaiste Fotos ist offen.
- Ideen für später: Rückseite, Klappentext, Admin-Oberfläche für Themes, Versionshistorie, mehrere Fotos. Der Druck-Export kommt mit PROJ-16.
