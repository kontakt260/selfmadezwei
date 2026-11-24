import type { Page } from "@playwright/test";
import crypto from "node:crypto";
import zlib from "node:zlib";

// PROJ-25: Prüfstand für den Kapitel-Editor. Misst, was tatsächlich auf dem
// Bildschirm erscheint. Gelesen wird deshalb direkt NACH dem Zeichnen: Vorher
// kann ein Frame noch Zwischenstände enthalten, die nie sichtbar werden.

export type Motion = {
  /** Wie oft sich der sichtbare Stand geändert hat. */
  moves: number;
  /** Wie oft er auf einen früheren Stand zurückgesprungen ist. */
  returns: number;
  /** Zeit von der Eingabe bis zur letzten sichtbaren Änderung. */
  settleMs: number;
  maxMovePx: number;
};

type Sample = { t: number; sig: string; pos: number[] };
type BenchWindow = Window & { __benchRun?: boolean; __benchSamples?: Sample[]; __benchInputAt?: number | null };

/** Startet die Aufzeichnung. `selector` bestimmt, was beobachtet wird. */
export async function startMotion(page: Page, selector = "[data-paginate-row] img"): Promise<void> {
  await page.evaluate((target) => {
    const w = window as BenchWindow;
    const channel = new MessageChannel();
    w.__benchSamples = [];
    w.__benchRun = true;
    w.__benchInputAt = null;
    const markInput = () => {
      w.__benchInputAt ??= performance.now();
      for (const type of INPUT_EVENTS) document.removeEventListener(type, markInput, true);
    };
    const INPUT_EVENTS = ["keydown", "beforeinput", "pointerdown"];
    for (const type of INPUT_EVENTS) document.addEventListener(type, markInput, true);
    channel.port1.onmessage = () => {
      const stack = document.querySelector(".a5-stack");
      if (stack) {
        const top = stack.getBoundingClientRect().top;
        const elements = Array.from(document.querySelectorAll<HTMLElement>(target));
        const pos = elements.map((el) => Math.round(el.getBoundingClientRect().top - top));
        const size = elements.map((el) => Math.round(el.getBoundingClientRect().height));
        w.__benchSamples!.push({ t: performance.now(), sig: `${pos.join(",")}|${size.join(",")}`, pos });
      }
      if (w.__benchRun) requestAnimationFrame(() => channel.port2.postMessage(0));
      else channel.port1.close();
    };
    requestAnimationFrame(() => channel.port2.postMessage(0));
  }, selector);
  // Der Ausgangsstand muss aufgezeichnet sein, bevor die Eingabe kommt.
  await page.waitForFunction(() => ((window as BenchWindow).__benchSamples?.length ?? 0) >= 2);
}

export async function stopMotion(page: Page): Promise<Motion> {
  const { samples, inputAt } = await page.evaluate(() => {
    const w = window as BenchWindow;
    w.__benchRun = false;
    return { samples: w.__benchSamples ?? [], inputAt: w.__benchInputAt ?? null };
  });
  const result: Motion = { moves: 0, returns: 0, settleMs: 0, maxMovePx: 0 };
  if (samples.length === 0) return result;
  const start = inputAt ?? samples[0].t;
  const seen = new Set([samples[0].sig]);
  for (let i = 1; i < samples.length; i += 1) {
    if (samples[i].sig === samples[i - 1].sig) continue;
    result.moves += 1;
    result.settleMs = Math.max(0, Math.round(samples[i].t - start));
    if (seen.has(samples[i].sig)) result.returns += 1;
    seen.add(samples[i].sig);
    samples[i].pos.forEach((value, index) => {
      result.maxMovePx = Math.max(result.maxMovePx, Math.abs(value - (samples[i - 1].pos[index] ?? value)));
    });
  }
  return result;
}

/** Fingerabdruck der Seitenaufteilung: Seiten, Umbrüche, Absätze und Bilder. */
export async function layoutFingerprint(page: Page): Promise<{ pages: number; spacers: number; hash: string }> {
  const layout = await page.evaluate(() => {
    const stack = document.querySelector(".a5-stack")!;
    const top = stack.getBoundingClientRect().top;
    const frames = Array.from(document.querySelectorAll(".a5-page-frame"));
    const stride = frames[1].getBoundingClientRect().top - frames[0].getBoundingClientRect().top;
    const pageOf = (el: Element) => Math.floor((el.getBoundingClientRect().top - top + 2) / stride);
    const blocks = Array.from(document.querySelectorAll(".tiptap-editor > p")).map(pageOf);
    const images = Array.from(document.querySelectorAll("[data-paginate-row] img")).map(pageOf);
    return {
      pages: document.querySelectorAll(".a5-page-frame").length,
      spacers: document.querySelectorAll(".a5-soft-break-spacer").length,
      blocks,
      images,
    };
  });
  return {
    pages: layout.pages,
    spacers: layout.spacers,
    hash: crypto.createHash("sha256").update(JSON.stringify(layout)).digest("hex").slice(0, 16),
  };
}

/** Einfarbiges PNG als Testbild. */
export function solidPng(width: number, height: number, [r, g, b]: [number, number, number]): Buffer {
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buffer: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buffer) c = table[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x += 1) {
    row[1 + x * 3] = r;
    row[2 + x * 3] = g;
    row[3 + x * 3] = b;
  }
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
