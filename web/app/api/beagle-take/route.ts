// Proxy to the agent process — the intelligence lives there, not in Next.
import { NextRequest, NextResponse } from "next/server";

const AGENT = process.env.AGENT_URL ?? "http://127.0.0.1:8100";

export async function POST(req: NextRequest) {
  const body = await req.json();
  try {
    const resp = await fetch(`${AGENT}/api/beagle-take`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    return NextResponse.json(await resp.json(), { status: resp.status });
  } catch {
    return NextResponse.json({ take: null });
  }
}
