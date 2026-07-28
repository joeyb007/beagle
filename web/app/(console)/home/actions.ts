"use server";
// Self-serve profile edits from the home You-card. Only the signed-in user's
// own row — the future model (edit yourself, not your friends) starts here.
import { revalidatePath } from "next/cache";
import { updateProfile } from "@/lib/db";
import { currentUser } from "@/lib/session";

const list = (v: FormDataEntryValue | null) =>
  String(v ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

export async function updateSelf(formData: FormData): Promise<void> {
  const user = await currentUser();
  if (!user) return;
  updateProfile(user.handle, {
    name: String(formData.get("name") ?? user.name).trim() || user.name,
    data: {
      typical_availability: String(formData.get("availability") ?? "").trim() || null,
      cuisines: list(formData.get("cuisines")),
      hard_nos: list(formData.get("hard_nos")),
    },
  });
  revalidatePath("/home");
}
