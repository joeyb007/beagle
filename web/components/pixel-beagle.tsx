"use client";
// Animated pixel beagle. Real sprite-sheet animation: walk/wag are 8-frame
// 48x32 strips, idle/sit single frames. Lives absolutely inside a positioned
// host (landing hero, chat card) and perches on a target element's top edge.
// Moods: "free" wanders/sits/wags on his own; "think" sits with a thought
// bubble; "talk" wags with a speech bubble. Static sit pose under
// prefers-reduced-motion. Art: "Dog Pack" by bat (megamicrobats.itch.io).
import { useEffect, useRef } from "react";

const FW = 48;
const FH = 32;
const SCALE = 1.5;

type AnimName = "walk" | "wag" | "idle" | "sit";
const ANIMS: Record<AnimName, { src: string; frames: number; ms: number }> = {
  walk: { src: "/dog/walk.png", frames: 8, ms: 110 },
  wag: { src: "/dog/wag.png", frames: 8, ms: 120 },
  idle: { src: "/dog/idle.png", frames: 1, ms: 400 },
  sit: { src: "/dog/sit.png", frames: 1, ms: 400 },
};

export type BeagleMood = "free" | "think" | "talk";

export function PixelBeagle({
  targetIds,
  host = ".landing",
  mood = "free",
}: {
  targetIds: string[];
  host?: string;
  mood?: BeagleMood;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const moodRef = useRef<BeagleMood>(mood);
  moodRef.current = mood;

  useEffect(() => {
    const wrap = wrapRef.current;
    const el = canvasRef.current;
    // first existing target wins
    const hero = targetIds
      .map((id) => document.getElementById(id))
      .find((n): n is HTMLElement => n != null);
    const hostEl = wrap?.closest(host) as HTMLElement | null;
    if (!wrap || !el || !hero || !hostEl) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    const imgs = {} as Record<AnimName, HTMLImageElement>;
    (Object.keys(ANIMS) as AnimName[]).forEach((name) => {
      const img = new Image();
      img.src = ANIMS[name].src;
      imgs[name] = img;
    });

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
      wrap.style.transform = `translate(${x}px, ${perchY}px)`;
      wrap.style.visibility = "visible"; // hidden in CSS until first placement
    };

    const measure = () => {
      const hr = hero.getBoundingClientRect();
      const lr = hostEl.getBoundingClientRect();
      minX = hr.left - lr.left + 6;
      maxX = hr.right - lr.left - FW * SCALE - 6;
      perchY = hr.top - lr.top - FH * SCALE + 2; // paws rest on the target's top edge
      if (!placed) {
        x = minX + (maxX - minX) * 0.7;
        targetX = x;
        placed = true;
      }
      x = Math.max(minX, Math.min(maxX, x));
      draw();
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(hostEl);
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

      const m = moodRef.current;
      if (m === "think") {
        if (state !== "sit") {
          state = "sit";
          frame = 0;
          nextThinkAt = now; // re-decide the moment mood frees up
        }
      } else if (m === "talk") {
        if (state !== "wag") {
          state = "wag";
          frame = 0;
          nextThinkAt = now;
        }
      } else if (now >= nextThinkAt) {
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

      if (state === "walk" && m === "free") {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetIds.join(","), host]);

  return (
    <div
      ref={wrapRef}
      className="pixel-beagle"
      style={{ width: FW * SCALE, height: FH * SCALE }}
      aria-hidden="true"
    >
      <span className={`dog-bubble think${mood === "think" ? " on" : ""}`}>
        <i /><i /><i />
      </span>
      <span className={`dog-bubble talk${mood === "talk" ? " on" : ""}`}>
        <i /><i /><i />
      </span>
      <canvas ref={canvasRef} width={FW} height={FH} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
