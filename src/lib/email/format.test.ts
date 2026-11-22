import { describe, it, expect } from "vitest";
import { calendarDaysUntil, formatGermanDate } from "./format";

describe("calendarDaysUntil", () => {
  it("counts calendar days instead of rounding up started days (BUG-15)", () => {
    // Echter Fall: Mail am 22.11. um 00:48 Uhr, Ablauf am 11.12. um 23:01 Uhr.
    expect(calendarDaysUntil("2026-12-11T22:01:12Z", "2026-11-21T23:48:12Z")).toBe(19);
  });

  it("uses the German date around midnight", () => {
    const morning = "2026-11-22T09:00:00Z";
    expect(calendarDaysUntil("2026-11-23T22:59:00Z", morning)).toBe(1); // 23.11., 23:59
    expect(calendarDaysUntil("2026-11-23T23:01:00Z", morning)).toBe(2); // 24.11., 00:01
  });

  it("is 0 on the day of expiry", () => {
    expect(calendarDaysUntil("2026-11-22T22:00:00Z", "2026-11-22T09:00:00Z")).toBe(0);
  });

  it("stays correct across the change to summer time", () => {
    expect(calendarDaysUntil("2027-03-29T12:00:00Z", "2027-03-27T12:00:00Z")).toBe(2);
  });

  it("matches the date shown in the mail", () => {
    expect(formatGermanDate("2026-12-11T22:01:12Z")).toBe("11. Dezember 2026");
  });
});
