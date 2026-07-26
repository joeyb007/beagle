"use client";
// The polaroid string with serendipity: hover a print → a memory card floats
// up; ask Beagle what happened, or spark a "remember this day" text to the group.
import Link from "next/link";
import { useRef, useState } from "react";
import type { PhotoMemory } from "@/lib/db";

interface CardState {
  memory: PhotoMemory;
  x: number;
  y: number;
}

function datePhrase(iso: string): string {
  const d = new Date(iso);
  const weekday = d.toLocaleDateString(undefined, { weekday: "long" });
  const month = d.toLocaleDateString(undefined, { month: "long" });
  return `One ${weekday} in ${month}`;
}

export function StringStrip({ memories }: { memories: PhotoMemory[] }) {
  const [card, setCard] = useState<CardState | null>(null);
  const [sparked, setSparked] = useState<Set<string>>(new Set());
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const strip = memories.length ? [...memories, ...memories] : [];

  function show(e: React.MouseEvent, memory: PhotoMemory) {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setCard({ memory, x: rect.left + rect.width / 2, y: rect.top });
  }
  function scheduleHide() {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setCard(null), 450);
  }
  function cancelHide() {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }

  async function spark(planId: string) {
    setSparked((s) => new Set(s).add(planId));
    await fetch("/api/sparks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan_id: planId }),
    });
  }

  if (strip.length === 0) {
    return (
      <div className="card">
        No photos yet — they appear here after your first <Link href="/hangouts">hangout keepsake</Link>.
      </div>
    );
  }

  return (
    <>
      <div
        className={`string-wrap${card ? " paused" : ""}`}
        aria-label="photos from your past hangouts"
        onMouseLeave={scheduleHide}
      >
        <div className="string-line" />
        <div className="string-track">
          {strip.map((m, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <div
              key={i}
              className="string-print"
              style={{ ["--tilt" as string]: `${(i % 5) - 2}deg` }}
              onMouseEnter={(e) => show(e, m)}
            >
              <img src={m.src} alt={`memory from ${m.place}`} />
            </div>
          ))}
        </div>
      </div>

      {card && (
        <div
          className="memory-pop"
          style={{ left: card.x, top: card.y }}
          onMouseEnter={cancelHide}
          onMouseLeave={scheduleHide}
        >
          <div className="memory-pop-date">{datePhrase(card.memory.time)}</div>
          <div className="memory-pop-place">{card.memory.place}</div>
          {card.memory.note && <div className="memory-pop-note">“{card.memory.note}”</div>}
          {card.memory.others.length > 0 && (
            <div className="muted">with {card.memory.others.join(" & ")}</div>
          )}
          <div className="memory-pop-actions">
            <Link href={`/hangouts/${card.memory.plan_id}`}>what happened that day →</Link>
            <button
              className="spark"
              disabled={sparked.has(card.memory.plan_id)}
              onClick={() => spark(card.memory.plan_id)}
            >
              {sparked.has(card.memory.plan_id) ? "✨ beagle's on it" : "✨ remind the group"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
