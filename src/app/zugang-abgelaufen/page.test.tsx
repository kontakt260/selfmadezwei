import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));

import ZugangAbgelaufenPage from "./page";

describe("/zugang-abgelaufen (PROJ-28)", () => {
  it("führt alte Links zur Startseite", () => {
    expect(() => ZugangAbgelaufenPage()).toThrow("REDIRECT:/");
  });
});
