"use client";
// When everyone's free — a gcal-style week, heat-mapped by how many friends
// are free each hour. Scales to any friend count: the grid stays 7 columns,
// and clicking a slot pops up exactly who's available then.
import { useMemo, useState } from "react";
import type { HourBlock } from "@/lib/availability";

export interface HeatPerson {
  name: string;
  blocks: HourBlock[]; // [day, startHour, endHour)
  synced: boolean;
}

export interface HeatCrew {
  id: number;
  name: string;
  members: string[]; // names, matching HeatPerson.name
}

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const FIRST_HOUR = 8;
const LAST_HOUR = 23; // exclusive

function hourLabel(h: number): string {
  if (h === 12) return "12pm";
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

export function WeekHeat({ people, crews }: { people: HeatPerson[]; crews: HeatCrew[] }) {
  const [filter, setFilter] = useState<number | "all">("all");
  const [slot, setSlot] = useState<{ day: number; hour: number } | null>(null);

  const pool = useMemo(() => {
    if (filter === "all") return people;
    const names = new Set(crews.find((c) => c.id === filter)?.members ?? []);
    return people.filter((p) => names.has(p.name));
  }, [filter, people, crews]);

  const freeAt = (day: number, hour: number) =>
    pool.filter((p) => p.blocks.some(([d, s, e]) => d === day && hour >= s && hour < e));

  const hours = Array.from({ length: LAST_HOUR - FIRST_HOUR }, (_, i) => FIRST_HOUR + i);
  const max = Math.max(1, ...hours.flatMap((h) => DAYS.map((_, d) => freeAt(d, h).length)));
  const picked = slot ? freeAt(slot.day, slot.hour) : [];

  return (
    <section className="card avail">
      <div className="avail-head">
        <h2>When everyone&apos;s free</h2>
        <div className="chips">
          <button
            type="button"
            className={`chip chip-likes group-pick${filter === "all" ? " picked" : ""}`}
            onClick={() => setFilter("all")}
          >
            everyone
          </button>
          {crews.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`chip chip-likes group-pick${filter === c.id ? " picked" : ""}`}
              onClick={() => setFilter(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <div className="week-grid" role="grid" aria-label="Friend availability by hour">
        <span />
        {DAYS.map((d) => (
          <span key={d} className="avail-day">{d}</span>
        ))}
        {hours.map((h) => (
          <WeekRow key={h} hour={h} freeAt={freeAt} max={max} onPick={(day) => setSlot({ day, hour: h })} />
        ))}
      </div>
      <p className="muted avail-foot">
        darker = more people free · click a slot to see who · from usual patterns; gcal-synced friends (✓) get exact answers in chat
      </p>

      {slot && (
        <div className="auth-overlay wl-overlay" role="dialog" aria-modal="true" aria-label="Who's free">
          <div className="card auth-modal slot-modal">
            <h2>
              {DAYS[slot.day]} {hourLabel(slot.hour)}
            </h2>
            {picked.length === 0 ? (
              <p className="muted">nobody&apos;s usually free then. beagle can still ask around.</p>
            ) : (
              <ul className="slot-list">
                {picked.map((p) => (
                  <li key={p.name}>
                    {p.name}
                    {p.synced && <span className="avail-sync" title="google calendar connected"> ✓</span>}
                  </li>
                ))}
              </ul>
            )}
            <button className="primary auth-cta" onClick={() => setSlot(null)}>Close</button>
          </div>
        </div>
      )}
    </section>
  );
}

function WeekRow({
  hour,
  freeAt,
  max,
  onPick,
}: {
  hour: number;
  freeAt: (day: number, hour: number) => HeatPerson[];
  max: number;
  onPick: (day: number) => void;
}) {
  return (
    <>
      <span className="week-hour">{hourLabel(hour)}</span>
      {DAYS.map((_, d) => {
        const n = freeAt(d, hour).length;
        return (
          <button
            key={d}
            type="button"
            className="week-cell"
            style={{ "--heat": n / max } as React.CSSProperties}
            onClick={() => onPick(d)}
            aria-label={`${n} free ${DAYS[d]} ${hourLabel(hour)}`}
          >
            <span className="week-count">{n > 0 ? n : ""}</span>
          </button>
        );
      })}
    </>
  );
}
