# PROJ-22: Design-Grundlage der Web-App

## Status: Approved
**Created:** 2026-11-23
**Last Updated:** 2026-11-23
**Freigabe:** Von Jakob am 2026-11-23 freigegeben.

**Entwürfe:** [NARRAVIT App-Entwürfe](https://claude.ai/artifact/HrJ9UnV24h6UEk9Knxtey2). Sie sind die visuelle Vorlage für diese Spec. Beispielnamen und Zahlen darin sind nicht echt.

## Dependencies
- Requires: PROJ-3 (Persönlicher Bereich), der Bereich wird neu angeordnet, die Funktionen bleiben
- Requires: PROJ-4 (Kapitel-Routing), Kapitelliste und Projektübersicht
- Requires: PROJ-9 (Mitglieder), die Nutzerliste bleibt im bisherigen Design
- Requires: PROJ-10 (Cover-Editor), das Cover wird groß angezeigt
- Requires: PROJ-28 (Lesemodus), alle Regeln für abgelaufene Projekte bleiben gültig
- Später: PROJ-8 (Impuls-Bibliothek), PROJ-12 (Erzählen), PROJ-16 (Druckauftrag), PROJ-20 (Buchrücken im Cover-Editor), PROJ-25 (Kapitel-Editor)

## Entscheidungen von Jakob (2026-11-23)

1. Die App bleibt **eckig, kastig, menschlich und etwas altmodisch**. Sie darf nicht nach KI-Slop aussehen.
2. Die Zielgruppe ist eher über 60. Alles bleibt einfach, ruhig und übersichtlich. Insgesamt muss nicht viel geändert werden.
3. **Lato bleibt** die Schrift für Text und Bedienung.
4. Die Überschriften werden an die Webflow-Seite angeglichen, vor allem beim Zeichenabstand.
5. **Startseite:** Foto mit Weichzeichner, darunter das Buch groß.
6. **Projektübersicht:** Das Cover bekommt eine eigene große Karte. Kapitel- und Nutzerliste bleiben im **alten Design**. Neu sind dort nur die Überschrift der Nutzerliste und die Buttons „Person einladen" und „Erzähl-Impulse ansehen".
7. **Persönlicher Bereich:** ohne Foto, in einer ruhigen Spalte. Die E-Mail steht fest da, ohne Hinweis auf den Support.
8. **Rechnungen:** keine Tabelle. Rechnungen kommen per Mail von Stripe.
9. **Markenname:** NARRAVIT in Großbuchstaben steht immer in Merriweather, nie in PT Serif.

## User Stories

- Als Person über 60 möchte ich sofort mein Buch sehen, wenn ich mich anmelde, damit ich ohne Suchen weiterschreiben kann.
- Als Person mit mehreren Büchern möchte ich sie nebeneinander sehen und erkennen, woran ich zuletzt gearbeitet habe.
- Als Projektmitglied möchte ich beim Öffnen eines Projekts direkt das Cover groß sehen, damit es sich wie mein echtes Buch anfühlt.
- Als Projektleitung möchte ich früh sehen, was bis zum Druck noch fehlt.
- Als Kontoinhaber möchte ich meine Angaben schnell finden, ohne viel Erklärtext lesen zu müssen.
- Als Mensch mit nachlassender Sehkraft möchte ich alle Texte und Buttons gut lesen und treffen können.
- Als Besucher, der von der Website kommt, möchte ich in der App denselben Stil wiedererkennen.

## Acceptance Criteria

### A. Stil und Typografie

- [x] AC-1: Alle Seitenüberschriften der App stehen in PT Serif in normaler Stärke.
- [x] AC-2: Der Zeichenabstand beträgt bei der Hauptüberschrift etwa -2 %, bei Zwischenüberschriften etwa -1 %.
- [x] AC-3: Merriweather kommt nur noch im Buch selbst (Kapitel-Editor und Druck) und beim Markennamen NARRAVIT vor.
- [x] AC-38: Steht NARRAVIT in Großbuchstaben in einer Überschrift oder als Schriftzug, ist genau dieses Wort in Merriweather gesetzt, auch mitten in einer PT-Serif-Überschrift. Es wirkt dabei optisch gleich groß wie der Text daneben.
- [x] AC-4: Fließtext, Navigation und Buttons bleiben in Lato.
- [x] AC-5: Karten, Buttons, Felder und Fotos bleiben eckig. Einzige Ausnahme sind die runden Personen-Icons.
- [ ] AC-6: Auf den drei Seiten ist kein Text kleiner als 16 px.
- [x] AC-7: Alle Texte erreichen mindestens 4,5:1 Kontrast, auch Hinweise und Beschriftungen.
- [x] AC-8: Alle Bedienelemente sind mindestens 44 px hoch.
- [x] AC-9: Es gibt keine Farbverläufe als Dekoration, keine Pillen-Buttons, keine Emojis und keine Glaseffekte.

### B. Startseite

- [x] AC-10: Oben steht ein Foto mit bewusstem Weichzeichner und dunkler Schicht, darauf in Weiß „Willkommen zurück bei NARRAVIT" und der bisherige Untertitel.
- [x] AC-11: Mit **einem** Projekt zeigt die Seite eine große Karte mit Buch, Titel, Kapitelzahl und „Zuletzt bearbeitet: [Zeit]".
- [x] AC-12: Mit **mehreren** Projekten erscheint die Überschrift „Ihre Bücher" mit Karten nebeneinander, das zuletzt bearbeitete zuerst.
- [x] AC-13: Jede Karte bei mehreren Projekten zeigt das Cover als Buch, Titel, Rolle („Sie leiten dieses Buch" oder „Sie schreiben mit"), Kapitelzahl und letzte Bearbeitung.
- [x] AC-14: Aktive Projekte haben den Button „Weiterschreiben".
- [x] AC-15: Abgelaufene Projekte zeigen „Abgelaufen am [Datum]" und den Button „Ansehen".
- [x] AC-16: „Projekt löschen" ist ein dezenter Textlink, nur für die Projektleitung, mit dem bisherigen Sicherheitsdialog.
- [x] AC-17: „Weiteren Projektzugang sichern" bleibt erreichbar, aber als zweitrangiger Button.

### C. Projektübersicht

- [x] AC-18: Ganz oben steht eine eigene Karte mit großem Cover, angedeutetem Buchrücken, Titel, Autorenzeile, Kapitel- und Seitenzahl.
- [x] AC-19: Die Karte hat den Button „Cover bearbeiten", im Lesemodus „Cover ansehen".
- [x] AC-20: Die Kapitelliste behält Aussehen und Funktion: Drag and Drop, Titel bearbeiten, Löschen und „Bearbeiten".
- [x] AC-21: Der Button heißt „Erzähl-Impulse ansehen". Bis zur Bibliothek aus PROJ-8 öffnet er den bisherigen Dialog.
- [x] AC-22: Die Nutzerliste behält Aussehen und Funktion, inklusive farbiger Personen-Icons, Entfernen und „Projekt verlassen".
- [x] AC-23: Die Nutzerliste heißt „Wer an diesem Buch beteiligt ist", der Einladen-Button „Person einladen".
- [x] AC-24: Die Karten „Erzählen per Sprachnachricht" und „NARRAVIT-Projektzugang" stehen nebeneinander, ihr Inhalt bleibt wie heute.
- [x] AC-25: Die neue Karte „Buch in den Druck geben" zeigt die Schritte Inhalt, Cover und Lieferadresse.
- [x] AC-26: Diese Karte ist bis PROJ-16 ein **Platzhalter**. Der Druckauftrag ist gesperrt, es wird nichts gespeichert und es gibt keinen PDF-Download.
- [x] AC-27: Der Lesemodus aus PROJ-28 funktioniert auf der neuen Seite unverändert.

### D. Persönlicher Bereich

- [x] AC-28: Das Foto oben entfällt, alle Bereiche stehen in einer schmalen Spalte.
- [x] AC-29: Der Name lässt sich wie bisher ändern.
- [x] AC-30: Die E-Mail steht fest im Feld, ohne Hinweis auf den Support.
- [x] AC-31: Statt der Rechnungstabelle steht: „Ihre Rechnung erhalten Sie nach jedem Kauf per E-Mail. Falls Sie sie nicht mehr finden, schreiben Sie uns an kontakt@narravit.de."
- [x] AC-32: Passwort zurücksetzen funktioniert wie bisher, auch die Hinweise für Google- und Facebook-Konten.
- [x] AC-33: Das Löschen läuft wie bisher mit Übersicht, Nachfolge und dem Wort `LÖSCHEN`.
- [x] AC-34: Die Kundentexte nennen es einheitlich „Konto" statt teils „Account".

### E. Geräte

- [x] AC-35: Alle drei Seiten funktionieren bei 1440, 768 und 375 px Breite ohne seitliches Scrollen.
- [x] AC-36: Auf dem Handy stehen die Karten untereinander, das Buch bleibt vollständig sichtbar.
- [x] AC-37: Bei 200 % Browser-Zoom bleibt alles lesbar und bedienbar.

## Edge Cases

- **Kein Coverfoto:** Das Buch zeigt die gewählte Farbe mit Titel und Autor.
- **Sehr langer Titel:** Er bricht auf der Karte um, auf dem Buchrücken wird er gekürzt.
- **Keine Autorenzeile:** Die Stelle bleibt leer, das Layout verschiebt sich nicht.
- **Viele Projekte:** Die Karten laufen in weiteren Reihen, alle bleiben erreichbar.
- **Projekt ohne Kapitel:** Die Karte zeigt „Noch keine Kapitel", der Button heißt „Loslegen".
- **Aktive und abgelaufene Projekte gemischt:** Die Sortierung bleibt nach letzter Bearbeitung, der Status steht an jeder Karte.
- **Co-Autor:** sieht kein „Projekt löschen".
- **Foto lädt nicht:** Die Begrüßung bleibt auf der dunklen Fläche lesbar.
- **Lange E-Mail-Adresse oder langer Name:** Der Text bricht um und läuft nicht aus der Karte.
- **Keine Projekte:** Es bleibt beim bisherigen Weg ins Onboarding.

## Nicht in diesem Feature

- Die Impuls-Bibliothek und ihre Illustrationen (PROJ-8)
- Der echte Buchrücken im Cover-Editor mit Druckmaßen (PROJ-20)
- Der echte Druckauftrag mit Lieferadresse (PROJ-16)
- Die Einstellungen zum Erzählen (PROJ-12)
- Design und Fehler des Kapitel-Editors (PROJ-25)
- Onboarding (PROJ-24)
- Die Webflow-Seite (PROJ-29)
- Das Einschalten der Stripe-Rechnungen (Go-live-Liste)

## Offene Entscheidung

**Erzählen und Schreiben neben den Kapiteln:** Der Entwurf zeigt bei offenen Kapiteln zwei farbige Buttons. Jakob ist noch nicht sicher, ob das die richtige Lösung ist. Deshalb gehört es **nicht** in diesen Bau, die Kapitelliste bleibt erst einmal wie heute. Entschieden wird mit PROJ-12. Eine Alternative wäre ein einziger Button „Kapitel beginnen", der danach fragt, ob man erzählen oder schreiben möchte.

## Technical Requirements

- **Keine Funktionsänderung:** Rechte, Daten, Abläufe und Lesemodus bleiben gleich. Dieses Feature ändert nur Darstellung und Texte.
- **Barrierearmut:** WCAG 2.1 AA für Kontrast, Tastaturbedienung und Beschriftungen.
- **Print-First:** Die Darstellung des Buchs in der App darf die Druckdaten nicht verändern.
- **Tests:** Vorhandene E2E-Tests, die alte Texte oder Elemente erwarten, werden mit angepasst.
- **Browser:** Chrome, Firefox und Safari in aktuellen Versionen.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

> Von Jakob am 2026-11-23 freigegeben, geprüft am vorhandenen Code.

**Kurzfassung:** Das ist ein reiner Umbau der Oberfläche. Es gibt keine neue Tabelle, keine Migration, keine neuen Rechte, keine neuen Pakete und keine neuen Env-Variablen. `/backend` ist nicht nötig.

### A) Aufbau

```
Gemeinsame Grundlage
+-- Schriftregeln: Überschriften, Text, Hinweise
+-- Buchansicht: Cover mit angedeutetem Buchrücken (neu, wird zweimal genutzt)

Startseite
+-- Foto mit Weichzeichner und Begrüßung
+-- Ein Projekt: große Karte mit Buch und „Weiterschreiben"
+-- Mehrere Projekte: „Ihre Bücher" mit Karten nebeneinander
|   +-- Buchansicht, Titel, Rolle, Kapitel, letzte Bearbeitung
|   +-- „Weiterschreiben" oder bei Ablauf „Ansehen"
|   +-- „Projekt löschen" nur für die Projektleitung, bisheriger Dialog
+-- „Weiteren Projektzugang sichern"

Projektübersicht
+-- Cover-Karte: große Buchansicht, Titel, Autor, Kapitel, Seiten
+-- Kapitel: bisherige Liste, neuer Button „Erzähl-Impulse ansehen"
+-- Druck-Karte: Inhalt, Cover, Lieferadresse (Platzhalter)
+-- Nebeneinander: Erzählen per Sprachnachricht, Projektzugang
+-- Nutzerliste: bisherige Liste, neue Überschrift und neuer Button

Persönlicher Bereich (eine Spalte)
+-- Ihre Angaben: Name, E-Mail fest
+-- Rechnungen: nur der Hinweis
+-- Passwort
+-- Konto löschen: bisheriger Ablauf
```

### B) Daten

Es wird nichts Neues gespeichert. Zwei vorhandene Werte werden zusätzlich gelesen:

- **Startseite:** das Ablaufdatum jedes Projekts, gesammelt in einer Abfrage, damit die Seite bei vielen Projekten schnell bleibt.
- **Projektübersicht:** die Seitenzahl der Kapitel, die der Editor schon speichert.

Der Status der Druck-Karte wird aus diesen vorhandenen Daten berechnet. Die Lieferadresse kommt erst mit PROJ-16.

### C) Technische Entscheidungen

1. **Schriften an einer zentralen Stelle.** Überschriften werden einmal festgelegt statt in jeder Datei. So bleiben App und Website dauerhaft gleich.
2. **Die neue Überschriftenschrift gilt für die ganze App.** Dazu zählen auch Anmeldung, Registrierung, Onboarding, Kauf und Einladung, sonst würde der Stil zwischen den Seiten springen. Deren Layout bleibt unverändert.
3. **Das Buch bleibt ausgenommen.** Cover, Kapitelseiten und der Kapitel-Editor behalten Merriweather, damit sich Seitenumbrüche und Druck nicht verschieben.
4. **Eine Buchansicht für alle Stellen.** Sie nutzt die vorhandene Cover-Darstellung und legt nur den Rücken daneben. Die Cover-Daten und das spätere Druck-PDF bleiben unberührt.
5. **Kapitel- und Nutzerliste werden nicht neu gebaut.** Drag and Drop, Umbenennen, Löschen und Einladen bleiben im vorhandenen Code. Dort ändern sich nur Texte, Lesbarkeit und Kontrast.
6. **Persönlicher Bereich: nur umordnen.** Name, Passwort und der Lösch-Ablauf behalten ihre Logik.
7. **Die Druck-Karte liegt außerhalb der Lesemodus-Sperre.** PROJ-28 verlangt, dass der Druckauftrag auch in den 90 Tagen nach Ablauf möglich bleibt.
8. **Der Markenname ist ein eigener Baustein.** So steht NARRAVIT in jeder Überschrift automatisch in Merriweather und muss nicht an jeder Stelle einzeln gepflegt werden.

### D) Stolperstellen, die der Bau mit löst

| Stelle | Folge ohne Fix |
|---|---|
| „Heute" wird als „innerhalb von 24 Stunden" berechnet | Gestern Abend bearbeitet stünde am Morgen als „heute" da. Künftig zählen Kalendertage in deutscher Zeit |
| Überschriften sind an vielen Stellen einzeln festgelegt | Ohne Aufräumen bliebe die alte Schrift auf einzelnen Seiten stehen |
| Die Startseite kennt das Ablaufdatum bisher nicht | Abgelaufene Projekte würden „Weiterschreiben" anzeigen |
| Das Ablaufdatum lässt sich nicht laden | Die Karte zeigt neutral „Öffnen", die Projektseite entscheidet dann selbst über den Lesemodus |
| Das Foto muss neben der Leiste und unter der Handy-Navigation sitzen | Es würde sonst verdeckt oder liefe unter die Leiste |
| Viele graue Hinweise sind zu hell oder zu klein | Sie bleiben sonst für die Zielgruppe schlecht lesbar |
| Die Druck-Karte ist bis PROJ-16 ohne Funktion | Beide Buttons sind gesperrt, dazu steht dort: „Der Druckauftrag wird gerade vorbereitet." |

### E) Schriftregeln

| Element | Schrift | Zeichenabstand |
|---|---|---|
| Hauptüberschrift | PT Serif, normal | etwa -2 % |
| Zwischenüberschrift | PT Serif, normal | etwa -1 % |
| Markenname NARRAVIT in Überschriften und Schriftzügen | Merriweather | normal |
| Text, Navigation, Buttons | Lato | normal |
| Hinweise | Lato, mindestens 16 px, dunkleres Grau | normal |
| Buch, Cover, Kapitelseiten | wie bisher | wie bisher |

### F) Bau-Reihenfolge

1. Schriftregeln und Lesbarkeit
2. Buchansicht
3. Startseite
4. Projektübersicht mit Druck-Platzhalter
5. Persönlicher Bereich
6. Tests anpassen und auf Desktop, Tablet und Handy prüfen

### G) Tests

Betroffen sind die E2E-Tests zu Konto, Kapiteln, Mitgliedern, Cover, Papierkorb und Lesemodus, weil sich Texte wie „Account löschen", „Nutzer hinzufügen" und „Öffnen" ändern. Vor und nach dem Umbau wird geprüft, dass Drag and Drop, Lesemodus, Konto-Löschen und die Seitenumbrüche im Editor gleich funktionieren.

### H) Vor dem Go-live

Die Druck-Karte darf nicht als funktionsloser Platzhalter live gehen. Bis dahin muss PROJ-16 fertig sein, oder die Karte wird für Production ausgeblendet.

### I) Abhängigkeiten

- **Neue Pakete:** keine
- **Neue Env-Variablen:** keine
- **Migration:** keine
- **Nächste Schritte nach Freigabe:** `/frontend`, danach `/qa`

## Implementation Notes (Frontend, 2026-11-23)

**Gebaut, nicht committet:**

- **Schriften:** Überschriften zentral in `globals.css` (PT Serif, H1 -2 %, sonst -1 %). `.a5-stack` und `.a5-page` behalten Merriweather und normalen Zeichenabstand, damit Seitenumbrüche gleich bleiben. `BrandName` setzt NARRAVIT in Überschriften in Merriweather.
- **Buchansicht:** `BookView` legt einen Rücken neben das unveränderte `CoverRender`. Die Rückenfarbe wird aus der Coverfarbe berechnet und nirgends gespeichert.
- **Startseite:** Foto mit dunkler Ebene, große Karte bei einem Projekt, „Ihre Bücher" bei mehreren. Ablaufdaten kommen in einer Abfrage. Schlägt sie fehl, zeigt die Karte neutral „Öffnen". „Zuletzt bearbeitet" zählt Kalendertage in deutscher Zeit (`project-card-status.ts`).
- **Projektübersicht:** Cover-Karte, Kapitelliste mit „Erzähl-Impulse ansehen", `PrintOrderCard` außerhalb von `ReadOnlyScope`, Sprachnachricht und Projektzugang nebeneinander, Nutzerliste mit „Wer an diesem Buch beteiligt ist" und „Person einladen". Icon-Buttons sind jetzt 44 px groß, Hinweise dunkler und mindestens 16 px.
- **Persönlicher Bereich:** eine Spalte ohne Foto, E-Mail fest ohne Support-Hinweis, nur noch der Rechnungshinweis, durchgehend „Konto". Passwort- und Lösch-Logik sind unverändert.

**Abweichungen vom Entwurf:**

- Der Satz „Ihr erstes gedrucktes Buch ist bereits bezahlt" steht nicht auf der Druck-Karte, weil das bis PROJ-16 nicht belegt ist.
- Der Button heißt weiter „Name speichern" statt „Speichern". Die Autorenzeile steht so da, wie sie im Cover eingegeben wurde, ohne vorangestelltes „von".
- Die Druck-Karte zählt ein Kapitel ohne Wörter als offen, auch wenn es nur Bilder enthält. Das wird mit PROJ-16 genauer.

**Geprüft am 2026-11-23 (Production-Build gegen Stage):** Typprüfung, Lint ohne Fehler, Unit-Tests grün, E2E 170 + 50 + 14 bestanden. Alte Texte in den Tests wurden angepasst. Screens bei 1440, 768, 375 px und 200 % Zoom ohne horizontales Scrollen. Mehrere Projekte, Ablauf und Lesemodus liefen mit temporären Stage-Konten, die danach gelöscht wurden.

**Hinweis für QA:** Der Lesemodus sperrt „Erzähl-Impulse ansehen" wie zuvor, weil der bisherige Dialog ein Kapitel anlegt. Das ändert sich erst mit der Bibliothek aus PROJ-8.

**Nachträge von Jakob (2026-11-23):** Das Buch-Element auf der Startseite bekommt einen deutlichen Schatten. Der Abschnitt heißt „Weiteres Buchprojekt beginnen", der Button „Weiteren Projektzugang sichern". Die Nutzerliste heißt „Wer an diesem Buch beteiligt ist". Über dem Titel der großen Karte steht „Ihr Projekt".

## QA Test Results

**Tested:** 2026-11-23
**App URL:** http://localhost:3000 (Production-Build gegen die Stage-Datenbank)
**Tester:** QA Engineer (AI)
**Browser:** nur Chromium. WebKit startet auf diesem Mac nicht, der Playwright-Firefox ist nicht installiert. **Safari und Firefox sind damit nicht geprüft.**

### Acceptance Criteria Status

| Bereich | Ergebnis | Anmerkung |
|---|---|---|
| A. Stil und Typografie (AC-1 bis 9, AC-38) | 9/10 | AC-6 bleibt offen, weil die Bestätigungsmeldungen 13 px groß sind (BUG-4). AC-7 und AC-8 sind nach dem Fix von BUG-2 erfüllt |
| B. Startseite (AC-10 bis 17) | 8/8 | Weiß auf dem Foto erreicht an der hellsten Stelle mindestens 5,28:1 |
| C. Projektübersicht (AC-18 bis 27) | 10/10 | Drag and Drop bleibt nach dem Neuladen erhalten, die Druck-Karte löst keinen Serveraufruf aus |
| D. Persönlicher Bereich (AC-28 bis 34) | 7/7 | Google-Hinweis geprüft. Der echte Passwort-Versand wurde bewusst nicht ausgelöst |
| E. Geräte (AC-35 bis 37) | 3/3 | AC-37 ist nach dem Fix von BUG-1 erfüllt |

**Buchsatz:** Ein Kapitel mit 40 Absätzen auf 7 Seiten steht mit der neuen und der alten Überschriften-Regel an exakt denselben Positionen.

### Edge Cases Status

- [x] Kein Coverfoto
- [x] Sehr langer Titel, auch ein einzelnes sehr langes Wort
- [x] Keine Autorenzeile
- [x] Viele Projekte (10 Karten)
- [x] Projekt ohne Kapitel
- [x] Aktive und abgelaufene Projekte gemischt
- [x] Co-Autor sieht kein „Projekt löschen"
- [x] Foto lädt nicht, Begrüßung bleibt lesbar
- [x] Lange E-Mail-Adresse oder langer Name brechen um (BUG-3 behoben)
- [x] Keine Projekte: Weiterleitung ins Onboarding, dort nur noch der Link „Zum persönlichen Bereich" (Wunsch von Jakob, 2026-11-23)

### Security Audit Results

- [x] Fremdes Projekt liefert 404
- [x] Gespeichertes HTML in Titel und Autorenzeile wird nicht ausgeführt
- [x] Der Umbau enthält keine neuen Server Actions, Schreibzugriffe, Migrationen, Pakete oder Env-Werte
- [x] Die neue Ablauf-Abfrage läuft mit der Sitzung der Person und damit unter RLS
- [x] Die gesperrten Druck-Buttons senden auch bei erzwungenem Klick nichts

### Bugs Found

#### BUG-1: Dialoge werden bei 200 % Zoom abgeschnitten
- **Status:** Behoben. Alle Dialoge scrollen jetzt, wenn sie höher als der Bildschirm sind
- **Severity:** High
- **Steps to Reproduce:**
  1. Browser auf 200 % stellen (entspricht 720 x 500 px)
  2. „Erzähl-Impulse ansehen" öffnen oder auf der Startseite „Projekt löschen" bis Schritt 2 durchgehen
  3. Expected: Alle Inhalte und Buttons sind erreichbar
  4. Actual: „Impuls übernehmen" und „Endgültig löschen" liegen teilweise außerhalb des Bildschirms, die Überschrift ebenfalls. Die Seite dahinter ist gesperrt, scrollen geht nicht. Bei 320 px Breite ist die Überschrift nicht erreichbar
- **Priority:** Fix before deployment

#### BUG-2: Nachfolge-Auswahl beim Konto-Löschen ist zu klein und kontrastarm
- **Status:** Behoben. Mindestens 16 px, 44 px Höhe, dunkle Schrift auf heller Markierung
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Als einzige Projektleitung eines gemeinsamen Projekts „Konto löschen" öffnen
  2. Die Auswahl der Nachfolge aufklappen
  3. Expected: mindestens 16 px, 44 px Höhe, 4,5:1 Kontrast
  4. Actual: 14 px, 32 px Höhe, der markierte Eintrag hat nur 2,18:1
- **Priority:** Fix before deployment

#### BUG-3: Lange Namen und E-Mail-Adressen werden abgeschnitten
- **Status:** Behoben. Das Namensfeld wächst mit, die E-Mail steht als feste Textzeile im Feld, die Nutzerliste bricht um
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Mit einer langen Adresse den Persönlichen Bereich oder die Nutzerliste am Handy öffnen
  2. Expected: Der Text bricht um
  3. Actual: Die Felder schneiden ihn ab, die Nutzerliste kürzt ihn mit „…". Auf dem Handy betrifft das schon Adressen mit rund 36 Zeichen
- **Priority:** Fix before deployment

#### BUG-4: Bestätigungsmeldungen sind nur 13 px groß
- **Status:** Offen, von Jakob am 2026-11-23 vorerst zurückgestellt
- **Severity:** Low
- **Steps to Reproduce:** Im Persönlichen Bereich den Namen speichern. Die Meldung „Name gespeichert." ist 13 px groß, verlangt sind mindestens 16 px
- **Priority:** Nice to have

#### BUG-5: Fokusrahmen der Buchkarte ist teilweise verdeckt
- **Status:** Offen, von Jakob am 2026-11-23 vorerst zurückgestellt
- **Severity:** Low
- **Steps to Reproduce:** Auf der Startseite mit der Tab-Taste zu einer Karte gehen. Der Rahmen ist nur um die untere Hälfte sichtbar, die Buchfläche liegt darüber
- **Priority:** Nice to have

#### BUG-6: Aktives Navigationssymbol hat zu wenig Kontrast
- **Status:** Offen, von Jakob am 2026-11-23 vorerst zurückgestellt
- **Severity:** Low
- **Steps to Reproduce:** Das aktive Symbol in der Navigation ist weiß auf Salbei und erreicht rund 2,2:1. WCAG verlangt für Symbole 3:1. Der Entwurf zeigt es dunkel
- **Priority:** Nice to have

### Hinweise für andere Features

- **PROJ-24 Onboarding:** Die Schrittnummern sind auf dem Handy 14 px groß und erreichen nur 2,19:1 bis 3,74:1. Das Onboarding gehört nicht zu den drei Seiten dieses Features.
- **PROJ-8 Bibliothek:** Im Lesemodus ist „Erzähl-Impulse ansehen" gesperrt, weil der bisherige Dialog ein Kapitel anlegt. Die Bibliothek sollte dort zum Ansehen offen bleiben.

### Automatisierte Tests

- Nachtest nach den Fixes: alle 40 Dialog-Prüfungen in vier Größen ohne Befund, die drei Seiten in sieben Größen ohne Befund
- Typprüfung und Lint ohne Fehler, Unit-Tests 765/765
- E2E: 170 Standard, 50 Lesemodus, Papierkorb und Zugriffsregeln, 14 Aufbewahrung, 25 neu für PROJ-22 (`tests/PROJ-22-design-grundlage.spec.ts`, Start mit `E2E_DESIGN=1`)
- Temporäre Konten und Projekte wurden nach jedem Lauf gelöscht. Das QA-Konto blieb erhalten, es wurden keine Mails ausgelöst

### Summary

- **Acceptance Criteria:** 37/38 passed (AC-6 offen wegen BUG-4)
- **Bugs Found:** 6 total (0 critical, 1 high, 2 medium, 3 low). High und Medium sind behoben, die 3 Low-Bugs hat Jakob zurückgestellt
- **Security:** Pass
- **Production Ready:** YES für Stage. Vor dem Go-live fehlen die Prüfung in Safari und Firefox und die Lösung für die Druck-Karte (Umzugsliste, Abschnitt 9)
- **Recommendation:** Committen und auf Stage prüfen

## Deployment
_To be added by /deploy_
