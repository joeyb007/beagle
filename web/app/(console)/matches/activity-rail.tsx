"use client";
// The inbox rail: only rows that need you or reward you. Asks on your
// motives come with the decision; intros that got a text back surface the
// payoff; motives you're in sit as quiet reminders. When there's nothing,
// the page renders no rail at all.
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { IntroReply, JoinedMotive, MotiveAsk } from "@/lib/db";

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

      {asks.length > 0 && (
        <div className="rail-group">
          {asks.map((a) => {
            const key = `${a.motive_id}:${a.asker_handle}`;
            const done = decided[key];
            return (
              <div key={key} className="rail-ask">
                <p className="rail-ask-line">
                  <strong>{a.asker_name}</strong> asked into{" "}
                  <span className="rail-motive">&ldquo;{a.motive_text}&rdquo;</span>
                </p>
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
            );
          })}
        </div>
      )}

      {replies.length > 0 && (
        <div className="rail-group">
          {replies.map((r) => (
            <div key={r.handle} className="rail-reply">
              <p className="rail-ask-line">
                <span className="status-dot" /> <strong>{r.name}</strong> texted back
              </p>
              <p className="rail-snippet">&ldquo;{r.last_text}&rdquo;</p>
            </div>
          ))}
        </div>
      )}

      {joined.length > 0 && (
        <div className="rail-group">
          {joined.map((j, i) => (
            <p key={i} className="rail-joined">
              you&apos;re in: <strong>{j.motive_text}</strong>
              <span className="muted"> · {j.time_window} · w/ {j.host_name.split(" ")[0]}</span>
            </p>
          ))}
        </div>
      )}
    </aside>
  );
}
