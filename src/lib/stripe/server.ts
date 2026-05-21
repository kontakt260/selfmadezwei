import "server-only";
import Stripe from "stripe";

// Stripe-Server-Singleton. Niemals im Client-Bundle landen — der
// `import "server-only"`-Pragma am Top sorgt für einen Build-Fehler,
// falls eine Client-Komponente versehentlich aus diesem Modul
// importiert.
//
// Der SECRET-KEY wird ausschließlich server-seitig gelesen (keine
// NEXT_PUBLIC_-Variante). Bei fehlender Env-Variable werfen wir beim
// ersten Zugriff — kein silent fail (sonst entstehen Webhooks ohne
// Verifikation oder Checkouts ohne Backend-Zuordnung).

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Configure server-side env-vars before " +
        "calling Stripe-related code.",
    );
  }
  _stripe = new Stripe(key, {
    typescript: true,
  });
  return _stripe;
}

// Produkt-Konfiguration. Die Price-IDs werden über Env-Variablen
// injiziert (Test- vs Live-Mode unterscheidet sich nur in den IDs).
// `amountCents`/`currency` bleiben in der Konstante stehen, damit
// payments-Inserts ohne extra Stripe-Roundtrip die korrekten Werte
// haben.
export const PRODUCTS = {
  initial: {
    priceIdEnv: "STRIPE_PRICE_ID_INITIAL",
    amountCents: 24900,
    currency: "eur",
    paymentType: "initial_portal_access" as const,
  },
  renewal: {
    priceIdEnv: "STRIPE_PRICE_ID_RENEWAL",
    amountCents: 9900,
    currency: "eur",
    paymentType: "portal_access_renewal" as const,
  },
  vapi: {
    priceIdEnv: "STRIPE_PRICE_ID_VAPI_60",
    amountCents: 1900,
    currency: "eur",
    paymentType: "vapi_voice_minutes_60" as const,
  },
} as const;

export type ProductType = keyof typeof PRODUCTS;

export function getPriceId(product: ProductType): string {
  const cfg = PRODUCTS[product];
  const priceId = process.env[cfg.priceIdEnv];
  if (!priceId) {
    throw new Error(`Env-Variable ${cfg.priceIdEnv} fehlt — Price-ID nicht konfiguriert.`);
  }
  return priceId;
}

export function getSiteUrl(): string {
  const url = process.env.NEXT_PUBLIC_SITE_URL;
  if (!url) {
    throw new Error("NEXT_PUBLIC_SITE_URL fehlt — Stripe success_url/cancel_url nicht baubar.");
  }
  return url.replace(/\/$/, "");
}
