import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const nav = vi.hoisted(() => ({ pathname: "/projektuebersicht/p1" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));
vi.mock("@/components/Navbar", () => ({ Navbar: () => null }));

import { PageError } from "./PageError";

describe("PageError", () => {
  it("erklärt den Fehler in Sie-Form und bietet beide Wege", () => {
    nav.pathname = "/projektuebersicht/p1";
    const retry = vi.fn();
    render(<PageError retry={retry} />);
    expect(
      screen.getByText("Die Seite konnte gerade nicht geladen werden. Bitte versuchen Sie es erneut."),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Zur Startseite" }).getAttribute("href")).toBe("/");
    fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("zeigt auf der Startseite keinen Link auf sich selbst", () => {
    nav.pathname = "/";
    render(<PageError retry={() => undefined} />);
    expect(screen.queryByRole("link", { name: "Zur Startseite" })).toBeNull();
  });
});
