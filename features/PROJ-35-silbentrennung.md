# PROJ-35: Automatische Silbentrennung

## Status: Planned
**Created:** 2026-11-24
**Last Updated:** 2026-11-24
**Freigegeben:** Spec von Jakob am 2026-11-24

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
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
