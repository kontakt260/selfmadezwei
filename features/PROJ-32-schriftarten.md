# PROJ-32: Schriftarten im Kapitel-Editor

## Status: Approved
**Created:** 2026-11-24
**Last Updated:** 2026-11-25
**Freigegeben:** Spec und Tech Design von Jakob am 2026-11-24

## Dependencies
- Requires: PROJ-5 (Kapitel-Editor), PROJ-7 (buchweite Seitenzahl), PROJ-25 (Ruhe-Kriterien und Prüfstand), PROJ-28 (Lesemodus), PROJ-34 (Bilder im Text), PROJ-35 (Silbentrennung und Seitenregeln), PROJ-9 (Rollen)
- Vor: PROJ-16 (Druck, muss die gewählte Schrift einbetten), PROJ-21 (Seitenlayouts)

## Ausgangslage (gesichtet am 2026-11-24)
- Der Buchtext steht überall in **PT Serif**, 11 pt, Zeilenabstand 1,55 (je Absatz änderbar). Die Seitenzahl auf der Seite steht ebenfalls in PT Serif.
- Kapiteltitel stehen in **Merriweather** (22 pt, Untertitel 14 pt).
- Beide Schriften kommen von Google Fonts unter der freien OFL-Lizenz. Sie werden beim Bau der App eingebunden und vom eigenen Server ausgeliefert, nicht von Google.
- Eine Auswahl gibt es nicht. Seiten-Takt, Silbentrennung und Seitenregeln (PROJ-35) messen den Text in der geladenen Schrift. Eine andere Schrift ändert Zeilen, Trennungen und Seitenzahlen.

## Entscheidungen von Jakob (2026-11-24)
- **Eine Schrift je Buch:** Sie gilt für alle Kapitel und den Druck.
- **Auswahl:** 4 bis 5 klassische Buchschriften mit Serifen und eine klare serifenlose Schrift. Die endgültige Liste wird im Design mit einer Probeseite festgelegt. Vorgabe bleibt PT Serif.
- **Ort:** ein Auswahlfeld in der Werkzeugleiste des Kapitel-Editors.
- **Rechte:** Alle, die das Buch bearbeiten dürfen, können die Schrift ändern.
- **Titel folgen der Buchschrift.** Der Markenname NARRAVIT bleibt in Schriftzügen Merriweather.
- **Wechsel mit kurzer Rückfrage.** Im Auswahlfeld steht jede Schrift in sich selbst als Probe.
- **Seitenzahlen:** Nach einem Wechsel werden alle Kapitel automatisch neu berechnet, ohne dass jemand sie öffnet.

## User Stories
- Als Projektleitung möchte ich eine Schrift für unser Buch wählen, die zu unserer Familie passt, damit das gedruckte Buch persönlich wirkt.
- Als schreibende Person möchte ich die Schriften als Probe sehen, bevor ich wähle, damit ich weiß, wie mein Text aussehen wird.
- Als schreibende Person möchte ich vor einem Wechsel erfahren, dass er das ganze Buch betrifft, damit ich nicht aus Versehen das Buch aller anderen umstelle.
- Als Projektleitung möchte ich, dass die Seitenzahlen nach einem Wechsel von selbst wieder stimmen, ohne jedes Kapitel öffnen zu müssen.
- Als NARRAVIT möchte ich nur Schriften anbieten, die wir drucken dürfen und die alle deutschen Zeichen können, damit das Buch ohne Nacharbeit in den Druck geht.

## Acceptance Criteria

### A. Auswahl
- [ ] AC-1: Die Werkzeugleiste zeigt ein Auswahlfeld „Buchschrift" mit der aktuellen Schrift. Tooltip und Screenreader sagen in der Sie-Form, dass sie für das ganze Buch gilt.
- [ ] AC-2: Die Liste bietet 4 bis 5 Buchschriften mit Serifen und eine serifenlose Schrift. Jeder Name steht in seiner eigenen Schrift.
- [ ] AC-3: Neue und bestehende Bücher stehen in PT Serif, bis jemand die Schrift ändert. Bestehende Bücher sehen nach dem Einbau unverändert aus.
- [ ] AC-4: Jede angebotene Schrift darf in gedruckte Bücher eingebettet werden (OFL oder gleichwertig). Sie kann ä, ö, ü, ß, „ " ‚ ', – —, €, … und hat normal, fett, kursiv und fett-kursiv.

### B. Wechsel
- [ ] AC-5: Nach der Wahl fragt ein Dialog: „Schrift für das ganze Buch ändern? Alle Kapitel und die Seitenzahlen passen sich an." Mit „Abbrechen" ändert sich nichts.
- [ ] AC-6: Nach dem Bestätigen stehen Text, Kapiteltitel und Seitenzahl des offenen Kapitels sofort in der neuen Schrift. Danach springt nichts mehr nach (Ruhe-Kriterien aus PROJ-25).
- [ ] AC-7: Alle anderen Kapitel, der Lesemodus und die Druckansicht zeigen die neue Schrift beim nächsten Öffnen.
- [ ] AC-8: Kapiteltitel und Seitenzahlen folgen der Buchschrift. Der Schriftzug NARRAVIT bleibt Merriweather.
- [ ] AC-9: Die Wahl bleibt nach Neuladen und auf anderen Geräten erhalten. „Rückgängig" im Text nimmt einen Schriftwechsel nicht zurück, zurück geht es über das Auswahlfeld.

### C. Rechte
- [ ] AC-10: Projektleitung und Mitschreibende können die Schrift ändern. Im Lesemodus (PROJ-28) ist das Feld ausgegraut und nennt den Grund in der Sie-Form.
- [ ] AC-11: Der Server nimmt nur Schriften aus der Liste an, nur von Mitgliedern, die das Buch bearbeiten dürfen, und nicht im Lesemodus.

### D. Seiten und Satz
- [ ] AC-12: Jede Schrift bringt eine passende Größe und einen passenden Zeilenabstand mit, damit der Text in allen Schriften etwa gleich groß wirkt. Der Zeilenabstand je Absatz (1,0 bis 2,0) wirkt weiter relativ dazu.
- [ ] AC-13: Nach einem Wechsel werden die Seitenzahlen aller Kapitel und die buchweiten Seitenzahlen (PROJ-7) automatisch neu berechnet, ohne dass jemand die Kapitel öffnet. Bis das fertig ist, zeigt die Projektübersicht „Seitenzahlen werden aktualisiert". Im vollen Testbuch aus PROJ-30 (40 Kapitel, rund 300 Seiten) ist das nach höchstens 60 Sekunden abgeschlossen.
- [ ] AC-14: Silbentrennung und Seitenregeln (PROJ-35) gelten mit jeder Schrift: keine Seite endet mit einem Trennstrich, höchstens 3 getrennte Zeilen in Folge, neu geöffnet identisch.
- [ ] AC-15: Mit jeder Schrift bleibt der Text in den Rändern, Bildabschnitte und Seitenumbrüche verhalten sich wie bisher, lange Titel brechen um.

### E. Mehrere Personen und Fehler
- [ ] AC-16: Hat eine andere Person gerade ein Kapitel offen, sieht sie die neue Schrift spätestens beim nächsten Öffnen. Ihr Text geht nicht verloren (Last-Writer-Wins wie bisher).
- [ ] AC-17: Scheitert das Speichern eines Wechsels, erscheint eine Meldung in der Sie-Form, und die alte Schrift bleibt überall gültig.
- [ ] AC-18: Lädt eine Schrift nicht, zeigt der Editor den Text in PT Serif mit einem Hinweis und speichert keine Seitenzahlen, die mit der falschen Schrift berechnet wurden.

### F. Tempo und Druck
- [ ] AC-19: Ein Kapitel öffnet mit jeder Schrift höchstens 10 % langsamer als heute mit PT Serif. Ein Wechsel ist im offenen Kapitel nach höchstens 1 Sekunde zu sehen.
- [ ] AC-20: Andere Seiten (Startseite, Projektübersicht, Onboarding) laden die Buchschriften nicht. Ausnahme (2026-11-25): Zeigt eine Seite ein Cover in einer anderen Schrift als PT Serif, lädt sie genau diese Schrift.
- [ ] AC-21: Die Druckansicht nutzt dieselbe Schrift. Für den Druck (PROJ-16) liegen die Schriftdateien so vor, dass sie in das PDF eingebettet werden können.
- [ ] AC-22: Alle bestehenden Tests bestehen, neue Abläufe haben eigene Tests.

### G. Cover (Jakob, 2026-11-25)
- [ ] AC-23: Auf dem Cover stehen Titel, Untertitel, Autorzeile und Buchrücken in der Buchschrift, überall, wo es erscheint (Cover-Editor, Projektübersicht, Startseite). Bei der Vorgabe PT Serif bleibt das Cover wie heute (Titel und Rücken in Merriweather, Untertitel und Autorzeile in PT Serif).
- [ ] AC-24: Der Cover-Editor zeigt die Buchschrift an und sagt in der Sie-Form, dass sie für das ganze Buch gilt und im Kapitel-Editor geändert wird. Im Cover-Editor gibt es keine eigene Auswahl.
- [ ] AC-25: Nach einem Schriftwechsel zeigt das Cover die neue Schrift beim nächsten Öffnen der jeweiligen Seite.

## Edge Cases
- **Zwei Personen wechseln fast gleichzeitig:** Der zuletzt bestätigte Wechsel gilt, beide sehen ihn spätestens beim nächsten Öffnen.
- **Schnelles Hin- und Herwechseln:** Es gilt die zuletzt bestätigte Wahl. Die Seitenzahlen werden für diese neu berechnet, ältere Berechnungen verfallen.
- **Wechsel ohne Netz:** Fehlermeldung, die alte Schrift bleibt. Nichts ist halb umgestellt.
- **Breite Schrift mit langen Wörtern oder Titeln:** Kein Text ragt über den Rand, Titel brechen um, die Silbentrennung passt sich an.
- **Kapitel mit vielen Bildern:** Bildreihen werden mit der neuen Schrift neu gesetzt, kein Foto wird über zwei Seiten geteilt.
- **Lesemodus und abgelaufener Zugang:** Die gewählte Schrift wird angezeigt, ändern lässt sie sich nicht.
- **Phone:** Kein Editor, also auch kein Auswahlfeld (Hinweis wie bisher).
- **Projekt aus dem Papierkorb wiederhergestellt:** Es behält seine Schrift.

## Nicht in diesem Feature
- Schrift je Kapitel oder je Textstelle, frei wählbare Schriftgröße, eigene Schriften hochladen
- Eine eigene Schrift nur für das Cover (das Cover folgt immer der Buchschrift)
- Farben, Seitenvorlagen (PROJ-21), Druck-PDF selbst (PROJ-16)
- Phone-Editor, Live-Co-Editing, andere Buchformate als A5

## Technical Requirements
- **Lizenz:** Nur Schriften, die in gedruckte Bücher eingebettet und mit der App ausgeliefert werden dürfen. Lizenzhinweise kommen in die Liste vor dem Go-live (`prod-umzug.md`, Abschnitt 8).
- **Datenschutz:** Schriften werden vom eigenen Server ausgeliefert, nie von Google oder einem anderen Fremdserver.
- **Eine HTML-Quelle:** Bildschirm, Lesemodus und Druck nutzen dieselbe Schrift und dieselben Maße.
- **Browser:** Chrome, Safari und Firefox auf Desktop und Tablet.
- **Tempo:** AC-13, AC-19.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Was die Prüfung gezeigt hat (2026-11-24)
- **Seitenzahl heute:** Der Editor misst ein Kapitel beim Öffnen und speichert dessen Seitenzahl. Ein Datenbank-Trigger aus PROJ-7 rechnet daraus die Startseiten aller Kapitel neu. Ein Kapitel, das niemand öffnet, behält seine alte Seitenzahl.
- **Rechte:** Projektleitung und Mitschreibende dürfen Projektdaten schon heute ändern (Regel „projects: update as member"), im Lesemodus ist das gesperrt („update needs active access"). Mehr Rollen gibt es nicht. **Für die Buchschrift ist keine Änderung an RLS nötig.**
- **Schriften:** PT Serif, Merriweather und Lato werden beim Bau der App von Google Fonts geholt und vom eigenen Server ausgeliefert (DSGVO-konform). Ein Browser lädt eine Schriftdatei erst, wenn Text sie wirklich nutzt.
- **Bekannte Schriften (Jakob, 2026-11-24):** Die Auswahl soll aus bekannten Klassikern bestehen. Die Originale (Times New Roman, Palatino, Georgia, Arial, kommerzielle Garamond- und Baskerville-Schnitte) gehören Monotype, Adobe oder Microsoft. Sie mit der App auszuliefern und in die Druckdatei einzubetten, bräuchte je Schrift kostenpflichtige Web- und Einbettungslizenzen. Für alle gibt es freie Nachbauten, die gewerblich in Web und Druck genutzt werden dürfen und gleich oder fast gleich aussehen.
- **Kandidaten für die Auswahl (Anzeigename, dahinter der freie Nachbau):**

  | Anzeigename | Nachbau von | Freie Schrift | Lizenz |
  |---|---|---|---|
  | PT Serif (Vorgabe) | — | PT Serif | OFL |
  | Garamond | Garamond | EB Garamond | OFL |
  | Baskerville | Baskerville | Baskervville | OFL |
  | Pagella | Palatino | TeX Gyre Pagella | GUST Font License |
  | Termes | Times New Roman | TeX Gyre Termes (oder Tinos) | GUST bzw. Apache 2.0 |
  | Gelasio | Georgia | Gelasio | OFL |
  | Arimo (serifenlos) | Arial | Arimo | Apache 2.0 |

  Alle haben die deutschen Zeichen und vier Schnitte (normal, fett, kursiv, fett-kursiv). Das wird im ersten Bauschritt je Schrift geprüft. Libre Baskerville scheidet aus, weil ihr Fett-kursiv fehlt, Baskervville hat es. Jakob wählt an der Probeseite die endgültigen 5 bis 6 aus.
  **Endgültig nach der Probeseite (Jakob, 2026-11-24):** PT Serif, Garamond, Baskerville, Pagella, Heros (TeX Gyre Heros, Helvetica-Stil, GUST) und Atkinson (Atkinson Hyperlegible, OFL). Termes/Tinos, Gelasio, Arimo und Source Sans entfallen. Siehe Implementation Notes, Schritt 1.
- **Namen:** Die Namen sollen klingen wie die Originale (Jakob). Garamond und Baskerville sind historische Namen der Schriftschneider und werden so verwendet. Times, Palatino, Georgia und Arial sind eingetragene Marken. Dort stehen die eigenen Namen der Nachbauten, die bewusst ähnlich klingen (Termes, Pagella, Gelasio, Arimo). Ob Zusätze wie „im Stil von Palatino" erlaubt sind, klärt die Anwaltsprüfung vor dem Go-live (`prod-umzug.md`, Abschnitt 8).

### A) Struktur
```
Kapitel-Editor
+-- Werkzeugleiste
|   +-- Auswahlfeld „Buchschrift" (neu)
|       +-- Liste: jede Schrift als Probe in sich selbst
|       +-- Rückfrage „Schrift für das ganze Buch ändern?"
|       +-- im Lesemodus ausgegraut, mit Grund
+-- A5-Seiten (Text, Titel, Seitenzahl in der Buchschrift)
+-- Neusatz im Hintergrund (neu, unsichtbar)
    +-- setzt Kapitel mit veralteter Seitenzahl nacheinander in einer
        unsichtbaren A5-Seite mit demselben Seiten-Takt und speichert die Seitenzahl

Projektübersicht
+-- Hinweis „Seitenzahlen werden aktualisiert" (neu, solange Kapitel veraltet sind)
+-- Neusatz im Hintergrund (derselbe Baustein, macht weiter, wo er aufgehört hat)

Schriften-Baustein (neu)
+-- Liste der erlaubten Schriften mit Name, passender Größe und Zeilenabstand
+-- lädt die gewählte Schrift (alle 4 Schnitte), bevor Text gesetzt wird
+-- erkennt, wenn eine Schrift nicht lädt (Rückfall auf PT Serif mit Hinweis)
```

### B) Daten
- **Projekt:** bekommt die **Buchschrift** (Kennung aus der festen Liste, Vorgabe „PT Serif"). Die Datenbank nimmt nur Kennungen aus der Liste an.
- **Kapitel:** bekommt die Angabe, **mit welcher Schrift seine Seitenzahl berechnet wurde**. Bestehende Kapitel stehen auf „PT Serif", denn so wurden sie gemessen. Weicht die Angabe von der Buchschrift ab, gilt die Seitenzahl als veraltet.
- **Migration:** eine kleine Migration mit zwei neuen Spalten und der festen Liste als Prüfung. Jakob spielt sie im SQL-Editor ein, erst auf Stage, später auf Production vor dem Code. Keine neuen Tabellen, keine neuen RLS-Regeln.
- Die Startseiten (PROJ-7) rechnet weiter der vorhandene Trigger, sobald eine neue Seitenzahl gespeichert wird.

### C) Technische Entscheidungen
- **Buchschrift am Projekt:** Eine Einstellung für das ganze Buch gehört zum Projekt. So gilt sie sofort für alle Kapitel, den Lesemodus und später den Druck. Sie steht nicht im Text, deshalb nimmt „Rückgängig" sie nicht zurück (AC-9).
- **Speichern über den Server:** Der Wechsel läuft über eine Server-Aktion. Sie prüft Anmeldung, Mitgliedschaft, Zugang (nicht Lesemodus) und die feste Liste (AC-11). Zusätzlich sichert die Datenbank die Liste ab.
- **Schrift und Maße als Gestaltung:** Jede Schrift bringt Größe und Zeilenabstand mit, gesetzt an der A5-Seite. Text, Titel und Seitenzahl folgen ihr, der Zeilenabstand je Absatz wirkt relativ dazu (AC-8, AC-12). Bildschirm, Lesemodus und Druckansicht nutzen dieselbe Quelle.
- **Laden ohne Springen:** Der Editor blendet den Text erst ein, wenn Schrift und Trennwörterbuch geladen sind, wie heute schon beim Wörterbuch. Bei einem Wechsel lädt er die neue Schrift zuerst und setzt dann einmal neu (AC-6, AC-19). Die Buchschriften werden nur auf der Editor-Seite eingebunden (AC-20).
- **Neusatz im Browser statt auf einem Server:** Nach einem Wechsel sind alle Kapitel veraltet. Der Neusatz setzt sie nacheinander unsichtbar mit genau demselben Seiten-Takt (Silbentrennung und Seitenregeln aus PROJ-35 eingeschlossen) und speichert nur die Seitenzahl. Er startet sofort im Browser der Person, die gewechselt hat. Er läuft weiter, wenn irgendein Mitglied später Projektübersicht oder Editor öffnet. Das ergibt genau dieselben Zahlen wie beim Öffnen, ohne neue Server-Technik. Ein Server mit eigenem Browser kommt erst mit dem Druck (PROJ-16), dann kann der Neusatz dorthin wandern.
- **Keine falschen Seitenzahlen:** Eine Seitenzahl wird nur angenommen, wenn sie mit der aktuellen Buchschrift berechnet wurde. Wechselt jemand während des Neusatzes erneut, verfallen ältere Ergebnisse (Edge Case „schnelles Hin- und Herwechseln"). Lädt eine Schrift nicht, wird nichts gespeichert (AC-18). Hat jemand anderes das Kapitel noch mit der alten Schrift offen, nimmt der Server dessen Seitenzahl nicht an (AC-16).
- **Lizenzhinweise:** Die Schriften kommen in die Lizenzliste vor dem Go-live (`prod-umzug.md`, Abschnitt 8). Für den Druck (PROJ-16) liegen die Schriftdateien auf dem eigenen Server bereit.

### D) Abhängigkeiten
- Keine neuen Pakete für die Google-Schriften (EB Garamond, Baskervville, Gelasio, Arimo): Sie kommen über den vorhandenen Weg, eingebunden beim Bau und ausgeliefert vom eigenen Server. TeX Gyre Pagella und Termes gibt es nicht bei Google Fonts. Sie liegen als eigene Schriftdateien im Projekt, mit Lizenztext. Den Download der Dateien gibt Jakob im Bauschritt frei.
- Eine Migration (zwei Spalten), keine RLS-Änderung.

### E) Risiken
- **Neusatz braucht einen offenen Browser:** Schließt die Person den Tab sofort nach dem Wechsel und öffnet niemand die App, bleiben Seitenzahlen veraltet. Die Übersicht zeigt das, und der Druck (PROJ-16) muss vor dem Bestellen prüfen, dass alle Seitenzahlen zur Buchschrift passen. Geschätzt dauert der Neusatz für das Testbuch etwa 10 Sekunden (40 Kapitel, rund 150 ms je Kapitel nach den Messungen aus PROJ-30 und PROJ-35). Das wird im ersten Bauschritt gemessen, Ziel ist AC-13 mit höchstens 60 Sekunden.
- **Unsichtbar setzen muss exakt gleich sein:** Gleiche Breite, gleiche Gestaltung, Zoom 1, gleiche Bildabschnitte (die Bildplätze haben feste Seitenverhältnisse, die Fotos selbst müssen dafür nicht laden). Ein Test vergleicht für das Testbuch die Seitenzahl aus dem Neusatz mit der beim Öffnen.
- **Tab im Hintergrund:** Browser bremsen verdeckte Tabs. Der Neusatz pausiert dann und macht weiter, sobald der Tab wieder sichtbar ist.
- **iPad langsamer:** Gemessen wird am Desktop, das iPad wird von Hand geprüft.
- **Andere Schrift, andere Trennungen:** Silbentrennung und Seitenregeln hängen an der gemessenen Breite. Sie gelten mit jeder Schrift (AC-14). Der Prüfstand aus PROJ-35 läuft für jede Schrift.

### F) Reihenfolge
1. Schriften-Baustein mit Probeseite aller Kandidaten (Tabelle oben). Lizenzen und Zeichenumfang werden je Schrift geprüft. Jakob wählt die endgültigen 5 bis 6 Schriften, Größen und Zeilenabstände werden abgestimmt.
2. Migration (Jakob spielt sie ein), Server-Aktion für den Wechsel, Auswahlfeld mit Rückfrage, Lesemodus.
3. Neusatz im Hintergrund samt Hinweis in der Übersicht. Messen: Testbuch höchstens 60 Sekunden, Neusatz gleich Öffnen.
4. Fehlerfälle (Schrift lädt nicht, Wechsel scheitert, zweite Person mit alter Schrift), Tempo (AC-19, AC-20).
5. Tests für alle Kriterien, Doku und Lizenzliste.

## Implementation Notes (Frontend, Schritt 1, 2026-11-24)
- **Probeseite** (private Artifact-Seite für Jakob): Sieben Kandidaten, jeder auf einer maßstabsgetreuen A5-Seite in der Gestaltung des Editors, mit Rändern, Kapiteltitel, Blocksatz, kursiv, fett, Zitat und Seitenzahl. Die Größen sind über die gleiche x-Höhe angeglichen. Quelle: `scratchpad/pj32/Schriftprobe.html`, nicht im Repo.
- **Geprüft:** Alle sieben laden mit vier Schnitten (normal, fett, kursiv, fett-kursiv). Die sechs Google-Schriften haben den Zeichenblock bis U+00FF (Umlaute, ß) und das €-Zeichen, Pagella hat beides ebenfalls.
- **Pagella** mit Jakobs Freigabe von CTAN geladen (`fonts/tex-gyre/opentype`, vier OTF-Dateien, je rund 220 KB), Lizenz GUST Font License (LPPL 1.3c): Weitergabe und gewerbliche Nutzung erlaubt, für veränderte Fassungen wird ein neuer Name erbeten. Times-Stil: Tinos statt TeX Gyre Termes (Jakob), liegt bei Google Fonts.
- **Erste Auswahl (Jakob, 2026-11-24):** PT Serif, Garamond, Baskerville und Pagella bleiben. Tinos, Gelasio und Arimo fallen weg („Arial mag ich nicht"). Dazu kommen zwei serifenlose: ein Helvetica-Nachbau und eine weitere.
- **Helvetica-Nachbau:** TeX Gyre Heros, mit Jakobs Freigabe von CTAN geladen (vier OTF-Dateien, je rund 135 KB, GUST Font License). Anzeigename „Heros", Helvetica ist eine Marke von Linotype. Bei Google Fonts gibt es keinen echten Helvetica-Nachbau.
- **Zweite serifenlose, zur Wahl auf der Probeseite:** Source Sans 3 (Adobe, OFL, ruhig und klassisch) oder Atkinson Hyperlegible (Braille Institute, OFL, für gute Lesbarkeit entwickelt). Beide haben vier Schnitte und die deutschen Zeichen.
- **Probeseite Version 2** mit diesen sieben Schriften veröffentlicht.
- **Endgültige Auswahl (Jakob, 2026-11-24), in dieser Reihenfolge im Auswahlfeld:**

  | Anzeigename | Schrift | Art | Lizenz | Quelle |
  |---|---|---|---|---|
  | PT Serif (Vorgabe) | PT Serif | mit Serifen | OFL | Google Fonts |
  | Garamond | EB Garamond | mit Serifen | OFL | Google Fonts |
  | Baskerville | Baskervville | mit Serifen | OFL | Google Fonts |
  | Pagella | TeX Gyre Pagella | mit Serifen, wie Palatino | GUST | eigene Dateien (CTAN) |
  | Heros | TeX Gyre Heros | ohne Serifen, wie Helvetica | GUST | eigene Dateien (CTAN) |
  | Atkinson | Atkinson Hyperlegible | ohne Serifen, besonders lesbar | OFL | Google Fonts |

  Schritt 1 ist damit abgeschlossen.

## Implementation Notes (Frontend und Server, Schritt 2, 2026-11-24)
- **Migration** `supabase/migrations/20261124200000_proj32_book_font.sql` (ASCII, mit PGlite geprüft: zweimal lauffähig, fremde Werte abgelehnt): `projects.book_font` (Pflicht, Vorgabe `pt-serif`, feste Liste) und `chapters.page_count_font` (darf leer sein, leer heißt PT Serif). Leer statt Pflicht, weil der Papierkorb (PROJ-26) Kapitel aus älteren Abbildern ohne diese Angabe wiederherstellt. Keine RLS-Änderung. Auf Stage eingespielt am 2026-11-24.
- **Schriften:** `src/lib/book-fonts.ts` ist die einzige Liste (Kennung, Name, Hinweis, Größe, CSS-Variable). `src/components/kapiteleditor/bookFontFaces.ts` bindet die Schriften nur im Editor ein (AC-20): EB Garamond, Baskervville und Atkinson Hyperlegible über `next/font/google`, Pagella und Heros als eigene WOFF2-Dateien unter `src/fonts/book` (verlustfrei aus den CTAN-OTF-Dateien verpackt, Lizenztext liegt dabei).
- **Gestaltung:** `.a5-stack` liest `--book-font`, `--book-title-font` und `--book-scale` (Fließtext 11 pt, Seitenzahl 10 pt, Titel 18/22/14 pt, jeweils mal Größe). Der Zeilenabstand 1,55 und der je Absatz bleiben relativ zur Schriftgröße, wie auf der freigegebenen Probeseite.
- **Titel (AC-3, AC-8):** Bei PT Serif setzt der Editor keine Variablen, Titel bleiben Merriweather wie bisher. Bestehende Bücher sehen damit unverändert aus. Bei jeder anderen Schrift folgen Kapiteltitel und Seitenzahl der Buchschrift. Das Logo über dem Kapiteltitel ist ein Bild und bleibt unberührt.
- **Auswahlfeld** `BookFontSelect.tsx` vorne in der Werkzeugleiste: jede Schrift in sich selbst mit kurzem Hinweis, Tooltip und Screenreader-Text in der Sie-Form, im Lesemodus gesperrt mit Grund. Die Rückfrage stellt der Editor („Schrift für das ganze Buch ändern?“, „Abbrechen“ / „Schrift ändern“).
- **Wechsel:** Server-Aktion `setBookFontAction` (Liste, Anmeldung, Mitgliedschaft, Lesemodus) und das Laden aller vier Schnitte laufen zugleich. Umgestellt wird erst, wenn beides fertig ist. Danach setzt der Editor das Kapitel einmal neu. Scheitert das Speichern, bleibt alles bei der alten Schrift und es erscheint eine Meldung (AC-17).
- **Öffnen:** Der Text erscheint erst, wenn die Buchschrift mit allen Schnitten geladen ist. Lädt sie nicht innerhalb von 6 Sekunden, steht der Text in PT Serif mit einem Hinweis über der Seite (AC-18).
- **Seitenzahl je Schrift:** Der Seiten-Takt meldet mit jeder Seitenzahl die Schrift, mit der er gemessen hat. Gespeichert wird nur eine Zahl, die mit der Buchschrift gemessen wurde, zusammen mit `page_count_font`. Nach einem Wechsel wird die Zahl auch gespeichert, wenn sie gleich bleibt. Der Server prüft das zusätzlich gegen `projects.book_font`: Wer ein Kapitel noch mit der alten Schrift offen hat, speichert seinen Text, aber nicht seine Seitenzahl, und bekommt einmal den Hinweis, das Kapitel neu zu öffnen (AC-16).
- **Silbentrennung (AC-14):** Die gemerkten Ergebnisse der Seitenregeln aus PROJ-35 gelten je Schrift. Solange die Buchschrift lädt, wird gemessen, aber nichts gemerkt. Nach einem Wechsel werden die Abschaltungen verworfen und neu bestimmt.
- **Noch offen:** Schritt 3 (Neusatz der übrigen Kapitel und Hinweis in der Projektübersicht), Schritt 4 (Fehlerfälle und Tempo messen), Schritt 5 (E2E-Tests). Bis Schritt 3 stimmen die Seitenzahlen anderer Kapitel erst, wenn sie einmal geöffnet wurden.
- **Tests:** `src/lib/book-fonts.test.ts`, `loadBookFont.test.ts`, `actions.book-font.test.ts`, erweiterte Tests in `actions.word-count.test.ts` und `save-plan.test.ts`. Alle 1065 Unit-Tests bestehen.
- **Im Browser geprüft (2026-11-24, Production-Build gegen Stage, Chromium 1440 px und Tablet 768 px mit Touch):** `tests/PROJ-32-schriftarten.spec.ts` mit 10 Tests, alle grün (`E2E_EDITOR=1`). Geprüft: Vorgabe PT Serif unverändert (11 pt, Titel Merriweather), sechs Schriften je in sich selbst, Abbrechen ändert nichts, Wechsel nach rund 430 ms sichtbar (AC-19: höchstens 1 s), Titel und Seitenzahl in der neuen Schrift, nichts springt nach, Seitenzahl mit Schrift gespeichert, „Rückgängig" lässt die Schrift stehen, neu geöffnet identisch, anderes Kapitel öffnet in der neuen Schrift, Seitenregeln und Ränder mit allen sechs Schriften, Lesemodus gesperrt mit Grund, zweite Person mit alter Schrift (Text gespeichert, Seitenzahl nicht, Hinweis), Schrift lädt nicht (PT Serif mit Hinweis, keine Seitenzahl), Projektübersicht lädt keine Buchschrift.
- **Seiten je Schrift im langen Testkapitel:** PT Serif 6, Garamond 7, Baskerville 7, Pagella 7, Heros 6, Atkinson 6.
- **Fund beim Prüfen behoben:** Auf dem Tablet war „Baskerville“ im Auswahlfeld abgeschnitten (breite Schrift). Das Feld ist jetzt 160 px breit, ein Test prüft alle Namen.
- **Rückschritte:** Die Editor-Suites PROJ-5, PROJ-7, PROJ-25, PROJ-30 und PROJ-35 laufen gegen denselben Build grün (60 Tests). Das lange Kapitel aus PROJ-30 war nach 1052 ms sichtbar (einzelner Lauf, gemessen wird in Schritt 4).

## Implementation Notes (Schritt 3, Neusatz im Hintergrund, 2026-11-25)
- **Veraltet** ist ein Kapitel, dessen `page_count_font` nicht zur Buchschrift passt (leer zählt als PT Serif).
- **Server-Aktionen** in `src/app/projektuebersicht/[project_id]/page-count-actions.ts`: `pageCountQueueAction` nennt die veralteten Kapitel in Buchreihenfolge (im Lesemodus keine), `typesetChapterAction` liefert Titel, Text und Bildabschnitte so aufbereitet wie beim Öffnen im Editor, dazu den Stand (`updated_at`). Beide lesen nur, mit den Rechten der angemeldeten Person.
- **Speichern:** über `chapterPageCountAction` mit der neuen Bedingung `ifUnchangedSince`. Hat jemand das Kapitel seit dem Laden geändert, wird nichts gespeichert, und es kommt in der nächsten Runde wieder dran. Seitenzahlen einer älteren Schrift nimmt der Server weiter nicht an.
- **Neusatz** (`src/components/kapiteleditor/typeset/`): `TypesetFrame` setzt ein Kapitel unsichtbar mit genau den Bausteinen des Editors (gleiche Erweiterungen, Silbentrennung, Seitenregeln, Bildreihen, Seiten-Takt, Zoom 1) und meldet die Seitenzahl, sobald sie 150 ms gleich bleibt. `BackgroundTypesetter` holt die Liste, lädt Trennwörterbuch und Buchschrift (lädt sie nicht, wird nichts gespeichert), setzt ein Kapitel nach dem anderen, lässt zwischen zwei Kapiteln Luft für Eingaben und wartet in einem verdeckten Tab. Wechselt die Schrift währenddessen, holt er die Liste neu. Höchstens zwei Versuche je Kapitel und Durchgang.
- **Wo er läuft:** im Editor direkt nach einem Wechsel und beim Öffnen, wenn andere Kapitel veraltet sind (erst wenn das offene Kapitel fertig gesetzt ist), immer ohne das offene Kapitel, das sich selbst misst. In der Projektübersicht, solange Kapitel veraltet sind, mit dem Hinweis „Seitenzahlen werden aktualisiert (x von y Kapiteln) …“. Danach lädt die Übersicht ihre Zahlen neu. Die Übersicht lädt den Neusatz und die Buchschriften nur in diesem Fall nach (AC-20).
- **Lesemodus:** kein Neusatz und kein Hinweis, dort darf nichts gespeichert werden.
- **Geprüft (2026-11-25, Production-Build gegen Stage, Chromium):** `tests/PROJ-32-schriftarten.spec.ts` mit 15 Tests grün (zuletzt am Ende von Schritt 4, in Reihenfolge), dazu PROJ-5, PROJ-7, PROJ-10, PROJ-22, PROJ-24, PROJ-25, PROJ-34 und PROJ-35 ohne Rückschritt. Neusatz gleich Öffnen: Nach einem Wechsel im Editor waren 4 Kapitel nach 2,8 s neu gesetzt, jede Seitenzahl gleich der beim Öffnen, Startseiten richtig. Volles Testbuch (40 Kapitel) in Garamond: 440 Seiten nach 25,4 s neu gesetzt (AC-13: höchstens 60 s). Schnelles Hin- und Herwechseln während des Neusatzes: Am Ende passen alle Seitenzahlen zur zuletzt gewählten Schrift. Übersicht: Hinweis „Seitenzahlen werden aktualisiert“ erscheint und verschwindet, Seitensumme stimmt danach.
- **Zwei Testfehler, keine App-Fehler:** Der Hinweis bei alter Schrift (AC-16) und „Schrift lädt nicht“ (AC-18) scheiterten an Annahmen im Test, die der Neusatz aus früheren Tests überholt hatte. Die Tests warten jetzt, bis das Kapitel fertig gesetzt ist, und vergleichen mit dem Stand davor.

## Implementation Notes (Cover in der Buchschrift, 2026-11-25)
- **Wunsch von Jakob:** Die Buchschrift gilt auch für das Cover. Entscheidungen: Alle Texte (Titel, Untertitel, Autorzeile, Buchrücken) folgen ihr. Im Cover-Editor wird sie nur angezeigt, geändert wird sie im Kapitel-Editor.
- `CoverData` hat die Buchschrift als `bookFont`. Projektübersicht, Startseite und Cover-Editor laden dafür `projects.book_font` mit, ohne zusätzliche Abfrage.
- `src/components/cover/coverFonts.ts` liefert die Schriften fürs Cover. Bei PT Serif bleibt alles wie bisher (Titel und Rücken Merriweather, Untertitel und Autorzeile PT Serif). Bei jeder anderen Schrift stehen alle Texte in der Buchschrift, mit derselben Größenangleichung wie im Buch. `CoverRender` und `BookView` nutzen das, also Cover-Editor, Projektübersicht, Startseite und die Muster-Kärtchen.
- Der Cover-Editor zeigt unter „Schrift“ den Namen der Buchschrift in sich selbst und den Satz, dass sie für das ganze Buch gilt und im Kapitel-Editor über „Buchschrift“ geändert wird.
- AC-20 angepasst: Eine Seite lädt eine Buchschrift nur, wenn sie ein Cover in dieser Schrift zeigt. Die übrigen Schriftdateien lädt der Browser nicht, nur ihre kurzen Beschreibungen im CSS.
- Für Vitest ersetzt ein Platzhalter `next/font` (`src/test/next-font-stub.ts`, Alias in `vitest.config.ts`), weil die Schriftlader nur im Next-Build laufen.

## Implementation Notes (Schritt 4, Fehlerfälle und Tempo, 2026-11-25)
- **Tempo (AC-19):** Gemessen wie PROJ-30 AC-10, lokaler Production-Build gegen Stage. Alter Stand (`2db4f61`, Stand auf Stage) und neuer Stand liefen gleichzeitig nebeneinander (alter Stand in einer zweiten Arbeitskopie). Langes Kapitel (105 Absätze), Klick auf den Link in der Übersicht bis zum sichtbaren Text, Median aus 7 Öffnungen:

  | Stand | Median | Seiten |
  |---|---|---|
  | alt, vor und nach den Messungen | 964 / 903 ms | 17 |
  | neu, PT Serif | 923 ms | 17 |
  | neu, Garamond | 943 ms | 22 |
  | neu, Baskerville | 922 ms | 21 |
  | neu, Pagella | 935 ms | 20 |
  | neu, Heros | 934 ms | 17 |
  | neu, Atkinson | 932 ms | 17 |

  Erstes Öffnen mit leerem Browser-Cache (die Schrift wird erst geladen), Median aus 5: alt 1023 ms, PT Serif 999 ms, Atkinson 993 ms, Garamond 975 ms. Mit keiner Schrift langsamer als vorher, AC-19 erfüllt. Wechsel im offenen Kapitel nach rund 420 ms sichtbar (höchstens 1 s).
- **Fehlerfälle:** Wechsel scheitert ohne Netz (AC-17): Meldung „Die Schrift konnte nicht geändert werden. Bitte versuchen Sie es erneut.“, Text, Titel und Auswahlfeld bleiben bei der alten Schrift, in der Datenbank ändert sich nichts. Schrift lädt nicht (AC-18) und zweite Person mit alter Schrift (AC-16) siehe Schritt 2. Je ein eigener E2E-Test.
- **Noch offen:** Neusatz und Zoom auf dem iPad von Hand prüfen (erst nach einem Push auf Stage möglich), Firefox. Danach `/qa`.

## Nebenbei behoben: zwei Fehler in Safari (Jakob, 2026-11-25)
- **Zoom im Kapitel-Editor:** Bei jeder Zoom-Stufe außer 100 % sprangen Text und die Knöpfe der Bildabschnitte. Ursache: Safari liefert unter CSS-`zoom` unskalierte Maße, Größen wie Positionen (WebKit-Bug 77998), Chrome und Firefox skalierte. Seiten-Takt, Cursor und Bildknöpfe rechneten in Safari deshalb falsch. Ein erster Versuch, nur den Faktor im Seiten-Takt zu messen, reichte in Safari nicht (Jakob, 2026-11-25).
  - **Lösung:** Die Seiten werden jetzt per `transform: scale` gezoomt, darunter messen alle Browser gleich, und ProseMirror rechnet Skalierung selbst heraus. Der Text wird immer im Maßstab 1:1 gesetzt, Umbrüche sind bei jeder Stufe dieselben wie im Druck. Ein Rahmen (`.a5-zoom-frame`) hat die vergrößerte Breite und Höhe, damit Tisch und Scrollbereich mitwachsen (der Grund, warum früher auf `zoom` umgestellt worden war). Der Seiten-Takt misst den Faktor weiter selbst (`layoutZoom`). Beim Verschieben von Fotos wird die Bewegung durch die Zoom-Stufe geteilt, sonst liefen sie bei 200 % doppelt so schnell wie die Maus. Im Druck gilt kein Zoom.
  - In Chromium bleiben Seiten, Zeilen und Lage der Seitenzahlen bei allen Stufen gleich wie vorher.
- **Kästen in der Projektübersicht:** Die Zugangskarte war in Safari viel zu hoch und lag über „Wer an diesem Buch beteiligt ist“. Ursache vermutlich die verschachtelten Prozent-Höhen (`h-full`) in der Rasterzelle. Die Karte ist jetzt selbst die Zelle und wird vom Raster gestreckt, ohne Prozent-Höhen. In Chromium unverändert.
- Safari selbst lässt sich auf diesem Mac nicht automatisch testen (WebKit startet nicht). Jakob hat beides am 2026-11-25 in Safari am Mac geprüft (lokaler Production-Build gegen Stage): Kästen und Zoom passen.

## QA Test Results

**Tested:** 2026-11-25
**App URL:** http://localhost:3000 (lokaler Production-Build mit dem Stand von `4d03b7a`, Stage-Datenbank), Stage-Deployment `app-narravit-bthoxupgs` bereit
**Tester:** QA Engineer (AI)
**Browser:** Chromium auf Desktop (1440 px), Tablet (768 px, Touch) und Phone (375 px). Safari am Mac: Zoom und Projektübersicht von Jakob bestätigt (2026-11-25). Safari für das ganze Feature, iPad und Firefox prüft Jakob von Hand auf Stage, WebKit startet auf diesem Mac nicht automatisch.
**Automatisch:** `tests/PROJ-32-schriftarten.spec.ts` mit 22 Tests (15 aus dem Bau, 7 aus der QA und den Korrekturen), alle grün. Nach den Korrekturen `npm run test:full` mit 1076 Unit-Tests und allen Browser-Gruppen grün bis auf eine Zeitmessung unter Volllast (PROJ-34 AC-22 bis AC-25: Ruhe nach 180 statt höchstens 150 ms, nichts sprang zurück), einzeln fünfmal wiederholt grün. `npm run test:full` vor dem Push grün bis auf den bekannten Wackler in PROJ-3 („Wird gelöscht“ zweimal gefunden), einzeln wiederholt 23 von 23 grün. 1075 Unit-Tests grün.

### Acceptance Criteria Status

#### A. Auswahl
- [x] AC-1: Auswahlfeld „Buchschrift“ mit der aktuellen Schrift, Tooltip und Screenreader-Text in der Sie-Form („gilt für das ganze Buch“).
- [x] AC-2: Sechs Schriften, vier mit Serifen und zwei ohne (Spec erlaubte 4 bis 5 plus eine serifenlose, Jakob hat zwei serifenlose gewählt). Jeder Name steht in seiner eigenen Schrift, auch im Feld selbst, auf dem Tablet nicht abgeschnitten.
- [x] AC-3: Neue und bestehende Bücher in PT Serif, unverändert: 11 pt, Titel in Merriweather, keine Buchschrift-Variablen gesetzt.
- [x] AC-4: Alle sechs Schriften haben vier Schnitte und alle geforderten Zeichen (ä ö ü ß „ “ ‚ ‘ – — € …, geprüft an den ausgelieferten Dateien mit fontTools), Lizenzen OFL bzw. GUST. PT Serif hatte zunächst kein Kursiv (BUG-1, behoben).

#### B. Wechsel
- [x] AC-5: Rückfrage mit dem Wortlaut der Spec, „Abbrechen“ ändert nichts (auch nicht in der Datenbank).
- [x] AC-6: Text, Kapiteltitel und Seitenzahl sofort in der neuen Schrift, danach springt nichts nach (Zeilen nach 1,5 s identisch).
- [x] AC-7: Andere Kapitel, Lesemodus und Druckansicht zeigen die neue Schrift.
- [x] AC-8: Titel und Seitenzahl folgen, das Logo bleibt unverändert.
- [x] AC-9: Wahl bleibt nach Neuladen, „Rückgängig“ im Text nimmt sie nicht zurück.

#### C. Rechte
- [x] AC-10: Projektleitung und Mitschreibende dürfen wechseln, im Lesemodus ist das Feld gesperrt und nennt den Grund.
- [x] AC-11: Server nimmt nur Schriften aus der Liste an, nur von Mitgliedern, nicht im Lesemodus (siehe Security Audit).

#### D. Seiten und Satz
- [x] AC-12: Größe je Schrift über die x-Höhe angeglichen, Zeilenabstand je Absatz wirkt relativ. Langes Testkapitel: 6 bis 7 Seiten je nach Schrift.
- [x] AC-13: Neusatz aller Kapitel ohne Öffnen, Hinweis in der Übersicht. Volles Testbuch (40 Kapitel, 440 Seiten in Garamond) nach 25,4 s. Neusatz gleich Öffnen für Text, Trennungen, Seitenumbruch, Bildabschnitt, Zitat, Liste, Zeilenabstand 2,0.
- [x] AC-14: Mit allen sechs Schriften kein Trennstrich am Seitenende, höchstens 3 getrennte Zeilen in Folge, neu geöffnet identisch.
- [x] AC-15: Kein Text über den Rand, langer Titel bricht um, Bildabschnitte und Seitenumbrüche wie bisher.

#### E. Mehrere Personen und Fehler
- [x] AC-16: Zweite Person mit alter Schrift: Text gespeichert, Seitenzahl nicht, einmaliger Hinweis zum Neu-Öffnen.
- [x] AC-17: Wechsel ohne Netz: Meldung in der Sie-Form, alte Schrift bleibt überall.
- [x] AC-18: Schrift lädt nicht: Text in PT Serif mit Hinweis, keine Seitenzahl mit falscher Schrift gespeichert.

#### F. Tempo und Druck
- [x] AC-19: Öffnen mit jeder Schrift so schnell wie vorher (alt 903 bis 964 ms, neu 922 bis 943 ms, erstes Öffnen mit leerem Cache alt 1023 ms, neu 975 bis 999 ms). Wechsel nach rund 420 ms sichtbar.
- [x] AC-20 (angepasst): Eine Übersicht mit Buch in PT Serif lädt keine Buchschrift, mit Buch in Pagella nur Pagella.
- [x] AC-21: Druckansicht mit derselben Schrift und denselben Umbrüchen, ohne Zoom. Schriftdateien liegen auf dem eigenen Server (für PROJ-16).
- [x] AC-22: Alle bestehenden Tests bestehen (bis auf den bekannten Wackler), neue Abläufe haben eigene Tests.

#### G. Cover
- [x] AC-23: Titel, Untertitel, Autorzeile und Rücken in der Buchschrift in Übersicht, Startseite und Cover-Editor. Bei PT Serif wie bisher.
- [x] AC-24: Cover-Editor zeigt die Schrift und verweist auf den Kapitel-Editor, keine eigene Auswahl.
- [x] AC-25: Nach einem Wechsel zeigt das Cover die neue Schrift beim nächsten Öffnen.

### Edge Cases Status
- [x] Zwei Personen wechseln fast gleichzeitig: Der zuletzt gespeicherte Wechsel gilt (Last-Writer-Wins, durch Hin und Her abgedeckt).
- [x] Schnelles Hin- und Herwechseln während des Neusatzes: Am Ende passen alle Seitenzahlen zur zuletzt gewählten Schrift.
- [x] Wechsel ohne Netz: siehe AC-17.
- [x] Breite Schrift mit langen Wörtern oder Titeln: siehe AC-15.
- [x] Kapitel mit vielen Bildern: Bildabschnitt im Neusatz-Test, Seitenzahl gleich Öffnen.
- [x] Lesemodus und abgelaufener Zugang: Schrift angezeigt, nicht änderbar. Kein Neusatz im Lesemodus.
- [x] Phone: Hinweis, kein Editor und kein Auswahlfeld.
- [x] Projekt aus dem Papierkorb: behält seine Schrift. Kapitel aus dem Papierkorb: behält die Schrift seiner Seitenzahl.
- [x] Zusätzlich: Neues Kapitel in einem Buch mit anderer Schrift hat sofort die richtige Schrift-Angabe (nach BUG-2-Korrektur, ohne Hinweis).
- [x] Zusätzlich: Tippen während des Neusatzes im selben Editor: langsamste 5 % der Eingaben 56 ms statt 32 ms, höchstens 64 ms, kein spürbares Stocken.
- [x] Zusätzlich: Fotos ziehen bei 200 %: Der Griff bleibt genau unter der Maus (0 px), die neue Reihenfolge wird gespeichert.

### Security Audit Results
- [x] Authentifizierung: Ohne Anmeldung keine Aktion (Unit-Tests), ohne eigenes Buch leitet der Proxy schon vor den Aktionen zum Kauf um.
- [x] Autorisierung, nachgespielte echte Server-Aufrufe einer fremden, angemeldeten Person mit eigenem Buch: Schriftwechsel „Projekt nicht gefunden.“, Neusatz-Liste „Projekt nicht gefunden.“, Kapitelinhalt „Kapitel nicht gefunden.“ ohne Text in der Antwort, Seitenzahl „Speichern fehlgeschlagen.“. Die Buchschrift blieb unverändert.
- [x] Manipulierte eigene Aufrufe: unbekannte Schrift abgelehnt („Diese Schrift gibt es nicht.“), Projekt im Lesemodus abgelehnt („abgelaufen“), Seitenzahl mit gefälschtem `ifUnchangedSince` nicht gespeichert.
- [x] Direkt über REST: Fremde ändern `book_font` nicht (0 Zeilen), unbekannte Werte für `book_font` und `page_count_font` lehnt die Datenbank ab (400), im Lesemodus keine Änderung.
- [x] Eingaben: keine freien Texte, nur feste Kennungen (Zod und Datenbank-Prüfung). Keine Geheimnisse im Browser.
- [x] Rate Limit: Häufiges Wechseln trifft nur das eigene Buch (Neusatz im eigenen Browser), kein Missbrauch über fremde Bücher möglich.

### Bugs Found

#### BUG-1: PT Serif (Vorgabe) hat kein echtes Kursiv
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Kapitel in einem Buch mit PT Serif öffnen, Text kursiv setzen.
  2. Expected: echte kursive Buchstaben von PT Serif (AC-4: jede angebotene Schrift hat normal, fett, kursiv und fett-kursiv).
  3. Actual: Das Root-Layout lädt PT Serif nur in 400 und 700 ohne Kursiv (`src/app/layout.tsx`). Der Browser stellt normales PT Serif schräg. Das wirkt im Buch und später im Druck weniger hochwertig.
- **Hinweis:** Älter als PROJ-32 (seit PROJ-5). Eine Korrektur macht kursiven Text in bestehenden Büchern etwas schmaler, Zeilen und Seitenzahlen von Kapiteln mit viel Kursiv können sich verschieben. Ihre Seitenzahlen würden erst beim nächsten Öffnen neu gemessen, weil sich die Schrift-Kennung nicht ändert.
- **Priority:** Vor dem Go-live beheben (Druckqualität), Entscheidung Jakob.
- **Behoben (2026-11-25, Jakob: „Beide beheben“):** `src/app/layout.tsx` lädt PT Serif jetzt auch kursiv (`style: ["normal", "italic"]`). Test „BUG-1, AC-4“ prüft, dass in einem Buch in PT Serif echte kursive Schnitte in 400 und 700 geladen sind. Kursiver Text in bestehenden PT-Serif-Büchern sieht dadurch anders aus und läuft etwas schmaler. Es gibt noch keine Kundenbücher, Seitenzahlen von Testbüchern auf Stage stimmen nach dem nächsten Öffnen wieder.

#### BUG-2: Kurzer Hinweis „Seitenzahlen werden aktualisiert“ nach jedem neuen Kapitel
- **Severity:** Low
- **Steps to Reproduce:**
  1. Buch mit einer anderen Schrift als PT Serif, Projektübersicht öffnen.
  2. „Eigenes Kapitel“ oder einen Erzähl-Impuls anlegen.
  3. Expected: Kein Hinweis, ein neues leeres Kapitel hat in jeder Schrift eine Seite.
  4. Actual: Das neue Kapitel hat noch keine Schrift-Angabe und gilt als veraltet. Die Übersicht zeigt kurz „Seitenzahlen werden aktualisiert (0 von 1 Kapiteln) …“ und setzt es neu. Das Ergebnis stimmt, der Hinweis verwundert aber.
- **Priority:** Nice to have. Möglich: neue Kapitel gleich mit der Buchschrift anlegen.
- **Behoben (2026-11-25):** `addChapterAction` und `addImpulseChapterAction` legen neue Kapitel gleich mit der Buchschrift als Schrift der Seitenzahl an (gelesen parallel zur ohnehin nötigen Abfrage). Lässt sich die Buchschrift nicht lesen, bleibt die Angabe leer und der Neusatz misst nach. Unit-Tests für beide Aktionen, E2E-Test „BUG-2“ über die Oberfläche: Kapitel angelegt, Schrift sofort gesetzt, kein Hinweis in der Übersicht.

### Summary
- **Acceptance Criteria:** 25/25 passed (nach Behebung von BUG-1)
- **Bugs Found:** 2 total (0 critical, 0 high, 1 medium, 1 low), beide behoben
- **Security:** Pass
- **Production Ready:** YES. Von Hand offen: Safari für das ganze Feature (Zoom und Übersicht bestätigt), iPad und Firefox auf Stage.
- **Recommendation:** Approved.

## Deployment
_To be added by /deploy_
