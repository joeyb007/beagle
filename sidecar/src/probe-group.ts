// Probe: does Photon's server actually enforce shared-mode group limits, or
// only spectrum's client guard? Speaks raw advanced-imessage gRPC with our
// project's cloud-issued shared token. Run: npx tsx src/probe-group.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

// load repo-root .env
for (const line of readFileSync(join(import.meta.dirname, "..", "..", ".env"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}

const CREW = ["+16475550132", "+19295550252", "+13475550788", "+19145550081"];

async function main() {
  const { cloud } = await import("spectrum-ts");
  const tokens: any = await (cloud as any).issueImessageTokens(
    process.env.SPECTRUM_PROJECT_ID,
    process.env.SPECTRUM_PROJECT_SECRET
  );
  console.log("[probe] token type:", tokens.type);

  const { createGrpcClient } = await import("@photon-ai/advanced-imessage/grpc");
  const client: any = createGrpcClient({
    address: process.env.SPECTRUM_IMESSAGE_ADDRESS ?? "imessage.spectrum.photon.codes:443",
    tls: true,
    retry: true,
    autoIdempotency: true,
    token: tokens.token,
  } as any);

  // read-op sanity: does the token work at this layer at all?
  try {
    console.log("[probe] chats.count:", await client.chats.count());
  } catch (e: any) {
    console.log("[probe] chats.count failed:", e?.message ?? e);
  }

  // THE test: group creation with an opening message
  try {
    const res = await client.chats.create(CREW, { message: "🐶 beagle here — testing the den" });
    console.log("[probe] GROUP CREATED:", JSON.stringify({
      guid: res.chat?.guid,
      participants: res.chat?.participants?.length,
      service: res.chat?.service,
    }));
  } catch (e: any) {
    console.log("[probe] chats.create failed:", e?.message ?? e);
  }
  process.exit(0);
}

main();
