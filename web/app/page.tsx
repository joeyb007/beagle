// T2 onboarding: paste chat history → imports (D distills it), connect accounts.
import { revalidatePath } from "next/cache";
import { addImport, db, listProfiles } from "@/lib/db";

async function submitImport(formData: FormData) {
  "use server";
  const text = String(formData.get("chat") ?? "").trim();
  if (text) addImport(text);
  revalidatePath("/");
}

function connectedProviders(): Set<string> {
  const rows = db().prepare("SELECT DISTINCT provider FROM oauth_tokens").all() as {
    provider: string;
  }[];
  return new Set(rows.map((r) => r.provider));
}

export default function Onboarding() {
  const profiles = listProfiles();
  const connected = connectedProviders();
  const pending = (
    db().prepare("SELECT COUNT(*) AS n FROM imports WHERE status='pending'").get() as { n: number }
  ).n;

  return (
    <>
      <h1>Get Beagle to know your group</h1>
      <p className="sub">
        Paste your group chat and Beagle learns who everyone really is — then it plans your
        hangouts in iMessage.
      </p>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>1. Chat history</h2>
        <form action={submitImport}>
          <label className="field" htmlFor="chat">
            Paste messages (or an imessage-exporter dump)
          </label>
          <textarea id="chat" name="chat" placeholder={"maya: tacos friday?\nrayhan: can't, gym"} />
          <button className="primary" type="submit">Add to imports</button>
          {pending > 0 && (
            <p className="ok">{pending} import{pending === 1 ? "" : "s"} waiting for distillation.</p>
          )}
        </form>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>2. Connect accounts</h2>
        <label className="field" htmlFor="who">Connecting as</label>
        <select id="who" name="who" defaultValue={profiles[0]?.handle} form="none">
          {profiles.map((p) => (
            <option key={p.handle} value={p.handle}>
              {p.name} ({p.handle})
            </option>
          ))}
        </select>
        <p style={{ marginBottom: 0 }}>
          <a className="button" href={`/api/oauth/spotify/start?handle=${profiles[0]?.handle ?? ""}`}>
            {connected.has("spotify") ? "Spotify connected ✓" : "Connect Spotify"}
          </a>{" "}
          <a className="button ghost" href={`/api/oauth/google/start?handle=${profiles[0]?.handle ?? ""}`}>
            {connected.has("google") ? "Google Calendar connected ✓" : "Connect Google Calendar"}
          </a>
        </p>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>3. Review profiles</h2>
        <p style={{ margin: 0 }}>
          Beagle only knows what it can support with evidence — check what it learned on the{" "}
          <a href="/profiles">profiles page</a> and fix anything it got wrong.
        </p>
      </div>
    </>
  );
}

export const dynamic = "force-dynamic";
