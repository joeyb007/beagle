// Waitlist-only mode: with WAITLIST_ONLY=1 the deployment serves ONLY the
// public landing page and the waitlist signup — every console route, login,
// and agent-backed API redirects home. This is the launch posture: the demo
// video points here, people join the waitlist, the app itself stays private.
import { NextRequest, NextResponse } from "next/server";

const OPEN_PREFIXES = [
  "/_next", // framework assets
  "/api/waitlist", // the one live endpoint
  "/dog", // pixel beagle sprites on the landing page
  "/uploads", // photo prints (landing photo string)
  "/favicon",
];

export function middleware(req: NextRequest) {
  if (process.env.WAITLIST_ONLY !== "1") return NextResponse.next();
  const { pathname } = req.nextUrl;
  if (pathname === "/" || OPEN_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }
  return NextResponse.redirect(new URL("/", req.url));
}

export const config = {
  // run on everything; the function itself decides (env flag makes it a no-op
  // in normal full-app deployments)
  matcher: "/((?!_next/static|_next/image).*)",
};
