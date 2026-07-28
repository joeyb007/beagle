// Home: the action hub. Lead with doing — summon Beagle for a crew, see which
// crews are going quiet, watch what Beagle's been up to — with Beagle's take
// up top and the polaroid string closing the page.
import Link from "next/link";
import { BeagleTake } from "@/app/beagle-take";
import { StringStrip } from "@/app/string-strip";
import { groupsFor, photoMemories, recentActivity, upcomingFor } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { SummonCard } from "./summon-card";

function pulse(daysSince: number | null): { cls: string; label: string } {
  if (daysSince === null) return { cls: "red", label: "never hung out" };
  if (daysSince <= 14) return { cls: "green", label: `${daysSince}d ago` };
  if (daysSince <= 30) return { cls: "amber", label: `${daysSince}d ago` };
  return { cls: "red", label: `${daysSince}d, going quiet` };
}

function daysUntil(iso: string): string {
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
  return days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
}

export default async function Home() {
  const user = await currentUser();
  if (!user) return null; // AuthGate shows the sign-in modal

  const groups = groupsFor(user.handle);
  const upNext = upcomingFor(user.handle);
  const activity = recentActivity(8);
  const memories = photoMemories(user.handle);
  const first = user.name.split(" ")[0];

  return (
    <>
      <p className="eyebrow">home</p>
      <h1 className="persona-headline">what&apos;s the move, {first}?</h1>

      <BeagleTake handle={user.handle} initial={(user.data.beagle_take as string | undefined) ?? null} />

      <SummonCard crews={groups.map((g) => ({ id: g.id, name: g.name }))} />

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
            <p className="muted" style={{ marginBottom: 0 }}>nothing locked. summon the dog</p>
          )}
        </div>

        <div className="card widget">
          <h2 style={{ marginTop: 0 }}>Your crews</h2>
          <ul className="crew-list">
            {groups.length === 0 && <li className="muted">no crews yet</li>}
            {groups.map((g) => {
              const p = pulse(g.daysSince);
              return (
                <li key={g.id}>
                  <span className={`pulse ${p.cls}`} />
                  <span className="crew-name">{g.name}</span>
                  <span className="muted">{p.label}</span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="card widget">
          <h2 style={{ marginTop: 0 }}>Beagle&apos;s been busy</h2>
          <ul className="feed-list">
            {activity.length === 0 && <li className="muted">quiet so far today</li>}
            {activity.map((a, i) => (
              <li key={i}>
                <span className={`feed-dir ${a.direction}`}>{a.direction === "out" ? "→" : "←"}</span>
                <span className="feed-text">{a.text.slice(0, 64)}{a.text.length > 64 ? "…" : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="persona-mini card">
        <span className="avatar lg">{user.name[0]}</span>
        <div>
          <strong>{user.name}</strong>
          <p className="muted" style={{ margin: 0 }}>
            {user.data.persona_label ?? "still figuring you out"} · <Link href="/profiles">your profile</Link>
          </p>
        </div>
      </div>

      <StringStrip memories={memories} />
    </>
  );
}

export const dynamic = "force-dynamic";
