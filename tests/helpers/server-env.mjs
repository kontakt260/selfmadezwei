import fs from "node:fs";
import path from "node:path";

// PROJ-31: Umgebung der E2E-Tests, gemeinsam für die Playwright-Konfiguration,
// die Test-Hilfen und `scripts/run-tests.mjs`.

export const STAGE_HOST = "kdjhxqitfxnsavhiafdn.supabase.co";

/** @returns {Record<string, string>} */
export function readEnvLocal() {
  /** @type {Record<string, string>} */
  const values = {};
  const content = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) values[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
  return values;
}

// Dummy-Werte für die Webhook-Tests: Die Route durchläuft ihre Prüfungen lokal,
// ohne dass echte Stripe-Aufrufe passieren.
export function testServerEnv({ rateLimit = false } = {}) {
  return {
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ?? "sk_test_e2e_dummy",
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_e2e_dummy",
    STRIPE_PRICE_ID_INITIAL: process.env.STRIPE_PRICE_ID_INITIAL ?? "price_e2e_initial",
    STRIPE_PRICE_ID_RENEWAL: process.env.STRIPE_PRICE_ID_RENEWAL ?? "price_e2e_renewal",
    // PROJ-17: Alle Suites laufen von derselben IP und würden sich gegenseitig
    // ins Limit bringen. Die Limits prüft eine eigene Suite auf eigenem Server.
    RATE_LIMIT_DISABLED: rateLimit ? "false" : "true",
    // Öffentlicher Testschlüssel von Cloudflare, die Prüfung besteht immer.
    // Stage-Supabase nutzt den passenden Test-Secret-Key.
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
  };
}
