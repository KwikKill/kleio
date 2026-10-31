import { endOf } from "./select";
import type { WireEntry, Year } from "./types";
import type { View } from "./view";

// Row packing for the share image. Same idea as the canvas renderer, but the
// image has no text measurement, so label widths are estimated from the
// average advance of IBM Plex Sans SemiBold.

export const LABEL_PX = 15;
const CHAR_EM = 0.56;
const MAX_CHARS = 30;

export interface Bar {
  id: string;
  label: string;
  x: number;
  w: number; // 0 for a point
  row: number;
  labelX: number;
  inside: boolean;
  selected: boolean;
}

export const clipLabel = (s: string) => (s.length > MAX_CHARS ? `${s.slice(0, MAX_CHARS - 1)}…` : s);
export const labelWidth = (s: string) => clipLabel(s).length * LABEL_PX * CHAR_EM;

export function packBars(items: WireEntry[], view: View, now: Year, width: number, rows: number, selectedId?: string): Bar[] {
  const X = (t: Year) => ((t - view.from) / (view.to - view.from)) * width;
  // [start, end, labelInside]. Two bars carrying their own labels may touch
  // (consecutive geological periods); anything with an outside label keeps a gap.
  const placed: [number, number, boolean][][] = Array.from({ length: rows }, () => []);
  const free = (r: number, a: number, b: number, bare: boolean) =>
    placed[r].every(([p, q, bare2]) => {
      const gap = bare && bare2 ? -1 : 8;
      return b + gap < p || a - gap > q;
    });
  const out: Bar[] = [];
  // The shared entry first, then by notability.
  const order = [...items].sort((a, b) => Number(b.id === selectedId) - Number(a.id === selectedId) || b.w - a.w);
  for (const e of order) {
    const s = Math.max(X(e.start), -4);
    const en = Math.min(X(endOf(e, now)), width + 4);
    if (en < 0 || s > width) continue;
    const w = en - s >= 4 ? en - s : 0;
    const tw = labelWidth(e.label);
    let a: number, b: number, labelX: number, inside = false;
    if (w && w >= tw + 16) [a, b, labelX, inside] = [s, en, Math.max(s, 0) + 8, true];
    else if (s + w + 12 + tw <= width) [a, b, labelX] = [s - 8, s + w + 12 + tw, s + w + 12];
    else [a, b, labelX] = [s - 12 - tw, s + w + 8, s - 12 - tw];
    // Curated nested spans (eon, era, period) keep their own row when it exists.
    let row = e.row !== undefined && e.row < rows && free(e.row, a, b, inside) ? e.row : -1;
    if (e.row === undefined || rows < 3) for (let r = 0; r < rows && row < 0; r++) if (free(r, a, b, inside)) row = r;
    if (row < 0) continue;
    placed[row].push([a, b, inside]);
    out.push({ id: e.id, label: clipLabel(e.label), x: s, w, row, labelX, inside, selected: e.id === selectedId });
  }
  return out;
}
