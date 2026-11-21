import "server-only";
import crypto from "node:crypto";

// Einlöse-Geheimnis für Käufe ohne Konto (PROJ-6, 2026-11-16).
//
// Wer ohne Anmeldung kauft, bekommt beim Start des Checkouts ein zufälliges
// Geheimnis in ein httpOnly-Cookie. In Stripe und in der Datenbank liegt nur
// dessen SHA-256-Hash. Nach der Zahlung kann genau der Browser, der gekauft
// hat, den Kauf einem Konto zuordnen — unabhängig davon, welche
// E-Mail-Adresse im Checkout stand.
//
// Gleiche Regeln wie für die Aufnahme-Links (CLAUDE.md): ≥ 256 Bit Zufall,
// nicht aus IDs ableitbar, nur als Hash gespeichert, alle Prüfungen
// serverseitig.

export const CLAIM_COOKIE = "nv_kauf";
/** 60 Tage — länger als jede realistische Spanne zwischen Kauf und Konto. */
export const CLAIM_COOKIE_MAX_AGE_SECONDS = 60 * 24 * 60 * 60;

/**
 * Geheimnis aus dem persönlichen Link der Kauf-Mail (/kauf-zuordnen). Kurze
 * Laufzeit, damit es auf gemeinsam genutzten Geräten nicht liegen bleibt —
 * der Link aus der Mail funktioniert danach weiterhin.
 */
export const CLAIM_LINK_COOKIE = "nv_kauf_link";
export const CLAIM_LINK_COOKIE_MAX_AGE_SECONDS = 24 * 60 * 60;

const TOKEN_BYTES = 32; // 256 Bit
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/; // 32 Byte als base64url
const SESSION_ID_PATTERN = /^cs_[A-Za-z0-9_]{8,250}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;

export function generateClaimToken(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashClaimToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

export function isClaimToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

export function isClaimTokenHash(value: unknown): value is string {
  return typeof value === "string" && HASH_PATTERN.test(value);
}

/** Zeitkonstanter Vergleich zweier Hashes (hex). */
export function claimHashesEqual(a: string, b: string): boolean {
  if (!isClaimTokenHash(a) || !isClaimTokenHash(b)) return false;
  return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

export type ClaimCookie = {
  /** Stripe-Checkout-Session, zu der das Geheimnis gehört. */
  sessionId: string;
  token: string;
};

/** Cookie-Wert: Session-ID und Geheimnis, durch einen Punkt getrennt. */
export function encodeClaimCookie(cookie: ClaimCookie): string {
  return `${cookie.sessionId}.${cookie.token}`;
}

export function parseClaimCookie(value: string | undefined | null): ClaimCookie | null {
  if (!value) return null;
  const separator = value.indexOf(".");
  if (separator <= 0) return null;
  const sessionId = value.slice(0, separator);
  const token = value.slice(separator + 1);
  if (!SESSION_ID_PATTERN.test(sessionId) || !TOKEN_PATTERN.test(token)) return null;
  return { sessionId, token };
}
