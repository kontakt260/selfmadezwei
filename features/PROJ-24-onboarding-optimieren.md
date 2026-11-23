# PROJ-24: Onboarding optimieren

## Status: In Progress
**Created:** 2026-11-23
**Last Updated:** 2026-11-23
**Freigabe:** Von Jakob am 2026-11-23 freigegeben.

## Dependencies
- Requires: PROJ-6 (Stripe-Zahlungen), der Kauf und das Anlegen des Projekts bleiben dort
- Requires: PROJ-9 (Einladungen), der Weg „Auch am Computer schreiben" lädt die beschenkte Person weiter ein
- Requires: PROJ-22 (Design-Grundlage), Schriften, Lesbarkeit und Stil
- Hängt zusammen mit: PROJ-12 (Audio-Erzählen). PROJ-24 nimmt die Kontaktdaten beim Kauf auf, PROJ-12 verschickt die Erzähl-Impulse und zeigt die Einstellungen in der Projektübersicht
- Später: PROJ-23 (Grußnachricht), PROJ-16 (Druckauftrag), PROJ-27 (AGB-Zustimmung)

## Entscheidungen von Jakob (2026-11-23)

1. **Umfang:** Der Kaufweg wird einfacher und besser lesbar, und der Schritt zu den Erzähl-Impulsen kommt direkt mit rein. Die Grußnachricht bleibt ein eigenes Feature (PROJ-23).
2. **Erzähl-Impulse:** Bei „Nur per Sprachnachricht erzählen" sind sie Pflicht. Wo sie nicht Pflicht sind, fragen wir, ob die beschenkte Person sie regelmäßig bekommen soll oder ob man sie selbst bekommen möchte.
3. **Rollen:** Der Schritt „Zugang einrichten" bleibt mit Schalter und Rollenauswahl wie heute. Nur Texte und Lesbarkeit werden besser.
4. **Preis:** Die 249 € enthalten das **erste gedruckte Hardcover-Buch**.
5. **Abbruch:** Wer bei Stripe zurückgeht oder die Seite neu lädt, verliert seine Angaben nicht.
6. **Rhythmus:** Das Onboarding fragt nicht danach. Beim Kauf gilt „jeden Sonntag", geändert wird das später in der Projektübersicht.

## Neuer Ablauf

| # | Schritt | Wann |
|---|---|---|
| 1 | Für wen ist das Lebensbuch? | immer, außer der Weg ist schon vorbelegt |
| 2 | Wie heißen Sie? | immer |
| 3 | Für wen ist das Geschenk? (Name und Erzählweise) | nur Geschenk |
| 4 | **Neu:** Erzähl-Impulse | immer |
| 5 | Zugang einrichten | nur Geschenk mit „Auch am Computer schreiben" |
| 6 | Bereit zum Start? | immer |

So sieht Schritt 4 je nach Weg aus:

| Weg | Überschrift | Erzähl-Impulse |
|---|---|---|
| Geschenk, nur per Sprachnachricht | Wie erreichen wir [Name]? | immer an, Kontakt ist Pflicht |
| Geschenk, auch am Computer | Soll [Name] regelmäßig Erzähl-Impulse bekommen? | Ja oder Nein, Ja ist vorausgewählt |
| Für mich selbst | Möchten Sie regelmäßig Erzähl-Impulse bekommen? | Ja oder Nein, Ja ist vorausgewählt |

## User Stories

- Als Käufer eines Geschenks möchte ich festlegen, wie die beschenkte Person erreicht wird, damit sie ohne weiteres Zutun zum Erzählen eingeladen wird.
- Als Person, die für sich selbst kauft, möchte ich entscheiden, ob ich regelmäßig Erzähl-Impulse bekomme oder lieber nur selbst schreibe.
- Als Käufer möchte ich vor dem Bezahlen klar sehen, was ich für 249 € bekomme.
- Als Person über 60 möchte ich jeden Schritt gut lesen und verstehen können, ohne Fachbegriffe erraten zu müssen.
- Als Käufer möchte ich nach einem Fehlklick nicht alles noch einmal eingeben müssen.

## Acceptance Criteria

### A. Ablauf und Lesbarkeit

- [ ] AC-1: Die Schritte erscheinen in der Reihenfolge der Tabelle, jeweils nur die zum gewählten Weg passenden.
- [ ] AC-2: Die Schrittanzeige ist gut lesbar: Ziffern mindestens 16 px und mindestens 4,5:1 Kontrast, auch beim aktuellen Schritt.
- [ ] AC-3: Alle Texte im Onboarding sind mindestens 16 px groß und erreichen mindestens 4,5:1 Kontrast. Alle Bedienelemente sind mindestens 44 px hoch.
- [ ] AC-4: Schriften und Stil folgen PROJ-22. NARRAVIT steht im Schriftzug in Merriweather.
- [ ] AC-5: Die Zusammenfassung nutzt einfache Begriffe, zum Beispiel „Für wen" statt „Geschenk?" und „Beschenkte Person" statt „Beschenkte:r".
- [ ] AC-6: Fehlermeldungen stehen direkt beim betroffenen Feld, in der Sie-Form, und sagen, was zu tun ist.
- [ ] AC-7: Das Onboarding funktioniert bei 1440, 768 und 375 px ohne seitliches Scrollen und bei 200 % Zoom.
- [ ] AC-8: Der Link „Zum persönlichen Bereich" für Konten ohne Projekt und der Link „Anmelden" für Gäste bleiben erhalten.

### B. Schritt „Erzähl-Impulse"

- [ ] AC-9: Bei „Nur per Sprachnachricht erzählen" sind die Erzähl-Impulse fest eingeschaltet. Ohne gültigen Kontaktweg geht es nicht weiter.
- [ ] AC-10: Bei „Auch am Computer schreiben" und „Für mich selbst" gibt es eine Ja-oder-Nein-Frage, Ja ist vorausgewählt.
- [ ] AC-11: Bei Nein verschwinden die Kontaktfelder und man kommt ohne weitere Angaben zum nächsten Schritt.
- [ ] AC-12: Bei Ja wählt man **E-Mail**, **SMS** oder **beides**. Es erscheinen nur die dazu passenden Felder.
- [ ] AC-13: Die Handynummer hat die Vorwahl +49 vorbelegt, andere Ländervorwahlen sind möglich. Ungültige Nummern werden direkt am Feld abgelehnt.
- [ ] AC-14: Bei „Für mich selbst" ist die eigene E-Mail-Adresse vorbefüllt. Gäste ohne Konto tragen keine Adresse ein, die Impulse gehen an die Adresse, mit der sie bezahlen. Der Schritt sagt das so.
- [ ] AC-15: Der Schritt sagt in einem Satz, dass die Erzähl-Impulse jeden Sonntag kommen und der Rhythmus später in der Projektübersicht änderbar ist.
- [ ] AC-16: Bei Geschenken bestätigt der Käufer mit einem Häkchen, dass [Name] mit den Nachrichten von NARRAVIT einverstanden ist. Ohne Häkchen geht es nicht weiter. Bei „Für mich selbst" entfällt das Häkchen.
- [ ] AC-17: Die Angaben werden erst nach erfolgreicher Zahlung dem Projekt zugeordnet. Kommt keine Zahlung zustande, werden sie automatisch gelöscht (Fristen im Tech Design).
- [ ] AC-18: Durch PROJ-24 allein wird keine Nachricht verschickt. Der Versand kommt mit PROJ-12.

### C. Zugang einrichten

- [ ] AC-19: Schalter „Eigener Zugang" und Rollenauswahl bleiben in Funktion und Regeln wie heute.
- [ ] AC-20: Wurde in Schritt 4 eine E-Mail eingetragen, ist sie in Schritt 5 vorbefüllt und bleibt änderbar.

### D. Kaufschritt

- [ ] AC-21: Die Zusammenfassung zeigt zusätzlich, ob und wie die Erzähl-Impulse kommen, zum Beispiel „Per E-Mail und SMS, jeden Sonntag" oder „Keine".
- [ ] AC-22: Das Buch steht im Preisfeld an erster Stelle. Der Preistext lautet: „Ihr erstes gedrucktes Hardcover-Buch, 12 Monate Projektzugang, Erzählen per Sprachnachricht und Editor."
- [ ] AC-23: Die Karte „Buch in den Druck geben" aus PROJ-22 nennt passend dazu: „Ihr erstes gedrucktes Buch ist bereits bezahlt."

### E. Abbruch und Neuladen

- [ ] AC-24: Wer auf der Stripe-Seite zurückgeht, landet wieder bei „Bereit zum Start?" mit allen Angaben.
- [ ] AC-25: Wer die Seite neu lädt, bleibt beim selben Schritt mit allen Angaben.
- [ ] AC-26: Die Angaben bleiben nur in diesem Browser-Tab. Sie werden nach erfolgreicher Zahlung, beim Abmelden und beim Schließen des Tabs gelöscht.

## Edge Cases

- **Weg gewechselt:** Wer von „Auch am Computer" zu „Nur per Sprachnachricht" wechselt, behält seine Kontaktdaten. Schritt 5 entfällt, die Erzähl-Impulse sind dann fest an.
- **Von Geschenk zu „Für mich selbst" gewechselt:** Angaben zur beschenkten Person gehen nicht mit in den Kauf.
- **Nur SMS beim Weg „Auch am Computer":** Schritt 5 verlangt weiter eine E-Mail für die Portal-Einladung.
- **Eigene Adresse beim Geschenk:** Bei „Nur per Sprachnachricht" ist das erlaubt, zum Beispiel wenn die Oma keine eigene E-Mail hat. Für die Portal-Einladung in Schritt 5 bleibt eine andere Adresse Pflicht.
- **Beides gewählt, ein Feld leer oder ungültig:** Es geht nicht weiter, die Meldung steht am betroffenen Feld.
- **Checkout schlägt fehl:** Die Person bleibt bei „Bereit zum Start?", die Angaben bleiben erhalten, es erscheint eine verständliche Meldung.
- **Zurück nach erfolgreicher Zahlung:** Das Onboarding beginnt leer. Ein zweiter Kauf mit den alten Angaben passiert nicht versehentlich.
- **Gast meldet sich mitten im Ablauf an:** Die Angaben bleiben im Tab erhalten.
- **Abmelden und anderes Konto im selben Tab:** Die Angaben der vorherigen Person sind nicht mehr da.
- **Vorbelegter Weg über den Link der Website:** Schritt 1 entfällt, alle anderen Regeln gelten.

## Nicht in diesem Feature

- Versand der Erzähl-Impulse, Aufnahme und Einstellungen in der Projektübersicht (PROJ-12)
- Die Grußnachricht (PROJ-23)
- Änderungen an Rollen und Rechten
- Der echte Druckauftrag (PROJ-16)
- Die Zustimmung zu den AGB (PROJ-27)

## Vor dem Go-live zu klären

- **Erzähl-Impulse an Dritte, anwaltlich prüfen:**
  1. Sind die Nachrichten ein Service zum gekauften Buch oder Werbung? Werbung per Mail oder SMS braucht die vorherige ausdrückliche Einwilligung der Empfänger selbst (§ 7 Abs. 2 Nr. 2 UWG).
  2. Reicht das Häkchen des Käufers? Es ist nur seine Zusicherung. Bei Empfehlungs-Mails haftet laut BGH (I ZR 208/12) auch das Unternehmen, wenn ein Dritter den Versand auslöst.
  3. Wie wird die Person informiert? Spätestens mit der ersten Nachricht braucht sie die Angaben nach Art. 14 DSGVO, darunter Herkunft der Daten und Widerspruchsrecht.
  4. Kann es ohne Abmeldung bleiben? Die bisherige Produktentscheidung passt schlecht zum Widerspruchsrecht. Entschieden wird das in `/refine PROJ-12`.
- **Datenschutz:** Die Datenschutzerklärung muss nennen, dass Käufer Kontaktdaten einer anderen Person angeben.
- **Preis:** Website, AGB und PROJ-16 müssen dieselbe Leistung nennen: erstes gedrucktes Hardcover-Buch inklusive.

## Technical Requirements

- **Sicherheit:** Alle Angaben werden zusätzlich serverseitig geprüft. Kontaktdaten stehen nicht in der URL und nicht in Logs.
- **Datensparsamkeit:** Es werden nur die Kontaktdaten gespeichert, die für die gewählten Wege gebraucht werden.
- **Keine Funktionsänderung am Kauf:** Preis, Stripe-Ablauf, Kauf ohne Konto und Einladungen bleiben gleich.
- **Barrierearmut:** WCAG 2.1 AA für Kontrast, Tastaturbedienung und Beschriftungen.
- **Browser:** Chrome, Firefox und Safari in aktuellen Versionen.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

> Von Jakob am 2026-11-23 freigegeben, inklusive der neuen RLS-Regeln. Geprüft am vorhandenen Code.

**Kurzfassung:** PROJ-24 braucht Frontend und Backend. Neu sind zwei geschützte Tabellen, eine Migration, ein Paket zur Prüfung von Handynummern und ein Aufräumschritt im täglichen Cron. Neue Env-Variablen und neue Stripe-Webhook-Events sind nicht nötig.

### A) Aufbau

```
Onboarding
+-- Schrittanzeige (besser lesbar)
+-- Für wen ist das Lebensbuch?
+-- Wie heißen Sie?
+-- Für wen ist das Geschenk?
+-- Erzähl-Impulse (neu)
|   +-- Frage Ja oder Nein (nicht bei „Nur per Sprachnachricht")
|   +-- Auswahl E-Mail, SMS oder beides
|   +-- Felder für E-Mail und Handynummer
|   +-- Hinweis „jeden Sonntag"
|   +-- Häkchen zum Einverständnis (nur bei Geschenken)
+-- Zugang einrichten (wie heute, E-Mail vorbefüllt)
+-- Bereit zum Start? (Zusammenfassung, neuer Preistext)
+-- Zwischenspeicher im Browser-Tab

Nach „Jetzt kaufen"
+-- Der Server prüft alle Angaben
+-- Kontaktdaten kommen in die Kauf-Vorbereitung
+-- Stripe bekommt nur eine zufällige Kennung
+-- Nach der Zahlung: Erzähl-Einstellungen am Projekt
+-- Die Kauf-Vorbereitung wird gelöscht
```

### B) Daten

**Erzähl-Einstellungen (neu, eine Zeile pro Projekt, Grundlage für PROJ-12):**

- Name der erzählenden Person, E-Mail, Handynummer
- Gewählte Wege: Mail, SMS oder beides
- Wochentag und Rhythmus, Vorgabe jeden Sonntag
- Zeitpunkt und Textversion des Einverständnisses, nur bei Geschenken

Wer „Nein" wählt, bekommt keine Zeile. Das Projekt gilt dann als „nicht eingerichtet".

**Kauf-Vorbereitung (neu, nur kurzlebig):** Sie hält dieselben Angaben, bis der Kauf erfüllt ist.

| Zustand | Wird gelöscht |
|---|---|
| Keine Zahlung | nach 2 Tagen |
| Zahlung läuft, zum Beispiel SEPA | beim Zahlungseingang, spätestens nach 21 Tagen |
| Bezahlt, Konto noch nicht angelegt | beim Einlösen, spätestens nach 90 Tagen |
| Kauf erfüllt | sofort |

**Browser-Tab:** Der Zwischenspeicher hält die Eingaben und den aktuellen Schritt. Er gehört zum Konto, mit dem sie eingegeben wurden, und ist nach dem Kauf oder beim Schließen des Tabs weg.

### C) Technische Entscheidungen

1. **Kontaktdaten gehen nicht über Stripe.** PROJ-12 sah das noch vor. Stripe speichert solche Angaben aber dauerhaft, auch bei abgebrochenen Käufen. Für Daten einer dritten Person ist das nicht sparsam genug.
2. **Eine Stelle für alle Käufe.** Angemeldeter Kauf, Kauf ohne Konto und Geschenk ohne eigenen Zugang laufen schon heute über dieselbe Erfüllung. Dort werden auch die Erzähl-Einstellungen angelegt.
3. **Kontaktdaten verhindern nie einen Kauf.** Fehlt die Kauf-Vorbereitung, entsteht das Buch trotzdem. Das Erzählen ist dann „nicht eingerichtet" und lässt sich mit PROJ-12 in der Projektübersicht nachtragen.
4. **Vor der Zahlung wird niemand angeschrieben.** So lässt sich der offene Kaufweg nicht nutzen, um fremde Menschen mit Nachrichten zu belästigen.
5. **Zugriff nur über den Server.** Beide Tabellen sind per RLS für Browser und angemeldete Nutzer komplett gesperrt. Lese- und Änderungsrechte für die Projektübersicht kommen erst mit PROJ-12. Diese RLS-Regeln hat Jakob am 2026-11-23 freigegeben.
6. **Gleiche Prüfung im Browser und auf dem Server.** Handynummern werden international geprüft und einheitlich gespeichert, damit PROJ-12 sie direkt nutzen kann.
7. **Der Zwischenspeicher bleibt im Browser.** Abgebrochene Eingaben landen dadurch nicht auf dem Server.

### D) Stolperstellen, die der Bau mit löst

| Stelle | Folge ohne Fix |
|---|---|
| Beim Kauf ohne Konto entsteht das Projekt erst beim Einlösen | Die Kontaktdaten wären bis dahin verloren |
| SEPA-Zahlungen kommen erst Tage später an | Die Kauf-Vorbereitung wäre schon gelöscht |
| Stripe wiederholt Webhooks bei Fehlern | Würde zu früh gelöscht, fehlen die Daten beim zweiten Versuch. Gelöscht wird erst nach vollständiger Erfüllung |
| Der Gast kennt beim Kauf für sich selbst noch keine Konto-Adresse | Die E-Mail wird nach der Zahlung aus dem Stripe-Checkout übernommen |
| Rückkehr von Stripe über den Browser | „Jetzt kaufen" könnte gesperrt bleiben und muss wieder aktiv sein |
| Anderes Konto im selben Tab | Es sähe sonst die Eingaben der vorherigen Person |
| Stripe-Produkt und Rechnung nennen das Buch vielleicht nicht | Kaufschritt und Rechnung würden Unterschiedliches sagen |

### E) Bau-Reihenfolge

1. `/frontend`: Lesbarkeit, Schritt „Erzähl-Impulse", Zusammenfassung, Preistext, Druck-Karte, Zwischenspeicher
2. `/backend`: Migration, Prüfung beim Kauf, Übergabe ans Projekt, Aufräumen im Cron
3. `/qa`: alle Kaufwege, Abbruch, SEPA, wiederholter Webhook, Sicherheit und Geräte

### F) Tests

Geprüft werden alle sechs Kombinationen aus Weg und Erzähl-Impulsen, bezahlte und abgebrochene Käufe, der Kauf ohne Konto bis zum Einlösen und das automatische Löschen. Echte SMS oder Mails werden dabei nicht verschickt.

### G) Vor dem Go-live

- **PROJ-24 und PROJ-12 gehen nur gemeinsam live.** Sonst verspricht das Onboarding Nachrichten, die nie ankommen.
- Die Migration wird in Production vor dem Code-Deploy eingespielt.
- Produktname und Beschreibung bei Stripe müssen das erste gedruckte Buch nennen.
- Die Rechtsfragen aus dem Abschnitt „Vor dem Go-live zu klären" sind beantwortet.

### H) Abhängigkeiten

- **Neue Pakete:** `libphonenumber-js` für die Prüfung von Handynummern
- **Neue Env-Variablen:** keine
- **Migration:** eine, reines ASCII, Jakob spielt sie im SQL-Editor auf Stage ein
- **Nächste Schritte nach Freigabe:** `/frontend`, danach `/backend` und `/qa`

## Implementation Notes (Frontend, 2026-11-23)

**Gebaut:**

- **Eingaberegeln:** Schritte, Pflichtfelder, Handynummern und Wegwechsel liegen in `src/lib/onboarding/wizard.ts` und können später auch auf dem Server genutzt werden.
- **Schritt „Erzähl-Impulse":** Ja oder Nein, E-Mail, SMS oder beides, Einverständnis bei Geschenken, Hinweis auf den Sonntag.
- **Zwischenspeicher:** `src/lib/onboarding/draft.ts` hält die Angaben im Browser-Tab, gebunden an das Konto. Nach dem Kauf und beim Abmelden werden sie gelöscht.
- **Lesbarkeit:** Schrittanzeige, Texte, Felder und Buttons, Fehlermeldungen direkt am Feld, keine Glaseffekte mehr.
- **Kaufschritt und Druck-Karte:** neue Zusammenfassung, Preistext mit dem Buch zuerst, Hinweis auf das bereits bezahlte Buch.

**Noch nicht gebaut (`/backend`):** Die Angaben aus dem Schritt „Erzähl-Impulse" gehen beim Kauf noch nicht an den Server. Ein Testkauf auf Stage speichert sie also noch nicht.

**Ergänzungen beim Bau:**

- Die Vorwahl wird aus Deutschland, Österreich und der Schweiz gewählt. Andere Länder gehen über die Eingabe mit `+`.
- Der Zwischenspeicher verfällt zusätzlich nach 24 Stunden, auch wenn der Tab offen bleibt.
- Ändert sich der Name der beschenkten Person, muss das Einverständnis neu bestätigt werden.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
