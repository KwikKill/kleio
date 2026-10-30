"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AXIS_H, drawTimeline, type Hit, laneHeight, type Marker, type RenderLane, type Theme } from "@/lib/render-timeline";
import type { WireEntry, Year } from "@/lib/types";
import { clampView, EARLIEST, FUTURE_MARGIN, pan, type View, zoomAt } from "@/lib/view";

export interface TimelineLane extends RenderLane {
  label: string;
  status: string;
  error?: string;
}

interface Props {
  view: View;
  now: Year;
  lanes: TimelineLane[];
  selectedId: string | null;
  marker: Marker | null;
  onView: (v: View) => void;
  onSelect: (e: WireEntry | null, laneId: string | null) => void;
  onLane: (id: string, action: "up" | "down" | "remove" | "focus") => void;
}

function readTheme(): Theme {
  const css = getComputedStyle(document.documentElement);
  const v = (n: string) => css.getPropertyValue(n).trim();
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  return {
    bg: v("--bg"), panel: v("--panel"), ink: v("--ink"), muted: v("--muted"), line: v("--line"), lineSoft: v("--line-soft"),
    laneAlt: v("--lane-alt"), now: v("--now"), onColor: dark ? "#121311" : "#ffffff",
    mono: `${v("--kl-mono") || "monospace"}, ui-monospace, monospace`,
    sans: `${v("--kl-sans") || "sans-serif"}, system-ui, sans-serif`,
  };
}

export default function Timeline({ view, now, lanes, selectedId, marker, onView, onSelect, onLane }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hitsRef = useRef<Hit[]>([]);
  const widths = useRef(new Map<string, number>());
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState<{ x: number; id: string | null } | null>(null);
  const [themeTick, setThemeTick] = useState(0);
  const [dragging, setDragging] = useState(false);

  // Latest props for the native listeners, which are attached once.
  const live = useRef({ view, now, onView });
  useEffect(() => {
    live.current = { view, now, onView };
  });

  useEffect(() => {
    const el = wrapRef.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const bump = () => {
      widths.current.clear();
      setThemeTick((n) => n + 1);
    };
    mq.addEventListener("change", bump);
    document.fonts?.ready.then(bump);
    return () => {
      ro.disconnect();
      mq.removeEventListener("change", bump);
    };
  }, []);

  const laneH = laneHeight(lanes.length, size.h);
  const H = Math.max(size.h, AXIS_H + laneH * lanes.length);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !size.w) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(size.w * dpr);
    cv.height = Math.round(H * dpr);
    cv.style.width = `${size.w}px`;
    cv.style.height = `${H}px`;
    const ctx = cv.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const measure = (font: string, text: string) => {
      const key = `${font}|${text}`;
      let w = widths.current.get(key);
      if (w === undefined) {
        ctx.font = font;
        w = ctx.measureText(text).width;
        widths.current.set(key, w);
      }
      return w;
    };
    hitsRef.current = drawTimeline(ctx, {
      W: size.w, H, view, now, lanes, laneH, selectedId, marker,
      hoverX: hover?.x ?? null, hoverId: hover?.id ?? null, theme: readTheme(), measure,
    });
  }, [size, H, view, now, lanes, laneH, selectedId, marker, hover, themeTick]);

  const hitAt = useCallback((x: number, y: number) => {
    for (let i = hitsRef.current.length - 1; i >= 0; i--) {
      const h = hitsRef.current[i];
      if (x >= h.x && x <= h.x + h.w && y >= h.y - 3 && y <= h.y + h.h + 3) return h;
    }
    return null;
  }, []);

  // Wheel zooms around the pointer; horizontal wheel or shift pans. Attached
  // natively because React's wheel listener is passive and cannot preventDefault.
  useEffect(() => {
    const cv = canvasRef.current!;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const { view: v, now: n, onView: set } = live.current;
      const rect = cv.getBoundingClientRect();
      const unit = ev.deltaMode === 1 ? 33 : ev.deltaMode === 2 ? 400 : 1;
      const dx = ev.shiftKey ? ev.deltaY : ev.deltaX;
      if (Math.abs(dx) > Math.abs(ev.deltaY) || ev.shiftKey) {
        set(pan(v, (dx * unit * (v.to - v.from)) / rect.width, n));
      } else {
        set(zoomAt(v, Math.exp(ev.deltaY * unit * 0.0015), (ev.clientX - rect.left) / rect.width, n));
      }
    };
    cv.addEventListener("wheel", onWheel, { passive: false });
    return () => cv.removeEventListener("wheel", onWheel);
  }, []);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ view: View; x: number; y: number; dist: number; mid: number; moved: boolean } | null>(null);

  const startGesture = () => {
    const pts = [...pointers.current.values()];
    const mid = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const dist = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
    gesture.current = { view, x: mid, y: pts[0].y, dist, mid, moved: gesture.current?.moved ?? false };
  };

  const localPoint = (ev: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  };

  const onPointerDown = (ev: React.PointerEvent) => {
    canvasRef.current!.setPointerCapture(ev.pointerId);
    pointers.current.set(ev.pointerId, localPoint(ev));
    gesture.current = null;
    startGesture();
  };

  const onPointerMove = (ev: React.PointerEvent) => {
    const p = localPoint(ev);
    if (!pointers.current.has(ev.pointerId)) {
      if (ev.pointerType === "mouse") setHover({ x: p.x, id: hitAt(p.x, p.y)?.entry.id ?? null });
      return;
    }
    pointers.current.set(ev.pointerId, p);
    const g = gesture.current!;
    const pts = [...pointers.current.values()];
    const w = size.w || 1;
    if (pts.length > 1) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (g.dist > 0) {
        const zoomed = zoomAt(g.view, g.dist / Math.max(dist, 1), g.mid / w, now);
        const mid = (pts[0].x + pts[1].x) / 2;
        onView(pan(zoomed, (-(mid - g.mid) * (zoomed.to - zoomed.from)) / w, now));
      }
      g.moved = true;
      return;
    }
    const dx = p.x - g.x;
    if (Math.abs(dx) > 3 || Math.abs(p.y - g.y) > 3) {
      g.moved = true;
      setDragging(true);
    }
    if (g.moved) onView(pan(g.view, (-dx * (g.view.to - g.view.from)) / w, now));
    setHover(ev.pointerType === "mouse" ? { x: p.x, id: null } : null);
  };

  const onPointerUp = (ev: React.PointerEvent) => {
    const p = localPoint(ev);
    pointers.current.delete(ev.pointerId);
    const g = gesture.current;
    if (pointers.current.size > 0) {
      startGesture();
      return;
    }
    setDragging(false);
    if (g && !g.moved) {
      const h = hitAt(p.x, p.y);
      onSelect(h?.entry ?? null, h?.laneId ?? null);
    }
    gesture.current = null;
  };

  const onDoubleClick = (ev: React.MouseEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    onView(zoomAt(view, ev.shiftKey ? 2 : 0.5, (ev.clientX - r.left) / r.width, now));
  };

  const onKeyDown = (ev: React.KeyboardEvent) => {
    const s = view.to - view.from;
    const map: Record<string, () => View> = {
      ArrowLeft: () => pan(view, -s * 0.1, now),
      ArrowRight: () => pan(view, s * 0.1, now),
      "+": () => zoomAt(view, 0.7, 0.5, now),
      "=": () => zoomAt(view, 0.7, 0.5, now),
      "-": () => zoomAt(view, 1 / 0.7, 0.5, now),
      "0": () => clampView({ from: EARLIEST, to: now + FUTURE_MARGIN }, now),
    };
    const fn = map[ev.key];
    if (fn) {
      ev.preventDefault();
      onView(fn());
    } else if (ev.key === "Escape") onSelect(null, null);
  };

  return (
    <div className="kl-tl" ref={wrapRef} tabIndex={0} onKeyDown={onKeyDown} aria-label="Frise chronologique. Molette pour zoomer, glisser pour se déplacer, flèches et + / − au clavier.">
      <canvas
        ref={canvasRef}
        className={dragging ? "dragging" : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => setHover(null)}
        onDoubleClick={onDoubleClick}
      />
      {lanes.map((l, i) => (
        <div key={l.id} className="kl-lane-head" style={{ top: AXIS_H + i * laneH + 3 }}>
          <button type="button" onClick={() => onLane(l.id, "focus")} style={{ opacity: 1, padding: 0 }} aria-label={`Afficher la requête du couloir ${l.label}`}>
            <span className="name" style={{ color: l.color }}>{l.label}</span>
          </button>
          <span className="meta" title={l.error}>{l.error ? "erreur" : l.status}</span>
          <button type="button" onClick={() => onLane(l.id, "up")} disabled={i === 0} aria-label="Monter le couloir">↑</button>
          <button type="button" onClick={() => onLane(l.id, "down")} disabled={i === lanes.length - 1} aria-label="Descendre le couloir">↓</button>
          <button type="button" onClick={() => onLane(l.id, "remove")} aria-label={`Retirer le couloir ${l.label}`}>✕</button>
        </div>
      ))}
    </div>
  );
}
