# PROJ-34: Bilder im Kapiteltext und Hochkant

## Status: Approved
**Created:** 2026-11-23
**Last Updated:** 2026-11-24 (QA bestanden, BUG-1 behoben)
**Freigegeben:** Spec von Jakob am 2026-11-23, Änderung zu den Platzhaltern und Tech Design samt neuer Aufräumliste von Jakob am 2026-11-24

## Dependencies
- Requires: PROJ-25 (stabiler Editor), PROJ-5 (Kapitel-Editor), PROJ-7 (buchweite Seitenzahl), PROJ-26 (Papierkorb), PROJ-28 (Lesemodus), PROJ-3 (Konto-Löschen)
- Vor: PROJ-21 (Seitenlayouts) und PROJ-16 (Druck)

## Ausgangslage (gesichtet am 2026-11-23)

- Jedes Kapitel hat genau zwei Bildabschnitte, einen vor und einen nach dem Text. Sie liegen außerhalb des Textes.
- Ein leerer Abschnitt zeigt den Platzhalter „Bild hinzufügen". Er lässt sich nicht entfernen und erscheint nicht im Druck.
- Alle Fotos werden fest auf Querformat 3:2 zugeschnitten. Gespeichert wird nur der Ausschnitt.
- Bilder im Text betreffen Speichern, Seitenberechnung, Bildlinks, Löschen, Papierkorb, Konto-Löschen und den späteren Druck.

## Entscheidungen von Jakob (2026-11-23, Änderung 2026-11-24)

1. **Keine Platzhalter mehr (2026-11-24):** Das Buch muss im Editor schon annähernd so aussehen wie im Druck. Deshalb gibt es keine leeren Bild-Platzhalter mehr, auch nicht am Anfang und Ende. Das ersetzt die frühere Entscheidung, sie als Vorgabe zu behalten.
2. **Vorhandene Fotos bleiben:** Fotos am Anfang und Ende bestehender Kapitel bleiben an ihrem Platz und werden zu normalen Bildabschnitten. Bildabschnitte lassen sich mit der Entfern- oder Zurücktaste entfernen.
3. **Neues Bild-Werkzeug:** In der Werkzeugleiste steht ein Symbol aus Bild und Plus. Es setzt einen Bildabschnitt an die Cursorstelle. Steht der Cursor mitten in der Zeile, kommt der Abschnitt in eine neue Zeile nach dieser Position, der Text dahinter rückt darunter.
4. **Trennung:** Zwei Bildabschnitte sind immer durch mindestens eine Zeile getrennt. Die letzte Zeile dazwischen bleibt und darf leer sein.
5. **Löschen:** Ein Bildabschnitt enthält immer Fotos, deshalb kommt vor dem Entfernen immer eine Rückfrage. Entfernte Fotos bleiben 14 Tage im Speicher, damit „Rückgängig" funktioniert, und werden dann endgültig gelöscht.
6. **Seitenende:** Passt ein Bild auch verkleinert nicht mehr, rückt es auf die nächste Seite. Der Text danach folgt ihm, die Reihenfolge bleibt, unten darf weißer Platz entstehen.
7. **Hochkant, ein Bild pro Zeile:** mittig, zwei Drittel der Textbreite, rund 69 x 103 mm.
8. **Hochkant und Quer nebeneinander:** gleich hoch und zusammen so breit wie der Text, rund 31 x 46 mm und 69 x 46 mm.
9. **Format ändern:** Foto entfernen und neu hochladen. Originalfotos werden nicht zusätzlich gespeichert.

## User Stories
- Als Schreibender möchte ich ein Foto genau an die Textstelle setzen, zu der es gehört, damit Erinnerung und Bild zusammenstehen.
- Als Schreibender möchte ich im Editor schon sehen, wie mein Buch gedruckt aussieht, ohne Elemente, die im Druck fehlen.
- Als Schreibender möchte ich nicht versehentlich Fotos verlieren, wenn ich beim Korrigieren die Löschtaste drücke.
- Als Schreibender möchte ich Fotos im Hochformat einfügen, damit Porträts nicht auf Querformat beschnitten werden.
- Als Schreibender möchte ich Hochkant- und Querformat-Fotos mischen, damit meine Seiten wie in einem echten Fotobuch aussehen.
- Als Käufer möchte ich, dass die Fotos im gedruckten Buch an denselben Stellen stehen wie im Editor.

## Acceptance Criteria

### A. Ohne Platzhalter
- [ ] AC-1: Ein neues Kapitel zeigt keinen Bild-Platzhalter. Der Text beginnt direkt unter dem Kapitelkopf.
- [ ] AC-2: Bestehende Kapitel verlieren ihre leeren Platzhalter und behalten ihre Fotos an Anfang und Ende.
- [ ] AC-3: Ein entfernter Abschnitt bleibt auch nach dem Speichern und Neuladen weg.
- [ ] AC-4: Mit dem Bild-Werkzeug lässt sich auch am Kapitelanfang und -ende ein Abschnitt einfügen.

### B. Bild-Werkzeug
- [ ] AC-5: Die Werkzeugleiste zeigt ein Symbol aus Bild und Plus mit der Beschriftung „Bildabschnitt einfügen" für Tooltip und Screenreader.
- [ ] AC-6: Ein Klick öffnet die Foto-Auswahl mit Zuschnitt. Erst nach „Übernehmen" entsteht der Abschnitt an der Cursorposition. „Abbrechen" ändert nichts.
- [ ] AC-7: Mitten in der Zeile wird der Absatz am Cursor geteilt: Der Text davor bleibt oben, der Abschnitt folgt in einer neuen Zeile, der Rest steht darunter. Am Absatzanfang steht der Abschnitt davor, am Absatzende danach. In einer leeren Zeile ersetzt er diese Zeile.
- [ ] AC-8: In einer Liste oder einem Zitat steht der Abschnitt direkt nach dem ganzen Block.
- [ ] AC-9: Nach dem Einfügen steht der Cursor in der Zeile hinter dem Abschnitt, und man kann sofort weiterschreiben.
- [ ] AC-10: Ein eingefügter Abschnitt kann alles wie die heutigen: Fotos hinzufügen, zuschneiden, sortieren, löschen und zwischen 1 und 2 Bildern pro Zeile wechseln. Die Steuerung erscheint an der Bildreihe, über der die Maus steht, auch auf späteren Seiten (PROJ-25 BUG-2).
- [ ] AC-11: Im Editor nimmt nichts Seitenplatz ein, das im Druck fehlt. Bedienelemente liegen über den Fotos und verändern weder Seitenumbrüche noch Seitenzahl.

### C. Trennung
- [ ] AC-12: Zwei Bildabschnitte stehen nie direkt hintereinander.
- [ ] AC-13: Würde ein neuer Abschnitt direkt an einen anderen grenzen, ist das Werkzeug ausgegraut und nennt den Grund in der Sie-Form.
- [ ] AC-14: Die letzte Zeile zwischen zwei Abschnitten bleibt beim Löschen, Ausschneiden, Überschreiben einer Markierung, Einfügen und Rückgängig erhalten.
- [ ] AC-15: Diese Zeile darf leer sein, und man kann dort jederzeit schreiben.

### D. Löschen
- [ ] AC-16: Steht der Cursor direkt hinter einem Abschnitt, löst die Zurücktaste das Entfernen aus. Steht er direkt davor, löst es die Entfern-Taste aus.
- [ ] AC-17: Vor dem Entfernen fragt ein Dialog: „Bildabschnitt mit [Anzahl] Fotos entfernen?", bei einem Foto „Bildabschnitt mit 1 Foto entfernen?". „Abbrechen" ändert nichts.
- [ ] AC-18: Auch beim Löschen einer Textmarkierung über einen Abschnitt erscheint diese Rückfrage.
- [ ] AC-19: „Rückgängig" holt einen entfernten Abschnitt samt Fotos zurück, solange das Kapitel offen ist.
- [ ] AC-20: Entfernte Fotos werden nach 14 Tagen endgültig aus dem Speicher gelöscht, wenn kein gespeicherter Stand sie mehr verwendet.
- [ ] AC-42: Wird das letzte Foto eines Abschnitts gelöscht, verschwindet der ganze Abschnitt. Es bleibt kein leeres Element zurück.

### E. Seiten
- [ ] AC-21: Ein Abschnitt steht genau an seiner Textstelle. Die Reihenfolge von Text und Bildern ändert sich nie.
- [ ] AC-22: Passt eine Bildreihe nicht mehr, wird sie nach den bestehenden Regeln verkleinert oder rückt auf die nächste Seite. Der Text danach folgt ihr.
- [ ] AC-23: Ein Foto wird nie über zwei Seiten geteilt. Ein Abschnitt mit mehreren Reihen darf sich über mehrere Seiten verteilen.
- [ ] AC-24: Seitenzahl des Kapitels und buchweite Seitenzahlen (PROJ-7) stimmen mit Bildern an jeder Stelle.
- [ ] AC-25: Die Ruhe-Kriterien aus PROJ-25 (AC-7 bis AC-11) gelten auch für Bilder im Text.

### F. Hochkant
- [ ] AC-26: Beim Zuschneiden wählt man je Foto „Querformat" (3:2) oder „Hochformat" (2:3).
- [ ] AC-27: Der Dialog wählt das Format passend zum Foto vor. Ein Wechsel passt den Zuschnittrahmen sofort an.
- [ ] AC-28: Bei einem Bild pro Zeile steht ein Hochformat mittig in zwei Dritteln der Textbreite, rund 69 x 103 mm.
- [ ] AC-29: Zwei Hochformate nebeneinander sind gleich groß, rund 50 x 74 mm.
- [ ] AC-30: Hochformat und Querformat in einer Zeile sind gleich hoch und füllen zusammen die Textbreite, in beiden Reihenfolgen.
- [ ] AC-31: Das Format bleibt nach Speichern, Neuladen, Sortieren und Layoutwechsel erhalten.
- [ ] AC-32: Vorhandene Fotos bleiben unverändert im Querformat.

### G. Daten, Rechte und Druck
- [ ] AC-33: Text, Abschnitte, Fotos und Formate gehen beim Speichern nicht verloren, auch nicht bei schnellem Verlassen und mit der Zurück-Taste.
- [ ] AC-34: Fotos im Text sind nur für Mitglieder des Projekts sichtbar, wie die heutigen Kapitelbilder.
- [ ] AC-35: Kapitel löschen, Papierkorb, Wiederherstellen, automatische Löschung und Konto-Löschen erfassen auch die Fotos im Text.
- [ ] AC-36: Im Lesemodus (PROJ-28) stehen alle Fotos an ihrem Platz. Werkzeug und Löschen sind nicht verfügbar.
- [ ] AC-37: Die Wortzahl zählt nur den Text.
- [ ] AC-38: Position und Format stehen so in den Kapiteldaten, dass der Druck (PROJ-16) dasselbe Layout erzeugen kann.
- [ ] AC-39: Ein Referenzkapitel ohne Fotos behält seine Zeilenumbrüche. Seitenumbrüche und Seitenzahl ändern sich nur einmalig durch den weggefallenen Platzhalter, danach ist der neue Stand der feste Vergleich.
- [ ] AC-40: Alles funktioniert auf Desktop und Tablet. Das Phone zeigt weiter den Hinweis statt des Editors.
- [ ] AC-41: Alle bestehenden Tests bestehen, neue Abläufe haben eigene Tests.

## Edge Cases
- **Text mit Bildabschnitt wird kopiert und woanders eingefügt:** Nur der Text wird übernommen, damit sich zwei Abschnitte keine Fotos teilen.
- **Text wird aus Word oder einer Mail eingefügt:** Fremde Bilder werden nicht übernommen.
- **Sehr viele Fotos:** Höchstens 60 Fotos je Abschnitt und 120 je Kapitel, mit klarem Hinweis in der Sie-Form.
- **Cursor mitten in einem Wort:** Der Absatz wird nach diesem Wort geteilt, damit kein Wort auseinandergerissen wird.
- **Kapitel beginnt oder endet mit einem Abschnitt:** Der Cursor kann trotzdem davor oder dahinter schreiben, wo eine Textzeile vorhanden ist. Die leere Zeile hinter einem Abschnitt am Kapitelende erzeugt keine eigene Seite.
- **Seitenumbruch direkt vor oder nach einem Abschnitt:** Es entsteht keine leere Zusatzseite.
- **Ungerade Bildzahl bei zwei Bildern pro Zeile:** Das letzte Bild steht links in halber Textbreite, im eigenen Format.
- **Hochformat auf der ersten Kapitelseite:** Passt es nicht neben den Kopf, rückt es nach den bestehenden Regeln auf die nächste Seite.
- **Sehr kleines Foto:** Der bestehende Hinweis zur Druckqualität gilt auch für Hochformate.
- **Upload bricht ab:** Es entsteht kein neuer Abschnitt, ein vorhandener bleibt unverändert, der Text ebenso, und eine Fehlermeldung erscheint.
- **Zwei Personen bearbeiten dasselbe Kapitel:** Es bleibt beim Last-Writer-Wins. Keine Datei wird gelöscht, solange ein gespeicherter Stand sie noch verwendet.

## Nicht in diesem Feature
- Text neben Bildern, freie Bildgrößen und freie Position
- Ganze Abschnitte per Maus verschieben oder Fotos zwischen Abschnitten ziehen
- Bildunterschriften
- Nachträgliches Ändern des Zuschnitts ohne neues Hochladen
- Seitenvorlagen (PROJ-21), Phone-Editor, Live-Co-Editing und andere Buchformate als A5

## Technical Requirements
- Eine HTML-Quelle für Bildschirm und späteres A5-PDF, keine Overlay-Hacks
- Bestehende Kapitel dürfen beim Umstieg weder Text noch Bilder verlieren
- Falls eine Migration nötig wird, spielt Jakob sie im SQL-Editor ein. Änderungen an RLS brauchen seine Freigabe
- Kundentexte in der Sie-Form
- Browser: Chromium automatisch, Safari und Firefox vor dem Go-live

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

**Erstellt und von Jakob freigegeben:** 2026-11-24.

### Was die Prüfung des Codes gezeigt hat

| Befund | Folge |
|---|---|
| Der leere Platzhalter ist rund 17 mm hoch und hat keine eigene Druckregel. | Er entfällt ganz (Entscheidung 1). Im Editor bleibt nur, was auch gedruckt wird. |
| Bilder liegen heute außerhalb des Textes, das Speichern kennt nur „Anfang" und „Ende". | Text, Speichern und Upload müssen Abschnitte an jeder Stelle kennen. |
| Der Seiten-Takt aus PROJ-25 rechnet erst alle Bilder, dann allen Text, höchstens viermal. Mit Bildern im Text würde jede Runde nur den nächsten Abschnitt richtig stellen. | Bei vielen Abschnitten käme er nicht zur Ruhe. Er muss in Lesereihenfolge rechnen. Das ist aus dem Code abgeleitet und wird im Prüfstand zuerst gemessen. |
| Der Server nimmt beim Speichern jeden Dateipfad an. Heute ist das harmlos, weil Löschen mit den Rechten der Person läuft. | Das neue Aufräumen läuft mit vollen Rechten und darf deshalb nur Dateien aus dem Ordner des eigenen Kapitels löschen. |
| Alle Kapitelfotos liegen im Ordner des Kapitels. | Papierkorb, automatische Löschung und Konto-Löschen erfassen die Fotos im Text ohne Umbau. |
| Die Datenbankregel für Bilddaten prüft nur Anfang und Ende. | Weitere Abschnitte passen hinein, ohne diese Regel zu ändern. |

### A) Struktur

```
Kapitel-Editor
+-- Werkzeugleiste
|   +-- NEU: „Bildabschnitt einfügen" (Bild mit Plus)
|       +-- Foto-Dialog: Datei, Querformat oder Hochformat, Zuschnitt
+-- A5-Seiten
|   +-- Kapitelkopf
|   +-- Kapiteltext
|       +-- Absätze, Listen, Zitate, Seitenumbrüche
|       +-- NEU: Bildabschnitt an jeder Textstelle
|           +-- Bildreihen mit 1 oder 2 Fotos, quer oder hoch
|           +-- Steuerung an jeder Reihe (1 oder 2 Bilder, + Bild)
|           +-- Je Foto: verschieben, löschen
+-- NEU: Rückfrage beim Entfernen eines Abschnitts
+-- Seiten-Takt
    +-- Text bis zum nächsten Abschnitt, dann der Abschnitt, dann weiter
```

### B) Daten

**Im Kapiteltext** steht an jeder Bildstelle nur eine Markierung mit der Nummer des Abschnitts. Daraus ergibt sich die Position für Editor und Druck.

**In den Bilddaten des Kapitels** steht je Abschnitt:
- die Anordnung (1 oder 2 Bilder pro Zeile)
- die Fotos in ihrer Reihenfolge
- je Foto das Format, quer oder hoch. Fehlt die Angabe, ist es ein vorhandenes Querformat

**Neue Aufräumliste** für entfernte Fotos, gespeichert in der Datenbank:
- Dateipfad, Kapitel und Projekt
- Datum, ab dem die Datei gelöscht werden darf (14 Tage später)
- Anzahl der Versuche und letzter Fehler

Die Liste enthält keine Fotos und keine Texte. Sie folgt dem Muster der beiden vorhandenen Aufräumlisten: Row Level Security ist an, Kundenkonten haben keinen Zugriff, nur der Server arbeitet damit. Bestehende Zugriffsregeln ändern sich nicht. Das ist die einzige Migration, Jakob spielt sie im SQL-Editor ein.

### C) Technische Entscheidungen

1. **Ein Bildabschnitt ist ein eigener Block im Text.** So steht er wirklich an seiner Stelle, wandert mit dem Text und landet später genauso im Druck-PDF.
2. **Fotos stehen nicht im Text selbst.** Sonst würde „Rückgängig" auch einzelne Uploads zurückdrehen. So holt es genau das zurück, was die Spec verlangt: den entfernten Abschnitt mit seinen Fotos.
3. **Das Foto kommt zuerst, dann der Abschnitt.** Der Dialog bleibt offen, bis das Foto gespeichert ist. Danach erscheint der Abschnitt und wird sofort mitgespeichert. Dadurch gibt es nie ein leeres Element.
4. **Eine zentrale Regel schützt Trennung und Fotos.** Sie prüft jede Änderung, egal ob Taste, Ausschneiden, Überschreiben, Einfügen oder Tablet-Tastatur. Einzelne Tasten abzufangen würde Wege übersehen.
5. **Der Seiten-Takt rechnet in Lesereihenfolge.** Text und Bilder bleiben zwei getrennte Berechnungen, wie in PROJ-25 entschieden. Der Takt ruft sie aber von oben nach unten abwechselnd auf, sodass jeder Schritt nur von dem abhängt, was darüber steht. Ein zweiter Durchlauf gleicht nur noch „gleiche Bildgröße je Seite" an. Mehr Runden gibt es nicht, also auch kein Hin und Her.
6. **Eine Regel für alle Formate.** Die Breite eines Fotos in der Reihe ergibt sich aus seinem Seitenverhältnis. Dadurch sind Hochkant und Quer automatisch gleich hoch und füllen die Textbreite, am Bildschirm und im Druck.
7. **Entfernte Fotos löscht ein verzögertes Aufräumen.** Die Datenbank merkt selbst, welche Datei nicht mehr verwendet wird, und streicht sie wieder von der Liste, wenn sie durch „Rückgängig" oder einen zweiten Schreibenden zurückkommt. Der tägliche Cron löscht erst nach 14 Tagen und prüft vorher noch einmal, dass kein Stand die Datei braucht.
8. **Bestehende Kapitel werden beim Öffnen umgewandelt.** Es gibt keine Massenänderung an der Datenbank. Gespeichert wird der neue Aufbau erst, wenn jemand das Kapitel wirklich ändert (Regel aus PROJ-30).
9. **Bildlinks werden bei Bedarf erneuert.** Sie gelten eine Stunde. Holt „Rückgängig" später ein Foto zurück, besorgt der Editor einen frischen Link, nur für Dateien dieses Kapitels.
10. **Der Server prüft alles selbst:** Dateipfad im eigenen Kapitelordner, höchstens 60 Fotos je Abschnitt und 120 je Kapitel, jeder Abschnitt nur einmal im Text.

### D) Abhängigkeiten

Keine neuen Pakete. TipTap, der Bildzuschnitt, das Sortieren und die shadcn/ui-Dialoge sind vorhanden.

### E) Risiken

| Risiko | Gegenmaßnahme |
|---|---|
| Der geänderte Seiten-Takt verschiebt Layouts unbemerkt | Vor dem Umbau Vergleichsfälle festhalten: Bilder am Anfang, am Ende, gemischt, Seitenumbrüche, langes Kapitel |
| Das Referenzkapitel ändert sich gewollt, weil der Platzhalter wegfällt | Zeilenumbrüche müssen gleich bleiben, der neue Stand wird einmalig als Vergleich festgeschrieben |
| Rückfrage beim Löschen stört die Tablet-Tastatur | Eigener Test mit Touch-Ansicht, echtes Tablet vor dem Go-live |
| Gespeicherte Seitenzahlen alter Kapitel stimmen erst nach dem nächsten Öffnen | Beim Umzug auf Production prüfen, ob dort schon echte Kapitel liegen, und das in `prod-umzug.md` eintragen |
| Viele Abschnitte machen das Tippen langsam | Prüfstand mit 20 Abschnitten und langem Text, Grenze wie in PROJ-25 |
| Entfernte Fotos liegen noch 14 Tage im Speicher | In der Datenschutzerklärung nennen, zusammen mit dem Papierkorb |

### F) Reihenfolge

1. **`/backend`:** Datenaufbau, Prüfungen beim Speichern, Upload für beliebige Abschnitte, Aufräumliste und Cron. Das kommt zuerst, weil der Server unbekannte Abschnitte sonst beim Speichern verwerfen würde.
2. **`/frontend`, Prüfstand:** Vergleichsfälle festhalten und die Lesereihenfolge des Seiten-Takts messen.
3. **`/frontend`, Abschnitte:** Block im Text, Werkzeug, Einfügen an der Cursorstelle, Platzhalter entfernen.
4. **`/frontend`, Schutz:** Trennung, Rückfrage, „Rückgängig".
5. **`/frontend`, Hochkant:** Formatwahl im Dialog und alle Kombinationen in der Reihe.
6. **`/qa`:** alle Kriterien, Rechte, Löschwege, Tablet und Vergleich mit dem Druck.

## Implementation Notes (Backend, 2026-11-24)

**Gebaut**
- **Datenformat:** `image_sections` kennt neben `start` und `end` die Abschnitte im Text (`inline`), das Format je Foto und die Markierung `placed`. Alte Kapitel bleiben ohne Umschreiben lesbar. Die Logik liegt in `src/lib/kapiteleditor/image-sections.ts`.
- **Speichern:** Der Server prüft Grenzen (60 je Abschnitt, 120 je Kapitel), doppelte Fotos, jeden Abschnitt im Text und die Dateipfade. Ein Pfad außerhalb des Kapitelordners wird nur akzeptiert, wenn das Kapitel ihn schon gespeichert hatte. Abschnitte, die der Text nicht mehr verwendet, werden nicht mitgespeichert.
- **Upload und Löschen:** Beide arbeiten mit jedem Abschnitt. Ein neuer Abschnitt entsteht mit seinem ersten Foto, mit dem letzten Foto verschwindet er. Löschen entfernt die Datei nicht mehr sofort.
- **Frische Bildlinks:** `chapterImageLinksAction`, nur für Dateien im Ordner des Kapitels, auch im Lesemodus.
- **Aufräumliste:** Migration `20261124100000_proj34_image_cleanup.sql` mit eigener Tabelle und Datenbank-Trigger. Der tägliche Cron löscht fällige Dateien und prüft vorher Kapitel und Papierkorb. Schlägt die Prüfung fehl, wird nichts gelöscht.

**Geprüft**
- Migration lokal auf allen bisherigen Migrationen: 51 Prüfungen, darunter Rückgängig, fremde Pfade, kaputte Daten, Papierkorb und Rechte.
- Migration am 2026-11-24 von Jakob auf Stage eingespielt. Tabelle, RLS ohne Policies, Rechte und Trigger sind dort lesend bestätigt.
- `tests/PROJ-34-bild-daten.spec.ts` prüft die Liste mit eigenen Testdaten auf Stage. Nichts blieb zurück.
- Voller Testlauf grün: 936 Unit-Tests, 327 E2E-Tests, 2 bewusst übersprungen, 11:02. Typprüfung und Lint grün.
- Das Löschen fälliger Dateien ist nur mit Unit-Tests geprüft, weil die echte Cron-Route nicht aufgerufen wird.

**Für `/frontend`**
- Der Block im Text heißt `imageSection`, sein Attribut `sectionId`. Gespeichert wird mit `placed: true`.
- Beim Öffnen alter Kapitel `start` und `end` an Anfang und Ende setzen, ohne deshalb zu speichern.
- Abschnitte ohne Daten aus dem Text entfernen. Abschnitte mit Fotos ohne Platz im Text ans Kapitelende setzen, damit kein Foto verloren geht.
- Vor dem Commit eines neuen Abschnitts den Text speichern, danach den Abschnitt setzen und sofort speichern.

**Noch offen**
- Die Migration fehlt noch auf Production (`prod-umzug.md`).

## Implementation Notes (Frontend, 2026-11-24)

**Gebaut**
- Bildabschnitt als Block im Text (`tiptap/ImageSectionNode.tsx`, Regeln in `tiptap/imageSectionRules.ts`), Werkzeug „Bildabschnitt einfügen" in der Werkzeugleiste, Platzhalter entfernt.
- Foto zuerst, dann der Abschnitt. Rückfrage vor dem Entfernen, „Rückgängig" holt Abschnitte samt Fotos zurück, Trennung durch mindestens eine Zeile.
- Hochkant im Zuschnitt-Dialog (Format nach dem Foto vorgewählt) und in den Reihen (Breite nach Seitenverhältnis), Steuerung an der Reihe unter der Maus (PROJ-25 BUG-2).
- Seiten-Takt in Lesereihenfolge (`chapterLayout.ts`), `paginationPasses.ts` entfällt.
- Alte Kapitel werden beim Öffnen umgewandelt, ohne zu speichern (`prepareChapterImages`).
- Lädt ein Foto nicht (Link abgelaufen oder kurzer Netzaussetzer), holt der Editor einen frischen Link und baut das Foto neu auf, höchstens dreimal je Foto, ab dem zweiten Versuch mit 1,5 s Abstand (`freshImageLinks.ts`, nach QA-BUG-1).

**Beim Testen gefundene Fehler, behoben**
- **Formatierungen gingen beim Speichern verloren (älterer Fehler aus PROJ-5):** ProseMirror legt Attribute als Objekte ohne Prototyp an, Next.js überträgt solche Objekte nicht an den Server. Zeilenabstand, Einzug und Ausrichtung kamen deshalb nie in der Datenbank an, auf Stage hatte kein Kapitel diese Angaben. Der Text geht jetzt als reines JSON zum Server, ein Test prüft den Zeilenabstand nach dem Neuladen. Bereits gespeicherte Kapitel lassen sich nicht nachträglich reparieren.
- **Dialoge im Bildabschnitt schlossen sich sofort:** Die Ansage-Region der Foto-Sortierung lag im Text. Jeder Dialog setzt `aria-hidden` auf alles andere, ProseMirror hielt das für eine Textänderung und baute den Abschnitt neu auf. Die Region liegt jetzt am Seitenende.
- **Pfadprüfung zu streng:** Ältere Fotos aus einem anderen Ordner desselben Projekts hätten nach „Rückgängig" das Speichern blockiert. Erlaubt ist jetzt der ganze Projektordner, gelöscht wird weiter nur im Kapitelordner.

**Gemessen**
- Vergleich mit 22 Kapiteln vor dem Umbau: 20 identisch, 2 Reihen sitzen jetzt richtig statt 15 bis 37 px zu tief.
- 20 Abschnitte im Text: vorher 1 bis 2 Randverstöße je Kapitel, jetzt keine. Tippen p95 40 bis 48 ms.
- `tests/PROJ-34-bilder-im-text.spec.ts`: 13 Tests gegen einen Production-Build, darunter Tablet, Rückgängig samt Aufräumliste und Speichern der Formatierung. Sichtprüfung der Hochformate per Bildschirmfoto.
- Voller Testlauf grün: 340 E2E-Tests, 2 bewusst übersprungen, 12:36. Angepasst wurden ältere Tests, die mitten in den Editor klickten oder ans Kapitelende tippten: Dort steht jetzt der Bildabschnitt beziehungsweise die leere Schreibzeile dahinter.

**Noch offen**
- Safari, Firefox und echte Tablets.
- Ein Mausklick kommt bei ProseMirror erst kurz danach als Cursorstelle an. Für Menschen unmerklich, Tests warten deshalb 150 ms.

## QA Test Results

**Tested:** 2026-11-24
**App URL:** http://localhost:3000 (lokaler Production-Build gegen die Stage-Datenbank)
**Tester:** QA Engineer (AI)
**Browser:** Chromium auf Desktop (1440 px), Tablet (768 px, Touch) und Phone (375 px). WebKit startet auf diesem Mac nicht (wie Mobile Safari), Firefox ist nicht installiert. Safari und Firefox bleiben vor dem Go-live offen.
**Testdaten:** nur eigene temporäre Konten (`e2e-proj34-*@example.test`) mit eigenen Projekten, nach jedem Lauf gelöscht. QA-Konto, Cron-Route, Mails, SMS und Zahlungen unberührt.

### Acceptance Criteria Status

#### A. Ohne Platzhalter (AC-1 bis AC-4)
- [x] AC-1: Neues Kapitel ohne Platzhalter, Text direkt unter dem Kopf.
- [x] AC-2: Alte Kapitel zeigen ihre Fotos an Anfang und Ende und speichern beim Öffnen nichts.
- [x] AC-3: Entfernter Abschnitt bleibt nach Speichern und Neuladen weg.
- [x] AC-4: Einfügen am Kapitelanfang (Abschnitt vor dem ersten Absatz) und am Kapitelende (Abschnitt nach dem letzten Absatz, leere Schreibzeile dahinter).

#### B. Bild-Werkzeug (AC-5 bis AC-11)
- [x] AC-5: Symbol mit Beschriftung für Tooltip und Screenreader, Grund in der Sie-Form, wenn gesperrt.
- [x] AC-6: Abschnitt entsteht erst nach „Übernehmen", „Abbrechen" ändert nichts.
- [x] AC-7: Mitten im Wort wird nach dem Wort geteilt („Großmutter" | Abschnitt | „erzählte viel von früher"), am Absatzanfang davor, am Ende danach.
- [x] AC-8: In Liste und Zitat steht der Abschnitt nach dem ganzen Block.
- [x] AC-9: Cursor steht danach in der Zeile hinter dem Abschnitt.
- [x] AC-10: „+ Bild" im Abschnitt (Dialog bleibt offen), Wechsel auf 2 Bilder pro Zeile, Sortieren per Tastatur, einzelnes Foto löschen mit Rückfrage.
- [x] AC-11: Druckansicht ohne Bedienelemente und ohne leere Schreibzeile, alle Fotos da. Bedienelemente nehmen keinen Seitenplatz ein.

#### C. Trennung (AC-12 bis AC-15)
- [x] AC-12, AC-13: Zwei Abschnitte stehen nie direkt hintereinander, das Werkzeug ist dort ausgegraut und nennt den Grund.
- [x] AC-14: Ausschneiden, Überschreiben einer Markierung und Einfügen über einen Abschnitt fragen nach. „Abbrechen" lässt Text und Abschnitt unverändert, „Rückgängig" danach ebenso.
- [x] AC-15: Die Zeile zwischen zwei Abschnitten darf leer sein und ist beschreibbar.

#### D. Löschen (AC-16 bis AC-20, AC-42)
- [x] AC-16, AC-17: Zurück- und Entfern-Taste fragen mit der richtigen Fotoanzahl nach, auch auf dem Tablet.
- [x] AC-18: Markierung über einen Abschnitt fragt nach.
- [x] AC-19: „Rückgängig" holt den Abschnitt samt Fotos zurück und nimmt die Fotos von der Aufräumliste. Siehe BUG-1 zu einem Randfall beim Erneuern von Bildlinks.
- [x] AC-20: Entfernte Fotos stehen mit 14 Tagen Frist auf der Aufräumliste. Der Lauf löscht nur Dateien, die kein gespeicherter Stand und kein Papierkorb-Eintrag mehr verwendet (Unit-Tests).
- [x] AC-42: Mit dem letzten Foto verschwindet der ganze Abschnitt.

#### E. Seiten (AC-21 bis AC-25)
- [x] AC-21 bis AC-23: Reihenfolge bleibt, Reihen werden verkleinert oder rücken weiter, kein Foto über zwei Seiten. 20 Abschnitte im Text ohne Randverstöße.
- [x] AC-24: Nach dem Einfügen eines Hochformats stimmen die Seitenzahl des Kapitels und die Startseite des Folgekapitels mit dem Editor überein.
- [x] AC-25: Ein Tastendruck bewegt die Bilder höchstens einmal.

#### F. Hochkant (AC-26 bis AC-32)
- [x] AC-26, AC-27: Querformat bei einem Querfoto vorgewählt, Wechsel auf Hochformat passt den Rahmen sofort an (3:2 und 2:3 gemessen). Bei einem Panorama bleibt der Rahmen im Foto.
- [x] AC-28 bis AC-30: Hochformat allein mittig in zwei Dritteln der Breite, zwei Hochformate gleich groß, gemischt gleich hoch in beiden Reihenfolgen.
- [x] AC-31: Format bleibt nach Sortieren, Layoutwechsel, Speichern und Neuladen.
- [x] AC-32: Alte Fotos ohne Formatangabe erscheinen im Querformat 3:2, in den Daten kommt keine Formatangabe dazu.

#### G. Daten, Rechte und Druck (AC-33 bis AC-41)
- [x] AC-33: Abschnitt einfügen und sofort zur Übersicht zurück: nach dem Wiederöffnen ist alles da.
- [x] AC-34: Fotos eines anderen Projekts lassen sich nicht signieren, Nicht-Mitglieder bekommen keine Links (Unit-Test).
- [x] AC-35: Kapitel mit Abschnitt im Text löschen, im Papierkorb steht der vollständige Stand, Wiederherstellen zeigt das Foto, nichts landet auf der Aufräumliste.
- [x] AC-36: Lesemodus zeigt die Fotos ohne Steuerung, Werkzeug gesperrt, Zurücktaste wirkungslos.
- [x] AC-37: Wortzahl zählt nur den Text („Schnell weg" mit Abschnitt: 2 Wörter).
- [x] AC-38: Position steht als Block im Text, Format in den Kapiteldaten, ohne Links.
- [x] AC-39: Referenzkapitel: 20 von 22 Vergleichskapiteln identisch, 2 Reihen sitzen jetzt richtig (beim Bau gemessen).
- [x] AC-40: Desktop und Tablet (Einfügen, Steuerung per Tippen, Rückfrage), Phone zeigt den Hinweis statt des Editors.
- [x] AC-41: Voller Testlauf grün, neue Abläufe haben eigene Tests.

### Edge Cases Status
- [x] Kopierter Text samt Abschnitt bringt keinen zweiten Abschnitt.
- [x] Eingefügtes HTML aus Word mit `<img>` und fremdem `data-image-section` übernimmt keine Bilder und keinen Abschnitt.
- [x] 60 Fotos im Abschnitt sperren „+ Bild", 120 im Kapitel sperren das Werkzeug mit Grund in der Sie-Form.
- [x] Cursor mitten im Wort: Teilung nach dem Wort.
- [x] Kapitel beginnt oder endet mit einem Abschnitt: Schreiben davor und dahinter möglich, die Schlusszeile erzeugt keine Seite.
- [x] Seitenumbruch direkt vor und nach einem Abschnitt: keine leere Seite.
- [x] Ungerade Bildzahl: letztes Bild links in halber Breite.
- [x] Hochformat auf der ersten Kapitelseite passt unter den Kopf, ein zweites rückt auf die nächste Seite.
- [x] Kleines Hochformat zeigt den Druckhinweis mit 985 px.
- [x] Upload bricht ab: kein Abschnitt, Text unverändert, Meldung „Bild-Upload fehlgeschlagen.", der Dialog bleibt offen.
- [x] Zwei Personen: Last-Writer-Wins, der Aufräumlauf prüft vor dem Löschen erneut alle gespeicherten Stände (Unit-Tests).

### Regression
- [x] Formatierungsverlust: Ausrichtung und Einzug stehen nach dem Speichern in der Datenbank.
- [x] Schließende Dialoge: „+ Bild"- und Zuschnitt-Dialog im Abschnitt bleiben offen, auch beim fehlgeschlagenen Upload.
- [x] Voller Testlauf vor der QA grün (340 bestanden, 2 übersprungen), Unit-Tests, Build und Lint ohne Fehler.

### Security Audit Results
- [x] Ein Mitglied, das per REST einen fremden Pfad in die Bilddaten schreibt und wieder entfernt, bringt ihn nicht auf die Aufräumliste.
- [x] Eine Abschnitts-ID mit HTML (`"><img onerror=…>`) wird beim Öffnen verworfen und nie ausgeführt.
- [x] Pfadprüfungen lehnen `..`, `%2e%2e`, doppelte Schrägstriche, Backslash, Querystring, Zeilenumbruch, versteckte Dateien, zu tiefe Pfade und ein verlängertes Projekt-Präfix ab.
- [x] Fremde Projekte: Signieren eines Bildes außerhalb der eigenen Projekte scheitert.
- [x] Die Aufräumliste ist ohne Service-Role weder lesbar noch beschreibbar (anon 401).
- [x] Gelöscht wird automatisch nur im Ordner des eigenen Kapitels.

### Bugs Found

#### BUG-1: Foto bleibt nach einem kurzen Ladefehler direkt beim Öffnen leer
- **Severity:** Low
- **Steps to Reproduce:**
  1. Kapitel mit Foto im Text öffnen, während das erste Laden des Fotos scheitert (z. B. kurzer Netzaussetzer im WLAN).
  2. Der Editor holt einen frischen Link. Geschieht das in derselben Sekunde wie beim Seitenaufbau, ist der Link identisch, und der Browser lädt das Foto nicht erneut.
  3. Expected: Das Foto erscheint nach dem frischen Link.
  4. Actual: Das Foto bleibt leer, bis man die Seite neu lädt. Ein zweiter Versuch folgt nicht.
- **Belegt:** Mit 2 s Verzögerung vor dem frischen Link lädt das Foto sofort. Der eigentliche Fall (Link nach einer Stunde abgelaufen, etwa nach „Rückgängig") funktioniert. Text, Daten und Seitenumbrüche sind nicht betroffen.
- **Priority:** Nice to have
- **Status:** Behoben am 2026-11-24 auf Jakobs Wunsch. Ursache: Das Foto lud nur bei geändertem Link neu, und es gab nur einen Versuch je Foto. Jetzt baut jeder Versuch das Foto neu auf, auch bei gleichem Link und auch, wenn der Server gerade nicht erreichbar ist. Höchstens drei Versuche je Foto, ab dem zweiten mit 1,5 s Abstand, damit eine fehlende Datei keine Schleife auslöst. Die Logik steht in `src/components/kapiteleditor/freshImageLinks.ts` (10 Unit-Tests). Ein E2E-Test lässt die ersten zwei Ladeversuche scheitern und erwartet das Foto danach.

### Hinweise ohne Fehler
- Auf dem Tablet im Hochformat (768 px) bricht die Werkzeugleiste in zwei Zeilen um. Das Bild-Werkzeug steht dann mit Rückgängig und Wiederholen in der zweiten Zeile. Das ist das Verhalten aus PROJ-25.
- Neue feste Tests: `tests/PROJ-34-bilder-pruefliste.spec.ts` (11 Tests inklusive BUG-1, Gruppe „Editor-Stabilität").

### Summary
- **Acceptance Criteria:** 42/42 passed
- **Bugs Found:** 1 total (0 critical, 0 high, 0 medium, 1 low), behoben
- **Security:** Pass
- **Production Ready:** YES
- **Recommendation:** Deploy nach der Production-Migration laut `prod-umzug.md`. Safari und Firefox vor dem Go-live prüfen.

## Deployment
_To be added by /deploy_
