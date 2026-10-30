"use client";

import { Fragment, type ReactNode, useState } from "react";
import { liveQueryFor, type LanePreset } from "@/lib/lanes";
import { openKind } from "@/lib/select";
import { formatDates } from "@/lib/time";
import type { LaneStatus, WireEntry, Year } from "@/lib/types";
import type { EntityDetails } from "@/lib/wikidata-client";

export interface CustomDef {
  label: string;
  color: string;
  query: string;
}

export interface CustomState {
  status: "idle" | "loading" | "ok" | "error";
  error?: string;
  rows?: number;
  ms?: number;
  count?: number;
}

export interface FocusLane {
  id: string;
  label: string;
  color: string;
  preset?: LanePreset;
  custom?: CustomDef;
  customState?: CustomState;
  status?: LaneStatus;
}

interface Props {
  now: Year;
  selected: { entry: WireEntry; laneLabel: string | null } | null;
  details: EntityDetails | null;
  detailsState: "idle" | "loading" | "error";
  contemporaries: number;
  lane: FocusLane | null;
  harvestedAt: string | null;
  onCenter: () => void;
  onRun: (id: string, def: CustomDef) => void;
  onCopy: (preset: LanePreset) => void;
}

const KEYWORDS = /^(SELECT|WHERE|FILTER|OPTIONAL|SERVICE|VALUES|LIMIT|UNION|ORDER|BY|DESC|ASC|GROUP|DISTINCT|BIND|AS|LANG)$/;

function highlight(q: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(#[^\n]*)|("(?:[^"\\]|\\.)*")|(\?\w+)|\b([A-Z]{2,})\b|(\b\d+\b)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(q))) {
    if (m.index > last) out.push(q.slice(last, m.index));
    const [tok] = m;
    const cls = m[1] ? "c" : m[2] || m[5] ? "s" : m[3] ? "v" : KEYWORDS.test(m[4] ?? "") ? "k" : "";
    out.push(cls ? <span key={k++} className={cls} style={cls === "c" ? { color: "var(--faint)" } : undefined}>{tok}</span> : tok);
    last = m.index + tok.length;
  }
  out.push(q.slice(last));
  return out;
}

const KIND_LABEL = { person: "personne", event: "événement", period: "période" } as const;

const CURATED_NOTE: Record<string, string> = {
  ics: "Unité de la charte chronostratigraphique internationale (ICS, v2024/12). Bornes en millions d'années.",
  kleio: "Jalon du temps profond, valeur approximative couramment admise.",
};

export default function BottomPanel(p: Props) {
  const e = p.selected?.entry;
  const curated = e && !e.id.startsWith("Q") ? CURATED_NOTE[e.id.split("-")[0]] : null;
  return (
    <>
      <section className="kl-card" aria-label="Entrée sélectionnée">
        {!e && (
          <div className="txt">
            <span className="eyebrow">Aucune sélection</span>
            <p className="kl-empty">
              Clique sur une entrée de la frise pour l&apos;ouvrir ici. Molette pour zoomer, glisser pour te déplacer, double-clic pour
              zoomer sur un point, Maj + double-clic pour dézoomer. Au clavier : flèches, + et −, 0 pour tout voir.
            </p>
          </div>
        )}
        {e && (
          <>
            {p.details?.image && (
              // eslint-disable-next-line @next/next/no-img-element -- remote Commons thumbnail, sized by the URL itself
              <img src={p.details.image} alt="" />
            )}
            <div className="txt">
              <span className="eyebrow">
                {p.selected?.laneLabel ? `${p.selected.laneLabel} · ` : ""}
                {KIND_LABEL[e.kind]}
              </span>
              <h2>{p.details?.label ?? e.label}</h2>
              <span className="dates mono">{formatDates(e, openKind(e, p.now), p.now)}</span>
              {p.detailsState === "loading" && <span className="kl-empty">Chargement depuis Wikidata…</span>}
              {p.detailsState === "error" && <span className="kl-empty">Détails indisponibles pour le moment.</span>}
              {p.details?.description && <p className="desc">{p.details.description}</p>}
              {curated && <p className="desc">{curated}</p>}
              {!!p.details?.tags.length && (
                <div className="kl-tags">
                  {p.details.tags.map((t) => (
                    <span key={t}>{t}</span>
                  ))}
                </div>
              )}
              <div className="links">
                <button type="button" className="kl-btn" onClick={p.onCenter}>Centrer la frise</button>
                {e.kind === "person" && <span className="kl-empty">{p.contemporaries} contemporain{p.contemporaries > 1 ? "s" : ""} dans la vue</span>}
                {e.id.startsWith("Q") && <a href={`https://www.wikidata.org/wiki/${e.id}`} target="_blank" rel="noreferrer">Wikidata {e.id}</a>}
                {p.details?.wikipedia && <a href={p.details.wikipedia} target="_blank" rel="noreferrer">Wikipédia</a>}
              </div>
            </div>
          </>
        )}
      </section>
      <QueryPanel {...p} />
    </>
  );
}

function QueryPanel({ lane, harvestedAt, onRun, onCopy }: Props) {
  if (!lane) {
    return (
      <section className="kl-q">
        <span className="kl-empty">Ajoute un couloir pour voir ici la requête qui le remplit.</span>
      </section>
    );
  }
  if (lane.custom) return <CustomEditor key={lane.id} lane={lane} onRun={onRun} />;
  const preset = lane.preset!;
  if (preset.source.type === "static") {
    return (
      <section className="kl-q">
        <div className="bar">
          <span style={{ color: lane.color, fontWeight: 600 }}>{lane.label.toUpperCase()}</span>
          <span>couloir de référence, sans requête</span>
        </div>
        <p className="kl-empty" style={{ margin: 0 }}>
          Les dates de Wikidata sont trop éparses avant l&apos;écriture pour en tirer une frise fiable. Ce couloir est donc saisi à la main :
          bornes de la charte chronostratigraphique internationale (ICS, v2024/12) pour l&apos;échelle géologique, valeurs approximatives
          couramment admises pour les jalons.
        </p>
      </section>
    );
  }
  const date = harvestedAt ? new Date(harvestedAt).toLocaleDateString("fr-FR") : null;
  return (
    <section className="kl-q">
      <div className="bar">
        <span style={{ color: lane.color, fontWeight: 600 }}>{lane.label.toUpperCase()}</span>
        <span>
          index local · {lane.status?.count.toLocaleString("fr-FR") ?? 0} entrées{date ? ` · collecté le ${date}` : ""}
          {lane.status?.error ? ` · ${lane.status.error}` : ""}
        </span>
        <span className="kl-spacer" />
        <button type="button" className="kl-btn" onClick={() => onCopy(preset)}>Copier en couloir perso</button>
      </div>
      <pre>
        <span style={{ color: "var(--faint)" }}>
          {"# Équivalent en direct de ce couloir. L'index local est construit métier par métier\n# (ou classe par classe), puis servi par Kleio sans interroger Wikidata.\n"}
        </span>
        {highlight(liveQueryFor(preset))}
      </pre>
    </section>
  );
}

const SWATCHES = ["#2a9d8f", "#e76f51", "#8f6bd6", "#c9a227", "#4f8fd6", "#d65f8f"];

function CustomEditor({ lane, onRun }: { lane: FocusLane; onRun: Props["onRun"] }) {
  const [label, setLabel] = useState(lane.custom!.label);
  const [color, setColor] = useState(lane.custom!.color);
  const [query, setQuery] = useState(lane.custom!.query);
  const s = lane.customState;
  return (
    <section className="kl-q">
      <div className="bar">
        <input id="custom-label" value={label} onChange={(ev) => setLabel(ev.target.value)} aria-label="Nom du couloir"
          style={{ border: "1px solid var(--line)", borderRadius: 5, padding: "2px 8px", width: 180, background: "var(--panel)" }} />
        {SWATCHES.map((c) => (
          <Fragment key={c}>
            <button type="button" aria-label={`Couleur ${c}`} aria-pressed={c === color} onClick={() => setColor(c)}
              style={{ width: 16, height: 16, borderRadius: 3, background: c, border: c === color ? "2px solid var(--ink)" : "1px solid var(--line)", cursor: "pointer" }} />
          </Fragment>
        ))}
        <span className="kl-spacer" />
        {s?.status === "loading" && <span>exécution sur WDQS…</span>}
        {s?.status === "ok" && <span>WDQS · {((s.ms ?? 0) / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} s · {s.rows} lignes · {s.count} entrées datées</span>}
        <button type="button" className="kl-btn primary" disabled={s?.status === "loading"} onClick={() => onRun(lane.id, { label: label.trim() || "Couloir perso", color, query })}>
          Exécuter
        </button>
      </div>
      {s?.status === "error" && <span className="err mono" style={{ fontSize: 12 }}>{s.error}</span>}
      <textarea id={`custom-query-${lane.id}`} value={query} onChange={(ev) => setQuery(ev.target.value)} spellCheck={false} aria-label="Requête SPARQL du couloir" />
    </section>
  );
}
