# PROJ-22: Design-Grundlage der Web-App

> **Kurzfassung (PROJ-31).** Das vollständige Tech Design, Bau-Notizen, QA-Protokolle und der Deployment-Verlauf stehen unverändert im [Archiv](archive/PROJ-22-design-grundlage.md).

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

## Technische Entscheidungen
_Kurzform. Die vollständige Begründung steht im Archiv._

### C) Technische Entscheidungen

1. **Schriften an einer zentralen Stelle.** Überschriften werden einmal festgelegt statt in jeder Datei. So bleiben App und Website dauerhaft gleich.
2. **Die neue Überschriftenschrift gilt für die ganze App.** Dazu zählen auch Anmeldung, Registrierung, Onboarding, Kauf und Einladung, sonst würde der Stil zwischen den Seiten springen.
3. **Das Buch bleibt ausgenommen.** Cover, Kapitelseiten und der Kapitel-Editor behalten Merriweather, damit sich Seitenumbrüche und Druck nicht verschieben.
4. **Eine Buchansicht für alle Stellen.** Sie nutzt die vorhandene Cover-Darstellung und legt nur den Rücken daneben. Die Cover-Daten und das spätere Druck-PDF bleiben unberührt.
5. **Kapitel- und Nutzerliste werden nicht neu gebaut.** Drag and Drop, Umbenennen, Löschen und Einladen bleiben im vorhandenen Code.
6. **Persönlicher Bereich: nur umordnen.** Name, Passwort und der Lösch-Ablauf behalten ihre Logik.
7. **Die Druck-Karte liegt außerhalb der Lesemodus-Sperre.** PROJ-28 verlangt, dass der Druckauftrag auch in den 90 Tagen nach Ablauf möglich bleibt.
8. **Der Markenname ist ein eigener Baustein.** So steht NARRAVIT in jeder Überschrift automatisch in Merriweather und muss nicht an jeder Stelle einzeln gepflegt werden.

### Spätere Entscheidungen
- **Nachträge von Jakob (2026-11-23):** Das Buch-Element auf der Startseite bekommt einen deutlichen Schatten. Der Abschnitt heißt „Weiteres Buchprojekt beginnen“, der Button „Weiteren Projektzugang sichern“. Die Nutzerliste heißt „Wer an diesem Buch beteiligt ist“. Über dem Titel der großen Karte steht „Ihr Projekt“.
- **Keine Projekte:** Weiterleitung ins Onboarding, dort nur noch der Link „Zum persönlichen Bereich“ (Jakob, 2026-11-23).
- Der Button heißt weiter „Name speichern“. Die Autorenzeile steht wie im Cover eingegeben, ohne vorangestelltes „von“.

## Offene Punkte
- BUG-4 (Low): Bestätigungsmeldungen sind nur 13 px groß, deshalb bleibt AC-6 offen. Von Jakob am 2026-11-23 zurückgestellt.
- BUG-5 (Low): Der Fokusrahmen der Buchkarte ist teilweise verdeckt. Zurückgestellt.
- BUG-6 (Low): Das aktive Navigationssymbol hat zu wenig Kontrast (rund 2,2:1). Zurückgestellt.
- Hinweis für PROJ-24: Die Schrittnummern sind auf dem Handy 14 px groß und erreichen nur 2,19:1 bis 3,74:1.
- Hinweis für PROJ-8: Im Lesemodus ist „Erzähl-Impulse ansehen“ gesperrt. Die Bibliothek sollte dort zum Ansehen offen bleiben.
- Die Druck-Karte zählt ein Kapitel ohne Wörter als offen, auch wenn es nur Bilder enthält. Das wird mit PROJ-16 genauer.
- Vor dem Go-live: Prüfung in Safari und Firefox, Lösung für die Druck-Karte (Umzugsliste, Abschnitt 9).

## Nachtrag 2026-11-24
- Der Bereich „Wer an diesem Buch beteiligt ist“ in der Projektübersicht hat sein Personen-Symbol zurück, wie die anderen Abschnitte (Hinweis von Jakob). Es fehlte seit dem Umbau der Mitgliederverwaltung.
- Onboarding-Texte nach Jakobs Vorgabe: „Da Sie selbst keinen Zugang möchten, wird die beschenkte Person das Projekt eigenständig verwalten.“ und „Ihr gedrucktes Hardcover-Buch, …“ ohne „erstes“.
- Letzte Onboarding-Seite: Kauft man angemeldet ein Geschenk, entfällt der Untertitel „Mit dem Kauf schalten wir Ihr Projekt frei und Sie können sofort loslegen.“ (Jakob: passt bei einem Geschenk nicht). Beim Kauf für sich selbst und für Gäste bleiben die Untertitel. Test: `src/app/onboarding/WizardSteps.test.tsx`.
