// HOME CONCEPT C — Persona+: today's identity-portrait DNA, with an action
// strip on top and a Beagle activity line woven in. Smallest departure.
// Photo string stays as the signature closer.
import Link from "next/link";
import { StringStrip } from "@/app/string-strip";
import { DAY_LABELS, availableDays } from "@/lib/availability";
import { groupsFor, photoMemories, recentActivity, upcomingFor } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { MockSwitcher } from "../home-mock-a/mock-switcher";

function daysUntil(iso: string): string {
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
  return days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
}

export default async function HomeMockC() {
  const user = await currentUser();
  if (!user) return null;
  const memories = photoMemories(user.handle);
  const upNext = upcomingFor(user.handle);
  const groups = groupsFor(user.handle);
  const days = availableDays(user.data.typical_availability);
  const lastBeagle = recentActivity(10).find((a) => a.direction === "out");
  const chips = [
    ...(user.data.cuisines ?? []).map((c) => ({ kind: "likes", text: c })),
    ...(user.data.vibe ?? []).map((v) => ({ kind: "vibe", text: v })),
    ...(user.data.hard_nos ?? []).map((n) => ({ kind: "no", text: `no ${n}` })),
  ];

  return (
    <>
      <MockSwitcher current="c" />
      <div className="action-strip">
        {groups.map((g) => (
          <button key={g.id} className="chip chip-likes group-pick">plan · {g.name}</button>
        ))}
        {upNext && (
          <Link href={`/hangouts/${upNext.plan_id}`} className="chip chip-vibe">
            next: {upNext.place} {daysUntil(upNext.time)}
          </Link>
        )}
      </div>

      <p className="eyebrow">beagle&apos;s read on you</p>
      <h1 className="persona-headline">
        {user.name} <span className="persona-label">— {user.data.persona_label ?? "still figuring you out"}</span>
      </h1>
      {lastBeagle && (
        <p className="sub">
          lately: &ldquo;{lastBeagle.text.slice(0, 80)}{lastBeagle.text.length > 80 ? "…" : ""}&rdquo;
        </p>
      )}

      <div className="persona-grid">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Taste</h2>
          <div className="chips">
            {chips.length === 0 && <span className="muted">nothing learned yet</span>}
            {chips.map((c, i) => (
              <span key={i} className={`chip chip-${c.kind}`}>{c.text}</span>
            ))}
          </div>
        </div>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>When you&apos;re around</h2>
          <div className="day-pills">
            {DAY_LABELS.map((label, i) => (
              <span key={i} className={`day-pill${days.includes(i) ? " on" : ""}`}>{label}</span>
            ))}
          </div>
          <p className="muted" style={{ marginBottom: 0 }}>{user.data.typical_availability ?? "no pattern yet"}</p>
        </div>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Pickiness</h2>
          <div className="meter">
            <div className="meter-fill" style={{ width: `${Math.round(user.constraint_score * 100)}%` }} />
          </div>
          <p className="muted" style={{ marginBottom: 0 }}>
            {user.constraint_score >= 0.7 ? "beagle asks you first" : user.constraint_score >= 0.4 ? "somewhere in the middle" : "down for almost anything"}
          </p>
        </div>
      </div>

      <StringStrip memories={memories} />
    </>
  );
}

export const dynamic = "force-dynamic";
