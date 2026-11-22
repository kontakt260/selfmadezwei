// PROJ-11 BUG-13 — interner Hinweis an den Support.
//
// Geht raus, wenn eine Mail auch nach allen Versuchen nicht verschickt werden
// konnte. Enthält bewusst keine Empfänger oder Namen, nur Art und Anzahl.

import {
  Layout,
  MailDetailsList,
  MailHeading,
  MailParagraph,
} from "./Layout";

export type MailFailureAlertEmailProps = {
  items: ReadonlyArray<{ label: string; count: number }>;
  attempts: number;
  retentionDays: number;
};

export function MailFailureAlertEmail({
  items,
  attempts,
  retentionDays,
}: MailFailureAlertEmailProps) {
  const total = items.reduce((sum, item) => sum + item.count, 0);
  const subject = total === 1 ? "Eine Mail konnte" : `${total} Mails konnten`;

  return (
    <Layout
      preview={`${subject} nicht verschickt werden.`}
      headerEyebrow="Interner Hinweis"
    >
      <MailHeading>Mails konnten nicht verschickt werden</MailHeading>
      <MailParagraph>
        {subject} auch nach {attempts} weiteren Versuchen an verschiedenen Tagen
        nicht verschickt werden. Die betroffenen Personen wissen davon nichts.
      </MailParagraph>

      <MailDetailsList
        items={items.map((item) => ({ label: item.label, value: String(item.count) }))}
      />

      <MailParagraph>
        Empfänger und Fehler stehen in der Supabase-Tabelle{" "}
        <strong>mail_retry_queue</strong>. Bitte melden Sie sich bei den
        betroffenen Personen. Die Einträge werden nach {retentionDays} Tagen
        automatisch gelöscht.
      </MailParagraph>
    </Layout>
  );
}
