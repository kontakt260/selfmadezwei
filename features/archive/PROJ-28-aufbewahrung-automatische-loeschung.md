# PROJ-28: Aufbewahrung, Lesemodus und automatische Löschung

## Status: Approved
**Created:** 2026-11-22
**Last Updated:** 2026-11-23

## Dependencies
- Requires: PROJ-5 (Kapitel-Editor) und PROJ-10 (Cover-Editor): Beide brauchen einen Lesemodus
- Requires: PROJ-6 (Zahlungen): Ablaufdatum, Verlängerung und Schreibschutz in der Datenbank (G6)
- Requires: PROJ-9 (Mitglieder): Einladen wird im Lesemodus gesperrt
- Requires: PROJ-11 (Transaktionsmails): Die vorhandenen Erinnerungen bekommen korrekte Texte
- Requires: PROJ-26 (Papierkorb): Fällige Projekte landen dort, Wiederherstellen läuft über den Support
- Requires: PROJ-3 (Konto-Löschen): Löst dort BUG-4 (nie angenommene Geschenke bleiben für immer liegen)
- Später: PROJ-16 (Druck): Druckauftrag im Lesemodus, ein laufender Auftrag hält die Löschung an

## Entscheidungen von Jakob (2026-11-22)

1. Projekte laufen mit dem Projektzugang aus, auch nie angenommene Geschenke und Projekte, deren Schenker sein Konto gelöscht hat.
2. **Keine neuen Mails.** Es bleibt bei den Erinnerungen 30 und 7 Tage vor dem Ablauf. Am Ablauftag und danach kommt keine Mail mehr.
3. Das Projekt bleibt nach dem Ablauf **90 Tage sichtbar**, mit allen Screens und auf dem letzten Stand. Alle Buttons, die etwas verändern, sind ausgegraut.
4. Im Zugangsfeld steht „Abgelaufen am [Datum]", darunter nur der kurze Hinweis, dass das Projekt 90 Tage nach dem Ablauf gelöscht wird.
5. Ein Druckauftrag bleibt in diesen 90 Tagen möglich. Das Menü mit Lieferadresse und Bestellung des bereits bezahlten Buchs entsteht in PROJ-16.
6. Am Tag 90 kommt das Projekt zuerst **in den Papierkorb**. Endgültig weg ist es nach weiteren 14 Tagen, also nach 104 Tagen.

## User Stories

- Als Person mit abgelaufenem Zugang möchte ich mein Projekt weiter ansehen können, damit ich sehe, was ich geschrieben habe, und in Ruhe entscheiden kann.
- Als Person mit abgelaufenem Zugang möchte ich klar erkennen, seit wann der Zugang abgelaufen ist und dass das Projekt später gelöscht wird.
- Als Projektleitung möchte ich jederzeit bis zur Löschung verlängern und sofort weiterarbeiten können.
- Als Käufer möchte ich mein bereits bezahltes Buch auch nach dem Ablauf noch in den Druck geben können.
- Als Person, die sich zu spät meldet, möchte ich mein Projekt über den Support noch retten können.
- Als Betreiber möchte ich, dass abgelaufene Projekte und ihre Dateien automatisch verschwinden, damit keine persönlichen Daten unbegrenzt gespeichert bleiben.
- Als Betreiber möchte ich, dass ein Fehler im Löschlauf nie viele Kundenprojekte auf einmal entfernt.

## Acceptance Criteria

### A. Fristen

- [x] AC-1: Das Löschdatum eines Projekts ist sein Ablaufdatum plus 90 Tage.
- [x] AC-2: Aktive Projekte und Projekte ohne Ablaufdatum werden nie automatisch gelöscht.
- [x] AC-3: Eine Verlängerung vor dem Löschdatum hebt die Löschung auf. Es gilt die Frist ab dem neuen Ablaufdatum.

### B. Lesemodus

- [x] AC-4: Ein abgelaufenes Projekt bleibt bis zum Löschdatum auf der Startseite und in der Projektübersicht sichtbar. Niemand wird mehr auf die Seite „Zugang abgelaufen" umgeleitet, alte Links führen zur Startseite.
- [x] AC-5: Kapitel-Editor und Cover-Editor lassen sich öffnen und zeigen Text, Bilder und Cover auf dem letzten Stand.
- [x] AC-6: Ausgegraut und ohne Wirkung sind: Kapitel anlegen, Erzähl-Impuls, Kapitel umbenennen, löschen und sortieren, Text, Titel, Bilder, Cover sowie neue Einladungen.
- [x] AC-7: Aktiv bleiben: Verlängern, Projekt verlassen, Mitglied entfernen, Projekt löschen und Konto löschen.
- [x] AC-8: Im Lesemodus läuft kein Autosave. Das Projekt bleibt unverändert, auch bei direkten Aufrufen an der Oberfläche vorbei.
- [x] AC-9: Nach einer Verlängerung lässt sich das Projekt sofort wieder bearbeiten, ohne dass Inhalte fehlen.

### C. Zugangsfeld

- [x] AC-10: Das Zugangsfeld zeigt bei einem abgelaufenen Projekt „Abgelaufen am [Datum]".
- [x] AC-11: Darunter steht nur: „90 Tage nach dem Ablauf wird das Projekt gelöscht."
- [x] AC-12: Der Button zum Verlängern bleibt im Zugangsfeld aktiv.

### D. Mails

- [x] AC-13: Es gibt keine neuen Mails. Am Ablauftag, in den 90 Tagen danach und beim Löschen wird nichts verschickt.
- [x] AC-14: Die vorhandenen Erinnerungen 30 und 7 Tage vor dem Ablauf sagen korrekt, dass das Projekt danach noch 90 Tage lesbar bleibt und dann gelöscht wird. Die falsche Aussage „kurzzeitig den Zugriff verlieren" entfällt.

### E. Automatische Löschung

- [x] AC-15: Am Löschdatum kommt das Projekt in den Papierkorb aus PROJ-26 und verschwindet für alle Mitglieder.
- [x] AC-16: Nach weiteren 14 Tagen werden Projekt, Kapitel und alle Dateien endgültig entfernt.
- [x] AC-17: Das gilt auch für nie angenommene Geschenke und für Projekte ohne Mitglieder oder Eigentümer.
- [x] AC-18: Der Support erkennt in der Suche, dass ein Projekt automatisch wegen Ablauf gelöscht wurde.
- [x] AC-19: Zahlungsdaten bleiben wegen der gesetzlichen Aufbewahrung erhalten, nur der Verweis auf das gelöschte Projekt entfällt.

### F. Verlängerung und Support

- [x] AC-20: Stellt der Support ein automatisch gelöschtes Projekt wieder her, haben die Mitglieder 14 Tage Zeit zu verlängern, bevor es erneut gelöscht wird.
- [x] AC-21: Eine Zahlung, die gleichzeitig mit dem Löschlauf eintrifft, geht nie verloren. Sie wird gebucht, und das Projekt bleibt erhalten oder der Support bekommt einen Hinweis.

### G. Sicherheit

- [x] AC-22: Ein Lauf löscht höchstens 50 Projekte. Sind mehr fällig, löscht er keines davon und schickt dem Support einen Hinweis ohne personenbezogene Daten.
- [x] AC-23: Der Lauf lässt sich gefahrlos wiederholen. Ein Fehler bei einem Projekt hält die anderen nicht auf.
- [x] AC-24: Kunden können die Löschung weder auslösen noch verschieben, auch nicht direkt über die API.

## Vorgaben für PROJ-16 (Druck)

- Im Projekt entsteht ein Menüpunkt mit Lieferadresse und Druckauftrag, über den das bereits bezahlte Buch bestellt wird.
- Dieser Druckauftrag bleibt auch im Lesemodus bis zum Löschdatum aktiv.
- Ein weiterer Auftrag soll möglich sein, die Bedingungen dafür klärt PROJ-16.
- Ein laufender Druckauftrag hält die automatische Löschung an, bis er abgeschlossen ist.

## Edge Cases

- **Verlängerung am letzten Tag:** Vor dem Löschdatum gewinnt die Verlängerung, auch wenn der Lauf am selben Tag startet.
- **Zahlung nach dem Übergang in den Papierkorb:** Die Zahlung bleibt gebucht und holt das Projekt automatisch zurück. Nur wenn das nicht geht, etwa ohne Projektleitung, bekommt der Support den Hinweis aus PROJ-26.
- **Zugang läuft ab, während jemand im Editor schreibt:** Das nächste Speichern scheitert sichtbar, der Text bleibt im Browser stehen. Nach dem Neuladen zeigt der Editor den Lesemodus.
- **Mehrere Projekte, eines abgelaufen:** Nur dieses Projekt ist im Lesemodus, die anderen bleiben normal bearbeitbar.
- **Alle Projekte abgelaufen:** Die Startseite zeigt sie im Lesemodus, niemand landet im Onboarding.
- **Projekt hat keine Mitglieder:** Die Löschung läuft ohne Mail am Löschdatum.
- **Mitglied löscht sein Konto während der Frist:** Sind noch andere im Projekt, läuft die Frist für sie weiter.
- **Projekt liegt schon im Papierkorb:** Der Lauf fasst es nicht noch einmal an, die 14 Tage laufen unverändert weiter.
- **Ablaufdatum wird nachträglich verlängert (Support):** Die neue Frist gilt.

## Nicht in diesem Feature

- Neue Warn- oder Ablaufmails
- Der Druckauftrag selbst (PROJ-16)
- Andere Fristen je Produkt oder Kunde
- Export oder Kopie vor der Löschung
- Aufräumen alter verwaister Dateien auf Stage

## Technical Requirements

- **Sicherheit:** Der Schreibschutz bleibt serverseitig und in der Datenbank (PROJ-6 G6). Ausgegraute Buttons sind nur die Anzeige dazu.
- **Zuverlässigkeit:** Die Löschung läuft im vorhandenen täglichen Cron und bleibt bei Teilfehlern wiederholbar.
- **Mails:** Textänderungen vorher mit der Figma-Datei abgleichen, weil Jakob dort parallel arbeitet.
- **Oberfläche:** Bestehende Screens wiederverwenden, Tablet und Desktop wie bisher.
- **Migration:** Falls nötig, spielt Jakob sie im SQL-Editor ein, SQL zum Kopieren in reinem ASCII.

## Rechtliche Prüfpunkte vor dem Go-live

- **Datenschutzerklärung:** Sie muss die Speicherdauer nennen: Ablauf plus 90 Tage, danach bis zu 14 Tage bis zur endgültigen Löschung (Art. 13 Abs. 2 lit. a DSGVO).
- **AGB:** Die Löschung nach Ablauf und der Lesemodus sollten dort stehen, gehört zur anwaltlichen Beratung (PROJ-27).
- **Rechnungs- und Zahlungsdaten:** Aufbewahrungsfristen mit Steuerberatung oder Anwalt bestätigen.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

> Von Jakob am 2026-11-22 freigegeben, inklusive der neuen Texte. Geprüft am vorhandenen Code und am Schema von Stage, noch nicht als Prototyp getestet.

### A) Aufbau

```
Projekt läuft ab
|
+-- Tag 0 bis 90: Lesemodus
|   +-- Startseite: Projekt bleibt wie gewohnt sichtbar
|   +-- Projektübersicht
|   |   +-- Kapitelliste: ansehen und öffnen, alles andere ausgegraut
|   |   +-- Cover: Vorschau und Öffnen
|   |   +-- Zugangsfeld: „Abgelaufen am [Datum]", Hinweis, Verlängern aktiv
|   |   +-- Mitglieder: Einladen ausgegraut, Entfernen und Verlassen aktiv
|   +-- Kapitel-Editor: Text und Bilder sichtbar, Werkzeuge ausgegraut
|   +-- Cover-Editor: Gestaltung sichtbar, Felder ausgegraut
|
+-- Tag 90: täglicher Lauf legt das Projekt in den Papierkorb
|   +-- Sicherheitsbremse: mehr als 50 fällig, dann nichts löschen und Support informieren
|
+-- Tag 104: vorhandener Papierkorb-Lauf löscht Inhalte und Dateien endgültig
```

### B) Datenmodell

**Papierkorb für Projekte (erweitert):** bekommt zusätzlich den Grund der Löschung, also „durch Kunden" oder „wegen Ablauf". Der Support sieht ihn in der Suche.

**Schonfristen (neu):** Projekt, Datum, bis zu dem es nicht automatisch gelöscht wird, und Grund. Kunden haben darauf keinen Zugriff. Genutzt wird das für die 14 Tage nach einer Rettung durch den Support und später für laufende Druckaufträge aus PROJ-16.

Das Ablaufdatum selbst bleibt unverändert in der vorhandenen Zugangstabelle. Das Löschdatum wird daraus berechnet und nicht extra gespeichert, damit beide nie auseinanderlaufen.

### C) Technische Entscheidungen

1. **Ein zentraler Zugangsstatus.** Der Server bestimmt pro Projekt „aktiv" oder „abgelaufen" und gibt das an alle Screens weiter. So kann kein Screen etwas anderes anzeigen.
2. **Eine Sperre pro Screen statt jedes Knopfs einzeln.** Dadurch kann bei künftigen Funktionen kein Button versehentlich aktiv bleiben.
3. **Autosave ist im Lesemodus komplett aus.** Der Editor speichert sonst schon beim Öffnen die berechnete Seitenzahl und würde bei abgelaufenen Projekten jedes Mal „Fehler beim Speichern" zeigen.
4. **Der Schutz bleibt in der Datenbank.** Die Regeln aus PROJ-6 sperren das Schreiben bereits. Ausgegraute Buttons sind nur die Anzeige dazu.
5. **Die Seite „Zugang abgelaufen" wird zur Weiterleitung auf die Startseite.** So laufen alte Links nicht ins Leere.
6. **Die Löschung läuft im vorhandenen täglichen Cron**, direkt vor dem Papierkorb-Lauf. Es entsteht kein neuer Dienst.
7. **Die Bremse gilt ganz oder gar nicht.** Sind mehr als 50 Projekte fällig, wird keines angefasst. Nach einer Prüfung gibt der Support den Lauf einmalig über die Anleitung frei.
8. **Eine Zahlung gewinnt immer.** Vor dem Löschen prüft die Datenbank das Ablaufdatum unter Sperre noch einmal. Kommt die Zahlung zuerst, bleibt das Projekt. Kommt sie danach, holt sie das Projekt automatisch aus dem Papierkorb zurück (QA-Fix BUG-2).

### D) Zugriffsregeln

- **Keine bestehende RLS-Regel ändert sich.**
- **Neu:** eine Tabelle für Schonfristen ohne jeden Kundenzugriff.

### E) Stolperstellen, die der Bau mit löst

| Stelle | Folge ohne Fix |
|---|---|
| Autosave im Kapitel- und Cover-Editor | Fehlermeldung schon beim Öffnen eines abgelaufenen Projekts |
| Zugangsfeld rechnet nur nach vorn | Es würde „-5 Tagen" anzeigen |
| Anzeige hängt am Erstkauf-Eintrag | Der Lesemodus muss das echte Ablaufdatum nutzen, sonst bliebe ein abgelaufenes Projekt scheinbar bearbeitbar |
| Text in den Erinnerungsmails | Sie erwähnen die Löschung nicht, obwohl sie jetzt die einzige Warnung sind |
| Rettung durch den Support | Ohne Schonfrist würde der nächste Lauf das Projekt sofort wieder löschen |
| Bestehende Tests erwarten die Umleitung | Sie werden auf den Lesemodus umgestellt |

### F) Neue Texte (von Jakob freigegeben)

**Zugangsfeld:** „Abgelaufen am 12. März 2027" und darunter „90 Tage nach dem Ablauf wird das Projekt gelöscht."

**Erinnerung, Schlussabsatz (beide Mails):** „Falls Sie das Projekt nicht weiterführen möchten, müssen Sie nichts unternehmen. Der Zugang läuft dann aus. Ihr Projekt bleibt danach noch 90 Tage lesbar und wird anschließend gelöscht."

**7-Tage-Mail, Einleitung:** „Nur noch [X] Tage: Ihr Projektzugang läuft am unten genannten Datum ab. Wenn Sie weiter am Projekt arbeiten möchten, verlängern Sie den Zugang bitte rechtzeitig."

Die Mail-Texte werden vor dem Einbau mit der Figma-Datei abgeglichen.

### G) Grenzen

- Auf dem Handy bleibt der Kapitel-Editor wie bisher nicht verfügbar. Dort sind Übersicht und Zugangsfeld sichtbar.
- Der Druckauftrag kommt erst mit PROJ-16. Die Schonfristen sind dafür schon vorbereitet.

### H) Abhängigkeiten und Einspielen

- **Neue Pakete:** keine
- **Neue Env-Variablen:** keine
- **Migration:** eine, von Jakob im SQL-Editor, reines ASCII, **vor** dem Code-Deploy
- **Tests:** Datenbank-Szenarien, Unit-Tests für Status und Löschlauf, E2E für Lesemodus, Verlängerung, Bremse und gleichzeitige Zahlung

## Implementation Notes (Frontend, 2026-11-23)

**Gebaut:**
- Abgelaufene Projekte werden nicht mehr auf „Zugang abgelaufen" umgeleitet. Die alte Adresse führt zur Startseite.
- Projektübersicht, Kapitel-Editor und Cover-Editor bleiben sichtbar. Ein zentraler Lesemodus-Bereich sperrt alle verändernden Bedienelemente, das automatische Speichern ist aus.
- Aktiv bleiben Verlängern, Projekt verlassen, Mitglied entfernen, Projekt löschen und Konto löschen.
- Das Zugangsfeld zeigt „Abgelaufen am [Datum]" und den Hinweis auf die Löschung nach 90 Tagen. Der Verlängern-Button ist dort farbig, damit er sich klar von den gesperrten Buttons abhebt.
- Beide Erinnerungsmails haben die freigegebenen Texte.

**Geprüft auf lokalem Production-Build gegen Stage:** Typecheck, Lint ohne Fehler, 716 Unit-Tests, Lesemodus 11/11, Papierkorb und Zugriffsregeln 39/39, Regression 171 bestanden und 0 fehlgeschlagen. Desktop, Tablet und Handy ohne seitliches Scrollen.

**Nebenbei behoben:** Der Test PROJ-5 AC-Img-1 lud die Seite neu, bevor das automatische Speichern gelaufen war, und schlug dadurch etwa jedes dritte Mal fehl. Er wartet jetzt auf „Gespeichert" (5/5 Wiederholungen).

**Wortlaut (Jakob, 2026-11-23):** Das Zugangsfeld und die Hinweise sagen „abgelaufen", nicht „ausgelaufen". Der freigegebene Mailsatz „Der Zugang läuft dann aus" bleibt.

## Implementation Notes (Backend, 2026-11-23)

**Gebaut:**
- Migration `20261123100000_proj28_retention.sql`, auf Stage eingespielt. Bestehende RLS-Regeln sind unverändert.
- Der Papierkorb speichert den Grund der Löschung (`customer` oder `expired`), die Support-Suche zeigt ihn.
- Neue Tabelle für Schonfristen ohne Kundenzugriff, vorbereitet für Support-Rettung und später für Druckaufträge (PROJ-16).
- Der tägliche Cron verschiebt fällige Projekte vor dem Papierkorb-Lauf. Jedes Projekt wird unter Sperre noch einmal geprüft, ein Fehler bei einem Projekt hält die anderen nicht auf.
- Bremse: Bei mehr als 50 fälligen Projekten wird keines verschoben, `kontakt@narravit.de` bekommt täglich einen Hinweis ohne personenbezogene Daten. Der Support gibt einen Lauf einmalig frei, indem er die genaue Anzahl bestätigt (`docs/production/support-papierkorb.md`, Abschnitt 7).
- Nach einer Support-Rettung gelten 14 Tage Schonfrist. Das gilt auch für von Kunden gelöschte Projekte, deren Löschdatum in weniger als 14 Tagen erreicht wäre.

**Geprüft:**
- Lokale Datenbank mit allen echten Migrationen: 60 neue Szenarien, dazu Papierkorb 89, Zugriffsregeln 48, Konto-Löschen 53.
- Stage-Datenbank: Löschlauf 7/7, darunter 25 Runden gleichzeitiger Zahlung (20 Mal kam die Zahlung zuerst, 5 Mal der Lauf, nie ging eine Zahlung verloren) und drei parallele Läufe.
- Typecheck, Lint ohne Fehler, 725 Unit-Tests, Regression 171 bestanden und 0 fehlgeschlagen, Lesemodus, Papierkorb und Zugriffsregeln 50/50.
- Auf Stage sind danach keine Testkonten, Testprojekte oder Testzahlungen übrig, das QA-Konto ist unverändert.

**Nicht geprüft:**
- Die echte Cron-Route lief nicht, um keine Erinnerungen auszulösen. Ihre Reihenfolge ist per Unit-Test abgesichert.
- Der echte Stripe-Webhook lief nicht, weil lokal sein Secret fehlt. Der Test führt dieselben Datenbankschritte in derselben Reihenfolge aus.
- Die Bremse ist nur lokal geprüft, die Hinweis-Mail nur als Unit-Test und nicht wirklich versendet.

**Noch offen:**
- **Frontend und Backend nur gemeinsam live nehmen**, weil das Zugangsfeld die Löschung ankündigt.
- Figma-Frames 08 und 09 enthalten noch den alten Mailtext.

## QA Test Results

**Stand:** 2026-11-23, lokaler Production-Build gegen die Stage-Datenbank, Chromium.
**Ergebnis:** 24 von 24 Akzeptanzkriterien bestanden. Die QA fand 6 Bugs (2 High, 1 Medium, 3 Low), alle sind behoben und nachgetestet.
**Produktionsreif:** Ja, es sind keine Critical- oder High-Bugs offen. Die Punkte unter „Nicht geprüft" stehen vor dem Go-live noch aus.

### Akzeptanzkriterien

| AC | Ergebnis | Nachweis |
|---|---|---|
| AC-1 bis AC-3 Fristen | Bestanden | Stage und lokale Datenbank |
| AC-4, AC-5 Sichtbarkeit | Bestanden | Browser |
| AC-6 Gesperrte Aktionen | Bestanden | Browser und direkte API-Aufrufe (nach Fix BUG-1) |
| AC-7 Aktive Aktionen | Bestanden | Entfernen, Verlassen und Projekt löschen im Browser, Konto-Löschen in der lokalen Datenbank |
| AC-8 Keine Änderung | Bestanden | Browser und direkte API-Aufrufe (nach Fix BUG-1) |
| AC-9 Nach Verlängerung | Bestanden | Browser |
| AC-10 bis AC-12 Zugangsfeld | Bestanden | Browser. Der echte Stripe-Checkout lief nicht, lokal fehlt der Schlüssel |
| AC-13 Keine neuen Mails | Bestanden | Kein Eintrag im Mail-Protokoll nach dem Lauf |
| AC-14 Erinnerungstexte | Bestanden | Unit-Test beider Mails |
| AC-15 bis AC-19 Löschung | Bestanden | Stage und lokale Datenbank |
| AC-20 Rettung durch Support | Bestanden | Stage |
| AC-21 Gleichzeitige Zahlung | Bestanden | 25 Runden auf Stage, das bezahlte Projekt bleibt immer erhalten (nach Fix BUG-2) |
| AC-22 Bremse | Bestanden | Lokale Datenbank und Unit-Test |
| AC-23, AC-24 Wiederholung, Schutz | Bestanden | Stage |

### Bugs

**BUG-1 (High, behoben): Im Lesemodus lassen sich Kapitel und Dateien per API löschen.**
- Schritte: Als Mitglied eines abgelaufenen Projekts mit dem eigenen Login direkt `DELETE` auf `chapters` oder Storage `remove` auf `chapter-heroes`, `project-covers` oder `project-logos` aufrufen.
- Erwartet: Nichts ändert sich (AC-6, AC-8). Tatsächlich: Das Kapitel landet im Papierkorb, die Datei ist **sofort und endgültig weg**.
- Ursache: Die Sperre aus PROJ-6 G6 gilt nur für Anlegen und Ändern.
- Vorschlag: Zwei zusätzliche RESTRICTIVE-Regeln für `DELETE`. **Änderung an RLS, braucht Jakobs Freigabe.** Projekt löschen, Verlassen und Konto-Löschen bleiben davon unberührt.

**BUG-2 (High, behoben): Ein bezahltes Projekt wird nach 14 Tagen trotzdem endgültig gelöscht.**
- Schritte: Projekt kommt am Tag 90 in den Papierkorb, kurz danach trifft die Verlängerung ein, 14 Tage später läuft der Papierkorb-Lauf.
- Erwartet: Das bezahlte Projekt bleibt erhalten. Tatsächlich: Es ist endgültig weg. Einziger Schutz ist eine Support-Mail, die bei einem Versandfehler nicht wiederholt wird.
- Vorschlag: Trifft eine Zahlung für ein wegen Ablauf verschobenes Projekt ein, stellt der Server es automatisch wieder her. Der Papierkorb-Lauf löscht zusätzlich nie ein solches Projekt mit gültigem Zugang.

**BUG-3 (Medium, behoben): Nach Tag 90 fehlt der Weg zum Konto.**
- Schritte: Eine Person, deren einziges Projekt automatisch entfernt wurde, meldet sich an.
- Erwartet: Sie kann ihr Konto finden und löschen. Tatsächlich: Sie landet im Onboarding ohne Link. Die Adresse `/persoenlicher-bereich` funktioniert nur, wenn man sie kennt.
- Ursache: Der Link hängt an einem Merker, den nur das manuelle Löschen eines Projekts setzt.
- Vorschlag: Der Link erscheint für alle angemeldeten Personen ohne Projekt.

**BUG-4 (Low, behoben): Bestätigungsmail trotz Papierkorb.** Wer für ein Projekt im Papierkorb bezahlt, bekommt „verlängert", kann das Projekt aber nicht öffnen. Erledigt sich für abgelaufene Projekte mit dem Fix von BUG-2.

**BUG-5 (Low, behoben): Hinweis nach einer Support-Rettung stimmt nicht mehr.** Das Zugangsfeld sagt weiter „90 Tage nach dem Ablauf wird das Projekt gelöscht", obwohl die 90 Tage vorbei sind und jetzt die 14 Tage Schonfrist gelten.

**BUG-6 (Low, behoben): Projektübersicht wirkt bei einem Lesefehler bearbeitbar.** Schlägt die Abfrage des Zugangs fehl, sind die Buttons aktiv. Die Editoren sperren in diesem Fall, und das Speichern blockiert der Server trotzdem.

### Sicherheits-Audit

- Kunden können den Löschlauf weder auslösen noch verschieben, keine Schonfrist setzen und den Papierkorb weder lesen noch wiederherstellen (AC-24).
- Nach dem Verschieben sind Projekt, Kapitel, Cover, Zugang und Dateien für frühere Mitglieder nicht mehr erreichbar.
- Rollen und Ablaufdatum lassen sich nicht selbst ändern.
- Supabase-Advisor: Neu ist nur der erwartete Info-Hinweis, dass die Schonfristen-Tabelle keine Kundenregeln hat.
- BUG-1 ist mit zwei zusätzlichen RESTRICTIVE-Regeln behoben, von Jakob am 2026-11-23 freigegeben.

### Weitere Prüfungen

- Grenzfälle: Konto-Löschen während der Frist, mit Nachfolge, allein im Projekt und bei Projekten im Papierkorb bestanden. Eine offene Einladung lässt sich im Lesemodus annehmen.
- Gleichzeitigkeit: 25 Runden Zahlung gegen Löschlauf, in beide Reihenfolgen. Drei parallele Läufe verschieben jedes Projekt genau einmal.
- Automatisch: Typecheck, Lint ohne Fehler, 744 Unit-Tests, Regression 171 bestanden und 0 fehlgeschlagen, PROJ-28-QA und Löschlauf 14/14, Lesemodus, Papierkorb und Zugriffsregeln 50/50.
- Responsive: 1440, 768 und 375 Pixel ohne seitliches Scrollen.

### Nachtest nach den Fixes (2026-11-23)

- Migration `20261123110000_proj28_qa_fixes.sql` ist auf Stage eingespielt.
- BUG-1: Co-Autor und Projektleitung können im Lesemodus weder Kapitel noch Dateien löschen. In aktiven Projekten geht es weiter, Projekt löschen und Verlassen bleiben möglich.
- BUG-2 und BUG-4: Eine Zahlung holt das Projekt zurück, in 25 Runden lag danach kein bezahltes Projekt im Papierkorb (15 Mal kam die Zahlung zuerst, 10 Mal der Lauf). Der Papierkorb-Lauf löscht es nicht. Von Personen gelöschte Projekte bleiben beim Support, die Person bekommt keine irreführende Bestätigung.
- BUG-3: Personen ohne Projekt sehen im Onboarding den Link zum persönlichen Bereich.
- BUG-5: Nach einer Rettung steht im Zugangsfeld „Das Projekt wird am [Datum] gelöscht.".
- BUG-6: Die Projektübersicht bleibt bei einem Lesefehler gesperrt (Unit-Test).

### Nicht geprüft

- Safari und Firefox. Mobile Safari startet auf diesem Mac nicht, Firefox ist nicht installiert. Vor dem Go-live den Lesemodus einmal in Safari prüfen.
- Echter Stripe-Checkout und Webhook, echte Cron-Route, echter Versand der Bremsen-Mail.

## Deployment
_To be added by /deploy_
