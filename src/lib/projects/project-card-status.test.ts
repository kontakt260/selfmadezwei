import { describe, expect, it } from "vitest";
import { formatLastEdited, projectCardAccess } from "./project-card-status";

describe("formatLastEdited", () => {
  const now = "2026-11-23T08:00:00+01:00";

  it("zählt gestern Abend am nächsten Morgen als gestern", () => {
    expect(formatLastEdited("2026-11-22T22:30:00+01:00", now)).toBe(
      "Zuletzt bearbeitet: gestern",
    );
  });

  it("nutzt die deutsche Zeit an der Tagesgrenze", () => {
    // 23:30 UTC ist in Deutschland schon der nächste Tag.
    expect(formatLastEdited("2026-11-22T23:30:00Z", now)).toBe(
      "Zuletzt bearbeitet: heute",
    );
  });

  it("zeigt bei leicht abweichender Uhr keinen negativen Wert", () => {
    expect(formatLastEdited("2026-11-24T00:10:00+01:00", now)).toBe(
      "Zuletzt bearbeitet: heute",
    );
  });

  it.each([
    ["2026-11-20T12:00:00+01:00", "vor 3 Tagen"],
    ["2026-11-16T12:00:00+01:00", "vor 1 Woche"],
    ["2026-11-02T12:00:00+01:00", "vor 3 Wochen"],
    ["2026-10-20T12:00:00+02:00", "vor 1 Monat"],
    ["2026-08-01T12:00:00+02:00", "vor 3 Monaten"],
  ])("formatiert %s als %s", (editedAt, label) => {
    expect(formatLastEdited(editedAt, now)).toBe(`Zuletzt bearbeitet: ${label}`);
  });
});

describe("projectCardAccess", () => {
  const now = new Date("2026-11-23T12:00:00Z").getTime();

  it("meldet einen laufenden Zugang als aktiv", () => {
    expect(projectCardAccess("2027-01-01T00:00:00Z", false, now)).toEqual({
      state: "active",
    });
  });

  it("wertet ein fehlendes Ablaufdatum nicht als abgelaufen", () => {
    expect(projectCardAccess(null, false, now)).toEqual({ state: "active" });
  });

  it("liefert bei Ablauf das deutsche Datum", () => {
    expect(projectCardAccess("2026-11-20T12:00:00Z", false, now)).toEqual({
      state: "expired",
      expiredOn: "20. November 2026",
    });
  });

  it("bleibt neutral, wenn der Zugang nicht geladen werden konnte", () => {
    expect(projectCardAccess("2026-11-20T12:00:00Z", true, now)).toEqual({
      state: "unknown",
    });
  });
});
