import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createLinkRefresher,
  LINK_RETRY_DELAY_MS,
  MAX_LINK_ATTEMPTS,
  MAX_PATHS_PER_REQUEST,
  type FreshLinks,
} from "./freshImageLinks";

const PROJECT = "11111111-1111-4111-8111-111111111111";
const A = `${PROJECT}/kapitel/a.png`;
const B = `${PROJECT}/kapitel/b.png`;

function setup(fetchLinks: (paths: string[]) => Promise<Record<string, string> | undefined>) {
  const changes: FreshLinks[] = [];
  const fetch = vi.fn(fetchLinks);
  const refresher = createLinkRefresher({
    fetchLinks: fetch,
    onChange: (links) => changes.push(links),
    isAllowed: (path) => path.startsWith(`${PROJECT}/`),
  });
  const last = () => changes[changes.length - 1];
  return { refresher, fetch, changes, last };
}

const linksFor = (paths: string[], suffix = "neu") =>
  Promise.resolve(Object.fromEntries(paths.map((path) => [path, `https://bild/${path}?${suffix}`])));

describe("createLinkRefresher", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("holt beim ersten Fehler sofort einen frischen Link", async () => {
    const { refresher, fetch, last } = setup((paths) => linksFor(paths));
    refresher.request(A);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledWith([A]);
    expect(last()).toEqual({ [A]: { url: `https://bild/${A}?neu`, attempt: 1 } });
  });

  it("zählt jeden Versuch hoch, auch wenn der Link gleich bleibt", async () => {
    // BUG-1: In derselben Sekunde signiert, ist der Link identisch. Erst die neue
    // Versuchsnummer baut das Foto neu auf.
    const { refresher, last } = setup((paths) => linksFor(paths, "gleich"));
    refresher.request(A);
    await vi.advanceTimersByTimeAsync(0);
    refresher.request(A);
    await vi.advanceTimersByTimeAsync(LINK_RETRY_DELAY_MS);
    expect(last()[A]).toEqual({ url: `https://bild/${A}?gleich`, attempt: 2 });
  });

  it("wartet vor einem weiteren Versuch", async () => {
    const { refresher, fetch } = setup((paths) => linksFor(paths));
    refresher.request(A);
    await vi.advanceTimersByTimeAsync(0);
    refresher.request(A);
    await vi.advanceTimersByTimeAsync(LINK_RETRY_DELAY_MS - 1);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it(`hört nach ${MAX_LINK_ATTEMPTS} Versuchen auf, damit eine fehlende Datei keine Schleife auslöst`, async () => {
    const { refresher, fetch } = setup((paths) => linksFor(paths));
    for (let i = 0; i < MAX_LINK_ATTEMPTS + 2; i += 1) {
      refresher.request(A);
      await vi.advanceTimersByTimeAsync(LINK_RETRY_DELAY_MS);
    }
    expect(fetch).toHaveBeenCalledTimes(MAX_LINK_ATTEMPTS);
  });

  it("baut das Foto auch neu auf, wenn der Server nicht erreichbar ist", async () => {
    const { refresher, last } = setup(() => Promise.reject(new Error("offline")));
    refresher.request(A);
    await vi.advanceTimersByTimeAsync(0);
    expect(last()).toEqual({ [A]: { url: undefined, attempt: 1 } });
  });

  it("behält den letzten frischen Link, wenn ein späterer Versuch keinen bringt", async () => {
    let call = 0;
    const { refresher, last } = setup((paths) => (call++ === 0 ? linksFor(paths) : Promise.resolve(undefined)));
    refresher.request(A);
    await vi.advanceTimersByTimeAsync(0);
    refresher.request(A);
    await vi.advanceTimersByTimeAsync(LINK_RETRY_DELAY_MS);
    expect(last()[A]).toEqual({ url: `https://bild/${A}?neu`, attempt: 2 });
  });

  it("bündelt gleichzeitige Fehler und zählt doppelte Meldungen einmal", async () => {
    const { refresher, fetch, last } = setup((paths) => linksFor(paths));
    refresher.request(A);
    refresher.request(B);
    refresher.request(A);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith([A, B]);
    expect(last()[A].attempt).toBe(1);
    expect(last()[B].attempt).toBe(1);
  });

  it("fragt für fremde Pfade nie beim Server an", async () => {
    const { refresher, fetch, changes } = setup((paths) => linksFor(paths));
    refresher.request("anderes-projekt/kapitel/x.png");
    await vi.advanceTimersByTimeAsync(LINK_RETRY_DELAY_MS);
    expect(fetch).not.toHaveBeenCalled();
    expect(changes).toEqual([]);
  });

  it(`schickt höchstens ${MAX_PATHS_PER_REQUEST} Pfade je Anfrage und holt den Rest danach`, async () => {
    const { refresher, fetch, last } = setup((paths) => linksFor(paths));
    const paths = Array.from({ length: MAX_PATHS_PER_REQUEST + 5 }, (_, i) => `${PROJECT}/kapitel/${i}.png`);
    for (const path of paths) refresher.request(path);
    await vi.advanceTimersByTimeAsync(0);
    // Fake-Timer setzen einen 0-ms-Timer, der während eines Ticks entsteht, auf 1 ms.
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][0]).toHaveLength(MAX_PATHS_PER_REQUEST);
    expect(fetch.mock.calls[1][0]).toHaveLength(5);
    expect(Object.keys(last())).toHaveLength(paths.length);
  });

  it("meldet nach dem Verlassen des Editors nichts mehr", async () => {
    let resolve: (value: Record<string, string>) => void = () => undefined;
    const { refresher, changes } = setup(() => new Promise((r) => (resolve = r)));
    refresher.request(A);
    await vi.advanceTimersByTimeAsync(0);
    refresher.stop();
    resolve({ [A]: "https://bild/spaet" });
    await vi.advanceTimersByTimeAsync(0);
    refresher.request(B);
    await vi.advanceTimersByTimeAsync(LINK_RETRY_DELAY_MS);
    expect(changes).toEqual([]);
  });
});
