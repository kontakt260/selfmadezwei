# Support: Papierkorb (PROJ-26)

Gelöschte Kapitel und Projekte bleiben 14 Tage auf dem Server. Kunden sehen das nicht und können nichts selbst wiederherstellen. Alles läuft über diese Anleitung im **Supabase SQL-Editor**.

**Vor jedem Schritt prüfen:** Oben im SQL-Editor steht das richtige Projekt (Production für echte Kunden, Stage nur zum Testen).

## 1. Fall suchen

Suchbegriff ist eine E-Mail-Adresse, ein Projekt- oder ein Kapiteltitel:

```sql
SELECT * FROM public.trash_find('maria@example.de');
```

Ohne Suchbegriff erscheinen die letzten 100 Einträge:

```sql
SELECT * FROM public.trash_find();
```

| Spalte | Bedeutung |
|---|---|
| `item_type` | `chapter` oder `project` |
| `item_id` | Die ID für die nächsten Schritte |
| `title` / `project_title` | Titel des Eintrags und des Projekts |
| `delete_reason` | `customer` = von einer Person gelöscht, `expired` = automatisch 90 Tage nach dem Ablauf |
| `deleted_at` | Wann gelöscht wurde |
| `purge_at` | Ab wann die endgültige Löschung fällig ist |
| `deleted_by_email` | Wer gelöscht hat (leer, wenn das Konto nicht mehr existiert) |
| `member_emails` | Mitglieder zum Zeitpunkt der Löschung und heutige Mitglieder |
| `contributor_emails` | Personen, die an diesem Kapitel oder Projekt mitgeschrieben haben, auch wenn sie inzwischen entfernt wurden |

Die Suche zeigt bewusst **keine Kapiteltexte**. Bitte auch nicht direkt in der Tabelle `trash_chapters` nachlesen.

## 2. Anfrage prüfen

1. Die Absenderadresse muss in `member_emails` oder `contributor_emails` stehen. Sonst nichts wiederherstellen und nichts über das Projekt verraten.
2. `purge_at` muss in der Zukunft liegen. Danach ist der Inhalt endgültig weg.
3. **Streit zwischen Mitgliedern:** Erst klären, dann handeln. Entscheidung und Grund kurz dokumentieren.

## 3. Kapitel wiederherstellen

```sql
SELECT public.trash_restore_chapter('KAPITEL-ID');
```

Das Kapitel kommt mit Titel, Text und Bildern zurück. War seine Position inzwischen belegt, steht es am Ende (`movedToEnd: true`).

Liegt auch das Projekt im Papierkorb, zuerst das Projekt wiederherstellen.

## 4. Projekt wiederherstellen

```sql
SELECT public.trash_restore_project('PROJEKT-ID');
```

Projekt, Kapitel, Cover, Mitglieder und Rollen kommen zurück. Das Ablaufdatum des Zugangs ändert sich nicht. Kapitel, die schon vorher einzeln gelöscht wurden, bleiben im Papierkorb und lassen sich danach einzeln zurückholen.

**Abgelaufene Projekte:** Das Projekt ist danach im Lesemodus sichtbar. Die Antwort nennt in `holdUntil` das Datum, bis zu dem der automatische Lauf es in Ruhe lässt (14 Tage). Bitte der Person mitteilen, dass sie bis dahin verlängern muss, sonst kommt es wieder in den Papierkorb.

**Projekt ohne Mitglieder** (z. B. nie angenommenes Geschenk): Es meldet `lead_required` und lässt sich so nicht wiederherstellen, weil niemand die Leitung übernehmen kann.

**Fehler `lead_required`:** Die bisherige Projektleitung hat ihr Konto gelöscht. Dann eine verbliebene Person als neue Leitung nennen. Ihre Nutzer-ID steht in der Tabelle `trash_project_members`:

```sql
SELECT public.trash_restore_project('PROJEKT-ID', 'NUTZER-ID');
```

## 5. Sofort endgültig löschen (z. B. DSGVO-Anfrage)

**Das lässt sich nicht rückgängig machen.** Vorher die Identität der anfragenden Person prüfen und bei gemeinsamen Projekten die Rechte der anderen abwägen.

```sql
SELECT public.trash_delete_chapter_now('KAPITEL-ID');
```

```sql
SELECT public.trash_delete_project_now('PROJEKT-ID');
```

Die Datensätze sind sofort weg, die Dateien entfernt der nächste tägliche Lauf um 9:00 UTC. Antwort an die Person innerhalb eines Monats (Art. 12 DSGVO).

## 6. Zahlung für ein gelöschtes Projekt

Wurde ein Projekt **wegen Ablauf** verschoben und danach bezahlt, kommt es automatisch zurück und es gibt keine Mail.

Kommt die Mail „Zahlung für ein gelöschtes Projekt", konnte das nicht automatisch passieren. Die Zahlung ist gebucht, die Person hat keine Bestätigung bekommen und sollte deshalb eine Antwort von uns erhalten.

- **Projekt liegt im Papierkorb, `delete_reason` ist `customer`:** Jemand hat es selbst gelöscht. Mit der Person klären, ob es wiederhergestellt (Abschnitt 4) oder die Zahlung in Stripe erstattet werden soll. **Bis zum `purge_at` entscheiden**, danach ist es endgültig weg.
- **Projekt liegt im Papierkorb, `delete_reason` ist `expired`:** Meist fehlt die Projektleitung, weil ihr Konto gelöscht wurde. Mit einer verbliebenen Person als neuer Leitung wiederherstellen (Abschnitt 4). Solange der bezahlte Zugang läuft, löscht der tägliche Lauf dieses Projekt nicht.
- **Projekt ist endgültig gelöscht:** Die Zahlung in Stripe erstatten. Die Mail nennt diesen Fall ausdrücklich.

## 7. Automatischer Löschlauf angehalten (PROJ-28)

Der tägliche Lauf legt Projekte 90 Tage nach dem Ablauf in den Papierkorb. Sind mehr als 50 fällig, verschiebt er **kein einziges** und schickt die Mail „Automatischer Löschlauf angehalten". Das kann ein Fehler sein, zum Beispiel falsche Ablaufdaten.

1. Fällige Projekte ansehen. Die Liste zeigt nur IDs und Daten:

```sql
SELECT * FROM public.retention_due();
```

2. Prüfen, ob die Daten stimmen. **Im Zweifel nichts freigeben.** Der Lauf versucht es jeden Tag neu und löscht nichts, solange die Bremse greift.

3. Stimmen die Daten, den Lauf **einmalig** freigeben. Die Zahl muss genau der Anzahl aus Schritt 1 entsprechen:

```sql
SELECT public.retention_move_due(73);
```

Hat sich die Anzahl inzwischen geändert, passiert nichts und die Antwort zeigt `braked: true` mit der neuen Zahl. Bei Erfolg steht in `moved`, wie viele Projekte im Papierkorb liegen. Sie lassen sich 14 Tage lang wiederherstellen (Abschnitt 4).

## Fehlermeldungen

| Meldung | Bedeutung |
|---|---|
| `not_in_trash` | Die ID stimmt nicht, oder der Inhalt ist schon wiederhergestellt oder endgültig gelöscht |
| `project_in_trash` | Das Kapitel gehört zu einem gelöschten Projekt. Zuerst das Projekt wiederherstellen |
| `lead_required` | Es gibt keine Projektleitung mehr, siehe Abschnitt 4 |
| `lead_not_member` | Die genannte Person war nicht Mitglied des Projekts |
| `invalid_confirmation` | Die Zahl für die Freigabe muss mindestens 1 sein, siehe Abschnitt 7 |
