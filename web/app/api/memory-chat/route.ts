// Proxy to the agent process — the intelligence lives there, not in Next.
// The signed-in handle rides along so Beagle can mirror the asker's texting style.
import { NextRequest, NextResponse } from "next/server";

const AGENT = process.env.AGENT_URL ?? "http://127.0.0.1:8100";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const handle = req.cookies.get("beagle_user")?.value;
  if (handle && !body.handle) body.handle = decodeURIComponent(handle);
  try {
    const resp = await fetch(`${AGENT}/api/memory-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    return NextResponse.json(await resp.json(), { status: resp.status });
  } catch {
    return NextResponse.json({
      reply: "beagle's brain is napping — start the agent (uvicorn src.main:app) and ask again 🐶",
    });
  }
}
