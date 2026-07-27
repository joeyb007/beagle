"use client";
// Hero-surface ASCII flow field. Hand-rolled: rAF loop over a <pre>, ~20fps.
// Static single frame under prefers-reduced-motion; paused when offscreen.
import { useEffect, useRef } from "react";

const CHARS = " .·:;+=xX▒▓";

export function AsciiField({
  rows = 26,
  cols = 120,
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
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

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
    };
  }, [rows, cols]);

  return <pre ref={ref} className={className} aria-hidden="true" />;
}
