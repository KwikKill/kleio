import type { Year } from "./types";

export interface View {
  from: Year;
  to: Year;
}

export const MIN_SPAN = 2 / 365.2425; // two days
export const EARLIEST: Year = -1.45e10; // a little before the Big Bang
export const FUTURE_MARGIN = 50;

export const span = (v: View) => v.to - v.from;
export const center = (v: View) => (v.from + v.to) / 2;

export function clampView(v: View, now: Year): View {
  const latest = now + FUTURE_MARGIN;
  const s = Math.min(Math.max(span(v), MIN_SPAN), latest - EARLIEST);
  let from = center(v) - s / 2;
  if (from < EARLIEST) from = EARLIEST;
  if (from + s > latest) from = latest - s;
  return { from, to: from + s };
}

// Zoom keeping the time under `anchor` (0..1 across the width) in place.
export function zoomAt(v: View, factor: number, anchor: number, now: Year): View {
  const s = span(v);
  const t = v.from + anchor * s;
  const ns = s * factor;
  return clampView({ from: t - anchor * ns, to: t - anchor * ns + ns }, now);
}

export function pan(v: View, deltaYears: number, now: Year): View {
  return clampView({ from: v.from + deltaYears, to: v.to + deltaYears }, now);
}

export function fitSpan(start: Year, end: Year | undefined, now: Year): View {
  const e = end ?? start;
  const s = Math.max(e - start, Math.max(Math.abs(start) * 1e-6, 1)) * 3;
  const c = (start + e) / 2;
  return clampView({ from: c - s / 2, to: c + s / 2 }, now);
}

// Interpolates centre linearly and span geometrically, so a jump from the
// Cretaceous to 1969 zooms out, travels, and zooms back in.
export function lerpView(a: View, b: View, k: number): View {
  const c = center(a) + (center(b) - center(a)) * k;
  const s = Math.exp(Math.log(span(a)) + (Math.log(span(b)) - Math.log(span(a))) * k);
  return { from: c - s / 2, to: c + s / 2 };
}

// What a link with no view opens on: the Renaissance, a crowded and familiar stretch.
export const DEFAULT_VIEW: View = { from: 1440, to: 1660 };
