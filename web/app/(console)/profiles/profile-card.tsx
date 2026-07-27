"use client";
// Read view by default; Edit flips to the form. Same server action underneath.
import { useState } from "react";
import type { ProfileRow } from "@/lib/db";
import { Chip } from "@/components/chip";
import { Meter } from "@/components/meter";

export function ProfileCard({
  profile,
  action,
}: {
  profile: ProfileRow;
  action: (fd: FormData) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const d = profile.data;

  return (
    <div className="card profile">
      <div className="profile-head">
        <strong className="pname">
          {profile.name} <span className="phandle">{profile.handle}</span>
        </strong>
        <button type="button" className="editlink" onClick={() => setEditing(!editing)}>
          {editing ? "Cancel" : "Edit"}
        </button>
      </div>

      {!editing ? (
        <div className="profile-read">
          <div className="chips">
            {(d.cuisines ?? []).map((c) => <Chip key={c}>{c}</Chip>)}
            {(d.vibe ?? []).map((v) => <Chip key={v} tone="muted">{v}</Chip>)}
            {(d.hard_nos ?? []).map((n) => <Chip key={n} tone="copper">no {n}</Chip>)}
          </div>
          <dl className="facts">
            {d.typical_availability && (<><dt>Usually free</dt><dd>{d.typical_availability}</dd></>)}
            {d.persona_label && (<><dt>Persona</dt><dd>{d.persona_label}</dd></>)}
            {d.notes && (<><dt>Notes</dt><dd>{d.notes}</dd></>)}
            <dt>Asks first</dt>
            <dd>
              <Meter value={profile.constraint_score} label={`constraint score ${profile.constraint_score}`} />{" "}
              <span className="num">{profile.constraint_score.toFixed(2)}</span>
            </dd>
          </dl>
        </div>
      ) : (
        <form action={action} onSubmit={() => setEditing(false)}>
          <input type="hidden" name="handle" value={profile.handle} />
          <label className="field">Name</label>
          <input type="text" name="name" defaultValue={profile.name} />
          <label className="field">Cuisines (comma-separated)</label>
          <input type="text" name="cuisines" defaultValue={(d.cuisines ?? []).join(", ")} />
          <label className="field">Vibe</label>
          <input type="text" name="vibe" defaultValue={(d.vibe ?? []).join(", ")} />
          <label className="field">Hard nos</label>
          <input type="text" name="hard_nos" defaultValue={(d.hard_nos ?? []).join(", ")} />
          <label className="field">Typical availability</label>
          <input type="text" name="typical_availability" defaultValue={d.typical_availability ?? ""} />
          <label className="field">Persona label</label>
          <input type="text" name="persona_label" defaultValue={d.persona_label ?? ""} />
          <label className="field">Notes</label>
          <input type="text" name="notes" defaultValue={d.notes ?? ""} />
          <label className="field">Constraint score (0–1, drives who Beagle asks first)</label>
          <input type="text" name="constraint_score" defaultValue={String(profile.constraint_score)} />
          <button className="primary" type="submit">Save changes</button>
        </form>
      )}
    </div>
  );
}
