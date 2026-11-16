import { describe, expect, it } from "vitest";
import {
  claimHashesEqual,
  encodeClaimCookie,
  generateClaimToken,
  hashClaimToken,
  isClaimTokenHash,
  parseClaimCookie,
} from "./claim-token";

describe("Einlöse-Geheimnis", () => {
  it("hat 256 Bit Zufall und ist jedes Mal anders", () => {
    const a = generateClaimToken();
    const b = generateClaimToken();
    expect(a).not.toBe(b);
    expect(Buffer.from(a, "base64url")).toHaveLength(32);
  });

  it("wird nur als SHA-256-Hash weitergegeben", () => {
    const token = generateClaimToken();
    const hash = hashClaimToken(token);
    expect(isClaimTokenHash(hash)).toBe(true);
    expect(hash).not.toContain(token);
    expect(hashClaimToken(token)).toBe(hash);
    expect(claimHashesEqual(hash, hashClaimToken(token))).toBe(true);
    expect(claimHashesEqual(hash, hashClaimToken(generateClaimToken()))).toBe(false);
    expect(claimHashesEqual(hash, "kein-hash")).toBe(false);
  });
});

describe("Einlöse-Cookie", () => {
  const token = generateClaimToken();

  it("übersteht Kodieren und Lesen", () => {
    const value = encodeClaimCookie({ sessionId: "cs_test_a1B2c3D4e5", token });
    expect(parseClaimCookie(value)).toEqual({ sessionId: "cs_test_a1B2c3D4e5", token });
  });

  it("verwirft alles, was nicht dem Format entspricht", () => {
    expect(parseClaimCookie(undefined)).toBeNull();
    expect(parseClaimCookie("")).toBeNull();
    expect(parseClaimCookie(token)).toBeNull();
    expect(parseClaimCookie(`pi_123.${token}`)).toBeNull();
    expect(parseClaimCookie("cs_test_a1B2c3D4e5.zu-kurz")).toBeNull();
    expect(parseClaimCookie(`cs_test_a1B2c3D4e5.${token}x`)).toBeNull();
    expect(parseClaimCookie(`cs_test_a1'; DROP--.${token}`)).toBeNull();
  });
});
