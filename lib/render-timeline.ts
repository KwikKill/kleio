import { endOf, openKind } from "./select";
import { formatDates, formatPoint, makeTicks } from "./time";
import type { LaneWindow, WireEntry, Year } from "./types";
import type { View } from "./view";

export const AXIS_H = 30;
export const HEAD_H = 22; // lane title band
export const ROW_H = 20;
const BAR_H = 15;
const STRIP_H = 10; // density strip at the bottom of each lane
export const MIN_LANE_H = 84;
const MAX_LABEL = 44;

// Width in years of the uncertainty behind a Wikibase precision code.
const precisionYears = (p: number) => (p >= 11 ? 1 / 365 : p === 10 ? 1 / 12 : 10 ** (9 - p));

export interface RenderLane {
  id: string;
  color: string;
  win?: LaneWindow;
  histFrom: Year;
  histTo: Year;
}

export interface Hit {
  x: number;
  y: number;
  w: number;
  h: number;
  entry: WireEntry;
  laneId: string;
}

export interface Theme {
  bg: string;
  panel: string;
  ink: string;
  muted: string;
  line: string;
  lineSoft: string;
  laneAlt: string;
  now: string;
  onColor: string;
  mono: string;
  sans: string;
}

export interface Marker {
  start: Year;
  end?: Year;
}

export interface DrawInput {
  W: number;
  H: number;
  view: View;
  now: Year;
  lanes: RenderLane[];
  laneH: number;
  selectedId: string | null;
  hoverX: number | null;
  hoverId: string | null;
  marker: Marker | null;
  theme: Theme;
  measure: (font: string, text: string) => number;
}

export const laneHeight = (n: number, height: number) => (n ? Math.max(MIN_LANE_H, (height - AXIS_H) / n) : 0);

const clip = (s: string) => (s.length > MAX_LABEL ? `${s.slice(0, MAX_LABEL - 1)}…` : s);

// Precision of the date shown under the cursor, from the zoom level.
function cursorPrecision(yearsPerPx: number): number {
  if (yearsPerPx < 3 / 365) return 11;
  if (yearsPerPx < 0.25) return 10;
  return 9;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
}

export function drawTimeline(ctx: CanvasRenderingContext2D, d: DrawInput): Hit[] {
  const { W, H, view, now, theme: c } = d;
  const span = view.to - view.from;
  const X = (t: Year) => ((t - view.from) / span) * W;
  const hits: Hit[] = [];
  const labelFont = `500 11.5px ${c.sans}`;
  const monoFont = `11px ${c.mono}`;

  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, W, H);

  const ticks = makeTicks(view.from, view.to, W, now);

  d.lanes.forEach((lane, i) => {
    const top = AXIS_H + i * d.laneH;
    if (i % 2 === 1) {
      ctx.fillStyle = c.laneAlt;
      ctx.fillRect(0, top, W, d.laneH);
    }
    ctx.fillStyle = c.line;
    ctx.fillRect(0, top + d.laneH - 1, W, 1);
  });

  // Major ticks run down through the lanes as a faint grid.
  ctx.fillStyle = c.lineSoft;
  for (const t of ticks) if (t.major) ctx.fillRect(Math.round(X(t.t)), AXIS_H, 1, H - AXIS_H);

  d.lanes.forEach((lane, i) => {
    const top = AXIS_H + i * d.laneH;
    const win = lane.win;
    if (!win) return;

    // Density strip: every entry of the lane in the requested window, shown or not.
    const max = Math.max(1, ...win.hist);
    const x0 = X(lane.histFrom);
    const bw = (X(lane.histTo) - x0) / win.hist.length;
    ctx.fillStyle = lane.color;
    ctx.globalAlpha = 0.28;
    win.hist.forEach((n, b) => {
      if (!n) return;
      const h = 2 + (STRIP_H - 4) * Math.sqrt(n / max);
      ctx.fillRect(x0 + b * bw, top + d.laneH - 2 - h, Math.max(1, bw - 0.5), h);
    });
    ctx.globalAlpha = 1;

    const rowsTop = top + HEAD_H;
    const nRows = Math.max(1, Math.floor((d.laneH - HEAD_H - STRIP_H - 4) / ROW_H));
    const placed: [number, number][][] = Array.from({ length: nRows }, () => []);
    const free = (r: number, a: number, b: number) => placed[r].every(([p, q]) => b + 4 < p || a - 4 > q);

    // Most notable first, so crowding hides the minor entries.
    const items = [...win.items].sort((a, b) => b.w - a.w);
    ctx.font = labelFont;
    for (const e of items) {
      const open = openKind(e, now);
      const s = X(e.start);
      const en = X(endOf(e, now));
      if (en < -40 || s > W + 40) continue;
      const isBar = en - s >= 3;
      const text = clip(e.label);
      const tw = d.measure(labelFont, text);
      let a: number, b: number, lx: number, inside = false;
      if (isBar) {
        const vs = Math.max(s, 0);
        const ve = Math.min(en, W);
        if (ve - vs >= tw + 14) {
          inside = true;
          [a, b, lx] = [s, en, vs + 6];
        } else if (en + 6 + tw < W - 4) [a, b, lx] = [s, en + 6 + tw, en + 6];
        else [a, b, lx] = [s - 6 - tw, en, s - 6 - tw];
      } else if (s + 10 + tw < W - 4) [a, b, lx] = [s - 6, s + 10 + tw, s + 10];
      else [a, b, lx] = [s - 10 - tw, s + 6, s - 10 - tw];

      let r = -1;
      if (e.row !== undefined) r = e.row < nRows && free(e.row, a, b) ? e.row : -1;
      else for (let k = 0; k < nRows && r < 0; k++) if (free(k, a, b)) r = k;
      if (r < 0) continue;
      placed[r].push([a, b]);

      const y = rowsTop + r * ROW_H;
      const sel = e.id === d.selectedId;
      const hov = e.id === d.hoverId;
      if (isBar) {
        // Blur an edge only when its uncertainty spans a few pixels at this zoom:
        // "XVe siècle" is fuzzy around 1450, a geological boundary is not at 400 Ma.
        const yearsPerPx = span / W;
        const fuzzyStart = precisionYears(e.sp) / yearsPerPx >= 4;
        const fuzzyEnd = open === "alive" || (e.end !== undefined && precisionYears(e.ep ?? 9) / yearsPerPx >= 4);
        if (fuzzyStart || fuzzyEnd) {
          const g = ctx.createLinearGradient(s, 0, en, 0);
          const edge = Math.min(0.25, 24 / Math.max(1, en - s));
          g.addColorStop(0, fuzzyStart ? `${lane.color}40` : lane.color);
          g.addColorStop(edge, lane.color);
          g.addColorStop(1 - edge, lane.color);
          g.addColorStop(1, fuzzyEnd ? `${lane.color}30` : lane.color);
          ctx.fillStyle = g;
        } else ctx.fillStyle = lane.color;
        roundRect(ctx, s, y, en - s, BAR_H, 2);
        ctx.fill();
        if (sel || hov) {
          ctx.strokeStyle = c.ink;
          ctx.lineWidth = sel ? 2 : 1;
          roundRect(ctx, s - (sel ? 2.5 : 1), y - (sel ? 2.5 : 1), en - s + (sel ? 5 : 2), BAR_H + (sel ? 5 : 2), 3);
          ctx.stroke();
          ctx.lineWidth = 1;
        }
        ctx.fillStyle = inside ? c.onColor : c.ink;
      } else {
        ctx.fillStyle = lane.color;
        ctx.beginPath();
        ctx.arc(s, y + BAR_H / 2, 5, 0, Math.PI * 2);
        ctx.fill();
        if (sel || hov) {
          ctx.strokeStyle = c.ink;
          ctx.lineWidth = sel ? 2 : 1;
          ctx.beginPath();
          ctx.arc(s, y + BAR_H / 2, sel ? 8 : 7, 0, Math.PI * 2);
          ctx.stroke();
          ctx.lineWidth = 1;
        }
        ctx.fillStyle = c.ink;
      }
      ctx.fillText(text, lx, y + 12);
      hits.push({ x: Math.min(a, s - 6), y, w: Math.max(b, s + 6) - Math.min(a, s - 6), h: BAR_H, entry: e, laneId: lane.id });
    }
  });

  // A search result that no visible lane contains still gets a marker.
  if (d.marker) {
    const s = X(d.marker.start);
    const e = X(d.marker.end ?? d.marker.start);
    ctx.fillStyle = c.ink;
    ctx.globalAlpha = 0.08;
    ctx.fillRect(s, AXIS_H, Math.max(2, e - s), H - AXIS_H);
    ctx.globalAlpha = 1;
    ctx.fillRect(s, AXIS_H, 2, H - AXIS_H);
  }

  // Axis
  ctx.fillStyle = c.panel;
  ctx.fillRect(0, 0, W, AXIS_H);
  ctx.fillStyle = c.line;
  ctx.fillRect(0, AXIS_H - 1, W, 1);
  ctx.font = monoFont;
  let lastEnd = -Infinity;
  for (const t of ticks) {
    const x = Math.round(X(t.t));
    ctx.fillStyle = c.muted;
    ctx.fillRect(x, AXIS_H - (t.major ? 12 : 6), 1, t.major ? 12 : 6);
    const tw = d.measure(monoFont, t.label);
    if (x + 3 > lastEnd + 10 && x + 3 + tw < W) {
      ctx.fillStyle = t.major ? c.ink : c.muted;
      ctx.fillText(t.label, x + 3, 15);
      lastEnd = x + 3 + tw;
    }
  }

  const xn = X(now);
  if (xn >= 0 && xn <= W) {
    ctx.strokeStyle = c.now;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(xn + 0.5, AXIS_H);
    ctx.lineTo(xn + 0.5, H);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = c.now;
    const label = "aujourd'hui";
    ctx.fillText(label, Math.min(xn + 4, W - d.measure(monoFont, label) - 4), AXIS_H + 13);
  }

  if (d.hoverX !== null) {
    const x = d.hoverX;
    ctx.strokeStyle = c.ink;
    ctx.globalAlpha = 0.45;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(x + 0.5, AXIS_H);
    ctx.lineTo(x + 0.5, H);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    const t = view.from + (x / W) * span;
    const label = formatPoint(t, cursorPrecision(span / W), now);
    const tw = d.measure(monoFont, label);
    const bx = Math.min(Math.max(0, x - tw / 2 - 6), W - tw - 12);
    ctx.fillStyle = c.ink;
    ctx.fillRect(bx, 4, tw + 12, 20);
    ctx.fillStyle = c.bg;
    ctx.fillText(label, bx + 6, 18);
  }

  const hovered = d.hoverId ? hits.find((h) => h.entry.id === d.hoverId) : undefined;
  if (hovered) drawTooltip(ctx, d, hovered, labelFont, monoFont);
  return hits;
}

function drawTooltip(ctx: CanvasRenderingContext2D, d: DrawInput, h: Hit, labelFont: string, monoFont: string) {
  const { theme: c, now } = d;
  const e = h.entry;
  const dates = formatDates(e, openKind(e, now), now);
  const title = clip(e.label);
  const w = Math.max(d.measure(`600 12px ${c.sans}`, title), d.measure(monoFont, dates)) + 20;
  let x = (d.hoverX ?? h.x) + 14;
  if (x + w > d.W - 4) x = (d.hoverX ?? h.x) - w - 14;
  let y = h.y + h.h + 6;
  if (y + 44 > d.H) y = h.y - 50;
  ctx.fillStyle = c.panel;
  ctx.strokeStyle = c.line;
  roundRect(ctx, x, y, w, 44, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = c.ink;
  ctx.font = `600 12px ${c.sans}`;
  ctx.fillText(title, x + 10, y + 18);
  ctx.font = monoFont;
  ctx.fillStyle = c.muted;
  ctx.fillText(dates, x + 10, y + 35);
  ctx.font = labelFont;
}
