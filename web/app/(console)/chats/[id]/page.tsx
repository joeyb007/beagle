// One group chat: members (with editable profiles), upcoming plan, past hangouts.
import Link from "next/link";
import { notFound } from "next/navigation";
import { saveProfile } from "@/app/profile-actions";
import { ArtifactStore } from "@/lib/artifact-store";
import { getGroup, listProfiles } from "@/lib/db";

export default async function ChatDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const group = getGroup(Number(id));
  if (!group) notFound();

  const profiles = new Map(listProfiles().map((p) => [p.handle, p]));
  const names = new Map([...profiles.values()].map((p) => [p.handle, p.name]));
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
      <h2>People</h2>
      <div className="member-list">
        {group.members.map((h) => {
          const p = profiles.get(h);
          return (
            <details key={h} className="member">
              <summary>
                <span className="avatar sm">{(names.get(h) ?? h.replace("+", ""))[0]}</span>
                <span className="member-name">{names.get(h) ?? h}</span>
                <span className="muted">{p?.data.persona_label ?? h}</span>
                <span className="member-edit">edit</span>
              </summary>
              {p ? (
                <form action={saveProfile} className="member-form">
                  <input type="hidden" name="handle" value={p.handle} />
                  <div className="member-grid">
                    <label className="field">Name
                      <input type="text" name="name" defaultValue={p.name} /></label>
                    <label className="field">Persona
                      <input type="text" name="persona_label" defaultValue={p.data.persona_label ?? ""} /></label>
                    <label className="field">Cuisines
                      <input type="text" name="cuisines" defaultValue={(p.data.cuisines ?? []).join(", ")} /></label>
                    <label className="field">Vibe
                      <input type="text" name="vibe" defaultValue={(p.data.vibe ?? []).join(", ")} /></label>
                    <label className="field">Hard nos
                      <input type="text" name="hard_nos" defaultValue={(p.data.hard_nos ?? []).join(", ")} /></label>
                    <label className="field">Availability
                      <input type="text" name="typical_availability" defaultValue={p.data.typical_availability ?? ""} /></label>
                    <label className="field">Notes
                      <input type="text" name="notes" defaultValue={p.data.notes ?? ""} /></label>
                    <label className="field">Constraint score
                      <input type="text" name="constraint_score" defaultValue={String(p.constraint_score)} /></label>
                  </div>
                  <button className="primary" type="submit">Save changes</button>
                </form>
              ) : (
                <p className="muted" style={{ padding: "10px 14px" }}>
                  No profile yet — Beagle builds one from this chat&apos;s history.
                </p>
              )}
            </details>
          );
        })}
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
