"use server";
// Shared profile-save action — used by per-chat member editors (and /profiles).
import { revalidatePath } from "next/cache";
import { updateProfile } from "@/lib/db";

export async function saveProfile(formData: FormData) {
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
  revalidatePath("/chats");
  revalidatePath("/");
}
