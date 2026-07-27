// T4: profile editor — the trust/safety surface. D writes these; humans correct them.
import { revalidatePath } from "next/cache";
import { listProfiles, updateProfile } from "@/lib/db";
import { ProfileCard } from "./profile-card";

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
        <ProfileCard key={p.handle} profile={p} action={save} />
      ))}
    </>
  );
}

export const dynamic = "force-dynamic";
