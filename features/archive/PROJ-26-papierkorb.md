# PROJ-26: Papierkorb (serverseitig, 14 Tage)

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

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

> Von Jakob am 2026-11-22 freigegeben, inklusive der neuen Sperrregel für Bilder. Die Kernlogik wurde mit 53 Prüfungen in einer lokalen Testdatenbank auf den echten Migrationen getestet. Auf Stage ist noch nichts eingespielt.

### A) Ablauf

```
Kunde klickt „Endgültig löschen" (Dialoge unverändert)
|
+-- Kapitel
|   +-- Datenbank legt eine vollständige Kopie in die geschützte Ablage
|   +-- Kapitel verschwindet für alle, Seitenzahlen rechnen sich neu
|   +-- Bilder bleiben liegen, sind aber sofort gesperrt
|
+-- Projekt (nur Projektleitung)
    +-- Datenbank bricht die echte Löschung ab
    +-- Mitgliederliste wandert in die geschützte Ablage
    +-- Ohne Mitgliedschaft hat niemand mehr Zugriff auf
        Projekt, Kapitel, Cover, Bilder und Zugangsdaten

Täglicher Cron (läuft schon)
+-- Löscht fällige Inhalte endgültig
+-- Entfernt ihre Dateien, wiederholt Fehlversuche

Support (Supabase SQL-Editor, Schritt-für-Schritt-Anleitung)
+-- Fall suchen, ohne Kapiteltext zu sehen
+-- Kapitel oder Projekt wiederherstellen
+-- Auf Wunsch sofort endgültig löschen
```

### B) Datenmodell

**Papierkorb für Kapitel:** Kapitel-ID, Projekt, Titel, vollständige Kopie des Kapitels, Mitschreibende, Löschzeitpunkt, löschende Person, Fälligkeit der endgültigen Löschung.

**Papierkorb für Projekte:** Projekt, Löschzeitpunkt, löschende Person, Fälligkeit. Das Projekt selbst bleibt mit allen Inhalten an seinem Platz.

**Mitglieder gelöschter Projekte:** Person und Rolle zum Zeitpunkt der Löschung. Löscht jemand das Konto, verschwindet der Eintrag automatisch.

**Aufräumliste für Dateien:** Die Liste aus PROJ-3 lernt zusätzlich einzelne Kapitel.

Kunden haben auf alle diese Daten keinerlei Zugriff, weder lesend noch schreibend. Nur der Server und der Support kommen daran.

### C) Technische Entscheidungen

1. **Die Datenbank fängt das Löschen ab, nicht die App.** So landet auch eine Löschung, die unsere Buttons umgeht, etwa über die Browser-Konsole, sicher im Papierkorb. Die Lösch-Dialoge und Lösch-Aktionen bleiben fast unverändert.
2. **Ein gelöschtes Projekt verliert seine Mitglieder, statt kopiert zu werden.** Alle Zugriffsregeln hängen an der Mitgliedschaft. Damit ist das ganze Projekt in einem Schritt gesperrt, und beim Wiederherstellen fehlt nichts.
3. **Bilder werden gesperrt, nicht verschoben.** Das weicht vom ersten Vorschlag ab. Verschieben liefe in mehreren Schritten und könnte auf halbem Weg scheitern. Die Sperre greift im selben Moment wie die Löschung, und beim Wiederherstellen ist alles sofort wieder da. Das normale Entfernen eines Bildes im Editor bleibt dadurch wie heute.
4. **Nur Kunden-Logins landen im Papierkorb.** Löschungen durch den Server sind echt. Das braucht das Konto-Löschen, die endgültige Löschung und das Aufräumen nach gescheiterten Käufen.
5. **Keine Admin-Oberfläche.** Der Support nutzt vorbereitete, geschützte Datenbank-Funktionen und eine Anleitung in `docs/production/support-papierkorb.md`.

### D) Änderungen an Zugriffsregeln (von Jakob freigegeben)

- **Neu:** eine zusätzliche Sperrregel für Bilder von Kapiteln im Papierkorb
- **Neu:** drei Tabellen ohne jeden Kundenzugriff
- **Keine bestehende RLS-Regel wird umgeschrieben oder gelockert**

### E) Lücken, die dieses Feature mit schließt

| Lücke | Folge ohne Fix |
|---|---|
| Konto-Löschen hält ein gelöschtes gemeinsames Projekt für ein Einzelprojekt (im Test bestätigt) | Das Projekt wäre sofort endgültig weg, auch für die anderen Mitglieder |
| Autosave meldet Erfolg, wenn das Kapitel inzwischen gelöscht wurde (besteht schon heute) | Eine Person schreibt weiter und verliert ihren Text unbemerkt |
| Einladungen fügen Mitglieder über den Server hinzu | Eine alte Einladung könnte ein gelöschtes Projekt wieder öffnen |
| Mitglieder können ein Kapitel in ein anderes eigenes Projekt verschieben (besteht schon heute) | Texte könnten am Papierkorb vorbei aus einem Projekt verschwinden |
| Ein neues Kapitel könnte die ID eines gelöschten Kapitels bekommen | Die Wiederherstellung würde scheitern |
| Schutz der letzten Projektleitung blockiert das Sperren eines Projekts | Projekte ließen sich nicht in den Papierkorb legen |
| Wartende Mails und späte Verlängerungszahlungen | Mails zu gelöschten Projekten. Die Zahlung bleibt gebucht, der Support bekommt einen Hinweis |

### F) Grenzen

- Der Papierkorb schützt vor dem **Löschen**. Überschreibt ein Mitglied den Text eines Kapitels oder entfernt ein einzelnes Bild, hilft er nicht. Das gehört zu PROJ-15 (Versionen).
- Bereits geöffnete Bildlinks funktionieren bis zu einer Stunde weiter.
- Die endgültige Löschung läuft einmal täglich, also nach 14 Tagen bis spätestens rund 15 Tagen.

### G) Abhängigkeiten und Einspielen

- **Neue Pakete:** keine
- **Neue Env-Variablen:** keine
- **Migration:** eine, von Jakob im SQL-Editor, reines ASCII. Auf Stage und später in Production **vor** dem Code-Deploy.
- **Tests:** Datenbank-Szenarien, Unit-Tests für das Aufräumen, E2E für Löschen, Autosave und Einladungen

## Implementation Notes (Backend, 2026-11-22)

**Datenbank:** Migration `20261122160000_proj26_trash.sql` mit den Papierkorb-Tabellen, dem Abfangen von Kunden-Löschungen, der Sperrregel für Bilder, den Support-Funktionen und dem täglichen Löschlauf. Angepasst sind der Schutz der letzten Projektleitung, die Einladungs-Prüfung und der Konto-Lösch-Ablauf. Hilfsfunktionen liegen im Schema `private`, das die API nicht erreicht.

**App:**
- Autosave meldet einen Fehler, wenn das Kapitel inzwischen gelöscht wurde
- Täglicher Cron löscht fällige Inhalte und entfernt ihre Dateien
- Wartende Einladungs-, Verlängerungs-Info- und Projektleitungs-Mails zu gelöschten Projekten entfallen, Zahlungsbestätigungen gehen weiter raus
- Zahlung für ein gelöschtes Projekt bleibt gebucht, der Support bekommt eine interne Mail

**Support:** Anleitung in `docs/production/support-papierkorb.md`.

**Abweichung vom Design:** Keine. Die Lösch-Dialoge und Lösch-Aktionen sind unverändert.

**Geprüft:** 77 Datenbank-Szenarien lokal, die 53 Szenarien aus PROJ-3 weiterhin grün, 714 Unit-Tests, Typecheck, ESLint und Production-Build. Migration auf Stage eingespielt, Tabellen, Rechte, Trigger und Sperrregel dort kontrolliert. E2E-Regression auf dem Production-Build gegen Stage: 148 bestanden, 25 übersprungen, 0 fehlgeschlagen (ohne Mail-Test AC-14). Dabei landeten 10 echt gelöschte Test-Kapitel vollständig im Papierkorb.

**Nachtrag nach der QA:** Migration `20261122170000_proj26_trash_people.sql` hält Mitglieder und Mitschreibende gelöschter Kapitel in einer eigenen Tabelle fest. Die Support-Suche zeigt zusätzlich `contributor_emails`. Der Webhook bucht Zahlungen auch dann, wenn Projekt oder Konto nicht mehr existieren. Die Kapitelliste übernimmt nach fremden Änderungen den Stand vom Server.

## QA Test Results

**Getestet:** 2026-11-22
**Umgebung:** lokaler Production-Build gegen Stage-Datenbank und echten Stage-Dateispeicher, Chromium
**Tester:** QA Engineer (AI)
**Suite:** `E2E_TRASH=1 npx playwright test tests/PROJ-26-papierkorb.spec.ts --project=chromium`. Sie nutzt nur eigene Wegwerf-Konten und räumt danach auf.

### Acceptance Criteria

| Bereich | Kriterien | Ergebnis |
|---|---|---|
| A. Löschen | AC-1 bis AC-6 | bestanden |
| B. Unsichtbar für Kunden | AC-7 bis AC-13 | bestanden |
| C. Support | AC-14 bis AC-20 | bestanden, AC-16 nach Fix von BUG-1 |
| D. Endgültiges Löschen | AC-21 bis AC-24 | bestanden |
| E. Konto-Löschen | AC-25 bis AC-28 | bestanden, AC-28 nach Fix von BUG-2 |

**Ergebnis: 28 von 28 bestanden.**

### Edge Cases

- [x] Zwei Personen im selben Kapitel: Autosave zeigt „Fehler beim Speichern" und holt das Kapitel nicht zurück
- [x] Kapitel doppelt gelöscht: ein Eintrag, die erste Löschung zählt
- [x] Letztes Projekt gelöscht: Person landet im Onboarding
- [x] Offene Einladung zu gelöschtem Projekt: ungültig, nach Wiederherstellung wieder gültig
- [x] Letzte Projektleitung löscht ihr Konto: Wiederherstellen verlangt eine neue Leitung
- [x] Kapitel im gelöschten Projekt: lässt sich erst nach dem Projekt wiederherstellen
- [x] Zugang: Das Ablaufdatum bleibt beim Wiederherstellen gleich
- [x] Zahlung für ein Projekt im Papierkorb: bleibt gebucht, Support-Hinweis (Unit-Test)
- [x] Reihenfolge in einem veralteten Tab: verständliche Meldung, die Liste lädt neu (BUG-5)
- [x] Zahlung für ein bereits endgültig gelöschtes Projekt: wird gebucht, Support soll erstatten (BUG-3, Unit-Test)
- [x] Person wird vor dem Löschen entfernt: bleibt als Mitschreibende erkennbar

### Sicherheit (Red Team)

- [x] Kunden und anonyme Aufrufe erreichen weder Papierkorb-Tabellen noch Support-Funktionen noch das Schema `private`
- [x] GraphQL zeigt den Papierkorb nicht, Löschen darüber geht nicht am Papierkorb vorbei
- [x] Gesperrte Bilder: Auflisten, Laden, Link erzeugen, Hochladen, Überschreiben, Löschen, Kopieren und Verschieben scheitern im echten Speicher
- [x] Gelöschte Kapitel-ID lässt sich nicht übernehmen, Kapitel lassen sich nicht in andere Projekte verschieben, auch nicht per Upsert
- [x] Nach dem Löschen eines Projekts kommt niemand wieder hinein, auch nicht über Einladungen
- [x] Gleichzeitige Zugriffe: Einladung gegen Löschen, doppeltes Löschen, Autosave gegen Löschen, Wiederherstellen gegen endgültiges Löschen, Projekt-Löschen gegen Konto-Löschen
- [x] Supabase-Advisors: keine neue Warnung, nur der erwartete Hinweis auf Tabellen ohne Policies
- [x] Client-Bundle enthält das Wort „Papierkorb" nicht

### Bugs

#### BUG-1: Support erkennt eine später entfernte Person nicht als Mitglied
- **Severity:** Medium
- **Schritte:** Projektleitung löscht das Kapitel einer mitschreibenden Person und entfernt sie danach aus dem Projekt. Die Person schreibt dem Support.
- **Erwartet (AC-16):** `trash_find` nennt sie als Mitglied zum Zeitpunkt der Löschung. **Tatsächlich:** Bei Kapiteln zeigt die Suche nur die heutigen Mitglieder. Laut Anleitung müsste der Support die Anfrage ablehnen, obwohl das genau der Streitfall ist.
- **Status:** Behoben am 2026-11-22. Kapitel merken sich die Mitglieder beim Löschen, die Suche nennt zusätzlich alle Mitschreibenden. Auf Stage geprüft.

#### BUG-2: Nutzer-ID bleibt nach dem Konto-Löschen im Papierkorb
- **Severity:** Low
- **Beschreibung:** Die Liste der Mitschreibenden in `trash_chapters` behält die ID eines gelöschten Kontos bis zu 14 Tage. Name und E-Mail sind weg.
- **Status:** Behoben am 2026-11-22. Die Einträge verschwinden jetzt mit dem Konto. Auf Stage geprüft.

#### BUG-3: Zahlung für ein endgültig gelöschtes Projekt wird nicht gebucht
- **Severity:** Low
- **Beschreibung:** Der Webhook scheitert dann am Datenbank-Verweis auf das Projekt, antwortet mit Fehler, und der Support bekommt keinen Hinweis. Das Geld ist bei Stripe eingegangen. Nur möglich, wenn während eines offenen Checkouts das Projekt sofort endgültig gelöscht wird. Aus Code und Datenbank abgeleitet, nicht mit einer echten Zahlung ausgelöst.
- **Status:** Behoben am 2026-11-22. Die Zahlung wird gebucht, und der Support bekommt die Bitte um Erstattung. Existiert nur das Konto nicht mehr, bekommt das Projekt die Zeit trotzdem. Per Unit-Test geprüft, nicht mit einer echten Zahlung.

#### BUG-4: Umbenennen eines gelöschten Kapitels meldet Erfolg
- **Severity:** Low
- **Beschreibung:** In einem veralteten Tab läuft das Umbenennen ohne Fehlermeldung ins Leere.
- **Status:** Behoben am 2026-11-22, im echten Browser geprüft.

#### BUG-5: Reihenfolge in einem veralteten Tab zeigt „Sicherheitsfehler"
- **Severity:** Low
- **Beschreibung:** Hat jemand anderes ein Kapitel gelöscht, scheitert das Sortieren mit „Sicherheitsfehler: Ungültige Kapitel-IDs.", und die Liste bleibt bis zum Neuladen veraltet.
- **Status:** Behoben am 2026-11-22, im echten Browser geprüft.

### Automatische Tests

- Unit-Tests: 719 von 719
- PROJ-26 gegen Stage: 29 von 29
- Komplette E2E-Regression inklusive echter Konto-Löschung: 171 bestanden, 30 übersprungen, 0 fehlgeschlagen. Übersprungen ist unter anderem die PROJ-26-Suite, die separat lief. Der Mail-Test AC-14 aus PROJ-3 blieb außen vor
- Lokale Datenbank-Szenarien: 89 für PROJ-26, 53 für PROJ-3
- Supabase-Advisors nach beiden Migrationen: keine neue Warnung

**Nicht geprüft:** Firefox und Safari, Handy und Tablet (die Oberfläche ist unverändert), der echte Cron-Aufruf (er könnte echte Erinnerungen verschicken, deshalb liefen Löschlauf und Datei-Aufräumen direkt), die Zustellung der Support-Mail, eine echte Stripe-Zahlung.

### Nebenbefunde außerhalb von PROJ-26

- Auf Stage liegen 15 Dateien aus dem Mai ohne zugehöriges Projekt. Sie bleiben unangetastet, bis Jakob das Aufräumen freigibt.
- Auf Stage läuft kein automatischer Cron. Jeder E2E-Lauf lässt deshalb rund 10 Test-Kapitel im Papierkorb liegen.
- Laut RLS prüfen die Datenbankregeln den Ablauf des Projektzugangs nicht, nur die Server Actions. Ein Mitglied eines abgelaufenen Projekts könnte also direkt über die API weiterschreiben. Nicht ausprobiert, gehört zu PROJ-6.

### Summary

- **Acceptance Criteria:** 28 von 28 bestanden
- **Bugs:** 5 gefunden, alle behoben
- **Security:** bestanden
- **Production Ready:** JA, nach Push auf Stage und einem kurzen Blick auf das Deployment
- **Empfehlung:** Auf `stage` pushen. Vor Production beide Migrationen vor dem Code einspielen

## Deployment
_To be added by /deploy_
