"use client";
// The stage: swipe deck + the live ranking queue beside it. The queue is the
// cosine ranking made visible — rows grey out as you swipe past them.
import { useState } from "react";
import { SwipeCard, SwipeDeck } from "./swipe-deck";

export function MatchStage({ cards }: { cards: SwipeCard[] }) {
  const [current, setCurrent] = useState(0);
  const [decisions, setDecisions] = useState<Record<number, "pass" | "intro">>({});

  return (
    <div className="match-stage">
      <div className="match-deck-col">
        <SwipeDeck
          cards={cards}
          onAdvance={setCurrent}
          onDecide={(i, d) => setDecisions((m) => ({ ...m, [i]: d }))}
        />
      </div>
      <aside className="match-queue">
        <div className="queue-head">
          <span>the ranking</span>
          <span className="muted">{Math.min(current + 1, cards.length)} of {cards.length}</span>
        </div>
        {cards.map((c, i) => (
          <div key={i} className={`queue-row${i < current ? " seen" : ""}${i === current ? " current" : ""}`}>
            <span className="queue-rank">{String(i + 1).padStart(2, "0")}</span>
            <span className="avatar sm">{c.match_name[0]}</span>
            <span className="queue-name">
              {c.match_name}
              {c.persona && <span className="queue-persona"> · {c.persona}</span>}
            </span>
            <span className="queue-sim">
              {decisions[i] ? (
                <span className={`queue-mark ${decisions[i]}`}>
                  {decisions[i] === "intro" ? "✓ intro on the way" : "✕ passed"}
                </span>
              ) : (
                <>
                  <span className="sim-bar"><span style={{ width: `${Math.round(c.score * 100)}%` }} /></span>
                  <span className="sim-num">{Math.round(c.score * 100)}</span>
                </>
              )}
            </span>
          </div>
        ))}
        <p className="muted queue-foot">
          cosine similarity over earned taste vectors — cuisines, vibe, aversions, free days
        </p>
      </aside>
    </div>
  );
}
