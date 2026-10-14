import { ResetPasswordTemplate } from "../auth/ResetPasswordTemplate";

// Supabase-Vorlage „Reset password". Die Links enthalten Supabase-Platzhalter
// ({{ .RedirectTo }} …) und funktionieren in der Vorschau nicht.
export default function Preview() {
  return <ResetPasswordTemplate />;
}
