import type { Page } from "@playwright/test";

// PROJ-30: Hinter der Ladeansicht erscheint der Inhalt erst nach dem `load`-Event
// und wird danach bedienbar. Tests, die direkt nach `goto` klicken oder tippen,
// warten hiermit auf den fertigen Inhalt.
export async function waitForPage(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const main = document.querySelector("main");
      if (!main) return false;
      const loading = Array.from(main.querySelectorAll('[role="status"]')).some((el) =>
        el.textContent?.includes("Wird geladen"),
      );
      if (loading) return false;
      return Object.keys(main).some((key) => key.startsWith("__reactFiber"));
    },
    undefined,
    { timeout: 15_000 },
  );
}
