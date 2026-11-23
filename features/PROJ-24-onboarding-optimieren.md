# PROJ-24: Onboarding optimieren

> **Kurzfassung (PROJ-31).** Das vollständige Tech Design, Bau-Notizen, QA-Protokolle und der Deployment-Verlauf stehen unverändert im [Archiv](archive/PROJ-24-onboarding-optimieren.md).

## Status: Approved
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
7. **Keine Einverständnis-Box:** Die Erzähl-Impulse sind eine Serviceleistung. Die Person wird ab der ersten Kontaktaufnahme informiert und kann dort ablehnen oder widerrufen. Das baut PROJ-12.
8. **Handynummer:** ein einziges Feld für alle Länder, gespeichert als eine Nummer im internationalen Format.
9. **Letzte Seite:** nur Name, Für wen, beschenkte Person und E-Mail für das Geschenk, dazu ein Buchbild als Platzhalter.
10. **Wer „Nein" wählt, bleibt nicht auf das Schreiben festgelegt:** Die Person soll sich später im Portal für Erzähl-Impulse entscheiden oder sich selbst einen auslösen können, auch per Audio. Wie genau, klärt `/refine PROJ-12`.

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

- [x] AC-1: Die Schritte erscheinen in der Reihenfolge der Tabelle, jeweils nur die zum gewählten Weg passenden.
- [x] AC-2: Die Schrittanzeige ist gut lesbar: Ziffern mindestens 16 px und mindestens 4,5:1 Kontrast, auch beim aktuellen Schritt.
- [x] AC-3: Alle Texte im Onboarding sind mindestens 16 px groß und erreichen mindestens 4,5:1 Kontrast. Alle Bedienelemente sind mindestens 44 px hoch.
- [x] AC-4: Schriften und Stil folgen PROJ-22. NARRAVIT steht im Schriftzug in Merriweather.
- [x] AC-5: Die Zusammenfassung nutzt einfache Begriffe, zum Beispiel „Für wen" statt „Geschenk?" und „Beschenkte Person" statt „Beschenkte:r".
- [x] AC-6: Fehlermeldungen stehen direkt beim betroffenen Feld, in der Sie-Form, und sagen, was zu tun ist.
- [x] AC-7: Das Onboarding funktioniert bei 1440, 768 und 375 px ohne seitliches Scrollen und bei 200 % Zoom.
- [x] AC-8: Der Link „Zum persönlichen Bereich" für Konten ohne Projekt und der Link „Anmelden" für Gäste bleiben erhalten.

### B. Schritt „Erzähl-Impulse"

- [x] AC-9: Bei „Nur per Sprachnachricht erzählen" sind die Erzähl-Impulse fest eingeschaltet. Ohne gültigen Kontaktweg geht es nicht weiter.
- [x] AC-10: Bei „Auch am Computer schreiben" und „Für mich selbst" gibt es eine Ja-oder-Nein-Frage, Ja ist vorausgewählt.
- [x] AC-11: Bei Nein verschwinden die Kontaktfelder und man kommt ohne weitere Angaben zum nächsten Schritt. Die Karte sagt: „[Name] nutzt zunächst nur den gängigen Projektzugang." Beim eigenen Kauf: „Ich nutze zunächst nur den gängigen Projektzugang."
- [x] AC-28: Der Untertitel lautet: „[Name] bekommt eine tiefgehende Leitfrage und kann die Antwort einfach per Sprachnachricht erzählen oder im Portal festhalten." Beim eigenen Kauf in der Sie-Form. Bei „Nur per Sprachnachricht" entfällt das Portal.
- [x] AC-29: „Für wen ist das Geschenk?" hat keinen Untertitel. Die Karte „Nur per Sprachnachricht erzählen" ergänzt: „Das ist vor allem für Personen geeignet, denen der Umgang mit dem Computer schwerfällt."
- [x] AC-12: Bei Ja wählt man **E-Mail**, **SMS** oder **beides**. Es erscheinen nur die dazu passenden Felder.
- [x] AC-13: Die Handynummer steht in einem einzigen Feld mit dem Hinweis „Geben Sie die Nummer mit + und Ländervorwahl ein, zum Beispiel +49." Nummern aller Länder werden angenommen und einheitlich gespeichert, ungültige direkt am Feld abgelehnt.
- [x] AC-14: Bei „Für mich selbst" ist die eigene E-Mail-Adresse vorbefüllt. Gäste ohne Konto tragen keine Adresse ein, die Impulse gehen an die Adresse, mit der sie bezahlen. Der Schritt sagt das so.
- [x] AC-15: Der Schritt sagt in einem Satz, dass die Erzähl-Impulse jeden Sonntag kommen und der Rhythmus später in der Projektübersicht änderbar ist.
- [x] AC-16: Es gibt keine Einverständnis-Box. Information und Ablehnen kommen mit der ersten Nachricht (PROJ-12).
- [x] AC-17: Die Angaben werden erst nach erfolgreicher Zahlung dem Projekt zugeordnet. Kommt keine Zahlung zustande, werden sie automatisch gelöscht (Fristen im Tech Design).
- [x] AC-18: Durch PROJ-24 allein wird keine Nachricht verschickt. Der Versand kommt mit PROJ-12.

### C. Zugang einrichten

- [x] AC-19: Schalter „Eigener Zugang" und Rollenauswahl bleiben in Funktion und Regeln wie heute.
- [x] AC-20: Eine E-Mail aus Schritt 4 ist in Schritt 5 vorbefüllt und zieht spätere Korrekturen mit, bis dort bewusst eine andere Adresse steht.

### D. Kaufschritt

- [x] AC-21: Die Zusammenfassung zeigt nur „Ihr Name", „Für wen", „Beschenkte Person" und „E-Mail für das Geschenk". Beim Kauf für sich selbst bleiben die ersten beiden.
- [x] AC-22: Das Buch steht im Preisfeld an erster Stelle. Der Preistext lautet: „Ihr erstes gedrucktes Hardcover-Buch, 12 Monate Projektzugang, Erzählen per Sprachnachricht und Editor."
- [x] AC-23: Die Karte „Buch in den Druck geben" aus PROJ-22 nennt passend dazu: „Ihr erstes gedrucktes Buch ist bereits bezahlt."

- [x] AC-27: Die letzte Seite zeigt ein Buch als Bild. Es ist ein Platzhalter und lässt sich später an einer Stelle gegen ein echtes Foto tauschen.

### E. Abbruch und Neuladen

- [x] AC-24: Wer auf der Stripe-Seite zurückgeht, landet wieder bei „Bereit zum Start?" mit allen Angaben.
- [x] AC-25: Wer die Seite neu lädt, bleibt beim selben Schritt mit allen Angaben.
- [x] AC-26: Die Angaben bleiben nur in diesem Browser-Tab. Sie werden nach erfolgreicher Zahlung, beim Abmelden und beim Schließen des Tabs gelöscht.

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
  2. Reicht es ohne Einverständnis-Box? Jakob hat sie als Serviceleistung entfernt. Bei Empfehlungs-Mails haftet laut BGH (I ZR 208/12) auch das Unternehmen, wenn ein Dritter den Versand auslöst. Deshalb dürfen die Nachrichten keine Werbung enthalten.
  3. Wie wird die Person informiert? Spätestens mit der ersten Nachricht braucht sie die Angaben nach Art. 14 DSGVO, darunter Herkunft der Daten und Widerspruchsrecht.
  4. Wie läuft das Ablehnen und Widerrufen? Es muss in den Nachrichten einfach möglich sein. Gebaut wird es mit PROJ-12.
- **Datenschutz:** Die Datenschutzerklärung muss nennen, dass Käufer Kontaktdaten einer anderen Person angeben.
- **Preis:** Website, AGB und PROJ-16 müssen dieselbe Leistung nennen: erstes gedrucktes Hardcover-Buch inklusive.

## Technical Requirements

- **Sicherheit:** Alle Angaben werden zusätzlich serverseitig geprüft. Kontaktdaten stehen nicht in der URL und nicht in Logs.
- **Datensparsamkeit:** Es werden nur die Kontaktdaten gespeichert, die für die gewählten Wege gebraucht werden.
- **Keine Funktionsänderung am Kauf:** Preis, Stripe-Ablauf, Kauf ohne Konto und Einladungen bleiben gleich.
- **Barrierearmut:** WCAG 2.1 AA für Kontrast, Tastaturbedienung und Beschriftungen.
- **Browser:** Chrome, Firefox und Safari in aktuellen Versionen.

## Technische Entscheidungen
_Kurzform. Die vollständige Begründung steht im Archiv._

### C) Technische Entscheidungen

1. **Kontaktdaten gehen nicht über Stripe.** PROJ-12 sah das noch vor. Stripe speichert solche Angaben aber dauerhaft, auch bei abgebrochenen Käufen.
2. **Eine Stelle für alle Käufe.** Angemeldeter Kauf, Kauf ohne Konto und Geschenk ohne eigenen Zugang laufen schon heute über dieselbe Erfüllung.
3. **Erzähl-Kontakte verhindern nie einen Kauf.** Fehlt die Kauf-Vorbereitung, entsteht das Buch trotzdem.
4. **Vor der Zahlung wird niemand angeschrieben.** So lässt sich der offene Kaufweg nicht nutzen, um fremde Menschen mit Nachrichten zu belästigen.
5. **Zugriff nur über den Server.** Beide Tabellen sind per RLS für Browser und angemeldete Nutzer komplett gesperrt.
6. **Gleiche Prüfung im Browser und auf dem Server.** Handynummern werden international geprüft und einheitlich gespeichert, damit PROJ-12 sie direkt nutzen kann.
7. **Der Zwischenspeicher bleibt im Browser.** Abgebrochene Eingaben landen dadurch nicht auf dem Server.

### Spätere Entscheidungen
- **Geschenk-Bestätigung (Jakob, 2026-11-23):** Der Satz „Das Geschenk bleibt gültig, solange der Projektzugang läuft.“ ist entfernt.

## Offene Punkte
- Live nur zusammen mit PROJ-12.
- Vor dem Go-live: Prüfung in Safari und Firefox.
- In Production die Migration vor dem Code einspielen.
- Produktname und Beschreibung bei Stripe müssen das erste gedruckte Buch nennen.
