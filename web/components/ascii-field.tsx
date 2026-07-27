"use client";
// Hero-surface ASCII flow field. Hand-rolled: rAF loop over a <pre>, ~20fps.
// Static single frame under prefers-reduced-motion; paused when offscreen.
import { useEffect, useRef } from "react";

const CHARS = " .·:;+=xX▒▓";

// Measures the pre's own font metrics to fill whatever box it's placed in —
// callers size the box via CSS (inset: 0 on a positioned parent); rows/cols
// props are only a fallback for the very first paint.
function measureCell(el: HTMLElement) {
  const probe = document.createElement("span");
  probe.textContent = "M";
  probe.style.visibility = "hidden";
  probe.style.position = "absolute";
  probe.style.whiteSpace = "pre";
  const cs = getComputedStyle(el);
  probe.style.font = cs.font;
  el.appendChild(probe);
  const width = probe.getBoundingClientRect().width || 6.6;
  el.removeChild(probe);
  const lineHeight = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.05 || 12;
  return { width, height: lineHeight };
}

export function AsciiField({
  rows: rowsProp = 26,
  cols: colsProp = 120,
  className,
}: {
  rows?: number;
  cols?: number;
  className?: string;
}) {
  const ref = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let t = Math.random() * 100;
    let rows = rowsProp;
    let cols = colsProp;

    const fit = () => {
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const cell = measureCell(el);
      cols = Math.max(20, Math.ceil(rect.width / cell.width));
      rows = Math.max(10, Math.ceil(rect.height / cell.height));
    };
    fit();

    const frame = () => {
      let out = "";
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const u = x / cols;
          const v = y / rows;
          let d =
            Math.sin(u * 7 + t * 0.9) * Math.cos(v * 5 - t * 0.6) +
            Math.sin((u + v) * 9 - t * 1.3) * 0.5 +
            Math.sin(Math.hypot(u - 0.7, v - 0.4) * 18 - t * 1.7) * 0.6;
          d = (d + 2.1) / 4.2;
          const i = Math.min(CHARS.length - 1, Math.max(0, Math.floor(d * CHARS.length)));
          out += CHARS[i];
        }
        out += "\n";
      }
      el.textContent = out;
    };

    frame(); // static first paint — the only paint under reduced motion

    const ro = new ResizeObserver(() => {
      fit();
      frame();
    });
    ro.observe(el);

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return () => ro.disconnect();
    }

    let visible = true;
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
    });
    io.observe(el);

    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible || now - last < 50) return;
      last = now;
      t += 0.05;
      frame();
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
    };
  }, [rowsProp, colsProp]);

  return <pre ref={ref} className={className} aria-hidden="true" />;
}
