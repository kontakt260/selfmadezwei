// PROJ-11 — zentrale Re-Exports aller Mail-Templates + Props-Typen.
//
// Backend-Send-Helper importieren von hier, damit die Pfade stabil bleiben,
// auch wenn wir später die Template-Datei-Struktur reorganisieren.

export { Layout, COLORS } from "./Layout";

export { InvitationEmail } from "./InvitationEmail";
export type { InvitationEmailProps } from "./InvitationEmail";

export { PortalPurchaseEmail } from "./PortalPurchaseEmail";
export type { PortalPurchaseEmailProps } from "./PortalPurchaseEmail";

export { WelcomeEmail } from "./WelcomeEmail";
export type { WelcomeEmailProps } from "./WelcomeEmail";

export { RenewalEmail } from "./RenewalEmail";
export type { RenewalEmailProps } from "./RenewalEmail";

export { ReminderEmail } from "./ReminderEmail";
export type {
  ReminderEmailProps,
  ReminderVariant,
} from "./ReminderEmail";
