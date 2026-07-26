// Home: Beagle's read on YOU — the persona it earned, plus the polaroid string
// of every hangout you were part of.
import Link from "next/link";
import { redirect } from "next/navigation";
import { StringStrip } from "@/app/string-strip";
import { DAY_LABELS, availableDays } from "@/lib/availability";
import { photoMemories } from "@/lib/db";
import { currentUser } from "@/lib/session";

export default async function Home() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const memories = photoMemories(user.handle);
  const days = availableDays(user.data.typical_availability);
  const chips = [
    ...(user.data.cuisines ?? []).map((c) => ({ kind: "likes", text: c })),
    ...(user.data.vibe ?? []).map((v) => ({ kind: "vibe", text: v })),
    ...(user.data.hard_nos ?? []).map((n) => ({ kind: "no", text: `no ${n}` })),
  ];

  return (
    <>
      <p className="eyebrow">beagle&apos;s read on you</p>
      <h1 className="persona-headline">
        {user.name} <span className="persona-label">— {user.data.persona_label ?? "still figuring you out"}</span>
      </h1>
      <p className="sub">
        Earned from your messages{user.data.notes ? ` · ${user.data.notes}` : ""} —{" "}
        <Link href="/profiles">correct anything</Link>.
      </p>

      <div className="persona-grid">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Taste</h2>
          <div className="chips">
            {chips.length === 0 && <span className="muted">nothing learned yet — go text your group</span>}
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
          <p className="muted" style={{ marginBottom: 0 }}>
            {user.data.typical_availability ?? "no pattern yet"}
          </p>
        </div>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Pickiness</h2>
          <div className="meter">
            <div className="meter-fill" style={{ width: `${Math.round(user.constraint_score * 100)}%` }} />
          </div>
          <p className="muted" style={{ marginBottom: 0 }}>
            {user.constraint_score >= 0.7
              ? "beagle asks you first — your answers prune the plan"
              : user.constraint_score >= 0.4
                ? "somewhere in the middle"
                : "down for almost anything"}
          </p>
        </div>
      </div>

      <h2>The string</h2>
      <StringStrip memories={memories} />
    </>
  );
}

export const dynamic = "force-dynamic";
