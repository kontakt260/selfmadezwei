import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/Navbar", () => ({ Navbar: () => null }));

import { loadingViewKind } from "./LoadingViews";

describe("loadingViewKind", () => {
  it("ordnet die Seiten nach der Anmeldung zu", () => {
    expect(loadingViewKind("/")).toBe("start");
    expect(loadingViewKind("/persoenlicher-bereich")).toBe("account");
    expect(loadingViewKind("/projektuebersicht/p1")).toBe("project");
    expect(loadingViewKind("/projektuebersicht/p1/cover-bearbeiten")).toBe("cover");
    expect(loadingViewKind("/projektuebersicht/p1/kapiteleditor/c1")).toBe("editor");
  });

  it("zeigt auf öffentlichen und unbekannten Seiten keine Ladeansicht", () => {
    for (const path of [
      "/anmelden",
      "/onboarding",
      "/kauf-erfolgreich",
      "/projektuebersicht",
      "/projektuebersicht/p1/unbekannt",
      "/projektuebersicht/p1/kapiteleditor",
    ]) {
      expect(loadingViewKind(path)).toBeNull();
    }
  });
});
