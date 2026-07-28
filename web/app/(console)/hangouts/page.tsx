// Memories: every hangout artifact — keepsake gallery in the product's own
// photo language: flip-through polaroid stacks on paper, crew origin, and
// visibility as a single toggle chip.
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { PolaroidStack } from "@/components/polaroid-stack";
import { ArtifactStore } from "@/lib/artifact-store";
import { listGroupsWithHangouts, setArtifactVisibility } from "@/lib/db";

const ICON = {
  width: 11, height: 11, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 2.4, strokeLinecap: "round", strokeLinejoin: "round",
} as const;

function Lock() {
  return (
    <svg {...ICON} aria-hidden>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function Unlock() {
  return (
    <svg {...ICON} aria-hidden>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 7.8-1.3" />
    </svg>
  );
}

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
        {artifacts.map((a) => (
          <div key={a.plan_id} className="memory-card">
            <div className="memory-cover-zone">
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
              <div className="muted">
                {fmt(a.time)} · {a.attendees.length} went
                {a.playlist.length > 0 ? ` · ${a.playlist.length} tracks` : ""}
                {a.group_id != null && crewName.get(a.group_id) && (
                  <> · w/ {crewName.get(a.group_id)}</>
                )}
              </div>
              {a.note && <div className="memory-note">“{a.note}”</div>}
              <div className="vis-row">
                <form action={toggleVisibility}>
                  <input type="hidden" name="plan_id" value={a.plan_id} />
                  <input type="hidden" name="to" value={a.visibility === "public" ? "private" : "public"} />
                  <button
                    type="submit"
                    className={`chip vis-chip ${a.visibility === "public" ? "chip-public" : "chip-private"}`}
                    title={`make ${a.visibility === "public" ? "private" : "public"}`}
                  >
                    {a.visibility === "public" ? <Unlock /> : <Lock />}
                    <span className="vis-now">{a.visibility}</span>
                    <span className="vis-swap">
                      make {a.visibility === "public" ? "private" : "public"}
                    </span>
                  </button>
                </form>
                <Link href={`/hangouts/${a.plan_id}`} className="memory-open">
                  open the keepsake →
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export const dynamic = "force-dynamic";
