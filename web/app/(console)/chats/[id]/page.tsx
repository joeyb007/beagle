// One group chat: the live thread mirror is the page; members (read-only,
// you edit only yourself), the upcoming plan, and past hangouts with
// flip-through polaroid stacks ride the rail beside it.
import Link from "next/link";
import { notFound } from "next/navigation";
import { PolaroidStack } from "@/components/polaroid-stack";
import { SelfEditModal } from "@/components/self-edit-modal";
import { ArtifactStore } from "@/lib/artifact-store";
import { chatThread, effectiveChatId, getGroup, listProfiles } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { Thread } from "./thread";

export default async function ChatDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const group = getGroup(Number(id));
  if (!group) notFound();
  const me = await currentUser();

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
  const thread = chatThread(effectiveChatId(group));

  return (
    <>
      <p className="eyebrow"><Link href="/chats">chats</Link> / {group.name}</p>
      <h1>{group.name}</h1>

      <div className="chat-layout">
        <Thread
          groupId={group.id}
          initial={thread}
          names={Object.fromEntries(names)}
          myHandle={me?.handle ?? ""}
        />

        <div className="chat-rail">
          <div className="card">
            <h2 className="chat-rail-head">People</h2>
            <div className="member-list">
              {group.members.map((h) => {
                const p = profiles.get(h);
                const isMe = me?.handle === h;
                return (
                  <div key={h} className="member member-row">
                    <span className="avatar sm">{(names.get(h) ?? h.replace("+", ""))[0]}</span>
                    <span className="member-name">
                      {names.get(h) ?? h}
                      {isMe && <span className="muted"> (you)</span>}
                    </span>
                    <span className="muted">{p?.data.persona_label ?? h}</span>
                    {isMe && p && (
                      <span className="member-self-edit">
                        <SelfEditModal
                          you={{
                            name: p.name,
                            availability: p.data.typical_availability ?? null,
                            cuisines: p.data.cuisines ?? [],
                            hardNos: p.data.hard_nos ?? [],
                          }}
                          triggerClass="you-edit"
                        />
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <h2 className="chat-rail-head">Upcoming</h2>
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

          <h2 className="chat-rail-head">Past hangouts</h2>
          {past.length === 0 && <div className="card">None yet — the first one becomes a keepsake.</div>}
          {past.map((a) => (
            <Link key={a.plan_id} href={`/hangouts/${a.plan_id}`} style={{ textDecoration: "none" }}>
              <div className="card chat-card">
                <div>
                  <div className="chat-name">{a.place.name}</div>
                  <div className="muted">{fmt(a.time)}{a.isKeepsake ? " · 📸 keepsake" : ""}</div>
                </div>
                {a.photos.length > 0 && (
                  <PolaroidStack photos={a.photos} alt={`photos from ${a.place.name}`} />
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}

export const dynamic = "force-dynamic";
