"use server";
// Sign-in actions. Password stays decorative — the number is the identity.
import { redirect } from "next/navigation";
import { ensureProfile, getProfile } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";
import { setUser } from "@/lib/session";

/** Blur-time lookup: known number -> its name (greeting, no Name field);
 * unknown -> null (first sign-in, slide the Name field in). */
export async function profileNameFor(raw: string): Promise<string | null> {
  const handle = normalizePhone(raw);
  if (!handle) return null;
  const p = getProfile(handle);
  return p ? p.name : null;
}

export async function signIn(
  _prev: "invalid" | null,
  formData: FormData
): Promise<"invalid"> {
  const handle = normalizePhone(String(formData.get("phone") ?? ""));
  if (!handle) return "invalid";
  const name = String(formData.get("name") ?? "").trim();
  ensureProfile(handle, name || undefined);
  await setUser(handle);
  redirect("/home");
}
