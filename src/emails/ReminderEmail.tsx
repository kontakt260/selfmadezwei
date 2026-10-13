// PROJ-11 — Ablauf-Reminder (30- oder 7-Tage-Variante).
//
// Trigger: täglicher Vercel-Cron-Job (siehe Tech Design F.5 +
// /api/cron/reminders), selektiert Portal-Zugänge in den Fenstern
// [now+29d..now+30d] und [now+6d..now+7d].
//
// Eine Komponente, zwei Varianten — gesteuert per `variant`-Prop.
// Beide Mails verlinken auf den Verlängerungs-Stripe-Checkout (PROJ-6).

import {
  Layout,
  MailHeading,
  MailParagraph,
  MailCtaButton,
  MailDetailsList,
} from "./Layout";

export type ReminderVariant = "30" | "7";

export type ReminderEmailProps = {
  fullName?: string;
  projectName: string;
  /** Ablauf-Datum, z. B. „22. Juni 2026" */
  expiresAtFormatted: string;
  variant: ReminderVariant;
  /** Verlängerungs-Checkout-URL (z. B. /onboarding?type=renewal&project=…) */
  renewUrl: string;
  siteUrl: string;
};

const HEADINGS: Record<ReminderVariant, string> = {
  "30": "Ihr Portal-Zugang läuft in 30 Tagen ab",
  "7": "Nur noch 7 Tage Portal-Zugang",
};

const TONE: Record<ReminderVariant, string> = {
  "30":
    "ein freundlicher Hinweis: Ihr Portal-Zugang für dieses Projekt läuft in rund 30 Tagen ab. Falls Sie weiter schreiben möchten, können Sie den Zugang jetzt um 12 Monate verlängern — es eilt aber noch nicht.",
  "7":
    "nur noch 7 Tage: Ihr Portal-Zugang läuft am unten genannten Datum ab. Wenn Sie weiter am Projekt arbeiten möchten, verlängern Sie den Zugang bitte rechtzeitig, sonst verlieren Sie kurzzeitig den Zugriff.",
};

const CTA_LABEL: Record<ReminderVariant, string> = {
  "30": "Jetzt verlängern",
  "7": "Jetzt verlängern",
};

const EYEBROW: Record<ReminderVariant, string> = {
  "30": "Erinnerung",
  "7": "Wichtiger Hinweis",
};

const PREVIEW: Record<ReminderVariant, (project: string, date: string) => string> =
  {
    "30": (project, date) =>
      `Ihr narravit-Portal-Zugang für „${project}" läuft am ${date} ab.`,
    "7": (project, date) =>
      `Nur noch 7 Tage: Portal-Zugang für „${project}" läuft am ${date} ab.`,
  };

export function ReminderEmail({
  fullName,
  projectName,
  expiresAtFormatted,
  variant,
  renewUrl,
  siteUrl,
}: ReminderEmailProps) {
  const greeting = fullName?.trim()
    ? `Hallo ${fullName.trim()},`
    : "Hallo,";

  const details: Array<{ label: string; value: string }> = [
    { label: "Projekt", value: projectName },
    { label: "Zugang läuft ab am", value: expiresAtFormatted },
  ];

  return (
    <Layout
      preview={PREVIEW[variant](projectName, expiresAtFormatted)}
      headerEyebrow={EYEBROW[variant]}
      siteUrl={siteUrl}
    >
      <MailHeading>{HEADINGS[variant]}</MailHeading>
      <MailParagraph>{greeting}</MailParagraph>
      <MailParagraph>{TONE[variant]}</MailParagraph>

      <MailDetailsList items={details} />

      <MailCtaButton href={renewUrl}>{CTA_LABEL[variant]}</MailCtaButton>

      <MailParagraph>
        Falls Sie das Projekt nicht weiterführen möchten, müssen Sie nichts
        unternehmen — der Zugang läuft dann einfach aus, Ihre Inhalte
        bleiben erhalten und können bei einer späteren Verlängerung wieder
        bearbeitet werden.
      </MailParagraph>
    </Layout>
  );
}
