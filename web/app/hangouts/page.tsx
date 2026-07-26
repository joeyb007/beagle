// Memories: every hangout artifact — keepsake gallery with private/public.
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { ArtifactStore } from "@/lib/artifact-store";
import { setArtifactVisibility } from "@/lib/db";

async function toggleVisibility(formData: FormData) {
  "use server";
  setArtifactVisibility(
    String(formData.get("plan_id")),
    formData.get("to") === "public" ? "public" : "private"
  );
  revalidatePath("/hangouts");
}

export default function Memories() {
  const artifacts = new ArtifactStore().list();
  const fmt = (t: string) =>
    new Date(t).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

  return (
    <>
      <p className="eyebrow">memories</p>
      <h1>Every hangout, kept</h1>
      <p className="sub">Plans become keepsakes. Public ones are shareable; private ones are just for the group.</p>

      {artifacts.length === 0 && (
        <div className="card">No hangouts yet. Say “Hey Beagle” in a group chat to make one.</div>
      )}
      <div className="memory-grid">
        {artifacts.map((a) => (
          <div key={a.plan_id} className="memory-card">
            <Link href={`/hangouts/${a.plan_id}`} className="memory-cover-link">
              {a.photos[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="memory-cover" src={a.photos[0]} alt="" />
              ) : (
                <div className="memory-cover memory-cover-empty">🎟️</div>
              )}
            </Link>
            <div className="memory-body">
              <Link href={`/hangouts/${a.plan_id}`} className="memory-title">{a.place.name}</Link>
              <div className="muted">
                {fmt(a.time)} · {a.attendees.length} went
                {a.playlist.length > 0 ? ` · ${a.playlist.length} tracks` : ""}
              </div>
              {a.note && <div className="memory-note">“{a.note}”</div>}
              <form action={toggleVisibility} className="vis-row">
                <input type="hidden" name="plan_id" value={a.plan_id} />
                <input type="hidden" name="to" value={a.visibility === "public" ? "private" : "public"} />
                <span className={`chip ${a.visibility === "public" ? "chip-public" : "chip-private"}`}>
                  {a.visibility}
                </span>
                <button className="linkish" type="submit">
                  make {a.visibility === "public" ? "private" : "public"}
                </button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export const dynamic = "force-dynamic";
