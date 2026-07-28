// Memories: every hangout artifact — keepsake gallery in the product's own
// photo language: flip-through polaroid stacks on paper, crew origin, and
// visibility as a single toggle chip.
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { PolaroidStack } from "@/components/polaroid-stack";
import { ArtifactStore } from "@/lib/artifact-store";
import { listGroupsWithHangouts, setArtifactVisibility } from "@/lib/db";
import { VisChip } from "./vis-chip";

async function toggleVisibility(formData: FormData) {
  "use server";
  setArtifactVisibility(
    String(formData.get("plan_id")),
    formData.get("to") === "public" ? "public" : "private"
  );
  revalidatePath("/hangouts");
}

export default function Memories() {
  // chronological: upcoming first, then the past from newest to oldest
  const artifacts = new ArtifactStore()
    .list()
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  const crewName = new Map(listGroupsWithHangouts().map((g) => [g.id, g.name]));
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
        {artifacts.map((a) => {
          const isUpcoming = new Date(a.time).getTime() > Date.now();
          return (
          <div key={a.plan_id} className="memory-card">
            <div className="memory-cover-zone">
              {isUpcoming && <span className="memory-upcoming">upcoming</span>}
              {a.photos.length > 0 ? (
                <PolaroidStack photos={a.photos} alt={`photos from ${a.place.name}`} />
              ) : (
                <span className="memory-noshots string-print">
                  <span className="mm-mono">{a.place.name[0]}</span>
                  <span className="mm-photo-cap">no shots yet, just vibes</span>
                </span>
              )}
            </div>
            <div className="memory-body">
              <Link href={`/hangouts/${a.plan_id}`} className="memory-title">{a.place.name}</Link>
              <div className={isUpcoming ? "upcoming" : "muted"}>
                {fmt(a.time)} · {isUpcoming ? `${a.attendees.length} going` : `${a.attendees.length} went`}
                {a.playlist.length > 0 ? ` · ${a.playlist.length} tracks` : ""}
                {a.group_id != null && crewName.get(a.group_id) && (
                  <> · w/ {crewName.get(a.group_id)}</>
                )}
              </div>
              <div className="vis-row">
                <form action={toggleVisibility}>
                  <input type="hidden" name="plan_id" value={a.plan_id} />
                  <input type="hidden" name="to" value={a.visibility === "public" ? "private" : "public"} />
                  <VisChip visibility={a.visibility === "public" ? "public" : "private"} />
                </form>
                <Link href={`/hangouts/${a.plan_id}`} className="memory-open">
                  open the keepsake →
                </Link>
              </div>
            </div>
          </div>
          );
        })}
      </div>
    </>
  );
}

export const dynamic = "force-dynamic";
