// T3: OAuth start — redirect to the provider's consent page.
// Verifiable live once SPOTIFY_/GOOGLE_ client IDs land in .env (human errand).
import { NextRequest, NextResponse } from "next/server";

const CONFIGS = {
  spotify: {
    authUrl: "https://accounts.spotify.com/authorize",
    idEnv: "SPOTIFY_CLIENT_ID",
    scope: "user-top-read",
  },
  google: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    idEnv: "GOOGLE_CLIENT_ID",
    scope: "https://www.googleapis.com/auth/calendar.readonly",
  },
} as const;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const config = CONFIGS[provider as keyof typeof CONFIGS];
  if (!config) return NextResponse.json({ error: "unknown provider" }, { status: 404 });

  const clientId = process.env[config.idEnv];
  if (!clientId) {
    return NextResponse.json(
      { error: `${config.idEnv} not set — add it to .env to enable this connect flow` },
      { status: 503 }
    );
  }

  const handle = req.nextUrl.searchParams.get("handle") ?? "";
  const redirectUri = `${req.nextUrl.origin}/api/oauth/${provider}/callback`;
  const url = new URL(config.authUrl);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", config.scope);
  url.searchParams.set("state", handle); // who is connecting
  if (provider === "google") url.searchParams.set("access_type", "offline");
  return NextResponse.redirect(url);
}
