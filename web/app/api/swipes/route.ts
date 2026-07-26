// Swipe decisions: persist pass/intro so the agent can text intros later.
import { NextRequest, NextResponse } from "next/server";
import { recordSwipe } from "@/lib/db";
import { currentUser } from "@/lib/session";

export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  const { match_handle, decision } = (await req.json()) as {
    match_handle?: string;
    decision?: "intro" | "pass";
  };
  if (!match_handle || !decision || !["intro", "pass"].includes(decision)) {
    return NextResponse.json({ error: "match_handle and decision required" }, { status: 400 });
  }
  recordSwipe(user.handle, match_handle, decision);
  return NextResponse.json({ ok: true });
}
