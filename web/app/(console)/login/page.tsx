// Sign-in: phone number + password. The password is decorative — no auth,
// demo only. The phone number IS the identity: profiles are primary-keyed by
// E.164 handle, so signing in with a new number provisions a fresh account —
// the social-network shape (users keyed by number) without any auth stack.
import { redirect } from "next/navigation";
import { ensureProfile } from "@/lib/db";
import { setUser } from "@/lib/session";

// "6475550132" / "(647) 555-0132" / "+1 647..." -> "+16475550132"
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (raw.trim().startsWith("+") && digits.length >= 8) return `+${digits}`;
  return null;
}

async function signIn(formData: FormData) {
  "use server";
  const handle = normalizePhone(String(formData.get("phone") ?? ""));
  if (!handle) redirect("/login?err=1");
  const name = String(formData.get("name") ?? "").trim();
  ensureProfile(handle, name || undefined);
  await setUser(handle);
  redirect("/home");
}

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ err?: string }>;
}) {
  const { err } = await searchParams;
  return (
    <div className="login-wrap">
      <h1>Sign in</h1>
      <p className="sub">Your number is your account — Beagle takes it from there.</p>
      <form action={signIn} className="card login-form">
        <label>
          Phone number
          <input type="tel" name="phone" required autoFocus placeholder="(647) 555-0132" />
        </label>
        <label>
          Password
          <input type="password" name="password" required placeholder="••••••••" />
        </label>
        <label>
          Name <span className="muted">(first sign-in only)</span>
          <input type="text" name="name" placeholder="what your friends call you" />
        </label>
        {err && <p className="login-err">that number doesn&apos;t look right — try again?</p>}
        <button className="primary" type="submit">Sign in</button>
      </form>
    </div>
  );
}

export const dynamic = "force-dynamic";
