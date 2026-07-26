"use client";
// Tinder-style deck: drag to fling, buttons for the timid. Pure client state —
// decisions are a stub until matching goes live beyond the sample pool.
import { useRef, useState } from "react";
import { DAY_LABELS } from "@/lib/availability";

export interface SwipeCard {
  handle: string; // match candidate's handle — the persistence key
  match_name: string;
  score: number; // cosine similarity 0..1
  reasons: string[];
  days: number[];
  km: number | null;
  persona: string | null;
  tastes: string[];
  says: string; // beagle's matchmaker pitch
  hook: { src: string; place: string } | null; // a memory of MINE they'd have loved
}

export function SwipeDeck({
  cards,
  onAdvance,
  onDecide,
}: {
  cards: SwipeCard[];
  onAdvance?: (nextIndex: number) => void;
  onDecide?: (index: number, decision: "pass" | "intro") => void;
}) {
  const [top, setTop] = useState(0);
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const [leaving, setLeaving] = useState<"left" | "right" | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const remaining = cards.slice(top);

  function fling(dir: "left" | "right") {
    const card = remaining[0];
    const decision = dir === "right" ? "intro" : "pass";
    onDecide?.(top, decision);
    void fetch("/api/swipes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ match_handle: card.handle, decision }),
    });
    if (dir === "right") {
      setToast(`🐶 on it — texting ${card.match_name} an intro`);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(null), 2600);
    }
    setLeaving(dir);
    const next = top + 1;
    setTimeout(() => {
      setTop(next);
      onAdvance?.(next);
      setLeaving(null);
      setDrag(null);
    }, 260);
  }

  if (remaining.length === 0) {
    return (
      <div className="card">
        That&apos;s everyone nearby for now — beagle keeps sniffing. 🐶
        {toast && <div className="deck-toast">{toast}</div>}
      </div>
    );
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
      {toast && <div className="deck-toast">{toast}</div>}
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
            {c.hook ? (
              <div className="swipe-photo">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.hook.src} alt="" />
                <span className="swipe-photo-cap">would&apos;ve loved: {c.hook.place}</span>
              </div>
            ) : (
              <div className="swipe-photo blank" />
            )}
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
            <p className="swipe-says">“{c.says}”</p>
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
            {isTop && (
              <div className="swipe-actions">
                <button className="round pass" onClick={() => fling("left")} aria-label="pass">✕</button>
                <button className="round like" onClick={() => fling("right")} aria-label="beagle intros you" title="beagle texts the intro">✓</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
