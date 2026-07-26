"use client";
// Tinder-style deck: drag to fling, buttons for the timid. Pure client state —
// decisions are a stub until matching goes live beyond the sample pool.
import { useRef, useState } from "react";
import { DAY_LABELS } from "@/lib/availability";

export interface SwipeCard {
  match_name: string;
  score: number; // cosine similarity 0..1
  reasons: string[];
  days: number[];
  km: number | null;
  persona: string | null;
  tastes: string[];
}

export function SwipeDeck({
  cards,
  onAdvance,
}: {
  cards: SwipeCard[];
  onAdvance?: (nextIndex: number) => void;
}) {
  const [top, setTop] = useState(0);
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const [leaving, setLeaving] = useState<"left" | "right" | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);

  const remaining = cards.slice(top);
  if (remaining.length === 0) {
    return <div className="card">That&apos;s everyone nearby for now — beagle keeps looking. 🐶</div>;
  }

  function fling(dir: "left" | "right") {
    setLeaving(dir);
    setTimeout(() => {
      setTop((t) => {
        onAdvance?.(t + 1);
        return t + 1;
      });
      setLeaving(null);
      setDrag(null);
    }, 260);
  }

  function onPointerDown(e: React.PointerEvent) {
    start.current = { x: e.clientX, y: e.clientY };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!start.current) return;
    setDrag({ dx: e.clientX - start.current.x, dy: e.clientY - start.current.y });
  }
  function onPointerUp() {
    if (drag && Math.abs(drag.dx) > 90) fling(drag.dx > 0 ? "right" : "left");
    else setDrag(null);
    start.current = null;
  }

  const dx = leaving ? (leaving === "right" ? 600 : -600) : (drag?.dx ?? 0);
  const rot = dx / 18;

  return (
    <div className="deck">
      {remaining.slice(0, 3).map((c, i) => {
        const isTop = i === 0;
        return (
          <div
            key={top + i}
            className={`swipe-card${isTop ? " top" : ""}`}
            style={
              isTop
                ? {
                    zIndex: 3,
                    transform: `translate(${dx}px, ${drag?.dy ?? 0}px) rotate(${rot}deg)`,
                    transition: drag && !leaving ? "none" : "transform 0.26s ease",
                  }
                : { zIndex: 3 - i, transform: `scale(${1 - i * 0.05}) translateY(${i * 14}px)` }
            }
            onPointerDown={isTop ? onPointerDown : undefined}
            onPointerMove={isTop ? onPointerMove : undefined}
            onPointerUp={isTop ? onPointerUp : undefined}
          >
            <div className="swipe-head">
              <span className="avatar lg">{c.match_name[0]}</span>
              <div>
                <div className="swipe-name">{c.match_name}</div>
                {c.persona && <div className="swipe-persona">{c.persona}</div>}
                <div className="muted">
                  {Math.round(c.score * 100)}% similar{c.km != null && <> · {c.km} km away</>}
                </div>
              </div>
            </div>
            {c.tastes.length > 0 && (
              <div className="chips">
                {c.tastes.map((t, j) => (<span key={j} className="chip chip-likes">{t}</span>))}
              </div>
            )}
            <div className="swipe-days">
              <span className="muted" style={{ fontSize: 12 }}>free this week</span>
              <div className="day-pills">
                {DAY_LABELS.map((label, d) => (
                  <span key={d} className={`day-pill${c.days.includes(d) ? " on" : ""}`}>{label}</span>
                ))}
              </div>
            </div>
            <ul className="swipe-reasons">
              {c.reasons.map((r, j) => (<li key={j}>{r}</li>))}
            </ul>
            {isTop && (
              <div className="swipe-actions">
                <button className="round pass" onClick={() => fling("left")} aria-label="pass">✕</button>
                <button className="round like" onClick={() => fling("right")} aria-label="say hi">🐶</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
