import type { Precision, Year } from "./types";

// Beyond this many years from 0, calendar days stop meaning anything and Date
// gets close to its own range limit, so dates collapse to whole years.
const CALENDAR_LIMIT = 200_000;
// Before this many years ago, labels switch from calendar years to "il y a".
export const DEEP_AGO = 20_000;

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const MONTHS_SHORT = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

function yearStartMs(y: number): number {
  const d = new Date(0);
  d.setUTCFullYear(y, 0, 1);
  return d.getTime();
}

export function fromCalendar(y: number, month = 1, day = 1): Year {
  if (Math.abs(y) > CALENDAR_LIMIT) return y;
  const s = yearStartMs(y);
  const e = yearStartMs(y + 1);
  const d = new Date(0);
  d.setUTCFullYear(y, month - 1, day);
  return y + (d.getTime() - s) / (e - s);
}

export function toCalendar(t: Year): { y: number; m: number; d: number } {
  const y = Math.floor(t);
  if (Math.abs(y) > CALENDAR_LIMIT) return { y, m: 1, d: 1 };
  const s = yearStartMs(y);
  const e = yearStartMs(y + 1);
  // Stored dates are midnights rounded to a fraction of a year, so one can sit
  // a few minutes before its midnight. Snapping to the hour keeps it on its day.
  const dt = new Date(Math.round((s + (t - y) * (e - s)) / 3.6e6) * 3.6e6);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

export function nowYear(): Year {
  const n = Date.now();
  const y = new Date(n).getUTCFullYear();
  const s = yearStartMs(y);
  return y + (n - s) / (yearStartMs(y + 1) - s);
}

const TIME_RE = /^([+-]?)(\d+)-(\d{2})-(\d{2})T/;

// WDQS (RDF) dates are XSD 1.1: year 0 exists and is 1 BCE, so the year is
// already astronomical. "-0099-07-01" is July 100 BCE.
export function parseXsdTime(s: string): Year | null {
  const m = TIME_RE.exec(s);
  if (!m) return null;
  const y = (m[1] === "-" ? -1 : 1) * Number(m[2]);
  return fromCalendar(y, Math.max(1, Number(m[3])), Math.max(1, Number(m[4])));
}

// The Wikibase JSON API keeps the historical numbering: "-0100" is 100 BCE and
// there is no year 0. Month and day are "00" below month/day precision.
export function parseWikibaseTime(s: string): Year | null {
  const m = TIME_RE.exec(s);
  if (!m) return null;
  const n = Number(m[2]);
  const y = m[1] === "-" ? 1 - n : n;
  return fromCalendar(y, Math.max(1, Number(m[3])), Math.max(1, Number(m[4])));
}

// Days the Julian calendar lags the Gregorian one around a given date
// (10 days in 1582, 9 in 1452, -2 in 100 BCE).
function julianLag(y: number, m: number): number {
  const c = m <= 2 ? y - 1 : y;
  return Math.floor(c / 100) - Math.floor(c / 400) - 2;
}

function shiftDays(t: Year, days: number): Year {
  const { y, m, d } = toCalendar(t);
  const dt = new Date(0);
  dt.setUTCFullYear(y, m - 1, d + days);
  return fromCalendar(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

// The axis is proleptic Gregorian. Dates recorded in the Julian calendar are
// shown as recorded ("15 avril 1452", not "24 avril 1452").
export function julianToGregorian(t: Year): Year {
  if (Math.abs(t) > CALENDAR_LIMIT) return t;
  const { y, m } = toCalendar(t);
  return shiftDays(t, julianLag(y, m));
}

export function gregorianToJulian(t: Year): Year {
  if (Math.abs(t) > CALENDAR_LIMIT) return t;
  const { y, m } = toCalendar(t);
  return shiftDays(t, -julianLag(y, m));
}

export const JULIAN = "http://www.wikidata.org/entity/Q1985786";

// A death "in the 11th century" is stored as 1001 or 1100 depending on who
// entered it. Taken literally that gives 200-year lifespans, so dates coarser
// than a year are moved to the middle of their decade, century or millennium.
export function centerCoarse(t: Year, p: Precision): Year {
  if (p < 6 || p > 8 || Math.abs(t) > DEEP_AGO) return t;
  const y = Math.floor(t);
  if (p === 8) return Math.floor(y / 10) * 10 + 5;
  const size = p === 7 ? 100 : 1000;
  const bce = y <= 0;
  const mid = (ordinalOf(bce ? 1 - y : y, size) - 1) * size + size / 2;
  return bce ? 1 - mid : mid;
}

// Live custom queries only get the truthy value, not its precision.
export function guessPrecision(s: string): Precision {
  const m = TIME_RE.exec(s);
  if (!m) return 9;
  if (m[3] === "01" && m[4] === "01") return 9;
  if (m[4] === "01") return 10;
  return 11;
}

const nf = (v: number, digits = 1) => v.toLocaleString("fr-FR", { maximumFractionDigits: digits });

export function formatYearNumber(y: number): string {
  return y <= 0 ? `${(1 - y).toLocaleString("fr-FR")} av. J.-C.` : String(y);
}

export function formatAgo(a: number): string {
  if (a >= 1e9) return `${nf(a / 1e9, a >= 1e10 ? 1 : 2)} Ga`;
  if (a >= 1e6) return `${nf(a / 1e6, a >= 1e8 ? 0 : a >= 1e7 ? 1 : 2)} Ma`;
  if (a >= 1e4) return `${nf(a / 1e3, a >= 1e5 ? 0 : 1)} ka`;
  return `${Math.round(a).toLocaleString("fr-FR")} ans`;
}

const ROMAN: [number, string][] = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
export function roman(n: number): string {
  let out = "";
  for (const [v, s] of ROMAN) while (n >= v) { out += s; n -= v; }
  return out;
}

// Wikidata stores "15th century" either as 1401 or as 1500 depending on who
// entered it; both land on the same ordinal here.
function ordinalOf(n: number, size: number): number {
  return n % size === 0 ? n / size : Math.ceil(n / size);
}

export function formatPoint(t: Year, p: Precision, now: Year = nowYear(), julian = false): string {
  const ago = now - t;
  if (p <= 5 || ago > DEEP_AGO) return `il y a ${formatAgo(ago)}`;
  const { y, m, d } = toCalendar(julian && p >= 11 ? gregorianToJulian(t) : t);
  const bce = y <= 0;
  const n = bce ? 1 - y : y;
  const era = bce ? " av. J.-C." : "";
  if (p >= 11) return `${d === 1 ? "1er" : d} ${MONTHS[m - 1]} ${formatYearNumber(y)}`;
  if (p === 10) return `${MONTHS[m - 1]} ${formatYearNumber(y)}`;
  if (p === 9) return formatYearNumber(y);
  if (p === 8) return `années ${Math.floor(n / 10) * 10}${era}`;
  if (p === 7) {
    const c = ordinalOf(n, 100);
    return `${roman(c)}${c === 1 ? "er" : "e"} siècle${era}`;
  }
  const k = ordinalOf(n, 1000);
  return `${roman(k)}${k === 1 ? "er" : "e"} millénaire${era}`;
}

// "15 avril 1452 · 2 mai 1519", "1914 · 1918", "il y a 66 Ma".
export interface Dates {
  start: Year;
  sp: Precision;
  end?: Year;
  ep?: Precision;
  sj?: 1;
  ej?: 1;
}

export function formatDates({ start, sp, end, ep, sj, ej }: Dates, open: "alive" | "running" | null, now: Year = nowYear()): string {
  const a = formatPoint(start, sp, now, !!sj);
  if (end !== undefined) {
    const b = formatPoint(end, ep ?? 9, now, !!ej);
    return a === b ? a : `${a} · ${b}`;
  }
  if (open === "alive") return `${a} · en vie`;
  if (open === "running") return `${a} · aujourd'hui`;
  return a;
}

export function formatRange(from: Year, to: Year, now: Year = nowYear()): string {
  const span = to - from;
  if (now - from > DEEP_AGO) {
    const end = to >= now - 1 ? "aujourd'hui" : now - to > DEEP_AGO ? formatAgo(now - to) : formatYearNumber(Math.floor(to));
    return `${formatAgo(now - from)} à ${end}`;
  }
  if (span >= 3) return `${formatYearNumber(Math.floor(from))} à ${formatYearNumber(Math.floor(to))}`;
  const a = toCalendar(from);
  const b = toCalendar(to);
  if (span >= 60 / 365) return `${MONTHS_SHORT[a.m - 1]} ${formatYearNumber(a.y)} à ${MONTHS_SHORT[b.m - 1]} ${formatYearNumber(b.y)}`;
  return `${a.d} ${MONTHS_SHORT[a.m - 1]} à ${b.d} ${MONTHS_SHORT[b.m - 1]} ${formatYearNumber(b.y)}`;
}

export function formatSpan(span: number): string {
  if (span >= 1e9) return `${nf(span / 1e9, 2)} milliards d'années`;
  if (span >= 1e6) return `${nf(span / 1e6, span >= 1e8 ? 0 : 1)} millions d'années`;
  if (span >= 2) return `${Math.round(span).toLocaleString("fr-FR")} ans`;
  if (span >= 60 / 365) return `${Math.round(span * 12)} mois`;
  return `${Math.max(1, Math.round(span * 365.2425))} jours`;
}

export function formatScale(yearsPerPx: number): string {
  if (yearsPerPx >= 1e9) return `${nf(yearsPerPx / 1e9, 2)} Ga`;
  if (yearsPerPx >= 1e6) return `${nf(yearsPerPx / 1e6, 2)} Ma`;
  if (yearsPerPx >= 1e4) return `${nf(yearsPerPx / 1e3, 1)} ka`;
  if (yearsPerPx >= 1) return `${nf(yearsPerPx, yearsPerPx < 10 ? 2 : 0)} ${yearsPerPx < 2 ? "an" : "ans"}`;
  const days = yearsPerPx * 365.2425;
  if (days >= 1) return `${nf(days, 1)} jour${days >= 2 ? "s" : ""}`;
  return `${nf(days * 24, 1)} h`;
}

export interface Tick {
  t: Year;
  label: string;
  major: boolean;
}

function niceStep(raw: number): number {
  const b = 10 ** Math.floor(Math.log10(raw));
  for (const n of [1, 2, 5, 10]) if (n * b >= raw) return n * b;
  return 10 * b;
}

// Ticks roughly `target` px apart, aligned on the units a reader expects at
// that scale: days and months, round years (BCE years counted backwards), then
// round amounts of time before the present.
export function makeTicks(from: Year, to: Year, width: number, now: Year, target = 110): Tick[] {
  const span = to - from;
  const raw = span / Math.max(1, width / target);
  const out: Tick[] = [];
  if (raw < 0.75 && Math.abs(from) < CALENDAR_LIMIT) return calendarTicks(from, to, raw);

  const step = niceStep(Math.max(1, raw));
  if (step >= 1000 && now - from > DEEP_AGO) {
    const k0 = Math.max(0, Math.ceil((now - to) / step));
    const k1 = Math.floor((now - from) / step);
    for (let k = k0; k <= k1 && out.length < 400; k++) {
      out.push({ t: now - k * step, label: k === 0 ? "aujourd'hui" : formatAgo(k * step), major: k % 5 === 0 });
    }
    // Generated from the present backwards; the axis lays labels out left to right.
    return out.reverse();
  }
  const k1 = Math.floor(to / step);
  for (let k = Math.max(1, Math.ceil(from / step)); k <= k1 && out.length < 400; k++) {
    out.push({ t: k * step, label: String(k * step), major: k % 5 === 0 });
  }
  const b0 = Math.max(1, Math.ceil((1 - to) / step));
  const b1 = Math.floor((1 - from) / step);
  for (let k = b0; k <= b1 && out.length < 800; k++) {
    out.push({ t: 1 - k * step, label: `${(k * step).toLocaleString("fr-FR")} av. J.-C.`, major: k % 5 === 0 });
  }
  return out.sort((a, b) => a.t - b.t);
}

function calendarTicks(from: Year, to: Year, raw: number): Tick[] {
  const out: Tick[] = [];
  const rawDays = raw * 365.2425;
  const start = toCalendar(from);
  const d = new Date(0);
  d.setUTCFullYear(start.y, start.m - 1, 1);
  if (rawDays <= 14) {
    const n = [1, 2, 7, 14].find((v) => v >= rawDays) ?? 14;
    const keep = (day: number) => (n === 1 ? true : n === 2 ? day % 2 === 1 : n === 7 ? [1, 8, 15, 22].includes(day) : day === 1 || day === 15);
    for (let i = 0; i < 2000; i++) {
      const t = fromCalendar(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
      if (t > to) break;
      const day = d.getUTCDate();
      if (t >= from && keep(day)) {
        const m = d.getUTCMonth();
        out.push({ t, label: day === 1 ? `${MONTHS_SHORT[m]} ${formatYearNumber(d.getUTCFullYear())}` : `${day} ${MONTHS_SHORT[m]}`, major: day === 1 });
      }
      d.setUTCDate(day + 1);
    }
    return out;
  }
  const n = [1, 2, 3, 6].find((v) => v * 30.44 >= rawDays) ?? 6;
  for (let i = 0; i < 400; i++) {
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const t = fromCalendar(y, m + 1, 1);
    if (t > to) break;
    if (t >= from && m % n === 0) out.push({ t, label: m === 0 ? formatYearNumber(y) : MONTHS_SHORT[m], major: m === 0 });
    d.setUTCMonth(m + 1);
  }
  return out;
}
