import { describe, expect, it } from "vitest";
import { addTwelveMonths } from "./access-period";

describe("addTwelveMonths", () => {
  it("endet am selben Kalendertag im Folgejahr", () => {
    expect(addTwelveMonths("2026-11-21T10:30:00.000Z").toISOString()).toBe("2027-11-21T10:30:00.000Z");
  });

  it("verliert über einen 29. Februar keinen Tag", () => {
    expect(addTwelveMonths("2027-12-01T00:00:00.000Z").toISOString()).toBe("2028-12-01T00:00:00.000Z");
    expect(addTwelveMonths("2028-01-15T08:00:00.000Z").toISOString()).toBe("2029-01-15T08:00:00.000Z");
  });

  it("vom 29. Februar aus endet der Zugang am 28. Februar", () => {
    expect(addTwelveMonths("2028-02-29T12:00:00.000Z").toISOString()).toBe("2029-02-28T12:00:00.000Z");
  });

  it("verändert das übergebene Datum nicht", () => {
    const from = new Date("2026-11-21T10:30:00.000Z");
    addTwelveMonths(from);
    expect(from.toISOString()).toBe("2026-11-21T10:30:00.000Z");
  });
});
