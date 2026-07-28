"use client";
// A small fanned stack of polaroid prints for list rows. Clicking cycles the
// top print to the back with a lift-and-tuck animation so you can flip
// through every photo. Lives inside row-level <Link>s, so clicks never
// navigate. Single photo: one print, no cycling.
import { useState } from "react";

export function PolaroidStack({ photos, alt = "" }: { photos: string[]; alt?: string }) {
  // order[i] = which photo sits at stack slot i (slot 0 is on top)
  const [order, setOrder] = useState(() => photos.map((_, i) => i));
  const [outgoing, setOutgoing] = useState<number | null>(null);

  const single = photos.length < 2;

  function cycle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (single || outgoing !== null) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setOrder((o) => [...o.slice(1), o[0]]);
      return;
    }
    setOutgoing(order[0]);
    setTimeout(() => {
      setOrder((o) => [...o.slice(1), o[0]]);
      setOutgoing(null);
    }, 200);
  }

  return (
    <button
      type="button"
      className={`pstack${single ? " single" : ""}`}
      onClick={cycle}
      aria-label={single ? alt || "hangout photo" : "next photo"}
      tabIndex={single ? -1 : 0}
    >
      {order.map((photoIdx, slot) => (
        <span
          key={photoIdx}
          className={`pstack-card slot${Math.min(slot, 3)}${outgoing === photoIdx ? " out" : ""}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photos[photoIdx]} alt={slot === 0 ? alt : ""} draggable={false} />
        </span>
      ))}
    </button>
  );
}
