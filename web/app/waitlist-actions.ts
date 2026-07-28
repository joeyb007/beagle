"use server";
// Server action for the landing waitlist — returns a status the client form
// renders (success modal / amber duplicate / red invalid) instead of redirecting.
import { addWaitlistPhone, hasWaitlistPhone, WaitlistResult } from "@/lib/waitlist";

export async function joinWaitlist(
  _prev: WaitlistResult | null,
  formData: FormData
): Promise<WaitlistResult> {
  return addWaitlistPhone(String(formData.get("phone") ?? ""));
}

export async function checkWaitlist(raw: string): Promise<boolean> {
  return hasWaitlistPhone(raw);
}
