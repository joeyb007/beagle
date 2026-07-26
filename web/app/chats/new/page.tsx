// New group chat wizard — absorbs the old onboarding flow.
import { redirect } from "next/navigation";
import { addImport, createGroup, db, listProfiles } from "@/lib/db";

async function create(formData: FormData) {
  "use server";
  const name = String(formData.get("name") || "the group");
  const members = String(formData.get("members") || "")
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const history = String(formData.get("history") || "").trim();
  const id = createGroup(name, members);
  if (history) addImport(history);
  redirect(`/chats/${id}`);
}

export default function NewChat() {
  const connected = new Set(
    (db().prepare("SELECT DISTINCT provider FROM oauth_tokens").all() as { provider: string }[]).map(
      (r) => r.provider
    )
  );
  const first = listProfiles()[0];

  return (
    <>
      <p className="eyebrow">new group</p>
      <h1>Bring Beagle into a chat</h1>
      <p className="sub">Three steps — then just add Beagle&apos;s number to the group and say hi.</p>

      <form action={create}>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>1. Who&apos;s in it</h2>
          <label className="field" htmlFor="name">Group name</label>
          <input id="name" type="text" name="name" placeholder="the usual suspects" />
          <label className="field" htmlFor="members">Phone numbers (one per line, E.164)</label>
          <textarea id="members" name="members" placeholder={"+16475550132\n+15551234567"} />
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>2. Teach Beagle the group</h2>
          <label className="field" htmlFor="history">Paste chat history (or an imessage-exporter dump)</label>
          <textarea id="history" name="history" placeholder={"maya: tacos friday?\nrayhan: can't, gym"} />
          <p className="muted">Beagle distills who everyone is — only what the messages support, never invented.</p>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>3. Connect accounts (optional)</h2>
          <p style={{ marginBottom: 0 }}>
            <a className="button ghost" href={`/api/oauth/spotify/start?handle=${first?.handle ?? ""}`}>
              {connected.has("spotify") ? "Spotify connected ✓" : "Connect Spotify"}
            </a>{" "}
            <a className="button ghost" href={`/api/oauth/google/start?handle=${first?.handle ?? ""}`}>
              {connected.has("google") ? "Google Calendar connected ✓" : "Connect Google Calendar"}
            </a>
          </p>
        </div>

        <button className="primary" type="submit">Create group</button>
      </form>
    </>
  );
}

export const dynamic = "force-dynamic";
