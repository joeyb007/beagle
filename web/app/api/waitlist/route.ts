// Operator peek: how many unique numbers are waiting. GET /api/waitlist
import { NextResponse } from "next/server";
import { waitlistCount } from "@/lib/waitlist";

export async function GET() {
  return NextResponse.json({ count: await waitlistCount() });
}

export const dynamic = "force-dynamic";
