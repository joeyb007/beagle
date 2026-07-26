// T5: the memory artifact — plan-turned-keepsake. The demo's peak.
import { notFound } from "next/navigation";
import { ArtifactStore } from "@/lib/artifact-store";
import { listProfiles } from "@/lib/db";
import { PhotoUpload } from "./photo-upload";

export default async function Hangout({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;
  const artifact = new ArtifactStore().get(planId);
  if (!artifact) notFound();

  const names = new Map(listProfiles().map((p) => [p.handle, p.name]));
  const attendees = artifact.attendees.map((h) => names.get(h) ?? h);
  const when = new Date(artifact.time);

  return (
    <div className="keepsake-bg">
      <div className="keepsake">
        <div className="date">
          {when.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }).toUpperCase()}
        </div>
        <h1>{artifact.isKeepsake ? "That time at " : "Next up: "}{artifact.place.name}</h1>

        <div className="ticket">
          <div className="head">
            <span className="place">{artifact.place.name}</span>
            <span className="admit">admit {artifact.attendees.length}</span>
          </div>
          <dl>
            <dt>When</dt>
            <dd>{when.toLocaleString(undefined, { weekday: "long", hour: "numeric", minute: "2-digit" })}</dd>
            {artifact.place.area && (<><dt>Where</dt><dd>{artifact.place.area}</dd></>)}
            <dt>Who</dt>
            <dd>{attendees.join(", ")}</dd>
            {artifact.place.note && (<><dt>Beagle says</dt><dd>{artifact.place.note}</dd></>)}
          </dl>
        </div>

        {artifact.playlist.length > 0 && (
          <>
            <h2>The blend — everyone’s taste, one tracklist</h2>
            <ol className="mixtape">
              {artifact.playlist.map((t, i) => (
                <li key={i}>
                  <span>
                    <span className="t">{t.title}</span>{" "}
                    <span className="a">— {t.artist}</span>
                  </span>
                </li>
              ))}
            </ol>
          </>
        )}

        <h2>{artifact.isKeepsake ? "How it went" : "After the hangout"}</h2>
        {artifact.photos.length > 0 && (
          <div className="prints">
            {artifact.photos.map((src) => (
              // eslint-disable-next-line @next/next/no-img-element
              <div key={src} className="print"><img src={src} alt="hangout photo" /></div>
            ))}
          </div>
        )}
        <PhotoUpload planId={planId} hasPhotos={artifact.isKeepsake} />
      </div>
    </div>
  );
}

export const dynamic = "force-dynamic";
