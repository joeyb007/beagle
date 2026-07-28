"use client";
// Beagle's picks as sniff-report dossiers: one at a time, next peeking from
// behind. Swipe to decide (drag right = intro, left = pass) or use the word
// buttons. A right swipe persists AND has Beagle text the warm intro now;
// when the text lands, the intros-in-flight rail refreshes with the receipt.
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { DAY_LABELS } from "@/lib/availability";

export interface MatchCard {
  handle: string; // persistence key
  match_name: string;
  reasons: string[];
  days: number[];
  km: number | null;
  persona: string | null;
  tastes: string[];
  says: string; // beagle's matchmaker pitch
  hook: { src: string; place: string } | null; // a memory of MINE they'd have loved
}

function whyProse(reasons: string[]): string {
  if (reasons.length === 0) return "beagle just has a feeling about this one.";
  if (reasons.length === 1) return reasons[0] + ".";
  return reasons.slice(0, -1).join(", ") + ", and " + reasons[reasons.length - 1] + ".";
}

export function DossierStack({ cards }: { cards: MatchCard[] }) {
  const router = useRouter();
  // freeze the batch at mount: router.refresh() updates the rail without
  // reshuffling the deck mid-session
  const [deck] = useState(cards);
  const [top, setTop] = useState(0);
  const [leaving, setLeaving] = useState<"pass" | "intro" | null>(null);
  const [introd, setIntrod] = useState<string[]>([]);
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);

  const remaining = deck.slice(top);

  function decide(d: "pass" | "intro") {
    if (leaving) return;
    const c = remaining[0];
    const swiped = fetch("/api/swipes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ match_handle: c.handle, decision: d }),
    });
    if (d === "intro") {
      setIntrod((xs) => [...xs, c.match_name.split(" ")[0]]);
      // beagle drafts + texts the warm intro; refresh puts the receipt in the rail
      void swiped
        .then(() =>
          fetch("/api/intro", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ match_handle: c.handle }),
          })
        )
        .then(() => router.refresh())
        .catch(() => {});
    } else {
      void swiped.then(() => router.refresh()).catch(() => {});
    }
    setLeaving(d);
    setTimeout(() => {
      setTop((t) => t + 1);
      setLeaving(null);
      setDrag(null);
    }, 320);
  }

  function onPointerDown(e: React.PointerEvent) {
    if ((e.target as Element).closest("button")) return;
    start.current = { x: e.clientX, y: e.clientY };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!start.current) return;
    setDrag({ dx: e.clientX - start.current.x, dy: e.clientY - start.current.y });
  }
  function onPointerUp() {
    if (drag && Math.abs(drag.dx) > 90) decide(drag.dx > 0 ? "intro" : "pass");
    else setDrag(null);
    start.current = null;
  }

  if (remaining.length === 0) {
    return (
      <div className="mm-done card">
        <p className="widget-big" style={{ marginTop: 0 }}>that&apos;s the litter for this week</p>
        {introd.length > 0 ? (
          <p className="muted">
            beagle is texting intros to {introd.join(" and ")} right now. fresh picks land friday.
          </p>
        ) : (
          <p className="muted">no one caught your eye. beagle keeps sniffing, fresh picks land friday.</p>
        )}
      </div>
    );
  }

  return (
    <div className="mm-stage">
      <div className="mm-progress" aria-label={`pick ${top + 1} of ${deck.length}`}>
        {deck.map((_, i) => (
          <span key={i} className={`mm-dot${i < top ? " done" : i === top ? " now" : ""}`} />
        ))}
      </div>
      <div className="mm-stack">
        {remaining.slice(0, 2).map((c, i) => {
          const isTop = i === 0;
          const dx = isTop ? (leaving ? (leaving === "intro" ? 640 : -640) : (drag?.dx ?? 0)) : 0;
          return (
            <div
              key={top + i}
              className={`dossier${isTop ? " top" : " under"}${isTop && leaving ? ` out-${leaving}` : ""}`}
              style={
                isTop
                  ? {
                      transform: `translate(${dx}px, ${drag && !leaving ? drag.dy * 0.3 : 0}px) rotate(${dx / 22}deg)`,
                      transition: drag && !leaving ? "none" : undefined,
                    }
                  : undefined
              }
              onPointerDown={isTop ? onPointerDown : undefined}
              onPointerMove={isTop ? onPointerMove : undefined}
              onPointerUp={isTop ? onPointerUp : undefined}
            >
              {c.hook ? (
                <div className="string-print mm-photo">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.hook.src} alt="" />
                  <span className="mm-photo-cap">{c.hook.place}</span>
                </div>
              ) : (
                <div className="string-print mm-photo">
                  <div className="mm-mono">{c.match_name[0]}</div>
                  <span className="mm-photo-cap">no shared shots yet</span>
                </div>
              )}

              {c.km != null && (
                <p className="eyebrow" style={{ marginBottom: 2 }}>{c.km} km away</p>
              )}
              <p className="mm-name">{c.match_name}</p>
              {c.persona && <p className="mm-persona">{c.persona}</p>}

              {c.reasons.length > 0 && (
                <>
                  <p className="mm-why-head">why you two</p>
                  <p className="mm-why">{whyProse(c.reasons)}</p>
                </>
              )}

              {c.tastes.length > 0 && (
                <div className="chips" style={{ marginTop: 8 }}>
                  {c.tastes.map((t) => (
                    <span key={t} className="chip chip-likes">{t}</span>
                  ))}
                </div>
              )}

              <div className="swipe-days" style={{ marginTop: 10 }}>
                <span className="muted" style={{ fontSize: 12 }}>usually free</span>
                <div className="day-pills">
                  {DAY_LABELS.map((label, d) => (
                    <span key={d} className={`day-pill${c.days.includes(d) ? " on" : ""}`}>{label}</span>
                  ))}
                </div>
              </div>

              <div className="mm-pitch">
                <span className="mm-pitch-tail" aria-hidden />
                {c.says}
              </div>

              {isTop && (
                <div className="mm-actions">
                  <button type="button" className="mm-skip" onClick={() => decide("pass")}>
                    not my crowd
                  </button>
                  <button type="button" className="mm-connect" onClick={() => decide("intro")}>
                    beagle, intro us
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
