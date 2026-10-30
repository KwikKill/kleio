// Browser-side calls to Wikidata. Both services allow cross-origin requests:
// the MediaWiki API with origin=*, WDQS with Access-Control-Allow-Origin: *.
import { centerCoarse, guessPrecision, JULIAN, julianToGregorian, parseWikibaseTime, parseXsdTime } from "./time";
import type { Precision, WireEntry, Year } from "./types";

const API = "https://www.wikidata.org/w/api.php";
const WDQS = "https://query.wikidata.org/sparql";
const CLIENT_AGENT = "Kleio/0.1 (couloir personnalisé, depuis le navigateur)";

async function api(params: Record<string, string>, signal?: AbortSignal) {
  const u = new URL(API);
  u.search = new URLSearchParams({ ...params, format: "json", origin: "*" }).toString();
  const r = await fetch(u, { signal });
  if (!r.ok) throw new Error(`Wikidata a répondu ${r.status}`);
  return r.json();
}

export interface SearchHit {
  id: string;
  label: string;
  description?: string;
}

export async function searchEntities(q: string, signal?: AbortSignal): Promise<SearchHit[]> {
  const j = await api({ action: "wbsearchentities", search: q, language: "fr", uselang: "fr", type: "item", limit: "8" }, signal);
  return (j.search ?? []).map((s: { id: string; label?: string; description?: string }) => ({ id: s.id, label: s.label ?? s.id, description: s.description }));
}

interface Claim {
  rank: "preferred" | "normal" | "deprecated";
  mainsnak: { datavalue?: { value: unknown } };
}

function bestClaims(claims: Record<string, Claim[]>, prop: string): Claim[] {
  const list = (claims[prop] ?? []).filter((c) => c.rank !== "deprecated" && c.mainsnak.datavalue);
  const preferred = list.filter((c) => c.rank === "preferred");
  return preferred.length ? preferred : list;
}

function timeOf(claims: Record<string, Claim[]>, props: string[]): { t: Year; p: Precision; julian: boolean } | undefined {
  for (const prop of props) {
    const c = bestClaims(claims, prop)[0];
    if (!c) continue;
    const v = c.mainsnak.datavalue!.value as { time: string; precision: number; calendarmodel: string };
    const t = parseWikibaseTime(v.time);
    if (t === null) continue;
    // Unlike WDQS, the API returns the date in its own calendar: move Julian
    // days onto the Gregorian axis and keep the flag for the label.
    const julian = v.calendarmodel === JULIAN && v.precision >= 11;
    return { t: julian ? julianToGregorian(t) : centerCoarse(t, v.precision), p: v.precision, julian };
  }
  return undefined;
}

export interface EntityDetails {
  id: string;
  label: string;
  description?: string;
  image?: string;
  start?: { t: Year; p: Precision; julian: boolean };
  end?: { t: Year; p: Precision; julian: boolean };
  isPerson: boolean;
  tags: string[];
  wikipedia?: string;
}

export async function fetchEntity(id: string, signal?: AbortSignal): Promise<EntityDetails> {
  // languagefallback fills labels.fr from "mul" (names identical in every
  // language are no longer stored per language).
  const j = await api({ action: "wbgetentities", ids: id, props: "labels|descriptions|claims|sitelinks/urls", languages: "fr|en", languagefallback: "1", sitefilter: "frwiki|enwiki" }, signal);
  const e = j.entities?.[id];
  if (!e || e.missing !== undefined) throw new Error(`${id} introuvable sur Wikidata`);
  const claims: Record<string, Claim[]> = e.claims ?? {};
  const isPerson = !!claims.P569 || !!claims.P570;
  const tagIds = [...bestClaims(claims, "P106"), ...bestClaims(claims, "P31")]
    .map((c) => (c.mainsnak.datavalue!.value as { id: string }).id)
    .filter((q) => q !== "Q5")
    .slice(0, 6);
  let tags: string[] = [];
  if (tagIds.length) {
    const t = await api({ action: "wbgetentities", ids: tagIds.join("|"), props: "labels", languages: "fr|en", languagefallback: "1" }, signal);
    tags = tagIds.map((q) => t.entities?.[q]?.labels?.fr?.value ?? t.entities?.[q]?.labels?.en?.value).filter(Boolean);
  }
  const image = bestClaims(claims, "P18")[0]?.mainsnak.datavalue?.value as string | undefined;
  return {
    id,
    label: e.labels?.fr?.value ?? e.labels?.en?.value ?? id,
    description: e.descriptions?.fr?.value ?? e.descriptions?.en?.value,
    image: image ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(image)}?width=320` : undefined,
    start: timeOf(claims, ["P569", "P585", "P580", "P571"]),
    end: timeOf(claims, ["P570", "P582", "P576"]),
    isPerson,
    tags,
    wikipedia: e.sitelinks?.frwiki?.url ?? e.sitelinks?.enwiki?.url,
  };
}

export interface CustomResult {
  entries: WireEntry[];
  rows: number;
  ms: number;
}

const MAX_CUSTOM = 5000;

// Custom lanes run their query once, live, then get filtered client-side
// exactly like preset lanes are filtered on the server.
export async function runCustomQuery(query: string, signal?: AbortSignal): Promise<CustomResult> {
  const started = performance.now();
  const r = await fetch(WDQS, {
    method: "POST",
    headers: { Accept: "application/sparql-results+json", "Content-Type": "application/x-www-form-urlencoded", "Api-User-Agent": CLIENT_AGENT },
    body: new URLSearchParams({ query }),
    signal,
  });
  const text = await r.text();
  if (!r.ok) {
    const firstLine = text.split("\n").find((l) => /Exception|Error/.test(l)) ?? text.slice(0, 200);
    throw new Error(`WDQS ${r.status} : ${firstLine.trim()}`);
  }
  let bindings: Record<string, { value: string }>[];
  try {
    bindings = JSON.parse(text).results.bindings;
  } catch {
    throw new Error("Réponse tronquée : la requête a dépassé la limite de 60 s de WDQS. Ajoute un filtre plus sélectif.");
  }
  const seen = new Map<string, WireEntry>();
  for (const b of bindings) {
    if (!b.item || !b.start) continue;
    const id = b.item.value.slice(b.item.value.lastIndexOf("/") + 1);
    if (seen.has(id)) continue;
    const start = parseXsdTime(b.start.value);
    if (start === null) continue;
    const end = b.end ? parseXsdTime(b.end.value) : null;
    seen.set(id, {
      id,
      label: b.itemLabel?.value ?? b.label?.value ?? id,
      start,
      sp: guessPrecision(b.start.value),
      ...(end !== null && end >= start ? { end, ep: guessPrecision(b.end.value) } : {}),
      w: Number(b.sitelinks?.value ?? 0),
      kind: "event",
    });
    if (seen.size >= MAX_CUSTOM) break;
  }
  if (!bindings.length) throw new Error("La requête n'a renvoyé aucune ligne.");
  if (!seen.size) throw new Error("Aucune ligne exploitable : la requête doit renvoyer ?item et ?start (une date).");
  return { entries: [...seen.values()], rows: bindings.length, ms: Math.round(performance.now() - started) };
}
