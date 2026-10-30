"use client";

import { useEffect, useRef, useState } from "react";
import { formatRange, formatScale, formatSpan } from "@/lib/time";
import type { Year } from "@/lib/types";
import { type View } from "@/lib/view";
import { type SearchHit, searchEntities } from "@/lib/wikidata-client";

interface Props {
  view: View;
  now: Year;
  visible: number;
  width: number;
  onZoom: (factor: number) => void;
  onReset: () => void;
  onPick: (hit: SearchHit) => void;
  searchError: string | null;
  laneCount: number;
  lanesOpen: boolean;
  onLanes: () => void;
}

export default function TopBar({ view, now, visible, width, onZoom, onReset, onPick, searchError, laneCount, lanesOpen, onLanes }: Props) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      searchEntities(text, ctrl.signal)
        .then((h) => {
          setHits(h);
          setActive(0);
          setError(null);
        })
        .catch((e) => {
          if (!ctrl.signal.aborted) setError(`Recherche indisponible : ${(e as Error).message}`);
        });
    }, 220);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q]);

  useEffect(() => {
    const close = (ev: PointerEvent) => {
      if (!boxRef.current?.contains(ev.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  const pick = (h: SearchHit) => {
    setOpen(false);
    setQ(h.label);
    onPick(h);
  };

  const shown = q.trim().length >= 2 ? hits : [];
  const message = error ?? searchError;

  return (
    <header className="kl-top">
      <div className="kl-title">
        <span className="kl-brand">Kleio</span>
        <h1>{formatRange(view.from, view.to, now)}</h1>
        <small>
          {formatSpan(view.to - view.from)} · {visible.toLocaleString("fr-FR")} entrée{visible > 1 ? "s" : ""} dans la vue
        </small>
      </div>
      <span className="kl-spacer" />
      <div className="kl-search" ref={boxRef}>
        <input
          id="kl-search"
          type="search"
          placeholder="Chercher sur Wikidata…"
          value={q}
          autoComplete="off"
          role="combobox"
          aria-expanded={open && shown.length > 0}
          aria-controls="kl-search-list"
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, shown.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && shown[active]) pick(shown[active]);
            else if (e.key === "Escape") setOpen(false);
          }}
        />
        {open && (shown.length > 0 || message) && (
          <ul id="kl-search-list" role="listbox">
            {message && <li className="kl-empty" style={{ padding: "6px 8px" }}>{message}</li>}
            {shown.map((h, i) => (
              <li key={h.id}>
                <button type="button" role="option" aria-selected={i === active} onClick={() => pick(h)} onMouseEnter={() => setActive(i)}>
                  <span>{h.label}</span>
                  <small>{h.description ?? h.id}</small>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <button type="button" className="kl-btn" onClick={onLanes} aria-expanded={lanesOpen}>
        Couloirs ({laneCount})
      </button>
      <div className="kl-zoom">
        <button type="button" className="kl-btn" onClick={() => onZoom(1 / 0.6)} aria-label="Dézoomer">−</button>
        <span className="scale">1 px = {formatScale((view.to - view.from) / Math.max(1, width))}</span>
        <button type="button" className="kl-btn" onClick={() => onZoom(0.6)} aria-label="Zoomer">+</button>
        <button type="button" className="kl-btn" onClick={onReset}>Tout</button>
      </div>
    </header>
  );
}
