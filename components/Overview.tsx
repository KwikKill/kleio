"use client";

import { useEffect, useRef, useState } from "react";
import { formatRange } from "@/lib/time";
import type { Year } from "@/lib/types";
import { clampView, type View } from "@/lib/view";

// Logarithmic minimap of "time before now": from the Big Bang on the left to
// a day ago on the right, so 13.8 billion years and last week share one bar.
const MIN_AGO = 1 / 365.2425;
const MAX_AGO = 1.45e10;
const HI = Math.log10(MAX_AGO);
const LO = Math.log10(MIN_AGO);

const LANDMARKS: [number, string][] = [
  [13.787e9, "Big Bang"],
  [4.54e9, "Terre"],
  [538.8e6, "Cambrien"],
  [66e6, "Fin des dinosaures"],
  [3e5, "Homo sapiens"],
  [5200, "Écriture"],
];

interface Props {
  view: View;
  now: Year;
  onJump: (v: View, animate: boolean) => void;
}

export default function Overview({ view, now, onJump }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [w, setW] = useState(0);
  const [tick, setTick] = useState(0);
  const drag = useRef<{ startX: number; view: View; moved: boolean } | null>(null);

  useEffect(() => {
    const el = wrapRef.current!;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const bump = () => setTick((n) => n + 1);
    mq.addEventListener("change", bump);
    document.fonts?.ready.then(bump);
    return () => {
      ro.disconnect();
      mq.removeEventListener("change", bump);
    };
  }, []);

  const posOf = (ago: number) => ((HI - Math.log10(Math.min(MAX_AGO, Math.max(ago, MIN_AGO)))) / (HI - LO)) * w;
  const logAt = (x: number) => HI - (x / w) * (HI - LO);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !w) return;
    const h = 48;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(w * dpr);
    cv.height = h * dpr;
    const ctx = cv.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(document.documentElement);
    const v = (n: string) => css.getPropertyValue(n).trim();
    const x = (ago: number) => ((HI - Math.log10(Math.min(MAX_AGO, Math.max(ago, MIN_AGO)))) / (HI - LO)) * w;
    ctx.clearRect(0, 0, w, h);
    ctx.font = `10.5px ${v("--kl-sans") || "sans-serif"}, sans-serif`;
    for (let e = Math.ceil(LO); e <= Math.floor(HI); e++) {
      ctx.fillStyle = v("--line");
      ctx.fillRect(Math.round(x(10 ** e)), h - 6, 1, 6);
    }
    let lastEnd = -Infinity;
    for (const [ago, label] of LANDMARKS) {
      const px = Math.round(x(ago));
      ctx.fillStyle = v("--faint");
      ctx.fillRect(px, 8, 1, h - 16);
      const tw = ctx.measureText(label).width;
      if (px + 4 > lastEnd + 8 && px + 4 + tw < w) {
        ctx.fillStyle = v("--muted");
        ctx.fillText(label, px + 4, 17);
        lastEnd = px + 4 + tw;
      }
    }
    const a = x(now - view.from);
    const b = Math.max(a + 3, x(now - view.to));
    ctx.fillStyle = v("--ink");
    ctx.globalAlpha = 0.16;
    ctx.fillRect(a, 4, b - a, h - 8);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = v("--ink");
    ctx.lineWidth = 2;
    ctx.strokeRect(a, 4, b - a, h - 8);
    ctx.lineWidth = 1;
    ctx.font = `10px ${v("--kl-mono") || "monospace"}, monospace`;
    const note = "échelle log. · vue actuelle";
    const nw = ctx.measureText(note).width;
    ctx.fillStyle = v("--muted");
    ctx.fillText(note, a - nw - 10 > 0 ? a - nw - 10 : Math.min(b + 10, w - nw - 4), h - 9);
  }, [w, view, now, tick]);

  // Moving the bracket keeps its width in log space: the view 1440-1660
  // dropped onto the Cretaceous becomes a few tens of million years wide.
  const moveTo = (base: View, x: number, animate: boolean) => {
    const la = Math.log10(Math.max(now - base.from, MIN_AGO));
    const lb = Math.log10(Math.max(now - base.to, MIN_AGO));
    const lc = (la + lb) / 2;
    const target = logAt(x);
    onJump(clampView({ from: now - 10 ** (target + (la - lc)), to: now - 10 ** (target + (lb - lc)) }, now), animate);
  };

  const local = (ev: React.PointerEvent) => ev.clientX - canvasRef.current!.getBoundingClientRect().left;

  return (
    <div
      className="kl-ov"
      ref={wrapRef}
      role="group"
      aria-label={`Vue d'ensemble du Big Bang à aujourd'hui, en échelle logarithmique. Vue actuelle : ${formatRange(view.from, view.to, now)}. Clique ou glisse pour te déplacer.`}
      onPointerDown={(ev) => {
        (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
        drag.current = { startX: local(ev), view, moved: false };
      }}
      onPointerMove={(ev) => {
        const d = drag.current;
        if (!d) return;
        const x = local(ev);
        if (Math.abs(x - d.startX) > 3) d.moved = true;
        if (d.moved) {
          const la = Math.log10(Math.max(now - d.view.from, MIN_AGO));
          const lb = Math.log10(Math.max(now - d.view.to, MIN_AGO));
          const cx = posOf(10 ** ((la + lb) / 2));
          moveTo(d.view, cx + (x - d.startX), false);
        }
      }}
      onPointerUp={(ev) => {
        const d = drag.current;
        drag.current = null;
        if (d && !d.moved) moveTo(view, local(ev), true);
      }}
    >
      <canvas ref={canvasRef} />
    </div>
  );
}
