// T5: receive photo uploads → public/uploads, append URLs to the artifact row.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { ArtifactStore } from "@/lib/artifact-store";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ planId: string }> }
) {
  const { planId } = await params;
  const store = new ArtifactStore();
  if (!store.get(planId)) return NextResponse.json({ error: "no such hangout" }, { status: 404 });

  const files = (await req.formData()).getAll("photos") as File[];
  if (!files.length) return NextResponse.json({ error: "no photos in request" }, { status: 400 });

  const dir = join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });
  const urls: string[] = [];
  for (const file of files) {
    const safe = `${planId}-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    await writeFile(join(dir, safe), Buffer.from(await file.arrayBuffer()));
    urls.push(`/uploads/${safe}`);
  }
  store.addPhotos(planId, urls);
  return NextResponse.json({ added: urls });
}
