// Hangout index — every artifact the agent has locked.
import Link from "next/link";
import { ArtifactStore } from "@/lib/artifact-store";

export default function Hangouts() {
  const artifacts = new ArtifactStore().list();
  return (
    <>
      <h1>Hangouts</h1>
      <p className="sub">Every plan Beagle locked — each one becomes a keepsake.</p>
      {artifacts.length === 0 && (
        <div className="card">No hangouts yet. Say “Hey Beagle” in the group chat to make one.</div>
      )}
      {artifacts.map((a) => (
        <Link key={a.plan_id} href={`/hangouts/${a.plan_id}`} className="stub">
          <span className="date">
            {new Date(a.time)
              .toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
              .toUpperCase()}
          </span>
          <span className="body">
            <strong className="place">{a.place.name}</strong>
            <span className="meta">
              {new Date(a.time).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
              {" · "}{a.attendees.length} going{a.isKeepsake ? " · 📸 keepsake" : ""}
            </span>
          </span>
        </Link>
      ))}
    </>
  );
}

export const dynamic = "force-dynamic";
