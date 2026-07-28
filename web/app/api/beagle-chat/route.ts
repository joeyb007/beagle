// Proxy to the agent process — the intelligence lives there, not in Next.
import { NextRequest, NextResponse } from "next/server";

const AGENT = process.env.AGENT_URL ?? "http://127.0.0.1:8100";

export async function POST(req: NextRequest) {
  const body = await req.json();
  try {
    const resp = await fetch(`${AGENT}/api/planner-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25000),
    });
    return NextResponse.json(await resp.json(), { status: resp.status });
  } catch {
    return NextResponse.json({
      reply: "beagle's brain is napping — start the agent (uvicorn src.main:app --port 8100) and ask again 🐶",
    });
  }
}
