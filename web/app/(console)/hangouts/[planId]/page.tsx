// T5: the memory artifact — plan-turned-keepsake. The demo's peak.
import Link from "next/link";
import { notFound } from "next/navigation";
import { MemoryChat } from "@/app/memory-chat";
import { ArtifactStore } from "@/lib/artifact-store";
import { getPhotoNotes, listProfiles } from "@/lib/db";
import { PhotoUpload } from "./photo-upload";
import { Prints } from "./prints";

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
        <Link href="/hangouts" className="keepsake-back">← memories</Link>
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
            <h2 className="blend-head">
              <svg className="spotify-mark" viewBox="0 0 24 24" width="18" height="18" aria-label="Spotify">
                <path
                  fill="#1DB954"
                  d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.299.421-1.02.599-1.56.3z"
                />
              </svg>
              The blend: everyone’s taste, one tracklist
            </h2>
            <ol className="mixtape">
              {artifact.playlist.map((t, i) => (
                <li key={i}>
                  <span>
                    <span className="t">{t.title}</span>{" "}
                    <span className="a">· {t.artist}</span>
                  </span>
                </li>
              ))}
            </ol>
          </>
        )}

        {artifact.note && (
          <>
            <h2>Beagle remembers</h2>
            <p className="memory-note big">“{artifact.note}”</p>
          </>
        )}

        <h2>{artifact.isKeepsake ? "How it went" : "After the hangout"}</h2>
        {artifact.photos.length > 0 && (
          <Prints planId={planId} photos={artifact.photos} notes={getPhotoNotes(planId)} />
        )}
        <PhotoUpload planId={planId} hasPhotos={artifact.isKeepsake} />

        <h2>Ask beagle about it</h2>
        <MemoryChat planId={planId} />
      </div>
    </div>
  );
}

export const dynamic = "force-dynamic";
