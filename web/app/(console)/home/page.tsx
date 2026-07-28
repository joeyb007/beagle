// Home: Beagle's read on YOU — the persona it earned, plus the polaroid string
// of every hangout you were part of.
import Link from "next/link";
import { BeagleTake } from "@/app/beagle-take";
import { SparkButton } from "@/app/spark-button";
import { StringStrip } from "@/app/string-strip";
import { DAY_LABELS, availableDays } from "@/lib/availability";
import { onThisDay, peopleStats, photoMemories, upcomingFor } from "@/lib/db";
import { currentUser } from "@/lib/session";

function daysUntil(iso: string): string {
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
  return days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
}

function monthOf(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export default async function Home() {
  const user = await currentUser();
  if (!user) return null; // AuthGate shows the sign-in modal

  const memories = photoMemories(user.handle);
  const days = availableDays(user.data.typical_availability);
  const upNext = upcomingFor(user.handle);
  const people = peopleStats(user.handle);
  const flashback = onThisDay(user.handle);
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

      <BeagleTake handle={user.handle} initial={(user.data.beagle_take as string | undefined) ?? null} />

      <div className="widget-row">
        <div className="card widget">
          <h2 style={{ marginTop: 0 }}>Up next</h2>
          {upNext ? (
            <>
              <p className="widget-big">{upNext.place}</p>
              <p className="muted" style={{ margin: "2px 0 8px" }}>
                {daysUntil(upNext.time)}
                {upNext.others.length > 0 && <> · with {upNext.others.join(" & ")}</>}
              </p>
              <Link href={`/hangouts/${upNext.plan_id}`}>see the plan →</Link>
            </>
          ) : (
            <p className="muted" style={{ marginBottom: 0 }}>
              nothing on the calendar — say “hey beagle” in a group chat
            </p>
          )}
        </div>

        <div className="card widget">
          <h2 style={{ marginTop: 0 }}>Your people</h2>
          {people.mostSeen ? (
            <>
              <p className="widget-big">{people.mostSeen.name}</p>
              <p className="muted" style={{ margin: "2px 0 8px" }}>
                most-seen face · {people.mostSeen.count} hangout{people.mostSeen.count === 1 ? "" : "s"}
              </p>
              {people.longestUnseen && people.longestUnseen.name !== people.mostSeen.name && (
                <p className="muted" style={{ marginBottom: 0 }}>
                  haven’t seen <strong>{people.longestUnseen.name}</strong> since {monthOf(people.longestUnseen.lastTime)}
                </p>
              )}
            </>
          ) : (
            <p className="muted" style={{ marginBottom: 0 }}>no shared hangouts yet</p>
          )}
        </div>

        <div className="card widget">
          <h2 style={{ marginTop: 0 }}>On this day-ish</h2>
          {flashback ? (
            <div className="otd">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <Link href={`/hangouts/${flashback.plan_id}`} className="otd-photo">
                <img src={flashback.src} alt={`memory from ${flashback.place}`} />
              </Link>
              <div className="otd-body">
                <p className="widget-big">{flashback.place}</p>
                <p className="muted" style={{ margin: "2px 0 8px" }}>{monthOf(flashback.time)}</p>
                <SparkButton planId={flashback.plan_id} photo={flashback.src} />
              </div>
            </div>
          ) : (
            <p className="muted" style={{ marginBottom: 0 }}>no photographed memories yet</p>
          )}
        </div>
      </div>

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

      <StringStrip memories={memories} />
    </>
  );
}

export const dynamic = "force-dynamic";
