import { describe, expect, it, vi } from "vitest";
import { createPageLayoutClock, MAX_LAYOUT_ROUNDS, type PageLayoutSteps } from "./pageLayoutClock";

function setup(overrides: Partial<PageLayoutSteps> = {}) {
  const queue: Array<() => void> = [];
  const log: string[] = [];
  const steps: PageLayoutSteps = {
    isVisible: () => true,
    images: () => log.push("images"),
    text: () => log.push("text"),
    imageSignature: () => "gleich",
    textSignature: () => "gleich",
    ...overrides,
  };
  const cancel = vi.fn((frame: number) => {
    queue[frame] = () => undefined;
  });
  const clock = createPageLayoutClock(steps, (run) => queue.push(run) - 1, cancel);
  const flush = () => queue.splice(0).forEach((run) => run());
  return { clock, flush, log, queue, cancel };
}

describe("Seiten-Takt", () => {
  it("rechnet bei mehreren Auslösern nur einmal pro Bild", () => {
    const { clock, flush, log, queue } = setup();
    clock.request();
    clock.request();
    clock.request();
    expect(queue).toHaveLength(1);
    flush();
    expect(log).toEqual(["images", "text"]);
  });

  it("rechnet beim normalen Tippen jede Berechnung nur einmal", () => {
    const { clock, flush, log } = setup();
    clock.request();
    flush();
    expect(log).toEqual(["images", "text"]);
  });

  it("rechnet die Bilder nach, wenn sich der Text geändert hat, und hört dann auf", () => {
    let text = "alt";
    const { clock, flush, log } = setup({
      text: () => {
        log.push("text");
        text = "neu";
      },
      textSignature: () => text,
    });
    clock.request();
    flush();
    expect(log).toEqual(["images", "text", "images"]);
  });

  it("wiederholt, solange Text und Bilder sich gegenseitig ändern", () => {
    let text = 0;
    let images = 0;
    const { clock, flush, log } = setup({
      images: () => {
        log.push("images");
        if (images < 2) images += 1;
      },
      text: () => {
        log.push("text");
        if (text < 2) text += 1;
      },
      imageSignature: () => String(images),
      textSignature: () => String(text),
    });
    clock.request();
    flush();
    expect(log).toEqual(["images", "text", "images", "text", "images"]);
  });

  it("begrenzt die Runden, auch wenn zwei Zustände sich abwechseln", () => {
    let flip = 0;
    const { clock, flush, log } = setup({
      images: () => {
        log.push("images");
        flip += 1;
      },
      text: () => {
        log.push("text");
        flip += 1;
      },
      imageSignature: () => String(flip),
      textSignature: () => String(flip),
    });
    clock.request();
    flush();
    expect(log.filter((step) => step === "text")).toHaveLength(MAX_LAYOUT_ROUNDS);
  });

  it("rechnet nicht, solange der Editor unsichtbar ist", () => {
    const onSettled = vi.fn();
    const { clock, flush, log } = setup({ isVisible: () => false, onSettled });
    clock.request();
    flush();
    expect(log).toEqual([]);
    expect(onSettled).not.toHaveBeenCalled();
  });

  it("meldet jeden fertigen Durchgang und nimmt danach neue Anforderungen an", () => {
    const onSettled = vi.fn();
    const { clock, flush, queue } = setup({ onSettled });
    clock.request();
    flush();
    clock.request();
    expect(queue).toHaveLength(1);
    flush();
    expect(onSettled).toHaveBeenCalledTimes(2);
  });

  it("bricht eine offene Berechnung beim Verlassen ab", () => {
    const { clock, flush, log, cancel } = setup();
    clock.request();
    clock.destroy();
    flush();
    clock.request();
    flush();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(log).toEqual([]);
  });
});
