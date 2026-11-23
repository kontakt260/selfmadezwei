import { describe, expect, it } from "vitest";
import { isFreshDataRoute } from "./history-freshness";

describe("isFreshDataRoute", () => {
  it("gilt für die Seiten nach der Anmeldung", () => {
    for (const path of [
      "/",
      "/persoenlicher-bereich",
      "/projektuebersicht/p1",
      "/projektuebersicht/p1/cover-bearbeiten",
      "/projektuebersicht/p1/kapiteleditor/c1",
    ]) {
      expect(isFreshDataRoute(path)).toBe(true);
    }
  });

  it("lässt öffentliche Seiten außen vor", () => {
    for (const path of ["/anmelden", "/registrieren", "/onboarding", "/kauf-erfolgreich"]) {
      expect(isFreshDataRoute(path)).toBe(false);
    }
  });
});
