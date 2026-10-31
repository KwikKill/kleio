"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { DEEP_TIME_ENTRIES } from "@/lib/deep-time";
import { DEFAULT_LANES, liveQueryFor, type LanePreset, PRESET_BY_ID } from "@/lib/lanes";
import type { Marker } from "@/lib/render-timeline";
import { endOf, openKind, selectWindow } from "@/lib/select";
import { readShare, shareQuery } from "@/lib/share";
import { nowYear } from "@/lib/time";
import type { EntriesResponse, LaneWindow, MetaResponse, WireEntry } from "@/lib/types";
import { clampView, DEFAULT_VIEW, EARLIEST, FUTURE_MARGIN, fitSpan, lerpView, type View, zoomAt } from "@/lib/view";
import { type EntityDetails, fetchEntity, runCustomQuery, type SearchHit } from "@/lib/wikidata-client";
import BottomPanel, { type CustomDef, type CustomState, type FocusLane } from "./BottomPanel";
import LanePicker from "./LanePicker";
import Overview from "./Overview";
import Timeline, { type TimelineLane } from "./Timeline";
import TopBar from "./TopBar";

const LIMIT = 70;
const BINS = 160;
const PAD = 0.25; // requested window = view plus a quarter on each side, so small pans need no refetch
const CUSTOM_KEY = "kleio:custom";
const RESULTS_KEY = "kleio:results:";
const SWATCHES = ["#2a9d8f", "#e76f51", "#8f6bd6", "#c9a227", "#4f8fd6", "#d65f8f"];

const TEMPLATE = `# Un couloir personnalisé doit renvoyer ?item et ?start (une date),
# et si possible ?end, ?itemLabel et ?sitelinks (pour trier par notoriété).
# Exemple : lauréats du prix Nobel de physique, de la naissance à la mort.
SELECT ?item ?itemLabel ?start ?end ?sitelinks WHERE {
  ?item wdt:P166 wd:Q38104 ;          # distinction reçue : prix Nobel de physique
        wdt:P569 ?start ;
        wikibase:sitelinks ?sitelinks .
  OPTIONAL { ?item wdt:P570 ?end }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,mul,en". }
}`;

// Every storage access can throw (private mode, blocked site data).
function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    if (value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota or blocked storage: the lane still works for this session
  }
}

type CustomData = CustomState & { entries: WireEntry[] };

const noopSubscribe = () => () => {};
function subscribeDark(cb: () => void) {
  const mq = matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export default function Kleio() {
  // Everything below depends on the clock, the URL and localStorage, so it
  // renders on the client only; the server sends the empty frame.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (!mounted) {
    return (
      <div className="kl" aria-busy="true">
        <header className="kl-top"><span className="kl-brand">Kleio</span></header>
      </div>
    );
  }
  return <App />;
}

// A search result or a shared Wikidata item, as a timeline entry.
function entryFromDetails(d: EntityDetails & { start: NonNullable<EntityDetails["start"]> }): WireEntry {
  return {
    id: d.id, label: d.label, start: d.start.t, sp: d.start.p, ...(d.start.julian ? { sj: 1 as const } : {}),
    ...(d.end && d.end.t >= d.start.t ? { end: d.end.t, ep: d.end.p, ...(d.end.julian ? { ej: 1 as const } : {}) } : {}),
    w: 0, kind: d.isPerson ? "person" : "event",
  };
}

function App() {
  const [now] = useState(nowYear);
  const [initial] = useState(() => readShare(window.location.search, window.location.hash));
  const [view, setView] = useState<View>(() => clampView(initial.view ?? DEFAULT_VIEW, now));
  const [custom, setCustom] = useState<Record<string, CustomDef>>(() => load(CUSTOM_KEY, {}));
  const [laneIds, setLaneIds] = useState<string[]>(() => {
    const defs = load<Record<string, CustomDef>>(CUSTOM_KEY, {});
    const ids = (initial.lanes ?? DEFAULT_LANES).filter((id) => PRESET_BY_ID.has(id) || id in defs);
    return ids.length ? ids : DEFAULT_LANES;
  });
  const [customData, setCustomData] = useState<Record<string, CustomData>>(() => {
    const defs = load<Record<string, CustomDef>>(CUSTOM_KEY, {});
    const out: Record<string, CustomData> = {};
    for (const [id, def] of Object.entries(defs)) {
      const cached = load<{ query: string; entries: WireEntry[] } | null>(RESULTS_KEY + id, null);
      if (cached && cached.query === def.query) out[id] = { status: "ok", entries: cached.entries, count: cached.entries.length };
    }
    return out;
  });
  const [server, setServer] = useState<EntriesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [meta, setMeta] = useState<MetaResponse | null>(null);
  // A shared link can point at an entry: curated ones are known here, Wikidata
  // items are fetched once mounted (see below).
  const [selected, setSelected] = useState<{ entry: WireEntry; laneId: string | null } | null>(() => {
    const curated = DEEP_TIME_ENTRIES.find((e) => e.id === initial.selected);
    if (!curated) return null;
    const { lanes, ...entry } = curated;
    return { entry, laneId: lanes[0] ?? null };
  });
  const [details, setDetails] = useState<EntityDetails | null>(null);
  const [detailsState, setDetailsState] = useState<"idle" | "loading" | "error">("idle");
  const [focus, setFocus] = useState<string | null>(null);
  const [marker, setMarker] = useState<Marker | null>(null);
  const [picker, setPicker] = useState(false);
  // On a phone the panel would take half the screen: it opens on selection.
  const [panel, setPanel] = useState(() => window.innerWidth > 760);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [width, setWidth] = useState(() => window.innerWidth);
  const dark = useSyncExternalStore(subscribeDark, () => matchMedia("(prefers-color-scheme: dark)").matches, () => false);

  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  // --- view changes: immediate from gestures, animated from jumps
  const anim = useRef<number | null>(null);
  const stopAnim = () => {
    if (anim.current !== null) cancelAnimationFrame(anim.current);
    anim.current = null;
  };
  const setViewNow = useCallback((v: View) => {
    stopAnim();
    setView(v);
  }, []);
  const animateTo = useCallback((target: View) => {
    stopAnim();
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setView(target);
      return;
    }
    const from = viewRef.current;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 750);
      const e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
      setView(lerpView(from, target, e));
      anim.current = k < 1 ? requestAnimationFrame(step) : null;
    };
    anim.current = requestAnimationFrame(step);
  }, []);

  useEffect(() => {
    const id = initial.selected;
    if (!id?.startsWith("Q")) return;
    const ctrl = new AbortController();
    fetchEntity(id, ctrl.signal)
      .then((d) => {
        if (!d.start) return;
        setSelected({ entry: entryFromDetails({ ...d, start: d.start }), laneId: null });
        setDetails(d);
        setPanel(true);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [initial.selected]);

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    // Older links kept the state in the hash; editing one by hand still works.
    const onHash = () => {
      const h = readShare("", window.location.hash);
      if (h.view) animateTo(clampView(h.view, now));
      if (h.lanes) setLaneIds(h.lanes.filter((id) => PRESET_BY_ID.has(id) || id in load<Record<string, CustomDef>>(CUSTOM_KEY, {})));
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("hashchange", onHash);
    fetch("/api/meta")
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => m && setMeta(m))
      .catch(() => {});
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("hashchange", onHash);
    };
  }, [animateTo, now]);

  // The address bar always holds a link to what is on screen, previewable once shared.
  const selectedId = selected?.entry.id ?? null;
  useEffect(() => {
    const t = setTimeout(() => history.replaceState(null, "", `${window.location.pathname}?${shareQuery(view, laneIds, selectedId)}`), 300);
    return () => clearTimeout(t);
  }, [view, laneIds, selectedId]);

  // --- data
  const padded = useMemo(() => {
    const s = view.to - view.from;
    return { from: view.from - s * PAD, to: view.to + s * PAD };
  }, [view]);

  const presetKey = laneIds.filter((id) => PRESET_BY_ID.has(id)).join(",");
  useEffect(() => {
    if (!presetKey) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const qs = new URLSearchParams({ from: String(padded.from), to: String(padded.to), lanes: presetKey, limit: String(LIMIT), bins: String(BINS) });
        const r = await fetch(`/api/entries?${qs}`, { signal: ctrl.signal });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        setServer(await r.json());
        setFetchError(null);
      } catch (e) {
        if (!ctrl.signal.aborted) setFetchError(`Index injoignable (${(e as Error).message}). Nouvel essai au prochain déplacement.`);
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 90);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [padded, presetKey]);

  const customWindows = useMemo(() => {
    const out: Record<string, LaneWindow> = {};
    for (const id of laneIds) {
      const d = customData[id];
      if (custom[id] && d?.entries.length) out[id] = selectWindow(d.entries, padded.from, padded.to, now, LIMIT, BINS);
    }
    return out;
  }, [laneIds, custom, customData, padded, now]);

  const lanes: TimelineLane[] = useMemo(() => laneIds.map((id) => {
    const p = PRESET_BY_ID.get(id);
    if (p) {
      const win = server?.lanes[id];
      return {
        id, label: p.label, color: dark ? p.colorDark : p.color, win,
        histFrom: server?.from ?? padded.from, histTo: server?.to ?? padded.to,
        status: win ? `${win.total.toLocaleString("fr-FR")} dans la fenêtre` : loading ? "chargement…" : "",
        error: meta?.lanes[id]?.error,
      };
    }
    const c = custom[id];
    const d = customData[id];
    const win = customWindows[id];
    return {
      id, label: c.label, color: c.color, win, histFrom: padded.from, histTo: padded.to,
      status: d?.status === "loading" ? "requête en cours…" : win ? `${win.total.toLocaleString("fr-FR")} dans la fenêtre · direct` : "à exécuter",
      error: d?.status === "error" ? d.error : undefined,
    };
  }), [laneIds, server, padded, loading, meta, dark, custom, customData, customWindows]);

  const loaded = useMemo(() => {
    const seen = new Map<string, WireEntry>();
    for (const l of lanes) for (const e of l.win?.items ?? []) seen.set(e.id, e);
    return [...seen.values()];
  }, [lanes]);
  const visible = loaded.filter((e) => e.start <= view.to && endOf(e, now) >= view.from).length;

  // --- selection and details
  const detailsCtrl = useRef<AbortController | null>(null);
  const openDetails = useCallback((id: string) => {
    detailsCtrl.current?.abort();
    setDetails(null);
    if (!id.startsWith("Q")) {
      setDetailsState("idle");
      return;
    }
    const ctrl = new AbortController();
    detailsCtrl.current = ctrl;
    setDetailsState("loading");
    fetchEntity(id, ctrl.signal)
      .then((d) => {
        setDetails(d);
        setDetailsState("idle");
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setDetailsState("error");
      });
  }, []);

  const onSelect = useCallback((entry: WireEntry | null, laneId: string | null) => {
    setSelected(entry ? { entry, laneId } : null);
    setMarker(null);
    if (laneId) setFocus(laneId);
    if (entry) {
      setPanel(true);
      openDetails(entry.id);
    }
  }, [openDetails]);

  const onPick = useCallback(async (hit: SearchHit) => {
    setSearchError(null);
    detailsCtrl.current?.abort();
    try {
      const d = await fetchEntity(hit.id);
      if (!d.start) {
        setSearchError(`« ${d.label} » n'a pas de date exploitable sur Wikidata.`);
        return;
      }
      const entry = entryFromDetails({ ...d, start: d.start });
      setSelected({ entry, laneId: null });
      setDetails(d);
      setDetailsState("idle");
      setMarker({ start: entry.start, end: endOf(entry, now) });
      setPanel(true);
      const end = endOf(entry, now);
      animateTo(fitSpan(entry.start, end > entry.start ? end : undefined, now));
    } catch (e) {
      setSearchError(`Impossible d'ouvrir ${hit.id} : ${(e as Error).message}`);
    }
  }, [animateTo, now]);

  const contemporaries = useMemo(() => {
    const e = selected?.entry;
    if (!e || e.kind !== "person") return 0;
    const end = endOf(e, now);
    return loaded.filter((o) => o.id !== e.id && o.kind === "person" && o.start <= end && endOf(o, now) >= e.start).length;
  }, [selected, loaded, now]);

  // --- lanes
  const runCustom = useCallback(async (id: string, def: CustomDef) => {
    setCustom((prev) => {
      const next = { ...prev, [id]: def };
      save(CUSTOM_KEY, next);
      return next;
    });
    setCustomData((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { entries: [] }), status: "loading", error: undefined } }));
    try {
      const r = await runCustomQuery(def.query);
      setCustomData((prev) => ({ ...prev, [id]: { entries: r.entries, status: "ok", rows: r.rows, ms: r.ms, count: r.entries.length } }));
      save(RESULTS_KEY + id, { query: def.query, entries: r.entries });
    } catch (e) {
      setCustomData((prev) => ({ ...prev, [id]: { entries: prev[id]?.entries ?? [], status: "error", error: (e as Error).message } }));
    }
  }, []);

  const addCustom = useCallback((def: CustomDef, run: boolean) => {
    const id = `perso-${Date.now().toString(36)}`;
    setCustom((prev) => {
      const next = { ...prev, [id]: def };
      save(CUSTOM_KEY, next);
      return next;
    });
    setLaneIds((ids) => [...ids, id]);
    setFocus(id);
    setPanel(true);
    setPicker(false);
    if (run) void runCustom(id, def);
  }, [runCustom]);

  const nextColor = SWATCHES[Object.keys(custom).length % SWATCHES.length];

  const onLane = useCallback((id: string, action: "up" | "down" | "remove" | "focus") => {
    if (action === "focus") {
      setFocus(id);
      setPanel(true);
      return;
    }
    setLaneIds((ids) => {
      const i = ids.indexOf(id);
      if (action === "remove") return ids.filter((x) => x !== id);
      const j = action === "up" ? i - 1 : i + 1;
      if (j < 0 || j >= ids.length) return ids;
      const next = [...ids];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    if (action === "remove" && !PRESET_BY_ID.has(id)) {
      setCustom((prev) => {
        const next = { ...prev };
        delete next[id];
        save(CUSTOM_KEY, next);
        return next;
      });
      save(RESULTS_KEY + id, undefined);
    }
  }, []);

  const focusId = focus && laneIds.includes(focus) ? focus : (selected?.laneId ?? laneIds[0] ?? null);
  const focusLane: FocusLane | null = focusId
    ? (() => {
        const p = PRESET_BY_ID.get(focusId);
        if (p) return { id: focusId, label: p.label, color: dark ? p.colorDark : p.color, preset: p, status: meta?.lanes[focusId] };
        const c = custom[focusId];
        return c ? { id: focusId, label: c.label, color: c.color, custom: c, customState: customData[focusId] } : null;
      })()
    : null;

  const laneLabel = (id: string | null) => (id ? (PRESET_BY_ID.get(id)?.label ?? custom[id]?.label ?? null) : null);

  return (
    <div className="kl">
      <TopBar
        view={view} now={now} visible={visible} width={width} searchError={searchError}
        onZoom={(f) => animateTo(zoomAt(viewRef.current, f, 0.5, now))}
        onReset={() => animateTo(clampView({ from: EARLIEST, to: now + FUTURE_MARGIN }, now))}
        onPick={onPick}
        laneCount={laneIds.length} lanesOpen={picker} onLanes={() => setPicker((o) => !o)}
      />
      <Overview view={view} now={now} onJump={(v, a) => (a ? animateTo(v) : setViewNow(v))} />
      <div style={{ position: "relative", minHeight: 0, display: "grid", gridTemplateRows: "minmax(0, 1fr)" }}>
        <Timeline view={view} now={now} lanes={lanes} selectedId={selected?.entry.id ?? null} marker={marker} onView={setViewNow} onSelect={onSelect} onLane={onLane} />
        {picker && (
          <LanePicker
            top={8} active={laneIds} dark={dark}
            counts={Object.fromEntries(Object.entries(meta?.lanes ?? {}).map(([k, v]) => [k, v.count]))}
            onToggle={(id) => setLaneIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))}
            onNewCustom={() => addCustom({ label: "Prix Nobel de physique", color: nextColor, query: TEMPLATE }, true)}
            onClose={() => setPicker(false)}
          />
        )}
        {(fetchError || meta?.source === "empty") && (
          <p className="kl-empty mono" style={{ position: "absolute", left: 12, bottom: 8, margin: 0, fontSize: 12, background: "var(--panel)", padding: "4px 8px", borderRadius: 4 }}>
            {fetchError ?? "Index vide : lance « npm run harvest » pour le construire."}
          </p>
        )}
        <button type="button" className="kl-btn kl-toggle" onClick={() => setPanel((o) => !o)} aria-expanded={panel}>
          {panel ? "Masquer le panneau" : "Afficher le panneau"}
        </button>
      </div>
      <div className={`kl-bot${panel ? "" : " collapsed"}`}>
        <BottomPanel
          now={now}
          selected={selected ? { entry: selected.entry, laneLabel: laneLabel(selected.laneId) } : null}
          details={details} detailsState={detailsState} contemporaries={contemporaries}
          lane={focusLane} harvestedAt={meta?.harvestedAt ?? null}
          onCenter={() => {
            if (!selected) return;
            const e = selected.entry;
            const end = endOf(e, now);
            animateTo(fitSpan(e.start, openKind(e, now) || e.end !== undefined ? end : undefined, now));
          }}
          onRun={runCustom}
          onCopy={(p: LanePreset) => addCustom({ label: `${p.label} (direct)`, color: nextColor, query: liveQueryFor(p) }, false)}
        />
      </div>
    </div>
  );
}
