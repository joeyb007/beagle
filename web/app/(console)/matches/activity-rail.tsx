"use client";
// The inbox rail: typed rows, one anatomy. Every item is [type label] +
// [avatar + content] so the eye can sort the inbox at a glance: join
// requests need a decision, texts back are the payoff, you're-ins are
// reminders. When there's nothing, the page renders no rail at all.
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { IntroReply, JoinedMotive, MotiveAsk } from "@/lib/db";

function TypeTag({ kind, label }: { kind: "ask" | "reply" | "in"; label: string }) {
  return (
    <p className={`rail-type ${kind}`}>
      <span className="rail-type-dot" />
      {label}
    </p>
  );
}

export function ActivityRail({
  asks,
  replies,
  joined,
}: {
  asks: MotiveAsk[];
  replies: IntroReply[];
  joined: JoinedMotive[];
}) {
  const router = useRouter();
  const [decided, setDecided] = useState<Record<string, "in" | "declined">>({});

  async function decide(a: MotiveAsk, decision: "in" | "declined") {
    const key = `${a.motive_id}:${a.asker_handle}`;
    setDecided((d) => ({ ...d, [key]: decision }));
    await fetch("/api/motives/decide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ motive_id: a.motive_id, asker: a.asker_handle, decision }),
    }).catch(() => {});
    router.refresh();
  }

  return (
    <aside className="intro-rail card">
      <p className="rail-head">for you</p>

      {asks.map((a) => {
        const key = `${a.motive_id}:${a.asker_handle}`;
        const done = decided[key];
        return (
          <div key={key} className="rail-item">
            <TypeTag kind="ask" label="wants in" />
            <div className="rail-body">
              <span className="avatar sm">{a.asker_name[0]}</span>
              <div className="rail-content">
                <p className="rail-line">
                  <strong>{a.asker_name}</strong>
                  <span className="muted"> asked to join</span>
                </p>
                <p className="rail-sub rail-motive">&ldquo;{a.motive_text}&rdquo;</p>
                {done ? (
                  <p className={`rail-decided${done === "in" ? " yes" : ""}`}>
                    {done === "in" ? "they're in, beagle's telling them" : "passed, no hard feelings"}
                  </p>
                ) : (
                  <div className="rail-ask-actions">
                    <button type="button" className="rail-yes" onClick={() => decide(a, "in")}>
                      let them in
                    </button>
                    <button type="button" className="rail-no" onClick={() => decide(a, "declined")}>
                      not this time
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {replies.map((r) => (
        <div key={r.handle} className="rail-item">
          <TypeTag kind="reply" label="texted back" />
          <div className="rail-body">
            <span className="avatar sm">{r.name[0]}</span>
            <div className="rail-content">
              <p className="rail-line">
                <strong>{r.name}</strong>
                <span className="muted"> replied to the intro</span>
              </p>
              <p className="rail-snippet">&ldquo;{r.last_text}&rdquo;</p>
            </div>
          </div>
        </div>
      ))}

      {joined.map((j, i) => (
        <div key={i} className="rail-item">
          <TypeTag kind="in" label="you're in" />
          <div className="rail-body">
            <span className="avatar sm">{j.host_name[0]}</span>
            <div className="rail-content">
              <p className="rail-line">
                <strong>{j.motive_text}</strong>
              </p>
              <p className="rail-sub muted">
                {j.time_window} · hosted by {j.host_name.split(" ")[0]}
              </p>
            </div>
          </div>
        </div>
      ))}
    </aside>
  );
}
