import { afterEach, describe, expect, it, vi } from "vitest";
import { getSiteUrl } from "./site-url";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getSiteUrl", () => {
  it("returns the configured address without trailing slashes", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", " https://stage-app.narravit.de// ");
    expect(getSiteUrl()).toBe("https://stage-app.narravit.de");
  });

  it.each(["development", "production"])("falls back to localhost locally in %s", (mode) => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("NODE_ENV", mode);
    expect(getSiteUrl()).toBe("http://localhost:3000");
  });

  it("never falls back to localhost on Vercel", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => getSiteUrl()).toThrow("NEXT_PUBLIC_SITE_URL fehlt");
  });
});
