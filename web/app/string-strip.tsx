"use client";
// The polaroid string with serendipity: hover a print → a memory card floats
// up; ask Beagle what happened, or spark a "remember this day" text to the group.
import Link from "next/link";
import { useRef, useState } from "react";
import { MemoryChat } from "@/app/memory-chat";
import { SparkButton } from "@/app/spark-button";
import type { PhotoMemory } from "@/lib/db";

interface CardState {
  memory: PhotoMemory;
  x: number;
  y: number;
}

function datePhrase(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function StringStrip({ memories }: { memories: PhotoMemory[] }) {
  const [card, setCard] = useState<CardState | null>(null);
  const [closing, setClosing] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const strip = memories.length ? [...memories, ...memories] : [];

  function clearTimers() {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }
  function show(e: React.MouseEvent, memory: PhotoMemory) {
    clearTimers();
    setClosing(false);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setCard({ memory, x: rect.left + rect.width / 2, y: rect.top });
  }
  function scheduleHide() {
    clearTimers();
    hideTimer.current = setTimeout(() => {
      setClosing(true);
      closeTimer.current = setTimeout(() => {
        setCard(null);
        setClosing(false);
      }, 180);
    }, 450);
  }
  function cancelHide() {
    clearTimers();
    setClosing(false);
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
      >
        <div className="string-inner">
        <div className="string-line" />
        <div className="string-track">
          {strip.map((m, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <div
              key={i}
              className="string-print"
              style={{ ["--tilt" as string]: `${(i % 5) - 2}deg` }}
              onMouseEnter={(e) => show(e, m)}
              onMouseLeave={scheduleHide}
            >
              <img src={m.src} alt={`memory from ${m.place}`} />
            </div>
          ))}
        </div>
        </div>
      </div>

      {card && (
        <div
          key={card.memory.plan_id}
          className={`memory-pop${closing ? " closing" : ""}`}
          style={{ left: card.x, top: card.y }}
          onMouseEnter={cancelHide}
          onMouseLeave={scheduleHide}
        >
          <div className="memory-pop-date">{datePhrase(card.memory.time)}</div>
          <div className="memory-pop-place">{card.memory.place}</div>
          {card.memory.others.length > 0 && (
            <div className="muted">with {card.memory.others.join(" & ")}</div>
          )}
          <div className="memory-pop-actions">
            <SparkButton planId={card.memory.plan_id} photo={card.memory.src} />
            <MemoryChat planId={card.memory.plan_id} compact />
            <Link href={`/hangouts/${card.memory.plan_id}`} className="memory-pop-more">
              open the keepsake →
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
