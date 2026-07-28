// A right-swipe becomes a real warm intro: proxy to the agent, which drafts
// and texts it immediately (demo-target rerouting applies agent-side).
import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/session";

const AGENT = process.env.AGENT_URL ?? "http://127.0.0.1:8100";

export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  const { match_handle } = (await req.json()) as { match_handle?: string };
  if (!match_handle) {
    return NextResponse.json({ error: "match_handle required" }, { status: 400 });
  }
  try {
    const resp = await fetch(`${AGENT}/api/intro`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle: user.handle, match_handle }),
      signal: AbortSignal.timeout(20000),
    });
    return NextResponse.json(await resp.json(), { status: resp.status });
  } catch {
    // agent down: the swipe is still persisted; the worker delivers on restart
    return NextResponse.json({ ok: false, message: null });
  }
}
