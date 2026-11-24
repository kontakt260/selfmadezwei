# PROJ-34: Bilder im Kapiteltext und Hochkant

## Status: Planned
**Created:** 2026-11-23
**Last Updated:** 2026-11-23
**Freigegeben:** Spec von Jakob am 2026-11-23

## Dependencies
- Requires: PROJ-25 (stabiler Editor), PROJ-5 (Kapitel-Editor), PROJ-7 (buchweite Seitenzahl), PROJ-26 (Papierkorb), PROJ-28 (Lesemodus), PROJ-3 (Konto-Löschen)
- Vor: PROJ-21 (Seitenlayouts) und PROJ-16 (Druck)

## Ausgangslage (gesichtet am 2026-11-23)

- Jedes Kapitel hat genau zwei Bildabschnitte, einen vor und einen nach dem Text. Sie liegen außerhalb des Textes.
- Ein leerer Abschnitt zeigt den Platzhalter „Bild hinzufügen". Er lässt sich nicht entfernen und erscheint nicht im Druck.
- Alle Fotos werden fest auf Querformat 3:2 zugeschnitten. Gespeichert wird nur der Ausschnitt.
- Bilder im Text betreffen Speichern, Seitenberechnung, Bildlinks, Löschen, Papierkorb, Konto-Löschen und den späteren Druck.

## Entscheidungen von Jakob (2026-11-23)

1. **Anfang und Ende bleiben:** Die heutigen Bildelemente gefallen Jakob. Neue Kapitel haben weiter je einen Platzhalter am Anfang und Ende.
2. **Platzhalter sind löschbar:** mit der Entfern- oder Zurücktaste.
3. **Neues Bild-Werkzeug:** In der Werkzeugleiste steht ein Symbol aus Bild und Plus. Es fügt denselben Bildabschnitt an jeder Textstelle ein.
4. **Trennung:** Zwei Bildabschnitte sind immer durch mindestens eine Zeile getrennt. Die letzte Zeile dazwischen bleibt und darf leer sein.
5. **Löschen:** Ein leerer Platzhalter verschwindet sofort. Enthält der Abschnitt Fotos, kommt eine Rückfrage.
6. **Seitenende:** Passt ein Bild auch verkleinert nicht mehr, rückt es auf die nächste Seite. Der Text danach folgt ihm, die Reihenfolge bleibt, unten darf weißer Platz entstehen.
7. **Hochkant, ein Bild pro Zeile:** mittig, zwei Drittel der Textbreite, rund 69 x 103 mm.
8. **Hochkant und Quer nebeneinander:** gleich hoch und zusammen so breit wie der Text, rund 31 x 46 mm und 69 x 46 mm.
9. **Format ändern:** Foto entfernen und neu hochladen. Originalfotos werden nicht zusätzlich gespeichert.

## User Stories
- Als Schreibender möchte ich ein Foto genau an die Textstelle setzen, zu der es gehört, damit Erinnerung und Bild zusammenstehen.
- Als Schreibender möchte ich einen Bild-Platzhalter entfernen, den ich nicht brauche, damit meine Seite aufgeräumt aussieht.
- Als Schreibender möchte ich nicht versehentlich Fotos verlieren, wenn ich beim Korrigieren die Löschtaste drücke.
- Als Schreibender möchte ich Fotos im Hochformat einfügen, damit Porträts nicht auf Querformat beschnitten werden.
- Als Schreibender möchte ich Hochkant- und Querformat-Fotos mischen, damit meine Seiten wie in einem echten Fotobuch aussehen.
- Als Käufer möchte ich, dass die Fotos im gedruckten Buch an denselben Stellen stehen wie im Editor.

## Acceptance Criteria

### A. Anfang und Ende
- [ ] AC-1: Ein neues Kapitel zeigt wie heute je einen Platzhalter am Anfang und am Ende.
- [ ] AC-2: Bestehende Kapitel sehen unverändert aus und behalten ihre Fotos an Anfang und Ende.
- [ ] AC-3: Ein entfernter Platzhalter bleibt auch nach dem Speichern und Neuladen weg.
- [ ] AC-4: Mit dem Bild-Werkzeug lässt sich am Kapitelanfang und -ende wieder ein Abschnitt einfügen.

### B. Bild-Werkzeug
- [ ] AC-5: Die Werkzeugleiste zeigt ein Symbol aus Bild und Plus mit der Beschriftung „Bildabschnitt einfügen" für Tooltip und Screenreader.
- [ ] AC-6: Ein Klick fügt an der Cursorposition einen leeren Bildabschnitt ein.
- [ ] AC-7: Mitten im Absatz wird der Absatz am Cursor geteilt. Am Absatzanfang steht der Abschnitt davor, am Absatzende danach.
- [ ] AC-8: In einer Liste oder einem Zitat steht der Abschnitt direkt nach dem ganzen Block.
- [ ] AC-9: Nach dem Einfügen steht der Cursor in der Zeile hinter dem Abschnitt, und man kann sofort weiterschreiben.
- [ ] AC-10: Ein eingefügter Abschnitt kann alles wie die heutigen: Fotos hinzufügen, zuschneiden, sortieren, löschen und zwischen 1 und 2 Bildern pro Zeile wechseln.
- [ ] AC-11: Ein leerer Platzhalter erscheint nicht im Druck und zählt nicht zur Seitenzahl.

### C. Trennung
- [ ] AC-12: Zwei Bildabschnitte stehen nie direkt hintereinander.
- [ ] AC-13: Würde ein neuer Abschnitt direkt an einen anderen grenzen, ist das Werkzeug ausgegraut und nennt den Grund in der Sie-Form.
- [ ] AC-14: Die letzte Zeile zwischen zwei Abschnitten bleibt beim Löschen, Ausschneiden, Überschreiben einer Markierung, Einfügen und Rückgängig erhalten.
- [ ] AC-15: Diese Zeile darf leer sein, und man kann dort jederzeit schreiben.

### D. Löschen
- [ ] AC-16: Steht der Cursor direkt hinter einem leeren Abschnitt, entfernt ihn die Zurücktaste. Steht er direkt davor, entfernt ihn die Entfern-Taste.
- [ ] AC-17: Enthält der Abschnitt Fotos, fragt ein Dialog: „Bildabschnitt mit [Anzahl] Fotos entfernen?". „Abbrechen" ändert nichts.
- [ ] AC-18: Auch beim Löschen einer Textmarkierung über einen Abschnitt mit Fotos erscheint diese Rückfrage.
- [ ] AC-19: „Rückgängig" holt einen entfernten Abschnitt samt Fotos zurück, solange das Kapitel offen ist.
- [ ] AC-20: Fotos eines endgültig entfernten Abschnitts bleiben nicht dauerhaft im Speicher liegen.

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
- [ ] AC-36: Im Lesemodus (PROJ-28) stehen alle Fotos an ihrem Platz. Werkzeug, Platzhalter und Löschen sind nicht verfügbar.
- [ ] AC-37: Die Wortzahl zählt nur den Text.
- [ ] AC-38: Position und Format stehen so in den Kapiteldaten, dass der Druck (PROJ-16) dasselbe Layout erzeugen kann.
- [ ] AC-39: Ein Referenzkapitel ohne neue Abschnitte hat vorher und nachher dieselbe Seitenzahl und dieselben Umbrüche.
- [ ] AC-40: Alles funktioniert auf Desktop und Tablet. Das Phone zeigt weiter den Hinweis statt des Editors.
- [ ] AC-41: Alle bestehenden Tests bestehen, neue Abläufe haben eigene Tests.

## Edge Cases
- **Text mit Bildabschnitt wird kopiert und woanders eingefügt:** Nur der Text wird übernommen, damit sich zwei Abschnitte keine Fotos teilen.
- **Text wird aus Word oder einer Mail eingefügt:** Fremde Bilder werden nicht übernommen.
- **Sehr viele Fotos:** Höchstens 60 Fotos je Abschnitt und 120 je Kapitel, mit klarem Hinweis in der Sie-Form.
- **Kapitel beginnt oder endet mit einem Abschnitt:** Der Cursor kann trotzdem davor oder dahinter schreiben, wo eine Textzeile vorhanden ist.
- **Seitenumbruch direkt vor oder nach einem Abschnitt:** Es entsteht keine leere Zusatzseite.
- **Ungerade Bildzahl bei zwei Bildern pro Zeile:** Das letzte Bild steht links in halber Textbreite, im eigenen Format.
- **Hochformat auf der ersten Kapitelseite:** Passt es nicht neben den Kopf, rückt es nach den bestehenden Regeln auf die nächste Seite.
- **Sehr kleines Foto:** Der bestehende Hinweis zur Druckqualität gilt auch für Hochformate.
- **Upload bricht ab:** Der Abschnitt bleibt bestehen, der Text bleibt unverändert, und eine Fehlermeldung erscheint.
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
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
