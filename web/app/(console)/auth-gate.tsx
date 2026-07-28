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
      <div className="auth-blur" aria-hidden inert>
        {children}
      </div>
      <div className="auth-overlay" role="dialog" aria-modal="true" aria-label="Sign in required">
        <div className="card auth-modal">
          <h2>Sign in</h2>
          <p className="muted">This is your crew&apos;s world — Beagle only shows it to people in it.</p>
          <Link className="primary auth-cta" href="/login">Sign in with your number</Link>
        </div>
      </div>
    </div>
  );
}
