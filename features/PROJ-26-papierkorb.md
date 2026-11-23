# PROJ-26: Papierkorb (serverseitig, 14 Tage)

> **Kurzfassung (PROJ-31).** Das vollständige Tech Design, Bau-Notizen, QA-Protokolle und der Deployment-Verlauf stehen unverändert im [Archiv](archive/PROJ-26-papierkorb.md).

## Status: Approved
**Created:** 2026-11-22
**Last Updated:** 2026-11-22

## Dependencies
- Requires: PROJ-1 (Datenmodell und RLS): Gelöschte Inhalte müssen auch auf Datenbank- und Speicherebene gesperrt sein
- Requires: PROJ-3 (Konto-Löschen): Einzelprojekte werden mit dem Konto sofort endgültig entfernt
- Requires: PROJ-4 und PROJ-5 (Kapitel, Editor): Löschen, Autosave und direkte Links
- Requires: PROJ-7 (Seitenzahl): Gelöschte Kapitel zählen nicht mit
- Requires: PROJ-9 (Mitglieder, Einladungen): Einladungen zu gelöschten Projekten gelten nicht
- Requires: PROJ-10 (Cover): Cover und Logo gehören zum Projekt
- Requires: PROJ-6 und PROJ-11 (Zahlung, Mails): Keine Erinnerungen und keine Verlängerung für gelöschte Projekte
- Löst: PROJ-19 BUG-2 (gelöschte Kapitel lassen Bilder im Speicher zurück)
- Abgrenzung: PROJ-28 regelt das automatische Löschen abgelaufener Projekte, PROJ-15 die Versionen von Texten

## Entscheidungen von Jakob (2026-11-22)

1. Der Papierkorb gilt für **alle** gelöschten Kapitel und Projekte, auch bei nur einer Person im Projekt.
2. Er läuft **nur auf dem Server**. Das Interface verweist nirgends auf ihn.
3. Wiederherstellen geht **nur über den Support**.
4. Die Lösch-Dialoge bleiben **wortgleich** wie heute.
5. Beim Löschen gibt es **keine Mail** an andere Mitglieder.
6. Beim **Konto-Löschen** werden Einzelprojekte sofort endgültig entfernt, auch wenn sie schon im Papierkorb liegen.

## User Stories

- Als schreibende Person möchte ich, dass ein versehentlich gelöschtes Kapitel über den Support noch zu retten ist, damit eine Lebensgeschichte nicht durch einen Fehlklick verloren geht.
- Als Mitschreibende möchte ich, dass ein Streit oder Alleingang im Projekt meine Texte nicht sofort vernichtet, damit der Support den Fall noch klären kann.
- Als Projektleitung möchte ich ein gelöschtes Projekt innerhalb von 14 Tagen über den Support zurückbekommen, inklusive Kapiteln, Cover und Mitgliedern.
- Als Support möchte ich einen gelöschten Inhalt finden und wiederherstellen, ohne den Text der Kundin oder des Kunden lesen zu müssen.
- Als Person, die ihr Konto löscht, möchte ich, dass meine Einzelprojekte sofort entfernt werden, damit mein Löschwunsch ohne Umweg erfüllt ist.
- Als Betreiber möchte ich, dass nach Ablauf der Frist auch alle Dateien verschwinden, damit keine persönlichen Fotos dauerhaft im Speicher liegen bleiben.

## Acceptance Criteria

### A. Löschen

- [ ] AC-1: Ein gelöschtes Kapitel verschwindet sofort für alle Mitglieder aus Projektübersicht, Editor, Reihenfolge und buchweiter Seitenzahl, bleibt aber 14 Tage auf dem Server erhalten.
- [ ] AC-2: Ein von der Projektleitung gelöschtes Projekt verschwindet sofort für alle Mitglieder von der Startseite und aus allen Projektseiten und bleibt 14 Tage auf dem Server erhalten.
- [ ] AC-3: AC-1 und AC-2 gelten unabhängig von der Zahl der Mitglieder.
- [ ] AC-4: Die Rechte zum Löschen bleiben wie heute: Kapitel darf jedes Mitglied mit aktivem Schreibzugang löschen, Projekte nur die Projektleitung.
- [ ] AC-5: Zu jeder Löschung ist serverseitig festgehalten: was gelöscht wurde, wann, durch wen und ab wann die endgültige Löschung fällig ist.
- [ ] AC-6: Die Lösch-Dialoge für Kapitel und Projekte sind Wort für Wort unverändert.

### B. Unsichtbar für Kunden

- [ ] AC-7: Weder Oberfläche noch Mails, Fehlermeldungen oder sichtbare Seitentexte erwähnen einen Papierkorb oder eine Wiederherstellung.
- [ ] AC-8: Kein Mitglied kann gelöschte Inhalte lesen, ändern, wiederherstellen oder endgültig löschen, auch nicht mit eigenem Login über direkte Datenbank- oder Speicheraufrufe.
- [ ] AC-9: Für gelöschte Kapitel und Projekte stellt der Server keine neuen Bildlinks mehr aus. Bereits ausgegebene Links laufen spätestens nach einer Stunde ab.
- [ ] AC-10: Ein direkter Link auf ein gelöschtes Kapitel oder Projekt verhält sich wie ein Link auf einen nicht vorhandenen Inhalt.
- [ ] AC-11: Beim Löschen wird keine Mail an andere Mitglieder verschickt.
- [ ] AC-12: Für ein gelöschtes Projekt laufen keine Erinnerungs- oder Verlängerungsmails, und eine Verlängerung lässt sich nicht starten.
- [ ] AC-13: Einladungslinks zu einem gelöschten Projekt zeigen den vorhandenen Zustand für ungültige Einladungen.

### C. Wiederherstellen und Sonderfälle über den Support

- [ ] AC-14: Für den Support gibt es je einen dokumentierten und getesteten Ablauf für: gelöschte Inhalte finden, Kapitel wiederherstellen, Projekt wiederherstellen, sofort endgültig löschen.
- [ ] AC-15: Der Support findet einen Fall über E-Mail-Adresse eines Mitglieds, Projekt- oder Kapiteltitel und Löschdatum, ohne den Kapiteltext anzuzeigen.
- [ ] AC-16: Eine Wiederherstellung kann jede Person anfragen, die zum Zeitpunkt der Löschung Mitglied des Projekts war. Der Support prüft das anhand der Absenderadresse und entscheidet Streitfälle im Einzelfall.
- [ ] AC-17: Ein wiederhergestelltes Kapitel kommt mit Titel, Text und Bildern zurück, möglichst an seiner alten Position, sonst ans Ende.
- [ ] AC-18: Ein wiederhergestelltes Projekt kommt mit Kapiteln, Cover, Logo, Mitgliedern und Rollen zurück. Das Ablaufdatum des Zugangs ändert sich dadurch nicht.
- [ ] AC-19: Kapitel, die schon vor dem Projekt einzeln gelöscht wurden, kommen beim Wiederherstellen des Projekts nicht automatisch mit und behalten ihre eigene Frist.
- [ ] AC-20: Auf einen Löschwunsch nach DSGVO kann der Support Inhalte vor Ablauf der 14 Tage endgültig entfernen, inklusive Dateien.

### D. Endgültiges Löschen

- [ ] AC-21: Frühestens nach 14 vollen Tagen und spätestens beim nächsten täglichen Lauf danach werden Datensatz und alle zugehörigen Dateien endgültig entfernt.
- [ ] AC-22: Beim Kapitel sind das alle Bilder dieses Kapitels. Beim Projekt sind das alle Kapitelbilder, Cover, Logos und Exporte. Dateien anderer Kapitel und Projekte bleiben unberührt.
- [ ] AC-23: Scheitert das Entfernen einer Datei, wird es beim nächsten Lauf wiederholt, ohne dass der Vorgang verloren geht.
- [ ] AC-24: Ein rechtzeitig wiederhergestellter Inhalt wird nie endgültig gelöscht, auch wenn die Wiederherstellung kurz vor dem Lauf passiert.

### E. Konto-Löschen

- [ ] AC-25: Beim Konto-Löschen werden Projekte, in denen die Person allein ist, sofort endgültig entfernt, inklusive Dateien und auch dann, wenn sie schon im Papierkorb liegen.
- [ ] AC-26: Gelöschte Projekte erscheinen nicht im Konto-Lösch-Dialog und verlangen keine Nachfolge.
- [ ] AC-27: Gemeinsame Projekte und ihre Kapitel bleiben beim Konto-Löschen bestehen wie in PROJ-3, auch im Papierkorb. Die Frist läuft unverändert weiter.
- [ ] AC-28: Der Verweis auf die löschende Person fällt weg, sobald deren Konto gelöscht ist. Der Löschzeitpunkt bleibt erhalten.

## Edge Cases

- **Zwei Personen haben dasselbe Kapitel offen, eine löscht es:** Das Autosave der anderen schreibt nicht mehr in das gelöschte Kapitel und holt es nicht zurück. Sie sieht die vorhandene Fehlermeldung. Gesichert bleibt der zuletzt gespeicherte Stand.
- **Kapitel wird zweimal gelöscht (Doppelklick, zwei Personen):** Die Frist beginnt nicht neu, die erste Löschung zählt.
- **Reihenfolge wird gespeichert, während ein Kapitel gelöscht wird:** Das gelöschte Kapitel taucht nicht wieder in der Liste auf.
- **Letztes Projekt wird gelöscht:** Die Person landet wie heute im Onboarding, inklusive Link zum Konto-Löschen.
- **Projekt mit offenem Geschenk oder Gastkauf wird gelöscht:** Der offene Anspruch öffnet das gelöschte Projekt nicht. Der Fall läuft über den Support.
- **Zahlung für ein Projekt trifft ein, das gerade gelöscht wurde:** Die Zahlung wird trotzdem verbucht und geht nicht verloren. Das Projekt bleibt gelöscht, der Support bekommt einen Hinweis.
- **Zugang läuft ab, während das Projekt im Papierkorb liegt:** Die 14-Tage-Frist läuft unverändert. Nach einer Wiederherstellung gilt das ursprüngliche Ablaufdatum.
- **Frist aus PROJ-28 und Papierkorb-Frist treffen zusammen:** Es gilt der frühere Zeitpunkt.
- **Letzte Projektleitung löscht ihr Konto, das gemeinsame Projekt liegt im Papierkorb:** Bei einer späteren Wiederherstellung legt der Support eine neue Projektleitung fest.
- **Support stellt ein Kapitel wieder her, dessen Projekt noch im Papierkorb liegt:** Das geht nur zusammen mit dem Projekt oder danach.
- **Täglicher Lauf fällt aus:** Fällige Löschungen werden beim nächsten Lauf nachgeholt.

## Nicht in diesem Feature

- Papierkorb-Ansicht oder Wiederherstellen im Interface
- Benachrichtigungen beim Löschen
- Admin-Oberfläche für den Support
- Export oder Kopien für Kunden
- Papierkorb für einzelne Bilder, Cover-Änderungen oder entfernte Mitglieder
- Versionen von Kapiteltexten (PROJ-15)
- Automatisches Löschen abgelaufener Projekte (PROJ-28)
- Aufräumen alter verwaister Bilder aus der Zeit vor PROJ-26. Das braucht eine eigene Freigabe

## Technical Requirements

- **Sicherheit:** Die Sperre aus AC-8 gilt serverseitig und in RLS, nicht nur als Filter in der Oberfläche. Änderungen an RLS brauchen Jakobs ausdrückliche Freigabe.
- **Datenschutz:** Support-Abläufe zeigen keine Kapiteltexte an. Keine personenbezogenen Daten in Logs.
- **Zuverlässigkeit:** Endgültiges Löschen darf bei Wiederholung keinen Schaden anrichten.
- **Migration:** Jakob spielt sie im SQL-Editor ein, SQL zum Kopieren in reinem ASCII.

## Rechtliche Prüfpunkte vor dem Go-live

- **Datenschutzerklärung (Pflicht):** Sie muss nennen, dass gelöschte Inhalte bis zu 14 Tage gespeichert bleiben (Art. 13 Abs. 2 lit. a DSGVO).
- **Lösch-Dialoge (Risiko, von Jakob so entschieden):** Sie sagen „unwiderruflich" und „Eine Wiederherstellung ist nicht möglich", obwohl der Support 14 Tage lang wiederherstellen kann. Das widerspricht der Datenschutzerklärung und kann gegen das Transparenzgebot verstoßen (Art. 5 Abs. 1 lit. a DSGVO). Bei der anwaltlichen Prüfung gezielt vorlegen. Eine wahre Formulierung ohne Hinweis auf den Papierkorb wäre: „Sie können das Kapitel danach nicht selbst wiederherstellen."

## Technische Entscheidungen
_Kurzform. Die vollständige Begründung steht im Archiv._

### C) Technische Entscheidungen

1. **Die Datenbank fängt das Löschen ab, nicht die App.** So landet auch eine Löschung, die unsere Buttons umgeht, etwa über die Browser-Konsole, sicher im Papierkorb.
2. **Ein gelöschtes Projekt verliert seine Mitglieder, statt kopiert zu werden.** Alle Zugriffsregeln hängen an der Mitgliedschaft.
3. **Bilder werden gesperrt, nicht verschoben.** Das weicht vom ersten Vorschlag ab.
4. **Nur Kunden-Logins landen im Papierkorb.** Löschungen durch den Server sind echt.
5. **Keine Admin-Oberfläche.** Der Support nutzt vorbereitete, geschützte Datenbank-Funktionen und eine Anleitung in `docs/production/support-papierkorb.md`.

## Offene Punkte
- Nicht geprüft: Firefox und Safari, Handy und Tablet, der echte Cron-Aufruf, die Zustellung der Support-Mail, eine echte Stripe-Zahlung.
- Auf Stage liegen 15 Dateien aus dem Mai ohne zugehöriges Projekt. Sie bleiben, bis Jakob das Aufräumen freigibt.
- Vor Production beide Migrationen vor dem Code einspielen.
- Der Papierkorb schützt nur vor dem Löschen, nicht vor überschriebenem Text oder einzelnen entfernten Bildern (PROJ-15).
- Geöffnete Bildlinks funktionieren bis zu einer Stunde weiter. Die endgültige Löschung läuft täglich, also nach 14 bis rund 15 Tagen.
- Auf Stage läuft kein automatischer Cron. E2E-Läufe lassen deshalb Test-Kapitel im Papierkorb liegen.
