import type { MapViewport } from "../src/index";

/** What the demo's URL hash carries (spec slice C §6). */
export interface DeepLink {
  corpus: string | null;
  view: MapViewport | null;
  selected: string | null;
}

const EMPTY: DeepLink = { corpus: null, view: null, selected: null };

function parseView(value: string | null): MapViewport | null {
  if (value === null) return null;
  const parts = value.split(",");
  if (parts.length !== 3) return null;
  const [horizontal, vertical, zoom] = parts.map(Number) as [number, number, number];
  if (![horizontal, vertical, zoom].every(Number.isFinite) || zoom <= 0) return null;
  return { centre: [horizontal, vertical], zoom };
}

/** Never throws: anything unreadable comes back as null, and the demo opens its default. */
export function parseDeepLink(hash: string): DeepLink {
  const parameters = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const text = (key: string) => {
    const value = parameters.get(key);
    return value === null || value === "" ? null : value;
  };
  return { ...EMPTY, corpus: text("corpus"), view: parseView(text("view")), selected: text("selected") };
}

const number = (value: number) => String(Number(value.toPrecision(10)));

export function serialiseDeepLink(link: DeepLink): string {
  const parameters = new URLSearchParams();
  if (link.corpus !== null) parameters.set("corpus", link.corpus);
  if (link.view !== null)
    parameters.set("view", [link.view.centre[0], link.view.centre[1], link.view.zoom].map(number).join(","));
  if (link.selected !== null) parameters.set("selected", link.selected);
  // Commas stay readable in the address bar (lib ES2020 has no `replaceAll`).
  const query = parameters.toString().split("%2C").join(",");
  return query === "" ? "" : `#${query}`;
}

/**
 * Debounced hash writes: Safari refuses more than 100 `replaceState` calls in
 * 30 s, which a write per drag frame would pass (spec slice C §6).
 */
export function createHashWriter(write: (hash: string) => void, delay = 250) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let queued: DeepLink | null = null;
  const flush = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (queued === null) return;
    const link = queued;
    queued = null;
    write(serialiseDeepLink(link));
  };
  return {
    schedule(link: DeepLink) {
      queued = link;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(flush, delay);
    },
    flush,
    cancel() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      queued = null;
    },
  };
}
