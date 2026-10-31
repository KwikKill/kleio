import { span, type View } from "./view";

// The shareable state lives in the query string, ?v=1440,1660&l=politique,sciences&s=Q762,
// because the server only sees the query: that is what lets a shared link get
// a preview of the view it points to. The first links used the hash instead;
// they still open.

export interface ShareState {
  view?: View;
  lanes?: string[];
  selected?: string;
}

type Params = URLSearchParams | Record<string, string | string[] | undefined>;

const LANE_ID = /^[a-z0-9-]{1,40}$/;
// Wikidata items and the curated deep-time entries; custom lanes stay local.
export const SHAREABLE_ID = /^(Q\d{1,12}|ics-[a-z-]{1,30}|kleio-[a-z-]{1,30})$/;

function get(q: Params, key: string): string | undefined {
  if (q instanceof URLSearchParams) return q.get(key) ?? undefined;
  const v = q[key];
  return Array.isArray(v) ? v[0] : v;
}

export function parseShare(q: Params): ShareState {
  const out: ShareState = {};
  const v = get(q, "v")?.split(",").map(Number);
  if (v && v.length === 2 && v.every(Number.isFinite) && v[1] > v[0]) out.view = { from: v[0], to: v[1] };
  const l = get(q, "l")?.split(",").filter((id) => LANE_ID.test(id));
  if (l?.length) out.lanes = l.slice(0, 24);
  const s = get(q, "s");
  if (s && SHAREABLE_ID.test(s)) out.selected = s;
  return out;
}

export function readShare(search: string, hash: string): ShareState {
  const fromQuery = parseShare(new URLSearchParams(search));
  if (fromQuery.view || fromQuery.lanes) return fromQuery;
  return parseShare(new URLSearchParams(hash.replace(/^#/, "")));
}

// Enough decimals to keep the view at its zoom level, no more.
const compact = (t: number, s: number) => {
  const digits = Math.max(0, Math.min(6, Math.ceil(-Math.log10(s / 1000))));
  return Number(t.toFixed(digits)).toString();
};

// Built by hand: URLSearchParams would encode the commas as %2C.
export function shareQuery(view: View | undefined, lanes: string[] | undefined, selected?: string | null): string {
  const parts: string[] = [];
  if (view) {
    const s = span(view);
    parts.push(`v=${compact(view.from, s)},${compact(view.to, s)}`);
  }
  const l = lanes?.filter((id) => LANE_ID.test(id));
  if (l?.length) parts.push(`l=${l.join(",")}`);
  if (selected && SHAREABLE_ID.test(selected)) parts.push(`s=${selected}`);
  return parts.join("&");
}
