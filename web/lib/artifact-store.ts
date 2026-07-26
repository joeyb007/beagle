// Web-side ArtifactStore (docs/branch-c.md). The agent's Python store writes
// the row at plan-lock; this class reads it and owns photos/keepsake state.
// Never imported by the agent — the table IS the seam.
import { db } from "./db";

export interface Place {
  name: string;
  area?: string | null;
  url?: string | null;
  note?: string | null;
}

export interface Track {
  title: string;
  artist: string;
  url?: string | null;
}

export interface HangoutArtifact {
  plan_id: string;
  place: Place;
  time: string;
  attendees: string[];
  playlist: Track[];
  photos: string[];
  created_at: string;
  isKeepsake: boolean;
}

interface Row {
  plan_id: string;
  place: string;
  time: string;
  attendees: string;
  playlist: string;
  photos: string;
  created_at: string;
}

function parse(row: Row): HangoutArtifact {
  const photos = JSON.parse(row.photos) as string[];
  return {
    plan_id: row.plan_id,
    place: JSON.parse(row.place),
    time: row.time,
    attendees: JSON.parse(row.attendees),
    playlist: JSON.parse(row.playlist),
    photos,
    created_at: row.created_at,
    isKeepsake: photos.length > 0,
  };
}

export class ArtifactStore {
  create(
    plan: { plan_id: string; place: Place; time: string; attendees: string[] },
    playlist: Track[]
  ): HangoutArtifact {
    db()
      .prepare(
        "INSERT INTO artifacts (plan_id, place, time, attendees, playlist) VALUES (?, ?, ?, ?, ?)"
      )
      .run(
        plan.plan_id,
        JSON.stringify(plan.place),
        plan.time,
        JSON.stringify(plan.attendees),
        JSON.stringify(playlist)
      );
    return this.get(plan.plan_id)!;
  }

  get(planId: string): HangoutArtifact | null {
    const row = db().prepare("SELECT * FROM artifacts WHERE plan_id = ?").get(planId) as
      | Row
      | undefined;
    return row ? parse(row) : null;
  }

  list(): HangoutArtifact[] {
    const rows = db()
      .prepare("SELECT * FROM artifacts ORDER BY created_at DESC, rowid DESC")
      .all() as Row[];
    return rows.map(parse);
  }

  addPhotos(planId: string, urls: string[]): void {
    const existing = this.get(planId);
    if (!existing) throw new Error(`no artifact ${planId}`);
    db()
      .prepare("UPDATE artifacts SET photos = ? WHERE plan_id = ?")
      .run(JSON.stringify([...existing.photos, ...urls]), planId);
  }
}
