"use client";
// The mascot: a pixel puppy perched on top of a headline. It idle-bobs,
// hops along the text with squash-and-stretch, and turns to face the cursor.
// Motion is all transforms on one static sprite — no frame animation.
// Static (no loop) under prefers-reduced-motion.
import { useEffect, useRef } from "react";

const W = 56; // displayed sprite width (84x112 logical -> keep aspect)
const H = 75;

export function PixelBeagle({ targetId }: { targetId: string }) {
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const el = ref.current;
    const hero = document.getElementById(targetId);
    if (!el || !hero) return;

    const rect = () => hero.getBoundingClientRect();
    const perchY = (r: DOMRect) => r.top - H + 6; // paws slightly overlapping the text top

    let x = rect().left + rect().width * 0.72;
    let targetX = x;
    let facing = -1; // sprite art faces left
    let hopping = false;
    let hopStart = 0;
    let hopFrom = 0;
    let hopTo = 0;
    let nextMoveAt = performance.now() + 2000;
    let pointerX: number | null = null;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      const r = rect();
      el.style.transform = `translate(${r.left + r.width * 0.72}px, ${perchY(r)}px) scaleX(-1)`;
      return;
    }

    const onPointer = (e: PointerEvent) => {
      pointerX = e.clientX;
    };
    addEventListener("pointermove", onPointer);

    const HOP_MS = 380;
    const HOP_LEN = 52;

    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 33) return;
      last = now;

      const r = rect();
      const minX = r.left + 4;
      const maxX = r.right - W - 4;
      let y = perchY(r);
      let scaleY = 1;
      let scaleXs = 1;

      if (!hopping && now >= nextMoveAt) {
        targetX = minX + Math.random() * Math.max(1, maxX - minX);
        nextMoveAt = now + 2200 + Math.random() * 4200;
      }

      const dx = targetX - x;
      if (!hopping && Math.abs(dx) > 12) {
        hopping = true;
        hopStart = now;
        hopFrom = x;
        hopTo = x + Math.sign(dx) * Math.min(HOP_LEN, Math.abs(dx));
      }

      if (hopping) {
        const p = Math.min(1, (now - hopStart) / HOP_MS);
        x = hopFrom + (hopTo - hopFrom) * p;
        y -= 16 * Math.sin(Math.PI * p);
        scaleY = 1 - 0.14 * Math.cos(2 * Math.PI * p); // squash on push-off/landing, stretch mid-air
        scaleXs = 1 + 0.1 * Math.cos(2 * Math.PI * p);
        if (p >= 1) hopping = false;
        facing = Math.sign(hopTo - hopFrom) || facing;
      } else {
        y += Math.sin(now / 700) * 1.4; // idle breathing bob
        if (pointerX != null && Math.abs(pointerX - (x + W / 2)) > 40) {
          facing = pointerX > x + W / 2 ? 1 : -1;
        }
      }

      x = Math.max(minX, Math.min(maxX, x));
      const flip = facing === 1 ? " scaleX(-1)" : "";
      el.style.transform =
        `translate(${x}px, ${y}px) scale(${scaleXs}, ${scaleY})` + flip;
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("pointermove", onPointer);
    };
  }, [targetId]);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src="/beagle.png"
      alt=""
      aria-hidden="true"
      className="pixel-beagle"
      width={W}
      height={H}
    />
  );
}
