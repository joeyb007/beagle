// Chats: the group chats Beagle lives in — who's in them, what happened, what's next.
import Link from "next/link";
import { listGroupsWithHangouts, listProfiles } from "@/lib/db";

export default function Chats() {
  const groups = listGroupsWithHangouts();
  const names = new Map(listProfiles().map((p) => [p.handle, p.name]));
  const fmt = (t: string) =>
    new Date(t).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

  return (
    <>
      <p className="eyebrow">your groups</p>
      <h1>Chats</h1>
      <p className="sub">Every group Beagle knows. Say “Hey Beagle” in any of them to start a plan.</p>
      <p><Link className="button" href="/chats/new">+ New group chat</Link></p>

      {groups.length === 0 && (
        <div className="card">No groups yet — create one and paste its chat history.</div>
      )}
      {groups.map((g) => (
        <Link key={g.id} href={`/chats/${g.id}`} style={{ textDecoration: "none" }}>
          <div className="card chat-card">
            <div className="chat-main">
              <div className="chat-name">{g.name}</div>
              <div className="avatar-row">
                {g.members.map((h) => (
                  <span key={h} className="avatar sm" title={names.get(h) ?? h}>
                    {(names.get(h) ?? h.replace("+", ""))[0]}
                  </span>
                ))}
                <span className="muted" style={{ marginLeft: 8 }}>
                  {g.members.map((h) => names.get(h) ?? h).join(", ")}
                </span>
              </div>
            </div>
            <div className="chat-meta">
              <div>{g.lastHangout ? `last: ${g.lastHangout.place.name} · ${fmt(g.lastHangout.time)}` : "no hangouts yet"}</div>
              <div className={g.upcomingHangout ? "upcoming" : "muted"}>
                {g.upcomingHangout
                  ? `next: ${g.upcomingHangout.place.name} · ${fmt(g.upcomingHangout.time)}`
                  : "nothing planned — say the word"}
              </div>
            </div>
          </div>
        </Link>
      ))}
    </>
  );
}

export const dynamic = "force-dynamic";
