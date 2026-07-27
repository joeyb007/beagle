"use client";
// Animated pixel beagle living on the landing headline. Real sprite-sheet
// animation: walk/wag are 8-frame 48x32 strips, idle/sit single frames.
// Positioned absolute inside .landing (scroll-safe; no per-frame rect reads —
// layout is re-measured only via ResizeObserver). Static sit pose under
// prefers-reduced-motion. Art: "Dog Pack" by bat (megamicrobats.itch.io).
import { useEffect, useRef } from "react";

const FW = 48;
const FH = 32;
const SCALE = 2;

type AnimName = "walk" | "wag" | "idle" | "sit";
const ANIMS: Record<AnimName, { src: string; frames: number; ms: number }> = {
  walk: { src: "/dog/walk.png", frames: 8, ms: 110 },
  wag: { src: "/dog/wag.png", frames: 8, ms: 120 },
  idle: { src: "/dog/idle.png", frames: 1, ms: 400 },
  sit: { src: "/dog/sit.png", frames: 1, ms: 400 },
};

export function PixelBeagle({ targetId }: { targetId: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = ref.current;
    const hero = document.getElementById(targetId);
    const host = el?.closest(".landing") as HTMLElement | null;
    if (!el || !hero || !host) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    const imgs = {} as Record<AnimName, HTMLImageElement>;
    (Object.keys(ANIMS) as AnimName[]).forEach((name) => {
      const img = new Image();
      img.src = ANIMS[name].src;
      imgs[name] = img;
    });

    // Headline box in .landing's coordinate space (absolute positioning is
    // scroll-safe; only re-measured when layout actually changes).
    let minX = 0;
    let maxX = 0;
    let perchY = 0;

    let x = 0;
    let targetX = 0;
    let facing = 1; // sprite art faces right
    let state: AnimName = "idle";
    let frame = 0;
    let frameAt = 0;
    let nextThinkAt = 0;
    let placed = false;

    const draw = () => {
      const img = imgs[state];
      ctx.clearRect(0, 0, FW, FH);
      if (img.complete && img.naturalWidth > 0) {
        ctx.save();
        if (facing < 0) {
          ctx.translate(FW, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(img, frame * FW, 0, FW, FH, 0, 0, FW, FH);
        ctx.restore();
      }
      el.style.transform = `translate(${x}px, ${perchY}px)`;
      el.style.visibility = "visible"; // hidden in CSS until first placement
    };

    const measure = () => {
      const hr = hero.getBoundingClientRect();
      const lr = host.getBoundingClientRect();
      minX = hr.left - lr.left + 6;
      maxX = hr.right - lr.left - FW * SCALE - 6;
      perchY = hr.top - lr.top - FH * SCALE + 10; // paws overlap the text top
      if (!placed) {
        x = minX + (maxX - minX) * 0.7;
        targetX = x;
        placed = true;
      }
      x = Math.max(minX, Math.min(maxX, x));
      draw(); // static reposition — safe in reduced-motion too
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    ro.observe(hero);

    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      state = "sit";
      const img = imgs.sit;
      if (img.complete) draw();
      else img.addEventListener("load", () => draw(), { once: true });
      return () => ro.disconnect();
    }

    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 33) return;
      last = now;

      if (now >= nextThinkAt) {
        if (state === "walk") {
          // arrived (or timed out mid-walk): settle
          state = Math.random() < 0.45 ? "wag" : Math.random() < 0.5 ? "sit" : "idle";
          frame = 0;
          nextThinkAt = now + 1600 + Math.random() * 3200;
        } else if (Math.random() < 0.65) {
          targetX = minX + Math.random() * Math.max(1, maxX - minX);
          state = "walk";
          frame = 0;
          nextThinkAt = now + 12000; // hard cap; arrival re-thinks sooner
        } else {
          state = state === "wag" ? "idle" : "wag";
          frame = 0;
          nextThinkAt = now + 1400 + Math.random() * 2400;
        }
      }

      if (state === "walk") {
        const dx = targetX - x;
        x += Math.sign(dx) * Math.min(Math.abs(dx), 1.6);
        if (dx !== 0) facing = Math.sign(dx);
        if (Math.abs(targetX - x) < 2) nextThinkAt = now; // settle next tick
      }

      const a = ANIMS[state];
      if (now - frameAt >= a.ms) {
        frame = (frame + 1) % a.frames;
        frameAt = now;
      }
      draw();
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [targetId]);

  return (
    <canvas
      ref={ref}
      width={FW}
      height={FH}
      style={{ width: FW * SCALE, height: FH * SCALE }}
      className="pixel-beagle"
      aria-hidden="true"
    />
  );
}
