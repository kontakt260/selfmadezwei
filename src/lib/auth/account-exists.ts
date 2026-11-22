import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";

/**
 * PROJ-17: Gibt es zu dieser Adresse ein Konto? `null`, wenn sich das gerade
 * nicht feststellen lässt. Wirft nie.
 *
 * Verrät, ob eine Adresse Kunde ist. Deshalb nur nach bestandener
 * Sicherheitsprüfung und innerhalb des Login-Limits aufrufen.
 */
export async function accountExists(email: string): Promise<boolean | null> {
  try {
    const { data, error } = await createServiceRoleClient().rpc("account_exists", {
      p_email: email,
    });
    if (error || typeof data !== "boolean") {
      console.error(`[account-exists] lookup failed: ${error?.message ?? "keine Antwort"}`);
      return null;
    }
    return data;
  } catch (err) {
    console.error(
      `[account-exists] lookup failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}
