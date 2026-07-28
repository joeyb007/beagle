// Motives proxy: list (GET, ?radius=), float one or ask to join (POST).
// Handle always comes from the session cookie, never the client body.
import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/session";

const AGENT = process.env.AGENT_URL ?? "http://127.0.0.1:8100";

export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  const radius = req.nextUrl.searchParams.get("radius");
  try {
    const resp = await fetch(`${AGENT}/api/motives/list`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        handle: user.handle,
        radius_km: radius ? Number(radius) : null,
      }),
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    return NextResponse.json(await resp.json(), { status: resp.status });
  } catch {
    return NextResponse.json({ motives: null }); // agent napping
  }
}

export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  const body = (await req.json()) as {
    action?: "create" | "join";
    motive_id?: number;
    text?: string;
    time_window?: string;
    spots?: number;
  };
  const path = body.action === "join" ? "join" : "create";
  try {
    const resp = await fetch(`${AGENT}/api/motives/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        body.action === "join"
          ? { handle: user.handle, motive_id: body.motive_id }
          : {
              handle: user.handle,
              text: body.text,
              time_window: body.time_window ?? "tonight",
              spots: body.spots ?? 2,
            }
      ),
      signal: AbortSignal.timeout(20000),
    });
    return NextResponse.json(await resp.json(), { status: resp.status });
  } catch {
    return NextResponse.json({ ok: false }, { status: 502 });
  }
}
