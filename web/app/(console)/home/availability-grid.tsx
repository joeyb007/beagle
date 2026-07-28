"use client";
// When everyone's free — LettuceMeet-style heat across the week, per crew.
// Heat = how many of the crew are typically free that day; rows show each
// member. gcal-synced members carry a check (live busy data flows through
// Beagle's calendar provider in chat answers).
import { useState } from "react";

export interface GridMember {
  name: string;
  days: number[]; // 0=Mon … 6=Sun
  synced: boolean;
}

export interface GridCrew {
  id: number;
  name: string;
  members: GridMember[];
}

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export function AvailabilityGrid({ crews }: { crews: GridCrew[] }) {
  const [picked, setPicked] = useState<number>(crews[0]?.id ?? 0);
  const crew = crews.find((c) => c.id === picked) ?? crews[0];
  if (!crew) return null;

  const counts = DAYS.map((_, d) => crew.members.filter((m) => m.days.includes(d)).length);
  const best = Math.max(...counts, 1);

  return (
    <section className="card avail">
      <div className="avail-head">
        <h2>When everyone&apos;s free</h2>
        <div className="chips">
          {crews.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`chip chip-likes group-pick${c.id === picked ? " picked" : ""}`}
              onClick={() => setPicked(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <div className="avail-grid" style={{ gridTemplateColumns: `120px repeat(7, 1fr)` }}>
        <span />
        {DAYS.map((d) => (
          <span key={d} className="avail-day">{d}</span>
        ))}

        <span className="avail-label">everyone</span>
        {counts.map((n, i) => (
          <span
            key={i}
            className={`avail-heat${n === best && n > 0 ? " best" : ""}`}
            style={{ opacity: n === 0 ? 0.14 : 0.25 + (n / crew.members.length) * 0.75 }}
            title={`${n}/${crew.members.length} free ${DAYS[i]}`}
          >
            {n > 0 ? n : ""}
          </span>
        ))}

        {crew.members.map((m) => (
          <MemberRow key={m.name} member={m} />
        ))}
      </div>
      <p className="muted avail-foot">
        from each person&apos;s usual pattern · ✓ = google calendar connected — ask beagle for exact times
      </p>
    </section>
  );
}

function MemberRow({ member }: { member: GridMember }) {
  return (
    <>
      <span className="avail-label">
        {member.name.split(" ")[0]}
        {member.synced && <span className="avail-sync" title="google calendar connected"> ✓</span>}
      </span>
      {["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((_, d) => (
        <span key={d} className={`avail-dot${member.days.includes(d) ? " on" : ""}`} />
      ))}
    </>
  );
}
