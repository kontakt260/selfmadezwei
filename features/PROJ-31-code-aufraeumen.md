# PROJ-31: Code aufräumen und Tests verschlanken

## Status: Approved
**Created:** 2026-11-23
**Last Updated:** 2026-11-23 (QA bestanden, nichts committet)
**Freigegeben:** Spec und Tech Design von Jakob am 2026-11-23

## Dependencies
- Requires: PROJ-24 (Onboarding) und PROJ-30 (Ladezeiten), weil beide dieselben Dateien und Tests berühren.
- Vor PROJ-25 (Kapitel-Editor) und PROJ-21 (Seitenlayouts), die vom kleiner geschnittenen Editor profitieren.

## Ausgangslage (gesichtet am 2026-11-23)

| Bereich | Heute |
|---|---|
| Testläufe | 6 getrennte Läufe mit Schaltern, zusammen rund 12 Minuten, jeder baut die App neu |
| Test-Hilfen | `readEnvLocal` und `signIn` je 9-mal, `createAccount` 8-mal, `createProject` 7-mal |
| Specs | 23 Dateien, 787 KB, die größte 90 KB |
| Prod-Umzug | 59 KB, Checkliste und Änderungsprotokoll in einer Datei |
| Projektplan im Memory | 18 KB, wird zu Beginn jeder Sitzung gelesen |
| Große Dateien | `EditorClient` 1.271 Zeilen, `ChapterSectionClient` 874, `PaginationDecorations` 857, `OnboardingWizard` 694, `CoverEditorClient` 633, `PersonalAreaClient` 612, Stripe-Webhook 610 |

## User Stories
- Als Jakob möchte ich, dass die Arbeit an einem Feature weniger Tokens und Rechenzeit kostet, damit das Projekt günstiger und schneller vorankommt.
- Als Jakob möchte ich alle Tests mit einem einzigen Befehl starten, damit nichts vergessen wird und keine Schalter nötig sind.
- Als Entwickler möchte ich nach jeder Änderung in höchstens 3 Minuten wissen, ob die wichtigsten Wege noch funktionieren.
- Als Entwickler möchte ich in einer Spec schnell die gültigen Anforderungen und Entscheidungen finden, ohne alte Protokolle lesen zu müssen.
- Als Entwickler möchte ich kleinere Dateien, damit ich für eine Änderung nur den betroffenen Teil lesen muss.
- Als Kunde möchte ich von all dem nichts bemerken.

## Acceptance Criteria

### A. Für Kunden ändert sich nichts
- [x] AC-1: Alle bestehenden Unit- und E2E-Tests bestehen nach jedem Schritt.
- [x] AC-2: Startseite, Buchprojekt, Kapitel-Editor, Cover-Editor, Persönlicher Bereich und Onboarding sehen bei 375, 768 und 1440 px vor und nach dem Umbau gleich aus (Bildvergleich).
- [x] AC-3: Ein Referenzkapitel mit mindestens 40 Seiten und Bildern hat vor und nach dem Umbau dieselbe Seitenzahl und dieselben Seitenumbrüche.
- [x] AC-4: Die Ladezeiten aus PROJ-30 werden nicht schlechter, das JavaScript der Seiten wird nicht größer.
- [x] AC-5: Es gibt keine Migration und keine Änderung an RLS, Anmeldung, Zugangsprüfung, Stripe-Ablauf oder Mail-Texten.

### B. Tests
- [x] AC-6: Ein Befehl startet den schnellen Lauf mit Unit-Tests und den wichtigsten Wegen. Er dauert höchstens 3 Minuten.
- [x] AC-7: Der schnelle Lauf deckt mindestens ab: Anmeldung, Projekt öffnen, Kapitel schreiben und speichern, Zurück-Taste im Editor, Kauf per Webhook, Lesemodus.
- [x] AC-8: Ein Befehl startet den vollen Lauf mit allen Tests, ohne Schalter von Hand. Er dauert rund 8 Minuten und baut die App nur einmal. Mit neuen Tests darf er länger werden (Jakob, 2026-11-23).
- [x] AC-9: Kein Testfall fällt ersatzlos weg. Zusammengelegte Fälle stehen in einer Liste in dieser Spec.
- [x] AC-10: Jede gemeinsame Test-Hilfe gibt es nur noch einmal.
- [x] AC-11: Beide Läufe weigern sich, gegen etwas anderes als Stage zu laufen, wenn sie Daten verändern.
- [x] AC-12: Die bestehenden Schutzregeln bleiben: QA-Konto wird nie gelöscht, die echte Cron-Route wird nicht aufgerufen, es gehen keine echten Mails, SMS oder Zahlungen hinaus, der Test mit dem echten Passwort-Reset läuft nicht automatisch.
- [x] AC-13: Nach einem vollen Lauf sind alle temporären Konten und Projekte wieder gelöscht, auch wenn ein Test scheitert.

### C. Doku
- [x] AC-14: Jede Spec eines abgeschlossenen Features behält Anforderungen, Entscheidungen, Status und offene Punkte und ist höchstens 20 KB groß.
- [x] AC-15: Alte QA-Protokolle und Bau-Notizen liegen unverändert in einem Archiv-Ordner, jede Spec verlinkt ihr Archiv.
- [x] AC-16: Keine Anforderung, Entscheidung oder offene Aufgabe geht beim Kürzen verloren. Eine Stichprobe von 5 Specs wird gegen das Original geprüft.
- [x] AC-17: Die aktiven Specs sind zusammen höchstens 300 KB groß.
- [x] AC-18: Die Checkliste für den Prod-Umzug bleibt vollständig, das Änderungsprotokoll liegt in einer eigenen Datei.
- [x] AC-19: Der Projektplan im Memory ist höchstens 8 KB groß und enthält alle offenen Wünsche von Jakob.
- [x] AC-20: Alle Verweise in `CLAUDE.md`, `INDEX.md`, Specs und Skills führen weiter zum richtigen Ziel.

### D. Code
- [x] AC-21: Keine Datei mit App-Code ist länger als 600 Zeilen. Generierte Dateien und Tests zählen nicht.
- [x] AC-22: Die großen Dateien werden nur durch Verschieben zerlegt, die Logik bleibt gleich. Jeder Schritt ist einzeln prüfbar.
- [x] AC-23: Nachweislich ungenutzter Code und ungenutzte Pakete sind entfernt. Installierte shadcn-Komponenten bleiben, auch wenn sie gerade nicht genutzt werden.
- [x] AC-24: Kommentare, die eine Entscheidung oder einen früheren Fehler erklären, bleiben erhalten.
- [x] AC-25: Fehler, die beim Aufräumen auffallen, werden nicht nebenbei behoben, sondern in dieser Spec gelistet und Jakob vorgelegt.

## Edge Cases
- **Ein Test wird nur durch die neue Reihenfolge rot:** Die Ursache wird behoben. Der Test wird nicht abgeschwächt.
- **Tests teilen sich das QA-Konto:** Sie dürfen sich beim Beschleunigen nicht gegenseitig stören.
- **Ein Testlauf bricht mitten drin ab:** Der nächste Lauf findet alte temporäre Daten und räumt sie auf.
- **Verschieben ändert, was im Browser landet:** Server- und Client-Code bleiben getrennt, Secrets gelangen nie in den Browser.
- **Ein Abschnitt einer Spec lässt sich nicht eindeutig einordnen:** Er bleibt in der aktiven Spec.
- **Ein Feature ist noch in Arbeit (zum Beispiel PROJ-12):** Seine Spec wird nicht gekürzt.
- **Die uncommittete Statuszeile in der PROJ-17-Spec:** Sie bleibt unangetastet und wird nicht mitcommittet.
- **Ein vermeintlich ungenutztes Paket wird indirekt gebraucht:** Es bleibt, wenn Build oder Tests ohne es scheitern.

## Nicht-Ziele
- Keine neuen Funktionen und keine sichtbaren Änderungen.
- Die beiden Seitenumbruch-Engines im Editor werden nicht zusammengeführt. Das gehört zu PROJ-21 und PROJ-25.
- Keine Änderung an Datenbank, RLS oder Auth. Auch die Umbenennung von `middleware` in `proxy` gehört nicht dazu.
- Keine größeren Versionssprünge von Paketen.
- Die Editor-Fehler aus PROJ-25 werden hier nicht behoben.

## Technical Requirements
- Sicherheit: keine Secrets in Tests, Doku oder Browser-Code.
- Browser: Tests laufen weiter in Chromium, Mobile Safari startet auf diesem Mac nicht.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

**Kurzfassung:** PROJ-31 ändert nichts für Kunden und braucht weder Backend noch Migration. Zuerst entsteht ein Sicherheitsnetz, das den heutigen Stand festhält. Danach folgen in dieser Reihenfolge Tests, Doku und das Zerlegen der großen Dateien. Neue Pakete sind nicht nötig.

### A) Struktur

```
Testläufe
+-- Schneller Lauf (ein Befehl, höchstens 3 Minuten)
|   +-- Unit-Tests
|   +-- Ein Production-Build
|   +-- Rund 15 markierte Kernwege
|
+-- Voller Lauf (ein Befehl, höchstens 8 Minuten)
    +-- Unit-Tests
    +-- Ein Production-Build
    +-- Gruppe 1: gemeinsames QA-Konto, nacheinander
    +-- Gruppe 2: eigene Testkonten, parallel
    +-- Gruppe 3: Papierkorb und Löschläufe, allein
    +-- Gruppe 4: Rate-Limit mit eigenem Server
    +-- Aufräumen am Ende

Gemeinsame Test-Hilfen
+-- Umgebung lesen und Stage-Sperre
+-- Konten anlegen und anmelden
+-- Projekte und Kapitel anlegen
+-- Warten, bis eine Seite bedienbar ist
+-- Temporäre Daten aufräumen

Doku
+-- features/PROJ-X.md         kurze, gültige Fassung
+-- features/archiv/PROJ-X.md  vollständiges Original
+-- docs/production/prod-umzug.md            Checkliste
+-- docs/production/prod-umzug-protokoll.md  Änderungsprotokoll
```

**So werden die großen Dateien geschnitten:**

| Datei | Zeilen | Wird herausgelöst |
|---|---|---|
| `EditorClient` | 1.271 | Seitenberechnung, ihre Steuerung und das Mitführen des Cursors |
| `ChapterSectionClient` | 874 | Dialoge fürs Anlegen, Umbenennen, Löschen und die Impulse, dazu das Sortieren |
| `PaginationDecorations` | 857 | Berechnung der Umbrüche und Bau der Abstände |
| `OnboardingWizard` | 694 | Die einzelnen Schritte |
| `CoverEditorClient` | 633 | Foto-Upload und Eingabefelder |
| `PersonalAreaClient` | 612 | Bereich „Konto löschen" |
| Stripe-Webhook | 610 | Abläufe für Erstkauf, Geschenk und Verlängerung |

### B) Daten

Keine Änderung an Datenbank oder gespeicherten Kundendaten.

**Das Sicherheitsnetz hält vor dem ersten Umbau fest:**
- Bilder von 6 Seiten in 3 Breiten mit festen Testdaten
- Seitenzahl und Umbrüche eines Referenzkapitels mit mindestens 40 Seiten und Bildern
- Größe des JavaScripts je Seite und die Ladezeiten aus PROJ-30
- Anzahl und Namen aller Testfälle

**Was in einer gekürzten Spec bleibt:** Status, Abhängigkeiten, User Stories, Akzeptanzkriterien, Randfälle, Nicht-Ziele, gültige technische Entscheidungen und offene Punkte. QA-Protokolle, Bau-Notizen und überholte Entwürfe stehen nur noch im Archiv.

### C) Technische Entscheidungen

1. **Erst messen, dann umbauen.** Ohne Vorher-Stand ließe sich „für Kunden ändert sich nichts" nicht belegen.
2. **Tests werden nach ihrer Abhängigkeit gruppiert.** Tests auf dem gemeinsamen QA-Konto würden sich parallel stören. Tests mit eigenen Konten dürfen gleichzeitig laufen. Löschläufe wirken auf die ganze Datenbank und laufen allein.
3. **Nur noch ein Build gegen die echte Production-Variante.** Heute kostet jeder der sechs Läufe einen eigenen Build. Der Standardbefehl nutzt außerdem noch den Dev-Server und Mobile Safari, das auf diesem Mac nicht startet.
4. **Der Rate-Limit-Test bekommt einen eigenen Server.** Nur so können die Limits dort aktiv sein, ohne alle anderen Tests zu blockieren. Damit entfallen die Schalter.
5. **Der echte Passwort-Reset bleibt außerhalb der automatischen Läufe,** weil er eine echte Mail auslösen würde.
6. **Das Archiv ist eine unveränderte Kopie.** So kann beim Kürzen nichts verloren gehen. Ein Skript prüft zusätzlich, dass jedes Akzeptanzkriterium in der Kurzfassung noch vorkommt.
7. **Noch offene Features werden nicht gekürzt.** Das gilt für PROJ-12, PROJ-30 und PROJ-31. Reines Verschieben ergibt rund 350 KB. Für das Ziel von 300 KB werden PROJ-6 und PROJ-24 zusätzlich verdichtet.
8. **Dateien werden nur verschoben, nicht neu geschrieben.** Pro Datei gibt es einen eigenen Schritt mit Prüfung. Server- und Browser-Code bleiben getrennt.
9. **Nur belegbar ungenutzter Code fällt weg.** Sicher ungenutzt sind 6 Funktionen und Konstanten sowie das Paket `@tiptap/extension-underline`. Die übrigen 12 Treffer werden einzeln geprüft. `@hookform/resolvers` bleibt, weil es zum festgelegten Formular-Stack gehört.

### D) Abhängigkeiten

Keine neuen Pakete. Entfernt wird voraussichtlich `@tiptap/extension-underline`.

### E) Risiken

| Risiko | Umgang |
|---|---|
| Parallele Tests stoßen an Limits von Supabase | Anzahl der parallelen Tests begrenzen. Reicht das nicht, nennt die QA die echte Laufzeit |
| Das Ziel von 8 Minuten ist knapp (geschätzt rund 7,5) | Langsame Wartezeiten in Tests gezielt verkürzen, ohne Prüfungen zu streichen |
| Das Zerlegen des Editors verändert den Seitenumbruch | Referenzkapitel und Bildvergleich nach jedem Schritt |
| Geänderte Grenzen zwischen Server und Browser | Build, Bundle-Vergleich und Prüfung auf Secrets |
| Beim Kürzen einer Spec fällt eine Entscheidung weg | Original im Archiv, Prüfskript, Stichprobe von 5 Specs |
| Aufräumen löscht fremde Daten | Nur Stage, nur Konten mit Test-Präfix und Domain `example.test`, QA-Konto ausdrücklich gesperrt |

### F) Reihenfolge

1. Sicherheitsnetz anlegen.
2. Test-Hilfen zusammenführen und die zwei Läufe bauen.
3. Specs, Prod-Umzug und Memory verdichten.
4. Große Dateien einzeln zerlegen, Editor zuletzt.
5. Ungenutzten Code entfernen.
6. QA gegen alle Kriterien.

## Implementation Notes (2026-11-23)
Vergleichswerte, entfernter Code und Abweichungen vom Tech Design stehen im [Protokoll](archive/PROJ-31-qa-2026-11-23.md).

- Die PROJ-17-Spec ist gekürzt, die uncommittete Statuszeile steht unverändert darin. Beim Commit muss diese eine Zeile draußen bleiben.
- Das Archiv liegt im vorhandenen Ordner `features/archive/`.
- Kauf- und Verlängerungsmails bekommen kein eigenes Protokoll in der App (Jakob, 2026-11-23).

## QA Test Results
**2026-11-23:** 25 von 25 Kriterien bestanden. 0 Critical, 0 High, 0 Medium, 1 Low offen. Safari und Firefox nicht geprüft. [Protokoll](archive/PROJ-31-qa-2026-11-23.md)
- **BUG-1 (Medium), behoben:** Noch gültige Folge-Punkte stehen wieder in den Kurzfassungen.
- **BUG-2 (Medium), behoben:** Die echte Reset-Mail läuft nur noch mit `E2E_REAL_MAIL=1`.
- **BUG-3 (Medium), behoben:** QA-Passwort auf Stage geändert, es steht nur noch in `.env.local`.
- **BUG-4 (Low), offen:** „siehe Sektion J“ in PROJ-5 zeigt nur noch ins Archiv.

## Deployment
_To be added by /deploy_
