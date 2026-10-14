import { ConfirmSignupTemplate } from "../auth/ConfirmSignupTemplate";

// Supabase-Vorlage „Confirm signup". Die Links enthalten Supabase-Platzhalter
// ({{ .RedirectTo }} …) und funktionieren in der Vorschau nicht.
export default function Preview() {
  return <ConfirmSignupTemplate />;
}
