# PROJ-25: Kapitel-Editor stabilisieren

## Status: Approved
**Created:** 2026-11-23
**Last Updated:** 2026-11-24 (QA: 25 von 25, AC-6 von Jakob auf Stage bestätigt)
**Freigegeben:** Spec und Tech Design von Jakob am 2026-11-23

## Dependencies
- Requires: PROJ-5 (Kapitel-Editor), PROJ-7 (buchweite Seitenzahl), PROJ-28 (Lesemodus), PROJ-31 (zerlegter Editor und Vergleichs-Tests)
- Vor: PROJ-34 (Bilder im Text und Hochkant), PROJ-21 (Seitenlayouts), PROJ-16 (Druck) und PROJ-32 (Schriftarten), die einen ruhigen Editor brauchen

## Ausgangslage (gemessen am 2026-11-23)

Gemessen im echten Production-Build mit einem Testkapitel von 14 Seiten und 7 Bildern.

| Bereich | Befund |
|---|---|
| Zeilenabstand | **Nachgestellt.** Nach dem Scrollen verschwindet beim Öffnen des Menüs die ganze Werkzeugleiste. Das Menü ist nicht sichtbar und lässt sich nicht bedienen. |
| Bilder beim Tippen und Löschen | **Teilweise nachgestellt.** Bei 21 von 36 Eingaben bewegten sich Bilder mehrfach, bei 4 sprangen sie auf einen früheren Stand zurück. Größter Sprung 582 px, Ruhe nach unter 0,1 s. |
| Bilder beim Layoutwechsel | Jeder Wechsel bewegt die Bilder zweimal, bis zu 326 px. |
| Langes Hin und Her | **Noch nicht nachgestellt.** Jakob sieht es beim Tippen, Löschen, Hinzufügen und beim Layoutwechsel. Das Nachstellen mit echten Fotos ist der erste Schritt. |
| Öffnen und Scrollen | Ruhig, keine Bewegung der Bilder. |
| Bild-Steuerung | Die Schalter „1", „2" und „+ Bild" legen sich über die letzte Textzeile vor der Bild-Sektion. |
| Öffnen des Editors | **Nachgestellt.** Nacheinander erscheinen zwei Ladezustände: erst eine Seite mit Platzhaltern, dann ein leerer Tisch mit „Wird geladen …", danach das Kapitel. Fertig nach 460 bis 630 ms. |

## Entscheidungen von Jakob (2026-11-23)

1. **Umfang:** PROJ-25 macht den Editor zuverlässig. Bilder im Text und Hochkant kommen direkt danach mit PROJ-34, Schriftarten mit PROJ-32, die Impuls-Bibliothek mit PROJ-33.
2. **Ursache statt Einzelpatches:** Jeder Fehler wird zuerst reproduzierbar gemacht und gemessen, dann an der Wurzel behoben.
3. **Seitenberechnung:** Die Berechnungen für Text und Bilder laufen künftig in fester Reihenfolge. Das war bisher für PROJ-21 vorgemerkt. Sie werden nicht zu einer zusammengelegt.
4. **Bildverhalten:** Muss ein Bild auf eine andere Seite, rückt es einmal direkt an seinen endgültigen Platz, ohne Tipp-Pause und ohne Animation.

## User Stories
- Als Schreibender möchte ich den Zeilenabstand an jeder Stelle im Kapitel ändern können, damit ich nicht erst nach oben scrollen muss.
- Als Schreibender möchte ich, dass Bilder ruhig an ihrem Platz bleiben, während ich schreibe, damit mich nichts ablenkt oder verunsichert.
- Als Schreibender auf dem Tablet möchte ich dieselbe Zuverlässigkeit wie am Computer.
- Als Käufer möchte ich mich darauf verlassen, dass Bildschirm und gedrucktes Buch übereinstimmen.
- Als Betreiber möchte ich, dass jeder behobene Editor-Fehler dauerhaft durch einen Test abgesichert ist, damit er nicht zurückkommt.

## Acceptance Criteria

### A. Zeilenabstand
- [x] AC-1: Das Menü öffnet sich an jeder Scroll-Position vollständig sichtbar direkt unter seinem Schalter.
- [x] AC-2: Die Werkzeugleiste bleibt beim Öffnen und Schließen des Menüs an ihrem Platz.
- [x] AC-3: Die Seite springt beim Öffnen, Auswählen und Schließen nicht. Die Scroll-Position bleibt, solange der Cursor sichtbar bleibt.
- [x] AC-4: Der gewählte Abstand gilt für den aktuellen Absatz oder die markierten Absätze, und der Cursor bleibt dort.
- [x] AC-5: Das Menü funktioniert mit Maus, Tastatur und Touch auf dem Tablet.

### B. Ruhige Bilder und Seiten
- [x] AC-6: Das von Jakob beschriebene lange Hin und Her ist mit echten Fotos reproduziert, seine Ursache ist in dieser Spec dokumentiert und behoben. **Abnahme:** Jakob hat am 2026-11-24 auf Stage (`c50abd0`) mit eigenen Fotos bestätigt, dass die Bilder ruhig bleiben. **Abweichung:** Das lange Hin und Her selbst wurde im Prüfstand nie nachgestellt. Gemessen und behoben sind die Mehrfachbewegungen und Rücksprünge durch die zwei unabgestimmten Seitenberechnungen. Dass sie auch die Ursache des langen Hin und Her waren, ist wahrscheinlich, aber nicht bewiesen.
- [x] AC-7: Nach einer Eingabe, die ein Bild verschiebt, ändert es seine Position höchstens einmal.
- [x] AC-8: Kein Bild springt nach einer Eingabe auf einen früheren Stand zurück.
- [x] AC-9: Spätestens 0,15 s nach Tippen, Löschen, Hinzufügen, Entfernen, Sortieren oder Layoutwechsel stehen alle Bilder endgültig.
- [x] AC-10: Nach einem manuellen Seitenumbruch bewegt sich der Text nur einmal.
- [x] AC-11: Ohne Eingabe bleibt die Seite völlig ruhig, auch während Fotos nachladen.
- [x] AC-12: Die Bild-Steuerung verdeckt keinen Text und bleibt bedienbar.

### C. Editor systematisch prüfen
- [x] AC-13: Eine Prüfliste deckt Tippen, Löschen, Einfügen aus der Zwischenablage, Rückgängig, Wiederholen, Formatierung, Listen, Zitate, Seitenumbruch, Bilder, Zoom und Speichern ab, jeweils am Seitenanfang, am Seitenende und mitten im Kapitel.
- [x] AC-14: Jeder dabei gefundene Fehler wird in dieser Spec mit Schritten und Schwere gelistet.
- [x] AC-15: Jeder in PROJ-25 behobene Fehler hat einen automatischen Test, der vor dem Fix scheitert und danach besteht.

### D. Nichts geht kaputt
- [x] AC-16: Das Referenzkapitel hat vorher und nachher dieselbe Seitenzahl und dieselben Umbrüche.
- [x] AC-17: Kein Text und kein Bild geht beim Speichern verloren, auch nicht bei schnellem Verlassen und mit der Zurück-Taste (PROJ-30).
- [x] AC-18: Tippen bleibt in einem Kapitel mit 40 Seiten und Bildern flüssig. Ein Zeichen erscheint in unter 0,1 s.
- [x] AC-19: Alles funktioniert auf Desktop und Tablet (768 px, Hoch- und Querformat des Geräts). Das Phone zeigt weiter den Hinweis statt des Editors.
- [x] AC-20: Alle bestehenden Tests bestehen, der schnelle und der volle Testlauf bleiben grün.

### E. Öffnen des Editors
- [x] AC-21: Beim Öffnen eines Kapitels gibt es nur einen Ladezustand: die Seite mit Platzhaltern und „Wird geladen …".
- [x] AC-22: Von diesem Ladezustand wechselt die Ansicht genau einmal direkt zum fertigen Kapitel, ohne leeren Zwischenstand und ohne Aufblitzen.
- [x] AC-23: Das gilt auch bei schneller Serverantwort, beim Neuladen, beim direkten Aufruf der Adresse und mit Zurück und Vorwärts.
- [x] AC-24: Das Kapitel erscheint nicht später als heute.
- [x] AC-25: Auf dem Phone erscheint weiter nur der Hinweis statt des Editors, ohne zusätzlichen Ladezustand.

## Edge Cases
- **Text liegt genau an einer Seitengrenze:** Das Bild wechselt einmal die Seite und pendelt bei unveränderter Eingabe nicht zurück.
- **Zeile wird abwechselnd hinzugefügt und gelöscht:** Das Bild folgt jeweils genau einmal.
- **Foto lädt nicht:** Der Platz bleibt in der richtigen Größe erhalten, und die Seite springt nicht.
- **Menü offen und Fenstergröße ändert sich:** Das Menü bleibt bedienbar oder schließt sich, die Werkzeugleiste bleibt.
- **Zeilenabstand über mehrere Seiten markiert:** Alle markierten Absätze ändern sich, die Ansicht springt nicht an den Kapitelanfang.
- **Zwei Personen bearbeiten dasselbe Kapitel:** Es bleibt beim bestehenden Last-Writer-Wins.

## Nicht in diesem Feature
- Bilder mitten im Text, neues Bild-Werkzeug, löschbare Platzhalter und Hochkant-Bilder (PROJ-34)
- Schriftarten (PROJ-32) und Impuls-Bibliothek (PROJ-33)
- Seitenvorlagen und druckfähige Layouts (PROJ-21)
- Zusammenlegen der beiden Seitenberechnungen zu einer
- Phone-Editor, Live-Co-Editing und andere Buchformate als A5

## Technical Requirements
- Eine HTML-Quelle für Bildschirm und späteres A5-PDF, keine Overlay-Hacks
- Keine Migration und keine Änderung an Anmeldung, RLS oder Stripe
- Kundentexte in der Sie-Form
- Browser: Chromium automatisch, Safari und Firefox vor dem Go-live

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

**Kurzfassung:** PROJ-25 braucht weder Backend noch Migration oder neue Pakete. Das Menü wird mit einer einzigen Regel repariert. Text und Bilder bekommen einen gemeinsamen Taktgeber, der alles in einem Durchgang berechnet, bevor der Browser etwas zeigt. Zuerst entsteht ein Prüfstand, der jede Bildbewegung misst.

### Was die Messung gezeigt hat (2026-11-23)

| Thema | Ergebnis |
|---|---|
| Zeilenabstand | Beim Öffnen sperrt das Menü die Seite. Dadurch löst sich die festsitzende Werkzeugleiste und liegt samt Menü rund 1.300 px über dem Bildschirm. |
| Lösung fürs Menü | Im Browser erprobt: Mit einer angepassten Sperre bleiben Leiste und Scroll-Position stehen. Menü, Maus und Tastatur funktionieren. |
| Bilder | Bei 150 Eingaben mit großen, fotoähnlichen Bildern bewegten sich die Bilder 30-mal mehrfach und sprangen 10-mal zurück. Spätestens nach 0,07 s war Ruhe. |
| Ursache | Text- und Bildberechnung stoßen sich über rund ein Dutzend Auslöser gegenseitig an. Jede rechnet mit dem halbfertigen Stand der anderen, und der Browser zeigt die Zwischenstände. |
| Tippen | Bei 34 Seiten erscheint ein Zeichen nach rund 32 ms, höchstens 40 ms. Für den neuen Ablauf ist also Spielraum da. |
| Öffnen | Zwei getrennte Ladeansichten: eine für das Warten auf den Server, eine zweite im Editor, bis das Layout ruhig ist. |
| **Noch offen** | **Das von Jakob beschriebene lange Hin und Her trat auch hier nicht auf.** Möglich ist, dass die vielen kurzen Sprünge beim Weitertippen so wirken. Belegt ist das nicht. |

### A) Struktur

```
Kapitel-Editor
+-- Ladezustand (eine Ansicht vom Klick bis zum fertigen Kapitel)
+-- Werkzeugleiste
|   +-- Zeilenabstand-Menü (Seite bleibt beim Öffnen stehen)
|
+-- Buchseiten
|   +-- Kopf und Bilder am Anfang
|   +-- Text mit Seitenumbrüchen
|   +-- Bilder am Ende
|       +-- Bild-Steuerung (liegt im Bildbereich, nicht mehr über dem Text)
|
+-- Seiten-Takt (neu)
    +-- Sammelt alle Auslöser: Tippen, Bilder, Zoom, Fenstergröße, Laden
    +-- Rechnet höchstens einmal pro Bildschirm-Bild
        1. Bilder am Anfang
        2. Text und Seitenumbrüche
        3. Bilder am Ende
        4. Prüfen: Hat sich etwas verschoben? Dann noch eine Runde
        5. Seitenzahl melden
    +-- Erst danach zeichnet der Browser

Prüfstand (nur in den Tests)
+-- Misst jede Bewegung jedes Bildes, Bild für Bild
+-- Referenzkapitel mit festen Seitenumbrüchen
+-- Prüfliste aller Editor-Abläufe
```

### B) Daten

Keine Änderung. Text, Bilder, Seitenzahl und Speichern bleiben, wie sie sind. Der Seiten-Takt arbeitet nur im Browser und speichert nichts Neues.

### C) Technische Entscheidungen

1. **Die Seitensperre wird an der Wurzel repariert.** Der Fehler entsteht, weil die Sperre die Seite zu einem eigenen Scroll-Bereich macht. Die angepasste Regel gilt für alle Menüs und Dialoge. Ein Austausch nur dieses einen Menüs ließe denselben Fehler bei den anderen bestehen.
2. **Ein Taktgeber statt gegenseitiger Auslöser.** Alle Änderungen laufen an einer Stelle zusammen. So gibt es eine feste Reihenfolge, und keine Berechnung arbeitet mit einem halbfertigen Stand.
3. **Erst fertig rechnen, dann zeigen.** Zwischenstände sieht niemand mehr. Das erfüllt „höchstens eine Bewegung" direkt, statt Sprünge nachträglich zu dämpfen.
4. **Die beiden Berechnungen bleiben getrennt.** Sie werden nur in Reihenfolge gebracht. Das hält das Risiko für die Seitenumbrüche klein.
5. **Die Zahl der Runden ist begrenzt.** Pro Durchgang gibt es höchstens vier Runden. So kann der Editor nie in eine Endlosschleife geraten, auch wenn zwei Zustände um eine Seitengrenze ringen.
6. **Feste Wartezeiten entfallen.** Heute wird nach dem Öffnen mehrfach auf Verdacht neu gerechnet, bis zu 5 Sekunden lang. Künftig rechnet der Editor nur noch, wenn wirklich etwas passiert, zum Beispiel wenn ein Foto fertig geladen ist.
7. **Die Bild-Steuerung zieht in den Bildbereich.** Dort kann sie keinen Text mehr verdecken. Auf dem Tablet erscheint sie beim Antippen, weil es dort kein Überfahren mit der Maus gibt.
8. **Erst der Test, dann der Fix.** Jeder Fehler bekommt zuerst einen Test, der ihn zeigt. Das Referenzkapitel wird ein fester Test im Repo und läuft bei jedem vollen Testlauf mit.
9. **Das lange Hin und Her wird mit Jakob abgeschlossen.** Nach dem Umbau prüft er es auf Stage mit seinen eigenen Fotos. Tritt es weiter auf, halten wir die genauen Schritte fest und beheben die Ursache noch in PROJ-25.
10. **Eine Ladeansicht beim Öffnen.** Es bleibt die Seite mit Platzhaltern aus PROJ-30. Der Editor zeigt sie weiter, bis das Kapitel fertig ist, statt auf einen leeren Tisch zu wechseln. Weil beide Phasen gleich aussehen, ist der Übergang nicht sichtbar.

### D) Abhängigkeiten

Keine neuen Pakete.

### E) Risiken

| Risiko | Umgang |
|---|---|
| Der neue Ablauf verändert Seitenumbrüche | Referenzkapitel und Bildvergleich nach jedem Schritt |
| Eine Berechnung pro Bild wird bei langen Kapiteln zu langsam | Messung bei 40 Seiten, Grenze 0,1 s je Zeichen |
| Die angepasste Sperre wirkt auf andere Dialoge | Voller Testlauf und Prüfung aller Dialoge in drei Breiten |
| Jakobs langes Hin und Her hat eine andere Ursache | Prüfung mit seinen Fotos, AC-6 bleibt bis dahin offen |
| Safari rechnet anders als Chromium | Handtest vor dem Go-live |

### F) Reihenfolge

1. Prüfstand, Referenzkapitel und Tests, die die heutigen Fehler zeigen.
2. Seitensperre reparieren.
3. Seiten-Takt einführen, Text und Bilder nacheinander anschließen.
4. Bild-Steuerung umziehen und beim Öffnen nur noch einen Ladezustand zeigen.
5. Prüfliste abarbeiten, jeden Fund mit Test beheben.
6. Handtest von Jakob mit eigenen Fotos auf Stage, danach QA.

## Implementation Notes (Frontend, 2026-11-24)

| Prüfung | Vorher | Nachher |
|---|---|---|
| Zeilenabstand nach dem Scrollen | Leiste und Menü unsichtbar | Funktioniert mit Maus, Tastatur und Touch |
| Bildbewegungen je Eingabe | bis zu 3, mit Rücksprüngen | höchstens 1, kein Rücksprung, Ruhe nach höchstens 0,15 s |
| Ladezustände beim Öffnen | 2 | 1, auch bei Neuladen, Zurück und Vorwärts |
| Kapitel sichtbar nach | 460 bis 630 ms | 450 bis 560 ms |
| Tippen im langen Kapitel (95 % der Tasten) | 40 ms | 48 bis 56 ms |
| Referenzkapitel | 41 Seiten | identische Seiten und Umbrüche |
| Schneller / voller Testlauf | 2:05 / 7:52 | 2:26 / 11:13 mit 20 neuen E2E-Tests |

**Gebaut**
- **Seitensperre:** eine Regel in `globals.css`. Sie gilt für alle Menüs und Dialoge.
- **Seiten-Takt:** `pageLayoutClock.ts` sammelt alle Auslöser und rechnet Bilder und Text vor dem Zeichnen. Die gegenseitigen Events und die festen Wartezeiten bis 5 Sekunden sind entfernt. Die zwei Berechnungen bleiben getrennt.
- **Bild-Steuerung:** liegt mittig auf der ersten Bildreihe, unter den Symbolen zum Verschieben und Löschen.
- **Ein Ladezustand:** Server-Wartezeit, Editor-Aufbau sowie Zurück und Vorwärts zeigen dieselbe Seite mit Platzhaltern.
- **Prüfstand:** `tests/PROJ-25-editor-stabil.spec.ts`, `tests/PROJ-25-pruefliste.spec.ts` und `tests/helpers/editor-bench.ts`. Die Prüfliste testet 14 Abläufe an je drei Stellen im Kapitel.

**Funde aus der Prüfliste (AC-14), alle behoben und mit Test**
- **F-1 (Medium):** Beim Zoomen mitten im Kapitel rutschte die aktuelle Stelle aus dem Bild. Der Cursor bleibt jetzt an seinem Platz.
- **F-2 (Low):** Nach Zurück und Vorwärts erschien ein zweiter Ladehinweis.

**Hinweise**
- Die erste Messung in der Ausgangslage las auch Zwischenstände vor dem Zeichnen. Der Prüfstand misst direkt nach dem Zeichnen und hat die Mehrfachbewegungen dort bestätigt.
- Im Bildvergleich weichen nur zwei Tablet-Bilder ab, und nur durch die gewollt verschobene Bild-Steuerung.
- Das JavaScript von Cover und Onboarding ist gerundet je 1 KB größer, die übrigen Seiten sind gleich.
- Bei einem Abschnitt über mehrere Seiten sitzt die Bild-Steuerung weiter nur auf der ersten Reihe.

**Noch offen**
- Safari, Firefox und echte Tablets sind nicht geprüft (vor dem Go-live).

## QA Test Results

**Getestet:** 2026-11-24, echter Production-Build lokal gegen die Stage-Datenbank, Chromium, eigene temporäre Testdaten.

**Ergebnis:** 25 von 25 Kriterien bestanden, AC-6 durch Jakobs Test auf Stage. Offen sind 0 Critical, 0 High, 0 Medium, 1 Low. BUG-1 (High) ist behoben.

**Production Ready: JA.** Es gibt keinen offenen Critical- oder High-Bug. Vor dem Go-live stehen noch die Prüfungen in Safari, Firefox und auf echten Tablets aus.

**Nicht geprüft:** Safari, Firefox und echte Tablets (Tablet nur als Chromium-Ansicht mit Touch). Die automatischen Tests liefen lokal, nicht gegen das Stage-Deployment.

### Geprüft

| Bereich | Ergebnis |
|---|---|
| Voller Testlauf nach BUG-1 | 321 E2E-Tests bestanden, 2 bewusst übersprungen, Unit-Tests und Build grün, 12:19 |
| Referenzkapitel | 41 Seiten, identische Umbrüche |
| Zeile abwechselnd dazu und weg an der Seitengrenze | Höchstens eine Bewegung, kein Rücksprung |
| Foto lädt nicht | Platz bleibt, keine Bewegung |
| Späte Schriften, langer Titel, Wechsel Phone zu Tablet | Layout korrekt, gespeicherte Seitenzahl bleibt |
| Kapitelwechsel in der App | Seiten-Takt läuft weiter |
| Großer eingefügter Text | Eine Bewegung nach 68 ms |
| Dialoge in Editor und Konto | Scroll-Position, Leiste und Breite bleiben, Hintergrund ist gesperrt |
| Editor sofort wieder verlassen | Keine Ladeansicht bleibt zurück |
| Druckansicht | Steuerung und Ladeansicht erscheinen nicht |
| Rund 95 Seiten | Tippen im Median 72 ms, 95 % unter 120 ms |

### Sicherheit

Geändert wurde nur Browser-Code. Keine Änderung an Migrationen, RLS, Anmeldung, Server Actions, Routen, Stripe oder Mails. Keine neuen HTML-Einfügungen oder Browser-Speicher, keine Secrets im Browser-Code oder in geänderten Dateien.

### Bugs

#### BUG-1 (High, behoben am 2026-11-24): Nach dem Zeilenabstand geht das Weiterschreiben ins Leere
- **Kriterium:** AC-4
- **Schritte:** In einen Absatz klicken, im Menü „2,0" wählen, sofort weitertippen.
- **Erwartet:** Der Text erscheint an der Cursorstelle.
- **Vorher:** Der Abstand änderte sich, aber der Fokus blieb auf dem Menü-Schalter. Die getippten Zeichen landeten nirgends. Der Fehler bestand schon vor PROJ-25.
- **Behebung:** Beim Schließen des Menüs geht der Fokus direkt zurück in den Text. Nur wer das Menü mit der Tastatur geöffnet und mit Escape abgebrochen hat, bleibt auf dem Schalter.
- **Nachtest:** Der neue AC-4-Test war vor der Behebung rot und ist danach grün.
- **Einmaliger Ausfall:** Der AC-4-Test scheiterte einmal in einem vollen Lauf bei der Escape-Prüfung. Die Ursache ist nicht bewiesen. In 12 Einzelläufen, 3 Läufen aller Editor-Tests und 24 Läufen unter starker Last kam er nicht wieder. Vorsorglich wurde eine verzögerte Fokus-Verschiebung entfernt. Danach bestanden die Editor-Tests in 3 weiteren vollen Läufen.

**Nebenbefund Testlauf:** Der Löschlauf-Test von PROJ-28 verglich die Datenbank-Zeit mit der Uhr des Testrechners und scheiterte, wenn diese einige Millisekunden nachging. Er vergleicht jetzt beide Zeitpunkte aus der Datenbank und verlangt genau 14 Tage. Der Produktcode blieb dafür unverändert.

#### BUG-2 (Low): Bild-Steuerung nur auf der ersten Reihe
- **Schritte:** Einen Bildabschnitt über mehrere Seiten anlegen und ein Bild auf einer späteren Seite überfahren.
- **Tatsächlich:** Die Schalter „1", „2" und „+ Bild" liegen auf der ersten Reihe und sind dort nicht im Blick. Das war schon vorher so.
- **Priorität:** Kann mit PROJ-34 gelöst werden, das die Bildabschnitte ohnehin umbaut.

## Deployment
_To be added by /deploy_
