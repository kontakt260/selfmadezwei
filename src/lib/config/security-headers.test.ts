import { describe, expect, it } from "vitest";
import { buildSecurityHeaders } from "./security-headers";

function headers(input: { isDevelopment?: boolean; isDeployed?: boolean } = {}) {
  return Object.fromEntries(
    buildSecurityHeaders({
      isDevelopment: input.isDevelopment ?? false,
      isDeployed: input.isDeployed ?? true,
    }).map((header) => [header.key, header.value]),
  );
}

describe("buildSecurityHeaders", () => {
  it("sets the protection headers", () => {
    const result = headers();
    expect(result["X-Frame-Options"]).toBe("DENY");
    expect(result["X-Content-Type-Options"]).toBe("nosniff");
    expect(result["Referrer-Policy"]).toBe("origin-when-cross-origin");
    expect(result["Permissions-Policy"]).toBe("camera=(), microphone=(), geolocation=()");
  });

  it("enforces only the small CSP core", () => {
    expect(headers()["Content-Security-Policy"]).toBe(
      "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
    );
  });

  it("observes the rest and knows Turnstile, Supabase and local image previews", () => {
    const csp = headers()["Content-Security-Policy-Report-Only"];
    expect(csp).toContain("script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com");
    expect(csp).toContain("frame-src https://challenges.cloudflare.com");
    expect(csp).toContain("img-src 'self' data: blob: https://*.supabase.co");
    expect(csp).toContain("connect-src 'self' https://*.supabase.co");
  });

  it("allows eval and websockets only in development", () => {
    expect(headers()["Content-Security-Policy-Report-Only"]).not.toContain("unsafe-eval");
    expect(headers()["Content-Security-Policy-Report-Only"]).not.toContain(" ws:");
    const dev = headers({ isDevelopment: true })["Content-Security-Policy-Report-Only"];
    expect(dev).toContain("'unsafe-eval'");
    expect(dev).toContain(" ws:");
  });

  it("forces HTTPS when deployed, without preload", () => {
    const hsts = headers({ isDeployed: true })["Strict-Transport-Security"];
    expect(hsts).toBe("max-age=63072000; includeSubDomains");
    expect(hsts).not.toContain("preload");
  });

  it("never forces HTTPS on localhost", () => {
    expect(headers({ isDeployed: false })["Strict-Transport-Security"]).toBeUndefined();
  });
});
