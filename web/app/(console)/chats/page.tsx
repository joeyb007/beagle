// Chats: the group chats Beagle lives in — the last thing said, who's in
// them, what happened, what's next.
import Link from "next/link";
import { chatThread, effectiveChatId, listGroupsWithHangouts, listProfiles } from "@/lib/db";

function ago(ts: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(ts + "Z").getTime()) / 60000));
  if (mins < 60) return `${Math.max(1, mins)}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

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

      {groups.length === 0 && (
        <div className="card">No groups yet. Add Beagle to a group chat and they show up here.</div>
      )}
      {groups.map((g) => {
        const thread = chatThread(effectiveChatId(g));
        const last = thread.length ? thread[thread.length - 1] : null;
        const lastName = last
          ? last.direction === "out" || last.handle === "beagle"
            ? "beagle"
            : (names.get(last.handle) ?? last.handle).split(" ")[0].toLowerCase()
          : null;
        return (
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
                  <span className="muted chat-count">{g.members.length} people</span>
                </div>
                {last && (
                  <p className="chat-preview">
                    <span className="chat-preview-text">
                      <span className={lastName === "beagle" ? "chat-preview-beagle" : "chat-preview-who"}>
                        {lastName}:
                      </span>{" "}
                      {last.text}
                    </span>
                    <span className="muted chat-preview-ago">· {ago(last.ts)}</span>
                  </p>
                )}
              </div>
              <div className="chat-meta">
                <div>{g.lastHangout ? `last: ${g.lastHangout.place.name} · ${fmt(g.lastHangout.time)}` : "no hangouts yet"}</div>
                <div className={g.upcomingHangout ? "upcoming" : "muted"}>
                  {g.upcomingHangout
                    ? `next: ${g.upcomingHangout.place.name} · ${fmt(g.upcomingHangout.time)}`
                    : "nothing planned, say the word"}
                </div>
              </div>
            </div>
          </Link>
        );
      })}
    </>
  );
}

export const dynamic = "force-dynamic";
