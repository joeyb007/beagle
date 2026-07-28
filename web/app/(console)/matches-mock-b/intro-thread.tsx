"use client";
// Beagle walks you through the picks in a thread. Each intro is a message
// with an embedded person card; you decide inline with pills.
import { useState } from "react";
import { DAY_LABELS } from "@/lib/availability";
import type { SwipeCard } from "../matches/swipe-deck";

type Decision = "pass" | "intro";

function IntroCard({ c }: { c: SwipeCard }) {
  return (
    <div className="intro-card">
      {c.hook && (
        <div className="intro-card-photo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={c.hook.src} alt="" />
        </div>
      )}
      <div className="intro-card-body">
        <strong>{c.match_name}</strong>
        {c.persona && <span className="muted"> · {c.persona}</span>}
        {c.km != null && <span className="muted"> · {c.km} km</span>}
        {c.tastes.length > 0 && (
          <div className="chips" style={{ margin: "6px 0 0" }}>
            {c.tastes.slice(0, 4).map((t) => (
              <span key={t} className="chip chip-likes">{t}</span>
            ))}
          </div>
        )}
        <div className="day-pills" style={{ marginTop: 6 }}>
          {DAY_LABELS.map((label, d) => (
            <span key={d} className={`day-pill${c.days.includes(d) ? " on" : ""}`}>{label}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function IntroThread({ cards, firstName }: { cards: SwipeCard[]; firstName: string }) {
  const [decisions, setDecisions] = useState<Record<number, Decision>>({});

  const decidedCount = Object.keys(decisions).length;
  const visible = cards.slice(0, Math.min(decidedCount + 1, cards.length));

  return (
    <div className="card intro-thread">
      <div className="mchat-msg beagle">
        ok {firstName.toLowerCase()}, {cards.length} people this week worth your time. first up:
      </div>

      {visible.map((c, i) => (
        <div key={c.handle} className="intro-beat">
          <div className="mchat-msg beagle">
            {c.says}
          </div>
          <IntroCard c={c} />
          {decisions[i] === undefined ? (
            <div className="intro-pills">
              <button
                type="button"
                className="suggest-pill"
                onClick={() => setDecisions((m) => ({ ...m, [i]: "pass" }))}
              >
                not my crowd
              </button>
              <button
                type="button"
                className="suggest-pill intro-yes"
                onClick={() => setDecisions((m) => ({ ...m, [i]: "intro" }))}
              >
                beagle, intro us
              </button>
            </div>
          ) : decisions[i] === "intro" ? (
            <div className="mchat-msg beagle">
              say less. texting you and {c.match_name.split(" ")[0]} right now, you two take it from there.
            </div>
          ) : (
            <div className="mchat-msg beagle">noted, not your crowd.</div>
          )}
        </div>
      ))}

      {decidedCount >= cards.length && (
        <div className="mchat-msg beagle">
          that&apos;s the litter for this week. fresh picks land friday.
        </div>
      )}
    </div>
  );
}
