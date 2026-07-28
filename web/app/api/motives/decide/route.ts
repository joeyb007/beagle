// Host decides on a join ask. The DB write happens here (ownership-guarded),
// so approvals work even with the agent down; Beagle's "you're in" text to
// the asker is best-effort via the agent.
import { NextRequest, NextResponse } from "next/server";
import { decideJoin } from "@/lib/db";
import { currentUser } from "@/lib/session";

const AGENT = process.env.AGENT_URL ?? "http://127.0.0.1:8100";

export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  const { motive_id, asker, decision } = (await req.json()) as {
    motive_id?: number;
    asker?: string;
    decision?: "in" | "declined";
  };
  if (!motive_id || !asker || !decision || !["in", "declined"].includes(decision)) {
    return NextResponse.json({ error: "motive_id, asker, decision required" }, { status: 400 });
  }
  const changed = decideJoin(user.handle, motive_id, asker, decision);
  if (changed) {
    void fetch(`${AGENT}/api/motives/decided`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ motive_id, asker, decision, host: user.handle }),
      signal: AbortSignal.timeout(15000),
    }).catch(() => {});
  }
  return NextResponse.json({ ok: changed });
}
