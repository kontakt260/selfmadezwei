import { describe, expect, it } from "vitest";
import { hasPendingSaves, savesSettled, trackSave } from "./pending-saves";

describe("savesSettled", () => {
  it("wartet, bis laufende Speichervorgänge fertig sind", async () => {
    let finish: (value: { ok: true }) => void = () => undefined;
    const save = trackSave(new Promise<{ ok: true }>((resolve) => (finish = resolve)));
    expect(hasPendingSaves()).toBe(true);
    let settled = false;
    const waiting = savesSettled().then((failed) => {
      settled = true;
      return failed;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    finish({ ok: true });
    await save;
    await expect(waiting).resolves.toBe(false);
    expect(hasPendingSaves()).toBe(false);
  });

  it("meldet ein abgewiesenes Speichern", async () => {
    const save = trackSave(Promise.reject(new Error("kaputt")));
    await expect(save).rejects.toThrow("kaputt");
    trackSave(Promise.reject(new Error("wieder kaputt"))).catch(() => undefined);
    await expect(savesSettled()).resolves.toBe(true);
  });

  it("meldet einen Fehler aus der Server Action", async () => {
    void trackSave(Promise.resolve({ error: "Speichern fehlgeschlagen." }));
    await expect(savesSettled()).resolves.toBe(true);
  });

  it("ist ohne laufendes Speichern sofort fertig", async () => {
    await expect(savesSettled()).resolves.toBe(false);
  });
});
