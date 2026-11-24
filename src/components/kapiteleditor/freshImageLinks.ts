// PROJ-34: Bildlinks gelten eine Stunde. Scheitert ein Foto beim Laden (Link
// abgelaufen oder kurzer Netzaussetzer), holt der Editor einen frischen Link und
// baut das Foto neu auf. Der Neuaufbau zählt, nicht der neue Link: Signiert der
// Server in derselben Sekunde, ist der Link identisch, und der Browser lädt ein
// unverändertes `src` nicht noch einmal (BUG-1 aus der QA).

/** Stand je Dateipfad: frischer Link (falls schon geholt) und Nummer des Versuchs. */
export type FreshLink = { url?: string; attempt: number };
export type FreshLinks = Record<string, FreshLink>;

/** Danach bleibt ein Foto leer, damit eine fehlende Datei keine Schleife auslöst. */
export const MAX_LINK_ATTEMPTS = 3;
/** Abstand vor jedem weiteren Versuch, damit ein kurzer Aussetzer vorbei ist. */
export const LINK_RETRY_DELAY_MS = 1500;
/** So viele Pfade nimmt die Server-Action höchstens auf einmal an. */
export const MAX_PATHS_PER_REQUEST = 120;

type Options = {
  /** Holt frische Links, Schlüssel ist der Dateipfad. Fehlende Pfade gelten als nicht erneuert. */
  fetchLinks: (paths: string[]) => Promise<Record<string, string> | undefined>;
  /** Bekommt nach jeder Runde den vollständigen neuen Stand. */
  onChange: (links: FreshLinks) => void;
  /** Nur Pfade, die der Server überhaupt signieren würde. */
  isAllowed: (path: string) => boolean;
};

export type LinkRefresher = {
  /** Ein Foto ist nicht geladen. Mehrfache Meldungen vor der nächsten Runde zählen einmal. */
  request: (path: string) => void;
  /** Beim Verlassen des Editors: keine weiteren Runden und keine Updates mehr. */
  stop: () => void;
};

export function createLinkRefresher({ fetchLinks, onChange, isAllowed }: Options): LinkRefresher {
  const attempts = new Map<string, number>();
  const pending = new Set<string>();
  let links: FreshLinks = {};
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const schedule = (delay: number) => {
    if (timer === null && !stopped) timer = setTimeout(() => void flush(), delay);
  };

  async function flush() {
    timer = null;
    const paths = [...pending].slice(0, MAX_PATHS_PER_REQUEST);
    for (const path of paths) pending.delete(path);

    let fetched: Record<string, string> | undefined;
    try {
      fetched = await fetchLinks(paths);
    } catch {
      // Auch ohne neuen Link wird das Foto neu aufgebaut und lädt den alten erneut.
      fetched = undefined;
    }
    if (stopped) return;

    const next = { ...links };
    for (const path of paths) {
      next[path] = { url: fetched?.[path] ?? links[path]?.url, attempt: attempts.get(path) ?? 1 };
    }
    links = next;
    onChange(links);
    if (pending.size > 0) schedule(0);
  }

  return {
    request(path) {
      if (stopped || pending.has(path) || !isAllowed(path)) return;
      const attempt = (attempts.get(path) ?? 0) + 1;
      if (attempt > MAX_LINK_ATTEMPTS) return;
      attempts.set(path, attempt);
      pending.add(path);
      schedule(attempt === 1 ? 0 : LINK_RETRY_DELAY_MS);
    },
    stop() {
      stopped = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
  };
}
