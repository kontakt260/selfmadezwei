import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

// Service-Role-Client für server-seitige Schreibvorgänge, die RLS
// bewusst umgehen müssen — aktuell genutzt von:
//   - /api/stripe/webhook (Paywall-Updates in `project_access`)
//   - PROJ-11 Resend-Mailer (Einladungen versenden)
//
// CRITICAL: dieser Client darf NIEMALS in einer Client-Komponente landen.
// `import "server-only"` erzwingt Build-Errors bei versehentlichem
// Client-Import. Der Key wird ausschließlich aus
// `SUPABASE_SERVICE_ROLE_KEY` gelesen — NIEMALS aus
// `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` o.Ä. (kein NEXT_PUBLIC_
// erlaubt für Secrets, siehe .claude/rules/security.md).

export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY oder NEXT_PUBLIC_SUPABASE_URL fehlt — " +
        "Service-Role-Client kann nicht erstellt werden.",
    );
  }
  return createSupabaseClient<Database>(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
