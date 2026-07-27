// T4: profile editor — the trust/safety surface. D writes these; humans correct them.
import { revalidatePath } from "next/cache";
import { listProfiles, updateProfile } from "@/lib/db";

async function save(formData: FormData) {
  "use server";
  const handle = String(formData.get("handle"));
  const csv = (k: string) =>
    String(formData.get(k) ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  updateProfile(handle, {
    name: String(formData.get("name")),
    constraint_score: Number(formData.get("constraint_score")),
    data: {
      cuisines: csv("cuisines"),
      vibe: csv("vibe"),
      hard_nos: csv("hard_nos"),
      typical_availability: String(formData.get("typical_availability") ?? "") || null,
      persona_label: String(formData.get("persona_label") ?? "") || null,
      notes: String(formData.get("notes") ?? "") || null,
    },
  });
  revalidatePath("/profiles");
}

export default function Profiles() {
  const profiles = listProfiles();
  return (
    <>
      <h1>Profiles</h1>
      <p className="sub">
        What Beagle believes about each person. It never invents — but it can be wrong. Fix it here.
      </p>
      {profiles.map((p) => (
        <form key={p.handle} action={save} className="card">
          <input type="hidden" name="handle" value={p.handle} />
          <strong style={{ fontFamily: "var(--serif)", fontSize: 18 }}>
            {p.name} <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: 13 }}>{p.handle}</span>
          </strong>
          <label className="field">Name</label>
          <input type="text" name="name" defaultValue={p.name} />
          <label className="field">Cuisines (comma-separated)</label>
          <input type="text" name="cuisines" defaultValue={(p.data.cuisines ?? []).join(", ")} />
          <label className="field">Vibe</label>
          <input type="text" name="vibe" defaultValue={(p.data.vibe ?? []).join(", ")} />
          <label className="field">Hard nos</label>
          <input type="text" name="hard_nos" defaultValue={(p.data.hard_nos ?? []).join(", ")} />
          <label className="field">Typical availability</label>
          <input type="text" name="typical_availability" defaultValue={p.data.typical_availability ?? ""} />
          <label className="field">Persona label</label>
          <input type="text" name="persona_label" defaultValue={p.data.persona_label ?? ""} />
          <label className="field">Notes</label>
          <input type="text" name="notes" defaultValue={p.data.notes ?? ""} />
          <label className="field">Constraint score (0–1, drives who Beagle asks first)</label>
          <input type="text" name="constraint_score" defaultValue={String(p.constraint_score)} />
          <button className="primary" type="submit">Save changes</button>
        </form>
      ))}
    </>
  );
}

export const dynamic = "force-dynamic";
