"use client";
// Signed-out visitors see the console only through frosted glass: content is
// blurred + inert behind a sign-in modal. Server pages that already redirect
// (home) never get here; this catches the browsable ones (chats, memories…).
import Link from "next/link";
import { usePathname } from "next/navigation";

export function AuthGate({
  signedIn,
  children,
}: {
  signedIn: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  if (signedIn || pathname.startsWith("/login")) return <>{children}</>;
  return (
    <div className="auth-wrap">
      <div className="auth-blur ghost-page" aria-hidden inert>
        <div className="ghost-line w40" />
        <div className="ghost-line w70" />
        <div className="ghost-row">
          <div className="card ghost-card" />
          <div className="card ghost-card" />
          <div className="card ghost-card" />
        </div>
        <div className="ghost-row">
          <div className="card ghost-card tall" />
          <div className="card ghost-card tall" />
        </div>
      </div>
      <div className="auth-overlay" role="dialog" aria-modal="true" aria-label="Sign in required">
        <div className="card auth-modal">
          <h2>Sign in</h2>
          <p className="muted">This is your crew&apos;s world — Beagle only shows it to people in it.</p>
          <Link className="button auth-cta" href="/login">Sign in with your number</Link>
        </div>
      </div>
    </div>
  );
}
