# PROJ-28: Aufbewahrung, Lesemodus und automatische Löschung

> **Kurzfassung (PROJ-31).** Das vollständige Tech Design, Bau-Notizen, QA-Protokolle und der Deployment-Verlauf stehen unverändert im [Archiv](archive/PROJ-28-aufbewahrung-automatische-loeschung.md).

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

## Technische Entscheidungen
_Kurzform. Die vollständige Begründung steht im Archiv._

### C) Technische Entscheidungen

1. **Ein zentraler Zugangsstatus.** Der Server bestimmt pro Projekt „aktiv" oder „abgelaufen" und gibt das an alle Screens weiter. So kann kein Screen etwas anderes anzeigen.
2. **Eine Sperre pro Screen statt jedes Knopfs einzeln.** Dadurch kann bei künftigen Funktionen kein Button versehentlich aktiv bleiben.
3. **Autosave ist im Lesemodus komplett aus.** Der Editor speichert sonst schon beim Öffnen die berechnete Seitenzahl und würde bei abgelaufenen Projekten jedes Mal „Fehler beim Speichern" zeigen.
4. **Der Schutz bleibt in der Datenbank.** Die Regeln aus PROJ-6 sperren das Schreiben bereits. Ausgegraute Buttons sind nur die Anzeige dazu.
5. **Die Seite „Zugang abgelaufen" wird zur Weiterleitung auf die Startseite.** So laufen alte Links nicht ins Leere.
6. **Die Löschung läuft im vorhandenen täglichen Cron**, direkt vor dem Papierkorb-Lauf. Es entsteht kein neuer Dienst.
7. **Die Bremse gilt ganz oder gar nicht.** Sind mehr als 50 Projekte fällig, wird keines angefasst. Nach einer Prüfung gibt der Support den Lauf einmalig über die Anleitung frei.
8. **Eine Zahlung gewinnt immer.** Vor dem Löschen prüft die Datenbank das Ablaufdatum unter Sperre noch einmal.

### Spätere Entscheidungen
- **Wortlaut (Jakob, 2026-11-23):** Das Zugangsfeld und die Hinweise sagen „abgelaufen“, nicht „ausgelaufen“. Der freigegebene Mailsatz „Der Zugang läuft dann aus“ bleibt.
- **BUG-1:** Mit zwei zusätzlichen RESTRICTIVE-Regeln für `DELETE` behoben, von Jakob am 2026-11-23 freigegeben.

## Offene Punkte
- Frontend und Backend nur gemeinsam live nehmen, weil das Zugangsfeld die Löschung ankündigt.
- Figma-Frames 08 und 09 enthalten noch den alten Mailtext.
- Nicht geprüft: Safari und Firefox (Lesemodus vor dem Go-live einmal in Safari prüfen), echter Stripe-Checkout und Webhook, echte Cron-Route, echter Versand der Bremsen-Mail.
- Der Druckauftrag kommt mit PROJ-16, die Schonfristen sind dafür vorbereitet.
