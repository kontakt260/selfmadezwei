import { describe, expect, it } from "vitest";
import { assertLoaded, isUuid } from "./page-data";

describe("isUuid", () => {
  it("erkennt gültige und ungültige IDs", () => {
    expect(isUuid("cccccccc-0099-0099-0099-000000000099")).toBe(true);
    expect(isUuid("optimistic-123")).toBe(false);
    expect(isUuid("")).toBe(false);
  });
});

describe("assertLoaded", () => {
  it("lässt leere Ergebnisse durch, sie bedeuten „nicht gefunden“", () => {
    expect(() => assertLoaded({ error: null }, null)).not.toThrow();
  });

  it("wirft bei einem Datenbankfehler", () => {
    expect(() => assertLoaded({ error: null }, { error: { message: "kaputt" } })).toThrow("kaputt");
  });
});
