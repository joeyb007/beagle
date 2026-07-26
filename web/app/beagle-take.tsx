"use client";
// The long bar: Beagle's written read on you. Cached in the profile row;
// fetched from the agent on first view, refreshable on demand. Opens into a
// chat pane for asking about your own analytics.
import { useEffect, useState } from "react";
import { MemoryChat } from "@/app/memory-chat";

export function BeagleTake({ handle, initial }: { handle: string; initial: string | null }) {
  const [take, setTake] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function fetchTake(refresh: boolean) {
    setBusy(true);
    try {
      const resp = await fetch("/api/beagle-take", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle, refresh }),
      });
      const { take: next } = await resp.json();
      if (next) setTake(next);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!initial) fetchTake(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="take-bar">
      <div className="take-head">
        <span className="take-label">beagle&apos;s take</span>
        <button
          className="take-refresh"
          onClick={() => fetchTake(true)}
          disabled={busy}
          aria-label="refresh beagle's take"
          title="ask again"
        >
          ↻
        </button>
      </div>
      {busy ? (
        <p className="take-text take-loading">
          <span className="spark-spinner" aria-hidden /> re-reading everything…
        </p>
      ) : (
        <p className="take-text">
          {take ?? "beagle's brain is napping — start the agent to hear its take 🐶"}
        </p>
      )}
      <div className="take-chat">
        <MemoryChat
          compact
          endpoint="/api/profile-chat"
          body={{ handle }}
          placeholder="ask beagle anything about you — who you see most, where you always end up…"
        />
      </div>
    </div>
  );
}
