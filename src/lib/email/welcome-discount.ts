import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";

// Rabattcode in der Willkommens-Mail (Jakob, 2026-11-22): ein fester
// Stripe-Promotion-Code über 50 € auf den Erstkauf, ohne Ablaufdatum.
//
// Den Code bekommen nur Konten, die sich selbst registriert haben: keine
// Käufer, keine beschenkten und keine eingeladenen Personen. Im Zweifel, auch
// bei einem Datenbankfehler, geht die Mail ohne Code raus.

/** Anzeige in der Mail. Muss zum Coupon in Stripe passen. */
export const WELCOME_DISCOUNT_LABEL = "50 €";

export async function resolveWelcomeDiscountCode(input: {
  userId: string;
  email: string;
}): Promise<string | undefined> {
  const code = process.env.WELCOME_DISCOUNT_CODE?.trim();
  if (!code) return undefined;

  try {
    const supabase = createServiceRoleClient();
    const email = input.email.trim().toLowerCase();
    const checks = await Promise.all([
      supabase.from("payments").select("id").eq("user_id", input.userId).limit(1),
      supabase.from("project_members").select("project_id").eq("user_id", input.userId).limit(1),
      supabase.from("invitations").select("id").eq("email", email).limit(1),
      supabase.from("purchase_claims").select("id").eq("buyer_email", email).limit(1),
      supabase.from("purchase_claims").select("id").eq("claimed_by", input.userId).limit(1),
    ]);

    for (const { data, error } of checks) {
      if (error) {
        console.error(`[email/welcome-discount] check failed: ${error.message}`);
        return undefined;
      }
      if (!data || data.length > 0) return undefined;
    }
    return code;
  } catch (err) {
    console.error(
      `[email/welcome-discount] check failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return undefined;
  }
}
