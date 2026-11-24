# PROJ-35: Automatische Silbentrennung

## Status: In Progress
**Created:** 2026-11-24
**Last Updated:** 2026-11-24
**Freigegeben:** Spec und Tech Design von Jakob am 2026-11-24

## Dependencies
- Requires: PROJ-5 (Kapitel-Editor), PROJ-25 (Ruhe-Kriterien und Prüfstand mit Referenzkapitel), PROJ-34 (Seiten-Takt mit Bildern im Text), PROJ-7 (buchweite Seitenzahl), PROJ-28 (Lesemodus)
- Vor: PROJ-32 (Schriftarten, ändert ebenfalls Umbrüche) und PROJ-16 (Druck, braucht dieselben Trennungen)

## Ausgangslage (gemessen am 2026-11-24)
Gemessen im Production-Build mit drei Absätzen und einem Zitat voller langer Wörter („Lebensmittelmarken", „Eisenbahnverbindung", „Versicherungskaufmann").

- **Zwei Wege, zwei Regeln:** Beim Öffnen eines Kapitels setzt ein Wörterbuch unsichtbare Trennstellen in den Text. Für frisch getippte Wörter trennt der Browser mit seinen eigenen Regeln. Das Wörterbuch trennt schon nach 2 Buchstaben („Woh-nung", „neben-bei"), der Browser erst ab 4 vor und nach der Trennstelle.
- **Umbrüche ändern sich beim Neuöffnen:** Frisch getippt hatten die drei Absätze 4 Trennungen, nach dem Neuöffnen 6. Die Zeilen verschieben sich also, ohne dass jemand etwas geändert hat. In längeren Kapiteln kann sich dadurch die Seitenzahl ändern.
- **Geräteabhängig:** Die Browser-Trennung unterscheidet sich zwischen Chrome, Safari und Firefox. Dasselbe Kapitel kann auf dem iPad andere Umbrüche und Seitenzahlen haben als am Computer, und der spätere Druck wieder andere.
- **Unsichtbare Zeichen im Text:** Nach der ersten Bearbeitung stehen die Trennstellen im gespeicherten Text (87 unsichtbare Zeichen in drei Absätzen). An jeder davon braucht die Pfeiltaste einen zusätzlichen Druck, ohne dass sich der Cursor sichtbar bewegt, und die Rücktaste löscht dort scheinbar nichts.
- **Zitate:** Der Code will Zitate vom Wörterbuch ausnehmen, die Ausnahme greift aber nicht. Zitate werden heute getrennt.

## Entscheidungen von Jakob (2026-11-24)
- **Überall gleich:** Ein einziges Trennverfahren. Trennungen erscheinen sofort beim Tippen, sind auf Desktop, Tablet und im Druck identisch, und Umbrüche ändern sich beim Neuöffnen nicht mehr.
- **Immer an:** Kein Schalter, weder je Buch noch je Kapitel.
- **Bereiche:** Getrennt wird in Absätzen, Listen und Zitaten, wenn sie im Blocksatz oder linksbündig stehen. Zentrierter oder rechtsbündiger Text und Kapiteltitel werden nie getrennt.
- **Buchregeln:** Mindestens 3 Buchstaben vor und nach der Trennstelle, höchstens 3 getrennte Zeilen hintereinander, kein Wort über eine Seitengrenze.
- **Keine Ausnahmen per Hand:** Kein Werkzeug, um Wörter von der Trennung auszunehmen oder Trennstellen selbst zu setzen. Namen werden wie andere Wörter nach Silben getrennt.

## User Stories
- Als schreibende Person möchte ich, dass lange Wörter am Zeilenende sauber getrennt werden, damit der Blocksatz keine großen Lücken hat und mein Text wie in einem gedruckten Buch aussieht.
- Als schreibende Person möchte ich, dass ein Kapitel beim nächsten Öffnen genauso aussieht wie beim Verlassen, damit ich mich auf die Seitenansicht verlassen kann.
- Als Projektleitung möchte ich, dass das Buch auf meinem iPad, am Computer der Großeltern und im Druck dieselben Seiten hat, damit die Seitenzahlen überall stimmen.
- Als schreibende Person möchte ich mit Pfeiltasten und Rücktaste ganz normal durch den Text gehen, ohne an unsichtbaren Stellen hängen zu bleiben.
- Als Projektleitung möchte ich, dass zentrierte Texte wie eine Widmung oder ein Gedicht nicht getrennt werden, damit sie so stehen, wie sie geschrieben wurden.
- Als NARRAVIT möchte ich, dass der gespeicherte Text frei von Trennzeichen ist, damit Druck, Audio-Erzählen und Lektorat mit dem reinen Text arbeiten.

## Acceptance Criteria

### A. Überall gleich
- [ ] AC-1: Ein Wort wird an derselben Stelle getrennt, egal ob es getippt, eingefügt oder beim Öffnen geladen wurde.
- [ ] AC-2: Wird ein Kapitel ohne Änderung geschlossen und wieder geöffnet, sind alle Zeilenumbrüche, Trennungen und die Seitenzahl unverändert.
- [ ] AC-3: Chrome, Safari und Firefox zeigen auf Desktop und Tablet für dasselbe Kapitel dieselben Trennungen, Zeilenumbrüche und Seitenzahlen.
- [ ] AC-4: Lesemodus (PROJ-28) und Druckansicht zeigen dieselben Trennungen wie der Editor.
- [ ] AC-5: Die Trennung erscheint mit dem Tastendruck, der den Zeilenumbruch auslöst. Danach springt die Zeile nicht mehr nach (Ruhe-Kriterien aus PROJ-25 AC-7 bis AC-11).

### B. Buchregeln
- [ ] AC-6: Getrennt wird nach der neuen deutschen Rechtschreibung, zum Beispiel „Kar-tof-fel", „Zu-cker", „Fens-ter", „Eisen-bahn-ver-bin-dung".
- [ ] AC-7: Vor und nach der Trennstelle stehen mindestens 3 Buchstaben. Wörter mit weniger als 6 Buchstaben werden nie getrennt.
- [ ] AC-8: Höchstens 3 aufeinanderfolgende Zeilen enden mit einem Trennstrich.
- [ ] AC-9: Die letzte Zeile einer Seite endet nie mit einem Trennstrich. Kein Wort wird über eine Seitengrenze getrennt.
- [ ] AC-10: Das letzte Wort eines Absatzes wird nicht getrennt, damit kein Wortrest allein in der letzten Zeile steht.
- [ ] AC-11: Wörter ganz in Großbuchstaben, Wörter mit Ziffern sowie Mail- und Webadressen werden nie getrennt.
- [ ] AC-12: Wörter mit Bindestrich („Mutter-Kind-Kur") werden nur am vorhandenen Bindestrich umbrochen, ohne zusätzlichen Trennstrich.
- [ ] AC-13: Englische Wörter im deutschen Text („Meeting", „Feeling", „Weekend") werden nicht nach deutschen Regeln falsch getrennt. Im Zweifel bleibt ein Fremdwort ganz.

### C. Bereiche
- [ ] AC-14: Getrennt wird in Absätzen, Listen und Zitaten, die im Blocksatz oder linksbündig stehen.
- [ ] AC-15: Zentrierter und rechtsbündiger Text wird nie getrennt. Ändert man die Ausrichtung, passen sich die Trennungen sofort an.
- [ ] AC-16: Kapiteltitel werden nie getrennt.
- [ ] AC-17: Die Trennung ist immer an. Es gibt keinen Schalter.

### D. Schreiben und Text
- [ ] AC-18: Pfeiltasten, Rück- und Entfern-Taste verhalten sich, als gäbe es keine Trennstellen: Jeder Druck bewegt den Cursor sichtbar oder löscht ein sichtbares Zeichen.
- [ ] AC-19: Ein am Zeilenende getrenntes Wort lässt sich per Doppelklick als ganzes Wort markieren.
- [ ] AC-20: Der gespeicherte Text enthält keine automatisch gesetzten Trennzeichen. Unsichtbare Trennzeichen aus bestehenden Kapiteln verschwinden beim nächsten Speichern, ohne dass sich der sichtbare Text ändert.
- [ ] AC-21: Kopierter Text enthält weder Trennstriche vom Zeilenende noch unsichtbare Trennzeichen.
- [ ] AC-22: Die Wortzahl ändert sich durch die Trennung nicht.

### E. Seiten und Tempo
- [ ] AC-23: Seitenzahl des Kapitels und buchweite Seitenzahlen (PROJ-7) passen zu den Trennungen im Editor.
- [ ] AC-24: Das Tippen bleibt so schnell wie heute: höchstens 50 ms je Tastendruck (p95) im Referenzkapitel aus PROJ-25.
- [ ] AC-25: Ein Kapitel öffnet höchstens 10 % langsamer als vor diesem Feature (Referenzkapitel und volles Testbuch aus PROJ-30).
- [ ] AC-26: Umbrüche und Seitenzahlen bestehender Kapitel ändern sich einmalig mit der Einführung. Danach ist der neue Stand der feste Vergleich für den Prüfstand.
- [ ] AC-27: Alle bestehenden Tests bestehen, neue Abläufe haben eigene Tests.

## Edge Cases
- **Wort breiter als die Zeile ohne erlaubte Trennstelle** (Fantasiewort, sehr langer Name): wird notfalls ohne Trennstrich umbrochen, wie heute. Es ragt nie über den Rand hinaus.
- **Formatwechsel mitten im Wort** (etwa „**Groß**mutter"): wird wie ein Wort getrennt, die Formatierung bleibt.
- **Apostroph** („gibt's", „Hildegard's"): Der Apostroph gehört zum Wort und wird nicht von ihm getrennt.
- **Text aus Word oder einer Mail mit eigenen bedingten Trennstrichen:** wird wie getippter Text behandelt, die fremden Trennstellen fallen weg.
- **Bewusst getippter Bindestrich am Zeilenende:** bleibt stehen, auch wenn das Wort in die nächste Zeile rückt.
- **Alte Rechtschreibung oder Dialekt** („daß", Plattdeutsch): wird nach den deutschen Regeln getrennt. Einzelne ungewöhnliche Trennungen sind hingenommen, weil es kein Ausnahme-Werkzeug gibt.
- **Ausrichtung wechselt** (Blocksatz zu zentriert und zurück): Trennungen verschwinden und erscheinen sofort, ohne Nachspringen.
- **Seitengrenze verschiebt sich durch Tippen weiter vorn:** Eine Trennung, die dadurch auf die letzte Zeile einer Seite rutscht, wird aufgehoben (AC-9).
- **Rückgängig und Wiederholen:** stellen den Text wieder her, die Trennungen folgen ohne eigenen Schritt in der Historie.
- **Lesemodus und Druck ohne Bearbeitung:** zeigen dieselben Trennungen wie der Editor, auch bei Kapiteln, die vor diesem Feature gespeichert wurden.

## Nicht in diesem Feature
- Schalter zum Abschalten der Trennung
- Wörter per Hand von der Trennung ausnehmen oder eigene Trennstellen setzen
- Trennung nach den Regeln anderer Sprachen als Deutsch (Englisch nur als Schutz vor falschen Trennungen)
- Schriftarten (PROJ-32), Druck-PDF (PROJ-16), Rechtschreibprüfung
- Steuerung einzelner Zeilen am Seitenanfang oder -ende (Hurenkinder und Schusterjungen)
- Phone-Editor, Live-Co-Editing und andere Buchformate als A5

## Technical Requirements
- **Eine HTML-Quelle:** Bildschirm, Lesemodus und späterer Druck nutzen dieselbe Trennung (Print-First, PROJ-16).
- **Unabhängig vom Browser:** Das Ergebnis darf nicht vom Wörterbuch des Browsers oder Betriebssystems abhängen.
- **Lokal:** Kein Text verlässt für die Trennung das Gerät oder den eigenen Server. Kein externer Dienst.
- **Lizenz:** Das Wörterbuch muss für den kommerziellen Druck von Büchern genutzt werden dürfen.
- **Tempo:** Tippen p95 höchstens 50 ms, Öffnen höchstens 10 % langsamer (AC-24, AC-25).
- **Browser:** Chrome, Safari und Firefox auf Desktop und Tablet. Phone zeigt weiter den Hinweis statt des Editors.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Was Prüfung und Messung gezeigt haben (2026-11-24)
- **Heute:** Beim Öffnen schreibt ein Wörterbuch unsichtbare Trennzeichen in den Text, beim Tippen trennt der Browser. Der Seiten-Takt (PROJ-25, PROJ-34) teilt Absätze zeilenweise auf Seiten auf und behandelt die unsichtbaren Trennzeichen beim Seitenumbruch wie Wortgrenzen. Deshalb kann heute ein Wort über eine Seitengrenze getrennt werden.
- **Probe im Editor (Chromium, Production-Build, 5 Seiten):** Die Trennstellen wurden nur angezeigt und nicht in den Text geschrieben, die Browser-Trennung war aus.
  - Trennstriche erscheinen am Zeilenende.
  - Der Text enthält keine Trennzeichen, kopierter Text auch nicht.
  - 16 Pfeildrücke landen genau hinter „Großmutter“ (heute: zwei Zeichen davor), 4 Rücktasten löschen 4 sichtbare Zeichen (heute: 3).
  - Tippen 34 ms je Tastendruck (p95), Seitenzahl unverändert.
  - Eine Variante ohne Hülle um die Trennstelle hatte wieder einen unsichtbaren Stopp und Trennzeichen im kopierten Text. Sie scheidet aus.
- **Wörterbuch:** Das vorhandene Wörterbuch trennt nach neuer Rechtschreibung („Zu-cker", „Fens-ter", „Kar-tof-fel", „Ei-sen-bahn-ver-bin-dung") und lässt unklare Fälle lieber ganz („Staubecken"). Das Trennprogramm steht unter BSD-Lizenz, das deutsche Musterpaket nennt aber keine Lizenz.

### A) Struktur
```
Kapitel-Editor (Bearbeiten, Lesemodus, Druckansicht)
+-- Text (gespeichert wie getippt, ohne Trennzeichen)
+-- Trenn-Anzeige (neu)
|   +-- zeigt erlaubte Trennstellen als unsichtbare Markierung neben dem Text
|   +-- rechnet nur Absätze neu, die sich gerade geändert haben
|   +-- lässt zentrierten und rechtsbündigen Text sowie Titel aus
+-- Seiten-Takt (PROJ-25, PROJ-34)
    +-- 1. Text, Bilder und Seitenumbrüche in Lesereihenfolge setzen
    +-- 2. Trenn-Korrektur (neu): Trennung am Seitenende oder 4. Trennzeile
    |      in Folge gefunden -> diese eine Trennstelle aufheben
    +-- 3. betroffene Seiten neu setzen, noch vor dem Zeichnen

Trenn-Baustein (neu, ohne Bildschirm)
+-- Wörterbuch (Deutsch, neue Rechtschreibung) und Schutz für englische Wörter
+-- Buchregeln: 3 Buchstaben vor und nach der Trennstelle, Wörter ab 6 Buchstaben,
|   letztes Wort eines Absatzes ganz, Großbuchstaben, Ziffern, Mail- und
|   Webadressen ganz, Wörter mit Bindestrich nur am Bindestrich
+-- liefert für einen Absatz die erlaubten Trennstellen, immer dieselben
```

### B) Daten
- **Keine neue Tabelle, keine Migration, keine Änderung an RLS oder Auth.**
- Der Kapiteltext wird ohne Trennzeichen gespeichert. Trennstellen sind reine Anzeige und werden bei jedem Öffnen aus dem Text berechnet.
- **Alte Kapitel:** Beim Öffnen werden vorhandene unsichtbare Trennzeichen aus dem Text genommen, ohne zu speichern (wie die Umwandlung in PROJ-34). Beim nächsten Speichern ist der Text sauber. Der Server entfernt Trennzeichen beim Speichern zusätzlich, auch aus eingefügtem Text.

### C) Technische Entscheidungen
- **Anzeigen statt einschreiben:** Die Trennstellen stehen neben dem Text, nicht in ihm. Dadurch bleiben Speichern, Kopieren, Rückgängig, Wortzahl, Audio-Erzählen und Lektorat automatisch sauber, und die Tasten haben keine unsichtbaren Stopps. Die Probe hat das in Chromium bestätigt.
- **Ein Trenn-Baustein für alles:** Tippen, Öffnen, Lesemodus und Druckansicht fragen denselben Baustein. Er läuft im Browser und kann später auf dem Server für den Druck (PROJ-16) dieselben Trennstellen liefern. Die Browser-Trennung wird im Buchtext abgeschaltet, damit kein Gerät eigene Regeln einbringt.
- **Regeln ohne Seitenwissen im Baustein, Regeln mit Seitenwissen im Seiten-Takt:** Mindestlängen, letztes Wort und Ausnahmen entscheidet der Baustein vorab. Ob eine Trennung am Seitenende landet oder die vierte in Folge wäre, zeigt erst das Setzen der Seiten. Der Seiten-Takt hebt dann genau diese Trennstelle auf und setzt die betroffenen Seiten neu, im selben Durchgang vor dem Zeichnen. So bleibt die Ruheregel aus PROJ-25 erfüllt (höchstens eine Bewegung je Eingabe).
- **Nur geänderte Absätze neu rechnen:** Beim Tippen wird nur der Absatz unter dem Cursor neu getrennt. Das hält das Tippen unter 50 ms.
- **Wörterbuch mit klarer Lizenz:** Vor dem Bau wird die Lizenz des deutschen Musterpakets geklärt. Ist sie nicht eindeutig für den kommerziellen Druck nutzbar, kommen die deutschen Trennmuster aus der TeX-Sammlung (hyph-utf8, neue Rechtschreibung, MIT-Lizenz) zum Einsatz. Der Prüfstand vergleicht beide an einer Wortliste.
- **Einmalige Verschiebung:** Mit der Einführung ändern sich Umbrüche und Seitenzahlen aller Kapitel einmal (AC-26). Das Referenzkapitel im Prüfstand bekommt danach einen neuen festen Stand.

### D) Abhängigkeiten
- `hypher` bleibt (BSD-3, schon installiert).
- Deutsche Trennmuster: `hyphenation.de` bleibt nur bei geklärter Lizenz, sonst Ersatz durch die MIT-lizenzierten Muster aus hyph-utf8. Englische Muster nur zum Schutz englischer Wörter.
- Keine weiteren Pakete, kein externer Dienst.

### E) Risiken
- **Safari und Firefox nicht gemessen:** Die Probe lief nur in Chromium. Wie Safari den Cursor an den Trennmarkierungen führt, ist offen. Gegenmaßnahme: Als erster Bauschritt kommt nur die Anzeige auf Stage, und Jakob prüft auf seinem iPad Tippen, Pfeiltasten, Rücktaste und Kopieren, bevor Regeln und Seiten-Korrektur folgen.
- **Gleiche Trennstellen sind noch nicht gleiche Zeilen:** Browser messen Schriftbreiten minimal unterschiedlich. Bei sehr knapp vollen Zeilen kann ein Wort in Safari oder Firefox trotzdem in die nächste Zeile rutschen. Die Silbentrennung beseitigt die große Ursache, eine kleine bleibt möglich. Gegenmaßnahme: im Prüfstand Chrome und iPad am Referenzkapitel vergleichen. Bleiben Abweichungen, entscheidet Jakob, ob sie hingenommen werden oder ob ein eigener Zeilenumbruch nötig wird (großer Umbau, gehört zu PROJ-21).
- **Viele Markierungen:** Etwa 170 je Seite, in langen Kapiteln mehrere Tausend. Gegenmaßnahme: Öffnen mit dem vollen Testbuch aus PROJ-30 messen (AC-25).
- **Seiten-Korrektur:** Hebt die Korrektur eine Trennung auf, verschiebt sich der Rest des Absatzes. Das muss im selben Durchgang geschehen. Der Ruhe-Prüfstand aus PROJ-25 misst das.
- **Tastatur auf dem Tablet:** Während ein Wort mit Autokorrektur noch entsteht, darf seine Markierung nicht wechseln. Die Anzeige wartet, bis das Wort fertig ist.

### F) Reihenfolge
1. Trenn-Baustein mit Buchregeln und Wortliste als Prüfstand. Die Lizenz ist geklärt.
2. Trenn-Anzeige im Editor, Browser-Trennung aus, Trennzeichen beim Öffnen und Speichern entfernen. **Danach Prüfung auf Jakobs iPad über Stage.**
3. Trenn-Korrektur im Seiten-Takt: Seitenende und höchstens 3 Trennzeilen.
4. Messen: Ruhe, Tippen, Öffnen mit vollem Testbuch, Referenzkapitel neu festhalten.
5. Tests für alle Kriterien, Doku.

## Implementation Notes (Frontend, Schritte 1 und 2, 2026-11-24)

**Gebaut**
- **Trenn-Baustein** `src/lib/hyphenation/index.ts`: liefert für einen Absatztext die erlaubten Trennstellen. Es gelten die Buchregeln aus Spec AC-7, AC-10 bis AC-13: 3 Buchstaben vor und nach der Trennstelle, Wörter ab 6 Buchstaben, das letzte Wort eines Absatzes bleibt ganz, ebenso Großbuchstaben, Ziffern, Mail- und Webadressen, Pfade und Apostroph-Wörter. Wörter mit Bindestrich werden nur am Bindestrich umbrochen. Für englische Wörter gibt es eine kleine Liste, sie bleiben ganz (Meeting, Feeling, Weekend, Shopping …). Dazu `stripSoftHyphensFromBody` für alte Trennzeichen.
- **Wörterbuch gewechselt:** Das bisherige Paket `hyphenation.de` hatte keine Lizenz. Jetzt kommen die deutschen Muster aus hyph-utf8 (Deutschsprachige Trennmustermannschaft, Stand 2024, MIT) über das Paket `hyphen` 1.14.1 (ISC), von Jakob freigegeben. `hypher`, `hyphenation.de` und `hyphenation.en-us` sind entfernt. Das Wörterbuch ist größer (rund 148 KB gepackt statt 44 KB), es lädt nur im Editor und parallel zur Seite.
- **Trenn-Anzeige** `tiptap/Hyphenation.ts` (ersetzt `HyphenationOnLoad`): Die Trennstellen sind Markierungen neben dem Text, ProseMirror-Widgets mit Hülle. Beim Tippen wird nur der geänderte Absatz neu getrennt, auch bei einem Wechsel der Ausrichtung. Zentrierter und rechtsbündiger Text bleibt ungetrennt. Während einer Wort-Eingabe mit Autokorrektur bleibt der Absatz unter dem Cursor unverändert und wird danach getrennt. Eingefügter Text verliert mitgebrachte Trennzeichen.
- **Browser-Trennung aus** (`hyphens: manual` in `globals.css`), die alten Grenzwerte `hyphenate-limit-chars` sind entfernt.
- **Einblenden erst mit Wörterbuch:** Der Editor blendet den Text ein, wenn Schrift und Wörterbuch bereit sind (`EditorClient.tsx`). So bricht nach dem Einblenden nichts mehr um.
- **Alte Trennzeichen:** Die Seite entfernt sie beim Laden, ohne zu speichern (`page.tsx`), die Speicher-Aktion entfernt sie vor jedem Speichern (`actions.ts`).

**Beim Testen gefunden und behoben**
- **Kopieren direkt nach dem Markieren mit der Tastatur** nahm die Trennmarkierungen mit: ProseMirror kannte die neue Markierung noch nicht und überließ das Kopieren dem Browser. Beim Kopieren und Ausschneiden wird die Markierung jetzt vorher übernommen. Danach war der kopierte Text 5 von 5 Mal sauber.
- **Geschützte Leerzeichen beim Tippen:** Chrome setzt ein Leerzeichen direkt vor einer Trennmarkierung (und am Absatzanfang) als geschütztes Leerzeichen (U+00A0). An ihm bricht keine Zeile um, und es landete im Text (gefunden durch den PROJ-34-Test „Foto zuerst …“). Ein getipptes geschütztes Leerzeichen zwischen zwei Zeichen wird jetzt sofort zu einem normalen, im selben Rückgängig-Schritt. Am Absatzanfang, am Absatzende und neben einem weiteren Leerzeichen bleibt es, wie der Browser es setzt, weil ein normales dort bei `white-space: normal` unsichtbar wäre. Schreibt man weiter, wird auch das am Ende zum normalen. Eingefügter Text behält seine geschützten Leerzeichen. Während einer Wort-Eingabe mit Autokorrektur wird nichts geändert, der Absatz wird danach nachgezogen. Geprüft im Production-Build: Ein am Absatzende Wort für Wort getippter Satz kommt exakt und nur mit normalen Leerzeichen an.
- **Seiten-Takt bei langen Absätzen** (gefunden durch den PROJ-5-Test „AC-Pag-3“): Der Seiten-Takt teilt einen Absatz an einer Zeilengrenze und erkannte früher das Trennzeichen im Text als erlaubte Stelle. Die Markierungen kannte er nicht, schob deshalb das ganze Wort weiter, der Rest brach anders um als gemessen, und eine Zeile ragte 13 px in den unteren Rand. Er erkennt die Markierungen jetzt wieder (`isHyphenationPoint`). Die Markierung steht vor dem Seiten-Spacer an derselben Stelle (side -2).

**Gemessen (Production-Build, Chromium, 27 Absätze, 5 Seiten)**
- 47 Trennungen in 104 Zeilen, keine im zentrierten Absatz.
- Der Text im Editor ist frei von Trennzeichen, die Datenbank bleibt beim bloßen Öffnen unverändert, nach dem Speichern ist der Text sauber.
- Neu geöffnet sind Zeilenanfänge und Seitenzahl identisch (AC-2), die Druckansicht zeigt dieselben Umbrüche (AC-4).
- 16 Pfeildrücke landen hinter „Großmutter“ (AC-18), Kopieren ist sauber (AC-21), Tippen 35 bis 49 ms je Tastendruck (p95) in drei Läufen (AC-24).
- Sichtbar nach 470 bis 910 ms (der erste Aufruf ohne Cache ist der langsamste).
- Langes Testkapitel (PROJ-30, 42 Seiten) sichtbar nach 1033 und 1059 ms statt 989 ms, 4 bis 7 % langsamer (AC-25: höchstens 10 %, in Schritt 4 genauer messen).
- Voller Testlauf (15:31): alles grün bis auf zwei Ausreißer. Erstens das Aufräumen nach `PROJ-34-bilder-im-text`, das wie schon zweimal heute an Supabase-Zeitüberschreitungen scheiterte. Zweitens „Bilder bewegen sich beim Tippen höchstens einmal" aus PROJ-25, einmal mit 2 Bewegungen unter Volllast; danach 4 Wiederholungen beider Ruhe-Tests grün. Der Ruhe-Prüfstand wird in Schritt 4 genauer gemessen.
- Wortliste als Prüfstand: `src/lib/hyphenation/index.test.ts` (34 Tests), Anzeige: `tiptap/editorCommands.test.ts` (13 Tests).

**iPad-Prüfung:** Jakob hat Schritt 1 und 2 am 2026-11-24 auf Stage (`a6be250`) mit dem iPad geprüft: alles in Ordnung.

## Implementation Notes (Frontend, Schritte 3 bis 5, 2026-11-24)

**Gebaut**
- **Seitenregeln im Seiten-Takt** (`tiptap/hyphenationLayout.ts`, eingebunden in `PaginationDecorations.ts` und `computeDecorations.ts`). Eine Markierung mit sichtbarem Trennstrich hat eine Breite, ohne Trennstrich keine. Gemessen: 48 von 48 stimmen, 627 Markierungen in 2 ms. Daran erkennt der Seiten-Takt getrennte Zeilenenden.
  - **AC-8 (höchstens 3 in Folge):** Vor dem Setzen der Seiten wird jeder Absatz geprüft, die vierte Trennung einer Folge wird abgeschaltet und neu gemessen. Das Ergebnis hängt nur am Absatztext und wird je Absatz gemerkt, beim Tippen wird nur der geänderte Absatz neu gemessen.
  - **AC-9 (kein Trennstrich am Seitenende):** Würde eine Seite mit einem Trennstrich enden, wird genau diese Trennstelle abgeschaltet. Danach wird der Absatz neu gemessen und die Seitengrenze noch einmal gesucht, das Wort rückt ganz auf die nächste Seite. Die Folgen danach werden wieder begrenzt, gemerkt je Absatz und Seitengrenze.
  - Alles geschieht im selben Durchgang vor dem Zeichnen. Zum Messen wird die Markierung kurz per Klasse ausgeblendet, danach übernimmt das Trenn-Plugin die Abschaltung (die Markierung entfällt). Abschaltungen am Seitenende werden bei jedem Seiten-Takt neu bestimmt, dadurch ist das Ergebnis beim Öffnen immer gleich.
- **Trenn-Plugin:** führt die Abschaltungen getrennt nach Zeilenfolge und Seitenende, verschiebt sie beim Tippen mit und verwirft sie für einen geänderten Absatz. Abschaltungen aus dem Seiten-Takt lösen keinen neuen Seiten-Takt aus.

**Beim Testen gefunden und behoben**
- Das erste Layout lief, bevor das Wörterbuch geladen war, und merkte sich „nichts abzuschalten“. Folgen von bis zu 11 Zeilen blieben, und das Neuöffnen war nicht gleich. Gemerkt wird jetzt nur mit geladenem Wörterbuch.
- Absätze voller langer Wörter brauchten mehr als 12 Korrekturen. Die Grenze liegt jetzt bei 60 je Absatz.
- Nach einer Abschaltung am Seitenende wurden die Folgen bei jedem Tastendruck neu vermessen (Tippen 107 ms im Extremtext). Das Ergebnis wird jetzt je Absatz und Seitengrenze gemerkt (58 ms im Extremtext).

**Gemessen (Production-Build, Chromium)**
- Testkapitel mit Fließtext, Zitat, Liste, zentriert, rechtsbündig und drei Absätzen voller Wortungetüme: keine Seite endet mit einem Trennstrich, längste Folge 3, neu geöffnet identisch, auch nach vielen Eingaben.
- Seiten-Takt beim Tippen (17 Seiten, 105 Absätze): 18,5 ms statt 12,9 ms ohne Schritt 3.
- **AC-24 (Tippen höchstens 50 ms im PROJ-25-Referenzkapitel):** Der PROJ-25-Test misst dort 56 ms je Tastendruck (p95), mit und ohne Schritt 3 gleich (ohne: 56, 56, 96, 56; mit: viermal 56). Die 50 ms wurden also schon vor PROJ-35 nicht erreicht, die Silbentrennung macht das Tippen nicht messbar langsamer. **Entscheidung für Jakob in der QA:** AC-24 auf „nicht langsamer als vor PROJ-35“ ändern oder den Seiten-Takt gesondert beschleunigen.
- **AC-25 (Öffnen höchstens 10 % langsamer):** Das lange Testkapitel aus PROJ-30 (42 Seiten) ist nach 1076 ms sichtbar, vor PROJ-35 nach 989 ms, also knapp 9 % langsamer. Das liegt knapp unter der Grenze, in der QA mehrfach messen.
- **AC-26:** Das Referenzkapitel aus PROJ-25 (41 Seiten, 40 Seitenumbrüche im Absatz) hat denselben Fingerabdruck wie vorher, ein neuer fester Stand war nicht nötig.
- Voller Testlauf grün (14:34, alle 8 Gruppen).
- Neuer fester Test `tests/PROJ-35-silbentrennung.spec.ts` (3 Tests, Gruppe „Editor-Stabilität“), Unit-Tests `tiptap/hyphenationLayout.test.ts` (12 Tests).

**Noch offen**
- `/qa`, Safari und Firefox, Lizenzhinweise vor dem Go-live (`prod-umzug.md`, Abschnitt 8).

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
