# PROJ-30: Ladezeiten verbessern

## Status: In Review
**Created:** 2026-11-23
**Last Updated:** 2026-11-23
**Freigegeben:** Spec und Tech Design samt Migration von Jakob am 2026-11-23

## Dependencies
- Requires: PROJ-3 (Persönlicher Bereich), PROJ-4 (Kapitel-Routing), PROJ-5 (Kapitel-Editor), PROJ-10 (Cover-Editor), PROJ-22 (Design-Grundlage), PROJ-28 (Lesemodus). Deren Verhalten bleibt gleich, nur das Laden ändert sich.
- Vor PROJ-31 (Code aufräumen), weil dieser Umbau die Ladewege neu sortiert.

## Ausgangslage (gemessen am 2026-11-23)

Gemessen mit einem lokalen Production-Build gegen die Stage-Datenbank, QA-Konto, kleines Projekt mit 2 Kapiteln, Median aus 7 Durchgängen. Die Vercel-Funktionen liegen seit `3b1b2c2` in Frankfurt, direkt neben der Datenbank. Auf Stage selbst konnte nicht automatisch gemessen werden, weil es hinter der Vercel-Deployment-Protection liegt.

| Weg | Klick bis Inhalt | Aufrufe im Seitenaufbau | Davon nacheinander |
|---|---|---|---|
| Startseite zum Buchprojekt | 499 ms (411 bis 1305) | 10 | 7 |
| Buchprojekt zum Kapitel | 284 ms (270 bis 397) | 4 | 3 |

Dazu kommen pro Klick zwei weitere Aufrufe in der Zugangsprüfung vor der Seite.

- **Keine Ladeansicht:** Die App hat keine einzige. Nach einem Klick passiert nichts Sichtbares, bis der Server komplett fertig ist. Gerade ältere Nutzer halten das für einen Fehler und klicken erneut.
- **Abfragen nacheinander:** Die Projektübersicht wartet auf jede Abfrage einzeln, obwohl die meisten nicht voneinander abhängen.
- **Kapiteltexte nur zum Zählen:** Die Übersicht lädt alle Kapiteltexte vollständig, um die Wörter zu zählen. Im kleinen Testprojekt fällt das nicht auf, bei einem vollen Buch wächst die Datenmenge mit jeder Seite.
- **Keine Fehleransicht:** Scheitert das Laden, gibt es keine eigene, verständliche Seite.
- **Datenverlust durch die Zurück-Taste (Critical, gefunden und reproduziert im Tech Design):** Wer im Editor schreibt, zur Übersicht geht und dann die Zurück-Taste des Browsers nutzt, sieht den alten Text. Das nächste automatische Speichern überschreibt damit den neueren Text. Betroffen ist Stage. Production steht noch auf einem Stand ohne diesen Editor.

## User Stories
- Als älterer Schreibender möchte ich nach einem Klick sofort sehen, dass etwas passiert, damit ich nicht denke, die Seite sei kaputt, und nicht mehrfach klicke.
- Als Schreibender möchte ich mein Buchprojekt auch mit einem vollen Buch in rund einer Sekunde öffnen, damit ich ohne Unterbrechung weiterarbeiten kann.
- Als Schreibender möchte ich nach dem Speichern und Zurückgehen immer den aktuellen Stand sehen, damit es nie so wirkt, als wäre mein Text verloren.
- Als Projektleiter möchte ich Kapitel und Änderungen anderer Beteiligter beim nächsten Öffnen sehen, damit wir nicht mit einem alten Stand arbeiten.
- Als Nutzer mit schlechter Verbindung möchte ich eine verständliche Meldung und einen Weg zum erneuten Versuch, wenn eine Seite nicht lädt.

## Acceptance Criteria

Gilt für alle Seiten nach der Anmeldung: Startseite, Buchprojekt, Kapitel-Editor, Cover-Editor und Persönlicher Bereich.

### A. Sofortige Reaktion
- [x] AC-1: Nach dem Klick auf einen Link zu einer dieser Seiten ist innerhalb von 0,2 Sekunden die Ladeansicht oder bereits der Inhalt zu sehen.
- [x] AC-2: Die Ladeansicht hat die Form der Zielseite: Die Navigation bleibt stehen, darunter liegen ruhige, eckige Flächen in Papierfarbe.
- [x] AC-3: Die Ladeansicht zeigt gut lesbar „Wird geladen …“ (mindestens 16 px, Kontrast mindestens 4,5:1).
- [x] AC-4: Die Ladeansicht hat keine Animation, kein Blinken und keinen Schimmer-Effekt.
- [x] AC-5: Antwortet der Server sehr schnell, blitzt die Ladeansicht nicht kurz auf.
- [x] AC-6: Beim Wechsel von der Ladeansicht zum Inhalt springt die Seite nicht sichtbar (Cumulative Layout Shift höchstens 0,1).
- [x] AC-7: Screenreader bekommen den Ladezustand angesagt.
- [x] AC-8: Die Ladeansicht funktioniert bei 320, 375, 768 und 1440 px Breite und bei 200 % Zoom ohne seitliches Scrollen.

### B. Ladezeit
Maßstab: Median aus 7 Durchgängen im lokalen Production-Build gegen die Stage-Datenbank, dazu Jakobs Prüfung auf Stage. „Volles Buch" bedeutet 40 Kapitel und 300 Seiten.

- [x] AC-9: Ein Buchprojekt mit vollem Buch zeigt seinen Inhalt nach höchstens 1 Sekunde.
- [x] AC-10: Ein Kapitel mit rund 30 Seiten ist nach höchstens 1 Sekunde bearbeitbar.
- [x] AC-11: Startseite, Cover-Editor und Persönlicher Bereich zeigen ihren Inhalt nach höchstens 1 Sekunde.
- [ ] AC-12: Nach längerer Pause, wenn der Server erst aufwachen muss, steht der Inhalt nach höchstens 2,5 Sekunden.
- [x] AC-13: Die Übersicht lädt keine vollständigen Kapiteltexte mehr. Die übertragene Datenmenge wächst nicht mit der Länge der Texte.
- [x] AC-14: Wortzahlen, Seitenzahlen und die Anzahl offener Kapitel sind genauso korrekt wie heute.

### C. Immer aktueller Stand
- [x] AC-15: Nach dem Schreiben im Editor und dem Zurückgehen zeigt die Übersicht sofort die neue Wort- und Seitenzahl.
- [x] AC-16: Auch die Zurück-Taste des Browsers zeigt den aktuellen Stand, keinen zwischengespeicherten.
- [x] AC-17: Ein Kapitel, das eine andere Person angelegt oder geändert hat, ist beim nächsten Öffnen der Seite sichtbar.
- [x] AC-18: Geänderter Titel, Cover, Mitglieder und Ablaufdatum erscheinen beim nächsten Öffnen aktuell.
- [x] AC-26: Nach der Zurück- oder Vorwärts-Taste zeigt der Editor den zuletzt gespeicherten Text und ist erst danach bearbeitbar. Das nächste Speichern überschreibt nie einen neueren Text.

### D. Sicherheit und bestehendes Verhalten
- [x] AC-19: Die Ladeansicht zeigt keine Projektdaten. Wer kein Mitglied ist, sieht weiterhin „nicht gefunden" und erfährt nicht, ob es das Projekt gibt.
- [x] AC-20: Anmeldung, Zugangsprüfung und Datenbank-Regeln (RLS) bleiben unverändert.
- [x] AC-21: Lesemodus, Papierkorb, Weiterleitung ohne Projekt und der Phone-Hinweis statt Editor funktionieren wie bisher.
- [x] AC-22: Wer den Editor direkt nach dem Tippen verlässt, verliert keinen Text.

### E. Fehlerfall
- [x] AC-23: Scheitert das Laden, erscheint statt einer endlosen Ladeansicht: „Die Seite konnte gerade nicht geladen werden. Bitte versuchen Sie es erneut."
- [x] AC-24: Die Fehleransicht hat einen Button „Erneut versuchen" und einen Link zur Startseite.
- [x] AC-25: Die Fehleransicht zeigt keine technischen Details.

## Edge Cases
- **Doppelklick auf eine Karte:** Es wird nur einmal navigiert, ohne Fehler und ohne zweiten Seitenaufbau im sichtbaren Ergebnis.
- **Schneller Wechsel zwischen Seiten:** Klickt jemand während des Ladens woanders hin, gewinnt der letzte Klick. Es erscheint nie kurz die falsche Seite.
- **Sehr langsame Verbindung:** Die Ladeansicht bleibt stehen, bis der Inhalt oder die Fehleransicht kommt.
- **Keine Verbindung beim Klick:** Die aktuelle Seite bleibt stehen und zeigt: „Sie sind gerade nicht mit dem Internet verbunden. Bitte prüfen Sie Ihre Verbindung und versuchen Sie es erneut."
- **Verbindung bricht genau während des Ladens ab:** Der Browser zeigt seine eigene Fehlerseite mit der Möglichkeit, neu zu laden. Next.js übernimmt diesen Fall selbst, eine eigene Ansicht ist hier nicht zuverlässig möglich (im Tech Design geprüft).
- **Sitzung ist abgelaufen:** Die Person landet wie bisher auf der Anmeldung, nicht in einer Fehleransicht.
- **Projekt wurde gerade gelöscht oder liegt im Papierkorb:** Die bestehende Meldung erscheint, die Ladeansicht bleibt nicht hängen.
- **Zugang gerade abgelaufen:** Die Seite erscheint im Lesemodus.
- **Leeres Projekt ohne Kapitel:** Die Ladeansicht passt, danach erscheint der bestehende leere Zustand.
- **Ungespeicherte Änderungen im Editor:** Das bestehende Speichern greift, bevor die Ladeansicht der nächsten Seite erscheint.
- **Rückkehr von Stripe:** Hinweise wie „Kauf abgebrochen" erscheinen weiterhin.

## Nicht-Ziele
- Kein Zwischenspeichern von Kundeninhalten, das einen alten Stand zeigen kann.
- Keine Änderung an Anmeldung, Zugangsprüfung oder RLS. Falls die Architektur hier Potenzial sieht, braucht das Jakobs ausdrückliche Freigabe.
- Kein teureres Hosting und kein neuer Anbieter.
- Kein Redesign. Bis auf Lade- und Fehleransicht bleibt die Oberfläche gleich.
- Nicht enthalten sind die Tippgeschwindigkeit im Editor und die Editor-Fehler aus PROJ-25, die Webflow-Seite (PROJ-29) und das allgemeine Aufräumen (PROJ-31).

## Technical Requirements
- Performance: Zielwerte siehe AC-1 und AC-9 bis AC-13.
- Security: Alle Prüfungen bleiben serverseitig.
- Browser Support: Chrome, Firefox, Safari.
- Kundentexte in der Sie-Form.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

**Kurzfassung:** PROJ-30 braucht Frontend und ein kleines Backend. Neu sind Lade- und Fehleransichten, gebündelte Abfragen und eine kleine Migration für die Wortzahl. Neue Pakete, Env-Variablen oder Anbieter sind nicht nötig. Anmeldung, Zugangsprüfung und RLS bleiben unverändert. Zuerst wird der Datenverlust durch die Zurück-Taste behoben.

### A) Komponenten

```
Seiten nach der Anmeldung
+-- Startseite
|   +-- Ladeansicht (Navigation, Buchkarte, Hinweis)
+-- Buchprojekt
|   +-- Ladeansicht (Cover-Karte, Kapitelliste, Hinweis)
+-- Kapitel-Editor
|   +-- Ladeansicht (A5-Seite, auf dem Phone der einfache Hinweis)
+-- Cover-Editor
|   +-- Ladeansicht
+-- Persönlicher Bereich
|   +-- Ladeansicht
|
+-- Gemeinsame Bausteine
    +-- Seitenhülle der Ladeansicht (ruhige Flächen, „Wird geladen …")
    +-- Fehleransicht („Erneut versuchen", Link zur Startseite)
    +-- Wächter für Zurück und Vorwärts (holt den aktuellen Stand)
    +-- Sperre im Editor, bis der aktuelle Text bestätigt ist
    +-- Hinweis bei fehlender Internetverbindung
    +-- Rückmeldung am angeklickten Kapitel, falls die Ladeansicht noch unterwegs ist
```

Anmeldung, Registrierung, Onboarding und Kaufseiten bekommen keine dieser Ansichten. Die Startseite erhält dafür einen eigenen Ordner im Code, ihre Adresse bleibt gleich.

### B) Daten

**Neu an jedem Kapitel:**
- Wortzahl (eine Zahl, leer bedeutet „noch nicht gezählt")

**So bleibt sie richtig:**
- Der Server zählt beim Speichern mit derselben Regel wie der Editor.
- Eine kleine Schutzregel in der Datenbank leert die Zahl, wenn sich der Text ohne neue Zählung ändert. So kann auch ein späterer Weg wie das Audio-Erzählen keine falsche Zahl hinterlassen.
- Ist die Zahl leer, lädt die Übersicht nur den Text dieses einen Kapitels und zählt ihn. Bestehende Kapitel müssen deshalb nicht umgeschrieben werden, ihr Datum „zuletzt bearbeitet" bleibt erhalten.
- Der Papierkorb nimmt die Zahl mit. Ältere Einträge werden nach dem Wiederherstellen wie oben gezählt.

Gespeichert in der bestehenden Kapitel-Tabelle. Die RLS-Regeln gelten unverändert. Die Zahl ist reine Anzeige und entscheidet über keine Rechte oder Zahlungen.

**Abfragen, die nacheinander laufen:**

| Seite | Heute | Danach |
|---|---|---|
| Buchprojekt | 7 | 3 |
| Startseite | 5 | 3 |
| Kapitel-Editor | 3 bis 5 | 2 bis 3 |
| Cover-Editor | 4 | 3 |
| Persönlicher Bereich | 2 | 2 |

### C) Technische Entscheidungen

1. **Die Zurück-Taste wird zuerst repariert.** Der Browser hält für Zurück und Vorwärts eine Kopie der Seite bereit, im Test ging dabei keine einzige Anfrage an den Server. Beim Editor ist das gefährlich. Künftig holt die Seite bei Zurück und Vorwärts den aktuellen Stand, der Editor bleibt so lange gesperrt.
2. **Die Ladeansicht erscheint nur bei echter Wartezeit (nach der QA geändert, BUG-5).** Der Standardweg von Next.js zeigte sie bei jedem Klick und hielt den Inhalt mindestens 0,3 Sekunden zurück. Jetzt bleibt die bisherige Seite bis zu 0,18 Sekunden stehen. Kommt die Antwort später, erscheint die Ladeansicht und bleibt mindestens 0,25 Sekunden, damit nichts aufblitzt. Sie enthält keine Projektdaten.
3. **Kapitel werden nicht vorgeladen.** Jeder sichtbare Link hätte sonst eine eigene Anfrage samt Zugangsprüfung ausgelöst, bei 40 Kapiteln bis zu 40 pro Besuch. Der angeklickte Link zeigt sofort „Wird geöffnet …".
4. **Die Wortzahl wird gespeichert statt jedes Mal gerechnet.** Ein volles Buch sind rund 850 KB Text. Das Zählen direkt in der Datenbank kostete auf Stage bei jedem Öffnen bis zu 175 ms, und die Regel müsste doppelt gepflegt werden.
5. **Fehler und „nicht gefunden" werden getrennt.** Heute sieht ein kurzer Datenbankfehler aus wie ein fehlendes Projekt. Künftig erscheint dafür die Fehleransicht, „nicht gefunden" bleibt für echte Fälle.
6. **Kein Zwischenspeichern von Inhalten.** Das entspricht Jakobs Entscheidung „immer aktuell". Auch der Impuls-Katalog wird normal mitgeladen.
7. **Die doppelte Anmeldeprüfung bleibt.** Sie kostet etwas Zeit, gehört aber zum Auth-Ablauf und ist laut Spec nicht Teil dieses Umbaus.

### D) Abhängigkeiten

Keine neuen Pakete.

### E) Risiken

| Risiko | Umgang |
|---|---|
| Der Editor zeigt beim Zurückgehen kurz einen alten Text | Er bleibt gesperrt, bis der aktuelle Stand da ist. Ein E2E-Test bildet den gefundenen Fehler nach |
| Tippen während der Prüfung geht verloren | Die Eingabe ist in dieser Zeit nicht möglich und der Hinweis sichtbar |
| Ladeansicht erscheint auf Seiten ohne Anmeldung | Sie gilt nur für die fünf Seiten, E2E prüft die öffentlichen Seiten mit |
| Wortzahl weicht vom Editor ab | Eine Zählregel für beide, Tests vergleichen beide Werte |
| Migration stört Speichern oder Papierkorb | Die Spalte ist optional, Test gegen alle Migrationen und die Papierkorb-Abläufe |
| Zielwert beim Kaltstart hängt von Vercel ab | Messung auf Stage durch Jakob, weil Stage automatisch nicht erreichbar ist |

### F) Reihenfolge

1. Datenverlust durch die Zurück-Taste beheben und absichern.
2. Migration für die Wortzahl, von Jakob im SQL-Editor eingespielt.
3. Abfragen bündeln und die Übersicht ohne Kapiteltexte laden.
4. Lade-, Fehler- und Offline-Ansichten.
5. QA mit einem vollen Testbuch (40 Kapitel, 300 Seiten).

## Implementation Notes (Frontend)

**Stand 2026-11-23, noch nicht committet.** Neue Browser-Tests stehen in `tests/PROJ-30-ladezeiten.spec.ts` (Start mit `E2E_LOADING=1`).

**Datenverlust behoben (AC-22, AC-26):**
- Es gab zwei Ursachen. Die Zurück-Taste zeigte eine alte Kopie der Seite, und schon das bloße Öffnen eines Kapitels schrieb den geladenen Text nach rund sieben Sekunden zurück.
- Text, Titel und Bilder gehen jetzt nur noch zum Server, wenn die Person sie geändert hat. Weicht nur die Seitenzahl ab, wird nur sie gespeichert.
- Die automatische Silbentrennung beim Öffnen zählt nicht mehr als Änderung.
- Nach Zurück und Vorwärts wird der aktuelle Stand geholt, wartet dabei auf laufende Speichervorgänge und hält den Editor so lange gesperrt. Das gilt auch für den Cover-Editor.

**Schneller sichtbar:** Der Editor blendete jedes Kapitel über fünf Sekunden aus. Jetzt erscheint es, sobald das Layout ruhig ist. Ein Kapitel mit 42 Seiten war nach 0,85 Sekunden sichtbar, mit derselben Seitenzahl wie nach dem vollständigen Einschwingen.

**Gebaut:** Ladeansichten für alle fünf Seiten, Fehleransicht, deutsche Seite „nicht gefunden", Offline-Hinweis. Der angeklickte Kapitel-Link zeigt sofort „Wird geöffnet …". Die Startseite liegt im Code im Ordner `(start)`, ihre Adresse bleibt gleich.

**Nach der QA ergänzt:**
- Beim Seitenwechsel wartet die App auf laufende Speichervorgänge und holt danach den aktuellen Stand. Scheitert das Speichern, erscheint eine Meldung.
- Der Cover-Editor speichert eine offene Änderung beim Verlassen sofort.
- Ohne sichtbares Layout (Phone) misst der Editor keine Seitenzahl mehr.

## Implementation Notes (Backend)

**Stand 2026-11-23, noch nicht committet.** Die Migration `20261123140000_proj30_word_count.sql` ist auf Stage eingespielt und geprüft, RLS ist unverändert. Unit-Tests 866/866, E2E 309 Testläufe bestanden, lokal gegen die Stage-Datenbank.

- **Wortzahl:** Der Server zählt beim Speichern mit derselben Regel wie der Editor. Die Datenbank leert die Zahl, wenn sich der Text ohne neue Zählung ändert. Bleibt die Zahl bei einer Korrektur gleich, trägt der Server sie nach, sofern inzwischen niemand anderes gespeichert hat.
- **Bestehende Kapitel:** Sie bleiben unverändert und werden live gezählt, bis sie das nächste Mal gespeichert werden.
- **Abfragen:** Startseite, Buchprojekt, Editor und Cover laden gebündelt. Im Seitenaufbau sind es 3 Schritte beim Buchprojekt und 2 auf den anderen Seiten. Die Zugangsprüfung davor ist unverändert.
- **Fehler:** Ein Datenbankfehler führt jetzt zur Fehleransicht statt zu „nicht gefunden" oder einem leeren Buch. Im echten Fehlerfall geprüft: keine technischen Details, „Erneut versuchen" holt die Seite zurück, sobald die Datenbank wieder antwortet. Ungültige IDs in der Adresse bleiben „nicht gefunden".

**Messung mit vollem Buch** (40 Kapitel, 303 Seiten, lokaler Production-Build gegen Stage, Median aus 7 Durchgängen, im Browser gemessen):

| Weg | Erste Reaktion | Inhalt sichtbar |
|---|---|---|
| Startseite zum Buchprojekt | 0,20 s | 0,45 s |
| Buchprojekt zum Kapitel mit 30 Seiten | 0,01 s | 0,53 s |
| Cover-Editor | 0,19 s | 0,19 s |
| Startseite | 0,19 s | 0,19 s |
| Persönlicher Bereich | 0,15 s | 0,15 s |

Beim Buchprojekt erscheint lokal die Ladeansicht, weil jede Abfrage vom Mac bis Frankfurt läuft. Auf Vercel liegen Server und Datenbank nebeneinander, dort dürfte die Antwort schneller sein. Gemessen ist das noch nicht.

Die Übersicht überträgt beim vollen Buch 13 KB statt 651 KB. Die Werte aus der Ausgangslage entstanden mit einer anderen Messmethode und sind damit nicht direkt vergleichbar.

**Nicht gemessen:** Stage selbst und der Kaltstart nach längerer Pause (AC-12). Das braucht Jakobs Prüfung auf Stage.

## QA Test Results

**Tested:** 2026-11-23
**App URL:** http://localhost:3000 (Production-Build gegen die Stage-Datenbank)
**Tester:** QA Engineer (AI)
**Browser:** nur Chromium. WebKit startet auf diesem Mac nicht, der Playwright-Firefox ist nicht installiert.
**Nicht geprüft:** Stage selbst und der Kaltstart nach längerer Pause (AC-12), Safari und Firefox, die Ansage mit einem echten Screenreader (AC-7 ist nur über `role="status"` geprüft).

### Acceptance Criteria Status

| Bereich | Ergebnis | Anmerkung |
|---|---|---|
| A. Sofortige Reaktion (AC-1 bis 8) | 8/8 | AC-5 nach BUG-5 bestanden. Layoutsprung höchstens 0,037 |
| B. Ladezeit (AC-9 bis 14) | 5/6 | Volles Buch 0,45 s, Kapitel mit 30 Seiten 0,53 s. AC-12 (Kaltstart) ist offen |
| C. Immer aktuell (AC-15 bis 18, AC-26) | 5/5 | Nach BUG-1 und BUG-4 bestanden |
| D. Sicherheit und Verhalten (AC-19 bis 22) | 4/4 | Nach BUG-1 und BUG-2 bestanden |
| E. Fehlerfall (AC-23 bis 25) | 3/3 | Mit echtem, simuliertem Datenbankausfall geprüft |

### Edge Cases Status

- [x] Doppelklick auf eine Karte
- [x] Schneller Wechsel zwischen Seiten: Der letzte Klick gewinnt
- [x] Sehr langsame Verbindung: Die Ladeansicht bleibt stehen
- [x] Keine Verbindung beim Klick und bei der Zurück-Taste: Hinweis, danach wieder normal
- [ ] Verbindung bricht genau während des Ladens ab: nicht geprüft, laut Tech Design übernimmt der Browser
- [x] Sitzung abgelaufen: Weiterleitung zur Anmeldung
- [x] Kapitel gelöscht, dann Zurück: „nicht gefunden", keine hängende Ladeansicht
- [x] Zugang abgelaufen: Lesemodus, nichts wird geschrieben
- [x] Leeres Projekt zeigt den leeren Zustand
- [x] Ungespeicherte Änderungen im Editor und Cover: bleiben auch bei langsamem Speichern erhalten
- [x] Rückkehr von Stripe zeigt den Hinweis
- [x] Scroll-Position bleibt nach der Zurück-Taste erhalten
- [x] Ein offener, unberührter Editor überschreibt keine andere Person

### Security Audit Results

- [x] Fremde Projekte, Kapitel und Cover: kein Titel und kein Text in HTML oder Seitendaten
- [x] Fremde und nicht vorhandene Projekte sind nicht unterscheidbar
- [x] Ladeansichten enthalten keine Projektdaten
- [x] Fehleransicht zeigt keine technischen Details
- [x] Die Übersicht überträgt keinen Kapiteltext mehr
- [x] Anmeldung und Zugangsprüfung sind unverändert, RLS der Kapitel ebenfalls
- [x] Die Schutzregel der Wortzahl gilt auch für Mitglieder, ihre Funktion ist nicht direkt aufrufbar
- [x] Sehr tief verschachteltes JSON bringt das Zählen nicht zum Absturz
- Hinweis: Ein Mitglied könnte die Wortzahl des eigenen Projekts direkt ändern. Sie ist reine Anzeige und entscheidet über keine Rechte oder Zahlungen.

### Bugs Found

#### BUG-1: Bei langsamem Speichern kann neuer Text weiter verloren gehen
- **Severity:** Critical
- **Steps to Reproduce:**
  1. Im Editor tippen und sofort „Zurück zur Projektübersicht" klicken, während das Speichern noch läuft (nachgestellt mit 3 Sekunden)
  2. Dasselbe Kapitel gleich wieder öffnen
  3. Expected: Der Editor zeigt den neuen Text oder wartet darauf
  4. Actual: Er zeigt den alten Text. Das nächste Tippen überschreibt den neuen Text endgültig
- **Priority:** Fix before deployment
- **Status:** Behoben und nachgetestet am 2026-11-23

#### BUG-2: Ein Kapitel auf dem Handy zu öffnen zerstört die Seitenzahl
- **Severity:** High
- **Steps to Reproduce:**
  1. Ein Kapitel mit 15 Seiten auf dem Handy öffnen, es erscheint der Hinweis statt des Editors
  2. Rund 9 Sekunden warten
  3. Expected: Die Seitenzahl bleibt 15
  4. Actual: Sie wird auf 1 gesetzt, dadurch verschieben sich die Seitenzahlen aller folgenden Kapitel
- **Herkunft:** Bestand schon vor PROJ-30
- **Priority:** Fix before deployment
- **Status:** Behoben und nachgetestet am 2026-11-23

#### BUG-3: Eine Cover-Änderung direkt vor dem Verlassen geht verloren
- **Severity:** High
- **Steps to Reproduce:**
  1. Im Cover-Editor den Untertitel ändern
  2. Innerhalb von 2 Sekunden „Zurück zur Projektübersicht" klicken
  3. Expected: Die Änderung ist gespeichert
  4. Actual: Sie ist weg, ohne Warnung
- **Herkunft:** Bestand schon vor PROJ-30
- **Priority:** Fix before deployment
- **Status:** Behoben und nachgetestet am 2026-11-23

#### BUG-4: Nach schnellem Verlassen zeigt die Übersicht die alte Wortzahl
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Im Editor tippen und sofort über den Link zur Übersicht gehen
  2. Expected: Die neue Wortzahl
  3. Actual: Die alte Zahl (im Test 2 statt 4), bis die Seite neu geladen wird. Gespeichert ist der Text richtig
- **Priority:** Fix before deployment
- **Status:** Behoben und nachgetestet am 2026-11-23

#### BUG-5: Die Ladeansicht blitzt bei jedem Klick kurz auf
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Bei schnellem Server von der Startseite ein Buchprojekt öffnen
  2. Expected: Der Inhalt erscheint direkt, ohne Aufblitzen (AC-5)
  3. Actual: Die Ladeansicht steht jedes Mal rund 0,15 Sekunden da. React hält sie mindestens 0,3 Sekunden nach dem Klick
- **Priority:** Fix before deployment
- **Status:** Behoben und nachgetestet am 2026-11-23

#### BUG-6: Die Seite „nicht gefunden" ist englisch
- **Severity:** Low
- **Steps to Reproduce:** Eine nicht vorhandene Projekt-Adresse öffnen. Es erscheint „This page could not be found." statt eines deutschen Textes in Sie-Form
- **Herkunft:** Bestand schon vor PROJ-30
- **Priority:** Fix in next sprint
- **Status:** Behoben und nachgetestet am 2026-11-23

### Automatisierte Tests

- Nachtest nach allen sechs Fixes: Unit-Tests 870/870, E2E 314 Testläufe bestanden (14 PROJ-30, 185 Hauptlauf, 42 Design und Onboarding, 50 Lesemodus, Zugriff und Papierkorb, 14 Aufbewahrung, 9 Kaufwege)
- Die Fehlerfälle stehen jetzt als Regressionstests in `tests/PROJ-30-ladezeiten.spec.ts`
- Nicht gefundene Seiten antworten wieder mit echtem HTTP-Status 404
- Die echte Cron-Route wurde nicht aufgerufen, es gingen keine Mails hinaus, alle Testdaten sind wieder gelöscht

### Summary

- **Acceptance Criteria:** 25/26 passed, 1 offen (AC-12, Kaltstart auf Stage)
- **Bugs Found:** 6 total (1 critical, 2 high, 2 medium, 1 low), alle behoben
- **Security:** Pass
- **Production Ready:** Noch nicht. Es fehlen die Prüfung auf Stage mit Kaltstart sowie Safari und Firefox
- **Recommendation:** Auf Stage bringen, Jakob prüft das Öffnen nach längerer Pause, danach Status Approved

## Deployment
_To be added by /deploy_
