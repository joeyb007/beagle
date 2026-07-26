// Serendipity spark: queue a "remember this day" nudge for the agent to send.
import { NextRequest, NextResponse } from "next/server";
import { createSpark } from "@/lib/db";
import { currentUser } from "@/lib/session";

export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  const { plan_id } = (await req.json()) as { plan_id?: string };
  if (!plan_id) return NextResponse.json({ error: "plan_id required" }, { status: 400 });
  createSpark(plan_id, user.handle);
  return NextResponse.json({ ok: true });
}
