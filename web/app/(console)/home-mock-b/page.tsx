// HOME CONCEPT B — Social feed: lead with life. A scrolling feed of hangouts
// and photos with Beagle moments woven in; actions live in a right rail.
// Photo string stays as the signature closer.
import Link from "next/link";
import { StringStrip } from "@/app/string-strip";
import { groupsFor, photoMemories, recentActivity, upcomingFor } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { MockSwitcher } from "../home-mock-a/mock-switcher";

function monthOf(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export default async function HomeMockB() {
  const user = await currentUser();
  if (!user) return null;
  const memories = photoMemories(user.handle);
  const upNext = upcomingFor(user.handle);
  const groups = groupsFor(user.handle);
  const beagleLines = recentActivity(20).filter((a) => a.direction === "out").slice(0, 3);
  const first = user.name.split(" ")[0];

  // interleave: photo card, photo card, beagle moment, repeat
  const feed: React.ReactNode[] = [];
  memories.slice(0, 6).forEach((m, i) => {
    feed.push(
      <article key={`m${i}`} className="feed-card card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <Link href={`/hangouts/${m.plan_id}`}><img src={m.src} alt={m.place} /></Link>
        <div className="feed-card-body">
          <strong>{m.place}</strong>
          <span className="muted">{monthOf(m.time)} · with {m.others.join(" & ") || "the crew"}</span>
          {m.note && <p className="feed-note">&ldquo;{m.note}&rdquo;</p>}
        </div>
      </article>
    );
    const b = beagleLines[i];
    if (i % 2 === 1 && b) {
      feed.push(
        <article key={`b${i}`} className="feed-beagle">
          <span className="feed-dog">🐶</span>
          <p>{b.text.slice(0, 90)}{b.text.length > 90 ? "…" : ""}</p>
        </article>
      );
    }
  });

  return (
    <>
      <MockSwitcher current="b" />
      <p className="eyebrow">home</p>
      <h1 className="persona-headline">the crew, lately</h1>

      <div className="feed-layout">
        <div className="feed-main">{feed}</div>

        <aside className="feed-rail">
          <div className="card widget">
            <h2 style={{ marginTop: 0 }}>Up next</h2>
            {upNext ? (
              <>
                <p className="widget-big">{upNext.place}</p>
                <Link href={`/hangouts/${upNext.plan_id}`}>see the plan →</Link>
              </>
            ) : (
              <p className="muted" style={{ marginBottom: 0 }}>nothing locked yet</p>
            )}
            <button className="primary summon" style={{ marginTop: 12, width: "100%" }}>
              Summon Beagle
            </button>
          </div>
          <div className="card widget">
            <h2 style={{ marginTop: 0 }}>Crews</h2>
            <ul className="crew-list">
              {groups.map((g) => (
                <li key={g.id}>
                  <span className={`pulse ${g.daysSince !== null && g.daysSince <= 14 ? "green" : g.daysSince !== null && g.daysSince <= 30 ? "amber" : "red"}`} />
                  <span className="crew-name">{g.name}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="persona-mini card" style={{ margin: 0 }}>
            <span className="avatar lg">{user.name[0]}</span>
            <div>
              <strong>{first}</strong>
              <p className="muted" style={{ margin: 0 }}>{user.data.persona_label ?? "?"}</p>
            </div>
          </div>
        </aside>
      </div>

      <StringStrip memories={memories} />
    </>
  );
}

export const dynamic = "force-dynamic";
