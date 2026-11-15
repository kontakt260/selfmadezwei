import { describe, expect, it } from "vitest";
import { daysUntil, isPast } from "./dates";

const NOW = Date.parse("2026-11-15T12:00:00.000Z");

describe("daysUntil", () => {
  it("rundet auf volle Tage ab", () => {
    expect(daysUntil("2026-11-16T11:59:59.000Z", NOW)).toBe(0);
    expect(daysUntil("2026-11-16T12:00:00.000Z", NOW)).toBe(1);
    expect(daysUntil("2026-12-15T12:00:00.000Z", NOW)).toBe(30);
  });

  it("wird nie negativ", () => {
    expect(daysUntil("2026-11-01T00:00:00.000Z", NOW)).toBe(0);
  });
});

describe("isPast", () => {
  it("erkennt vergangene und zukünftige Zeitpunkte", () => {
    expect(isPast("2026-11-15T11:59:59.000Z", NOW)).toBe(true);
    expect(isPast("2026-11-15T12:00:00.000Z", NOW)).toBe(false);
    expect(isPast("2026-11-16T00:00:00.000Z", NOW)).toBe(false);
  });
});
