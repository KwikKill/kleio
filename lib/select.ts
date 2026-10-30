import type { LaneWindow, WireEntry, Year } from "./types";

// Spans with no end: people born less than 110 years ago with no recorded
// death, and geological units still running, stretch to the present.
// Everything else without an end is a point.
export function openKind(e: Pick<WireEntry, "start" | "end" | "kind">, now: Year): "alive" | "running" | null {
  if (e.end !== undefined) return null;
  if (e.kind === "period") return "running";
  if (e.kind === "person" && e.start > now - 110) return "alive";
  return null;
}

export function endOf(e: Pick<WireEntry, "start" | "end" | "kind">, now: Year): Year {
  if (e.end !== undefined) return e.end;
  return openKind(e, now) ? now : e.start;
}

// Semantic zoom lives here. The window is cut into buckets; each bucket gets a
// share of the limit before the most notable leftovers fill the rest, so a
// crowded century cannot push a quiet one off the screen. Zooming in shrinks
// the window, which lets less notable entries through.
export function selectWindow(entries: readonly WireEntry[], from: Year, to: Year, now: Year, limit: number, bins: number): LaneWindow {
  const span = Math.max(to - from, 1e-9);
  const hist = new Array<number>(bins).fill(0);
  const inWindow: WireEntry[] = [];
  for (const e of entries) {
    if (e.start > to || endOf(e, now) < from) continue;
    inWindow.push(e);
    const b = Math.floor(((e.start - from) / span) * bins);
    hist[Math.min(bins - 1, Math.max(0, b))]++;
  }
  inWindow.sort((a, b) => b.w - a.w);

  const buckets = Math.max(1, Math.min(24, limit));
  const cap = Math.ceil(limit / buckets);
  const used = new Array<number>(buckets).fill(0);
  const picked = new Set<WireEntry>();
  for (const e of inWindow) {
    if (picked.size >= limit) break;
    const k = Math.min(buckets - 1, Math.max(0, Math.floor(((Math.max(e.start, from) - from) / span) * buckets)));
    if (used[k] < cap) {
      used[k]++;
      picked.add(e);
    }
  }
  for (const e of inWindow) {
    if (picked.size >= limit) break;
    picked.add(e);
  }
  return { items: [...picked], hist, total: inWindow.length };
}
