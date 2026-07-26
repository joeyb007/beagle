// T3: OAuth callback — exchange code for tokens, write oauth_tokens (D reads them).
import { NextRequest, NextResponse } from "next/server";
import { upsertToken } from "@/lib/db";

const CONFIGS = {
  spotify: {
    tokenUrl: "https://accounts.spotify.com/api/token",
    idEnv: "SPOTIFY_CLIENT_ID",
    secretEnv: "SPOTIFY_CLIENT_SECRET",
  },
  google: {
    tokenUrl: "https://oauth2.googleapis.com/token",
    idEnv: "GOOGLE_CLIENT_ID",
    secretEnv: "GOOGLE_CLIENT_SECRET",
  },
} as const;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const config = CONFIGS[provider as keyof typeof CONFIGS];
  if (!config) return NextResponse.json({ error: "unknown provider" }, { status: 404 });

  const code = req.nextUrl.searchParams.get("code");
  const handle = req.nextUrl.searchParams.get("state") ?? "";
  if (!code || !handle) {
    return NextResponse.json({ error: "missing code or state" }, { status: 400 });
  }

  const resp = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${req.nextUrl.origin}/api/oauth/${provider}/callback`,
      client_id: process.env[config.idEnv] ?? "",
      client_secret: process.env[config.secretEnv] ?? "",
    }),
  });
  if (!resp.ok) {
    return NextResponse.json({ error: `token exchange failed: ${await resp.text()}` }, { status: 502 });
  }
  const token = (await resp.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };

  upsertToken(handle, provider as "spotify" | "google", {
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expires_at: token.expires_in
      ? new Date(Date.now() + token.expires_in * 1000).toISOString()
      : undefined,
  });
  return NextResponse.redirect(new URL("/?connected=" + provider, req.nextUrl.origin));
}
