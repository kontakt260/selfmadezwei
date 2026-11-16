import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useAutoSave } from "./useAutoSave";

type Draft = { text: string };

function setup(saveFn = vi.fn<(value: Draft) => Promise<void>>().mockResolvedValue(undefined)) {
  const initial: Draft = { text: "a" };
  const hook = renderHook(({ value }: { value: Draft }) => useAutoSave(value, saveFn, 2_000), {
    initialProps: { value: initial },
  });
  return { saveFn, ...hook };
}

const advance = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

describe("useAutoSave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("speichert nicht beim ersten Rendern", async () => {
    const { saveFn, result } = setup();
    await advance(5_000);
    expect(saveFn).not.toHaveBeenCalled();
    expect(result.current.state).toBe("idle");
  });

  it("zeigt sofort „saving“, solange eine Änderung noch nicht gespeichert ist", async () => {
    const { saveFn, result, rerender } = setup();
    const next = { text: "b" };
    rerender({ value: next });
    // Debounce läuft noch — der Status darf nicht „gespeichert“ behaupten.
    expect(result.current.state).toBe("saving");
    expect(saveFn).not.toHaveBeenCalled();
    await advance(2_000);
    expect(saveFn).toHaveBeenCalledExactlyOnceWith(next);
    expect(result.current.state).toBe("saved");
  });

  it("fasst schnelle Änderungen zu einem Speichern des letzten Stands zusammen", async () => {
    const { saveFn, rerender } = setup();
    rerender({ value: { text: "b" } });
    await advance(1_000);
    const last = { text: "c" };
    rerender({ value: last });
    await advance(2_000);
    expect(saveFn).toHaveBeenCalledExactlyOnceWith(last);
  });

  it("speichert einen ausstehenden Stand sofort, wenn die Seite verlassen wird (Unmount)", async () => {
    const { saveFn, rerender, unmount } = setup();
    const next = { text: "b" };
    rerender({ value: next });
    unmount();
    expect(saveFn).toHaveBeenCalledExactlyOnceWith(next);
  });

  it("speichert beim Unmount nichts, wenn alles gespeichert ist", async () => {
    const { saveFn, rerender, unmount } = setup();
    rerender({ value: { text: "b" } });
    await advance(2_000);
    unmount();
    expect(saveFn).toHaveBeenCalledTimes(1);
  });

  it("speichert beim Schließen des Tabs (pagehide) und fragt vorher nach (beforeunload)", async () => {
    const { saveFn, rerender } = setup();
    const next = { text: "b" };
    rerender({ value: next });

    const beforeUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(beforeUnload);
    expect(beforeUnload.defaultPrevented).toBe(true);

    await act(async () => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(saveFn).toHaveBeenCalledExactlyOnceWith(next);
  });

  it("fragt beim Schließen nicht nach, wenn nichts aussteht", async () => {
    const { rerender } = setup();
    rerender({ value: { text: "b" } });
    await advance(2_000);
    const beforeUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(beforeUnload);
    expect(beforeUnload.defaultPrevented).toBe(false);
  });

  it("meldet Fehler und speichert bei „Erneut versuchen“ den aktuellen Stand", async () => {
    const saveFn = vi
      .fn<(value: Draft) => Promise<void>>()
      .mockRejectedValueOnce(new Error("Netzwerk"))
      .mockResolvedValue(undefined);
    const { result, rerender } = setup(saveFn);
    const next = { text: "b" };
    rerender({ value: next });
    await advance(2_000);
    expect(result.current.state).toBe("error");
    expect(result.current.error).toBe("Netzwerk");

    await act(async () => {
      await result.current.retry();
    });
    expect(saveFn).toHaveBeenLastCalledWith(next);
    expect(result.current.state).toBe("saved");
  });
});
