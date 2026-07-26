// Stick (or clear) a post-it on one photo of a keepsake.
import { NextRequest, NextResponse } from "next/server";
import { setPhotoNote } from "@/lib/db";
import { currentUser } from "@/lib/session";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ planId: string }> }
) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  const { planId } = await params;
  const { src, note } = (await req.json()) as { src?: string; note?: string };
  if (!src) return NextResponse.json({ error: "src required" }, { status: 400 });
  setPhotoNote(planId, src, note ?? "");
  return NextResponse.json({ ok: true });
}
