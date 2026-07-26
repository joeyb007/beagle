// Stubbed auth: a cookie naming the active profile. No real security — demo only.
import { cookies } from "next/headers";
import { getProfile, ProfileRow } from "./db";

const COOKIE = "beagle_user";

export async function currentUser(): Promise<ProfileRow | null> {
  const jar = await cookies();
  const handle = jar.get(COOKIE)?.value;
  return handle ? getProfile(handle) : null;
}

export async function setUser(handle: string): Promise<void> {
  (await cookies()).set(COOKIE, handle, { path: "/" });
}

export async function clearUser(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
