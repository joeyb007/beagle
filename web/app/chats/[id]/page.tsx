// One group chat: members, upcoming plan, and the trail of past hangouts.
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArtifactStore } from "@/lib/artifact-store";
import { getGroup, listProfiles } from "@/lib/db";

export default async function ChatDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const group = getGroup(Number(id));
  if (!group) notFound();

  const names = new Map(listProfiles().map((p) => [p.handle, p.name]));
  const hangouts = new ArtifactStore()
    .list()
    .filter((a) => a.group_id === group.id);
  const now = Date.now();
  const upcoming = hangouts.filter((a) => new Date(a.time).getTime() > now);
  const past = hangouts.filter((a) => new Date(a.time).getTime() <= now);
  const fmt = (t: string) =>
    new Date(t).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <>
      <p className="eyebrow"><Link href="/chats">chats</Link> / {group.name}</p>
      <h1>{group.name}</h1>
      <div className="avatar-row" style={{ marginBottom: 24 }}>
        {group.members.map((h) => (
          <span key={h} className="avatar" title={h}>{(names.get(h) ?? h.replace("+", ""))[0]}</span>
        ))}
        <span className="muted" style={{ marginLeft: 8 }}>
          {group.members.map((h) => names.get(h) ?? h).join(", ")}
        </span>
      </div>

      <h2>Upcoming</h2>
      {upcoming.length === 0 && (
        <div className="card">Nothing planned. Text <strong>“Hey Beagle”</strong> in the chat and it&apos;ll handle the rest.</div>
      )}
      {upcoming.map((a) => (
        <Link key={a.plan_id} href={`/hangouts/${a.plan_id}`} style={{ textDecoration: "none" }}>
          <div className="card chat-card">
            <div className="chat-name">{a.place.name}</div>
            <div className="upcoming">{fmt(a.time)}</div>
          </div>
        </Link>
      ))}

      <h2>Past hangouts</h2>
      {past.length === 0 && <div className="card">None yet — the first one becomes a keepsake.</div>}
      {past.map((a) => (
        <Link key={a.plan_id} href={`/hangouts/${a.plan_id}`} style={{ textDecoration: "none" }}>
          <div className="card chat-card">
            <div>
              <div className="chat-name">{a.place.name}</div>
              <div className="muted">{fmt(a.time)}{a.isKeepsake ? " · 📸 keepsake" : ""}</div>
            </div>
            {a.photos[0] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="thumb" src={a.photos[0]} alt="" />
            )}
          </div>
        </Link>
      ))}
    </>
  );
}

export const dynamic = "force-dynamic";
