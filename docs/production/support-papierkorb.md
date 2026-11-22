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

Kommt die Mail „Zahlung für ein gelöschtes Projekt", wurde kurz nach dem Löschen noch eine Verlängerung bezahlt. Die Zahlung ist gebucht.

- **Projekt liegt im Papierkorb:** Mit der Person klären, ob es wiederhergestellt (Abschnitt 4) oder die Zahlung in Stripe erstattet werden soll.
- **Projekt ist endgültig gelöscht:** Die Zahlung in Stripe erstatten. Die Mail nennt diesen Fall ausdrücklich.

## Fehlermeldungen

| Meldung | Bedeutung |
|---|---|
| `not_in_trash` | Die ID stimmt nicht, oder der Inhalt ist schon wiederhergestellt oder endgültig gelöscht |
| `project_in_trash` | Das Kapitel gehört zu einem gelöschten Projekt. Zuerst das Projekt wiederherstellen |
| `lead_required` | Es gibt keine Projektleitung mehr, siehe Abschnitt 4 |
| `lead_not_member` | Die genannte Person war nicht Mitglied des Projekts |
