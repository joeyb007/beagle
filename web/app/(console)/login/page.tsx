// Stubbed sign-in: pick who you are. No auth — the demo's front door.
import { redirect } from "next/navigation";
import { listProfiles } from "@/lib/db";
import { setUser } from "@/lib/session";

async function signIn(formData: FormData) {
  "use server";
  await setUser(String(formData.get("handle")));
  redirect("/");
}

export default function Login() {
  const profiles = listProfiles();
  return (
    <div className="login-wrap">
      <h1>Who are you?</h1>
      <p className="sub">Pick your profile — Beagle takes it from there.</p>
      <div className="login-grid">
        {profiles.map((p) => (
          <form key={p.handle} action={signIn}>
            <input type="hidden" name="handle" value={p.handle} />
            <button className="login-card" type="submit">
              <span className="avatar lg">{p.name[0]}</span>
              <span className="login-name">{p.name}</span>
              <span className="login-label">{p.data.persona_label ?? p.handle}</span>
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}

export const dynamic = "force-dynamic";
